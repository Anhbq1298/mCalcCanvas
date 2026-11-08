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
import { CalculationError } from './CalculationErrors';
import type { Condition, Expr, FunctionName, Relation, Statement } from './ExpressionTypes';

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
  sin: 'sin', cos: 'cos', tan: 'tan',
  arcsin: 'asin', arccos: 'acos', arctan: 'atan',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
  ln: 'ln', log: 'log', exp: 'exp', min: 'min', max: 'max',
};

/** Plain-letter runs that MathLive may leave un-converted. */
const FUNCTION_WORDS: Record<string, FunctionName> = {
  ...FUNCTION_COMMANDS,
  asin: 'asin', acos: 'acos', atan: 'atan', sqrt: 'sqrt', abs: 'abs',
  sum: 'sum', len: 'len', seq: 'seq', angle: 'angle', map: 'map', linterp: 'linterp', stack: 'stack',
};

/** Functions written upright (\mathrm{sum}) that would otherwise read as a variable. */
const ROMAN_FUNCTION_WORDS = new Set<FunctionName>(['sum', 'len', 'seq', 'angle', 'map', 'linterp', 'stack']);

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

export function tokenize(latex: string): Token[] {
  if (latex.length > MAX_LATEX_LENGTH) {
    throw new CalculationError('limit-exceeded', `Expression is too long (max ${MAX_LATEX_LENGTH} characters).`);
  }
  const tokens: Token[] = [];
  let i = 0;
  const s = latex;
  while (i < s.length) {
    const c = s[i];
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
        left = this.node({ type: 'binary', op: '*', left, right: this.parseUnary() });
      } else if ((tok.t === 'sym' && tok.v === '/') || (tok.t === 'cmd' && tok.v === 'div')) {
        this.next();
        left = this.node({ type: 'binary', op: '/', left, right: this.parseUnary() });
      } else if (this.startsPrimary()) {
        left = this.node({ type: 'binary', op: '*', left, right: this.parsePower(), implicit: true });
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
    const base = this.parsePrimary();
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
        if (tok.v === 'vert' || tok.v === 'lvert') return this.absDepth === 0 || tok.v === 'lvert';
        return (
          tok.v in GREEK || tok.v === 'pi' || ROMAN_COMMANDS.has(tok.v) || FRAC_COMMANDS.has(tok.v) ||
          tok.v === 'sqrt' || tok.v in FUNCTION_COMMANDS || tok.v === 'exponentialE' || tok.v === 'infty' ||
          tok.v === 'placeholder' || tok.v === 'degree' || tok.v === 'deg' || tok.v === 'lparen' || tok.v === 'lbrack'
        );
      default:
        return false;
    }
  }

  private parsePrimary(): Expr {
    const e = this.parsePrimaryAtom();
    if (e.type !== 'ident' || !(this.isSym('(') || this.isCmd('lparen'))) return e;
    // name(args): a user-function call when "name" is one (decided at evaluation).
    // name(x)^2 keeps the old reading name·(x)², so leave it to the caller.
    const save = this.pos;
    const parts = this.readArgumentTokens();
    if (this.isSym('^')) {
      this.pos = save;
      return e;
    }
    const args = parts.map((p) => this.subParse(p));
    return this.node({ type: 'apply', head: e, args });
  }

  private parsePrimaryAtom(): Expr {
    const tok = this.peek();
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

  private parseLetterRun(): Expr {
    // Count the run of consecutive letters.
    let n = 0;
    while (this.peek(n).t === 'letter') n++;
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
    if (GREEK[v]) {
      return this.withOptionalSubscript(this.node({ type: 'ident', name: GREEK[v], splittable: false, roman: false }));
    }
    if (v === 'pi') return this.node({ type: 'ident', name: 'π', splittable: false, roman: false });
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
      const word = inner.every((t) => t.t === 'letter') ? inner.map((t) => t.v).join('') : null;
      if (v === 'operatorname' && word && FUNCTION_WORDS[word]) {
        return this.parseFunctionArgs(FUNCTION_WORDS[word]);
      }
      if (word && ROMAN_FUNCTION_WORDS.has(FUNCTION_WORDS[word]) && (this.isSym('(') || this.isCmd('lparen'))) {
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
      const arity = fn === 'min' || fn === 'max' || fn === 'sum' || fn === 'seq' || fn === 'map' || fn === 'stack' ? null : fn === 'linterp' ? 3 : fn === 'angle' ? 2 : 1;
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

  private subParseCondition(inner: Token[]): Condition {
    const sub = new Parser([...inner, { t: 'eof', v: '' }], this.roman);
    sub.nodes = this.nodes;
    sub.depth = this.depth;
    if (sub.atEnd()) throw new CalculationError('incomplete', 'Incomplete condition in if.');
    const left = sub.parseExpr();
    // Inside if, a plain "=" can only mean equality.
    const op: Relation | null = sub.isSym('=') ? '==' : sub.peekRelation();
    if (!op) {
      throw new CalculationError('syntax', 'The first argument of if must be a comparison, e.g. if(N > 0 kN, a, b).');
    }
    if (op === '==' && sub.isSym('=')) sub.next();
    else sub.consumeRelation(op);
    if (sub.atEnd()) throw new CalculationError('incomplete', 'Incomplete condition in if: add the value to compare with.');
    const right = sub.parseExpr();
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
