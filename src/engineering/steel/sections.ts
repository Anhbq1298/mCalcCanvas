/** Stable IDs are part of the worksheet contract: never renumber an existing record. */
import data from './data/catalogue.json';
export const sectionUnits = {
  h: 'mm', b: 'mm', tw: 'mm', tf: 'mm', r: 'mm', A: 'mm^2',
  Iy: 'mm^4', Iz: 'mm^4', Wel_y: 'mm^3', Wel_z: 'mm^3', Wpl_y: 'mm^3', Wpl_z: 'mm^3',
  It: 'mm^4', Iw: 'mm^6', Avy: 'mm^2', Avz: 'mm^2', mass: 'kg/m', iy: 'mm', iz: 'mm',
} as const;
export type SectionProperty = keyof typeof sectionUnits;
export const propertyKeys = Object.keys(sectionUnits) as SectionProperty[];
export interface SteelSection {
  id: number; name: string; family: string; standard: string; manufacturing: string;
  source: string; version: string; values: Record<SectionProperty, number>;
}
export const sections: readonly SteelSection[] = data;
/** Start of the worksheet input that holds the library ID; the section picker attaches to it. */
export const SECTION_DEF = '\\mathrm{Section}\\coloneq';
const byId = new Map(sections.map(s => [s.id, s]));
export function sectionById(id: number): SteelSection {
  const s = byId.get(id);
  if (!s) throw new Error(`Unknown steel section ID ${id}. Browse Section Library or use custom property definitions.`);
  return s;
}
/** Import checks tolerate the precision of published tables, never acceptance URs. */
export function validateSection(s: SteelSection): string[] {
  const v = s.values, errors: string[] = [];
  for(const key of ['name','family','standard','manufacturing','source','version'] as const) if(typeof s[key]!=='string'||s[key].length===0||s[key].length>300)errors.push(`Invalid ${key}`);
  if(!Number.isInteger(s.id)||s.id<0)errors.push('Invalid section ID');
  for (const k of propertyKeys) if (!Number.isFinite(v[k]) || (k === 'r' ? v[k] < 0 : v[k] <= 0)) errors.push(`Invalid ${k}`);
  if (v.h <= 2 * (v.tf + v.r) || v.b <= v.tw + 2 * v.r) errors.push('Invalid flange/web geometry');
  for (const [a, b] of [[v.Wel_y, 2 * v.Iy / v.h], [v.Wel_z, 2 * v.Iz / v.b], [v.iy ** 2, v.Iy / v.A], [v.iz ** 2, v.Iz / v.A], [v.mass, v.A * 0.00785]]) {
    if (Math.abs(a / b - 1) > 0.035) errors.push('Inconsistent area, modulus, radius or mass conversion');
  }
  if(v.A>v.b*v.h||v.Avy>v.A||v.Avz>v.A)errors.push('Section or shear area exceeds geometric bounds');
  if (v.Wpl_y < v.Wel_y || v.Wpl_z < v.Wel_z) errors.push('Plastic modulus below elastic modulus');
  return errors;
}
