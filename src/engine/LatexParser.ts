/**
 * Explicit recursive-descent parser for the LaTeX subset emitted by MathLive.
 *
 * LaTeX → tokens → Statement/Expr tree (JSON). No regular-expression
 * rewriting into another syntax, no string evaluation anywhere.
 *
 * Grammar (informal):
 *   statement  := expr (':=' expr '='? | '=' | relation expr)?
 *   expr       := term (('+' | '-') term)*
 *   term       := unary (('*' | '/' | implicit) unary)*
 *   unary      := ('-' | '+') unary | power
 *   power      := primary ('^' scriptArg)?
 *   primary    := number | identifier | function | if | \frac | \sqrt | (expr) | |expr|
 *   if         := 'if' '(' expr relation expr ',' expr ',' expr ')'
 *
 * Identifier policy (see README "Symbol resolution"):
 *   - runs of italic letters ("wL", "kN") become one splittable identifier;
 *     the engine later decides whether it is a variable, a unit or a product.
 *   - a subscript binds to the last letter of a run: "wM_{Ed}" = w · M_Ed.
 *   - \mathrm{…} / \text{…} produce upright (roman) identifiers, the
 *     unambiguous way to write units.
 */
import { matrixFunctionNames } from './matrixNames';
import { operatorFunctionNames, calculusNames, type CalculusName } from './operatorNames';
import { CalculationError } from './CalculationErrors';
import type { Comparison, Condition, Expr, FunctionName, Relation, Statement } from './ExpressionTypes';

type Token =
  | { t: 'num'; v: string }
  | { t: 'letter'; v: string }
  | { t: 'cmd'; v: string }
  | { t: 'sym'; v: string }
  | { t: 'eof'; v: '' };

const MAX_LATEX_LENGTH = 4000;
const MAX_NODES = 2000;
const MAX_DEPTH = 120;

export const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ',
  varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ',
  psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ',
  Xi: 'Ξ', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω', Pi: 'Π',
};

const FUNCTION_COMMANDS: Record<string, FunctionName> = {
  det: 'det',
  sin: 'sin', cos: 'cos', tan: 'tan',
  arcsin: 'asin', arccos: 'acos', arctan: 'atan',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
  ln: 'ln', log: 'log', exp: 'exp', min: 'min', max: 'max',
};

/** Plain-letter runs that MathLive may leave un-converted. */
const FUNCTION_WORDS: Record<string, FunctionName> = {
  sectionProp: 'sectionProp',
  ...Object.fromEntries(operatorFunctionNames.map(n => [n, n])) as Record<import('./operatorNames').OperatorFunctionName, import('./operatorNames').OperatorFunctionName>,
  ...FUNCTION_COMMANDS,
  ...Object.fromEntries(matrixFunctionNames.map((n) => [n, n])) as Record<import('./matrixNames').MatrixFunctionName, import('./matrixNames').MatrixFunctionName>,
  asin: 'asin', acos: 'acos', atan: 'atan', sqrt: 'sqrt', abs: 'abs',
  sum: 'sum', len: 'len', seq: 'seq', angle: 'angle', map: 'map', floor: 'floor', ceil: 'ceil', linterp: 'linterp', stack: 'stack',
};


const ROMAN_COMMANDS = new Set([
  'mathrm', 'text', 'textrm', 'operatorname', 'mathit', 'mathbf', 'mathsf',
  'textit', 'textbf', 'mathup', 'textup', 'mathbfit', 'textnormal', 'unit',
]);
/** Written as letters (if) or upright (\mathrm{if}, \operatorname{if}). */
const IF_WORD = 'if';
/** let(name, value, …, expression): local names (Excel LET). */
const LET_WORD = 'let';
const FRAC_COMMANDS = new Set(['frac', 'dfrac', 'tfrac', 'cfrac']);
const IGNORED_COMMANDS = new Set([
  ',', ';', ':', '!', ' ', '>', 'quad', 'qquad', 'displaystyle', 'textstyle',
  'left', 'right', 'mleft', 'mright', 'bigl', 'bigr', 'Bigl', 'Bigr', 'big',
  'Big', 'bigg', 'Bigg', 'mathstrut', 'nobreak', 'limits', 'thinspace',
  'medspace', 'thickspace', 'enspace', 'mathord', 'mathbin',
]);
const MUL_COMMANDS = new Set(['cdot', 'times', 'ast', 'cdotp', 'bullet']);
const ASSIGN_COMMANDS = new Set(['coloneq', 'coloneqq', 'Coloneqq', 'Coloneq', 'colonequals', 'definedas']);
const RELATION_COMMANDS: Record<string, Relation> = {
  le: '<=', leq: '<=', leqslant: '<=', ge: '>=', geq: '>=', geqslant: '>=',
  lt: '<', gt: '>', ne: '!=', neq: '!=', equiv: '==',
};
const RELATION_SYMBOLS: Record<string, Relation> = {
  '<': '<', '>': '>', '≤': '<=', '≥': '>=', '≠': '!=',
};

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= '0' && c <= '9';
}
function isLetter(c: string | undefined): boolean {
  return c !== undefined && /[A-Za-z]/.test(c);
}

function tokenize(latex: string): Token[] {
  if (latex.length > MAX_LATEX_LENGTH) {
    throw new CalculationError('limit-exceeded', `Expression is too long (max ${MAX_LATEX_LENGTH} characters).`);
  }
  const tokens: Token[] = [];
  let i = 0;
  const s = latex;
  // Inside \begin{array}/\begin{cases} (an if block), & and \\ separate cells and rows.
  let blockDepth = 0;
  let ifBlockDepth = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '&' && blockDepth > 0) {
      tokens.push({ t: 'sym', v: '&' });
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\n' || c === '~' || c === '&') {
      i++;
      continue;
    }
    if (s.startsWith('..', i)) {
      // Range operator a..b (Mathcad); "..." is the same.
      tokens.push({ t: 'sym', v: '..' });
      i += s.startsWith('...', i) ? 3 : 2;
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(s[i + 1]))) {
      let v = '';
      while (i < s.length) {
        if (isDigit(s[i]) || (s[i] === '.' && !v.includes('.') && s[i + 1] !== '.')) {
          v += s[i++];
        } else if (s.startsWith('{,}', i) && isDigit(s[i + 3]) && !v.includes('.')) {
          // MathLive's decimal comma: 8{,}5
          v += '.';
          i += 3;
        } else {
          break;
        }
      }
      tokens.push({ t: 'num', v });
      continue;
    }
    if (isLetter(c)) {
      tokens.push({ t: 'letter', v: c });
      i++;
      continue;
    }
    if (c === '\\') {
      let j = i + 1;
      if (isLetter(s[j])) {
        while (isLetter(s[j])) j++;
        const name = s.slice(i + 1, j);
        i = j;
        // \left. and \right. are invisible delimiters
        if ((name === 'left' || name === 'right' || name === 'mleft' || name === 'mright') && s[i] === '.') {
          i++;
          continue;
        }
        if (IGNORED_COMMANDS.has(name)) continue;
        // Inside an if block, \left\Vert … \right. only draws the bar beside a value (Mathcad Prime).
        if (name === 'Vert' && ifBlockDepth > 0) continue;
        if (name === 'begin' || name === 'end') {
          const m = /^\{(array|cases|bmatrix|pmatrix|matrix|vmatrix)\}/.exec(s.slice(i));
          if (!m) throw new CalculationError('syntax', `Unsupported LaTeX environment ${s.slice(i, i + 20)}`);
          i += m[0].length;
          if (name === 'begin' && m[1] === 'array') {
            // Column spec, e.g. {|ll}
            const spec = /^\{[|lcr\s]*\}/.exec(s.slice(i));
            if (spec) i += spec[0].length;
          }
          blockDepth += name === 'begin' ? 1 : -1;
          const matrix = !['array', 'cases'].includes(m[1]);
          if (!matrix) ifBlockDepth += name === 'begin' ? 1 : -1;
          tokens.push({ t: 'cmd', v: matrix ? (name === 'begin' ? `beginmatrix:${m[1]}` : 'endmatrix') : name === 'begin' ? 'beginblock' : 'endblock' });
          continue;
        }
        tokens.push({ t: 'cmd', v: name });
      } else {
        const ch = s[j] ?? '';
        i = j + 1;
        if (IGNORED_COMMANDS.has(ch)) continue;
        if (ch === '{' || ch === '}') {
          tokens.push({ t: 'sym', v: ch === '{' ? '(' : ')' });
        } else if (ch === '|') {
          tokens.push({ t: 'sym', v: '|' });
        } else if (ch === '%') {
          tokens.push({ t: 'sym', v: '%' });
        } else if (ch === '\\') {
          if (blockDepth > 0) tokens.push({ t: 'sym', v: 'row' });
          continue;
        } else {
          throw new CalculationError('syntax', `Unsupported LaTeX command \\${ch}`);
        }
      }
      continue;
    }
    // Normalise a few unicode operators MathLive or paste may produce.
    const map: Record<string, string> = { '−': '-', '×': '*', '·': '*', '⋅': '*', '÷': '/', '≔': ':=' };
    const mapped = map[c];
    if (mapped === ':=') {
      tokens.push({ t: 'sym', v: ':' }, { t: 'sym', v: '=' });
      i++;
      continue;
    }
    tokens.push({ t: 'sym', v: mapped ?? c });
    i++;
  }
  tokens.push({ t: 'eof', v: '' });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  private pos = 0;
  private nodes = 0;
  private depth = 0;
  private absDepth = 0;
  private tokens: Token[];
  private readonly roman: boolean;

  constructor(tokens: Token[], roman = false) {
    this.tokens = tokens;
    this.roman = roman;
  }

  // -- helpers --------------------------------------------------------------

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }
  private next(): Token {
    const tok = this.peek();
    if (this.pos < this.tokens.length - 1) this.pos++;
    return tok;
  }
  private isSym(v: string, offset = 0): boolean {
    const tok = this.peek(offset);
    return tok.t === 'sym' && tok.v === v;
  }
  private isCmd(v: string, offset = 0): boolean {
    const tok = this.peek(offset);
    return tok.t === 'cmd' && tok.v === v;
  }
  private expectSym(v: string): void {
    if (!this.isSym(v)) {
      const tok = this.peek();
      const found = tok.t === 'eof' ? 'end of expression' : `"${tok.v}"`;
      throw new CalculationError('syntax', `Expected "${v}" but found ${found}.`);
    }
    this.next();
  }
  private node<T extends Expr>(e: T): T {
    if (++this.nodes > MAX_NODES) {
      throw new CalculationError('limit-exceeded', 'Expression is too large.');
    }
    return e;
  }
  private enter(): void {
    if (++this.depth > MAX_DEPTH) {
      throw new CalculationError('limit-exceeded', 'Expression is nested too deeply.');
    }
  }
  private leave(): void {
    this.depth--;
  }
  atEnd(): boolean {
    return this.peek().t === 'eof';
  }

  /** Skip a MathLive placeholder (\placeholder[id]{value}). Returns true if one was found. */
  private skipPlaceholder(): boolean {
    if (!this.isCmd('placeholder')) return false;
    this.next();
    if (this.isSym('[')) this.readBalancedTokens('[', ']');
    if (this.isSym('{')) this.readBalancedTokens('{', '}');
    return true;
  }

  /** Reads tokens between matching delimiters (consuming both); returns the inner tokens. */
  private readBalancedTokens(open: string, close: string): Token[] {
    this.expectSym(open);
    const inner: Token[] = [];
    let level = 1;
    for (;;) {
      const tok = this.next();
      if (tok.t === 'eof') throw new CalculationError('syntax', `Missing "${close}".`);
      if (tok.t === 'sym' && tok.v === open) level++;
      if (tok.t === 'sym' && tok.v === close) {
        level--;
        if (level === 0) break;
      }
      inner.push(tok);
    }
    return inner;
  }

  private subParse(inner: Token[], roman = this.roman): Expr {
    const sub = new Parser([...inner, { t: 'eof', v: '' }], roman);
    sub.nodes = this.nodes;
    sub.depth = this.depth;
    if (sub.atEnd()) throw new CalculationError('incomplete', 'Incomplete expression.');
    const e = sub.parseExpr();
    if (!sub.atEnd()) {
      throw new CalculationError('syntax', `Unexpected "${sub.peek().v}".`);
    }
    this.nodes = sub.nodes;
    return e;
  }

  // -- statements ------------------------------------------------------------

  private isAssign(): boolean {
    const tok = this.peek();
    if (tok.t === 'cmd' && ASSIGN_COMMANDS.has(tok.v)) return true;
    return this.isSym(':') && this.isSym('=', 1);
  }
  private consumeAssign(): void {
    if (this.peek().t === 'cmd') this.next();
    else {
      this.next();
      this.next();
    }
  }
  private peekRelation(): Relation | null {
    const tok = this.peek();
    if (tok.t === 'sym' && RELATION_SYMBOLS[tok.v]) {
      // "<=" / ">=" typed as two characters
      if ((tok.v === '<' || tok.v === '>') && this.isSym('=', 1)) {
        return tok.v === '<' ? '<=' : '>=';
      }
      return RELATION_SYMBOLS[tok.v];
    }
    if (tok.t === 'cmd' && RELATION_COMMANDS[tok.v]) return RELATION_COMMANDS[tok.v];
    return null;
  }
  private consumeRelation(rel: Relation): void {
    const tok = this.next();
    if (tok.t === 'sym' && (rel === '<=' || rel === '>=') && (tok.v === '<' || tok.v === '>')) this.next();
  }
  /** True when only placeholders remain. */
  private restIsEmpty(): boolean {
    while (this.skipPlaceholder()) {
      /* skip */
    }
    return this.atEnd();
  }

  parseStatement(): Statement {
    if (this.restIsEmpty()) return { kind: 'empty' };
    if (this.peekRelation()) {
      throw new CalculationError('incomplete', 'Type the value to check before the comparison (e.g. η ≤ 1).');
    }
    const left = this.parseExpr();

    if (left.type === 'apply' && left.head.name === 'global' && this.atEnd()) {
      const [name, expr] = left.args;
      if (left.args.length === 2 && name?.type === 'apply' && name.args.every(a => a.type === 'ident' && !a.roman)) {
        const params = name.args.map(a => (a as Extract<Expr, { type: 'ident' }>).name);
        if (new Set(params).size !== params.length) throw new CalculationError('invalid-definition', 'Global function parameters must be distinct.');
        return { kind: 'definition', name: name.head.name, expr, params, evaluate: false, global: true };
      }
      if (left.args.length !== 2 || name?.type !== 'ident') throw new CalculationError('invalid-definition', 'global(name, value) needs a variable or function name and its value.');
      return { kind: 'definition', name: name.name, expr, evaluate: false, global: true };
    }
    if (this.isCmd('rightarrow') || this.isCmd('longrightarrow') || this.isSym('→')) {
      this.next();
      if (!this.restIsEmpty()) throw new CalculationError('syntax', 'Symbolic evaluation is written expression →.');
      return { kind: 'symbolic', expr: left };
    }

    if (this.isAssign()) {
      this.consumeAssign();
      let params: string[] | undefined;
      let target: Expr = left;
      if (left.type === 'apply' && !left.head.roman) {
        params = left.args.map((a) => {
          if (a.type !== 'ident' || a.roman) {
            throw new CalculationError('invalid-definition', 'Function parameters must be single variable names, e.g. f(x, y) := ….');
          }
          return a.name;
        });
        if (new Set(params).size !== params.length) throw new CalculationError('invalid-definition', 'Each parameter name may appear only once.');
        target = left.head;
      }
      if (target.type !== 'ident') {
        throw new CalculationError('invalid-definition', 'The left side of ":=" must be a single variable name or a function f(x).');
      }
      if (this.restIsEmpty()) throw new CalculationError('incomplete', `Incomplete definition of ${target.name}.`);
      const expr = this.parseRangeOrExpr();
      let evaluate = false;
      if (this.isSym('=')) {
        this.next();
        evaluate = true;
        if (!this.restIsEmpty()) {
          throw new CalculationError('syntax', 'Unexpected input after "=".');
        }
      }
      this.expectEnd();
      if (params) {
        if (evaluate) throw new CalculationError('syntax', 'A function definition has no single value to display: evaluate a call instead, e.g. f(2) =.');
        if (expr.type === 'range') throw new CalculationError('syntax', 'A function body cannot be a range; use seq(a, b) instead.');
        return { kind: 'definition', name: target.name, expr, evaluate, params };
      }
      return { kind: 'definition', name: target.name, expr, evaluate };
    }

    if (this.isSym('=')) {
      this.next();
      if (this.restIsEmpty()) return { kind: 'evaluation', expr: left };
      throw new CalculationError('syntax', 'Use ":=" to define a variable. "=" alone displays a result.');
    }

    const rel = this.peekRelation();
    if (rel) {
      this.consumeRelation(rel);
      if (this.restIsEmpty()) throw new CalculationError('incomplete', 'Incomplete check: add a limit value.');
      const right = this.parseExpr();
      this.expectEnd();
      return { kind: 'check', left, op: rel, right };
    }

    this.expectEnd();
    if (left.type === 'compare') return { kind: 'check', left: left.left, op: left.op, right: left.right };
    return { kind: 'expression', expr: left };
  }

  private isRangeOp(): boolean {
    return this.isSym('..') || this.isCmd('ldots') || this.isCmd('dots') || this.isCmd('cdots');
  }

  /** a..b or a, a+Δ..b on the right side of a definition; otherwise an ordinary expression. */
  private parseRangeOrExpr(): Expr {
    const start = this.parseExpr();
    let next: Expr | null = null;
    if (this.isSym(',')) {
      this.next();
      next = this.parseExpr();
      if (!this.isRangeOp()) throw new CalculationError('syntax', 'A range is written a..b or a, a+Δ..b.');
    }
    if (!this.isRangeOp()) return start;
    this.next();
    if (this.restIsEmpty() || this.isSym('=')) throw new CalculationError('incomplete', 'Incomplete range: add the end value (e.g. 0..10).');
    const end = this.parseExpr();
    return this.node({ type: 'range', start, next, end });
  }

  private expectEnd(): void {
    if (!this.atEnd()) {
      const tok = this.peek();
      throw new CalculationError('syntax', `Unexpected "${tok.t === 'cmd' ? '\\' + tok.v : tok.v}".`);
    }
  }

  // -- expressions -----------------------------------------------------------

  parseExpr(): Expr {
    return this.parseLogic(0);
  }

  private parseLogic(level: number): Expr {
    const names = [['lor', 'vee'], ['oplus'], ['land', 'wedge']];
    if (level < names.length) {
      let left = this.parseLogic(level + 1);
      while (names[level].some(name => this.isCmd(name))) {
        this.next();
        left = this.node({ type: 'logic', op: (['or', 'xor', 'and'] as const)[level], left, right: this.parseLogic(level + 1) });
      }
      return left;
    }
    if (this.isCmd('neg') || this.isCmd('lnot') || this.isSym('¬')) {
      this.next();
      this.enter();
      const left = this.parseLogic(level);
      this.leave();
      return this.node({ type: 'logic', op: 'not', left });
    }
    const left = this.parseArithmetic();
    if (this.isCmd('in')) {
      this.next();
      return this.node({ type: 'call', fn: 'contains', args: [left, this.parseArithmetic()] });
    }
    const op = this.peekRelation();
    if (!op) return left;
    this.consumeRelation(op);
    return this.node({ type: 'compare', op, left, right: this.parseArithmetic() });
  }

  private parseArithmetic(): Expr {
    this.enter();
    let left = this.parseTerm();
    while (this.isSym('+') || this.isSym('-')) {
      const op = this.next().v as '+' | '-';
      const right = this.parseTerm();
      left = this.node({ type: 'binary', op, left, right });
    }
    this.leave();
    return left;
  }

  private parseTerm(): Expr {
    let left = this.parseUnary();
    for (;;) {
      const tok = this.peek();
      if ((tok.t === 'sym' && tok.v === '*') || (tok.t === 'cmd' && MUL_COMMANDS.has(tok.v))) {
        this.next();
        const right = this.parseUnary();
        left = this.node({ type: 'binary', op: '*', left, right, ...(tok.t === 'cmd' && tok.v === 'times' ? { cross: true } : {}) });
      } else if ((tok.t === 'sym' && tok.v === '/') || (tok.t === 'cmd' && tok.v === 'div')) {
        this.next();
        left = this.node({ type: 'binary', op: '/', left, right: this.parseUnary() });
      } else if (this.isCmd('angle')) {
        this.next();
        left = this.node({ type: 'call', fn: 'phasor', args: [left, this.parseUnary()] });
      } else if (this.startsPrimary()) {
        let right = this.parsePower();
        const literal = (e: Expr): boolean => e.type === 'num' || e.type === 'unary' && literal(e.arg);
        if (literal(left)) {
          const imaginary = (e: Expr): Expr => e.type === 'ident' && e.name === 'i' ? { ...e, imaginaryLiteral: true } : e;
          right = right.type === 'binary' && right.op === '^' ? { ...right, left: imaginary(right.left) } : imaginary(right);
        }
        left = this.node({ type: 'binary', op: '*', left, right, implicit: true });
      } else {
        return left;
      }
    }
  }

  private parseUnary(): Expr {
    if (this.isSym('-') || this.isSym('+')) {
      const op = this.next().v as '-' | '+';
      this.enter();
      const arg = this.parseUnary();
      this.leave();
      return this.node({ type: 'unary', op, arg });
    }
    return this.parsePower();
  }

  private parsePower(): Expr {
    let base = this.parsePrimary();
    while (this.isSym('!')) {
      this.next();
      base = this.node({ type: 'call', fn: 'factorial', args: [base] });
    }
    if (!this.isSym('^')) return base;
    this.next();
    // x^{\circ} is the degree sign
    if (this.isSym('{') && this.isCmd('circ', 1) && this.isSym('}', 2)) {
      this.next();
      this.next();
      this.next();
      return this.node({ type: 'binary', op: '*', left: base, right: this.degreeIdent(), implicit: true });
    }
    if (this.isCmd('circ')) {
      this.next();
      return this.node({ type: 'binary', op: '*', left: base, right: this.degreeIdent(), implicit: true });
    }
    const exponent = this.parseScriptArg();
    if (exponent.type === 'ident' && exponent.name === 'T') return this.node({ type: 'call', fn: 'transpose', args: [base] });
    return this.node({ type: 'binary', op: '^', left: base, right: exponent });
  }

  /** Argument of ^ or a command: a braced group or a single token. */
  private parseScriptArg(): Expr {
    if (this.isSym('{')) return this.subParse(this.readBalancedTokens('{', '}'));
    const tok = this.peek();
    if (tok.t === 'num' && tok.v.length > 1 && !tok.v.startsWith('.')) {
      // L^23 in TeX means L^2 · 3: split off the first digit only.
      this.tokens[this.pos] = { t: 'num', v: tok.v.slice(1) };
      return this.node({ type: 'num', value: Number(tok.v[0]), raw: tok.v[0] });
    }
    if (tok.t === 'sym' && tok.v === '-') {
      this.next();
      return this.node({ type: 'unary', op: '-', arg: this.parseScriptArg() });
    }
    return this.parsePrimary();
  }

  private parseBracedArg(): Expr {
    if (this.isSym('{')) return this.subParse(this.readBalancedTokens('{', '}'));
    return this.parseScriptArg();
  }

  private degreeIdent(): Expr {
    // "°C" written as \degree C or \degree\mathrm{C} is degrees Celsius.
    if (this.peek().t === 'letter' && this.peek().v === 'C' && this.peek(1).t !== 'letter') {
      this.next();
      return this.node({ type: 'ident', name: 'degC', splittable: false, roman: true });
    }
    if (this.isCmd('mathrm') && this.isSym('{', 1) && this.peek(2).v === 'C' && this.isSym('}', 3)) {
      for (let k = 0; k < 4; k++) this.next();
      return this.node({ type: 'ident', name: 'degC', splittable: false, roman: true });
    }
    return this.node({ type: 'ident', name: 'deg', splittable: false, roman: true });
  }

  private startsPrimary(): boolean {
    const tok = this.peek();
    switch (tok.t) {
      case 'num':
      case 'letter':
        return true;
      case 'sym':
        if (tok.v === '(' || tok.v === '[' || tok.v === '{' || tok.v === '°' || tok.v === '%') return true;
        if (tok.v === '|') return this.absDepth === 0;
        return false;
      case 'cmd':
        if (tok.v === 'lVert' || tok.v === 'Vert') return this.absDepth === 0 || tok.v === 'lVert';
        if (tok.v === 'vert' || tok.v === 'lvert') return this.absDepth === 0 || tok.v === 'lvert';
        return (
          tok.v in GREEK || tok.v === 'pi' || ROMAN_COMMANDS.has(tok.v) || FRAC_COMMANDS.has(tok.v) ||
          tok.v.startsWith('beginmatrix:') || ['sum', 'prod', 'int', 'lim', 'overline', 'bar'].includes(tok.v) || tok.v === 'overrightarrow' || tok.v === 'sqrt' || tok.v in FUNCTION_COMMANDS || tok.v === 'exponentialE' || tok.v === 'imaginaryI' || tok.v === 'infty' ||
          tok.v === 'placeholder' || tok.v === 'degree' || tok.v === 'deg' || tok.v === 'lparen' || tok.v === 'lbrack'
        );
      default:
        return false;
    }
  }

  private parsePrimary(): Expr {
    const e = this.parsePrimaryAtom();
    if (e.type === 'ident' && (this.isSym("'") || this.isCmd('prime') || this.isSym('^') && this.isSym('{', 1) && this.isCmd('prime', 2) && this.isSym('}', 3))) {
      if (this.isSym('^')) for (let i = 0; i < 4; i++) this.next(); else this.next();
      if (!this.isSym('(') && !this.isCmd('lparen')) throw new CalculationError('incomplete', 'A prime derivative needs a function and evaluation point, e.g. f′(2).');
      const parts = this.readArgumentTokens();
      if (parts.length !== 1) throw new CalculationError('syntax', 'A prime derivative needs one evaluation point.');
      const variable: Expr = { type: 'ident', name: 'x', roman: false, splittable: false };
      return this.node({ type: 'calculus', op: 'derivative', variables: ['x'], body: { type: 'apply', head: e, args: [variable] }, args: [this.subParse(parts[0])] });
    }
    if (e.type !== 'ident' || !(this.isSym('(') || this.isCmd('lparen'))) return e;
    // name(args): a user-function call when "name" is one (decided at evaluation).
    // name(x)^2 is (name(x))² for a function, else the old reading name·(x)².
    const parts = this.readArgumentTokens();
    const args = parts.map((p) => this.subParse(p));
    if (this.isSym('^') && !(this.isSym('{', 1) && this.isCmd('circ', 2)) && !this.isCmd('circ', 1)) {
      this.next();
      const pow = this.parseScriptArg();
      if (pow.type === 'ident' && pow.name === 'T') return this.node({ type: 'call', fn: 'transpose', args: [this.node({ type: 'apply', head: e, args })] });
      return this.node({ type: 'apply', head: e, args, pow });
    }
    return this.node({ type: 'apply', head: e, args });
  }

  private parsePrimaryAtom(): Expr {
    const tok = this.peek();
    if (tok.t === 'cmd' && tok.v.startsWith('beginmatrix:')) return this.parseMatrix();
    if (this.isCmd('overrightarrow')) {
      this.next();
      return this.node({ type: 'vectorize', body: this.parseBracedArg() });
    }
    if (this.isCmd('beginblock')) return this.parseIfBlock();
    switch (tok.t) {
      case 'eof':
        throw new CalculationError('incomplete', 'Incomplete expression.');
      case 'num': {
        this.next();
        const value = Number(tok.v);
        if (!Number.isFinite(value)) throw new CalculationError('syntax', `Invalid number "${tok.v}".`);
        return this.node({ type: 'num', value, raw: tok.v });
      }
      case 'letter':
        return this.parseLetterRun();
      case 'sym':
        return this.parseSymbolPrimary(tok.v);
      case 'cmd':
        return this.parseCommandPrimary(tok.v);
    }
  }

  private parseMatrix(): Expr {
    const determinant = this.next().v === 'beginmatrix:vmatrix';
    const rows: Expr[][] = [[]];
    while (!this.isCmd('endmatrix')) {
      rows[rows.length - 1].push(this.parseExpr());
      if (this.isSym('&')) this.next();
      else if (this.isSym('row')) { this.next(); rows.push([]); }
      else if (!this.isCmd('endmatrix')) throw new CalculationError('syntax', 'Expected a matrix cell or row separator.');
    }
    this.next();
    if (!rows[0].length || rows.some((r) => r.length !== rows[0].length)) throw new CalculationError('vector', 'Matrix rows must have equal lengths.');
    const matrix = this.node({ type: 'matrix', rows });
    return determinant ? this.node({ type: 'call', fn: 'det', args: [matrix] }) : matrix;
  }

  private parseLetterRun(): Expr {
    // Count the run of consecutive letters.
    let n = 0;
    while (this.peek(n).t === 'letter') n++;
    const numbered = this.tokens.slice(this.pos, this.pos + n + 1).map((t) => t.v).join('');
    if (this.peek(n).t === 'num' && FUNCTION_WORDS[numbered] && this.isSym('(', n + 1)) {
      for (let i = 0; i <= n; i++) this.next();
      return this.parseFunctionArgs(FUNCTION_WORDS[numbered]);
    }
    const subscriptFollows = this.isSym('_', n);
    // A subscript binds only to the last letter: emit the prefix on its own.
    const take = subscriptFollows && n > 1 ? n - 1 : n;
    let name = '';
    for (let k = 0; k < take; k++) name += this.next().v;

    if (!subscriptFollows || take < n) {
      // Function written as plain letters, e.g. "sqrt(x)".
      const fn = FUNCTION_WORDS[name];
      if (fn && !this.roman && (this.isSym('(') || this.isCmd('lparen'))) {
        return this.parseFunctionArgs(fn);
      }
      if (name === IF_WORD && !this.roman && (this.isSym('(') || this.isCmd('lparen'))) {
        return this.parseIf();
      }
      if (name === LET_WORD && !this.roman && (this.isSym('(') || this.isCmd('lparen'))) {
        return this.parseLet();
      }
      return this.node({ type: 'ident', name, splittable: !this.roman && name.length > 1, roman: this.roman });
    }
    const sub = this.parseSubscriptText();
    return this.node({ type: 'ident', name: `${name}_${sub}`, splittable: false, roman: this.roman });
  }

  /** Reads a subscript and returns it as plain text: M_{Ed} → "Ed". */
  private parseSubscriptText(): string {
    this.expectSym('_');
    const tokens = this.isSym('{') ? this.readBalancedTokens('{', '}') : this.takeSingleScriptToken();
    let text = '';
    for (let k = 0; k < tokens.length; k++) {
      const tok = tokens[k];
      if (tok.t === 'letter' || tok.t === 'num') text += tok.v;
      else if (tok.t === 'sym' && (tok.v === ',' || tok.v === '.')) text += tok.v;
      else if (tok.t === 'sym' && (tok.v === '{' || tok.v === '}')) continue;
      else if (tok.t === 'cmd' && GREEK[tok.v]) text += GREEK[tok.v];
      else if (tok.t === 'cmd' && ROMAN_COMMANDS.has(tok.v)) continue;
      else throw new CalculationError('syntax', 'Subscripts may only contain letters and digits.');
    }
    if (!text) throw new CalculationError('incomplete', 'Empty subscript.');
    return text;
  }

  private takeSingleScriptToken(): Token[] {
    const tok = this.peek();
    if (tok.t === 'num' && tok.v.length > 1) {
      this.tokens[this.pos] = { t: 'num', v: tok.v.slice(1) };
      return [{ t: 'num', v: tok.v[0] }];
    }
    this.next();
    return [tok];
  }

  private withOptionalSubscript(e: Expr & { type: 'ident' }): Expr {
    if (!this.isSym('_')) return e;
    const sub = this.parseSubscriptText();
    return { ...e, name: `${e.name}_${sub}`, splittable: false };
  }

  private parseSymbolPrimary(v: string): Expr {
    if (v === '(' || v === '[') {
      const close = v === '(' ? ')' : ']';
      const inner = this.readBalancedTokens(v, close);
      return this.node({ type: 'group', body: this.subParse(inner), visible: true });
    }
    if (v === '{') {
      const inner = this.readBalancedTokens('{', '}');
      return this.node({ type: 'group', body: this.subParse(inner), visible: false });
    }
    if (v === '|') {
      this.next();
      return this.parseAbsBody(() => this.isSym('|') || this.isCmd('vert') || this.isCmd('rvert'));
    }
    if (v === '°') {
      this.next();
      return this.degreeIdent();
    }
    if (v === '%') {
      this.next();
      return this.node({ type: 'ident', name: '%', splittable: false, roman: false });
    }
    throw new CalculationError('syntax', `Unexpected "${v}".`);
  }

  private parseAbsBody(isClose: () => boolean): Expr {
    this.absDepth++;
    const body = this.parseExpr();
    this.absDepth--;
    if (!isClose()) throw new CalculationError('syntax', 'Missing closing "|".');
    this.next();
    return this.node({ type: 'call', fn: 'abs', args: [body] });
  }

  private parseCommandPrimary(v: string): Expr {
    if (v === 'placeholder') {
      throw new CalculationError('incomplete', 'Incomplete expression.');
    }
    this.next();
    if (v === 'overline' || v === 'bar') return this.node({ type: 'call', fn: 'conj', args: [this.parseBracedArg()] });
    if (v === 'sum' || v === 'prod') {
      this.expectSym('_');
      const lower = this.readBalancedTokens('{', '}');
      const equality = lower.findIndex(t => t.t === 'sym' && t.v === '=');
      if (equality < 0) throw new CalculationError('syntax', 'A bounded series needs index = first below the operator.');
      const variable = this.subParse(lower.slice(0, equality));
      if (variable.type !== 'ident') throw new CalculationError('syntax', 'A series index must be a variable name.');
      const first = this.subParse(lower.slice(equality + 1));
      this.expectSym('^');
      const last = this.parseScriptArg(), body = this.parseBracedArg();
      return this.node({ type: 'calculus', op: v === 'sum' ? 'summation' : 'product', variables: [variable.name], body, args: [first, last] });
    }
    if (v === 'int') {
      this.expectSym('_'); const lower = this.parseScriptArg();
      this.expectSym('^'); const upper = this.parseScriptArg();
      const start = this.pos;
      let depth = 0, differential = -1;
      for (let k = start; k < this.tokens.length; k++) {
        const t = this.tokens[k];
        if (depth === 0 && t.t === 'cmd' && t.v === 'mathrm' && this.tokens[k + 1]?.v === '{' && this.tokens[k + 2]?.v === 'd' && this.tokens[k + 3]?.v === '}') { differential = k; break; }
        if (t.t === 'sym' && ['(', '{', '['].includes(t.v)) depth++;
        if (t.t === 'sym' && [')', '}', ']'].includes(t.v)) depth--;
        if (depth < 0 || t.t === 'eof') break;
      }
      if (differential < 0) throw new CalculationError('incomplete', 'An integral needs a differential, e.g. \\int_{0}^{1}(x^2)\\,\\mathrm{d}x.');
      const body = this.subParse(this.tokens.slice(start, differential));
      this.pos = differential + 4;
      const variable = this.parsePrimaryAtom();
      if (variable.type !== 'ident') throw new CalculationError('syntax', 'The integration variable must be a variable name.');
      return this.node({ type: 'calculus', op: 'integral', variables: [variable.name], body, args: [lower, upper] });
    }
    if (v === 'lim') {
      this.expectSym('_');
      const lower = this.readBalancedTokens('{', '}');
      const arrow = lower.findIndex(t => t.t === 'cmd' && ['to', 'rightarrow'].includes(t.v));
      if (arrow < 0) throw new CalculationError('syntax', 'A limit needs variable → point below the operator.');
      const variable = this.subParse(lower.slice(0, arrow)), point = this.subParse(lower.slice(arrow + 1));
      if (variable.type !== 'ident') throw new CalculationError('syntax', 'The limit variable must be a variable name.');
      return this.node({ type: 'calculus', op: 'limit', variables: [variable.name], body: this.parseBracedArg(), args: [point] });
    }
    if (GREEK[v]) {
      // ΔT, δx: a Δ/δ directly followed by letters is one name (as in Mathcad), e.g. \Delta T_{max}.
      if ((v === 'Delta' || v === 'delta') && this.peek().t === 'letter' && !this.roman) {
        const save = this.pos;
        const rest = this.parseLetterRun();
        if (rest.type === 'ident') {
          return this.node({ type: 'ident', name: GREEK[v] + rest.name, splittable: false, roman: false });
        }
        this.pos = save;
      }
      return this.withOptionalSubscript(this.node({ type: 'ident', name: GREEK[v], splittable: false, roman: false }));
    }
    if (v === 'pi') return this.node({ type: 'ident', name: 'π', splittable: false, roman: false });
    if (v === 'imaginaryI') return this.node({ type: 'ident', name: 'ⅈ', splittable: false, roman: false });
    if (v === 'infty' || v === 'infin') return this.node({ type: 'ident', name: '∞', splittable: false, roman: false });
    if (v === 'exponentialE') return this.node({ type: 'num', value: Math.E, raw: 'e' });
    if (v === 'degree' || v === 'deg') return this.degreeIdent();
    if (v === 'lparen' || v === 'lbrack') {
      const body = this.parseExpr();
      if (!(this.isCmd('rparen') || this.isCmd('rbrack') || this.isSym(')') || this.isSym(']'))) {
        throw new CalculationError('syntax', 'Missing closing parenthesis.');
      }
      this.next();
      return this.node({ type: 'group', body, visible: true });
    }
    if (v === 'lVert' || v === 'Vert') {
      this.absDepth++;
      const body = this.parseExpr();
      this.absDepth--;
      if (!this.isCmd('rVert') && !this.isCmd('Vert')) throw new CalculationError('syntax', 'Missing closing norm bar.');
      this.next();
      return this.node({ type: 'call', fn: 'norm', args: [body] });
    }
    if (v === 'vert' || v === 'lvert') {
      return this.parseAbsBody(() => this.isCmd('rvert') || this.isCmd('vert') || this.isSym('|'));
    }
    if (FRAC_COMMANDS.has(v)) {
      const num = this.parseBracedArg();
      const den = this.parseBracedArg();
      return this.node({ type: 'binary', op: '/', left: num, right: den, frac: true });
    }
    if (v === 'sqrt') {
      let index: Expr | null = null;
      if (this.isSym('[')) index = this.subParse(this.readBalancedTokens('[', ']'));
      const arg = this.parseBracedArg();
      return index
        ? this.node({ type: 'call', fn: 'nthRoot', args: [arg, index] })
        : this.node({ type: 'call', fn: 'sqrt', args: [arg] });
    }
    if (FUNCTION_COMMANDS[v]) {
      if (v === 'log' && this.isSym('_')) {
        const base = this.parseSubscriptText();
        if (base !== '10') throw new CalculationError('syntax', 'Only log base 10 (\\log) and natural log (\\ln) are supported.');
      }
      return this.parseFunctionArgs(FUNCTION_COMMANDS[v]);
    }
    if (ROMAN_COMMANDS.has(v)) {
      const inner = this.readBalancedTokens('{', '}');
      const word = inner.every((t) => t.t === 'letter' || t.t === 'num') ? inner.map((t) => t.v).join('') : null;
      if (word === 'vec' && (this.isSym('(') || this.isCmd('lparen'))) {
        const parts = this.readArgumentTokens();
        if (parts.length !== 1) throw new CalculationError('syntax', 'vec takes one expression.');
        return this.node({ type: 'vectorize', body: this.subParse(parts[0]) });
      }
      if (v === 'operatorname' && word && FUNCTION_WORDS[word]) {
        return this.parseFunctionArgs(FUNCTION_WORDS[word]);
      }
      // \mathrm{atan}(x), \mathrm{sum}(v): a built-in function written upright and followed by a bracket.
      if (word && FUNCTION_WORDS[word] && (this.isSym('(') || this.isCmd('lparen'))) {
        return this.parseFunctionArgs(FUNCTION_WORDS[word]);
      }
      if (word === IF_WORD && (this.isSym('(') || this.isCmd('lparen'))) {
        return this.parseIf();
      }
      if (word === LET_WORD && (this.isSym('(') || this.isCmd('lparen'))) {
        return this.parseLet();
      }
      const e = this.subParse(inner, true);
      if (e.type === 'ident') return this.withOptionalSubscript(e);
      return this.node({ type: 'group', body: e, visible: false });
    }
    throw new CalculationError('syntax', `Unsupported LaTeX command \\${v}.`);
  }

  private parseFunctionArgs(fn: FunctionName): Expr {
    // Optional ^ on a function name (e.g. \sin^2) is not supported: be explicit.
    if (this.isSym('^')) {
      throw new CalculationError('syntax', 'Write powers of functions as (sin(x))^2.');
    }
    if (this.isSym('(') || this.isCmd('lparen')) {
      const args = this.readArgumentTokens().map((p) => this.subParse(p));
      if ((calculusNames as readonly string[]).includes(fn)) {
        const [body, binding, ...rest] = args;
        const names = binding?.type === 'ident' ? [binding.name] : binding?.type === 'matrix' ? binding.rows.flat().map(e => e.type === 'ident' ? e.name : '') : [];
        if (!body || !names.length || names.some(n => !n) || new Set(names).size !== names.length || (fn !== 'gradient' && names.length !== 1)) throw new CalculationError('syntax', `${fn}(expression, variable, point/bounds) needs distinct variable names.`);
        return this.node({ type: 'calculus', op: fn as CalculusName, variables: names, body, args: rest });
      }
      if (['eigenvecs', 'genvecs', 'lookup', 'hlookup', 'vlookup', 'vhlookup', 'match'].includes(fn)) {
        const last = args[args.length - 1];
        const selectorIndex = fn === 'eigenvecs' ? 1 : fn === 'genvecs' || fn === 'match' ? 2 : 3;
        if (args.length === selectorIndex + 1 && last?.type === 'ident' && last.roman) {
          const selectors: Record<string, number> = fn === 'eigenvecs' || fn === 'genvecs' ? { L: 1, R: 0 } : { eq: 0, near: 1, gt: 2, lt: 3, geq: 4, leq: 5, not: 6, range: 7 };
          if (last.name in selectors) args[args.length - 1] = this.node({ type: 'num', value: selectors[last.name], raw: String(selectors[last.name]) });
        }
      }
      const arity = (matrixFunctionNames as readonly string[]).includes(fn) || (operatorFunctionNames as readonly string[]).includes(fn) ? null : fn === 'min' || fn === 'max' || fn === 'sum' || fn === 'seq' || fn === 'map' || fn === 'stack' ? null : fn === 'linterp' ? 3 : fn === 'angle' || fn === 'sectionProp' ? 2 : 1;
      if (arity !== null && args.length !== arity) {
        throw new CalculationError('syntax', arity === 1 ? `${fn} takes exactly one argument.` : `${fn} takes ${arity} arguments.`);
      }
      return this.node({ type: 'call', fn, args });
    }
    // \sin x, \sin 30^{\circ}
    return this.node({ type: 'call', fn, args: [this.parsePower()] });
  }

  /** Reads a parenthesised argument list and splits it on top-level commas. */
  private readArgumentTokens(): Token[][] {
    let inner: Token[];
    if (this.isSym('(')) inner = this.readBalancedTokens('(', ')');
    else {
      this.next();
      inner = [];
      let level = 1;
      for (;;) {
        const tok = this.next();
        if (tok.t === 'eof') throw new CalculationError('syntax', 'Missing ")".');
        if (tok.t === 'cmd' && tok.v === 'lparen') level++;
        if (tok.t === 'cmd' && tok.v === 'rparen' && --level === 0) break;
        inner.push(tok);
      }
    }
    const parts: Token[][] = [[]];
    let level = 0;
    for (const tok of inner) {
      if (tok.t === 'sym' && (tok.v === '(' || tok.v === '{' || tok.v === '[')) level++;
      if (tok.t === 'sym' && (tok.v === ')' || tok.v === '}' || tok.v === ']')) level--;
      if (tok.t === 'sym' && tok.v === ',' && level === 0) parts.push([]);
      else parts[parts.length - 1].push(tok);
    }
    return parts;
  }

  /** if(condition, value if true, value if false); branches may themselves be if(…). */
  private parseIf(): Expr {
    const parts = this.readArgumentTokens();
    if (parts.length !== 3) {
      throw new CalculationError('syntax', 'if takes three arguments: if(condition, value if true, value if false).');
    }
    const cond = this.subParseCondition(parts[0]);
    const then = this.subParse(parts[1]);
    const otherwise = this.subParse(parts[2]);
    return this.node({ type: 'if', cond, then, else: otherwise });
  }

  /**
   * Mathcad-style if block:
   *   \begin{array}{|ll} a & \mathrm{if}\ c_1 \\ b & \mathrm{if}\ c_2 \\ c & \mathrm{otherwise} \end{array}
   * (\begin{cases} … \end{cases} too). Rows are tried top to bottom; the last row is "otherwise".
   */
  private parseIfBlock(): Expr {
    this.next(); // beginblock
    const inner: Token[] = [];
    let level = 1;
    for (;;) {
      const tok = this.next();
      if (tok.t === 'eof') throw new CalculationError('syntax', 'An if block is not closed.');
      if (tok.t === 'cmd' && (tok.v === 'beginblock' || tok.v.startsWith('beginmatrix:'))) level++;
      if (tok.t === 'cmd' && (tok.v === 'endblock' || tok.v === 'endmatrix') && --level === 0) break;
      inner.push(tok);
    }
    const rows: Token[][][] = [[[]]];
    level = 0;
    for (const tok of inner) {
      if (tok.t === 'cmd' && (tok.v === 'beginblock' || tok.v.startsWith('beginmatrix:'))) level++;
      if (tok.t === 'cmd' && (tok.v === 'endblock' || tok.v === 'endmatrix')) level--;
      if (level === 0 && tok.t === 'sym' && tok.v === 'row') rows.push([[]]);
      else if (level === 0 && tok.t === 'sym' && tok.v === '&') rows[rows.length - 1].push([]);
      else rows[rows.length - 1][rows[rows.length - 1].length - 1].push(tok);
    }
    const filled = rows.filter((r) => r.some((cell) => cell.length));
    if (!filled.some(r => r.some(cell => ['if', 'else', 'otherwise'].includes(leadingWord(cell)?.word ?? '')))) {
      for (let k = 0; k < inner.length; k++) if (inner[k].t === 'sym' && inner[k].v === 'row') {
        const before = inner[k - 1], after = inner[k + 1];
        const operation = (t: Token | undefined) => t && (['+', '-', '*', '/'].includes(t.v) || MUL_COMMANDS.has(t.v) || t.v === 'div');
        if (!operation(before) && !operation(after)) throw new CalculationError('syntax', 'An equation break must continue an arithmetic operation.');
      }
      return this.subParse(inner.filter(t => !(t.t === 'sym' && (t.v === 'row' || t.v === '&'))));
    }
    const usage = 'Write an if block as: if condition / value / else if condition / value / else / value (one per line).';
    type Branch = { value: Expr; cond: Condition | null };
    let branches: Branch[];
    if (filled.some((r) => r.length > 1)) {
      // Two columns: "value & if condition", last row "value & otherwise".
      if (filled.length < 2) throw new CalculationError('syntax', usage);
      branches = filled.map((r, k) => {
        if (r.length !== 2) throw new CalculationError('syntax', usage);
        const [value, rest] = r;
        const word = leadingWord(rest);
        if (!word) throw new CalculationError('syntax', usage);
        const last = k === filled.length - 1;
        if (word.word === 'otherwise' || word.word === 'else') {
          if (!last || word.rest.length) throw new CalculationError('syntax', '"otherwise" must be the last row, without a condition.');
          return { value: this.subParse(value), cond: null };
        }
        if (word.word !== IF_WORD) throw new CalculationError('syntax', usage);
        if (last) throw new CalculationError('syntax', 'The last row of an if block must be "otherwise".');
        return { value: this.subParse(value), cond: this.subParseCondition(word.rest) };
      });
    } else {
      // Mathcad Prime layout, one column: "if c₁" / value / "else if c₂" / value / "else" / value.
      const lines = filled.map((r) => r[0]);
      branches = [];
      let k = 0;
      while (k < lines.length) {
        const w = leadingWord(lines[k]);
        if (!w) throw new CalculationError('syntax', usage);
        let cond: Condition | null;
        if (w.word === IF_WORD && branches.length === 0) cond = this.subParseCondition(w.rest);
        else if (w.word === 'else' || w.word === 'otherwise') {
          const w2 = w.rest.length ? leadingWord(w.rest) : null;
          if (w2 && w2.word === IF_WORD && branches.length > 0) cond = this.subParseCondition(w2.rest);
          else if (!w.rest.length && branches.length > 0) cond = null;
          else throw new CalculationError('syntax', usage);
        } else throw new CalculationError('syntax', usage);
        const valueTokens = lines[k + 1];
        if (!valueTokens || ['if', 'else', 'otherwise'].includes(leadingWord(valueTokens)?.word ?? '')) throw new CalculationError('syntax', 'Each "if", "else if" and "else" line needs a value on the next line.');
        branches.push({ value: this.subParse(valueTokens), cond });
        k += 2;
        if (cond === null && k < lines.length) throw new CalculationError('syntax', '"else" must be the last case.');
      }
      if (branches.length < 2 || branches[branches.length - 1].cond !== null) throw new CalculationError('syntax', 'An if block must end with "else" and a value.');
    }
    let out: Expr = branches[branches.length - 1].value;
    for (let k = branches.length - 2; k >= 0; k--) out = this.node({ type: 'if', cond: branches[k].cond!, then: branches[k].value, else: out });
    return out;
  }

  /** let(n₁, v₁, …, body): an odd number (≥ 3) of arguments; every name a single variable. */
  private parseLet(): Expr {
    const parts = this.readArgumentTokens();
    if (parts.length < 3 || parts.length % 2 === 0) {
      throw new CalculationError('syntax', 'let takes name, value pairs and then an expression: let(i, seq(0, n−1), r·cos(2π·i/n)).');
    }
    const bindings: { name: string; value: Expr }[] = [];
    for (let k = 0; k + 1 < parts.length; k += 2) {
      const n = this.subParse(parts[k]);
      if (n.type !== 'ident') throw new CalculationError('syntax', 'In let, every name must be a single variable name (e.g. i or x_{1}).');
      bindings.push({ name: n.name, value: this.subParse(parts[k + 1]) });
    }
    return this.node({ type: 'let', bindings, body: this.subParse(parts[parts.length - 1]) });
  }

  /** Condition with ∨ (or, \\lor/\\vee) and ∧ (and, \\land/\\wedge); ∧ binds tighter. */
  private subParseCondition(inner: Token[]): Condition {
    try {
      const expression = this.subParse(inner);
      const condition = (e: Expr): Condition | null => {
        if (e.type === 'group') return condition(e.body);
        if (e.type === 'compare') return { left: e.left, op: e.op, right: e.right };
        if (e.type === 'logic' && (e.op === 'and' || e.op === 'or')) {
          const a = condition(e.left), b = condition(e.right!);
          if (a && b) return { logic: e.op, a, b };
        }
        if (e.type === 'logic' || e.type === 'call' && e.fn === 'contains') return { left: e, op: '!=', right: this.node({ type: 'num', value: 0, raw: '0' }) };
        return null;
      };
      const parsed = condition(expression);
      if (parsed) return parsed;
    } catch (error) {
      if (!(error instanceof CalculationError) || !['syntax', 'incomplete'].includes(error.code)) throw error;
      // A plain '=' inside if remains the supported equality spelling.
    }
    if (inner.some(t => t.t === 'cmd' && ['neg', 'lnot', 'oplus', 'in'].includes(t.v) || t.t === 'sym' && t.v === '¬')) {
      return { left: this.subParse(inner), op: '!=', right: this.node({ type: 'num', value: 0, raw: '0' }) };
    }
    const split = (toks: Token[], names: string[]): Token[][] => {
      const parts: Token[][] = [[]];
      let level = 0;
      for (const t of toks) {
        if (t.t === 'sym' && (t.v === '(' || t.v === '{' || t.v === '[')) level++;
        if (t.t === 'sym' && (t.v === ')' || t.v === '}' || t.v === ']')) level--;
        if (t.t === 'cmd' && (t.v === 'lparen')) level++;
        if (t.t === 'cmd' && (t.v === 'rparen')) level--;
        if (level === 0 && t.t === 'cmd' && names.includes(t.v)) parts.push([]);
        else parts[parts.length - 1].push(t);
      }
      return parts;
    };
    const join = (logic: 'and' | 'or', cs: Condition[]): Condition => cs.reduce((a, b) => ({ logic, a, b }));
    const ors = split(inner, ['lor', 'vee']);
    return join('or', ors.map((o) => join('and', split(o, ['land', 'wedge']).map((t) => this.subParseComparison(t)))));
  }

  private subParseComparison(inner: Token[]): Comparison {
    const sub = new Parser([...inner, { t: 'eof', v: '' }], this.roman);
    sub.nodes = this.nodes;
    sub.depth = this.depth;
    if (sub.atEnd()) throw new CalculationError('incomplete', 'Incomplete condition in if.');
    const left = sub.parseArithmetic();
    // Inside if, a plain "=" can only mean equality.
    const op: Relation | null = sub.isSym('=') ? '==' : sub.peekRelation();
    if (!op) {
      throw new CalculationError('syntax', 'The first argument of if must be a comparison, e.g. if(N > 0 kN, a, b).');
    }
    if (op === '==' && sub.isSym('=')) sub.next();
    else sub.consumeRelation(op);
    if (sub.atEnd()) throw new CalculationError('incomplete', 'Incomplete condition in if: add the value to compare with.');
    const right = sub.parseArithmetic();
    if (!sub.atEnd()) throw new CalculationError('syntax', `Unexpected "${sub.peek().v}" in the condition of if.`);
    this.nodes = sub.nodes;
    return { left, op, right };
  }
}

/** Parse MathLive LaTeX into a statement. Throws CalculationError on invalid input. */
export function parseLatex(latex: string): Statement {
  const parser = new Parser(tokenize(latex));
  return parser.parseStatement();
}

/** "if"/"otherwise" at the start of a cell: \mathrm{if}, \text{if} or plain letters; the rest is the condition. */
function leadingWord(tokens: Token[]): { word: string; rest: Token[] } | null {
  const t = tokens;
  if (t[0]?.t === 'cmd' && ROMAN_COMMANDS.has(t[0].v) && t[1]?.t === 'sym' && t[1].v === '{') {
    let k = 2;
    let word = '';
    while (t[k]?.t === 'letter') word += t[k++].v;
    if (t[k]?.t === 'sym' && t[k].v === '}' && word) return { word, rest: t.slice(k + 1) };
    return null;
  }
  for (const w of ['otherwise', 'else', IF_WORD]) {
    if (w.split('').every((ch, k) => t[k]?.t === 'letter' && t[k].v === ch)) return { word: w, rest: t.slice(w.length) };
  }
  return null;
}
