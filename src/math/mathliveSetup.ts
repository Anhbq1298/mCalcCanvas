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
    if (sym.length > 1 && /^[A-Za-z]+$/.test(sym)) unitShortcuts[sym] = `\\unit{${sym}}`;
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
  // \unit{kN} is one atomic, upright token: typing after it is ordinary math
  // again (a plain \mathrm would make the following letters upright too).
  mf.macros = { ...mf.macros, unit: { args: 1, def: '\\mathrm{#1}', captureSelection: true, expand: false } };
  mf.smartMode = false;
  mf.smartFence = true;
  mf.mathVirtualKeyboardPolicy = 'auto';
  mf.popoverPolicy = 'off';
  mf.menuItems = [];
}

export { MathfieldElement };
