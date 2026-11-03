/**
 * One-time MathLive configuration.
 *
 * Fonts are bundled through `mathlive/fonts.css` (imported in main.tsx), so
 * MathLive must not try to fetch them itself.
 */
import { MathfieldElement } from 'mathlive';
import { UNIT_SYMBOLS } from '../engine';

MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

/**
 * Inline shortcuts:
 *  - ":=" → \coloneq (definition), "<=" / ">=" → ≤ / ≥
 *  - multi-letter unit symbols render upright (kN → \mathrm{kN}) so a
 *    report shows "25 kN/m" and the engine reads them unambiguously.
 * MathLive defaults that collide with unit names (e.g. "in" → ∈) are replaced.
 */
export function configureMathfield(mf: MathfieldElement): void {
  const unitShortcuts: Record<string, string> = {};
  for (const sym of UNIT_SYMBOLS) {
    if (sym.length > 1 && /^[A-Za-z]+$/.test(sym)) unitShortcuts[sym] = `\\mathrm{${sym}}`;
  }
  unitShortcuts.degC = '\\degree\\mathrm{C}';
  mf.inlineShortcuts = {
    ...mf.inlineShortcuts,
    ...unitShortcuts,
    ':=': '\\coloneq',
    '<=': '\\le',
    '>=': '\\ge',
    '!=': '\\ne',
    deg: '\\degree',
  };
  mf.smartMode = false;
  mf.smartFence = true;
  mf.mathVirtualKeyboardPolicy = 'auto';
  mf.popoverPolicy = 'off';
  mf.menuItems = [];
}

export { MathfieldElement };
