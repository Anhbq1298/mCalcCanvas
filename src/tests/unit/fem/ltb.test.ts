import { describe, expect, it } from 'vitest';
import { chiLT, FORK, ltbAnalysis, ltbCriticalFactor, solveBeam } from '../../../engineering/fem';
import { step } from '../../step';
import { ritzMcrFactor } from './ritz';

// LTB eigenvalue FE: closed forms, the SN003b (NCCI) C1 / C2 cases, supports by DOF, mesh, mode, taper.
// UB 406x140x46-like section, N and mm.
const E = 210000, G = 81000, Iz = 538e4, It = 19e4, Iw = 207e9, h = 403.2, zg = h / 2;
const uniform = () => ({ EIz: E * Iz, GIt: G * It, EIw: E * Iw });
const Ncr = (Lc: number) => (Math.PI ** 2 * E * Iz) / Lc ** 2;
const Mcr0 = (Lc: number, k = 1, kw = 1) => Ncr(k * Lc) * Math.sqrt((k / kw) ** 2 * (Iw / Iz) + (G * It) / Ncr(k * Lc));
const sn003 = (Lc: number, C1: number, C2: number, z: number) => C1 * Ncr(Lc) * (Math.sqrt(Iw / Iz + (G * It) / Ncr(Lc) + (C2 * z) ** 2) - C2 * z);
const rel = (a: number, b: number) => Math.abs(a / b - 1);
const peak = (f: (x: number) => number, L: number) => { let m = 0; for (let i = 0; i <= 800; i++) m = Math.max(m, Math.abs(f((L * i) / 800))); return m; };

describe('FEM: lateral-torsional buckling eigenvalues', () => {
  it('matches closed forms, an independent Ritz solution and the SN003b C1 / C2 cases', () => {
    const L = 6000;
    step('uniform moment, fork ends: exact closed form; converged with the mesh', () => {
      for (const n of [8, 24, 48]) expect(rel(ltbCriticalFactor({ L, props: uniform, M: () => 1, elements: n }), Mcr0(L))).toBeLessThan(n === 8 ? 1e-3 : 1e-5);
    });
    step('k = k_w = 0.5 (lateral bending and warping fixed at both ends): exact closed form', () => {
      const s = (x: number) => ({ x, v: true, vp: true, phi: true, phip: true });
      expect(rel(ltbCriticalFactor({ L, props: uniform, M: () => 1, supports: [s(0), s(L)], elements: 48 }), Mcr0(L, 0.5, 0.5))).toBeLessThan(1e-4);
    });
    step('interior fork at mid-span: the half span', () => {
      expect(rel(ltbCriticalFactor({ L, props: uniform, M: () => 1, restraints: [L / 2] }), Mcr0(L / 2))).toBeLessThan(1e-4);
    });
    step('mechanism and no-buckling cases are reported', () => {
      expect(ltbCriticalFactor({ L, props: uniform, M: () => 1, supports: [FORK(0)] })).toBeNaN();
      expect(ltbCriticalFactor({ L, props: uniform, M: () => 0 })).toBe(Infinity);
    });
    step('buckled shape: half sine, v = M L² φ / (π² EI_z) for uniform moment', () => {
      const { mode } = ltbAnalysis({ L, props: uniform, M: () => 1, elements: 24 }, true);
      const i = mode!.x.findIndex((x) => Math.abs(x - L / 2) < 1e-6), lam = Mcr0(L);
      expect(Math.abs(mode!.v[i] / mode!.phi[i])).toBeCloseTo((lam * L * L) / (Math.PI ** 2 * E * Iz), 3);
      const j = mode!.x.findIndex((x) => Math.abs(x - L / 4) < 1e-6);
      expect(mode!.phi[j] / mode!.phi[i]).toBeCloseTo(Math.SQRT1_2, 3);
    });
    // SN003b Table 3.1 (end moments, k = 1). FE = Ritz to 0.5 %; SN003b is a rounded fit: within 3 % for ψ ≥ 0.25,
    // conservative by up to 12 % for ψ between 0 and −1 (exact values here: 1.84, 2.20, 2.58, 2.84, 2.73).
    const table31: [number, number, number][] = [[1, 1, 0.005], [0.75, 1.14, 0.01], [0.5, 1.31, 0.02], [0.25, 1.52, 0.03], [0, 1.77, 0.05], [-0.25, 2.05, 0.09], [-0.5, 2.33, 0.12], [-0.75, 2.57, 0.12], [-1, 2.55, 0.08]];
    step('SN003b Table 3.1, end moments ψ: FE = Ritz; SN003b within its stated band, never above FE', () => {
      for (const [psi, C1, band] of table31) {
        const M = (x: number) => 1 + ((psi - 1) * x) / L;
        const fe = ltbCriticalFactor({ L, props: uniform, M }), rz = ritzMcrFactor({ L, props: uniform, M, terms: 25 });
        expect(rel(fe, rz), `ψ ${psi}: FE vs Ritz`).toBeLessThan(5e-3);
        expect(fe / Mcr0(L) / C1 - 1, `ψ ${psi}: FE C1 vs table`).toBeGreaterThan(-0.005);
        expect(fe / Mcr0(L) / C1 - 1, `ψ ${psi}: FE C1 vs table`).toBeLessThan(band);
      }
    });
    // SN003b Table 3.2 (transverse loads, k = 1): in-plane support from the FE beam (simple or fixed ends), lateral fork.
    // C2 z_g: top flange, shear centre, bottom flange. Point loads: the 3-factor formula deviates by up to 15 %.
    const table32: { name: string; C1: number; C2: number; load: 'q' | 'P'; fixed: boolean; band: [number, number, number] }[] = [
      { name: 'UDL, simple', C1: 1.127, C2: 0.454, load: 'q', fixed: false, band: [0.01, 0.01, 0.01] },
      { name: 'point at mid-span, simple', C1: 1.348, C2: 0.63, load: 'P', fixed: false, band: [0.015, 0.06, 0.05] },
      { name: 'UDL, fixed ends', C1: 2.578, C2: 1.554, load: 'q', fixed: true, band: [0.015, 0.01, 0.01] },
      { name: 'point at mid-span, fixed ends', C1: 1.683, C2: 1.645, load: 'P', fixed: true, band: [0.03, 0.14, 0.1] },
    ];
    step('SN003b Table 3.2, transverse loads at the shear centre, top and bottom flange: FE = Ritz; SN003b within its band', () => {
      for (const c of table32) {
        const sup = [{ x: 0, w: true, theta: c.fixed }, { x: L, w: true, theta: c.fixed }];
        const b = solveBeam({ L, EI: () => E * 1e8, supports: sup, loads: c.load === 'q' ? { dist: [{ x1: 0, x2: L, q1: 1 }] } : { point: [{ x: L / 2, P: 1 }] } });
        const Mmax = peak(b.M, L);
        ([[0, 0], [zg, 1], [-zg, 2]] as const).forEach(([z, k]) => {
          const load = c.load === 'q' ? { qzg: () => z } : { pointLoads: [{ x: L / 2, Pzg: z }] };
          const fe = ltbCriticalFactor({ L, props: uniform, M: b.M, ...load });
          const rz = ritzMcrFactor({ L, props: uniform, M: b.M, qzg: c.load === 'q' ? () => z : undefined, point: c.load === 'P' ? [{ x: L / 2, Pzg: z }] : undefined, terms: 25 });
          expect(rel(fe, rz), `${c.name}, z ${z}: FE vs Ritz`).toBeLessThan(5e-3);
          expect(rel(fe * Mmax, sn003(L, c.C1, c.C2, z)), `${c.name}, z ${z}: FE vs SN003b`).toBeLessThan(c.band[k]);
        });
      }
    });
    step('tapered web 300 → 403 mm, UDL on the top flange: FE = Ritz; between the uniform shallow and deep beams', () => {
      const tf = 11.2, tw = 6.8, hA = 300, Lt = 5200, hx = (x: number) => hA + ((h - hA) * x) / Lt;
      const props = (x: number) => ({ EIz: E * (Iz + (tw ** 3 * (hx(x) - h)) / 12), GIt: G * (It + (tw ** 3 * (hx(x) - h)) / 3), EIw: E * Iw * ((hx(x) - tf) / (h - tf)) ** 2 });
      const M = (x: number) => (x * (Lt - x)) / 2, qzg = (x: number) => hx(x) / 2;
      const fe = ltbCriticalFactor({ L: Lt, props, M, qzg, elements: 40 });
      expect(rel(fe, ritzMcrFactor({ L: Lt, props, M, qzg, terms: 15 }))).toBeLessThan(5e-3);
      const at = (hh: number) => ltbCriticalFactor({ L: Lt, props: () => props(((hh - hA) / (h - hA)) * Lt), M, qzg: () => hh / 2 });
      expect(fe).toBeGreaterThan(at(hA));
      expect(fe).toBeLessThan(at(h));
    });
    step('χ_LT (6.56)', () => {
      expect(chiLT(0.2, 0.34)).toBe(1);
      expect(chiLT(1, 0.34)).toBeCloseTo(0.597, 3); // Φ = 1.136
    });
  }, 120_000);
});
