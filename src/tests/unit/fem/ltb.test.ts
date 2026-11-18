import { describe, expect, it } from 'vitest';
import { chiLT, chiLTMod, FORK, ltbAnalysis, ltbCriticalFactor, solveBeam } from '../../../engineering/fem';
import { step } from '../../step';
import { ritzMcrFactor } from './ritz';
import { ltbeamReferences } from './ltbeamReferences';

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
    step('top-flange constraints: exact stations, free twist, independent sine Ritz and convergence', () => {
      const M = (x: number) => x * (L - x) / 2;
      const input = { L, props: uniform, M, qzg: () => zg };
      const unbraced = ltbCriticalFactor(input);
      expect(unbraced * L ** 2 / 8e6).toBeCloseTo(76.6037243028, 3); // independent 45-term Ritz, kNm
      // Two flange-force geometric energies independently fix the sign convention.
      const vp = 0.3, pp = 0.002, moment = 1e6;
      const flangeEnergy = 0.5 * (-moment / (2 * zg) * (vp + zg * pp) ** 2 + moment / (2 * zg) * (vp - zg * pp) ** 2);
      expect(flangeEnergy).toBeCloseTo(-moment * vp * pp, 9);
      expect(flangeEnergy).toBeLessThan(0);
      expect(ltbCriticalFactor({ ...input, flangeRestraints: [] })).toBe(unbraced);
      for (const positions of [[L / 2], [0.2 * L, 0.55 * L, 0.8 * L], [0.317 * L]]) {
        const flangeRestraints = positions.map((x) => ({ x, z: zg }));
        const fine = ltbAnalysis({ ...input, flangeRestraints, elements: 48 }, true);
        const coarse = ltbCriticalFactor({ ...input, flangeRestraints, elements: 24 });
        expect(rel(coarse, fine.lambda)).toBeLessThan(0.002);
        expect(rel(fine.lambda, ritzMcrFactor({ ...input, flangeRestraints, terms: 35 }))).toBeLessThan(0.006);
        if (positions.length === 3) expect(fine.lambda * L ** 2 / 8e6).toBeCloseTo(961.9002737252, 1);
        const mode = fine.mode!;
        const scale = Math.max(...mode.v.map(Math.abs), ...mode.phi.map((v) => Math.abs(v * zg)));
        for (const x of positions) {
          const j = mode.x.findIndex((v) => Math.abs(v - x) < 1e-6);
          expect(j).toBeGreaterThanOrEqual(0);
          expect(Math.abs(mode.v[j] + zg * mode.phi[j]) / scale).toBeLessThan(1e-12);
        }
        const twist = Math.max(...positions.map((x) => Math.abs(mode.phi[mode.x.indexOf(x)] * zg))) / scale;
        // A symmetric midspan brace can coincide with a natural twist node.
        // Unequal stations must retain twist; the symmetric mode need not.
        if (positions.length === 1 && positions[0] === L / 2) expect(twist).toBeLessThan(1e-8);
        else expect(twist).toBeGreaterThan(1e-4);
        expect(fine.lambda).toBeGreaterThan(unbraced);
        const fork = ltbCriticalFactor({ ...input, restraints: positions, elements: 48 });
        if (positions.length === 1 && positions[0] === L / 2) expect(rel(fine.lambda, fork)).toBeLessThan(1e-8);
        else expect(fine.lambda).toBeLessThan(fork);
      }
      const hx = (x: number) => 300 + (h - 300) * x / L, tf = 11.2, tw = 6.8;
      const tapered = { ...input, props: (x: number) => ({ EIz: E * (Iz + tw ** 3 * (hx(x) - h) / 12), GIt: G * (It + tw ** 3 * (hx(x) - h) / 3), EIw: E * Iw * ((hx(x) - tf) / (h - tf)) ** 2 }),
        qzg: (x: number) => hx(x) / 2, flangeRestraints: [0.2, 0.55, 0.8].map((t) => ({ x: t * L, z: hx(t * L) / 2 })) };
      const taperedFine = ltbCriticalFactor({ ...tapered, elements: 48 });
      expect(taperedFine * L ** 2 / 8e6).toBeCloseTo(826.4424827545, 1); // independent 45-term Ritz
      expect(rel(taperedFine, ritzMcrFactor({ ...tapered, terms: 35 }))).toBeLessThan(0.006);
      const at = (x: number) => ltbCriticalFactor({ ...input, flangeRestraints: [{ x, z: zg }], elements: 64 });
      // Position sensitivity is small here: compare it with an independent
      // sine-series calculation instead of assuming a fixed percentage gain.
      const referenceAt = (x: number) => ritzMcrFactor({ ...input, flangeRestraints: [{ x, z: zg }], terms: 65 });
      expect(at(L / 2) / at(0.1 * L)).toBeCloseTo(referenceAt(L / 2) / referenceAt(0.1 * L), 4);
      expect(at(L / 2)).not.toBe(at(0.1 * L));
      const mid = [{ x: L / 2, z: zg }];
      expect(ltbCriticalFactor({ ...input, flangeRestraints: mid, qzg: () => -zg })).toBeGreaterThan(ltbCriticalFactor({ ...input, flangeRestraints: mid, qzg: () => 0 }));
      expect(ltbCriticalFactor({ ...input, flangeRestraints: mid, qzg: () => 0 })).toBeGreaterThan(at(L / 2));
      expect(ltbCriticalFactor({ ...input, flangeRestraints: [{ x: 0, z: zg }, ...mid], elements: 64 })).toBeCloseTo(at(L / 2), 9);
    });
    step('published examples: SX001a / SBE Part 4 A.1 (IPE 330, top-flange UDL) M_cr 113.9; SCI P387 Ex. 02 (457×191×98) M_cr 534.0', () => {
      const run = (Lb: number, Izb: number, Itb: number, Iwb: number, Gb: number, q: number, z: number) => {
        const b = solveBeam({ L: Lb, EI: () => 1, supports: [{ x: 0, w: true }, { x: Lb, w: true }], loads: { dist: [{ x1: 0, x2: Lb, q1: q }] } });
        return (ltbCriticalFactor({ L: Lb, props: () => ({ EIz: E * Izb, GIt: Gb * Itb, EIw: E * Iwb }), M: b.M, qzg: () => q * z, elements: 48 }) * q * Lb * Lb) / 8 / 1e6;
      };
      const sx = run(5700, 788.1e4, 28.15e4, 199100e6, 80770, 22.28, 165);
      expect(rel(sx, 113.9)).toBeLessThan(0.005); // FE 114.0
      // §6.3.2.3 chain as the source (curve c, λ0 0.4, β 0.75, f with k_c 0.94 ≈ 1/√1.127 = 0.942 of the Singapore NA)
      const lam = Math.sqrt((804.3e3 * 235) / (sx * 1e6));
      expect(lam).toBeCloseTo(1.288, 2);
      for (const kc of [0.94, 1 / Math.sqrt(1.127)]) {
        const c = chiLTMod(lam, 0.49, 0.4, 0.75, kc);
        expect(c.chi0).toBeCloseTo(0.48, 2); expect(c.f).toBeCloseTo(0.984, 2);
        expect(rel(c.chi * 804.3e3 * 235, 92.24e6)).toBeLessThan(0.005); // M_b,Rd 92.24 kNm
      }
      // STAAD.Pro verification "EC3 Singapore NA – I section with conc load" (HD 320×127): λ̄ 0.656, α 0.34 → Φ 0.705
      const phi = 0.5 * (1 + 0.34 * (0.656 - 0.4) + 0.75 * 0.656 ** 2);
      expect(phi).toBeCloseTo(0.705, 3);
      expect(chiLTMod(0.656, 0.34, 0.4, 0.75, 1).chi0).toBeCloseTo(1 / (phi + Math.sqrt(phi ** 2 - 0.75 * 0.656 ** 2)), 9);
      // recommended values reduce to (6.56)
      expect(chiLTMod(1.2, 0.34, 0.2, 1, 1).chi).toBeCloseTo(chiLT(1.2, 0.34), 12);
      expect(rel(run(6000, 2350e4, 121e4, 1180000e6, 81000, 60.8, 0), 534.0)).toBeLessThan(0.005); // FE 536.0
    });
    step('χ_LT (6.56)', () => {
      expect(chiLT(0.2, 0.34)).toBe(1);
      expect(chiLT(1, 0.34)).toBeCloseTo(0.597, 3); // Φ = 1.136
    });
    step('published LTBeamN benchmarks: matched IPE300 properties and qualified nominal bracing/taper cases', () => {
      for (const c of ltbeamReferences()) {
        const values = [24, 48, 100].map((elements) => ltbCriticalFactor({ ...c.input, elements }) * c.scale);
        // Published-property cases: 0.2%; dimension-only cases: 1%. These are
        // benchmark-specific numerical bands, not design resistance tolerances.
        expect(rel(values[2], c.reference), c.id).toBeLessThan(c.scope === 'published-properties' ? 0.002 : 0.01);
        expect(rel(values[0], values[2]), `${c.id}: mesh 24/100`).toBeLessThan(1e-4);
        expect(rel(values[1], values[2]), `${c.id}: mesh 48/100`).toBeLessThan(1e-5);
      }
    });
    step('published taper effect, Raftoyiannis and Adamakos (2010), IPE 300', () => {
      const b = 150, tf = 10.7, tw = 7.1, Es = 210000, Gs = 80770, l = 3000;
      const pr = (h: number) => ({ EIz: Es * ((2 * tf * b ** 3) / 12 + (h * tw ** 3) / 12), GIt: (Gs * (2 * b * tf ** 3 + h * tw ** 3)) / 3, EIw: (Es * b ** 3 * h ** 2 * tf) / 24 });
      const mcr = (h1: number, h2: number, psi: number) => ltbCriticalFactor({ L: l, props: (x) => pr(h1 + ((h2 - h1) * x) / l), M: (x) => 1 + ((psi - 1) * x) / l });
      const drop = (psi: number) => 1 - mcr(150, 450, psi) / mcr(300, 300, psi);
      const d = [1, 0.5, 0, -0.5, -1].map(drop);
      expect(d[0]).toBeGreaterThan(0.035); expect(d[0]).toBeLessThan(0.045); // 0.039
      expect(d[3]).toBeGreaterThan(0.115); expect(d[3]).toBeLessThan(0.13); // 0.127
      expect(Math.max(...d)).toBe(d[3]); // the largest drop at ψ = −0.5
    });
  }, 120_000);
});
