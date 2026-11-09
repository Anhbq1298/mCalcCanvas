/**
 * Engineering unit registry on top of mathjs units.
 *
 * Only symbols listed here are recognised as units. This keeps the symbol
 * space explicit: everything else is a variable. mathjs is used purely as a
 * numeric/dimensional library – expressions are never handed to math.evaluate.
 */
import { all, create, type MathJsInstance, type Unit } from 'mathjs';
import { CalculationError } from './CalculationErrors';

export const math: MathJsInstance = create(all, { number: 'number', precision: 64 });

// mathjs has psi and kip but no ksi.
if (!math.Unit.isValuelessUnit('ksi')) {
  try {
    math.createUnit('ksi', '1000 psi');
  } catch {
    /* already defined by another module instance */
  }
}

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

export function unitValue(symbol: string): Unit {
  const def = UNITS.get(symbol);
  if (!def) throw new Error(`Unknown unit ${symbol}`);
  return math.unit(1, def.mathjs);
}

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

/** mathjs base dimension order: MASS, LENGTH, TIME, CURRENT, TEMPERATURE, LUMINOUS_INTENSITY, AMOUNT_OF_SUBSTANCE, ANGLE, BIT */
type DimKey = string;

interface DimensionInfo {
  name: string;
  /** Preferred display unit for SI and Imperial worksheets (mathjs syntax). */
  si: string | ((siValue: number) => string);
  imperial: string | ((siValue: number) => string);
}

function key(mass: number, length: number, time: number, temp = 0, angle = 0): DimKey {
  return [mass, length, time, 0, temp, 0, 0, angle, 0].join(',');
}

const DIMENSIONS = new Map<DimKey, DimensionInfo>([
  [key(0, 1, 0), { name: 'Length', si: 'm', imperial: 'ft' }],
  [key(0, 2, 0), { name: 'Area', si: (v) => (Math.abs(v) < 0.01 ? 'mm^2' : 'm^2'), imperial: (v) => (Math.abs(v) < 0.0929 ? 'inch^2' : 'ft^2') }],
  [key(0, 3, 0), { name: 'Volume', si: (v) => (Math.abs(v) < 1e-3 ? 'mm^3' : 'm^3'), imperial: 'ft^3' }],
  [key(0, 4, 0), { name: 'Second moment of area', si: (v) => (Math.abs(v) < 0.01 ? 'mm^4' : 'm^4'), imperial: 'inch^4' }],
  [key(1, 0, 0), { name: 'Mass', si: 'kg', imperial: 'lbm' }],
  [key(0, 0, 1), { name: 'Time', si: 's', imperial: 's' }],
  [key(0, 0, -1), { name: 'Frequency', si: 'Hz', imperial: 'Hz' }],
  [key(1, 1, -2), { name: 'Force', si: 'kN', imperial: 'kip' }],
  [key(1, 2, -2), { name: 'Moment', si: 'kN m', imperial: 'kip ft' }],
  [
    key(1, -1, -2),
    {
      name: 'Stress',
      si: (v) => (Math.abs(v) >= 1e6 ? 'MPa' : 'kPa'),
      imperial: (v) => (Math.abs(v) >= 6.894757e6 ? 'ksi' : 'psi'),
    },
  ],
  [key(1, 0, -2), { name: 'Line load', si: 'kN/m', imperial: 'kip/ft' }],
  [key(1, -2, -2), { name: 'Unit weight', si: 'kN/m^3', imperial: 'lbf/ft^3' }],
  [key(1, -3, 0), { name: 'Density', si: 'kg/m^3', imperial: 'lbm/ft^3' }],
  [key(0, 1, -1), { name: 'Velocity', si: 'm/s', imperial: 'ft/s' }],
  [key(0, 1, -2), { name: 'Acceleration', si: 'm/s^2', imperial: 'ft/s^2' }],
  [key(0, 0, 0, 1), { name: 'Temperature', si: 'K', imperial: 'K' }],
  [key(0, 0, 0, 0, 1), { name: 'Angle', si: 'deg', imperial: 'deg' }],
]);

export type Quantity = number | Unit;

export function isUnit(q: unknown): q is Unit {
  return math.isUnit(q);
}

export function dimensionKey(q: Quantity): DimKey {
  if (!isUnit(q)) return key(0, 0, 0);
  return q.dimensions.join(',');
}

export function isDimensionless(q: Quantity): boolean {
  return dimensionKey(q) === key(0, 0, 0);
}

export function dimensionName(q: Quantity): string {
  if (isDimensionless(q)) return 'Dimensionless';
  const info = DIMENSIONS.get(dimensionKey(q));
  if (info) return info.name;
  return `[${describeBaseDims(q as Unit)}]`;
}

function describeBaseDims(u: Unit): string {
  const names = ['M', 'L', 'T', 'I', 'Θ', 'J', 'N', 'angle', 'bit'];
  return u.dimensions
    .map((p, i) => (p === 0 ? '' : p === 1 ? names[i] : `${names[i]}^${p}`))
    .filter(Boolean)
    .join('·');
}

/**
 * True for an absolute temperature on an offset scale (°C). Such values are
 * affine: they can be shifted by a difference (K) or subtracted from each
 * other, but not added, scaled or used in functions. Kelvin values are
 * treated as plain (linear) quantities.
 */
export function isAbsoluteTemperature(q: unknown): boolean {
  if (!isUnit(q)) return false;
  const units = (q as unknown as { units: { unit: { offset?: number } }[] }).units;
  return units.some((u) => (u.unit.offset ?? 0) !== 0);
}

/** Value of a quantity in SI base units (mathjs internal representation). */
export function siValue(q: Quantity): number {
  if (!isUnit(q)) return q;
  return q.value ?? 1;
}

/**
 * Collapse quantities whose units cancelled (e.g. MEd / MRd) to plain numbers.
 * Angles are kept as units so that they display in degrees.
 */
export function normalize(q: Quantity): Quantity {
  if (isUnit(q) && isDimensionless(q)) return siValue(q);
  return q;
}

export type UnitSystemName = 'SI' | 'Imperial';

/** Preferred display unit (mathjs syntax) for a quantity, or null if dimensionless/unknown. */
export function preferredUnit(q: Quantity, system: UnitSystemName): string | null {
  if (!isUnit(q) || isDimensionless(q)) return null;
  const info = DIMENSIONS.get(dimensionKey(q));
  if (!info) return null;
  const pref = system === 'SI' ? info.si : info.imperial;
  return typeof pref === 'function' ? pref(siValue(q)) : pref;
}

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

/**
 * Build a calculation quantity from a numeric scenario value and a worksheet
 * unit label. Batch/scenario overrides use this instead of rewriting the
 * source LaTeX definition.
 */
export function quantityFromDisplayValue(value: number, unit: string | null = null): Quantity {
  if (!Number.isFinite(value)) throw new CalculationError('not-finite', 'Override value must be a finite number.');
  if (!unit?.trim()) return value;
  try {
    return math.unit(value, parseDisplayUnit(unit));
  } catch (error) {
    if (error instanceof CalculationError) throw error;
    throw new CalculationError('unknown-unit', error instanceof Error ? error.message : `Invalid unit "${unit}".`);
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Engineering number format: `decimals` places for |x| ≥ 1 (trailing zeros
 * trimmed), at least 3 significant figures below 1, scientific notation for
 * very large or very small magnitudes.
 */
export function formatNumber(x: number, decimals: number): { text: string; latex: string } {
  if (x === 0 || Object.is(x, -0)) return { text: '0', latex: '0' };
  const ax = Math.abs(x);
  if (ax >= 1e7 || ax < 1e-4) {
    const [mant, exp] = x.toExponential(Math.max(decimals, 2)).split('e');
    const m = trimZeros(mant);
    const e = Number(exp);
    return { text: `${m}×10^${e}`, latex: `${m}\\times10^{${e}}` };
  }
  let s: string;
  if (ax >= 1) s = trimZeros(x.toFixed(decimals));
  else s = trimZeros(x.toPrecision(Math.max(decimals + 1, 3)));
  return { text: s, latex: s };
}

function trimZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}

const MATHJS_TO_DISPLAY: Record<string, string> = Object.fromEntries(
  UNIT_LIST.map((u) => [u.mathjs, u.latex]),
);
MATHJS_TO_DISPLAY.lbm = 'lb';

/**
 * Render a mathjs unit string ("kN m", "kN / m^2") as display text and LaTeX.
 */
export function formatUnitString(unitStr: string): { text: string; latex: string } {
  const parts = unitStr.trim().split(/\s*\/\s*/);
  const fmt = (part: string) => {
    const factors = part.split(/\s+/).filter(Boolean).map((f) => {
      const [name, pow] = f.split('^');
      const disp = MATHJS_TO_DISPLAY[name] ?? name;
      return { disp, pow };
    });
    const text = factors.map((f) => f.disp + (f.pow ? superscript(f.pow) : '')).join('·');
    const latex = factors
      .map((f) => `\\mathrm{${escapeLatexText(f.disp)}}` + (f.pow ? `^{${f.pow}}` : ''))
      .join('\\cdot ');
    return { text, latex };
  };
  const num = fmt(parts[0] || '1');
  if (parts.length === 1) return num;
  const dens = parts.slice(1).map(fmt);
  return {
    text: [num.text, ...dens.map((d) => d.text)].join('/'),
    latex: [num.latex, ...dens.map((d) => d.latex)].join('/'),
  };
}

function escapeLatexText(s: string): string {
  return s.replace(/°/g, '\\degree ');
}

function superscript(p: string): string {
  const map: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '.': '·' };
  return p.split('').map((c) => map[c] ?? c).join('');
}

export interface FormattedQuantity {
  text: string;
  latex: string;
  number: number;
  unitText: string;
  unitLatex: string;
  dimension: string;
}

/**
 * Format a quantity in a target unit (mathjs syntax) or the preferred unit.
 * Throws a plain Error if the target unit has incompatible dimensions.
 */
export function formatQuantity(
  q: Quantity,
  opts: { decimals: number; system: UnitSystemName; targetUnit?: string | null },
): FormattedQuantity {
  const dimension = dimensionName(q);
  let number: number;
  let unitStr = '';
  if (opts.targetUnit) {
    const target = math.unit(opts.targetUnit);
    if (isAbsoluteTemperature(target) && !isAbsoluteTemperature(q)) {
      throw new Error('A temperature difference or Kelvin value cannot be shown in °C. Use K.');
    }
    if (!isUnit(q)) {
      if (!isDimensionless(target)) {
        throw new Error(`Cannot display a dimensionless value in ${opts.targetUnit}.`);
      }
      number = q / siValue(target);
    } else {
      if (!q.equalBase(target)) {
        throw new Error(`Cannot display ${dimension} in ${formatUnitString(opts.targetUnit).text} (${dimensionName(target)}).`);
      }
      number = q.toNumber(opts.targetUnit);
    }
    unitStr = opts.targetUnit;
  } else if (isAbsoluteTemperature(q)) {
    // Absolute temperatures stay on the scale they were entered in.
    number = (q as Unit).toNumber('degC');
    unitStr = 'degC';
  } else if (isUnit(q)) {
    const pref = preferredUnit(q, opts.system);
    if (pref) {
      number = q.toNumber(pref);
      unitStr = pref;
    } else {
      // Unknown dimension: fall back to SI base units.
      const si = q.toSI();
      number = si.toNumber();
      unitStr = si.formatUnits();
    }
  } else {
    number = q;
  }
  const n = formatNumber(number, opts.decimals);
  if (!unitStr) {
    return { text: n.text, latex: n.latex, number, unitText: '', unitLatex: '', dimension };
  }
  const u = formatUnitString(unitStr);
  const isDegree = unitStr === 'deg';
  return {
    text: isDegree ? `${n.text}°` : `${n.text} ${u.text}`,
    latex: isDegree ? `${n.latex}\\degree` : `${n.latex}\\,${u.latex}`,
    number,
    unitText: u.text,
    unitLatex: u.latex,
    dimension,
  };
}
