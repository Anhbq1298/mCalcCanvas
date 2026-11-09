/**
 * Display-only styling of units in rendered equations: units are shown in a
 * light blue and separated from their value by a multiplication dot
 * ("25 · kN/m"), so values and units are easy to tell apart. The LaTeX used
 * for calculation is never changed.
 */
import { UNITS } from '../engine/light';

/** Light blue used for units (readable on white and in print). */
export const UNIT_COLOR = '#2b8fd6';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Upright unit names as they appear in LaTeX (symbols, display names, °C, lb). */
const NAMES = [...new Set([...UNITS.values()].flatMap((u) => [u.symbol, u.latex.replace('°', '\\degree ')]).concat(['lb', '\\degree C', '\\degree']))]
  .filter((n) => n !== '°')
  .sort((a, b) => b.length - a.length)
  .map(esc)
  .join('|');

/** \mathrm{kN} or \unit{kN}, with an optional power: ^2, ^{2}, ^{-1}. */
const UNIT_ATOM = `\\\\(?:mathrm|unit)\\{\\s*(?:${NAMES})\\s*\\}(?:\\^(?:\\{[^{}]*\\}|\\d))?`;
/** A number followed by (optional thin space and) a unit, or a fraction whose numerator starts with a unit. */
const NUMBER_THEN_UNIT = new RegExp(
  `(\\d)(?:\\s|\\\\[,;:! ]|~)*(?=${UNIT_ATOM}|\\\\frac\\{${UNIT_ATOM})`,
  'g',
);
const UNIT_RUN = new RegExp(`${UNIT_ATOM}`, 'g');
const DEGREE_FOLLOWS = new RegExp(`^(?:\\s|\\\\[,;:! ]|~)*\\\\(?:mathrm|unit)\\{\\s*\\\\degree`);

export function styleUnits(latex: string, unitColor: string = UNIT_COLOR): string {
  if (!NAMES || !/\\(?:mathrm|unit)\{/.test(latex)) return latex;
  // 1. "25\,\mathrm{kN}" → "25\cdot\mathrm{kN}" (not for degrees: "20 °C").
  let out = latex.replace(NUMBER_THEN_UNIT, (m, d: string, offset: number) =>
    DEGREE_FOLLOWS.test(latex.slice(offset + 1)) ? m : `${d}\\cdot `,
  );
  // 2. Colour every unit atom.
  out = out.replace(UNIT_RUN, (u) => `\\textcolor{${unitColor}}{${u}}`);
  return out;
}
