/** Section-picker changes are worksheet definitions, applied together as one undo step. */
import { compareOrderKeys, parseLatex } from '../engine/light';
import { calcKey } from './engineBridge';
import { addShapes, newShapeId, transaction, updateShapes, useCanvasStore, type ShapePatch } from './model/canvasStore';
import { insertionPoint, revealShape } from './canvasActions';
import { constrained, printableAt } from './pageConstraint';
import { planBlockInsertion } from './layout';
import { useAppStore } from '../store/appStore';
import { DEFAULT_MATH_PROPS, DEFAULT_TEXT_PROPS } from './model/types';
import type { MathShape, Shape } from './model/types';
import { SECTION_DEF, propertyKeys, sectionById, sectionUnits } from '../engineering/steel/sections';
import { customPropertyDefinition, dimensionKeys, libraryPropertyDefinition, sectionCurveDefinitions, sectionDimensionError, sectionSymbols, type SectionDimensions } from '../engineering/steel/customSection';
import type { Expr } from '../engine/ExpressionTypes';
import { arraySymbol, sectionAlias, sectionArrayDefinition, sectionArrayInfo, type SectionChoice } from '../engineering/steel/sectionArray';

export function nextSteelArrayName(): string {
  const names = new Set(Object.values(useCanvasStore.getState().shapes).flatMap(s => s.type === 'math' ? [definitionName(s.props.latex)] : []));
  for (let i = 1; ; i++) {
    const name = `S${i}`;
    if (!names.has(nameOf(arraySymbol(name))) && propertyKeys.every(key => !names.has(nameOf(sectionAlias(key, name))))) return name;
  }
}

/** Insert a ready-to-use selector and its worksheet equations, including custom I/H support. */
export function insertSteelSection(choice: SectionChoice = 1211, name = nextSteelArrayName()): string {
  const latex = sectionArrayDefinition(name, choice);
  const names = new Set(Object.values(useCanvasStore.getState().shapes).flatMap(s => s.type === 'math' ? [definitionName(s.props.latex)] : []));
  if (names.has(nameOf(arraySymbol(name))) || propertyKeys.some(key => names.has(nameOf(sectionAlias(key, name))))) throw new Error('This array name or its property references already exist. Choose another name.');
  const at = insertionPoint();
  const id = newShapeId();
  const math = (shapeId: string, x: number, y: number, latex: string, unit = ''): MathShape => ({
    id: shapeId, type: 'math', x, y,
    props: { ...DEFAULT_MATH_PROPS, w: 250, baseline: 20, fontSize: 16, latex, displayMode: 'result', displayUnit: unit },
  });
  const block: Shape[] = [math(id, at.x, at.y, latex)];
  propertyKeys.forEach((key, i) => {
    const unit = sectionUnits[key].replace(/^mm\^/, 'cm^');
    const ref = math(newShapeId(), at.x + (i % 2) * 280, at.y + 80 + Math.floor(i / 2) * 40,
      `${sectionAlias(key, name)}\\coloneq\\mathrm{at}\\left(${arraySymbol(name)},${i}\\right)`, unit);
    ref.props.fontSize = 14;
    ref.props.displayMode = 'formulaResult';
    block.push(ref);
  });
  for (const [offset, html] of [
    [40, `${name}: 19 properties with units. References use at(${name}, index), starting at 0.`],
    [500, 'It/Iw may be approximate. Custom: SCI P385 B.2.2/B.3.1; confirm project section tables.'],
  ] as const) block.push({ id: newShapeId(), type: 'text', x: at.x, y: at.y + offset, props: { ...DEFAULT_TEXT_PROPS, w: 550, fontSize: 12, html } });
  const plan = planBlockInsertion(useCanvasStore.getState().shapes, block, constrained() ? printableAt(at) : null);
  transaction(() => {
    addShapes(plan.shapes, { select: true });
    updateShapes(plan.patches);
    if (plan.pagesNeeded) useAppStore.getState().updateSettings({ pages: Math.max(useAppStore.getState().settings.pages ?? 1, plan.pagesNeeded) });
    useCanvasStore.setState({ editingId: null, tool: 'select', crosshair: null });
  });
  revealShape(id);
  return id;
}

function definitionName(latex: string): string | null {
  try { const s = parseLatex(latex); return s.kind === 'definition' ? s.name : null; } catch { return null; }
}
const nameOf = (symbol: string) => definitionName(`${symbol}\\coloneq0`)!;

function sectionPropertyRegions(shapes: Record<string, Shape>, id: string): Map<string, MathShape> {
  const ordered = Object.values(shapes).map(shape => ({ shape, key: calcKey(shape, shapes) })).sort((a, b) => compareOrderKeys(a.key, b.key)).map(x => x.shape);
  const start = ordered.findIndex(s => s.id === id);
  const result = new Map<string, MathShape>();
  if (start < 0) return result;
  for (const s of ordered.slice(start + 1)) {
    if (s.type !== 'math') continue;
    const name = definitionName(s.props.latex);
    if (name === 'Section') break;
    if (name && !result.has(name)) result.set(name, s);
  }
  return result;
}

/** Recover the four literal inputs from the saved conditional definitions, without evaluating text. */
export function savedCustomDimensions(shapes: Record<string, Shape>, id: string): SectionDimensions | null {
  const source = shapes[id];
  const array = source?.type === 'math' ? sectionArrayInfo(source.props.latex) : null;
  if (array) return typeof array.choice === 'number' ? null : array.choice;
  const regions = sectionPropertyRegions(shapes, id);
  const dimensions: Partial<SectionDimensions> = {};
  for (const key of dimensionKeys) {
    const shape = regions.get(nameOf(sectionSymbols[key]));
    if (!shape) return null;
    try {
      const s = parseLatex(shape.props.latex);
      if (s.kind !== 'definition' || s.expr.type !== 'if') return null;
      const c = s.expr.cond;
      if ('logic' in c || c.op !== '==' || c.left.type !== 'ident' || c.left.name !== 'Section' || c.right.type !== 'num' || c.right.value !== 0) return null;
      const value = literalMillimetres(s.expr.then);
      if (value === null) return null;
      dimensions[key] = value;
    } catch { return null; }
  }
  return dimensions as SectionDimensions;
}

function literalMillimetres(e: Expr): number | null {
  if (e.type === 'group') return literalMillimetres(e.body);
  if (e.type !== 'binary' || e.op !== '*' || e.left.type !== 'num' || e.right.type !== 'ident') return null;
  const factor = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 }[e.right.name];
  return factor === undefined ? null : e.left.value * factor;
}

export function planSteelSection(shapes: Record<string, Shape>, id: string, choice: number | SectionDimensions): Record<string, ShapePatch> {
  const source = shapes[id];
  const array = source?.type === 'math' ? sectionArrayInfo(source.props.latex) : null;
  if (array) return { [id]: { props: { latex: sectionArrayDefinition(array.name, choice) } } };
  if (source?.type !== 'math' || definitionName(source.props.latex) !== 'Section') throw new Error('The section input no longer exists.');
  const custom = typeof choice !== 'number';
  if (custom) {
    const error = sectionDimensionError(choice);
    if (error) throw new Error(error);
  } else sectionById(choice);
  const regions = sectionPropertyRegions(shapes, id);
  const required = [...propertyKeys.slice(0, 16).map(k => sectionSymbols[k]), ...sectionCurveDefinitions.map(c => c.symbol)];
  if (custom && required.some(symbol => !regions.has(nameOf(symbol)))) throw new Error('Custom I/H requires the section-property and buckling equations from the steel beam-column worksheet.');
  const patches: Record<string, ShapePatch> = { [id]: { props: { latex: SECTION_DEF + (custom ? 0 : choice) } } };
  for (const key of propertyKeys) {
    const shape = regions.get(nameOf(sectionSymbols[key]));
    if (shape) patches[shape.id] = { props: { latex: custom ? customPropertyDefinition(key, choice) : libraryPropertyDefinition(key), displayMode: 'result' } };
  }
  for (const curve of sectionCurveDefinitions) {
    const shape = regions.get(nameOf(curve.symbol));
    if (shape) patches[shape.id] = { props: { latex: curve.latex } };
  }
  // Older worksheets may still describe the whole check as rolled-only.
  const notes = [
    ['Section ID: library, or 0 for custom welded I/H (Browse)', 'Steel section (Browse)'],
    ['Library: Section ID. Custom: h, b, tf, tw from Browse; equations are stored in the worksheet.', 'Browse: choose a section by name, or enter custom h, b, tf, tw; properties update automatically.'],
    ['STEEL BEAM-COLUMN CHECK – ROLLED I/H SECTION (EC3)', 'STEEL BEAM-COLUMN CHECK – I/H SECTION (EC3)'],
    ['Doubly symmetric rolled I/H section', 'Doubly symmetric rolled or welded I/H'],
    ['Looked up from the built-in library by Section ID. Check against the project section tables.', 'Section ID: library; 0: welded I/H, r = 0. It/Iw: SCI P385 B.2.2/B.3.1 (approx.).'],
    ['6.1 Buckling curves (Table 6.2, rolled I/H, S235 to S420)', '6.1 Buckling curves (Table 6.2, rolled / welded I/H, S235 to S420)'],
    ['Imperfection factor about y: curve a, b or d', 'Imperfection factor about y: Table 6.2; Section = 0 is welded'],
    ['Imperfection factor about z: curve b, c or d', 'Imperfection factor about z: Table 6.2; Section = 0 is welded'],
    ['Imperfection factor, Table 6.4: curve a for h/b ≤ 2, else b', 'Imperfection factor, Table 6.4: rolled a/b; welded c/d'],
  ];
  const sectionKey = calcKey(shapes[id], shapes);
  const headings = Object.values(shapes).filter(s => s.type === 'text' && s.props.heading === 1).map(s => calcKey(s, shapes)).sort(compareOrderKeys);
  const start = headings.filter(key => compareOrderKeys(key, sectionKey) <= 0).at(-1);
  const end = headings.find(key => compareOrderKeys(key, sectionKey) > 0);
  for (const shape of Object.values(shapes)) {
    if (shape.type !== 'text') continue;
    const key = calcKey(shape, shapes);
    if (start && compareOrderKeys(key, start) < 0 || end && compareOrderKeys(key, end) >= 0) continue;
    let html = shape.props.html;
    for (const [before, after] of notes) html = html.replace(before, after);
    if (html !== shape.props.html) patches[shape.id] = { props: { html } };
  }
  return patches;
}

export function applySteelSection(id: string, choice: number | SectionDimensions): void {
  const patches = planSteelSection(useCanvasStore.getState().shapes, id, choice);
  transaction(() => updateShapes(patches));
}
