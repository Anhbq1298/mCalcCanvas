/** Fixed matrix operations; no parsing or evaluation of user strings. */
import { advancedFunctionNames, evalAdvancedFunction, type AdvancedFunctionName } from './matrixAdvancedFunctions';
import { arrayFunctionNames, evalArrayFunction, type ArrayFunctionName } from './matrixArrayFunctions';
import { CalculationError } from './CalculationErrors';
import { isBundle, QMatrix, QVector, isMatrix, isVector, requireScalar, type Value } from './Vector';
import { isAbsoluteTemperature, isDimensionless, isUnit, math, sameDimension, siValue, type Quantity } from './UnitSystem';

import type { MatrixFunctionName } from './matrixNames';

export interface ScalarOps {
  add(a: Quantity, b: Quantity): Quantity;
  sub(a: Quantity, b: Quantity): Quantity;
  mul(a: Quantity, b: Quantity): Quantity;
  div(a: Quantity, b: Quantity): Quantity;
  pow(a: Quantity, n: number): Quantity;
}
const fail = (message: string): never => { throw new CalculationError('vector', message); };
const arity = (fn: string, args: Value[], min: number, max = min) => {
  if (args.length < min || args.length > max) throw new CalculationError('syntax', `${fn} takes ${min === max ? min : `${min} to ${max}`} arguments.`);
};
function integer(v: Value, what: string, min = 0): number {
  const q = requireScalar(v, what);
  if (!isDimensionless(q)) throw new CalculationError('unit-mismatch', `${what} must be dimensionless.`);
  const n = siValue(q);
  if (!Number.isSafeInteger(n) || n < min) throw new CalculationError('domain', `${what} must be an integer ≥ ${min}.`);
  return n;
}
function size(r: number, c: number) {
  if (r * c > 10_000) throw new CalculationError('limit-exceeded', 'A matrix may have at most 10000 entries.');
}
function asMatrix(v: Value): QMatrix {
  if (!isVector(v)) return new QMatrix(1, 1, [v]);
  return isMatrix(v) ? v : new QMatrix(v.length, 1, v.items);
}
function square(v: Value): QMatrix {
  const a = asMatrix(v);
  if (a.rows !== a.cols) fail('This operation requires a square matrix.');
  if (a.rows > 100) throw new CalculationError('limit-exceeded', 'Factorization is limited to 100 × 100 matrices.');
  return a;
}
function vector(v: Value): QVector {
  if (!isVector(v) || (isMatrix(v) && v.rows !== 1 && v.cols !== 1)) return fail('This operation requires a vector or a one-row/one-column matrix.');
  return v;
}
function numeric(a: QVector): { data: number[] } {
  const unit = a.items[0] ?? 1;
  if (a.items.some((x) => !sameDimension(x, unit))) throw new CalculationError('unit-mismatch', 'Factorization and norms require entries with a common dimension.');
  if (a.items.some(isAbsoluteTemperature)) throw new CalculationError('temperature', 'Absolute temperatures cannot be used in matrix factorization or norms.');
  return { data: a.items.map(siValue) };
}
/** A unit with magnitude one in SI, including when the first entry is zero. */
function unitSI(q: Quantity): Quantity {
  if (!isUnit(q)) return 1;
  const u = q.clone(); u.value = 1; return u;
}
function numericRows(a: QMatrix): number[][] {
  return Array.from({ length: a.rows }, (_, r) => a.items.slice(r * a.cols, (r + 1) * a.cols).map(siValue));
}
export function transpose(v: Value): QMatrix {
  const a = asMatrix(v);
  return new QMatrix(a.cols, a.rows, Array.from({ length: a.length }, (_, k) => a.items[(k % a.rows) * a.cols + Math.floor(k / a.rows)]));
}
export function matrixMultiply(a: Value, b: Value, ops: ScalarOps): Value {
  if (!isVector(a) || !isVector(b)) return fail('Matrix multiplication needs two arrays.');
  const x = asMatrix(a), y = asMatrix(b);
  if (x.cols !== y.rows) return fail(`Cannot multiply ${x.rows} × ${x.cols} by ${y.rows} × ${y.cols}.`);
  size(x.rows, y.cols);
  if (x.rows * x.cols * y.cols > 1_000_000) throw new CalculationError('limit-exceeded', 'Matrix multiplication exceeds 1000000 scalar products.');
  const out: Quantity[] = [];
  for (let r = 0; r < x.rows; r++) for (let c = 0; c < y.cols; c++) {
    let sum = ops.mul(x.items[r * x.cols], y.items[c]);
    for (let k = 1; k < x.cols; k++) sum = ops.add(sum, ops.mul(x.items[r * x.cols + k], y.items[k * y.cols + c]));
    out.push(sum);
  }
  return new QMatrix(x.rows, y.cols, out);
}
export function matrixPower(a: QMatrix, exponent: Value, ops: ScalarOps): QMatrix {
  const q = requireScalar(exponent, 'A matrix exponent');
  if (!isDimensionless(q)) throw new CalculationError('unit-mismatch', 'A matrix exponent must be dimensionless.');
  const n = siValue(q);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 1000) throw new CalculationError('domain', 'A matrix exponent must be an integer between -1000 and 1000.');
  square(a);
  let power = n < 0 ? evalMatrixFunction('inv', [a], ops) as QMatrix : a;
  let result = identity(a.rows);
  let k = Math.abs(n);
  while (k) {
    if (k % 2) result = matrixMultiply(result, power, ops) as QMatrix;
    k = Math.floor(k / 2);
    if (k) power = matrixMultiply(power, power, ops) as QMatrix;
  }
  return result;
}
function identity(n: number): QMatrix {
  size(n, n);
  return new QMatrix(n, n, Array.from({ length: n * n }, (_, k) => Math.floor(k / n) === k % n ? 1 : 0));
}
export function joinMatrices(args: Value[], vertical: boolean): QMatrix {
  const ms = args.map(asMatrix);
  const first = ms[0];
  if (!first) return fail('Joining matrices requires at least one argument.');
  if (ms.some((m) => vertical ? m.cols !== first.cols : m.rows !== first.rows)) return fail('Joined matrices must have matching dimensions.');
  const rows = vertical ? ms.reduce((n, m) => n + m.rows, 0) : first.rows;
  const cols = vertical ? first.cols : ms.reduce((n, m) => n + m.cols, 0);
  size(rows, cols);
  const data = vertical ? ms.flatMap((m) => [...m.items]) : Array.from({ length: rows }, (_, r) => ms.flatMap((m) => m.items.slice(r * m.cols, (r + 1) * m.cols))).flat();
  return new QMatrix(rows, cols, data);
}
export function evalMatrixFunction(fn: MatrixFunctionName, args: Value[], ops: ScalarOps, predicate?: (a: Quantity, b: Quantity) => boolean): Value {
  if ((arrayFunctionNames as readonly string[]).includes(fn) && (fn === 'IsArray' || fn === 'IsScalar')) return evalArrayFunction(fn as ArrayFunctionName, args, ops);
  if (args.some(isBundle)) {
    if (fn === 'at' && args.length === 2 && isBundle(args[0])) {
      const i = integer(args[1], 'Factor index');
      if (i >= args[0].factors.length) return fail('Factor index is out of bounds.');
      return args[0].factors[i];
    }
    if ((fn === 'length' || fn === 'last') && args.length === 1 && isBundle(args[0])) return args[0].length - (fn === 'last' ? 1 : 0);
    return fail('Extract a factor with at(result, index) before calling this function.');
  }
  if ((advancedFunctionNames as readonly string[]).includes(fn)) return evalAdvancedFunction(fn as AdvancedFunctionName, args, ops);
  if ((arrayFunctionNames as readonly string[]).includes(fn)) return evalArrayFunction(fn as ArrayFunctionName, args, ops, predicate);
  if (fn === 'tr') return evalMatrixFunction('trace', args, ops);
  if (fn === 'matrix' || fn === 'zeros' || fn === 'ones' || fn === 'identity') {
    arity(fn, args, fn === 'identity' ? 1 : 2, fn === 'matrix' ? 3 : fn === 'identity' ? 1 : 2);
    const r = integer(args[0], 'Row count', 1), c = fn === 'identity' ? r : integer(args[1], 'Column count', 1);
    size(r, c);
    if (fn === 'identity') return identity(r);
    const fill = args[2] ?? (fn === 'ones' ? 1 : 0);
    if (isVector(fill)) {
      if (fill.length !== r * c) return fail('matrix data length must equal rows × columns.');
      return new QMatrix(r, c, fill.items);
    }
    return new QMatrix(r, c, Array<Quantity>(r * c).fill(fill));
  }
  if (fn === 'augment') { arity(fn, args, 1, 100); return joinMatrices(args, false); }
  arity(fn, args, fn === 'at' ? 2 : ['row', 'col', 'dot', 'cross', 'lsolve', 'hadamard', 'divideElements', 'powerElements'].includes(fn) ? 2 : fn === 'submatrix' ? 5 : 1, fn === 'at' ? 3 : ['row', 'col', 'dot', 'cross', 'lsolve', 'hadamard', 'divideElements', 'powerElements'].includes(fn) ? 2 : fn === 'submatrix' ? 5 : 1);
  const a = asMatrix(args[0]);
  if (fn === 'rows') return a.rows;
  if (fn === 'cols') return a.cols;
  if (fn === 'transpose') return transpose(args[0]);
  if (fn === 'at' || fn === 'row' || fn === 'col') {
    const i = integer(args[1], 'Index');
    if (fn === 'at' && args.length === 2) {
      const v = vector(args[0]);
      if (i >= v.length) return fail('Index is out of bounds (indices start at 0).');
      return v.items[i];
    }
    const r = fn === 'col' ? 0 : i, c = fn === 'at' ? integer(args[2], 'Column index') : fn === 'col' ? i : 0;
    if (r >= a.rows || c >= a.cols) return fail('Index is out of bounds (indices start at 0).');
    if (fn === 'at') return a.items[r * a.cols + c];
    return new QVector(fn === 'row' ? a.items.slice(i * a.cols, (i + 1) * a.cols) : Array.from({ length: a.rows }, (_, k) => a.items[k * a.cols + i]));
  }
  if (fn === 'submatrix') {
    const [r0, r1, c0, c1] = args.slice(1).map((x) => integer(x, 'Submatrix index'));
    if (r0 > r1 || c0 > c1 || r1 >= a.rows || c1 >= a.cols) return fail('Invalid inclusive submatrix bounds (indices start at 0).');
    return new QMatrix(r1 - r0 + 1, c1 - c0 + 1, Array.from({ length: r1 - r0 + 1 }, (_, r) => a.items.slice((r0 + r) * a.cols + c0, (r0 + r) * a.cols + c1 + 1)).flat());
  }
  if (fn === 'diag') {
    if (isMatrix(args[0]) && a.rows > 1 && a.cols > 1) return new QVector(Array.from({ length: Math.min(a.rows, a.cols) }, (_, i) => a.items[i * a.cols + i]));
    const v = vector(args[0]); size(v.length, v.length);
    return new QMatrix(v.length, v.length, Array.from({ length: v.length ** 2 }, (_, k) => Math.floor(k / v.length) === k % v.length ? v.items[k % v.length] : ops.mul(v.items[0], 0)));
  }
  if (fn === 'hadamard' || fn === 'divideElements' || fn === 'powerElements') {
    const b = args[1];
    if (isVector(b) && (!isMatrix(b) || b.rows !== a.rows || b.cols !== a.cols)) return fail('Element-wise matrix operations require matching dimensions.');
    return new QMatrix(a.rows, a.cols, a.items.map((x, i) => {
      const y = isVector(b) ? b.items[i] : b;
      if (fn === 'hadamard') return ops.mul(x, y);
      if (fn === 'divideElements') return ops.div(x, y);
      if (!isDimensionless(y)) throw new CalculationError('unit-mismatch', 'An exponent must be dimensionless.');
      return ops.pow(x, siValue(y));
    }));
  }
  if (fn === 'dot' || fn === 'cross') {
    const x = vector(args[0]), y = vector(args[1]);
    if (x.length !== y.length || x.length === 0) return fail('Vector lengths must match and be nonzero.');
    if (fn === 'cross') {
      if (x.length !== 3) return fail('Cross product requires two 3-entry vectors.');
      return new QVector([0, 1, 2].map((i) => ops.sub(ops.mul(x.items[(i + 1) % 3], y.items[(i + 2) % 3]), ops.mul(x.items[(i + 2) % 3], y.items[(i + 1) % 3]))));
    }
    return x.items.map((q, i) => ops.mul(q, y.items[i])).reduce(ops.add);
  }
  if (fn === 'norm') {
    const { data } = numeric(a);
    // Frobenius norm (Euclidean for vectors); hypot avoids intermediate overflow.
    return ops.mul(Math.hypot(...data), unitSI(a.items[0]));
  }
  if (fn === 'trace') {
    square(a);
    return Array.from({ length: a.rows }, (_, i) => a.items[i * a.cols + i]).reduce(ops.add);
  }
  numeric(a);
  const u = unitSI(a.items[0]);
  if (fn === 'rank' || fn === 'rref') {
    if (a.rows > 100 || a.cols > 100) throw new CalculationError('limit-exceeded', 'Row reduction is limited to 100 × 100 matrices.');
    const m = numericRows(a);
    const scale = Math.max(...a.items.map((q) => Math.abs(siValue(q))));
    const tol = Number.EPSILON * Math.max(a.rows, a.cols) * scale;
    let lead = 0;
    for (let c = 0; c < a.cols && lead < a.rows; c++) {
      let p = lead;
      for (let r = lead + 1; r < a.rows; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
      if (Math.abs(m[p][c]) <= tol) continue;
      [m[lead], m[p]] = [m[p], m[lead]];
      const d = m[lead][c];
      m[lead] = m[lead].map((x) => x / d);
      for (let r = 0; r < a.rows; r++) if (r !== lead) {
        const factor = m[r][c];
        m[r] = m[r].map((x, k) => x - factor * m[lead][k]);
        m[r][c] = 0;
      }
      lead++;
    }
    return fn === 'rank' ? lead : new QMatrix(a.rows, a.cols, m.flat());
  }
  square(a);
  const data = numericRows(a);
  if (fn === 'det') return ops.mul(math.det(data), ops.pow(u, a.rows));
  try {
    if (fn === 'inv') {
      const result = math.inv(data) as number[][];
      return new QMatrix(a.rows, a.cols, result.flat().map((x) => ops.div(x, u)));
    }
    if (fn === 'lsolve') {
      const b = asMatrix(args[1]);
      if (b.rows !== a.rows) return fail('lsolve: right-hand side row count must match the square coefficient matrix.');
      numeric(b);
      const ub = unitSI(b.items[0]);
      const result = math.lusolve(data, numericRows(b)) as number[][];
      const out = result.flat().map((x) => ops.mul(x, ops.div(ub, u)));
      return isMatrix(args[1]) ? new QMatrix(a.rows, b.cols, out) : new QVector(out);
    }
  } catch (error) {
    if (error instanceof CalculationError) throw error;
    throw new CalculationError('domain', 'Matrix is singular; the inverse or a unique solution does not exist.');
  }
  return fail(`Unsupported matrix function ${fn}.`);
}
