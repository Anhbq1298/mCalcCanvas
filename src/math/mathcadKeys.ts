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

function isLimitOperator(latex: string): boolean {
  return /^\\(?:sum|prod|coprod|[a-z]*int|lim[a-z]*|big[a-z]+|min|max|sup|inf)(?![A-Za-z])/.test(latex.replace(/^\\operatorname\{([^{}]+)\}$/, '\\$1'));
}

function hasLiteralSubscript(latex: string): boolean {
  // Limits of sums, integrals and limit operators are mathematical expressions.
  if (isLimitOperator(latex)) return false;
  let braces = 0;
  for (const char of latex) {
    if (char === '{') braces++;
    else if (char === '}') braces--;
    else if (char === '_' && braces === 0) return true;
  }
  return false;
}

/** Inspect existing branches with public navigation commands; never change the expression. */
export function leaveLiteralSubscript(mf: MathfieldElement): void {
  if (!mf.selectionIsCollapsed) return;
  const original = mf.position;
  let target = original;
  let depthLeft = mf.getElementInfo(original)?.depth ?? 0;
  while (depthLeft-- > 0) {
    const previous = mf.position;
    const previousDepth = mf.getElementInfo(previous)?.depth ?? 0;
    mf.executeCommand('moveAfterParent');
    const parent = mf.position;
    if (parent === previous || (mf.getElementInfo(parent)?.depth ?? 0) >= previousDepth) break;
    if (!hasLiteralSubscript(mf.getElementInfo(parent)?.latex ?? '')) continue;
    // Re-enter the existing subscript to find its range. A superscript on the
    // same symbol is a different branch, and operators must stay inside it.
    mf.executeCommand('moveToSubscript');
    const end = mf.position;
    const depth = mf.getElementInfo(end)?.depth ?? 0;
    let start = end;
    while (start > 0) {
      const info = mf.getElementInfo(start);
      if ((info?.depth ?? -1) < depth || (info?.depth === depth && !info.latex)) break;
      start--;
    }
    if (original >= start && original <= end && !isLimitOperator(mf.getElementInfo(start - 1)?.latex ?? '')) target = parent;
    mf.position = parent;
  }
  mf.position = target;
}

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

  if (!e.altKey && ((!mod && [':', '=', '+', '-', '*', '/', '^', '<', '>', '\\', '|'].includes(e.key)) || (mod && !e.shiftKey && ['9', '0', '3', '='].includes(e.key)))) leaveLiteralSubscript(mf);

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
