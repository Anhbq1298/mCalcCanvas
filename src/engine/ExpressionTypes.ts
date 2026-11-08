/**
 * JSON-serializable expression representation produced by the LaTeX parser.
 *
 * The engine never stores mathjs objects in this tree, so it can be cached,
 * logged, posted to a worker or persisted without conversion.
 */

export type BinaryOp = '+' | '-' | '*' | '/' | '^';

export type FunctionName =
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
  | 'stack';

export type Expr =
  | { type: 'num'; value: number; raw: string }
  /**
   * An identifier as typed.
   * - `splittable`: a run of plain italic letters ("wL", "kN") that may be
   *   resolved as one symbol or split into single-letter factors.
   * - `roman`: written upright (\mathrm, \text, \operatorname) which, by
   *   convention, means "unit" when the name is a registered unit.
   */
  | { type: 'ident'; name: string; splittable: boolean; roman: boolean }
  | { type: 'binary'; op: BinaryOp; left: Expr; right: Expr; implicit?: boolean; frac?: boolean }
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
   */
  | { type: 'apply'; head: IdentNode; args: Expr[] };

export type IdentNode = { type: 'ident'; name: string; splittable: boolean; roman: boolean };

export type Relation = '<' | '<=' | '>' | '>=' | '==' | '!=';

/** A comparison used as the condition of `if`. */
export interface Condition {
  left: Expr;
  op: Relation;
  right: Expr;
}

export type Statement =
  /** `name := expr` – optional trailing `=` asks to display the result too. */
  | { kind: 'definition'; name: string; expr: Expr; evaluate: boolean; params?: string[] }
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
      walkExpr(expr.cond.left, visit);
      walkExpr(expr.cond.right, visit);
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
      break;
  }
}

/** Like walkExpr, but tells the visitor which let-names are in scope at each node. */
export function walkScoped(expr: Expr, visit: (e: Expr, locals: ReadonlySet<string>) => void, locals: ReadonlySet<string> = new Set()): void {
  visit(expr, locals);
  const w = (e: Expr) => walkScoped(e, visit, locals);
  switch (expr.type) {
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
      w(expr.cond.left);
      w(expr.cond.right);
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
      return [stmt.expr];
    case 'check':
      return [stmt.left, stmt.right];
    case 'empty':
      return [];
  }
}
