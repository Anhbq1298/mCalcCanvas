/** Sharp-cornered, doubly symmetric welded I/H sections. Dimensions are in mm. */
import formulae from './sectionFormulae.json';
import { propertyKeys, type SectionProperty } from './sections';

export interface SectionDimensions { h: number; b: number; tf: number; tw: number }
export const dimensionKeys = ['h', 'b', 'tf', 'tw'] as const;
export const CUSTOM_SECTION_NAME = 'Custom welded I/H';
export const sectionSymbols: Record<SectionProperty, string> = {
  h: 'h', b: 'b', tw: 't_w', tf: 't_f', r: 'r', A: 'A', Iy: 'I_y', Iz: 'I_z',
  Wel_y: 'W_{el.y}', Wel_z: 'W_{el.z}', Wpl_y: 'W_{pl.y}', Wpl_z: 'W_{pl.z}',
  It: 'I_t', Iw: 'I_w', Avy: 'A_{v.y}', Avz: 'A_{v.z}', mass: 'm_{s}', iy: 'i_y', iz: 'i_z',
};

export function sectionDimensionError(d: SectionDimensions): string | null {
  if (dimensionKeys.some(k => !Number.isFinite(d[k]) || d[k] <= 0)) return 'Enter a positive, finite value for every dimension.';
  if (d.h <= 2 * d.tf) return 'h must be greater than 2 × tf.';
  if (d.b <= d.tw) return 'b must be greater than tw.';
  if (Object.values(uncheckedValues(d)).some(v => !Number.isFinite(v) || v <= 0)) return 'Dimensions are outside the supported numeric range.';
  return null;
}

/** Preview only; the worksheet stores and evaluates the equations below, never these results. */
export function customSectionValues(d: SectionDimensions): Record<SectionProperty, number> {
  const error = sectionDimensionError(d);
  if (error) throw new Error(error);
  return { ...d, r: 0, ...uncheckedValues(d) };
}

function uncheckedValues({ h, b, tf, tw }: SectionDimensions) {
  const hw = h - 2 * tf;
  const A = 2 * b * tf + hw * tw;
  const Iy = (b * h ** 3 - (b - tw) * hw ** 3) / 12;
  const Iz = (2 * tf * b ** 3 + hw * tw ** 3) / 12;
  return {
    A, Iy, Iz, Wel_y: 2 * Iy / h, Wel_z: 2 * Iz / b,
    Wpl_y: b * tf * (h - tf) + tw * hw ** 2 / 4,
    Wpl_z: tf * b ** 2 / 2 + hw * tw ** 2 / 4,
    // Thin-wall approximations: SCI P385 Appendix B.2.2 and B.3.1; no weld/fillet credit.
    It: (2 * b * tf ** 3 + hw * tw ** 3) / 3,
    Iw: tf * b ** 3 * (h - tf) ** 2 / 24,
    // EN 1993-1-1:2005 §6.2.6(3), with conservative η = 1.0 for the custom shear area.
    Avy: 2 * b * tf, Avz: hw * tw, mass: A * 0.00785,
    iy: Math.sqrt(Iy / A), iz: Math.sqrt(Iz / A),
  };
}

function ifBlock(branches: { condition: string; value: string }[], otherwise: string): string {
  const rows = branches.map(({ condition, value }, i) => `${i ? '\\mathrm{else}\\ ' : ''}\\mathrm{if}\\ ${condition}\\\\\\quad\\left\\Vert\\displaystyle ${value}\\right.`);
  rows.push(`\\mathrm{else}\\\\\\quad\\left\\Vert\\displaystyle ${otherwise}\\right.`);
  return `\\begin{array}{||l}${rows.join('\\\\')}\\end{array}`;
}

export const sectionCurveDefinitions = Object.entries(formulae.curves).map(([symbol, cases]) => ({
  symbol, latex: `${symbol}\\coloneq${ifBlock(cases.branches, cases.otherwise)}`,
}));

/** The unchosen library branch is lazy, so custom ID 0 never enters sectionProp. */
export function customPropertyDefinition(key: SectionProperty, d: SectionDimensions): string {
  const expression = key in d ? `${d[key as keyof SectionDimensions]}\\,\\mathrm{mm}` : formulae.properties[key as keyof typeof formulae.properties];
  const lookup = `\\operatorname{sectionProp}(\\mathrm{Section},${propertyKeys.indexOf(key)})`;
  return `${sectionSymbols[key]}\\coloneq${ifBlock([{ condition: '\\mathrm{Section}=0', value: expression }], lookup)}`;
}

export function libraryPropertyDefinition(key: SectionProperty): string {
  return `${sectionSymbols[key]}\\coloneq\\operatorname{sectionProp}(\\mathrm{Section},${propertyKeys.indexOf(key)})`;
}

