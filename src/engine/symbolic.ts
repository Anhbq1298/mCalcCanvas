/** Small bounded real-algebra simplifier. It transforms our AST, never executable strings. */
import { CalculationError } from './CalculationErrors';
import { walkExpr, walkScoped, type Expr } from './ExpressionTypes';

const num = (value: number): Expr => ({ type: 'num', value, raw: String(value) });
const binary = (op: '+' | '-' | '*' | '/' | '^', left: Expr, right: Expr): Expr => ({ type: 'binary', op, left, right });
const call = (fn: 'sin' | 'cos' | 'ln' | 'sqrt' | 'exp', arg: Expr): Expr => ({ type: 'call', fn, args: [arg] });
const is = (e: Expr, n: number) => e.type === 'num' && e.value === n;
const same = (a: Expr, b: Expr) => JSON.stringify(a) === JSON.stringify(b);
const total = (e: Expr): boolean => e.type === 'num' || e.type === 'ident' || e.type === 'group' && total(e.body) || e.type === 'unary' && total(e.arg) || e.type === 'binary' && (['+', '-', '*'].includes(e.op) && total(e.left) && total(e.right) || e.op === '^' && e.right.type === 'num' && Number.isInteger(e.right.value) && e.right.value >= 0 && total(e.left));

export function substituteSymbol(expr: Expr, name: string, value: Expr): Expr {
  switch (expr.type) {
    case 'ident': {
      if (expr.name === name) return value;
      if (expr.splittable && name.length === 1 && expr.name.includes(name)) return [...expr.name].map(ch => ch === name ? value : { type: 'ident', name: ch, roman: false, splittable: false } as Expr).reduce((a, b) => binary('*', a, b));
      return expr;
    }
    case 'binary': case 'compare': return { ...expr, left: substituteSymbol(expr.left, name, value), right: substituteSymbol(expr.right, name, value) };
    case 'logic': return { ...expr, left: substituteSymbol(expr.left, name, value), right: expr.right && substituteSymbol(expr.right, name, value) };
    case 'group': case 'vectorize': return { ...expr, body: substituteSymbol(expr.body, name, value) };
    case 'unary': return { ...expr, arg: substituteSymbol(expr.arg, name, value) };
    case 'call': return { ...expr, args: expr.args.map(e => substituteSymbol(e, name, value)) };
    case 'apply': {
      const args = expr.args.map(e => substituteSymbol(e, name, value)), pow = expr.pow && substituteSymbol(expr.pow, name, value);
      if (expr.head.name === name) {
        if (value.type === 'ident') return { ...expr, head: value, args, pow };
        if (args.length === 1) return binary('*', value, pow ? binary('^', args[0], pow) : args[0]);
      }
      return { ...expr, args, pow };
    }
    case 'matrix': return { ...expr, rows: expr.rows.map(r => r.map(e => substituteSymbol(e, name, value))) };
    case 'calculus': {
      if (expr.variables.includes(name)) return { ...expr, args: expr.args.map(e => substituteSymbol(e, name, value)) };
      let body = expr.body;
      const variables = expr.variables.map(variable => {
        if (!freeNames(value).has(variable)) return variable;
        const fresh = freshName(variable, expr, value);
        body = substituteSymbol(body, variable, { type: 'ident', name: fresh, roman: false, splittable: false });
        return fresh;
      });
      return { ...expr, variables, body: substituteSymbol(body, name, value), args: expr.args.map(e => substituteSymbol(e, name, value)) };
    }
    case 'range': return { ...expr, start: substituteSymbol(expr.start, name, value), next: expr.next && substituteSymbol(expr.next, name, value), end: substituteSymbol(expr.end, name, value) };
    case 'let': {
      if (!expr.bindings.length) return substituteSymbol(expr.body, name, value);
      const first = expr.bindings[0];
      let binding = first.name;
      let tail: Expr = expr.bindings.length === 1 ? expr.body : { ...expr, bindings: expr.bindings.slice(1) };
      if (binding !== name && freeNames(value).has(binding)) {
        const fresh = freshName(binding, expr, value);
        tail = substituteSymbol(tail, binding, { type: 'ident', name: fresh, roman: false, splittable: false });
        binding = fresh;
      }
      if (first.name !== name) tail = substituteSymbol(tail, name, value);
      const bindings = [{ name: binding, value: substituteSymbol(first.value, name, value) }];
      return tail.type === 'let' ? { ...tail, bindings: [...bindings, ...tail.bindings] } : { type: 'let', bindings, body: tail };
    }
    case 'if': return expr; // Piecewise differentiation requires branch/domain analysis.
    case 'num': return expr;
  }
}

function freeNames(expr: Expr): Set<string> {
  const names = new Set<string>();
  walkScoped(expr, (e, locals) => { if (e.type === 'ident' && !locals.has(e.name)) names.add(e.name); });
  return names;
}
function freshName(base: string, ...expressions: Expr[]): string {
  const names = new Set<string>();
  expressions.forEach(expr => walkExpr(expr, e => { if (e.type === 'ident') names.add(e.name); if (e.type === 'calculus') e.variables.forEach(n => names.add(n)); if (e.type === 'let') e.bindings.forEach(b => names.add(b.name)); }));
  let i = 1;
  while (names.has(`${base}_local${i}`)) i++;
  return `${base}_local${i}`;
}

function derivative(e: Expr, name: string): Expr {
  const d = (x: Expr) => derivative(x, name);
  if (e.type === 'num') return num(0);
  if (e.type === 'ident') return num(e.name === name ? 1 : 0);
  if (e.type === 'group') return d(e.body);
  if (e.type === 'unary') return { ...e, arg: d(e.arg) };
  if (e.type === 'binary') {
    const a = e.left, b = e.right;
    if (e.op === '+' || e.op === '-') return binary(e.op, d(a), d(b));
    if (e.op === '*') return binary('+', binary('*', d(a), b), binary('*', a, d(b)));
    if (e.op === '/') return binary('/', binary('-', binary('*', d(a), b), binary('*', a, d(b))), binary('^', b, num(2)));
    if (b.type === 'num') return binary('*', binary('*', b, binary('^', a, num(b.value - 1))), d(a));
    return binary('*', e, binary('+', binary('*', d(b), call('ln', a)), binary('*', b, binary('/', d(a), a))));
  }
  if (e.type === 'call' && e.args.length === 1) {
    const a = e.args[0], da = d(a);
    if (e.fn === 'sin') return binary('*', call('cos', a), da);
    if (e.fn === 'cos') return binary('*', { type: 'unary', op: '-', arg: call('sin', a) }, da);
    if (e.fn === 'tan') return binary('/', da, binary('^', call('cos', a), num(2)));
    if (e.fn === 'exp') return binary('*', e, da);
    if (e.fn === 'ln') return binary('/', da, a);
    if (e.fn === 'log') return binary('/', da, binary('*', a, call('ln', num(10))));
    if (e.fn === 'sqrt') return binary('/', da, binary('*', num(2), e));
    if (e.fn === 'asin' || e.fn === 'acos') return binary('/', e.fn === 'acos' ? { type: 'unary', op: '-', arg: da } : da, call('sqrt', binary('-', num(1), binary('^', a, num(2)))));
    if (e.fn === 'atan') return binary('/', da, binary('+', num(1), binary('^', a, num(2))));
    if (e.fn === 'abs') return binary('*', binary('/', a, e), da);
  }
  throw new CalculationError('syntax', 'Symbolic differentiation supports real arithmetic and elementary sin/cos/tan, inverse trig, exp, log, sqrt and abs expressions.');
}

type Rational = { n: bigint; d: bigint };
const gcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; while (b) { const t = a % b; a = b; b = t; } return a; };
function rational(e: Expr): Rational | null {
  if (e.type === 'binary' && e.op === '/' && e.left.type === 'num' && e.right.type === 'num' && Number.isInteger(e.left.value) && Number.isInteger(e.right.value)) return { n: BigInt(e.left.raw), d: BigInt(e.right.raw) };
  if (e.type !== 'num' || !/^-?\d+(\.\d+)?$/.test(e.raw) || e.raw.length > 310) return null;
  const decimals = e.raw.split('.')[1]?.length ?? 0;
  return { n: BigInt(e.raw.replace('.', '')), d: 10n ** BigInt(decimals) };
}
function fraction(n: bigint, d: bigint): Expr {
  if (d === 0n) throw new CalculationError('division-by-zero', 'Symbolic division by zero.');
  if (d < 0n) { n = -n; d = -d; }
  const divisor = gcd(n, d); n /= divisor; d /= divisor;
  if ((n < 0n ? -n : n).toString().length > 307 || d.toString().length > 307) throw new CalculationError('limit-exceeded', 'Symbolic integers are limited to 307 digits.');
  const integer = (x: bigint): Expr => ({ type: 'num', value: Number(x), raw: String(x) });
  return d === 1n ? integer(n) : { type: 'binary', op: '/', left: integer(n), right: integer(d), frac: true };
}

export function simplifySymbolic(expr: Expr, expand?: (name: string, args: Expr[]) => Expr | null): Expr {
  let budget = 10_000;
  const simplify = (e: Expr, depth = 0): Expr => {
    if (--budget < 0 || depth > 80) throw new CalculationError('limit-exceeded', 'Symbolic transformation is too large or recursive.');
    const s = (x: Expr) => simplify(x, depth + 1);
    if (e.type === 'group') return s(e.body);
    if (e.type === 'unary') {
      const arg = s(e.arg), r = rational(arg);
      if (e.op === '+') return arg;
      if (r) return fraction(-r.n, r.d);
      if (arg.type === 'unary' && arg.op === '-') return arg.arg;
      return { ...e, arg };
    }
    if (e.type === 'binary') {
      const a = s(e.left), b = s(e.right), x = rational(a), y = rational(b);
      if (x && y) {
        if (e.op === '+') return fraction(x.n * y.d + y.n * x.d, x.d * y.d);
        if (e.op === '-') return fraction(x.n * y.d - y.n * x.d, x.d * y.d);
        if (e.op === '*') return fraction(x.n * y.n, x.d * y.d);
        if (e.op === '/') return fraction(x.n * y.d, x.d * y.n);
        if (y.d === 1n && y.n >= -100n && y.n <= 100n) return y.n >= 0n ? fraction(x.n ** y.n, x.d ** y.n) : fraction(x.d ** -y.n, x.n ** -y.n);
      }
      if (e.op === '+' || e.op === '-') {
        if (is(b, 0)) return a;
        if (e.op === '+' && is(a, 0)) return b;
        if (same(a, b) && (e.op === '+' || total(a))) return e.op === '+' ? s(binary('*', num(2), a)) : num(0);
      }
      if (e.op === '*') {
        if (is(a, 1)) return b;
        if (is(b, 1)) return a;
        if (is(a, 0) && total(b) || is(b, 0) && total(a)) return num(0);
        if (same(a, b)) return binary('^', a, num(2));
      }
      if (e.op === '/' && is(b, 1)) return a;
      if (e.op === '^' && is(b, 1)) return a;
      if (e.op === '^' && is(b, 0) && total(a)) return num(1);
      return { ...e, left: a, right: b };
    }
    if (e.type === 'calculus' && (e.op === 'derivative' || e.op === 'partial')) {
      if (e.args.length > 1) throw new CalculationError('syntax', 'Symbolic derivative takes expression, variable and optional evaluation point.');
      let out = s(derivative(s(e.body), e.variables[0]));
      if (e.args.length) out = s(substituteSymbol(out, e.variables[0], s(e.args[0])));
      return out;
    }
    if (e.type === 'apply') {
      const args = e.args.map(s), body = expand?.(e.head.name, args);
      if (body) return s(e.pow ? binary('^', body, s(e.pow)) : body);
      return { ...e, args, pow: e.pow && s(e.pow) };
    }
    if (e.type === 'call') {
      const args = e.args.map(s), a = args[0];
      if (args.length === 1 && a?.type === 'num') {
        if ((e.fn === 'ln' || e.fn === 'log') && a.value <= 0 || e.fn === 'sqrt' && a.value < 0 || (e.fn === 'asin' || e.fn === 'acos') && Math.abs(a.value) > 1) throw new CalculationError('domain', 'The symbolic expression is outside its real domain.');
        if (is(a, 0) && (e.fn === 'sin' || e.fn === 'tan' || e.fn === 'abs' || e.fn === 'sqrt')) return num(0);
        if (is(a, 0) && (e.fn === 'cos' || e.fn === 'exp')) return num(1);
        if (is(a, 1) && (e.fn === 'ln' || e.fn === 'log')) return num(0);
        if (e.fn === 'sqrt' && a.value >= 0 && Number.isSafeInteger(Math.sqrt(a.value))) return num(Math.sqrt(a.value));
        if (e.fn === 'factorial' && Number.isInteger(a.value) && a.value >= 0 && a.value <= 170) { let n = 1n; for (let i = 2n; i <= BigInt(a.value); i++) n *= i; return fraction(n, 1n); }
      }
      return { ...e, args };
    }
    if (e.type === 'matrix') return { ...e, rows: e.rows.map(r => r.map(s)) };
    return e;
  };
  return simplify(expr);
}
