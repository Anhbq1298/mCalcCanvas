/**
 * Vector values: an ordered list of quantities produced by a range
 * (i := 0..n−1) or by arithmetic on one. Entries carry their own units.
 */
import { CalculationError } from './CalculationErrors';
import {
  isAbsoluteTemperature,
  isDimensionless,
  isUnit,
  sameDimension,
  formatNumber,
  formatQuantity,
  parseDisplayUnit,
  type FormattedQuantity,
  type NumberStyle,
  type Quantity,
  type UnitSystemName,
} from './UnitSystem';
import type { Unit } from 'mathjs';

/** Largest vector a worksheet may create (protects the UI and graphs). */
export const MAX_VECTOR_LENGTH = 10_000;

export class QVector {
  private _items: readonly Quantity[] | null;
  /**
   * Packed form (fast path for long vectors): SI values plus one shared unit
   * (its own value is ignored; null = plain numbers). Every entry then has the
   * same dimension. `undefined` = not worked out yet.
   */
  private _packed: Packed | null | undefined;
  constructor(items: readonly Quantity[]) {
    if (items.length > MAX_VECTOR_LENGTH) {
      throw new CalculationError('limit-exceeded', `A vector may have at most ${MAX_VECTOR_LENGTH} entries (got ${items.length}).`);
    }
    this._items = items;
    this._packed = undefined;
  }
  /** A vector from SI values sharing one unit (null: plain numbers). */
  static packed(si: Float64Array, unit: Unit | null): QVector {
    if (si.length > MAX_VECTOR_LENGTH) {
      throw new CalculationError('limit-exceeded', `A vector may have at most ${MAX_VECTOR_LENGTH} entries (got ${si.length}).`);
    }
    const v = Object.create(QVector.prototype) as QVector;
    v._items = null;
    v._packed = { si, unit: unit && isDimensionless(unit) ? null : unit };
    return v;
  }
  get items(): readonly Quantity[] {
    if (!this._items) {
      const { si, unit } = this._packed!;
      const out: Quantity[] = new Array(si.length);
      for (let i = 0; i < si.length; i++) out[i] = unit ? withSi(unit, si[i]) : si[i];
      this._items = out;
    }
    return this._items;
  }
  get length(): number {
    return this._items ? this._items.length : this._packed!.si.length;
  }
  /** Packed form when every entry has the same dimension (no °C), else null. */
  pack(): Packed | null {
    if (this._packed === undefined) this._packed = packItems(this._items!);
    return this._packed;
  }
}

export interface Packed {
  si: Float64Array;
  unit: Unit | null;
}

/** A copy of unit u holding the SI value v (mathjs stores SI values; the units only display). */
export function withSi(u: Unit, v: number): Unit {
  const r = u.clone();
  r.value = v;
  r.fixPrefix = false;
  return r;
}

function packItems(items: readonly Quantity[]): Packed | null {
  const n = items.length;
  const si = new Float64Array(n);
  const first = items[0];
  if (n === 0) return { si, unit: null };
  if (typeof first === 'number') {
    for (let i = 0; i < n; i++) {
      const q = items[i];
      if (typeof q !== 'number') return null;
      si[i] = q;
    }
    return { si, unit: null };
  }
  if (!isUnit(first) || first.value === null || isAbsoluteTemperature(first)) return null;
  for (let i = 0; i < n; i++) {
    const q = items[i];
    if (typeof q === 'number' || !isUnit(q) || q.value === null || (i > 0 && !sameDimension(q, first)) || (i > 0 && isAbsoluteTemperature(q))) return null;
    si[i] = q.value;
  }
  return { si, unit: isDimensionless(first) ? null : first };
}

/** A scalar quantity or a vector. */
export type Value = Quantity | QVector;

export function isVector(v: unknown): v is QVector {
  return v instanceof QVector;
}

/** Throws when a scalar is required (checks, if-conditions, exponents …). */
export function requireScalar(v: Value, what: string): Quantity {
  if (isVector(v)) {
    throw new CalculationError('vector', `${what} must be a single value, not a vector (${v.length} entries).`);
  }
  return v;
}

/** Applies f entry by entry: scalar∘vector, vector∘scalar or vector∘vector of equal length. */
export function broadcast2(a: Value, b: Value, f: (x: Quantity, y: Quantity) => Quantity): Value {
  const va = isVector(a);
  const vb = isVector(b);
  if (!va && !vb) return f(a as Quantity, b as Quantity);
  if (va && vb && a.length !== b.length) {
    throw new CalculationError('vector', `Vectors of different lengths cannot be combined (${a.length} and ${b.length} entries).`);
  }
  const n = va ? (a as QVector).length : (b as QVector).length;
  const items: Quantity[] = new Array(n);
  for (let i = 0; i < n; i++) {
    items[i] = f(va ? (a as QVector).items[i] : (a as Quantity), vb ? (b as QVector).items[i] : (b as Quantity));
  }
  return new QVector(items);
}

export function broadcast1(a: Value, f: (x: Quantity) => Quantity): Value {
  return isVector(a) ? new QVector(a.items.map(f)) : f(a);
}

/** Applies f across any number of arguments, broadcasting vectors of equal length. */
export function broadcastN(args: Value[], f: (xs: Quantity[]) => Quantity): Value {
  const lengths = args.filter(isVector).map((v) => v.length);
  if (lengths.length === 0) return f(args as Quantity[]);
  const n = lengths[0];
  if (lengths.some((l) => l !== n)) {
    throw new CalculationError('vector', `Vectors of different lengths cannot be combined (${lengths.join(', ')} entries).`);
  }
  const items: Quantity[] = new Array(n);
  for (let i = 0; i < n; i++) items[i] = f(args.map((a) => (isVector(a) ? a.items[i] : a)));
  return new QVector(items);
}

/** All entries of the arguments, flattened (for min, max, sum). */
export function flatten(args: Value[]): Quantity[] {
  return args.flatMap((a) => (isVector(a) ? [...a.items] : [a]));
}

/** Entries shown before an array is shortened (first half + … + last half), like pandas. */
export const DEFAULT_VECTOR_LIMIT = 10;
/** Even when expanded, very long arrays stay shortened beyond this length. */
const EXPANDED_MAX = 1000;
const GAP = '\u0000gap';

/**
 * "[0, 1, 2, …, 21] mm (22)". With a common dimension every entry is shown in
 * one unit (the target unit or the first entry's preferred unit) and the
 * numbers are kept for graphs; otherwise each entry carries its own unit.
 */
export function formatVector(
  v: QVector,
  opts: {
    decimals: number;
    system: UnitSystemName;
    targetUnit?: string | null;
    style?: NumberStyle;
    layout?: 'row' | 'column';
    /** Show at most this many entries (half from the start, half from the end); 0 = all. */
    limit?: number;
    /** The user asked to see every entry of this region. */
    expanded?: boolean;
  },
): FormattedQuantity {
  const column = opts.layout === 'column';
  const n = v.length;
  if (n === 0) {
    return { text: '[ ] (0)', latex: '\\left[\\;\\right]', number: Number.NaN, unitText: '', unitLatex: '', dimension: 'empty', items: [], length: 0 };
  }
  const first = formatQuantity(v.items[0], opts);
  const common = v.items.every((q) => sameDimension(q, v.items[0]));
  const limit = opts.expanded || opts.limit === 0 ? EXPANDED_MAX : Math.max(2, opts.limit ?? DEFAULT_VECTOR_LIMIT);
  const all = limit;
  const head = Math.ceil(limit / 2);
  const tail = limit - head;
  const shown = n <= all ? [...Array(n).keys()] : [...Array(head).keys(), -1, ...Array.from({ length: tail }, (_, k) => n - tail + k)];
  // Row: [a, b, …, z]. Column: a matrix with one entry per line and ⋮ for skipped entries.
  // The ellipsis carries a class so the canvas can expand the array on double-click.
  const more = (g: string) => `\\class{vec-more}{${g}}`;
  const wrap = (items: string[], gap: string) =>
    column ? `\\begin{bmatrix}${items.map((x) => (x === GAP ? more('\\vdots') : x)).join('\\\\')}\\end{bmatrix}` : `\\left[${items.map((x) => (x === GAP ? more(gap) : x)).join(',\\,')}\\right]`;
  const truncated = shown.includes(-1);
  const suffix = truncated ? ` (${n})` : '';
  if (common) {
    let unit = opts.targetUnit ?? null;
    if (!unit && first.unitText) {
      try {
        unit = first.unitText === '°' ? 'deg' : parseDisplayUnit(first.unitText);
      } catch {
        unit = null;
      }
    }
    const every = v.items.map((q) => (unit ? formatQuantity(q, { ...opts, targetUnit: unit }) : formatQuantity(q, opts)));
    // Round-off such as cos(π/2) = 6e-17 is shown as 0 rather than in scientific notation.
    const maxAbs = Math.max(...every.map((f) => Math.abs(f.number)));
    const clean = (x: number) => (Math.abs(x) <= maxAbs * 1e-12 ? 0 : x);
    const nums = shown.map((i) => (i < 0 ? null : formatNumber(clean(every[i].number), opts.decimals, opts.style)));
    const text = `[${nums.map((x) => (x ? x.text : '…')).join(', ')}]`;
    const latex = wrap(nums.map((x) => (x ? x.latex : GAP)), '\\ldots');
    const deg = first.unitText === '°';
    return {
      text: (first.unitText ? (deg ? `${text}°` : `${text} ${first.unitText}`) : text) + suffix,
      latex: first.unitLatex ? (deg ? `${latex}\\degree` : `${latex}\\,${first.unitLatex}`) : latex,
      number: every[0].number,
      unitText: first.unitText,
      unitLatex: first.unitLatex,
      dimension: first.dimension,
      items: every.map((f) => f.number),
      length: n,
      truncated,
    };
  }
  const parts = shown.map((i) => (i < 0 ? null : formatQuantity(v.items[i], { ...opts, targetUnit: null })));
  return {
    text: `[${parts.map((x) => (x ? x.text : '…')).join(', ')}]${suffix}`,
    latex: wrap(parts.map((x) => (x ? x.latex : GAP)), '\\ldots'),
    number: Number.NaN,
    unitText: '',
    unitLatex: '',
    dimension: 'mixed',
    length: n,
    truncated,
  };
}
