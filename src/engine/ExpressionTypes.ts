/**
 * JSON-serializable expression representation produced by the LaTeX parser.
 *
 * The engine never stores mathjs objects in this tree, so it can be cached,
 * logged, posted to a worker or persisted without conversion.
 */

import type { OperatorFunctionName, CalculusName } from './operatorNames';

export type BinaryOp = '+' | '-' | '*' | '/' | '^';

export type FunctionName = import('./matrixNames').MatrixFunctionName
  | OperatorFunctionName
  | import('./steelFunctions').SteelFunctionName
  | 'sin' | 'cos' | 'tan'
  | 'asin' | 'acos' | 'atan'
  /** angle(x, y): direction of the vector (x, y), 0 … 2π (Mathcad angle). */
  | 'angle'
  | 'sinh' | 'cosh' | 'tanh'
  | 'ln' | 'log' | 'exp'
  | 'sqrt' | 'nthRoot' | 'abs'
  | 'min' | 'max'
  /** Aggregates over vectors. */
  | 'sum' | 'len'
  /** seq(a, b) or seq(a, b, Δ): a vector from a to b (like a range, usable anywhere). */
  | 'seq'
  /** map(f, v…): calls the user function f for each entry (scalars repeat). */
  | 'map'
  /** linterp(xs, ys, x): linear interpolation; xs must be monotonic. */
  | 'linterp'
  /** stack(a, b, …): joins scalars and vectors into one vector. */
  | 'stack'
  /** floor(x), ceil(x): rounding of a plain number (no unit). */
  | 'floor'
  | 'ceil';

export type Expr =
  | { type: 'compare'; op: Relation; left: Expr; right: Expr }
  | { type: 'logic'; op: 'and' | 'or' | 'xor' | 'not'; left: Expr; right?: Expr }
  | { type: 'calculus'; op: CalculusName; variables: string[]; body: Expr; args: Expr[] }
  | { type: 'matrix'; rows: Expr[][] }
  | { type: 'vectorize'; body: Expr }
  | { type: 'num'; value: number; raw: string }
  /**
   * An identifier as typed.
   * - `splittable`: a run of plain italic letters ("wL", "kN") that may be
   *   resolved as one symbol or split into single-letter factors.
   * - `roman`: written upright (\mathrm, \text, \operatorname) which, by
   *   convention, means "unit" when the name is a registered unit.
   */
  | { type: 'ident'; name: string; splittable: boolean; roman: boolean; imaginaryLiteral?: boolean }
  | { type: 'binary'; op: BinaryOp; left: Expr; right: Expr; implicit?: boolean; frac?: boolean; cross?: boolean }
  | { type: 'unary'; op: '-' | '+'; arg: Expr }
  | { type: 'call'; fn: FunctionName; args: Expr[] }
  | { type: 'group'; body: Expr; visible: boolean }
  /** `if(condition, value if true, value if false)`; only the chosen branch is evaluated. */
  | { type: 'if'; cond: Condition; then: Expr; else: Expr }
  /** Range variable a..b or a, a+Δ..b; evaluates to a vector. Only as the right side of a definition. */
  | { type: 'range'; start: Expr; next: Expr | null; end: Expr }
  /** let(n₁, v₁, n₂, v₂, …, body): local names, each visible to later values and the body (Excel LET). */
  | { type: 'let'; bindings: { name: string; value: Expr }[]; body: Expr }
  /**
   * `name(args)` written with the parenthesis right after a name. A call when
   * the name is a user function; otherwise the old reading, name × (arg).
   * `pow` is an exponent written right after the bracket, name(x)^2: (f(x))² for a
   * function, name × (x)² otherwise.
   */
  | { type: 'apply'; head: IdentNode; args: Expr[]; pow?: Expr };

export type IdentNode = { type: 'ident'; name: string; splittable: boolean; roman: boolean; imaginaryLiteral?: boolean };

export type Relation = '<' | '<=' | '>' | '>=' | '==' | '!=';

/** A comparison used as the condition of `if`. */
export interface Comparison {
  left: Expr;
  op: Relation;
  right: Expr;
}

/** Condition of `if`: a comparison, or comparisons joined by ∧ (and) / ∨ (or). */
export type Condition = Comparison | { logic: 'and' | 'or'; a: Condition; b: Condition };

/** Every expression inside a condition (for walkers). */
function conditionExprs(c: Condition): Expr[] {
  return 'logic' in c ? [...conditionExprs(c.a), ...conditionExprs(c.b)] : [c.left, c.right];
}

export type Statement =
  /** `name := expr` – optional trailing `=` asks to display the result too. */
  | { kind: 'definition'; name: string; expr: Expr; evaluate: boolean; params?: string[]; global?: boolean }
  | { kind: 'symbolic'; expr: Expr }
  /** `expr =` – display the value of an expression. */
  | { kind: 'evaluation'; expr: Expr }
  /** A bare expression with no operator; evaluated but not displayed. */
  | { kind: 'expression'; expr: Expr }
  /** `left ≤ right` – engineering verification (PASS / FAIL). */
  | { kind: 'check'; left: Expr; op: Relation; right: Expr }
  | { kind: 'empty' };

export function walkExpr(expr: Expr, visit: (e: Expr) => void): void {
  visit(expr);
  switch (expr.type) {
    case 'compare':
    case 'logic':
      walkExpr(expr.left, visit);
      if (expr.right) walkExpr(expr.right, visit);
      break;
    case 'calculus':
      walkExpr(expr.body, visit);
      expr.args.forEach(a => walkExpr(a, visit));
      break;
    case 'matrix':
      expr.rows.flat().forEach((e) => walkExpr(e, visit));
      break;
    case 'vectorize':
      walkExpr(expr.body, visit);
      break;
    case 'binary':
      walkExpr(expr.left, visit);
      walkExpr(expr.right, visit);
      break;
    case 'unary':
      walkExpr(expr.arg, visit);
      break;
    case 'call':
      expr.args.forEach((a) => walkExpr(a, visit));
      break;
    case 'group':
      walkExpr(expr.body, visit);
      break;
    case 'range':
      walkExpr(expr.start, visit);
      if (expr.next) walkExpr(expr.next, visit);
      walkExpr(expr.end, visit);
      break;
    case 'if':
      for (const e of conditionExprs(expr.cond)) walkExpr(e, visit);
      walkExpr(expr.then, visit);
      walkExpr(expr.else, visit);
      break;
    case 'let':
      for (const b of expr.bindings) walkExpr(b.value, visit);
      walkExpr(expr.body, visit);
      break;
    case 'apply':
      walkExpr(expr.head, visit);
      expr.args.forEach((a) => walkExpr(a, visit));
      if (expr.pow) walkExpr(expr.pow, visit);
      break;
  }
}

/** Like walkExpr, but tells the visitor which let-names are in scope at each node. */
export function walkScoped(expr: Expr, visit: (e: Expr, locals: ReadonlySet<string>) => void, locals: ReadonlySet<string> = new Set()): void {
  visit(expr, locals);
  const w = (e: Expr) => walkScoped(e, visit, locals);
  switch (expr.type) {
    case 'compare':
    case 'logic':
      w(expr.left);
      if (expr.right) w(expr.right);
      break;
    case 'calculus':
      walkScoped(expr.body, visit, new Set([...locals, ...expr.variables]));
      expr.args.forEach(w);
      break;
    case 'matrix':
      expr.rows.flat().forEach(w);
      break;
    case 'vectorize':
      w(expr.body);
      break;
    case 'binary':
      w(expr.left);
      w(expr.right);
      break;
    case 'unary':
      w(expr.arg);
      break;
    case 'call':
      expr.args.forEach(w);
      break;
    case 'group':
      w(expr.body);
      break;
    case 'range':
      w(expr.start);
      if (expr.next) w(expr.next);
      w(expr.end);
      break;
    case 'if':
      conditionExprs(expr.cond).forEach(w);
      w(expr.then);
      w(expr.else);
      break;
    case 'let': {
      let scope = locals;
      for (const b of expr.bindings) {
        walkScoped(b.value, visit, scope);
        scope = new Set([...scope, b.name]);
      }
      walkScoped(expr.body, visit, scope);
      break;
    }
    case 'apply':
      w(expr.head);
      expr.args.forEach(w);
      if (expr.pow) w(expr.pow);
      break;
  }
}

/** Names local to a statement: the parameters of a function definition. */
export function statementLocals(stmt: Statement): ReadonlySet<string> {
  return new Set(stmt.kind === 'definition' ? (stmt.params ?? []) : []);
}

export function statementExprs(stmt: Statement): Expr[] {
  switch (stmt.kind) {
    case 'definition':
    case 'evaluation':
    case 'expression':
    case 'symbolic':
      return [stmt.expr];
    case 'check':
      return [stmt.left, stmt.right];
    case 'empty':
      return [];
  }
}
