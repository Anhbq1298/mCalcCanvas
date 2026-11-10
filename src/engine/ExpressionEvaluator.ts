/**
 * Symbol resolution and numeric evaluation of the expression tree.
 *
 * Evaluation walks the JSON tree and calls mathjs functions directly on
 * numbers and Unit objects – there is no string evaluation, no property
 * access, and user functions are worksheet expression trees with a bounded
 * call depth, so untrusted input can only ever perform bounded arithmetic.
 */
import { evalSteelFunction, steelFunctionNames, type SteelFunctionName } from './steelFunctions';
import { CalculationError } from './CalculationErrors';
import { QVector, broadcast1, broadcast2, broadcastN, flatten, isVector, requireScalar, withSi, type Value } from './Vector';
import type { Unit } from 'mathjs';
export { type Value } from './Vector';
import type { Condition, Expr } from './ExpressionTypes';
import { walkExpr, walkScoped } from './ExpressionTypes';
import {
  sameDimension,
  dimensionName,
  isDimensionless,
  isUnit,
  formatUnitString,
  isAbsoluteTemperature,
  isUnitSymbol,
  math,
  normalize,
  preferredUnit,
  siValue,
  unitValue,
  type Quantity,
} from './UnitSystem';

/** "Undefined variable" with the names involved (the engine may rephrase it as "defined below"). */
export class UndefinedNamesError extends CalculationError {
  readonly names: string[];
  constructor(names: string[]) {
    super('undefined-variable', undefinedMessage(names));
    this.names = names;
  }
}

export function undefinedMessage(names: string[]): string {
  const q = names.map((n) => `"${n}"`);
  return q.length === 1
    ? `Variable ${q[0]} has not been defined above this equation.`
    : `Variables ${q.join(', ')} have not been defined above this equation.`;
}

export function definedLaterMessage(name: string): string {
  return `Variable "${name}" is defined below this equation. Move its definition above it (calculations run top to bottom, left to right).`;
}

/**
 * How two values are compared in a check region.
 *
 * - `strict`: exact comparison of the full-precision values in SI base
 *   units. Used for engineering acceptance checks (≤ < ≥ >): a utilisation
 *   of 1.0000001, or even 1 + 2⁻⁵², against a limit of 1 FAILS. No
 *   tolerance is ever applied implicitly. (Floating-point noise can
 *   therefore only make a borderline check fail – the safe side – never
 *   pass. Typical unit conversions such as 300 mm = 0.3 m are exact.)
 * - `approximate`: |x − y| ≤ max(absoluteTolerance, relativeTolerance ·
 *   max(|x|, |y|)). Used only for numerical equality (= and ≠), where exact
 *   equality of computed reals is meaningless (0.1 + 0.2 = 0.3).
 */
interface ComparisonPolicy {
  mode: 'strict' | 'approximate';
  relativeTolerance?: number;
  absoluteTolerance?: number;
}

/** Engineering acceptance checks (≤ < ≥ >). */
export const CHECK_POLICY: ComparisonPolicy = { mode: 'strict' };
/** Numerical equality (= ≠): 12 significant digits. */
export const EQUALITY_POLICY: ComparisonPolicy = { mode: 'approximate', relativeTolerance: 1e-12, absoluteTolerance: 0 };

/** |x − y| within the policy's tolerance (strict: exactly equal). */
function withinTolerance(x: number, y: number, policy: ComparisonPolicy): boolean {
  if (policy.mode === 'strict') return x === y;
  const tol = Math.max(policy.absoluteTolerance ?? 0, (policy.relativeTolerance ?? 0) * Math.max(Math.abs(x), Math.abs(y)));
  return Math.abs(x - y) <= tol;
}

type Resolved =
  | { kind: 'var'; name: string }
  | { kind: 'unit'; symbol: string }
  | { kind: 'const'; name: string; value: Quantity };

type IdentExpr = Extract<Expr, { type: 'ident' }>;

export interface ResolveContext {
  isDefined(name: string): boolean;
}

/**
 * Mathcad built-in constants. A worksheet definition with the same name
 * takes precedence (with a warning), exactly as in Mathcad.
 */
export const BUILTIN_CONSTANTS: Record<string, { value: Quantity; description: string }> = {
  'π': { value: Math.PI, description: 'pi = 3.14159…' },
  e: { value: Math.E, description: 'Euler’s number = 2.71828…' },
  g: { value: math.unit(9.80665, 'm/s^2'), description: 'standard gravity = 9.80665 m/s²' },
  '∞': { value: 1e307, description: 'infinity (10³⁰⁷)' },
  '%': { value: 0.01, description: 'percent = 0.01' },
};

/**
 * Symbol-resolution policy (deterministic, position independent):
 *  1. Upright (\mathrm) names are units when registered, otherwise variables.
 *  2. A name defined in the worksheet is a variable.
 *  3. π is the constant.
 *  4. A registered unit symbol is a unit.
 *  5. A run of italic letters is split into single-letter factors ("wL" → w·L),
 *     each resolved by rules 2–4.
 */
export function resolveIdent(
  e: IdentExpr,
  ctx: ResolveContext,
): { ok: true; parts: Resolved[] } | { ok: false; undefinedNames: string[] } {
  const single = (name: string): Resolved | null => {
    if (ctx.isDefined(name)) return { kind: 'var', name };
    if (name in BUILTIN_CONSTANTS) return { kind: 'const', name, value: BUILTIN_CONSTANTS[name].value };
    if (isUnitSymbol(name)) return { kind: 'unit', symbol: name };
    return null;
  };

  if (e.roman) {
    if (isUnitSymbol(e.name)) return { ok: true, parts: [{ kind: 'unit', symbol: e.name }] };
    if (ctx.isDefined(e.name)) return { ok: true, parts: [{ kind: 'var', name: e.name }] };
    return { ok: false, undefinedNames: [e.name] };
  }
  const whole = single(e.name);
  if (whole) return { ok: true, parts: [whole] };
  if (!e.splittable) return { ok: false, undefinedNames: [e.name] };

  const parts: Resolved[] = [];
  const missing: string[] = [];
  for (const ch of e.name) {
    const r = single(ch);
    if (r) parts.push(r);
    else missing.push(ch);
  }
  if (missing.length === e.name.length) return { ok: false, undefinedNames: [e.name] };
  if (missing.length) return { ok: false, undefinedNames: [...new Set(missing)] };
  return { ok: true, parts };
}

/** Variable names an expression depends on (under the current definition set). */
export function collectReferences(exprs: Expr[], ctx: ResolveContext, params: ReadonlySet<string> = new Set()): Set<string> {
  const refs = new Set<string>();
  for (const expr of exprs) {
    walkScoped(expr, (e, locals) => {
      if (e.type !== 'ident') return;
      // let-names are local: they shadow worksheet variables and are not references.
      const r = resolveIdent(e, locals.size ? { isDefined: (n) => locals.has(n) || ctx.isDefined(n) } : ctx);
      if (r.ok) {
        for (const p of r.parts) if (p.kind === 'var' && !locals.has(p.name)) refs.add(p.name);
      }
    }, params);
  }
  return refs;
}

/**
 * Every name whose definitions could change how these expressions resolve:
 * each identifier as written and, for letter runs ("wL"), each letter.
 */
export function candidateNames(exprs: Expr[]): Set<string> {
  const out = new Set<string>();
  for (const expr of exprs) {
    walkExpr(expr, (e) => {
      if (e.type !== 'ident') return;
      out.add(e.name);
      if (e.splittable && !e.roman) for (const ch of e.name) out.add(ch);
    });
  }
  return out;
}

export interface EvalContext extends ResolveContext {
  getValue(name: string): Value;
  /** The user function a name refers to here, if it is one. */
  getFunction?(name: string): UserFunction | undefined;
}

/** f(a, b) := body. Names other than the parameters resolve where f is defined. */
export interface UserFunction {
  name: string;
  params: string[];
  body: Expr;
  env: EvalContext;
  /**
   * Results of calls with scalar arguments. A function is pure, and its object is
   * replaced whenever its definition (or anything it uses) is recalculated, so the
   * cache never outlives the values it was computed from.
   */
  cache?: Map<string, Value>;
}

const MAX_CACHED_CALLS = 20000;

/** A condition: one boolean, or one per entry when a side is a vector. ∧ binds tighter than ∨ (parser). */
function evalCondition(c: Condition, ctx: EvalContext): boolean | boolean[] {
  if ('logic' in c) {
    const a = evalCondition(c.a, ctx);
    // Short-circuit for single values, as in Mathcad.
    if (typeof a === 'boolean' && ((c.logic === 'and' && !a) || (c.logic === 'or' && a))) return a;
    const b = evalCondition(c.b, ctx);
    if (typeof a === 'boolean' && typeof b === 'boolean') return c.logic === 'and' ? a && b : a || b;
    const n = typeof a === 'boolean' ? (b as boolean[]).length : a.length;
    if (typeof b !== 'boolean' && b.length !== n) throw new CalculationError('vector', `Vectors of different lengths cannot be combined (${n} and ${b.length} entries).`);
    const at = (v: boolean | boolean[], i: number) => (typeof v === 'boolean' ? v : v[i]);
    return Array.from({ length: n }, (_, i) => (c.logic === 'and' ? at(a, i) && at(b, i) : at(a, i) || at(b, i)));
  }
  const lv = evalNode(c.left, ctx);
  const rv = evalNode(c.right, ctx);
  if (!isVector(lv) && !isVector(rv)) return compareQuantities(lv, rv, c.op);
  const fast = fastCompare(lv, rv, c.op);
  if (fast) return fast;
  const r = broadcastN([lv, rv], ([x, y]) => (compareQuantities(x, y, c.op) ? 1 : 0));
  return (r as QVector).items.map((q) => q === 1);
}

/** Cache key for scalar arguments (exact value and unit); null when an argument is a vector. */
function scalarKey(args: Value[]): string | null {
  let key = '';
  for (const a of args) {
    if (isVector(a)) return null;
    key += typeof a === 'number' ? `${a};` : `${a.value}|${a.formatUnits()};`;
  }
  return key;
}

const MAX_CALL_DEPTH = 200;
let callDepth = 0;

function callUserFunction(f: UserFunction, args: Value[]): Value {
  if (args.length !== f.params.length) {
    throw new CalculationError('syntax', `${f.name} takes ${f.params.length} argument${f.params.length === 1 ? '' : 's'} (got ${args.length}).`);
  }
  if (callDepth >= MAX_CALL_DEPTH) throw new CalculationError('evaluation', `${f.name} calls itself too deeply.`);
  const locals = new Map(f.params.map((p, k) => [p, args[k]] as const));
  const scope: EvalContext = {
    isDefined: (n) => locals.has(n) || f.env.isDefined(n),
    getValue: (n) => (locals.has(n) ? locals.get(n)! : f.env.getValue(n)),
    getFunction: (n) => (locals.has(n) ? undefined : f.env.getFunction?.(n)),
  };
  const key = scalarKey(args);
  const hit = key !== null ? f.cache?.get(key) : undefined;
  if (hit !== undefined) return hit;
  callDepth++;
  try {
    const v = evalNode(f.body, scope);
    if (key !== null) {
      f.cache ??= new Map();
      if (f.cache.size < MAX_CACHED_CALLS) f.cache.set(key, v);
    }
    return v;
  } finally {
    callDepth--;
  }
}

/**
 * linterp(xs, ys, x): xs ascending or descending; outside the data it extrapolates the line through the first or
 * last two points (as Mathcad). xs that turn back use the first segment containing x (no extrapolation then).
 */
function linterp(xs: QVector, ys: QVector, x: Quantity): Quantity {
  if (xs.length !== ys.length || xs.length < 2) {
    throw new CalculationError('vector', 'linterp needs two vectors of the same length (at least 2 entries).');
  }
  if (!sameDimension(xs.items[0], x)) {
    throw new CalculationError('unit-mismatch', `linterp: x (${describeQuantity(x)}) and the x data must have the same unit.`);
  }
  const xv = xs.items.map(siValue);
  const t = siValue(x);
  const asc = xv[xv.length - 1] >= xv[0];
  // Equal neighbours are allowed, and steps back within round-off.
  const tol = 1e-9 * Math.abs(xv[xv.length - 1] - xv[0]);
  let monotonic = true;
  for (let k = 1; k < xv.length; k++) {
    if (asc ? xv[k] < xv[k - 1] - tol : xv[k] > xv[k - 1] + tol) monotonic = false;
  }
  const at = (k: number) => {
    const a = xv[k - 1];
    const b = xv[k];
    const w = b === a ? 0 : (t - a) / (b - a);
    const y0 = ys.items[k - 1];
    return addOrSubtract(y0, multiplyQ(addOrSubtract(ys.items[k], y0, '-'), w), '+');
  };
  if (!monotonic) {
    // Data that turns back (e.g. a sweep with round-off wiggles): the first segment that brackets x.
    for (let k = 1; k < xv.length; k++) {
      if (Math.min(xv[k - 1], xv[k]) <= t && t <= Math.max(xv[k - 1], xv[k])) return at(k);
    }
    throw new CalculationError('domain', 'linterp: x is outside the x data, which is not in increasing or decreasing order (no extrapolation).');
  }
  for (let k = 1; k < xv.length; k++) {
    const a = xv[k - 1];
    const b = xv[k];
    // The first segment also covers x before the data, the last one x after it.
    if ((asc && t <= b) || (!asc && t >= b) || k === xv.length - 1) {
      const w = b === a ? 0 : (t - a) / (b - a);
      const y0 = ys.items[k - 1];
      const dy = addOrSubtract(ys.items[k], y0, '-');
      return addOrSubtract(y0, multiplyQ(dy, w), '+');
    }
  }
  return ys.items[ys.length - 1];
}


// ---------------------------------------------------------------------------
// Fast path for vectors whose entries share one dimension (fibre grids, bar
// lists): SI values in a Float64Array and one unit, no per-entry Unit objects.
// Anything unusual (mixed units, °C, a zero divisor, a negative base) returns
// null and takes the general per-entry path, which also produces the errors.
// ---------------------------------------------------------------------------

interface Pk {
  si: Float64Array | number;
  unit: Unit | null;
  /** Vector length, or -1 for a scalar. */
  n: number;
}

function pk(v: Value): Pk | null {
  if (isVector(v)) {
    const p = v.pack();
    return p && { si: p.si, unit: p.unit, n: p.si.length };
  }
  if (typeof v === 'number') return { si: v, unit: null, n: -1 };
  if (isUnit(v) && v.value !== null && !isAbsoluteTemperature(v)) return { si: v.value, unit: isDimensionless(v) ? null : v, n: -1 };
  return null;
}

const pkAt = (p: Pk, i: number): number => (typeof p.si === 'number' ? p.si : p.si[i]);
const sameUnitDim = (a: Unit | null, b: Unit | null): boolean => (!a || !b ? a === b : sameDimension(a, b));

/** Unit of a product or quotient of two packed operands (value ignored); null when dimensionless. */
function productUnit(a: Unit | null, b: Unit | null, divide: boolean): Unit | null {
  let r: Quantity | null;
  if (!divide) r = !a ? b : !b ? a : (math.multiply(withSi(a, 1), withSi(b, 1)) as unknown as Quantity);
  else r = !b ? a : (math.divide(a ? withSi(a, 1) : 1, withSi(b, 1)) as unknown as Quantity);
  return r !== null && isUnit(r) && !isDimensionless(r) ? r : null;
}

function packedPair(a: Value, b: Value): [Pk, Pk, number] | null {
  if (!isVector(a) && !isVector(b)) return null;
  const pa = pk(a);
  const pb = pk(b);
  if (!pa || !pb) return null;
  if (pa.n >= 0 && pb.n >= 0 && pa.n !== pb.n) return null;
  return [pa, pb, pa.n >= 0 ? pa.n : pb.n];
}

function fastBinary(op: string, a: Value, b: Value): Value | null {
  const pair = packedPair(a, b);
  if (!pair) return null;
  const [pa, pb, n] = pair;
  const out = new Float64Array(n);
  switch (op) {
    case '+':
    case '-': {
      if (!sameUnitDim(pa.unit, pb.unit)) return null;
      const sign = op === '+' ? 1 : -1;
      for (let i = 0; i < n; i++) out[i] = pkAt(pa, i) + sign * pkAt(pb, i);
      return QVector.packed(out, pa.unit ?? pb.unit);
    }
    case '*':
      for (let i = 0; i < n; i++) out[i] = pkAt(pa, i) * pkAt(pb, i);
      return QVector.packed(out, productUnit(pa.unit, pb.unit, false));
    case '/':
      for (let i = 0; i < n; i++) {
        const d = pkAt(pb, i);
        if (d === 0) return null;
        out[i] = pkAt(pa, i) / d;
      }
      return QVector.packed(out, productUnit(pa.unit, pb.unit, true));
  }
  return null;
}

/** Packed vector raised to a dimensionless scalar power. */
function fastPow(a: Value, b: Value): Value | null {
  if (!isVector(a) || isVector(b) || !isDimensionless(b)) return null;
  const p = siValue(b);
  const pa = pk(a);
  if (!pa || Math.abs(p) > 1000 || !Number.isFinite(p)) return null;
  const si = pa.si as Float64Array;
  const out = new Float64Array(si.length);
  for (let i = 0; i < si.length; i++) {
    const x = si[i];
    if ((x < 0 && !Number.isInteger(p)) || (x === 0 && p < 0)) return null;
    out[i] = Math.pow(x, p);
  }
  const unit = pa.unit ? (math.pow(withSi(pa.unit, 1), p) as unknown as Quantity) : null;
  return QVector.packed(out, unit && isUnit(unit) && !isDimensionless(unit) ? unit : null);
}

/** Element-wise comparison of packed operands. */
function fastCompare(a: Value, b: Value, op: string): boolean[] | null {
  const pair = packedPair(a, b);
  if (!pair) return null;
  const [pa, pb, n] = pair;
  if (!sameUnitDim(pa.unit, pb.unit)) return null;
  const out: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = compareSi(pkAt(pa, i), pkAt(pb, i), op);
  return out;
}

/** if with a vector condition: pick entries from packed branches. */
function fastSelect(c: boolean[], t: Value, f: Value): Value | null {
  const pt = pk(t);
  const pf = pk(f);
  const n = c.length;
  if (!pt || !pf || (pt.n >= 0 && pt.n !== n) || (pf.n >= 0 && pf.n !== n) || !sameUnitDim(pt.unit, pf.unit)) return null;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = c[i] ? pkAt(pt, i) : pkAt(pf, i);
  return QVector.packed(out, pt.unit ?? pf.unit);
}

/** sum / min / max of one packed vector. */
function fastAggregate(fn: string, args: Value[]): Quantity | null {
  if (args.length !== 1 || !isVector(args[0]) || args[0].length === 0) return null;
  const p = args[0].pack();
  if (!p) return null;
  let r = fn === 'sum' ? 0 : p.si[0];
  for (let i = fn === 'sum' ? 0 : 1; i < p.si.length; i++) {
    const x = p.si[i];
    if (fn === 'sum') r += x;
    else if (fn === 'min' ? x < r : x > r) r = x;
  }
  return p.unit ? withSi(p.unit, r) : r;
}

/** Element-wise built-ins on one packed vector. */
function fastCall(fn: string, args: Value[]): Value | null {
  if (args.length !== 1 || !isVector(args[0])) return null;
  const p = args[0].pack();
  if (!p) return null;
  const si = p.si;
  const out = new Float64Array(si.length);
  switch (fn) {
    case 'abs':
      for (let i = 0; i < si.length; i++) out[i] = Math.abs(si[i]);
      return QVector.packed(out, p.unit);
    case 'sin':
    case 'cos':
    case 'tan': {
      // Radians: a plain number, or an angle unit (SI value in rad).
      if (p.unit && dimensionName(p.unit) !== 'Angle') return null;
      const f = fn === 'sin' ? Math.sin : fn === 'cos' ? Math.cos : Math.tan;
      for (let i = 0; i < si.length; i++) out[i] = f(si[i]);
      return QVector.packed(out, null);
    }
    case 'sqrt': {
      for (let i = 0; i < si.length; i++) {
        if (si[i] < 0) return null;
        out[i] = Math.sqrt(si[i]);
      }
      const unit = p.unit ? (math.sqrt(withSi(p.unit, 1) as never) as unknown as Quantity) : null;
      return QVector.packed(out, unit && isUnit(unit) && !isDimensionless(unit) ? unit : null);
    }
  }
  return null;
}

/** normalize() for a whole value: a packed vector is already normalised. */
function normalizeValue(v: Value): Value {
  if (isVector(v)) {
    const p = v.pack();
    if (p) return v;
  }
  return broadcast1(v, normalize);
}

/** Reject complex, NaN and infinite intermediate results with a clear message. */
function ensureFinite(v: Value): Value {
  if (isVector(v)) {
    const p = v.pack();
    if (p) {
      for (let i = 0; i < p.si.length; i++) {
        const x = p.si[i];
        if (Number.isNaN(x)) throw new CalculationError('domain', 'The result is not a real number (undefined operation such as 0·∞).');
        if (!Number.isFinite(x)) throw new CalculationError('not-finite', 'The result is too large to represent (numeric overflow).');
      }
      return v;
    }
    for (const q of v.items) ensureFiniteQ(q);
    return v;
  }
  return ensureFiniteQ(v);
}

function ensureFiniteQ(q: Quantity): Quantity {
  if (!isUnit(q) && typeof q !== 'number') {
    throw new CalculationError('domain', 'The result is not a real number.');
  }
  const v = isUnit(q) ? siValue(q) : q;
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new CalculationError('domain', 'The result is not a real number (undefined operation such as 0·∞).');
  }
  if (!Number.isFinite(v)) {
    throw new CalculationError('not-finite', 'The result is too large to represent (numeric overflow).');
  }
  return q;
}

/** "Force (kN)", "Length (m)", "a dimensionless number". */
function describeQuantity(q: Quantity): string {
  if (isDimensionless(q)) return 'a dimensionless number';
  const name = dimensionName(q);
  const unit = preferredUnit(q, 'SI');
  return unit ? `${name} (${formatUnitString(unit).text})` : name;
}

// ---------------------------------------------------------------------------
// Absolute temperatures (°C) are affine: only a few operations make sense.
// ---------------------------------------------------------------------------

const absoluteC = (kelvin: number): Quantity => math.unit(kelvin, 'K').to('degC');
const kelvinOf = (q: Quantity): number => (isUnit(q) ? q.toNumber('K') : q);

const TEMP_HINT = 'Use a temperature difference in K (e.g. T₁ + 5 K, or ΔT := T₂ − T₁).';

function temperatureError(what: string): CalculationError {
  return new CalculationError('temperature', `${what} ${TEMP_HINT}`);
}

/** A literal "20 °C": a plain number times the °C unit symbol. */
function isTemperatureLiteral(e: Expr): boolean {
  const isOffsetUnit = (x: Expr) => x.type === 'ident' && isUnitSymbol(x.name) && isAbsoluteTemperature(unitValue(x.name));
  if (isOffsetUnit(e)) return true;
  if (e.type === 'group') return isTemperatureLiteral(e.body);
  const isNumber = (x: Expr): boolean => x.type === 'num' || (x.type === 'unary' && isNumber(x.arg)) || (x.type === 'group' && isNumber(x.body));
  if (e.type === 'binary' && e.op === '*') {
    return (isOffsetUnit(e.right) && isNumber(e.left)) || (isOffsetUnit(e.left) && isNumber(e.right));
  }
  return false;
}

function requireDimensionless(q: Quantity, what: string): number {
  if (!isDimensionless(q)) {
    throw new CalculationError('unit-mismatch', `${what} must be a dimensionless number (got ${describeQuantity(q)}).`);
  }
  return isUnit(q) ? siValue(q) : q;
}

function addOrSubtract(a: Quantity, b: Quantity, op: '+' | '-'): Quantity {
  if (!sameDimension(a, b)) {
    const msg =
      op === '+'
        ? `${describeQuantity(b)} cannot be added to ${describeQuantity(a)}.`
        : `${describeQuantity(b)} cannot be subtracted from ${describeQuantity(a)}.`;
    throw new CalculationError('unit-mismatch', `Unit mismatch: ${msg}`);
  }
  const absA = isAbsoluteTemperature(a);
  const absB = isAbsoluteTemperature(b);
  if (absA || absB) {
    // °C ± K → °C;  °C − °C → K (difference);  °C + °C and K − °C are meaningless.
    if (op === '+') {
      if (absA && absB) throw temperatureError('Two absolute temperatures (°C) cannot be added.');
      return absoluteC(kelvinOf(absA ? a : b) + kelvinOf(absA ? b : a));
    }
    if (absA && absB) return math.unit(kelvinOf(a) - kelvinOf(b), 'K');
    if (absA) return absoluteC(kelvinOf(a) - kelvinOf(b));
    throw temperatureError('An absolute temperature (°C) cannot be subtracted from a temperature difference.');
  }
  if (typeof a === 'number' && typeof b === 'number') return op === '+' ? a + b : a - b;
  if (isUnit(a) && isUnit(b) && a.value !== null && b.value !== null) {
    // Fast path (vector arithmetic): same result as math.add/subtract, keeping a's units.
    const r = a.clone();
    r.value = op === '+' ? a.value + b.value : a.value - b.value;
    r.fixPrefix = false;
    return normalize(r);
  }
  const res = op === '+' ? math.add(a as never, b as never) : math.subtract(a as never, b as never);
  return normalize(res as Quantity);
}

export function evaluateExpr(expr: Expr, ctx: EvalContext): Value {
  return ensureFinite(normalizeValue(evalNode(expr, ctx)));
}

/** Every intermediate value is checked, so NaN/∞/complex never propagate. */
function evalNode(expr: Expr, ctx: EvalContext): Value {
  return ensureFinite(evalNodeRaw(expr, ctx));
}

// A packed vector never holds °C (see Vector.pack).
const hasAbsoluteTemperature = (v: Value): boolean => (isVector(v) ? !v.pack() && v.items.some(isAbsoluteTemperature) : isAbsoluteTemperature(v));
const multiplyQ = (x: Quantity, y: Quantity): Quantity => {
  if (typeof x === 'number' && typeof y === 'number') return x * y;
  // Fast path: a number scales a unit value (as math.multiply does).
  const scaled = (n: number, u: Quantity) => {
    if (!isUnit(u) || u.value === null || isAbsoluteTemperature(u)) return null;
    const r = u.clone();
    r.value = n * u.value;
    return normalize(r);
  };
  if (typeof x === 'number') return scaled(x, y) ?? normalize(math.multiply(x as never, y as never) as unknown as Quantity);
  if (typeof y === 'number') return scaled(y, x) ?? normalize(math.multiply(x as never, y as never) as unknown as Quantity);
  return normalize(math.multiply(x as never, y as never) as unknown as Quantity);
};

function evalNodeRaw(expr: Expr, ctx: EvalContext): Value {
  switch (expr.type) {
    case 'num':
      return expr.value;

    case 'ident': {
      const r = resolveIdent(expr, ctx);
      if (!r.ok) {
        throw new UndefinedNamesError(r.undefinedNames);
      }
      let acc: Value | null = null;
      for (const p of r.parts) {
        const v: Value =
          p.kind === 'var' ? ctx.getValue(p.name) : p.kind === 'unit' ? unitValue(p.symbol) : p.value;
        if (r.parts.length > 1 && hasAbsoluteTemperature(v)) throw temperatureError('An absolute temperature (°C) cannot be multiplied.');
        acc = acc === null ? v : (fastBinary('*', acc, v) ?? broadcast2(acc, v, multiplyQ));
      }
      return normalizeValue(acc as Value);
    }

    case 'group':
      return evalNode(expr.body, ctx);

    case 'unary': {
      const v = evalNode(expr.arg, ctx);
      if (expr.op === '-' && hasAbsoluteTemperature(v) && !isTemperatureLiteral(expr.arg)) {
        throw temperatureError('An absolute temperature (°C) cannot be negated.');
      }
      if (expr.op === '-' && isVector(v)) {
        const neg = fastBinary('*', -1, v);
        if (neg) return neg;
      }
      return expr.op === '-' ? broadcast1(v, (q) => (typeof q === 'number' ? -q : isAbsoluteTemperature(q) ? (math.unaryMinus(q as never) as Quantity) : multiplyQ(-1, q))) : v;
    }

    case 'binary': {
      const a = evalNode(expr.left, ctx);
      const b = evalNode(expr.right, ctx);
      if (expr.op !== '+' && expr.op !== '-' && (hasAbsoluteTemperature(a) || hasAbsoluteTemperature(b))) {
        // Only a literal "20 °C" (number × °C) is allowed; scaling an absolute temperature is meaningless.
        if (!(expr.op === '*' && isTemperatureLiteral(expr))) {
          const verb = expr.op === '*' ? 'multiplied' : expr.op === '/' ? 'divided' : 'raised to a power';
          throw temperatureError(`An absolute temperature (°C) cannot be ${verb}.`);
        }
      }
      if (expr.op !== '^') {
        const fast = fastBinary(expr.op, a, b);
        if (fast) return fast;
      }
      switch (expr.op) {
        case '+':
        case '-': {
          const op = expr.op;
          return broadcast2(a, b, (x, y) => addOrSubtract(x, y, op));
        }
        case '*':
          return broadcast2(a, b, multiplyQ);
        case '/':
          return broadcast2(a, b, (x, y) => {
            if (siValue(y) === 0) throw new CalculationError('division-by-zero', 'Division by zero: the denominator is 0.');
            if (typeof x === 'number' && typeof y === 'number') return x / y;
            if (typeof y === 'number') return multiplyQ(x, 1 / y);
            return normalize(math.divide(x as never, y as never) as Quantity);
          });
        case '^': {
          const exponent = (y: Quantity): number => {
            if (!isDimensionless(y)) {
              throw new CalculationError('unit-mismatch', `An exponent must be a dimensionless number (got ${describeQuantity(y)}).`);
            }
            return requireDimensionless(y, 'An exponent');
          };
          // "wL^2": a run that splits into factors takes the power on its last
          // factor only (w·L²), while a whole unit or variable ("mm^2") is
          // raised as one symbol.
          if (expr.left.type === 'ident' && expr.left.splittable) {
            const r = resolveIdent(expr.left, ctx);
            if (r.ok && r.parts.length > 1) {
              const values: Value[] = r.parts.map((part) =>
                part.kind === 'var' ? ctx.getValue(part.name) : part.kind === 'unit' ? unitValue(part.symbol) : part.value,
              );
              const last = values.pop()!;
              let acc: Value = broadcast2(last, b, (x, y) => powQ(x, exponent(y)));
              for (const v of values) acc = broadcast2(v, acc, multiplyQ);
              return acc;
            }
          }
          return fastPow(a, b) ?? broadcast2(a, b, (x, y) => powQ(x, exponent(y)));
        }
      }
      break;
    }

    case 'apply': {
      const f = expr.head.roman ? undefined : ctx.getFunction?.(expr.head.name);
      if (f) {
        const r = callUserFunction(f, expr.args.map((a) => evalNode(a, ctx)));
        if (!expr.pow) return r;
        return broadcast2(r, evalNode(expr.pow, ctx), (x, y) => {
          if (!isDimensionless(y)) throw new CalculationError('unit-mismatch', `An exponent must be a dimensionless number (got ${describeQuantity(y)}).`);
          return powQ(x, requireDimensionless(y, 'An exponent'));
        });
      }
      if (expr.args.length !== 1) {
        throw new CalculationError('undefined-variable', `"${expr.head.name}" is not a function (define it as ${expr.head.name}(x) := …).`);
      }
      return evalNode(applyAsProduct(expr), ctx);
    }

    case 'call': {
      if (expr.fn === 'map') return evalMap(expr.args, ctx);
      const args = expr.args.map((a) => evalNode(a, ctx));
      const fn = expr.fn;
      if ((steelFunctionNames as readonly string[]).includes(fn)) return evalSteelFunction(fn as SteelFunctionName, args);
      if (fn === 'stack') {
        return new QVector(flatten(args));
      }
      if (fn === 'linterp') {
        if (args.length !== 3) throw new CalculationError('syntax', 'linterp takes three arguments: linterp(xs, ys, x).');
        const [xs, ys, x] = args;
        if (!isVector(xs) || !isVector(ys)) throw new CalculationError('vector', 'linterp: the x and y data must be vectors.');
        return broadcast1(x, (q) => linterp(xs, ys, q));
      }
      // Aggregates take every entry of every argument.
      if (fn === 'min' || fn === 'max' || fn === 'sum') {
        const fast = fastAggregate(fn, args);
        if (fast !== null) return fast;
      }
      if (fn === 'min' || fn === 'max') return evalCall(fn, flatten(args));
      if (fn === 'sum') return sumOf(flatten(args));
      if (fn === 'seq') {
        if (args.length < 2 || args.length > 3) throw new CalculationError('syntax', 'seq takes 2 or 3 arguments: seq(start, end) or seq(start, end, step).');
        const [a, b, d] = args.map((v, k) => requireScalar(v, ['The start of seq', 'The end of seq', 'The step of seq'][k]));
        return makeRange(a, b, d === undefined ? null : addOrSubtract(a, d, '+'));
      }
      if (fn === 'len') {
        if (args.length !== 1) throw new CalculationError('syntax', 'len takes exactly one argument.');
        return isVector(args[0]) ? args[0].length : 1;
      }
      return fastCall(fn, args) ?? broadcastN(args, (xs) => evalCall(fn, xs));
    }

    case 'if': {
      // Same comparison rules as a check region; only the chosen branch is
      // evaluated, so the other may be undefined for these inputs (e.g. √ of a negative).
      const c = evalCondition(expr.cond, ctx);
      if (typeof c === 'boolean') return evalNode(c ? expr.then : expr.else, ctx);
      // Vector condition: decided entry by entry. Both branches are evaluated as
      // vectors; a branch that fails as a whole (e.g. √ of a negative entry) is
      // evaluated again only for the entries that choose it.
      const n = c.length;
      const attempt = (e: Expr): Value | null => {
        try {
          return evalNode(e, ctx);
        } catch (err) {
          if (err instanceof CalculationError && (err.code === 'undefined-variable' || err.code === 'syntax')) throw err;
          return null;
        }
      };
      const t = attempt(expr.then);
      const f = attempt(expr.else);
      if (t !== null && f !== null) {
        const fast = fastSelect(c, t, f);
        if (fast) return fast;
        const mask = new QVector(c.map((b) => (b ? 1 : 0)));
        return broadcastN([mask, t, f], ([m, x, y]) => (m ? x : y));
      }
      const entryCtx = (i: number): EvalContext => {
        const sub = Object.create(ctx) as EvalContext;
        sub.getValue = (name: string) => {
          const v = ctx.getValue(name);
          return isVector(v) && v.length === n ? v.items[i] : v;
        };
        return sub;
      };
      const items: Quantity[] = [];
      for (let i = 0; i < n; i++) {
        const whole = c[i] ? t : f;
        if (whole !== null) {
          if (isVector(whole) && whole.length !== n) throw new CalculationError('vector', `Vectors of different lengths in if (${n} and ${whole.length} entries).`);
          items.push(isVector(whole) ? whole.items[i] : whole);
        } else {
          items.push(requireScalar(evalNode(c[i] ? expr.then : expr.else, entryCtx(i)), 'Each entry of if'));
        }
      }
      return new QVector(items);
    }

    case 'range':
      return evalRange(expr, ctx);

    case 'let': {
      const locals = new Map<string, Value>();
      const scope: EvalContext = {
        isDefined: (n) => locals.has(n) || ctx.isDefined(n),
        getValue: (n) => (locals.has(n) ? locals.get(n)! : ctx.getValue(n)),
      };
      for (const b of expr.bindings) locals.set(b.name, evalNode(b.value, scope));
      return evalNode(expr.body, scope);
    }
  }
  throw new CalculationError('evaluation', 'Unsupported expression.');
}

/** The non-function reading of name(arg): name × (arg), exactly as before calls existed. */
export function applyAsProduct(expr: Extract<Expr, { type: 'apply' }>): Expr {
  const bracket: Expr = { type: 'group', body: expr.args[0], visible: true };
  const right: Expr = expr.pow ? { type: 'binary', op: '^', left: bracket, right: expr.pow } : bracket;
  return { type: 'binary', op: '*', implicit: true, left: expr.head, right };
}

/** map(f, v…): f called once per entry; scalar arguments repeat, vectors must share a length. */
function evalMap(argExprs: Expr[], ctx: EvalContext): Value {
  const [fExpr, ...rest] = argExprs;
  if (!fExpr || rest.length === 0) throw new CalculationError('syntax', 'map takes a function and at least one argument: map(f, v).');
  const f = fExpr.type === 'ident' ? ctx.getFunction?.(fExpr.name) : undefined;
  if (!f) throw new CalculationError('syntax', 'The first argument of map must be the name of a user function, e.g. map(f, x).');
  const args = rest.map((a) => evalNode(a, ctx));
  const lengths = [...new Set(args.filter(isVector).map((v) => v.length))];
  if (lengths.length > 1) throw new CalculationError('vector', `map: the vectors have different lengths (${lengths.join(', ')}).`);
  if (lengths.length === 0) return callUserFunction(f, args);
  const out: Quantity[] = [];
  for (let k = 0; k < lengths[0]; k++) {
    const r = callUserFunction(f, args.map((v) => (isVector(v) ? v.items[k] : v)));
    out.push(requireScalar(r, `Each result of map(${f.name}, …)`));
  }
  return new QVector(out);
}

function sumOf(items: Quantity[]): Quantity {
  if (items.length === 0) return 0;
  return items.slice(1).reduce((acc, q) => addOrSubtract(acc, q, '+'), items[0]);
}

/** a..b (step 1) or a, a+Δ..b: the entries from a towards b, b included when reached. */
function evalRange(expr: Extract<Expr, { type: 'range' }>, ctx: EvalContext): QVector {
  const start = requireScalar(evalNode(expr.start, ctx), 'The start of a range');
  const end = requireScalar(evalNode(expr.end, ctx), 'The end of a range');
  const next = expr.next ? requireScalar(evalNode(expr.next, ctx), 'The second value of a range') : null;
  return makeRange(start, end, next);
}

/** Entries from start towards end; the step is next − start, or ±1 for plain numbers. */
function makeRange(start: Quantity, end: Quantity, next: Quantity | null): QVector {
  if (!sameDimension(start, end)) {
    throw new CalculationError('unit-mismatch', `Unit mismatch: a range from ${describeQuantity(start)} to ${describeQuantity(end)}.`);
  }
  let step: Quantity;
  if (next !== null) {
    step = addOrSubtract(next, start, '-');
  } else {
    if (!isDimensionless(start)) {
      throw new CalculationError('syntax', 'A range with units needs a step: write a, a+Δ..b (e.g. 0 m, 0.5 m..3 m) or seq(a, b, Δ).');
    }
    step = siValue(end) >= siValue(start) ? 1 : -1;
  }
  const s0 = siValue(start);
  const ds = siValue(step);
  const span = siValue(end) - s0;
  if (ds === 0) throw new CalculationError('domain', 'The step of a range cannot be zero.');
  if (span !== 0 && Math.sign(span) !== Math.sign(ds)) {
    throw new CalculationError('domain', 'The step of a range must move from the start towards the end.');
  }
  // Tolerance so that 0, 0.1..1 includes 1 despite floating-point rounding.
  const count = Math.floor(span / ds + 1e-9) + 1;
  if (count > 10_000) throw new CalculationError('limit-exceeded', `A range may have at most 10000 entries (got ${count}).`);
  const items: Quantity[] = [];
  for (let k = 0; k < count; k++) items.push(k === 0 ? start : addOrSubtract(start, multiplyQ(step, k), '+'));
  return new QVector(items);
}

function powQ(a: Quantity, p: number): Quantity {
  if (Math.abs(p) > 1000) throw new CalculationError('limit-exceeded', 'Exponent is too large.');
  if (!Number.isFinite(p)) throw new CalculationError('not-finite', 'Invalid exponent.');
  if (siValue(a) < 0 && !Number.isInteger(p)) {
    throw new CalculationError('domain', 'A negative value cannot be raised to a non-integer power (the result is not a real number). For odd roots use ⁿ√.');
  }
  if (siValue(a) === 0 && p < 0) throw new CalculationError('division-by-zero', 'Division by zero: 0 raised to a negative power.');
  if (isUnit(a)) return normalize(math.pow(a, p) as Quantity);
  return math.pow(a, p) as number;
}

function angleArgument(q: Quantity, fn: string): Quantity {
  // Angle units (°, rad) are accepted directly; a plain number is in radians.
  if (isUnit(q) && dimensionName(q) === 'Angle') return q;
  if (!isDimensionless(q)) {
    throw new CalculationError('unit-mismatch', `The argument of ${fn} must be an angle (°, rad) or a dimensionless number in radians (got ${describeQuantity(q)}).`);
  }
  return q;
}

function evalCall(fn: string, args: Quantity[]): Quantity {
  const [x] = args;
  if (args.some(isAbsoluteTemperature) && fn !== 'min' && fn !== 'max') {
    throw temperatureError(`${fn} cannot be applied to an absolute temperature (°C).`);
  }
  switch (fn) {
    case 'sin':
      return math.sin(angleArgument(x, fn) as never) as number;
    case 'cos':
      return math.cos(angleArgument(x, fn) as never) as number;
    case 'tan':
      return math.tan(angleArgument(x, fn) as never) as number;
    case 'asin':
    case 'acos':
    case 'atan': {
      const v = requireDimensionless(x, `The argument of ${fn}`);
      if (fn !== 'atan' && Math.abs(v) > 1) {
        throw new CalculationError('domain', `${fn} is only defined for values between −1 and 1 (got ${v}).`);
      }
      const rad = fn === 'asin' ? Math.asin(v) : fn === 'acos' ? Math.acos(v) : Math.atan(v);
      return math.unit(rad, 'rad');
    }
    case 'angle': {
      const [xq, y] = args;
      if (!sameDimension(y, xq)) {
        throw new CalculationError('unit-mismatch', `angle: x (${describeQuantity(xq)}) and y (${describeQuantity(y)}) must have the same unit.`);
      }
      if (siValue(y) === 0 && siValue(xq) === 0) throw new CalculationError('domain', 'angle(0, 0) has no direction.');
      const a = Math.atan2(siValue(y), siValue(xq));
      return math.unit(a < 0 ? a + 2 * Math.PI : a, 'rad');
    }
    case 'sinh':
      return Math.sinh(requireDimensionless(x, 'The argument of sinh'));
    case 'cosh':
      return Math.cosh(requireDimensionless(x, 'The argument of cosh'));
    case 'tanh':
      return Math.tanh(requireDimensionless(x, 'The argument of tanh'));
    case 'ln': {
      const v = requireDimensionless(x, 'The argument of ln');
      if (v <= 0) throw new CalculationError('domain', 'ln is only defined for positive values.');
      return Math.log(v);
    }
    case 'log': {
      const v = requireDimensionless(x, 'The argument of log');
      if (v <= 0) throw new CalculationError('domain', 'log is only defined for positive values.');
      return Math.log10(v);
    }
    case 'exp':
      return Math.exp(requireDimensionless(x, 'The argument of exp'));
    case 'sqrt':
      if (siValue(x) < 0) throw new CalculationError('domain', 'Square root of a negative value (the result is not a real number).');
      return normalize(math.sqrt(x as never) as Quantity);
    case 'nthRoot': {
      const n = requireDimensionless(args[1], 'The root index');
      if (n === 0) throw new CalculationError('division-by-zero', 'Root index cannot be zero.');
      if (siValue(x) < 0 && Math.abs(n % 2) !== 1) throw new CalculationError('domain', 'Even root of a negative value (the result is not a real number).');
      if (isUnit(x)) return normalize(math.pow(x, 1 / n) as Quantity);
      return Math.sign(x) * Math.pow(Math.abs(x), 1 / n);
    }
    case 'abs':
      return math.abs(x as never) as Quantity;
    case 'floor':
    case 'ceil': {
      const v = requireDimensionless(x, `The argument of ${fn}`);
      // Round-off such as 2.9999999999 is taken as 3.
      const r = Math.round(v);
      const n = Math.abs(v - r) < 1e-9 * Math.max(1, Math.abs(v)) ? r : fn === 'floor' ? Math.floor(v) : Math.ceil(v);
      return n;
    }
    case 'min':
    case 'max': {
      const first = args[0];
      for (const a of args) {
        if (!sameDimension(a, first)) {
          throw new CalculationError('unit-mismatch', `Unit mismatch: ${fn} arguments must have the same dimension (${describeQuantity(first)} vs ${describeQuantity(a)}).`);
        }
      }
      return args.reduce((best, a) =>
        fn === 'min' ? (siValue(a) < siValue(best) ? a : best) : siValue(a) > siValue(best) ? a : best,
      );
    }
  }
  throw new CalculationError('evaluation', `Unsupported function ${fn}.`);
}

/** Compare two quantities for a check region. */
export function compareQuantities(
  a: Quantity,
  b: Quantity,
  op: string,
  policies: { check?: ComparisonPolicy; equality?: ComparisonPolicy } = {},
): boolean {
  if (!sameDimension(a, b)) {
    throw new CalculationError(
      'unit-mismatch',
      `Unit mismatch: cannot compare ${describeQuantity(a)} with ${describeQuantity(b)}.`,
    );
  }
  // Full precision, SI base units; see ComparisonPolicy.
  return compareSi(siValue(a), siValue(b), op, policies);
}

function compareSi(x: number, y: number, op: string, policies: { check?: ComparisonPolicy; equality?: ComparisonPolicy } = {}): boolean {
  const check = policies.check ?? CHECK_POLICY;
  const equality = policies.equality ?? EQUALITY_POLICY;
  // A check is only relaxed if a caller explicitly passes an approximate policy.
  const near = check.mode === 'approximate' && withinTolerance(x, y, check);
  switch (op) {
    case '<':
      return x < y && !near;
    case '<=':
      return x <= y || near;
    case '>':
      return x > y && !near;
    case '>=':
      return x >= y || near;
    case '==':
      return withinTolerance(x, y, equality);
    case '!=':
      return !withinTolerance(x, y, equality);
  }
  return false;
}
