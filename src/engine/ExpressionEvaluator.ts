/**
 * Symbol resolution and numeric evaluation of the expression tree.
 *
 * Evaluation walks the JSON tree and calls mathjs functions directly on
 * numbers and Unit objects – there is no string evaluation, no property
 * access and no user-defined functions, so untrusted input can only ever
 * perform bounded arithmetic.
 */
import { CalculationError } from './CalculationErrors';
import type { Expr } from './ExpressionTypes';
import { walkExpr } from './ExpressionTypes';
import {
  dimensionKey,
  dimensionName,
  isDimensionless,
  isUnit,
  isUnitSymbol,
  math,
  normalize,
  siValue,
  unitValue,
  type Quantity,
} from './UnitSystem';

export type Resolved =
  | { kind: 'var'; name: string }
  | { kind: 'unit'; symbol: string }
  | { kind: 'const'; name: string; value: number };

export type IdentExpr = Extract<Expr, { type: 'ident' }>;

export interface ResolveContext {
  isDefined(name: string): boolean;
}

const CONSTANTS: Record<string, number> = { 'π': Math.PI };

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
    if (name in CONSTANTS) return { kind: 'const', name, value: CONSTANTS[name] };
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

export interface EvalContext extends ResolveContext {
  getValue(name: string): Quantity;
}

function ensureFinite(q: Quantity): Quantity {
  const v = isUnit(q) ? siValue(q) : q;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new CalculationError('not-finite', 'The result is not a finite number.');
  }
  return q;
}

function requireDimensionless(q: Quantity, what: string): number {
  if (!isDimensionless(q)) {
    throw new CalculationError('unit-mismatch', `${what} must be dimensionless (got ${dimensionName(q)}).`);
  }
  return isUnit(q) ? siValue(q) : q;
}

function addOrSubtract(a: Quantity, b: Quantity, op: '+' | '-'): Quantity {
  if (dimensionKey(a) !== dimensionKey(b)) {
    const msg =
      op === '+'
        ? `${dimensionName(a)} cannot be added to ${dimensionName(b)}.`
        : `${dimensionName(b)} cannot be subtracted from ${dimensionName(a)}.`;
    throw new CalculationError('unit-mismatch', `Unit mismatch: ${msg}`);
  }
  const res = op === '+' ? math.add(a as never, b as never) : math.subtract(a as never, b as never);
  return normalize(res as Quantity);
}

export function evaluateExpr(expr: Expr, ctx: EvalContext): Quantity {
  return ensureFinite(normalize(evalNode(expr, ctx)));
}

function evalNode(expr: Expr, ctx: EvalContext): Quantity {
  switch (expr.type) {
    case 'num':
      return expr.value;

    case 'ident': {
      const r = resolveIdent(expr, ctx);
      if (!r.ok) {
        throw new CalculationError(
          'undefined-variable',
          `Undefined variable${r.undefinedNames.length > 1 ? 's' : ''}: ${r.undefinedNames.join(', ')}`,
        );
      }
      let acc: Quantity | null = null;
      for (const p of r.parts) {
        const v: Quantity =
          p.kind === 'var' ? ctx.getValue(p.name) : p.kind === 'unit' ? unitValue(p.symbol) : p.value;
        acc = acc === null ? v : (math.multiply(acc as never, v as never) as unknown as Quantity);
      }
      return normalize(acc as Quantity);
    }

    case 'group':
      return evalNode(expr.body, ctx);

    case 'unary': {
      const v = evalNode(expr.arg, ctx);
      return expr.op === '-' ? (math.unaryMinus(v as never) as Quantity) : v;
    }

    case 'binary': {
      const a = evalNode(expr.left, ctx);
      const b = evalNode(expr.right, ctx);
      switch (expr.op) {
        case '+':
        case '-':
          return addOrSubtract(a, b, expr.op);
        case '*':
          return normalize(math.multiply(a as never, b as never) as unknown as Quantity);
        case '/':
          if (siValue(b) === 0) throw new CalculationError('division-by-zero', 'Division by zero.');
          return normalize(math.divide(a as never, b as never) as Quantity);
        case '^': {
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
  if (isUnit(a)) return normalize(math.pow(a, p) as Quantity);
  return math.pow(a, p) as number;
}

function angleArgument(q: Quantity, fn: string): Quantity {
  // Angle units are accepted directly; plain numbers are radians.
  if (isUnit(q) && dimensionName(q) === 'Angle') return q;
  requireDimensionless(q, `The argument of ${fn}`);
  return q;
}

function evalCall(fn: string, args: Quantity[]): Quantity {
  const [x] = args;
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
      if (v <= 0) throw new CalculationError('not-finite', 'ln is only defined for positive values.');
      return Math.log(v);
    }
    case 'log': {
      const v = requireDimensionless(x, 'The argument of log');
      if (v <= 0) throw new CalculationError('not-finite', 'log is only defined for positive values.');
      return Math.log10(v);
    }
    case 'exp':
      return Math.exp(requireDimensionless(x, 'The argument of exp'));
    case 'sqrt':
      if (siValue(x) < 0) throw new CalculationError('not-finite', 'Square root of a negative value.');
      return normalize(math.sqrt(x as never) as Quantity);
    case 'nthRoot': {
      const n = requireDimensionless(args[1], 'The root index');
      if (n === 0) throw new CalculationError('division-by-zero', 'Root index cannot be zero.');
      if (siValue(x) < 0 && n % 2 !== 1) throw new CalculationError('not-finite', 'Even root of a negative value.');
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
          throw new CalculationError('unit-mismatch', `Unit mismatch: ${fn} arguments must have the same dimension.`);
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
export function compareQuantities(a: Quantity, b: Quantity, op: string): boolean {
  if (dimensionKey(a) !== dimensionKey(b)) {
    throw new CalculationError(
      'unit-mismatch',
      `Unit mismatch: cannot compare ${dimensionName(a)} with ${dimensionName(b)}.`,
    );
  }
  const x = siValue(a);
  const y = siValue(b);
  const eps = 1e-12 * Math.max(Math.abs(x), Math.abs(y), 1);
  switch (op) {
    case '<':
      return x < y - eps;
    case '<=':
      return x <= y + eps;
    case '>':
      return x > y + eps;
    case '>=':
      return x >= y - eps;
    case '==':
      return Math.abs(x - y) <= eps;
    case '!=':
      return Math.abs(x - y) > eps;
  }
  return false;
}
