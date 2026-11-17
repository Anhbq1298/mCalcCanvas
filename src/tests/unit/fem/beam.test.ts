import { describe, expect, it } from 'vitest';
import { solveBeam, type BeamSupport } from '../../../engineering/fem';
import { step } from '../../step';

// In-plane beam FE (internal forces): every support condition against its closed form.
const L = 6000, EI = 210000 * 1e8, q = 10, P = 50e3; // N, mm
const pin = (x: number): BeamSupport => ({ x, w: true });
const fix = (x: number): BeamSupport => ({ x, w: true, theta: true });
const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const peak = (f: (x: number) => number, a = 0, b = L) => { let m = 0; for (let i = 0; i <= 600; i++) { const v = f(a + ((b - a) * i) / 600); if (Math.abs(v) > Math.abs(m)) m = v; } return m; };

describe('FEM: in-plane beam internal forces', () => {
  it('reproduces the closed forms for every support condition, varying EI, springs and moments', () => {
    step('simply supported, UDL: qL²/8, qL/2, 5qL⁴/384EI', () => {
      const b = solveBeam({ L, EI: () => EI, supports: [pin(0), pin(L)], loads: { dist: [{ x1: 0, x2: L, q1: q }] } });
      near(b.M(L / 2), (q * L * L) / 8); near(b.V(0), (q * L) / 2); near(b.deflection(L / 2), (5 * q * L ** 4) / (384 * EI));
      expect(b.reactions.map((r) => r.R)).toEqual([expect.closeTo((q * L) / 2, 3), expect.closeTo((q * L) / 2, 3)]);
    });
    step('simply supported, point load at a: Pab/L, shear jump P', () => {
      const a = 1000, b = solveBeam({ L, EI: () => EI, supports: [pin(0), pin(L)], loads: { point: [{ x: a, P }] } });
      near(b.M(a), (P * a * (L - a)) / L); near(b.V(a - 1) - b.V(a + 1), P);
    });
    step('cantilever, tip load: −PL at the root, PL³/3EI at the tip', () => {
      const b = solveBeam({ L, EI: () => EI, supports: [fix(0)], loads: { point: [{ x: L, P }] } });
      near(b.M(0), -P * L); near(b.deflection(L), (P * L ** 3) / (3 * EI)); near(b.reactions[0].R, P);
    });
    step('fixed–fixed, UDL: −qL²/12 at the ends, qL²/24 at mid-span, qL⁴/384EI', () => {
      const b = solveBeam({ L, EI: () => EI, supports: [fix(0), fix(L)], loads: { dist: [{ x1: 0, x2: L, q1: q }] } });
      near(b.M(0), (-q * L * L) / 12); near(b.M(L / 2), (q * L * L) / 24); near(b.deflection(L / 2), (q * L ** 4) / (384 * EI));
    });
    step('fixed–fixed, central point load: ∓PL/8', () => {
      const b = solveBeam({ L, EI: () => EI, supports: [fix(0), fix(L)], loads: { point: [{ x: L / 2, P }] } });
      near(b.M(0), (-P * L) / 8); near(b.M(L / 2), (P * L) / 8);
    });
    step('propped cantilever, UDL: −qL²/8 at the fixed end, 3qL/8 at the prop', () => {
      const b = solveBeam({ L, EI: () => EI, supports: [fix(0), pin(L)], loads: { dist: [{ x1: 0, x2: L, q1: q }] } });
      near(b.M(0), (-q * L * L) / 8); near(b.reactions[1].R, (3 * q * L) / 8);
    });
    step('two equal spans, UDL: −qL²/8 over the middle support, reactions 3/8, 10/8, 3/8', () => {
      const b = solveBeam({ L: 2 * L, EI: () => EI, supports: [pin(0), pin(L), pin(2 * L)], loads: { dist: [{ x1: 0, x2: 2 * L, q1: q }] } });
      near(b.M(L), (-q * L * L) / 8);
      b.reactions.forEach((r, i) => near(r.R, ([3, 10, 3][i] * q * L) / 8));
    });
    step('linearly varying load and a partial load: statics', () => {
      const b = solveBeam({ L, EI: () => EI, supports: [pin(0), pin(L)], loads: { dist: [{ x1: 0, x2: L, q1: 0, q2: q }] } });
      near(peak(b.M), (q * L * L) / (9 * Math.sqrt(3)), 1e-5); // triangular load: qL²/(9√3) at x = L/√3
      const c = solveBeam({ L, EI: () => EI, supports: [pin(0), pin(L)], loads: { dist: [{ x1: 2000, x2: 4000, q1: q }] } });
      near(c.M(L / 2), (q * 2000 * L) / 4 - (q * 1000 * 1000) / 2);
    });
    step('point moment at the end of a simple span: linear diagram, ±M/L reactions', () => {
      const M0 = 30e6, b = solveBeam({ L, EI: () => EI, supports: [pin(0), pin(L)], loads: { moment: [{ x: 0, M: M0 }] } });
      near(Math.abs(b.M(0)), M0); near(b.M(L / 2), b.M(0) / 2); near(Math.abs(b.reactions[0].R), M0 / L);
    });
    step('tapered EI: statically determinate moments unchanged; mid-span deflection = ∫ M m / EI', () => {
      const EIx = (x: number) => EI * (0.6 + (0.4 * x) / L);
      const b = solveBeam({ L, EI: EIx, supports: [pin(0), pin(L)], loads: { dist: [{ x1: 0, x2: L, q1: q }] }, elements: 80 });
      near(b.M(L / 3), (q * (L / 3) * ((2 * L) / 3)) / 2);
      let d = 0; const S = 2000;
      for (let i = 0; i <= S; i++) { const x = (L * i) / S, w = (i === 0 || i === S ? 1 : i % 2 ? 4 : 2) / 3; d += (w * (L / S) * ((q * x * (L - x)) / 2) * (Math.min(x, L - x) / 2)) / EIx(x); }
      near(b.deflection(L / 2), d, 1e-4);
    });
    step('tapered EI, fixed–fixed: converges with the mesh (indeterminate)', () => {
      const EIx = (x: number) => EI * (0.6 + (0.4 * x) / L), run = (n: number) => solveBeam({ L, EI: EIx, supports: [fix(0), fix(L)], loads: { dist: [{ x1: 0, x2: L, q1: q }] }, elements: n }).M(0);
      near(run(40), run(160), 1e-4);
      expect(Math.abs(run(160))).toBeLessThan((q * L * L) / 12); // the stiffer end attracts the larger moment: end at the shallow side is smaller
    });
    step('elastic support at mid-span: compatibility closed form', () => {
      const k = 2000, b = solveBeam({ L, EI: () => EI, supports: [pin(0), pin(L), { x: L / 2, w: k }], loads: { dist: [{ x1: 0, x2: L, q1: q }] } });
      const d0 = (5 * q * L ** 4) / (384 * EI), R = d0 / (1 / k + L ** 3 / (48 * EI));
      near(b.reactions[2].R, R, 1e-6); near(b.deflection(L / 2), R / k, 1e-6);
    });
    step('a mechanism is reported', () => {
      expect(() => solveBeam({ L, EI: () => EI, supports: [pin(0)], loads: { point: [{ x: L, P }] } })).toThrow(/unstable/);
    });
  });
});
