/**
 * Mathcad-style keystrokes for the MathLive editor.
 *
 *   :          definition  ≔        (typing ":=" still works)
 *   =          evaluate the whole region (jumps out of fractions/exponents)
 *   \          square root           Ctrl+\   nth root
 *   |          absolute value        '        parentheses around selection
 *   .          literal subscript after a name (M.Ed → M_Ed)
 *   ;          range operator  ..    (i := 0..n−1)
 *   Ctrl+G     Greek ↔ Latin for the letter before the caret (a ↔ α)
 *   Ctrl+9 / Ctrl+0 / Ctrl+3 / Ctrl+=    ≤  ≥  ≠  (boolean =)
 *   Ctrl+Shift+P   π
 */
import type { MathfieldElement } from 'mathlive';

/** Mathcad's Symbol-font mapping (Ctrl+G). */
const GREEK_FROM_LATIN: Record<string, string> = {
  a: '\\alpha', b: '\\beta', g: '\\gamma', d: '\\delta', e: '\\epsilon', z: '\\zeta', h: '\\eta', q: '\\theta',
  i: '\\iota', k: '\\kappa', l: '\\lambda', m: '\\mu', n: '\\nu', x: '\\xi', p: '\\pi', r: '\\rho', s: '\\sigma',
  t: '\\tau', u: '\\upsilon', f: '\\phi', j: '\\varphi', c: '\\chi', y: '\\psi', w: '\\omega', v: '\\varpi',
  G: '\\Gamma', D: '\\Delta', Q: '\\Theta', L: '\\Lambda', X: '\\Xi', P: '\\Pi', S: '\\Sigma', U: '\\Upsilon',
  F: '\\Phi', Y: '\\Psi', W: '\\Omega',
};
const LATIN_FROM_GREEK: Record<string, string> = Object.fromEntries(Object.entries(GREEK_FROM_LATIN).map(([k, v]) => [v, k]));

type Insert = (latex: string) => void;

function charBefore(mf: MathfieldElement): string {
  if (mf.position <= 0) return '';
  return mf.getValue(mf.position - 1, mf.position, 'latex').trim();
}

/**
 * Handle a keydown (capture phase, before MathLive). Returns true when the
 * key was consumed.
 */
export function handleMathcadKey(e: KeyboardEvent, mf: MathfieldElement, changed: () => void): boolean {
  const insert: Insert = (latex) => {
    mf.insert(latex, { selectionMode: 'placeholder', focus: true });
    changed();
  };
  const mod = e.ctrlKey || e.metaKey;
  const before = () => mf.getValue(0, mf.position, 'latex');

  if (mod && !e.altKey) {
    if (e.shiftKey && e.key.toLowerCase() === 'p') return insert('\\pi'), true;
    if (e.shiftKey) return false;
    switch (e.key) {
      case '9':
        return insert('\\le '), true;
      case '0':
        return insert('\\ge '), true;
      case '3':
        return insert('\\ne '), true;
      case '=':
        return insert('\\equiv '), true;
      case '\\':
        return insert('\\sqrt[#?]{#?}'), true;
    }
    if (e.key.toLowerCase() === 'g') {
      const prev = charBefore(mf);
      const swap = GREEK_FROM_LATIN[prev] ?? LATIN_FROM_GREEK[prev];
      if (!swap) return true; // nothing to convert; still swallow (no browser shortcut)
      mf.executeCommand('deleteBackward');
      insert(swap);
      return true;
    }
    return false;
  }
  if (e.altKey) return false;

  switch (e.key) {
    case ':': {
      if (before().endsWith(':') || before().endsWith('\\coloneq')) return false;
      insert('\\coloneq ');
      return true;
    }
    case '=': {
      const b = before().trimEnd();
      // ":=" typed out of habit: the ":" already produced ≔.
      if (b.endsWith('\\coloneq')) return true;
      if (mf.position === mf.lastOffset) return false;
      mf.executeCommand('moveToMathfieldEnd');
      insert('=');
      return true;
    }
    case '/': {
      // The unit macro is atomic, so MathLive would not use it as numerator:
      // "kN/m" must become \frac{\unit{kN}}{m}.
      const m = /\\unit\{([A-Za-z]+)\}\s*$/.exec(before());
      if (!m) return false;
      // Remove the unit atom (MathLive may need several deletes for a macro).
      for (let i = 0; i < 8 && /\\unit\{[A-Za-z]+\}\s*$/.test(before()); i++) mf.executeCommand('deleteBackward');
      insert(`\\frac{\\unit{${m[1]}}}{#?}`);
      return true;
    }
    case '\\':
      insert('\\sqrt{#?}');
      return true;
    case ';':
      // Range variable: i := 0..n−1 (Mathcad).
      insert('..');
      return true;
    case '|':
      insert('\\left|#?\\right|');
      return true;
    case "'":
      insert('\\left(#@\\right)');
      return true;
    case '.': {
      // After a name, "." starts a literal subscript; after a digit it is a decimal point.
      const prev = charBefore(mf);
      if (/^[A-Za-z]$/.test(prev) || /^\\[a-zA-Z]+$/.test(prev) && prev in LATIN_FROM_GREEK) {
        if (/\d\s*$/.test(before())) return false;
        mf.executeCommand('moveToSubscript');
        changed();
        return true;
      }
      return false;
    }
  }
  return false;
}
