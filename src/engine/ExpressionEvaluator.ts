/**
 * Symbol resolution and numeric evaluation of the expression tree.
 *
 * Evaluation walks the JSON tree and calls mathjs functions directly on
 * numbers and Unit objects – there is no string evaluation, no property
 * access and no user-defined functions, so untrusted input can only ever
 * perform bounded arithmetic.
 */
import { CalculationError } from './CalculationErrors';
export { isAbsoluteTemperature } from './UnitSystem';
import type { Expr } from './ExpressionTypes';
import { walkExpr } from './ExpressionTypes';
import {
  dimensionKey,
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
export interface ComparisonPolicy {
  mode: 'strict' | 'approximate';
  relativeTolerance?: number;
  absoluteTolerance?: number;
}

/** Engineering acceptance checks (≤ < ≥ >). */
export const CHECK_POLICY: ComparisonPolicy = { mode: 'strict' };
/** Numerical equality (= ≠): 12 significant digits. */
export const EQUALITY_POLICY: ComparisonPolicy = { mode: 'approximate', relativeTolerance: 1e-12, absoluteTolerance: 0 };

/** |x − y| within the policy's tolerance (strict: exactly equal). */
export function withinTolerance(x: number, y: number, policy: ComparisonPolicy): boolean {
  if (policy.mode === 'strict') return x === y;
  const tol = Math.max(policy.absoluteTolerance ?? 0, (policy.relativeTolerance ?? 0) * Math.max(Math.abs(x), Math.abs(y)));
  return Math.abs(x - y) <= tol;
}

export type Resolved =
  | { kind: 'var'; name: string }
  | { kind: 'unit'; symbol: string }
  | { kind: 'const'; name: string; value: Quantity };

export type IdentExpr = Extract<Expr, { type: 'ident' }>;

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
export function collectReferences(exprs: Expr[], ctx: ResolveContext): Set<string> {
  const refs = new Set<string>();
  for (const expr of exprs) {
    walkExpr(expr, (e) => {
      if (e.type !== 'ident') return;
      const r = resolveIdent(e, ctx);
      if (r.ok) {
        for (const p of r.parts) if (p.kind === 'var') refs.add(p.name);
      }
    });
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
  getValue(name: string): Quantity;
}

/** Reject complex, NaN and infinite intermediate results with a clear message. */
function ensureFinite(q: Quantity): Quantity {
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
export function describeQuantity(q: Quantity): string {
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
  if (dimensionKey(a) !== dimensionKey(b)) {
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
  const res = op === '+' ? math.add(a as never, b as never) : math.subtract(a as never, b as never);
  return normalize(res as Quantity);
}

export function evaluateExpr(expr: Expr, ctx: EvalContext): Quantity {
  return ensureFinite(normalize(evalNode(expr, ctx)));
}

/** Every intermediate value is checked, so NaN/∞/complex never propagate. */
function evalNode(expr: Expr, ctx: EvalContext): Quantity {
  return ensureFinite(evalNodeRaw(expr, ctx));
}

function evalNodeRaw(expr: Expr, ctx: EvalContext): Quantity {
  switch (expr.type) {
    case 'num':
      return expr.value;

    case 'ident': {
      const r = resolveIdent(expr, ctx);
      if (!r.ok) {
        throw new UndefinedNamesError(r.undefinedNames);
      }
      let acc: Quantity | null = null;
      for (const p of r.parts) {
        const v: Quantity =
          p.kind === 'var' ? ctx.getValue(p.name) : p.kind === 'unit' ? unitValue(p.symbol) : p.value;
        if (r.parts.length > 1 && isAbsoluteTemperature(v)) throw temperatureError('An absolute temperature (°C) cannot be multiplied.');
        acc = acc === null ? v : (math.multiply(acc as never, v as never) as unknown as Quantity);
      }
      return normalize(acc as Quantity);
    }

    case 'group':
      return evalNode(expr.body, ctx);

    case 'unary': {
      const v = evalNode(expr.arg, ctx);
      if (expr.op === '-' && isAbsoluteTemperature(v) && !isTemperatureLiteral(expr.arg)) {
        throw temperatureError('An absolute temperature (°C) cannot be negated.');
      }
      return expr.op === '-' ? (math.unaryMinus(v as never) as Quantity) : v;
    }

    case 'binary': {
      const a = evalNode(expr.left, ctx);
      const b = evalNode(expr.right, ctx);
      if (expr.op !== '+' && expr.op !== '-' && (isAbsoluteTemperature(a) || isAbsoluteTemperature(b))) {
        // Only a literal "20 °C" (number × °C) is allowed; scaling an absolute temperature is meaningless.
        if (!(expr.op === '*' && isTemperatureLiteral(expr))) {
          const verb = expr.op === '*' ? 'multiplied' : expr.op === '/' ? 'divided' : 'raised to a power';
          throw temperatureError(`An absolute temperature (°C) cannot be ${verb}.`);
        }
      }
      switch (expr.op) {
        case '+':
        case '-':
          return addOrSubtract(a, b, expr.op);
        case '*':
          return normalize(math.multiply(a as never, b as never) as unknown as Quantity);
        case '/':
          if (siValue(b) === 0) throw new CalculationError('division-by-zero', 'Division by zero: the denominator is 0.');
          return normalize(math.divide(a as never, b as never) as Quantity);
        case '^': {
          if (!isDimensionless(b)) {
            throw new CalculationError('unit-mismatch', `An exponent must be a dimensionless number (got ${describeQuantity(b)}).`);
          }
          const p = requireDimensionless(b, 'An exponent');
          // "wL^2": a run that splits into factors takes the power on its last
          // factor only (w·L²), while a whole unit or variable ("mm^2") is
          // raised as one symbol.
          if (expr.left.type === 'ident' && expr.left.splittable) {
            const r = resolveIdent(expr.left, ctx);
            if (r.ok && r.parts.length > 1) {
              const values = r.parts.map((part) =>
                part.kind === 'var' ? ctx.getValue(part.name) : part.kind === 'unit' ? unitValue(part.symbol) : part.value,
              );
              const last = values.pop()!;
              let acc: Quantity = powQ(last, p);
              for (const v of values) acc = math.multiply(v as never, acc as never) as unknown as Quantity;
              return normalize(acc);
            }
          }
          return powQ(a, p);
        }
      }
      break;
    }

    case 'call':
      return evalCall(expr.fn, expr.args.map((a) => evalNode(a, ctx)));
  }
  throw new CalculationError('evaluation', 'Unsupported expression.');
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
    case 'min':
    case 'max': {
      const first = args[0];
      for (const a of args) {
        if (dimensionKey(a) !== dimensionKey(first)) {
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
  if (dimensionKey(a) !== dimensionKey(b)) {
    throw new CalculationError(
      'unit-mismatch',
      `Unit mismatch: cannot compare ${describeQuantity(a)} with ${describeQuantity(b)}.`,
    );
  }
  // Full precision, SI base units; see ComparisonPolicy.
  const x = siValue(a);
  const y = siValue(b);
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
