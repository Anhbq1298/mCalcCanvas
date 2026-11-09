/** The unit registry: what users may type and how it maps to mathjs (no mathjs import: safe for the UI thread). */

export interface UnitDef {
  /** Symbol as typed by the user. */
  symbol: string;
  /** mathjs unit string. */
  mathjs: string;
  /** Upright LaTeX used for display. */
  latex: string;
}

const UNIT_LIST: UnitDef[] = [
  // Length
  { symbol: 'mm', mathjs: 'mm', latex: 'mm' },
  { symbol: 'cm', mathjs: 'cm', latex: 'cm' },
  { symbol: 'm', mathjs: 'm', latex: 'm' },
  { symbol: 'km', mathjs: 'km', latex: 'km' },
  { symbol: 'in', mathjs: 'inch', latex: 'in' },
  { symbol: 'ft', mathjs: 'ft', latex: 'ft' },
  // Force
  { symbol: 'N', mathjs: 'N', latex: 'N' },
  { symbol: 'kN', mathjs: 'kN', latex: 'kN' },
  { symbol: 'MN', mathjs: 'MN', latex: 'MN' },
  { symbol: 'lbf', mathjs: 'lbf', latex: 'lbf' },
  { symbol: 'kip', mathjs: 'kip', latex: 'kip' },
  // Stress / pressure
  { symbol: 'Pa', mathjs: 'Pa', latex: 'Pa' },
  { symbol: 'kPa', mathjs: 'kPa', latex: 'kPa' },
  { symbol: 'MPa', mathjs: 'MPa', latex: 'MPa' },
  { symbol: 'GPa', mathjs: 'GPa', latex: 'GPa' },
  { symbol: 'psi', mathjs: 'psi', latex: 'psi' },
  { symbol: 'ksi', mathjs: 'ksi', latex: 'ksi' },
  // Mass
  { symbol: 'kg', mathjs: 'kg', latex: 'kg' },
  { symbol: 'tonne', mathjs: 'tonne', latex: 'tonne' },
  // Time / frequency / temperature
  { symbol: 's', mathjs: 's', latex: 's' },
  { symbol: 'Hz', mathjs: 'Hz', latex: 'Hz' },
  { symbol: 'K', mathjs: 'K', latex: 'K' },
  { symbol: 'degC', mathjs: 'degC', latex: '°C' },
  // Angles
  { symbol: 'deg', mathjs: 'deg', latex: '°' },
  { symbol: 'rad', mathjs: 'rad', latex: 'rad' },
];

export const UNITS: ReadonlyMap<string, UnitDef> = new Map(UNIT_LIST.map((u) => [u.symbol, u]));

/** Unit symbols the user may type; also used for MathLive inline shortcuts. */
export const UNIT_SYMBOLS: readonly string[] = UNIT_LIST.map((u) => u.symbol);

export function isUnitSymbol(name: string): boolean {
  return UNITS.has(name);
}

export type UnitSystemName = 'SI' | 'Imperial';

/**
 * Convert a user-written display unit ("kN·mm", "kN/m²", "MPa") into mathjs
 * syntax. Only registry symbols are accepted.
 */
export function parseDisplayUnit(input: string): string {
  const cleaned = input
    .trim()
    .replace(/[·⋅*]/g, ' ')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4')
    .replace(/°C/g, 'degC')
    .replace(/°/g, 'deg');
  // Validate every word against the registry (safety: no arbitrary mathjs names).
  const words = cleaned.match(/[A-Za-z]+/g) ?? [];
  for (const w of words) {
    if (!UNITS.has(w)) throw new Error(`Unknown unit "${w}".`);
  }
  return cleaned.replace(/[A-Za-z]+/g, (w) => UNITS.get(w)!.mathjs);
}

