/**
 * Expression tree → LaTeX printer.
 *
 * Used for the "result only" and "full calculation" display modes. The
 * substituted line is printed from the same tree and the same values the
 * engine evaluated, so intermediate steps are never invented.
 */
import type { Condition, Expr, Relation } from './ExpressionTypes';
import { matrixFunctionNames } from './matrixNames';
import { GREEK } from './LatexParser';
import { applyAsProduct, resolveIdent, type EvalContext, type ResolveContext } from './ExpressionEvaluator';
import { UNITS } from './UnitSystem';

const GREEK_BY_CHAR: Record<string, string> = Object.fromEntries(
  Object.entries(GREEK).map(([cmd, ch]) => [ch, `\\${cmd}`]),
);

const SPECIAL: Record<string, string> = { 'π': '\\pi', '∞': '\\infty', '%': '\\%' };

function symbolLatex(s: string): string {
  if (s.length === 1) return GREEK_BY_CHAR[s] ?? SPECIAL[s] ?? s;
  if ([...s].every((c) => GREEK_BY_CHAR[c])) return [...s].map((c) => GREEK_BY_CHAR[c] + ' ').join('').trim();
  return `\\mathrm{${s}}`;
}

/** Variable name → LaTeX: "M_Ed" → M_{\mathrm{Ed}}, "η_M" → \eta_{M}. */
export function nameToLatex(name: string): string {
  const idx = name.indexOf('_');
  if (idx < 0) return symbolLatex(name);
  const base = symbolLatex(name.slice(0, idx));
  const sub = name.slice(idx + 1);
  const subLatex = /^[0-9.,]+$/.test(sub) || sub.length === 1 ? (GREEK_BY_CHAR[sub] ?? sub) : `\\mathrm{${sub}}`;
  return `${base}_{${subLatex}}`;
}

export const RELATION_LATEX: Record<Relation, string> = {
  '<': '<', '<=': '\\le', '>': '>', '>=': '\\ge', '==': '=', '!=': '\\ne',
};

interface PrintOptions {
  ctx: ResolveContext;
  /** Return LaTeX for a variable's value to substitute it, or null to print its name. */
  substitute?: (name: string) => { latex: string; hasUnit: boolean; negative: boolean } | null;
}

const PREC = { add: 1, mul: 2, unary: 3, pow: 4, atom: 5 } as const;

interface Printed {
  latex: string;
  prec: number;
  /** true when the printed text is a substituted value carrying a unit */
  quantity?: boolean;
}

export function exprToLatex(expr: Expr, opts: PrintOptions): string {
  return print(expr, opts).latex;
}

function wrap(p: Printed, minPrec: number, force = false): string {
  return p.prec < minPrec || force ? `\\left(${p.latex}\\right)` : p.latex;
}

function print(expr: Expr, opts: PrintOptions): Printed {
  switch (expr.type) {
    case 'matrix':
      return { latex: `\\begin{bmatrix}${expr.rows.map((r) => r.map((e) => print(e, opts).latex).join('&')).join('\\\\')}\\end{bmatrix}`, prec: PREC.atom };
    case 'vectorize':
      return { latex: `\\overrightarrow{${print(expr.body, opts).latex}}`, prec: PREC.atom };
    case 'num':
      return { latex: expr.raw === 'e' ? '\\mathrm{e}' : expr.raw, prec: PREC.atom };

    case 'ident': {
      const r = resolveIdent(expr, opts.ctx);
      if (!r.ok) return { latex: expr.roman ? `\\mathrm{${expr.name}}` : nameToLatex(expr.name), prec: PREC.atom };
      const factors: Printed[] = r.parts.map((p) => {
        if (p.kind === 'unit') return { latex: `\\mathrm{${UNITS.get(p.symbol)?.latex ?? p.symbol}}`, prec: PREC.atom };
        if (p.kind === 'const') return { latex: symbolLatex(p.name), prec: PREC.atom };
        const sub = opts.substitute?.(p.name);
        if (sub) {
          return {
            latex: sub.latex,
            prec: sub.negative ? PREC.unary : sub.hasUnit ? PREC.mul : PREC.atom,
            quantity: sub.hasUnit,
          };
        }
        return { latex: nameToLatex(p.name), prec: PREC.atom };
      });
      if (factors.length === 1) return factors[0];
      const substituted = factors.some((f) => f.quantity || f.prec < PREC.atom);
      return {
        latex: factors.map((f) => wrap(f, PREC.atom, substituted && f.quantity)).join(substituted ? '\\cdot ' : ''),
        prec: PREC.mul,
      };
    }

    case 'group': {
      const inner = print(expr.body, opts);
      return expr.visible ? { latex: `\\left(${inner.latex}\\right)`, prec: PREC.atom } : inner;
    }

    case 'unary': {
      const arg = print(expr.arg, opts);
      return { latex: `${expr.op}${wrap(arg, PREC.unary)}`, prec: PREC.unary };
    }

    case 'binary': {
      const l = print(expr.left, opts);
      const r = print(expr.right, opts);
      switch (expr.op) {
        case '+':
          return { latex: `${wrap(l, PREC.add)}+${wrap(r, PREC.add)}`, prec: PREC.add };
        case '-':
          return { latex: `${wrap(l, PREC.add)}-${wrap(r, PREC.add + 1)}`, prec: PREC.add };
        case '*': {
          const anyQuantity = l.quantity || r.quantity;
          const lt = wrap(l, PREC.mul, anyQuantity && l.quantity && l.prec < PREC.atom);
          const rt = wrap(r, PREC.mul + (expr.implicit ? 1 : 0), anyQuantity && r.quantity && r.prec < PREC.atom);
          const implicitOk = expr.implicit && !anyQuantity && !/^[0-9.]/.test(rt);
          return { latex: implicitOk && !expr.cross ? `${lt}${rt}` : `${lt}${expr.cross ? '\\times' : '\\cdot'} ${rt}`, prec: PREC.mul };
        }
        case '/':
          if (expr.frac) return { latex: `\\frac{${l.latex}}{${r.latex}}`, prec: PREC.atom };
          return { latex: `${wrap(l, PREC.mul)}/${wrap(r, PREC.mul + 1, !!r.quantity)}`, prec: PREC.mul };
        case '^': {
          // Mirror the evaluator: "wL^2" that splits prints as w·L^2.
          if (expr.left.type === 'ident' && expr.left.splittable) {
            const res = resolveIdent(expr.left, opts.ctx);
            if (res.ok && res.parts.length > 1) {
              const name = expr.left.name;
              const head: Expr = { type: 'ident', name: name.slice(0, -1), splittable: name.length > 2, roman: false };
              const tail: Expr = { type: 'ident', name: name.slice(-1), splittable: false, roman: false };
              return print(
                { type: 'binary', op: '*', implicit: true, left: head, right: { type: 'binary', op: '^', left: tail, right: expr.right } },
                opts,
              );
            }
          }
          return { latex: `${wrap(l, PREC.atom, !!l.quantity)}^{${r.latex}}`, prec: PREC.pow };
        }
      }
      break;
    }

    case 'call': {
      const args = expr.args.map((a) => print(a, opts).latex);
      if ((matrixFunctionNames as readonly string[]).includes(expr.fn)) return { latex: `\\mathrm{${expr.fn}}\\left(${args.join(',')}\\right)`, prec: PREC.atom };
      switch (expr.fn) {
        case 'sqrt':
          return { latex: `\\sqrt{${args[0]}}`, prec: PREC.atom };
        case 'nthRoot':
          return { latex: `\\sqrt[${args[1]}]{${args[0]}}`, prec: PREC.atom };
        case 'abs':
          return { latex: `\\left|${args[0]}\\right|`, prec: PREC.atom };
        case 'sum':
        case 'len':
        case 'seq':
        case 'angle':
        case 'floor':
        case 'ceil':
        case 'map':
        case 'linterp':
        case 'stack':
          return { latex: `\\mathrm{${expr.fn}}\\left(${args.join(',')}\\right)`, prec: PREC.atom };
        case 'asin':
        case 'acos':
        case 'atan':
          return { latex: `\\arc${expr.fn.slice(1)}\\left(${args.join(',')}\\right)`, prec: PREC.atom };
        default:
          return { latex: `\\${expr.fn}\\left(${args.join(',')}\\right)`, prec: PREC.atom };
      }
    }

    case 'let': {
      // Local names are printed by name (never substituted) and resolve as variables.
      const parts: string[] = [];
      let scope = opts;
      const locals = new Set<string>();
      for (const b of expr.bindings) {
        parts.push(nameToLatex(b.name), print(b.value, scope).latex);
        locals.add(b.name);
        const outer = opts;
        scope = {
          ctx: { isDefined: (n) => locals.has(n) || outer.ctx.isDefined(n) },
          substitute: outer.substitute && ((n) => (locals.has(n) ? null : outer.substitute!(n))),
        };
      }
      return { latex: `\\mathrm{let}\\left(${[...parts, print(expr.body, scope).latex].join(',')}\\right)`, prec: PREC.atom };
    }

    case 'apply': {
      const isFn = !expr.head.roman && !!(opts.ctx as Partial<EvalContext>).getFunction?.(expr.head.name);
      const powTex = expr.pow ? `^{${print(expr.pow, opts).latex}}` : '';
      if (isFn) {
        const args = expr.args.map((a) => print(a, opts).latex);
        return { latex: `${nameToLatex(expr.head.name)}\\left(${args.join(',')}\\right)${powTex}`, prec: expr.pow ? PREC.pow : PREC.atom };
      }
      if (expr.args.length !== 1) {
        return { latex: `${nameToLatex(expr.head.name)}\\left(${expr.args.map((a) => print(a, opts).latex).join(',')}\\right)${powTex}`, prec: PREC.atom };
      }
      // name·(arg): one factor followed by a bracket, so it binds like an atom.
      return { ...print(applyAsProduct(expr), opts), prec: PREC.atom };
    }

    case 'range': {
      const start = print(expr.start, opts).latex;
      const next = expr.next ? `,${print(expr.next, opts).latex}` : '';
      return { latex: `${start}${next}\\,..\\,${print(expr.end, opts).latex}`, prec: PREC.add };
    }

    case 'if': {
      // Mathcad Prime block: "if c" / value / "else if c" / value / "else" / value.
      const rows: string[] = [];
      let e: Expr = expr;
      let first = true;
      while (e.type === 'if') {
        const cond = conditionLatex(e.cond, opts);
        rows.push(`${first ? '\\mathrm{if}' : '\\mathrm{else}\\ \\mathrm{if}'}\\ ${cond}`, `\\quad\\left\\Vert\\displaystyle ${print(e.then, opts).latex}\\right.`);
        first = false;
        e = e.else;
      }
      rows.push('\\mathrm{else}', `\\quad\\left\\Vert\\displaystyle ${print(e, opts).latex}\\right.`);
      return { latex: `\\begin{array}{||l}${rows.join('\\\\')}\\end{array}`, prec: PREC.atom };
    }
  }
  return { latex: '', prec: PREC.atom };
}

function conditionLatex(c: Condition, opts: PrintOptions): string {
  if ('logic' in c) {
    const side = (x: Condition) => ('logic' in x && x.logic === 'or' && c.logic === 'and' ? `\\left(${conditionLatex(x, opts)}\\right)` : conditionLatex(x, opts));
    return `${side(c.a)}${c.logic === 'and' ? '\\land ' : '\\lor '}${side(c.b)}`;
  }
  return `${print(c.left, opts).latex} ${RELATION_LATEX[c.op]} ${print(c.right, opts).latex}`;
}
