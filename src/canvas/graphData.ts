/**
 * Pure graph helpers: engine results of the series fields → drawable data,
 * axis ranges and tick steps. Kept free of React so they can be unit tested.
 */
import type { CalculationResult } from '../engine';
import type { GraphSeries, GraphShape } from './model/types';

/** Series fields evaluated by the engine. */
export type GraphField = 'x' | 'y' | 'r' | 'show';

/** Engine region id of one graph series field. */
export function graphRegionId(shapeId: string, seriesId: string, field: GraphField): string {
  return `${shapeId}::${seriesId}::${field}`;
}

/** Hidden graph-series regions are not worksheet regions (status bar, counts). */
export function isGraphRegionId(id: string): boolean {
  return id.includes('::');
}

/** A graph field may not define a variable (it would leak into the worksheet). */
export function isDefinitionLatex(latex: string): boolean {
  return /\\coloneqq?|\\Coloneqq?|\\colonequals|\\definedas|:=|≔/.test(latex);
}


/** A series ready to draw: numbers in the axis display units. */
export interface PlotSeries {
  series: GraphSeries;
  xs: number[];
  ys: number[];
  rs: number[] | null;
  /** segments style: group id per point (null: one piece). */
  groups?: number[] | null;
}

export interface GraphData {
  plots: PlotSeries[];
  errors: string[];
  xUnit: string;
  yUnit: string;
}

export const GRAPH_FIELDS: GraphField[] = ['x', 'y', 'r', 'show'];

function numbersOf(r: CalculationResult | undefined): number[] | null {
  const v = r?.value;
  if (!v) return null;
  if (v.items) return v.items;
  return Number.isFinite(v.number) ? [v.number] : null;
}

/** Stretches a single value to n entries; other lengths must match. */
function fit(values: number[], n: number): number[] | null {
  if (values.length === n) return values;
  if (values.length === 1) return new Array(n).fill(values[0]);
  return null;
}

/** Turns the engine results of every series field into drawable data and readable errors. */
export function buildGraphData(shape: GraphShape, results: (id: string) => CalculationResult | undefined): GraphData {
  const plots: PlotSeries[] = [];
  const errors: string[] = [];
  let xUnit = shape.props.xUnit.trim();
  let yUnit = shape.props.yUnit.trim();
  shape.props.series.forEach((series, i) => {
    const name = series.label || `Series ${i + 1}`;
    const get = (f: GraphField) => results(graphRegionId(shape.id, series.id, f));
    for (const [f, latex] of [['x', series.x], ['y', series.y], ['r', series.style === 'circle' || series.style === 'segments' ? series.r : ''], ['show', series.show]] as const) {
      if (latex && isDefinitionLatex(latex)) {
        errors.push(`${name}: ${f} cannot define a variable (use an expression such as x_{1}).`);
        return;
      }
    }
    if (series.show.trim()) {
      const show = get('show');
      if (show?.status === 'error') return void errors.push(`${name} (show): ${show.error?.message}`);
      const visible = show?.check ? show.check.pass : (show?.value?.number ?? 1) !== 0;
      if (!visible) return;
    }
    if (!series.x.trim() || !series.y.trim()) return void errors.push(`${name}: enter x and y.`);
    const rx = get('x');
    const ry = get('y');
    for (const [f, r] of [['x', rx], ['y', ry]] as const) {
      if (r?.status === 'error') return void errors.push(`${name} (${f}): ${r.error?.message}`);
      if (r?.check) return void errors.push(`${name} (${f}): expected values, not a check.`);
    }
    const xs0 = numbersOf(rx);
    const ys0 = numbersOf(ry);
    if (!xs0 || !ys0) return; // still calculating
    const n = Math.max(xs0.length, ys0.length);
    const xs = fit(xs0, n);
    const ys = fit(ys0, n);
    if (!xs || !ys) return void errors.push(`${name}: x has ${xs0.length} values but y has ${ys0.length}.`);
    let rs: number[] | null = null;
    let groups: number[] | null = null;
    if (series.style === 'segments' && series.r.trim()) {
      const rg = get('r');
      if (rg?.status === 'error') return void errors.push(`${name} (group): ${rg.error?.message}`);
      const g0 = numbersOf(rg);
      if (!g0) return;
      groups = fit(g0, n);
      if (!groups) return void errors.push(`${name}: group has ${g0.length} values but x has ${n}.`);
      if (rg?.value?.unitText) return void errors.push(`${name}: the group ids must be plain numbers.`);
    }
    if (series.style === 'circle') {
      const rr = get('r');
      if (!series.r.trim()) return void errors.push(`${name}: enter the circle radius r.`);
      if (rr?.status === 'error') return void errors.push(`${name} (r): ${rr.error?.message}`);
      const r0 = numbersOf(rr);
      if (!r0) return;
      rs = fit(r0, n);
      if (!rs) return void errors.push(`${name}: r has ${r0.length} values but x has ${n}.`);
      if ((rr?.value?.unitText ?? '') !== (rx?.value?.unitText ?? '')) {
        return void errors.push(`${name}: r is in ${rr?.value?.unitText || 'no unit'} but x in ${rx?.value?.unitText || 'no unit'}; set the X unit of the graph.`);
      }
    }
    if (!xUnit && rx?.value?.unitText) xUnit = rx.value.unitText;
    if (!yUnit && ry?.value?.unitText) yUnit = ry.value.unitText;
    plots.push({ series, xs, ys, rs, groups });
  });
  if (shape.props.equalAxes && plots.length && xUnit !== yUnit) {
    errors.push(`Equal axes need the same unit on both axes (x: ${xUnit || 'none'}, y: ${yUnit || 'none'}).`);
  }
  return { plots, errors, xUnit, yUnit };
}

/** 1, 2, 5 × 10ⁿ step giving about `target` intervals. */
export function niceStep(span: number, target = 5): number {
  if (!(span > 0)) return 1;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
}

export function tickLabel(v: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const s = v.toFixed(Math.min(6, decimals));
  return s === '-0' ? '0' : s;
}

export interface Range {
  min: number;
  max: number;
}

export function dataRange(plots: PlotSeries[]): { x: Range; y: Range } | null {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of plots) {
    p.xs.forEach((x, i) => {
      const r = p.rs ? Math.abs(p.rs[i]) : 0;
      x0 = Math.min(x0, x - r);
      x1 = Math.max(x1, x + r);
      y0 = Math.min(y0, p.ys[i] - r);
      y1 = Math.max(y1, p.ys[i] + r);
    });
  }
  if (!Number.isFinite(x0)) return null;
  const pad = (a: number, b: number): Range => (a === b ? { min: a - 1, max: b + 1 } : { min: a, max: b });
  return { x: pad(x0, x1), y: pad(y0, y1) };
}

export interface SeriesSource {
  name: string;
  regionId: string;
  latex: string;
  /** A literal input (n := 22): edit it directly. */
  input: boolean;
}

const isInput = (r: CalculationResult | undefined) => !!r && r.kind === 'definition' && r.references.length === 0;

function toSource(name: string, regionId: string, results: Record<string, CalculationResult | undefined>): SeriesSource {
  const r = results[regionId];
  return { name, regionId, latex: r?.definesLatex ?? name, input: isInput(r) };
}

/**
 * Where a series' data comes from: the variables its x, y, r and show
 * expressions use, and the literal inputs behind them (followed through
 * every intermediate definition). Each chip jumps to its definition.
 */
export function seriesSources(shapeId: string, seriesId: string, results: Record<string, CalculationResult | undefined>): { direct: SeriesSource[]; inputs: SeriesSource[] } {
  const direct = new Map<string, string>();
  for (const f of GRAPH_FIELDS) {
    const r = results[graphRegionId(shapeId, seriesId, f)];
    for (const [name, def] of Object.entries(r?.sources ?? {})) if (!direct.has(name)) direct.set(name, def);
  }
  // Walk definitions back to the literal inputs.
  const inputs = new Map<string, string>();
  const seen = new Set<string>();
  const queue = [...direct.entries()];
  while (queue.length) {
    const [name, def] = queue.shift()!;
    if (seen.has(def)) continue;
    seen.add(def);
    const r = results[def];
    if (isInput(r)) inputs.set(name, def);
    for (const entry of Object.entries(r?.sources ?? {})) queue.push(entry);
  }
  return {
    direct: [...direct].map(([n, d]) => toSource(n, d, results)),
    inputs: [...inputs].map(([n, d]) => toSource(n, d, results)).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
