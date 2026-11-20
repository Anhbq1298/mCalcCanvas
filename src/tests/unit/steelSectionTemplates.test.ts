import { describe, expect, it } from 'vitest';
import { step } from '../step';
import { CalculationEngine } from '../../engine';
import { calcKey } from '../../canvas/engineBridge';
import { templateById, type TemplateId } from '../../documents/templates';
import { sectionById } from '../../engineering/steel/sections';
import { hollowProperties } from '../../tools/steel/sections';

/** Evaluate a section worksheet with some inputs replaced (by the start of their LaTeX). */
function evaluate(id: TemplateId, inputs: Record<string, string>) {
  const { shapes } = templateById(id)!.instantiate!();
  for (const s of shapes) {
    if (s.type !== 'math') continue;
    for (const [name, rhs] of Object.entries(inputs)) if (s.props.latex.startsWith(`${name}\\coloneq`)) s.props = { ...s.props, latex: `${name}\\coloneq ${rhs}` };
  }
  const rec = Object.fromEntries(shapes.map((x) => [x.id, x]));
  const e = new CalculationEngine({ unitSystem: 'SI' });
  const math = shapes.filter((s) => s.type === 'math');
  e.batch(() => { for (const s of math) e.setRegion(s.id, { latex: s.props.latex, order: calcKey(s, rec), displayUnit: s.props.displayUnit || null, precision: null }); });
  const v = (name: string, unit = '') => {
    e.setRegion('probe', { latex: `${name}=`, order: [1e9] as never, displayUnit: unit || null, precision: null });
    const r = e.getResult('probe');
    if (r?.status !== 'valid') throw new Error(`${name}: ${r?.error?.message}`);
    return r.value!.number!;
  };
  const errors = math.filter((s) => e.getResult(s.id)?.status === 'error').map((s) => `${s.props.latex.slice(0, 50)}: ${e.getResult(s.id)?.error?.message}`);
  return { v, errors };
}
const kN = (x: number) => `${x}\\,\\mathrm{kN}`;
const kNm = (x: number) => `${x}\\,\\mathrm{kN}\\cdot\\mathrm{m}`;
const actions = (a: { N: number; My: number; Mz: number; Vz: number; Vy: number }) => ({ 'N_{Ed}': kN(a.N), 'M_{y.Ed}': kNm(a.My), 'M_{z.Ed}': kNm(a.Mz), 'V_{z.Ed}': kN(a.Vz), 'V_{y.Ed}': kN(a.Vy) });

// ---------- independent hand references (N, mm, MPa) ----------
/** Table 5.2: the lowest class whose limit is met (a Class 3 limit below the Class 2 one still gives Class 2). */
const cls = (beta: number, l: number[]) => { const i = l.findIndex((x) => beta <= x); return i < 0 ? 4 : i + 1; };
function partLimits(alpha: number, psi: number): number[] {
  const a = Math.max(alpha, 0.01);
  return [alpha > 0.5 ? 396 / (13 * alpha - 1) : 36 / a, alpha > 0.5 ? 456 / (13 * alpha - 1) : 41.5 / a, psi > -1 ? 42 / (0.67 + 0.33 * psi) : 62 * (1 - psi) * Math.sqrt(-psi)];
}
interface Act { N: number; My: number; Mz: number; Vz: number; Vy: number }
const SI = (a: Act) => ({ N: a.N * 1e3, My: Math.abs(a.My) * 1e6, Mz: Math.abs(a.Mz) * 1e6, Vz: Math.abs(a.Vz) * 1e3, Vy: Math.abs(a.Vy) * 1e3 });
const rhoOf = (u: number) => (u > 0.5 ? Math.min(0.99, (2 * u - 1) ** 2) : 0);
const fyOf = (fyn: number, t: number) => (t <= 40 ? fyn : fyn <= 355 ? fyn - 20 : fyn - 30);

function refI(id: number, act: Act, fyn = 355) {
  const s = sectionById(id).values, a = SI(act), fy = fyOf(fyn, Math.max(s.tf, s.tw)), eps = Math.sqrt(235 / fy);
  const none = a.N <= 0 && a.My === 0 && a.Mz === 0;
  const cf = (s.b - s.tw - 2 * s.r) / 2, cw = s.h - 2 * s.tf - 2 * s.r;
  const flange = none ? 1 : cls(cf / s.tf / eps, [9, 10, 14]);
  const alpha = a.My > 0 ? Math.min(1, Math.max(0, 0.5 * (1 + a.N / (cw * s.tw * fy)))) : a.N > 0 ? 1 : 0;
  const s1 = a.N / s.A + a.My * cw / (2 * s.Iy), s2 = a.N / s.A - a.My * cw / (2 * s.Iy);
  const psi = a.My > 0 && s1 > 0 ? Math.max(-3, s2 / s1) : 1;
  const web = cls(cw / s.tw / eps, partLimits(alpha, psi));
  const Class = Math.max(flange, web);
  const uVz = a.Vz / (s.Avz * fy / Math.sqrt(3)), uVy = a.Vy / (s.Avy * fy / Math.sqrt(3)), rho = Math.max(rhoOf(uVz), rhoOf(uVy));
  const Npl = s.A * fy, NV = Npl * (1 - rho), n = Math.abs(a.N) / NV;
  const Mply = s.Wpl_y * fy * (1 - rho), Mplz = s.Wpl_z * fy * (1 - rho), hw = s.h - 2 * s.tf;
  const am = Math.min((s.A - 2 * s.b * s.tf) / s.A, 0.5);
  const MNy = Math.abs(a.N) <= 0.25 * NV && Math.abs(a.N) <= 0.5 * hw * s.tw * fy * (1 - rho) ? Mply : Math.min(Mply, Mply * (1 - n) / (1 - 0.5 * am));
  const MNz = Math.abs(a.N) <= hw * s.tw * fy * (1 - rho) || n <= am ? Mplz : Mplz * (1 - ((n - am) / (1 - am)) ** 2);
  const pl = n >= 1 ? n : a.Mz === 0 ? a.My / MNy : a.My === 0 ? a.Mz / MNz : (a.My / MNy) ** 2 + (a.Mz / MNz) ** Math.max(5 * n, 1);
  const el = Math.abs(a.N) / NV + a.My / (s.Wel_y * fy * (1 - rho)) + a.Mz / (s.Wel_z * fy * (1 - rho));
  const Wy = Class <= 2 ? s.Wpl_y : s.Wel_y;
  return { Class, uVz, uN: Math.abs(a.N) / Npl, uMy: a.My / (Wy * fy * (1 - rho)), sec: Class <= 2 ? pl : el };
}

function refRHS(h: number, b: number, t: number, cf: 0 | 1, act: Act, fyn = 355) {
  const p = hollowProperties({ kind: 'RHS', h, b, t, cf }), a = SI(act), fy = fyOf(fyn, t), eps = Math.sqrt(235 / fy);
  const wall = (Mown: number, Mother: number, c: number, I: number) => {
    const alpha = Mother > 0 ? 1 : Mown > 0 ? Math.min(1, Math.max(0, 0.5 * (1 + a.N / (2 * c * t * fy)))) : a.N > 0 ? 1 : 0;
    const s1 = a.N / p.A + Mown * c / (2 * I), s2 = a.N / p.A - Mown * c / (2 * I);
    const psi = Mother > 0 ? 1 : Mown > 0 && s1 > 0 ? Math.max(-3, s2 / s1) : 1;
    return cls(c / t / eps, partLimits(alpha, psi));
  };
  const Class = Math.max(wall(a.My, a.Mz, h - 3 * t, p.Iy), wall(a.Mz, a.My, b - 3 * t, p.Iz));
  const uVz = a.Vz / (p.A * h / (b + h) * fy / Math.sqrt(3)), uVy = a.Vy / (p.A * b / (b + h) * fy / Math.sqrt(3)), rho = Math.max(rhoOf(uVz), rhoOf(uVy));
  const NV = p.A * fy * (1 - rho), n = Math.abs(a.N) / NV;
  const Mply = p.Wpl_y * fy * (1 - rho), Mplz = p.Wpl_z * fy * (1 - rho);
  const aw = Math.min((p.A - 2 * b * t) / p.A, 0.5), af = Math.min((p.A - 2 * h * t) / p.A, 0.5);
  const MNy = Math.min(Mply, Mply * (1 - Math.min(1, n)) / (1 - 0.5 * aw)), MNz = Math.min(Mplz, Mplz * (1 - Math.min(1, n)) / (1 - 0.5 * af));
  const ex = n < 0.8 ? Math.min(6, 1.66 / (1 - 1.13 * n * n)) : 6;
  const pl = n >= 1 ? n : a.Mz === 0 ? a.My / MNy : a.My === 0 ? a.Mz / MNz : ((a.My / MNy) ** ex + (a.Mz / MNz) ** ex) ** (1 / ex);
  const el = Math.abs(a.N) / NV + a.My / (p.Wel_y * fy * (1 - rho)) + a.Mz / (p.Wel_z * fy * (1 - rho));
  return { Class, sec: Class <= 2 ? pl : el };
}

function refCHS(d: number, t: number, act: Act, fyn = 355) {
  const p = hollowProperties({ kind: 'CHS', d, t }), a = SI(act), fy = fyOf(fyn, t), eps = Math.sqrt(235 / fy);
  const Class = a.N <= 0 && a.My === 0 && a.Mz === 0 ? 1 : cls(d / t / eps ** 2, [50, 70, 90]);
  const V = Math.hypot(a.Vy, a.Vz), M = Math.hypot(a.My, a.Mz), uV = V / (2 * p.A / Math.PI * fy / Math.sqrt(3)), rho = rhoOf(uV);
  const NV = p.A * fy * (1 - rho), n = Math.abs(a.N) / NV;
  const pl = n >= 1 ? n : M / (p.Wpl_y * fy * (1 - rho) * (1 - n ** 1.7));
  const el = Math.abs(a.N) / NV + M / (p.Wel_y * fy * (1 - rho));
  return { Class, sec: Class <= 2 ? pl : el };
}

const CASES: Act[] = [
  { N: 1500, My: 120, Mz: 20, Vz: 150, Vy: 20 },
  { N: -300, My: 180, Mz: 0, Vz: 220, Vy: 0 },
  { N: 2600, My: 40, Mz: 0, Vz: 40, Vy: 10 },
  { N: 400, My: 0, Mz: 60, Vz: 0, Vy: 300 },
  { N: 3000, My: 260, Mz: 70, Vz: 600, Vy: 50 },
];

describe('steel cross-section templates (EN 1993-1-1 §6.2)', () => {
  it('hollow-section properties match the Blue Book and every branch matches the hand reference', () => {
    const seen = new Set<string>();
    step('hollow-section geometry: SCI P363 hot-finished SHS 200x200x10, CHS 219.1x10; rounded RHS by numerical integration', () => {
      const shs = hollowProperties({ kind: 'RHS', h: 200, b: 200, t: 10, cf: 0 });
      expect(shs.A / 100).toBeCloseTo(74.9, 0); // cm²
      expect(shs.Iy / 1e4 / 4470).toBeCloseTo(1, 2);
      expect(shs.Wel_y / 1e3 / 447).toBeCloseTo(1, 2);
      expect(shs.Wpl_y / 1e3 / 531).toBeCloseTo(1, 2);
      const chs = hollowProperties({ kind: 'CHS', d: 219.1, t: 10 });
      expect(chs.A / 100).toBeCloseTo(65.7, 1);
      expect(chs.Iy / 1e4 / 3600).toBeCloseTo(1, 2);
      expect(chs.Wpl_y / 1e3 / 438).toBeCloseTo(1, 2);
      // rounded RHS 300x200x8 cold-formed (r_o = 2.5t): integrate the cross-section on a fine grid
      const h = 300, b = 200, t = 8, ro = 20, ri = 12, step = 0.25;
      const inside = (y: number, z: number, H: number, B: number, r: number) => {
        const dy = Math.abs(y) - (B / 2 - r), dz = Math.abs(z) - (H / 2 - r);
        return Math.abs(y) <= B / 2 && Math.abs(z) <= H / 2 && (dy <= 0 || dz <= 0 || dy * dy + dz * dz <= r * r);
      };
      let A = 0, Iy = 0, Sy = 0;
      for (let y = -b / 2 + step / 2; y < b / 2; y += step) for (let z = -h / 2 + step / 2; z < h / 2; z += step) {
        if (!inside(y, z, h, b, ro) || inside(y, z, h - 2 * t, b - 2 * t, ri)) continue;
        A += step * step; Iy += z * z * step * step; Sy += Math.abs(z) * step * step;
      }
      const p = hollowProperties({ kind: 'RHS', h, b, t, cf: 1 });
      expect(p.A / A).toBeCloseTo(1, 3);
      expect(p.Iy / Iy).toBeCloseTo(1, 3);
      expect(p.Wpl_y / (Sy)).toBeCloseTo(1, 3); // W_pl = ∫|z| dA
    });
    step('the RHS and CHS worksheets compute the same properties as the page catalogue', () => {
      const r = evaluate('steel-section-rhs', { h: '300\\,\\mathrm{mm}', b: '200\\,\\mathrm{mm}', t: '8\\,\\mathrm{mm}', '\\mathrm{CF}': '1' });
      expect(r.errors).toEqual([]);
      const p = hollowProperties({ kind: 'RHS', h: 300, b: 200, t: 8, cf: 1 });
      expect(r.v('A', 'mm^2') / p.A).toBeCloseTo(1, 9);
      expect(r.v('I_{z}', 'mm^4') / p.Iz).toBeCloseTo(1, 9);
      expect(r.v('W_{pl.z}', 'mm^3') / p.Wpl_z).toBeCloseTo(1, 9);
      const c = evaluate('steel-section-chs', {});
      expect(c.errors).toEqual([]);
      expect(c.v('W_{pl}', 'mm^3') / hollowProperties({ kind: 'CHS', d: 219.1, t: 10 }).Wpl_y).toBeCloseTo(1, 9);
    });
    step('I/H worksheet: class, shear, axial, bending and §6.2.9 / (6.42) interaction for every case', () => {
      for (const [sec, fyn] of [[1211, 355], [1013, 275], [1218, 460]] as const) {
        for (const act of CASES) {
          const r = evaluate('steel-section-i', { '\\mathrm{Section}': String(sec), 'f_{y.nom}': `${fyn}\\,\\mathrm{MPa}`, ...actions(act) });
          expect(r.errors).toEqual([]);
          const ref = refI(sec, act, fyn);
          seen.add(`I${ref.Class}`);
          const where = `${sec} ${fyn} ${JSON.stringify(act)}`;
          expect(r.v('\\mathrm{Class}'), where).toBe(ref.Class);
          if (ref.Class > 3) continue;
          expect(r.v('\\mathrm{UR}_{V.z}'), where).toBeCloseTo(ref.uVz, 9);
          expect(r.v('\\mathrm{UR}_{N}'), where).toBeCloseTo(ref.uN, 9);
          expect(r.v('\\mathrm{UR}_{M.y}'), where).toBeCloseTo(ref.uMy, 9);
          expect(r.v('\\mathrm{UR}_{sec}'), where).toBeCloseTo(ref.sec, 9);
        }
      }
    });
    step('RHS and CHS worksheets: class and interaction for every case, hot-finished and cold-formed', () => {
      for (const [h, b, t, cf, fyn] of [[200, 200, 10, 0, 355], [300, 100, 6.3, 1, 355], [400, 200, 8, 0, 275], [250, 250, 8, 0, 460]] as const) {
        for (const act of CASES) {
          const r = evaluate('steel-section-rhs', { h: `${h}\\,\\mathrm{mm}`, b: `${b}\\,\\mathrm{mm}`, t: `${t}\\,\\mathrm{mm}`, '\\mathrm{CF}': String(cf), 'f_{y.nom}': `${fyn}\\,\\mathrm{MPa}`, ...actions(act) });
          expect(r.errors).toEqual([]);
          const ref = refRHS(h, b, t, cf, act, fyn), where = `${h}x${b}x${t} ${JSON.stringify(act)}`;
          seen.add(`RHS${ref.Class}`);
          expect(r.v('\\mathrm{Class}'), where).toBe(ref.Class);
          if (ref.Class <= 3) expect(r.v('\\mathrm{UR}_{sec}'), where).toBeCloseTo(ref.sec, 9);
        }
      }
      for (const [d, t] of [[219.1, 10], [323.9, 6.3], [508, 10]] as const) {
        for (const act of CASES) {
          const r = evaluate('steel-section-chs', { d: `${d}\\,\\mathrm{mm}`, t: `${t}\\,\\mathrm{mm}`, ...actions(act) });
          expect(r.errors).toEqual([]);
          const ref = refCHS(d, t, act), where = `${d}x${t} ${JSON.stringify(act)}`;
          seen.add(`CHS${ref.Class}`);
          expect(r.v('\\mathrm{Class}'), where).toBe(ref.Class);
          if (ref.Class <= 3) expect(r.v('\\mathrm{UR}_{sec}'), where).toBeCloseTo(ref.sec, 9);
        }
      }
      // the cases reach the plastic and the elastic branch of every shape
      for (const k of ['I1', 'I3', 'RHS1', 'RHS3', 'CHS1', 'CHS3']) expect(seen, k).toContain(k);
    });
  });
});
