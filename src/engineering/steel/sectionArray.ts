/** Section arrays keep units and expose a stable, zero-based property order. */
import { parseLatex } from '../../engine/light';
import type { Expr } from '../../engine/ExpressionTypes';
import formulae from './sectionFormulae.json';
import { propertyKeys, sectionById } from './sections';
import { dimensionKeys, sectionDimensionError, sectionSymbols, type SectionDimensions } from './customSection';

export type SectionChoice = number | SectionDimensions;
export const validArrayName = (name: string) => name.length <= 16 && /^[A-Za-z]+[0-9]*$/.test(name);
export const arraySymbol = (name: string) => {
  const [, letters, digits] = /^([A-Za-z]+)([0-9]*)$/.exec(name)!;
  return `\\mathrm{${letters}}${digits ? `_{${digits}}` : ''}`;
};
export function sectionAlias(key: typeof propertyKeys[number], name: string): string {
  const symbol = sectionSymbols[key];
  return symbol.includes('_') ? symbol.replace(/_(?:\{([^}]+)\}|([A-Za-z]))/, (_, a: string, b: string) => `_{${a ?? b}.${name}}`) : `${symbol}_{${name}}`;
}
export function sectionArrayDefinition(name: string, choice: SectionChoice): string {
  if (!validArrayName(name)) throw new Error('Use letters with optional digits at the end (e.g. S1), up to 16 characters.');
  let body: string;
  if (typeof choice === 'number') {
    sectionById(choice);
    body = `\\mathrm{stack}\\left(${propertyKeys.map((_, i) => `\\operatorname{sectionProp}(${choice},${i})`).join(',')}\\right)`;
  } else {
    const error = sectionDimensionError(choice);
    if (error) throw new Error(error);
    const bindings = dimensionKeys.flatMap(k => [sectionSymbols[k], `${choice[k]}\\,\\mathrm{mm}`]);
    for (const key of propertyKeys) if (!dimensionKeys.some(k => k === key)) bindings.push(sectionSymbols[key], formulae.properties[key as keyof typeof formulae.properties]);
    body = `\\mathrm{let}\\left(${bindings.join(',')},\\mathrm{stack}\\left(${propertyKeys.map(k => sectionSymbols[k]).join(',')}\\right)\\right)`;
  }
  return `${arraySymbol(name)}\\coloneq${body}`;
}
function millimetres(e: Expr): number | null {
  if (e.type === 'group') return millimetres(e.body);
  return e.type === 'binary' && e.op === '*' && e.left.type === 'num' && e.right.type === 'ident' && e.right.name === 'mm' ? e.left.value : null;
}
/** Recognise only our explicit worksheet expressions, without saved calculated metadata. */
export function sectionArrayInfo(latex: string): { name: string; choice: SectionChoice } | null {
  if (!latex.includes('\\mathrm{stack}') || !latex.includes('\\coloneq')) return null;
  try {
    const s = parseLatex(latex);
    if (s.kind !== 'definition') return null;
    const name = s.name.replace(/_(\d+)$/, '$1');
    if (!validArrayName(name)) return null;
    if (s.expr.type === 'call' && s.expr.fn === 'stack' && s.expr.args.length === propertyKeys.length) {
      let id: number | undefined;
      for (const [i, e] of s.expr.args.entries()) {
        if (e.type !== 'call' || e.fn !== 'sectionProp' || e.args[0]?.type !== 'num' || e.args[1]?.type !== 'num' || e.args[1].value !== i) return null;
        id ??= e.args[0].value;
        if (id !== e.args[0].value) return null;
      }
      sectionById(id!);
      return { name, choice: id! };
    }
    if (s.expr.type === 'let') {
      const d: Partial<SectionDimensions> = {};
      for (const key of dimensionKeys) {
        const b = s.expr.bindings.find(b => b.name === (key === 'tf' ? 't_f' : key === 'tw' ? 't_w' : key));
        const value = b ? millimetres(b.value) : null;
        if (value === null) return null;
        d[key] = value;
      }
      const choice = d as SectionDimensions;
      // An edited expression is ordinary math unless it still matches this component's equations.
      if (sectionArrayDefinition(name, choice) !== latex) return null;
      return { name, choice };
    }
  } catch { /* Other math regions are not section components. */ }
  return null;
}
