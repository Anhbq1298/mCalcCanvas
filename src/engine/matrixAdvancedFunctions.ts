import { CalculationError } from './CalculationErrors';
import { QBundle, QMatrix, QVector, isBundle, isMatrix, isVector, requireScalar, type Value } from './Vector';
import { isAbsoluteTemperature, isDimensionless, isUnit, math, sameDimension, siValue, type Quantity } from './UnitSystem';
import { cholesky, eigen, lu, numericError, product, pseudoInverse, qr, singular, trans, type Dense } from './matrixNumerics';
import type { ScalarOps } from './matrixFunctions';
export const advancedFunctionNames = ['Cholesky', 'LU', 'QR', 'svd', 'svds', 'geninv', 'eigenvals', 'eigenvec', 'eigenvecs', 'genvals', 'genvecs', 'norm1', 'norm2', 'norme', 'normi', 'cond1', 'cond2', 'conde', 'condi'] as const;
export type AdvancedFunctionName = typeof advancedFunctionNames[number];
function input(v: Value): { data: Dense; unit: Quantity } {
  if (isBundle(v)) return numericError('Extract a nested factor with at(result, index) first.');
  const a = isMatrix(v) ? v : isVector(v) ? new QMatrix(v.length, 1, v.items) : new QMatrix(1, 1, [v]);
  const first = a.items[0];
  if (a.items.some((x) => !sameDimension(x, first))) throw new CalculationError('unit-mismatch', 'Factorization requires entries with a common dimension.');
  if (a.items.some(isAbsoluteTemperature)) throw new CalculationError('temperature', 'Absolute temperatures cannot be factorized.');
  const unit = isUnit(first) ? first.clone() : 1;
  if (isUnit(unit)) unit.value = 1;
  return { data: Array.from({ length: a.rows }, (_, r) => a.items.slice(r * a.cols, (r + 1) * a.cols).map(siValue)), unit };
}
const flag = (v: Value | undefined, fallback: number): boolean => {
  if (v === undefined) return Boolean(fallback);
  const q = requireScalar(v, 'Factorization option');
  if (!isDimensionless(q) || !Number.isSafeInteger(siValue(q))) return numericError('Factorization options must be dimensionless integers.');
  return siValue(q) !== 0;
};
const square = (a: Dense) => { if (a.length !== a[0].length) numericError('This function requires a square matrix.'); };
const normOf = (a: Dense, kind: string): number => kind === '1' ? Math.max(...trans(a).map((r) => r.reduce((s, x) => s + Math.abs(x), 0))) : kind === 'i' ? Math.max(...a.map((r) => r.reduce((s, x) => s + Math.abs(x), 0))) : kind === '2' ? singular(a).s[0] : Math.hypot(...a.flat());
export function evalAdvancedFunction(fn: AdvancedFunctionName, args: Value[], ops: ScalarOps): Value {
  const max = fn === 'Cholesky' || fn === 'genvecs' ? 3 : ['QR', 'eigenvecs', 'eigenvec', 'genvals'].includes(fn) ? 2 : 1;
  const min = ['eigenvec', 'genvals', 'genvecs'].includes(fn) ? 2 : 1;
  if (args.length < min || args.length > max) return numericError(`${fn} expects ${min === max ? min : `${min}–${max}`} arguments.`);
  const { data: a, unit } = input(args[0]);
  const wrap = (data: Dense, u: Quantity = 1) => new QMatrix(data.length, data[0].length, data.flat().map((x) => ops.mul(x, u)));
  if (fn === 'LU') {
    const r = lu(a); return new QBundle([wrap(r.p), wrap(r.l), wrap(r.u, unit)]);
  }
  if (fn === 'QR') {
    const pivoting = flag(args[1], 1), r = qr(a, pivoting);
    return new QBundle(pivoting ? [wrap(r.p), wrap(r.q), wrap(r.r, unit)] : [wrap(r.q), wrap(r.r, unit)]);
  }
  if (fn === 'Cholesky') {
    const pivoting = flag(args[1], 1), upper = flag(args[2], 0), r = cholesky(a, pivoting);
    const factor = wrap(upper ? trans(r.l) : r.l, ops.pow(unit, 0.5));
    return pivoting ? new QBundle([wrap(r.p), factor]) : factor;
  }
  if (fn === 'svd' || fn === 'svds' || fn === 'geninv') {
    if (fn === 'geninv') return wrap(pseudoInverse(a), ops.div(1, unit));
    const r = singular(a), s = new QVector(r.s.map((x) => ops.mul(x, unit)));
    return fn === 'svds' ? s : new QBundle([s, wrap(r.u), wrap(r.vt)]);
  }
  if (fn.startsWith('norm')) return ops.mul(normOf(a, fn.slice(4)), unit);
  if (fn.startsWith('cond')) {
    square(a);
    const kind = fn.slice(4);
    const s = singular(a).s;
    if (s[s.length - 1] <= Number.EPSILON * a.length * s[0]) return numericError('The condition number is infinite: matrix is numerically singular.');
    if (kind === '2') return s[0] / s[s.length - 1];
    return normOf(a, kind) * normOf(math.inv(a) as Dense, kind);
  }
  square(a);
  let eigInput = a, valueUnit = unit;
  let transform: Dense | null = null;
  const generalized = fn === 'genvals' || fn === 'genvecs';
  const left = (fn === 'eigenvecs' && flag(args[1], 0)) || (fn === 'genvecs' && flag(args[2], 0));
  if (generalized) {
    const b = input(args[1]); square(b.data);
    if (b.data.length !== a.length) return numericError('Generalized eigenvalue matrices must have the same size.');
    valueUnit = ops.div(unit, b.unit);
    // Symmetric definite pencils use a Cholesky transformation, avoiding N⁻¹M loss of symmetry.
    const symmetric = (m: Dense) => m.every((r, i) => r.every((x, j) => x === m[j][i]));
    if (symmetric(a) && symmetric(b.data)) {
      try {
        const l = cholesky(b.data, false).l, invL = math.inv(l) as Dense;
        eigInput = product(product(invL, a), trans(invL));
        eigInput = eigInput.map((r, i) => r.map((x, j) => (x + eigInput[j][i]) / 2));
        transform = trans(invL);
      } catch (e) { if (!(e instanceof CalculationError)) throw e; eigInput = math.lusolve(b.data, a) as Dense; }
    } else eigInput = math.lusolve(b.data, a) as Dense;
    if (left && !transform) {
      // Left vectors solve Mᵀ y = λ Nᵀ y; N⁻ᵀ times eigenvectors of (N⁻¹M)ᵀ.
      transform = math.inv(trans(b.data)) as Dense;
      eigInput = trans(eigInput);
    }
  } else if (left) eigInput = trans(eigInput);
  const r = eigen(eigInput, fn !== 'eigenvals' && fn !== 'genvals');
  if (fn === 'eigenvals' || fn === 'genvals') return new QVector(r.values.map((x) => ops.mul(x, valueUnit)));
  let vectors = transform ? product(transform, r.vectors) : r.vectors;
  vectors = trans(trans(vectors).map((v) => { const n = Math.hypot(...v); return v.map((x) => x / n); }));
  if (fn === 'eigenvec') {
    const z = requireScalar(args[1], 'Eigenvalue');
    if (!sameDimension(z, unit)) throw new CalculationError('unit-mismatch', 'Eigenvalue and matrix entries must have compatible units.');
    const target = siValue(z), index = r.values.findIndex((x) => Math.abs(x - target) <= 1e-9 * Math.max(Math.abs(x), Math.abs(target), Number.MIN_VALUE));
    if (index < 0) return numericError('The specified value is not an eigenvalue of the matrix.');
    return new QVector(vectors.map((row) => row[index]));
  }
  return wrap(vectors);
}
