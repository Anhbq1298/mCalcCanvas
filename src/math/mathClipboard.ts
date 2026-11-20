import type { MathfieldElement } from 'mathlive';

/**
 * Clipboard helpers for math. MathLive copies a selection as "$$ latex $$" (text/plain); these make a copied name
 * whole (base + its subscript) and let that text paste as math on the worksheet and as readable text in a text
 * region, instead of showing the LaTeX source.
 */

type Atom = { type?: string; subscript?: Atom[]; parent?: Atom; parentBranch?: unknown };
type Model = { at(i: number): Atom | undefined; offsetOf(a: Atom): number; lastOffset?: number };

const modelOf = (mf: MathfieldElement): Model | undefined =>
  (mf as unknown as { _mathfield?: { model?: Model } })._mathfield?.model;

/**
 * Before a copy: a selection that cuts a name with a subscript takes the whole name, so f_{c.k} is copied, not f
 * alone or c.k alone. In MathLive's model a name is its base atom, the subscript's atoms, then a "subsup" atom
 * holding the subscript. Uses that model (not public API); without it the selection is left as it is.
 */
export function wholeNameSelection(mf: MathfieldElement): void {
  const model = modelOf(mf);
  const range = mf.selection?.ranges?.[0];
  if (!model || !range || range[0] === range[1]) return;
  let [s, e] = range[0] <= range[1] ? [range[0], range[1]] : [range[1], range[0]];
  const last = mf.lastOffset;
  const inSub = (a: Atom | undefined) => a?.parentBranch === 'subscript' && a.parent?.type === 'subsup';
  try {
    // end: inside a subscript → its subsup; on a base followed by a subscript → that subsup
    const ae = model.at(e);
    if (inSub(ae)) e = model.offsetOf(ae!.parent!);
    else if (ae && ae.parentBranch !== 'subscript') {
      let k = e + 1;
      while (k <= last && inSub(model.at(k))) k++;
      if (k > e + 1 && model.at(k)?.type === 'subsup') e = k;
    }
    // start: inside a subscript (or on its subsup) → before the base of that name
    const as = model.at(s + 1);
    const sup = inSub(as) ? as!.parent! : as?.type === 'subsup' ? as : undefined;
    if (sup?.subscript?.[0]) s = Math.max(0, model.offsetOf(sup.subscript[0]) - 2);
    if (s !== range[0] || e !== range[1]) mf.selection = { ranges: [[s, e]] };
  } catch { /* leave MathLive's selection */ }
}

/** The LaTeX of math copied by MathLive ("$$ … $$", "\[ … \]" or "\( … \)"), else null. */
export function copiedMath(text: string): string | null {
  const m = /^\s*(?:\$\$([\s\S]*)\$\$|\\\[([\s\S]*)\\\]|\\\(([\s\S]*)\\\))\s*$/.exec(text);
  const latex = (m?.[1] ?? m?.[2] ?? m?.[3])?.trim();
  return latex ? latex : null;
}

const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
  iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ',
  phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω', cdot: '·', times: '×', div: '÷', pm: '±', le: '≤', leq: '≤', ge: '≥', geq: '≥',
  ne: '≠', neq: '≠', approx: '≈', infty: '∞', coloneq: '≔', degree: '°', circ: '°', partial: '∂', sum: 'Σ', int: '∫', to: '→',
  rightarrow: '→', leftarrow: '←', ldots: '…', cdots: '⋯', percent: '%', sqrt: '√',
};

/**
 * Readable text (HTML) for copied math, for a text region: Greek letters and operators as characters, indices as
 * sub/superscripts, \mathrm{kN} as kN, \frac{a}{b} as a/b. Anything unknown keeps its name without the backslash.
 */
export function mathToTextHtml(latex: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let i = 0;
  const group = (): string => {
    if (latex[i] === '{') {
      i++;
      let out = '';
      while (i < latex.length && latex[i] !== '}') out += atom();
      i++;
      return out;
    }
    return atom();
  };
  const atom = (): string => {
    const c = latex[i];
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(latex.slice(i))!;
      i += m[0].length;
      const name = m[1];
      if (name === 'frac' || name === 'dfrac') { const a = group(), b = group(); return `${a}/${b}`; }
      if (['mathrm', 'mathit', 'mathbf', 'text', 'textrm', 'operatorname', 'unit', 'mathsf'].includes(name)) return group();
      if (name === 'sqrt') return `√(${group()})`;
      if (name === 'left' || name === 'right') return atom();
      if (name === 'char') { const n = /^"([0-9A-Fa-f]+)\s*/.exec(latex.slice(i)); if (n) { i += n[0].length; return String.fromCodePoint(parseInt(n[1], 16)); } return ''; }
      if (name === ',' || name === ';' || name === ' ' || name === 'quad') return ' ';
      if (name === '%') return '%';
      return SYMBOLS[name] ?? name;
    }
    i++;
    if (c === '_') return `<sub>${group()}</sub>`;
    if (c === '^') return `<sup>${group()}</sup>`;
    if (c === '{') { i--; return group(); }
    if (c === '}' || c === '~') return c === '~' ? ' ' : '';
    if (c === ' ') return '';
    return esc(c);
  };
  let out = '';
  while (i < latex.length) out += atom();
  return out;
}
