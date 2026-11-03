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
  | 'sinh' | 'cosh' | 'tanh'
  | 'ln' | 'log' | 'exp'
  | 'sqrt' | 'nthRoot' | 'abs'
  | 'min' | 'max';

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
  | { type: 'group'; body: Expr; visible: boolean };

export type Relation = '<' | '<=' | '>' | '>=' | '==' | '!=';

export type Statement =
  /** `name := expr` – optional trailing `=` asks to display the result too. */
  | { kind: 'definition'; name: string; expr: Expr; evaluate: boolean }
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
  }
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
