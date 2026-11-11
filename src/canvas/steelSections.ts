/** Section-picker changes are worksheet definitions, applied together as one undo step. */
import { compareOrderKeys, parseLatex } from '../engine/light';
import { calcKey } from './engineBridge';
import { transaction, updateShapes, useCanvasStore, type ShapePatch } from './model/canvasStore';
import type { MathShape, Shape } from './model/types';
import { SECTION_DEF, propertyKeys, sectionById } from '../engineering/steel/sections';
import { customPropertyDefinition, dimensionKeys, libraryPropertyDefinition, sectionCurveDefinitions, sectionDimensionError, sectionSymbols, type SectionDimensions } from '../engineering/steel/customSection';
import type { Expr } from '../engine/ExpressionTypes';

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
