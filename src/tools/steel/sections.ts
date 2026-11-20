/**
 * Section choices for mSteelBeamColumn. I/H sections come from the worksheet library (stable IDs);
 * RHS/SHS/CHS are dimensions only: the worksheet calculates their properties from h, b, t (d, t).
 * The hollow size list is the common EN 10210-2 / EN 10219-2 range (dimensions; availability varies).
 */
import { sections, type SteelSection } from '../../engineering/steel/sections';

export type Shape = 'I' | 'RHS' | 'CHS';
export type Hollow = { kind: 'RHS'; h: number; b: number; t: number; cf: 0 | 1 } | { kind: 'CHS'; d: number; t: number; cf?: 0 | 1 };

export const I_FAMILIES = ['UB', 'UC', 'IPE', 'HEA', 'HEB', 'HEM', 'W'] as const;
export const iSections = (family: string): SteelSection[] => sections.filter((s) => s.family === family).sort((a, b) => a.values.mass - b.values.mass);

/** Corner radii: EN 10210-2 r_o = 1.5t, r_i = t; EN 10219-2 (mean of Table A.1) r_o = 2t, 2.5t, 3t; r_i = r_o − t. */
export function cornerRadii(t: number, cf: 0 | 1): { ro: number; ri: number } {
  if (!cf) return { ro: 1.5 * t, ri: t };
  const ro = t <= 6 ? 2 * t : t <= 10 ? 2.5 * t : 3 * t;
  return { ro, ri: ro - t };
}

export interface HollowProps { A: number; Iy: number; Iz: number; Wel_y: number; Wel_z: number; Wpl_y: number; Wpl_z: number; mass: number }

/** The worksheet's formulas (outer rounded rectangle minus inner; each corner an r × r square less a quarter circle), mm. */
export function hollowProperties(s: Hollow): HollowProps {
  if (s.kind === 'CHS') {
    const di = s.d - 2 * s.t, A = Math.PI * (s.d ** 2 - di ** 2) / 4, I = Math.PI * (s.d ** 4 - di ** 4) / 64, Wpl = (s.d ** 3 - di ** 3) / 6;
    return { A, Iy: I, Iz: I, Wel_y: 2 * I / s.d, Wel_z: 2 * I / s.d, Wpl_y: Wpl, Wpl_z: Wpl, mass: A * 7.85e-3 };
  }
  const { ro, ri } = cornerRadii(s.t, s.cf);
  const kA = 1 - Math.PI / 4, kx = (10 - 3 * Math.PI) / (12 - 3 * Math.PI), kI = 1 - 5 * Math.PI / 16 - kA * kx * kx;
  const area = (B: number, H: number, r: number) => B * H - 4 * kA * r * r;
  const inertia = (B: number, H: number, r: number) => B * H ** 3 / 12 - 4 * r * r * (kA * (H / 2 - kx * r) ** 2 + kI * r * r);
  const plastic = (B: number, H: number, r: number) => B * H * H / 4 - 4 * kA * r * r * (H / 2 - kx * r);
  const { h, b, t } = s, hi = h - 2 * t, bi = b - 2 * t;
  const A = area(b, h, ro) - area(bi, hi, ri);
  const Iy = inertia(b, h, ro) - inertia(bi, hi, ri), Iz = inertia(h, b, ro) - inertia(hi, bi, ri);
  return { A, Iy, Iz, Wel_y: 2 * Iy / h, Wel_z: 2 * Iz / b, Wpl_y: plastic(b, h, ro) - plastic(bi, hi, ri), Wpl_z: plastic(h, b, ro) - plastic(hi, bi, ri), mass: A * 7.85e-3 };
}

const SHS: [number, number[]][] = [
  [40, [3, 3.2, 4, 5]], [50, [3, 3.2, 4, 5, 6.3]], [60, [3, 3.2, 4, 5, 6.3, 8]], [70, [3.6, 5, 6.3, 8]], [80, [3.6, 4, 5, 6.3, 8]], [90, [3.6, 4, 5, 6.3, 8]],
  [100, [4, 5, 6.3, 8, 10]], [120, [5, 6.3, 8, 10]], [140, [5, 6.3, 8, 10]], [150, [5, 6.3, 8, 10, 12.5]], [160, [5, 6.3, 8, 10, 12.5]], [180, [6.3, 8, 10, 12.5]],
  [200, [6.3, 8, 10, 12.5, 16]], [250, [6.3, 8, 10, 12.5, 16]], [260, [8, 10, 12.5, 16]], [300, [8, 10, 12.5, 16]], [350, [8, 10, 12.5, 16]], [400, [10, 12.5, 16]],
];
const RHS: [number, number, number[]][] = [
  [50, 30, [3, 3.2, 4, 5]], [60, 40, [3, 4, 5, 6.3]], [80, 40, [3.2, 4, 5, 6.3, 8]], [90, 50, [3.6, 5, 6.3, 8]], [100, 50, [3.2, 4, 5, 6.3, 8, 10]], [100, 60, [3.6, 5, 6.3, 8]],
  [120, 60, [4, 5, 6.3, 8, 10]], [120, 80, [5, 6.3, 8, 10]], [150, 100, [5, 6.3, 8, 10, 12.5]], [160, 80, [5, 6.3, 8, 10]], [200, 100, [5, 6.3, 8, 10, 12.5, 16]],
  [200, 120, [6.3, 8, 10]], [200, 150, [8, 10]], [250, 150, [6.3, 8, 10, 12.5, 16]], [300, 100, [8, 10]], [300, 200, [8, 10, 12.5, 16]], [400, 200, [8, 10, 12.5, 16]],
  [450, 250, [10, 12.5, 16]], [500, 300, [10, 12.5, 16]],
];
const CHS: [number, number[]][] = [
  [21.3, [2.6, 3.2]], [26.9, [3.2]], [33.7, [3.2, 4]], [42.4, [3.2, 4]], [48.3, [3.2, 4, 5]], [60.3, [3.2, 4, 5]], [76.1, [3.2, 4, 5]], [88.9, [3.2, 4, 5, 6.3]],
  [114.3, [3.6, 5, 6.3]], [139.7, [5, 6.3, 8, 10]], [168.3, [5, 6.3, 8, 10]], [193.7, [5, 6.3, 8, 10, 12.5]], [219.1, [5, 6.3, 8, 10, 12.5, 16]],
  [244.5, [6.3, 8, 10, 12.5, 16]], [273, [6.3, 8, 10, 12.5, 16]], [323.9, [6.3, 8, 10, 12.5, 16]], [355.6, [8, 10, 12.5, 16]], [406.4, [8, 10, 12.5, 16]],
  [457, [10, 12.5, 16]], [508, [10, 12.5, 16]],
];

export interface HollowEntry { name: string; family: 'SHS' | 'RHS' | 'CHS'; dims: { h?: number; b?: number; d?: number; t: number }; mass: number }
export function hollowName(s: Hollow): string {
  return s.kind === 'CHS' ? `CHS ${s.d}x${s.t}` : `${s.h === s.b ? 'SHS' : 'RHS'} ${s.h}x${s.b}x${s.t}`;
}
/** Catalogue for one family, lightest first (masses for the chosen process). */
export function hollowSections(family: 'SHS' | 'RHS' | 'CHS', cf: 0 | 1): HollowEntry[] {
  const list: Hollow[] = family === 'CHS' ? CHS.flatMap(([d, ts]) => ts.map((t) => ({ kind: 'CHS' as const, d, t, cf })))
    : (family === 'SHS' ? SHS.map(([a, ts]) => [a, a, ts] as const) : RHS).flatMap(([h, b, ts]) => ts.map((t) => ({ kind: 'RHS' as const, h, b, t, cf })));
  return list.map((s) => ({ name: hollowName(s), family, dims: s.kind === 'CHS' ? { d: s.d, t: s.t } : { h: s.h, b: s.b, t: s.t }, mass: hollowProperties(s).mass }))
    .sort((a, b) => a.mass - b.mass);
}
