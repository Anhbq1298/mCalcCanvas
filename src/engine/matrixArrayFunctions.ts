import { CalculationError } from './CalculationErrors';
import { QBundle, QMatrix, QVector, isMatrix, isVector, requireScalar, type Value } from './Vector';
import { isAbsoluteTemperature, isDimensionless, isUnit, math, sameDimension, siValue, type Quantity } from './UnitSystem';
import type { ScalarOps } from './matrixFunctions';

export const arrayFunctionNames = ['IsArray', 'IsScalar', 'last', 'length', 'Rank', 'logpts', 'logspace', 'kronecker', 'lookup', 'hlookup', 'vlookup', 'vhlookup', 'match', 'convolve', 'crosscorr', 'deconvolve'] as const;
export type ArrayFunctionName = typeof arrayFunctionNames[number];
const error = (message: string): never => { throw new CalculationError('domain', message); };
const count = (args: Value[], min: number, max = min) => { if (args.length < min || args.length > max) error(`Expected ${min === max ? min : `${min}–${max}`} arguments.`); };
const int = (v: Value, min = 0): number => {
  const q = requireScalar(v, 'Index/count');
  const n = siValue(q);
  if (!isDimensionless(q) || !Number.isSafeInteger(n) || n < min) return error(`Expected a dimensionless integer ≥ ${min}.`);
  return n;
};
const matrix = (v: Value): QMatrix => isMatrix(v) ? v : isVector(v) ? new QMatrix(v.length, 1, v.items) : new QMatrix(1, 1, [v]);
const vector = (v: Value): QVector => {
  if (!isVector(v) || (isMatrix(v) && v.rows > 1 && v.cols > 1) || !v.length) return error('Expected a nonempty vector.');
  return v;
};
const limit = (n: number) => { if (n > 10_000) throw new CalculationError('limit-exceeded', 'Array exceeds 10000 entries.'); };
export function evalArrayFunction(fn: ArrayFunctionName, args: Value[], ops: ScalarOps, predicate?: (a: Quantity, b: Quantity) => boolean): Value {
  if (fn === 'IsArray' || fn === 'IsScalar') { count(args, 1); return Number(fn === 'IsArray' ? isVector(args[0]) : !isVector(args[0])); }
  if (fn === 'last' || fn === 'length' || fn === 'Rank') {
    count(args, 1); const v = vector(args[0]);
    if (fn !== 'Rank') return fn === 'last' ? v.length - 1 : v.length;
    if (v.items.some((q) => !sameDimension(q, v.items[0]))) return error('Rank requires entries with a common dimension.');
    const order = v.items.map((q, i) => ({ x: siValue(q), i })).sort((a, b) => a.x - b.x), out = Array<number>(v.length);
    for (let i = 0; i < order.length;) {
      let j = i + 1; while (j < order.length && order[j].x === order[i].x) j++;
      for (let k = i; k < j; k++) out[order[k].i] = (i + 1 + j) / 2;
      i = j;
    }
    return new QVector(out);
  }
  if (fn === 'logspace' || fn === 'logpts') {
    count(args, 3);
    if (fn === 'logpts') {
      const q = requireScalar(args[0], 'Starting exponent');
      if (!isDimensionless(q)) return error('Starting exponent must be dimensionless.');
      const first = siValue(q), decades = int(args[1], 1), n = int(args[2], 1); limit(decades * n);
      // Points are evenly spaced within each decade, excluding its upper endpoint.
      return new QVector(Array.from({ length: decades * n }, (_, i) => 10 ** (first + Math.floor(i / n)) * (1 + 9 * (i % n) / n)));
    }
    const a = requireScalar(args[0], 'Minimum'), b = requireScalar(args[1], 'Maximum'), n = int(args[2], 2); limit(n);
    if (!sameDimension(a, b) || siValue(a) <= 0 || siValue(b) <= 0) return error('logspace requires positive endpoints with compatible units.');
    const ratioLog = Math.log(siValue(b)) - Math.log(siValue(a));
    return new QVector(Array.from({ length: n }, (_, i) => i === n - 1 ? b : ops.mul(a, Math.exp(ratioLog * i / (n - 1)))));
  }
  if (fn === 'kronecker') {
    count(args, 2); const a = matrix(args[0]), b = matrix(args[1]); limit(a.length * b.length);
    return new QMatrix(a.rows * b.rows, a.cols * b.cols, Array.from({ length: a.rows * b.rows }, (_, r) => Array.from({ length: a.cols * b.cols }, (_, c) => ops.mul(a.items[Math.floor(r / b.rows) * a.cols + Math.floor(c / b.cols)], b.items[(r % b.rows) * b.cols + c % b.cols]))).flat());
  }
  if (['lookup', 'hlookup', 'vlookup', 'vhlookup', 'match'].includes(fn)) {
    count(args, fn === 'match' ? 2 : 3, fn === 'match' ? 3 : 4);
    const mode = args[fn === 'match' ? 2 : 3] === undefined ? 0 : int(args[fn === 'match' ? 2 : 3]);
    if (mode > 7) return error('Unknown lookup modifier.');
    const target = args[0];
    const matches = (q: Quantity, z: Value = target): boolean => {
      if (mode === 7) { const v = vector(z); if (v.length !== 2) return error('range requires two bounds.'); return sameDimension(q, v.items[0]) && sameDimension(q, v.items[1]) && siValue(q) >= siValue(v.items[0]) && siValue(q) <= siValue(v.items[1]); }
      const t = requireScalar(z, 'Lookup key');
      if (!sameDimension(q, t)) return false;
      if (predicate) return predicate(t, q);
      const x = siValue(q), y = siValue(t), equal = Math.abs(x - y) <= 1e-12 * Math.max(Math.abs(x), Math.abs(y));
      return mode === 0 || mode === 1 ? equal : mode === 2 ? x > y : mode === 3 ? x < y : mode === 4 ? x >= y : mode === 5 ? x <= y : !equal;
    };
    const a = matrix(args[fn === 'vhlookup' ? 2 : 1]);
    const out: Quantity[] = [], locations: QVector[] = [];
    const testIndices = (indices: number[], key: Value = target): number[] => {
      if (mode !== 1) return indices.filter((i) => matches(a.items[i], key));
      const t = requireScalar(key, 'Lookup key');
      const candidates = indices.filter((i) => sameDimension(a.items[i], t));
      const d = Math.min(...candidates.map((i) => Math.abs(siValue(a.items[i]) - siValue(t))));
      return candidates.filter((i) => Math.abs(siValue(a.items[i]) - siValue(t)) === d);
    };
    if (fn === 'lookup' || fn === 'match') {
      const b = fn === 'lookup' ? matrix(args[2]) : a;
      if (b.rows !== a.rows || b.cols !== a.cols) return error('lookup arrays must have identical dimensions.');
      const indices = Array.from({ length: a.cols }, (_, c) => Array.from({ length: a.rows }, (_, r) => r * a.cols + c)).flat();
      for (const i of testIndices(indices)) { out.push(b.items[i]); locations.push(isMatrix(args[1]) ? new QVector([Math.floor(i / a.cols), i % a.cols]) : new QVector([i])); }
      if (fn === 'match' && locations.length) return isMatrix(args[1]) ? new QBundle(locations) : new QVector(locations.map((v) => v.items[0]));
    } else if (fn === 'vhlookup') {
      const rs = testIndices(Array.from({ length: a.rows }, (_, r) => r * a.cols));
      const cs = testIndices(Array.from({ length: a.cols }, (_, c) => c), args[1]);
      for (const c of cs) for (const r of rs) out.push(a.items[r + c]);
    } else {
      const i = int(args[2]);
      if (i >= (fn === 'hlookup' ? a.rows : a.cols)) return error('Lookup row/column is out of bounds.');
      const indices = fn === 'hlookup' ? Array.from({ length: a.cols }, (_, c) => c) : Array.from({ length: a.rows }, (_, r) => r * a.cols);
      for (const k of testIndices(indices)) out.push(a.items[fn === 'hlookup' ? i * a.cols + k : k + i]);
    }
    if (!out.length) return error('No matching value was found.');
    return new QVector(out);
  }
  if (fn === 'deconvolve') {
    count(args, 2); const z = vector(args[0]), x = vector(args[1]);
    if (z.length > 100 || x.length > 100) throw new CalculationError('limit-exceeded', 'Deconvolution is limited to 100 entries.');
    for (const v of [z, x]) {
      if (v.items.some((q) => !sameDimension(q, v.items[0]))) return error('Deconvolution requires common units within each vector.');
      if (v.items.some(isAbsoluteTemperature)) return error('Absolute temperatures cannot be deconvolved.');
    }
    // Invert the same-size, centered, zero-padded convolution used by convolve(S,K).
    const n = z.length, center = x.length - Math.ceil(x.length / 2);
    const operator = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => {
      const j = c - r + center;
      return j >= 0 && j < x.length ? siValue(x.items[x.length - 1 - j]) : 0;
    }));
    let solution: number[][];
    try { solution = math.lusolve(operator, z.items.map((q) => [siValue(q)])) as number[][]; }
    catch { return error('Convolution operator is singular; this signal cannot be uniquely deconvolved.'); }
    const unit = (q: Quantity) => { if (!isUnit(q)) return 1; const u = q.clone(); u.value = 1; return u; };
    const u = ops.div(unit(z.items[0]), unit(x.items[0]));
    return new QVector(solution.flat().map((q) => ops.mul(q, u)));
  }
  count(args, 2, 4);
  const s = matrix(args[0]), k = matrix(args[1]), is1d = (!isMatrix(args[0]) || s.rows === 1 || s.cols === 1) && (!isMatrix(args[1]) || k.rows === 1 || k.cols === 1);
  const input = is1d ? new QMatrix(1, s.length, s.items) : s, kernel = is1d ? new QMatrix(1, k.length, k.items) : k;
  const bc = args[2] === undefined ? 0 : int(args[2]); if (bc > 3) return error('Boundary mode must be 0, 1, 2 or 3.');
  if (input.length * kernel.length > 1_000_000) throw new CalculationError('limit-exceeded', 'Convolution exceeds 1000000 products.');
  let overlap = [Math.ceil(kernel.rows / 2), Math.ceil(kernel.cols / 2)];
  if (args[3] !== undefined) overlap = isVector(args[3]) ? [...args[3].items].map((q) => int(q, 1)) : is1d ? [1, int(args[3], 1)] : [int(args[3], 1), int(args[3], 1)];
  if (overlap.length !== 2 || overlap[0] > kernel.rows || overlap[1] > kernel.cols) return error('Overlap must be within the kernel dimensions.');
  const boundary = (i: number, n: number): number => {
    if (i >= 0 && i < n) return i;
    if (bc === 0) return -1;
    if (bc === 3) return Math.max(0, Math.min(n - 1, i));
    if (bc === 1) return (i % n + n) % n;
    const period = 2 * n, t = (i % period + period) % period; return t < n ? t : period - t - 1;
  };
  const data: Quantity[] = [];
  for (let r = 0; r < input.rows; r++) for (let c = 0; c < input.cols; c++) {
    let sum = ops.mul(ops.mul(input.items[0], kernel.items[0]), 0);
    for (let i = 0; i < kernel.rows; i++) for (let j = 0; j < kernel.cols; j++) {
      const rr = boundary(r + i - (kernel.rows - overlap[0]), input.rows), cc = boundary(c + j - (kernel.cols - overlap[1]), input.cols);
      if (rr < 0 || cc < 0) continue;
      const ki = fn === 'convolve' ? (kernel.rows - 1 - i) * kernel.cols + kernel.cols - 1 - j : i * kernel.cols + j;
      sum = ops.add(sum, ops.mul(input.items[rr * input.cols + cc], kernel.items[ki]));
    }
    data.push(sum);
  }
  return !isMatrix(args[0]) ? new QVector(data) : new QMatrix(s.rows, s.cols, data);
}
