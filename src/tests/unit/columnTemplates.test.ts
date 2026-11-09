import { describe, expect, it } from 'vitest';
import { CalculationEngine } from '../../engine';
import { calcKey } from '../../canvas/engineBridge';
import { graphRegionId } from '../../canvas/graphData';
import { templateById, type TemplateId } from '../../documents/templates';

/** Registers every math region and graph series field the way the canvas does, then lists errors. */
function evaluate(id: TemplateId, inputs: Record<string, string> = {}) {
  const tpl = templateById(id)!;
  const shapes = tpl.shapes();
  for (const s of shapes) {
    if (s.type !== 'math') continue;
    for (const [prefix, latex] of Object.entries(inputs)) if (s.props.latex.startsWith(prefix)) s.props = { ...s.props, latex };
  }
  const rec = Object.fromEntries(shapes.map((x) => [x.id, x]));
  const e = new CalculationEngine();
  const ids: string[] = [];
  e.batch(() => {
    for (const s of shapes) {
      if (s.type === 'math') {
        e.setRegion(s.id, { latex: s.props.latex, order: calcKey(s, rec), displayUnit: s.props.displayUnit || null, precision: s.props.precision >= 0 ? s.props.precision : null });
        ids.push(s.id);
      } else if (s.type === 'graph') {
        s.props.series.forEach((ser, k) => {
          for (const f of ['x', 'y', 'r'] as const) {
            if (f === 'r' && ser.style !== 'segments') continue;
            const rid = graphRegionId(s.id, ser.id, f);
            e.setRegion(rid, { latex: `${ser[f]}=`, order: [...calcKey(s, rec), k, f] as never, displayUnit: (f === 'x' ? s.props.xUnit : f === 'y' ? s.props.yUnit : '') || null, precision: 8 });
            ids.push(rid);
          }
        });
      }
    }
  });
  const result = (latexStart: string) => {
    const s = shapes.find((x) => x.type === 'math' && x.props.latex.startsWith(latexStart));
    return s ? e.getResult(s.id) : undefined;
  };
  const section = shapes.find((x) => x.type === 'graph' && x.props.title === 'Section')!;
  const points = (sid: string, f: 'x' | 'y' | 'r') => e.getResult(graphRegionId(section.id, sid, f))?.value?.items ?? [];
  return { points, errors: ids.filter((i) => e.getResult(i)?.status === 'error').map((i) => `${i}: ${e.getResult(i)?.error?.message}`), result, tpl };
}

describe('column templates', () => {
  it('RC circular column check calculates without errors (UR_M, UR_V)', () => {
    const { errors, result, tpl } = evaluate('rc-circular-column');
    expect(errors).toEqual([]);
    expect(tpl.settings?.baselineSnap).toBe('minor');
    expect(result('\\mathrm{UR}_{M}\\coloneq')?.value?.number).toBeCloseTo(0.7689, 3);
    // EN 1992-1-1:2023 §8.2.3: x = 587 mm, compression chord centroid at 285.9 mm → bw = 2√(R² − (R − 285.9)²) = 1022.4 mm
    // (narrower than at the tension chord d = 911.3 mm); τEd = 2.981 MPa; ρw = 2·Aw/(bw·s) = 0.00723;
    // x ≥ 0.25d → cotθ = 2.5; strut σcd = 8.646 ≤ ν·fcd = 9.917 MPa governs.
    expect(result('b_{w}\\coloneq')?.value?.number).toBeCloseTo(2 * Math.sqrt(600 ** 2 - (600 - result('y_{cc}\\coloneq')!.value!.number!) ** 2), 6);
    expect(result('b_{w}\\coloneq')?.value?.number).toBeCloseTo(1022.41, 1);
    expect(result('\\rho_{w}\\coloneq')?.value?.number).toBeCloseTo((2 * Math.PI * 100) / 85 / 1022.415, 6);
    expect(result('\\mathrm{UR}_{V}\\coloneq')?.value?.number).toBeCloseTo(0.8718, 3);
    // Class A spirals: cot θmin × 0.8 = 2.0.
    const a = evaluate('rc-circular-column', { '\\delta_{A}\\coloneq': '\\delta_{A}\\coloneq1' });
    expect(a.errors).toEqual([]);
    expect(a.result('\\mathrm{cot}_{\\theta min}\\coloneq')?.value?.number).toBe(2);
    // Hand check at the ray point gives back (MEd, NEd)/UR_M.
    const eta = result('\\mathrm{UR}_{M}\\coloneq')!.value!.number!;
    const nAt = result('N_{R}\\left(c_{R}')!.value!.number!;
    const nEd = result('N_{Ed}\\coloneq')!.value!.number!;
    expect(Math.abs(nAt / (nEd / eta) - 1)).toBeLessThan(0.02);
  }, 30000);

  it('RC rectangular column check calculates without errors (P–Mθ curve, radial ratio)', () => {
    const { errors, result } = evaluate('rc-rectangular-column');
    expect(errors).toEqual([]);
    // Ties: corners + every other bar, mirrored pairs in one inner closed tie (6 bars on h: one tie at bars 2–3).
    expect(result('q_{h}\\coloneq')?.value?.number).toBe(1);
    expect(result('n_{w.y}\\coloneq')?.value?.number).toBe(2);
    expect(result('n_{w.x}\\coloneq')?.value?.number).toBe(4);
    // Biaxial: P–Mθ at θ = 63.4°, the neutral axis rotated for each point (NA angle ≈ 37° near NEd).
    // P–Mθ curve point at c = 0.5·H(β), interpolated to ψ = θM: reference N = 2639 kN, M = 1101 kN·m;
    // ends: pure tension −As·fyd = −3415 kN, M = 0.
    const N = result('N_{\\theta v}\\coloneq')!.value!.items!;
    const Mv = result('M_{\\theta v}\\coloneq')!.value!.items!;
    expect(Math.abs(N[7] / 2639 - 1)).toBeLessThan(0.01);
    expect(Math.abs(Mv[7] / 1101 - 1)).toBeLessThan(0.01);
    expect(N[0]).toBeCloseTo(-3415, -1);
    expect(Mv[0]).toBe(0);
    // Hand check: the strain plane at the ray point gives back (MEd, NEd)/UR_M.
    const eta = result('\\mathrm{UR}_{M}\\coloneq')!.value!.number!;
    const nAt = result('N_{R}\\left(c_{R}')!.value!.number!;
    const mAt = result('\\sqrt{\\left(M_{Rx}\\left(c_{R}')!.value!.number!;
    expect(Math.abs(nAt / (3000 / eta) - 1)).toBeLessThan(0.02);
    expect(Math.abs(mAt / (Math.hypot(600, 300) / eta) - 1)).toBeLessThan(0.02);
    expect(eta).toBeCloseTo(0.6435, 2);
    // Ray from the origin through (MEd, NEd) = (670.8, 3000): reference capacity (1042.4, 4661.7), UR_M = 0.6435.
    expect(result('\\mathrm{UR}_{M}\\coloneq')?.value?.number).toBeCloseTo(0.6435, 2);
  }, 30000);

  it('rectangular column shear to EN 1992-1-1:2023 §8.2.3: τ form, cot θmin (8.41) branches', () => {
    const num = (r: ReturnType<typeof evaluate>, k: string) => r.result(k)!.value!.number!;
    const COTMIN = '\\mathrm{cot}_{\\theta min.y}\\coloneq';
    const COT = '\\mathrm{cot}_{\\theta.y}\\coloneq';
    // Defaults: τEd = 400 kN / (500 · 0.9 · 737.5) = 1.205 MPa, x = 390 mm ≥ 0.25d → 2.5; links govern (VRd,s 755.5 kN).
    const d = evaluate('rc-rectangular-column');
    expect(d.errors).toEqual([]);
    expect(num(d, '\\tau_{Ed.y}\\coloneq')).toBeCloseTo(1.2053, 4);
    expect(num(d, COTMIN)).toBe(2.5);
    expect(num(d, '\\mathrm{UR}_{V.y}\\coloneq')).toBeCloseTo(400 / 755.5, 3);
    // Tension: 2.5 − 0.1 · 500 / 400 = 2.375; large tension stops at 1.
    const t = evaluate('rc-rectangular-column', { 'N_{Ed}\\coloneq': 'N_{Ed}\\coloneq-500\\,\\mathrm{kN}' });
    expect(t.errors).toEqual([]);
    expect(num(t, COTMIN)).toBeCloseTo(2.375, 6);
    expect(num(t, COT)).toBeCloseTo(2.375, 6);
    // 2.5 − 0.1 · 3000 / 100 < 1 → 1 (NEd within the pure-tension resistance of 3415 kN).
    expect(num(evaluate('rc-rectangular-column', { 'N_{Ed}\\coloneq': 'N_{Ed}\\coloneq-3000\\,\\mathrm{kN}', 'V_{Ed.y}\\coloneq': 'V_{Ed.y}\\coloneq100\\,\\mathrm{kN}' }), COTMIN)).toBe(1);
    // Small compression chord (fck 60, φ16): σcp ≥ 3 MPa → 3.0; σcp = 0.75 MPa → 2.5 + 0.5 · 0.75 / 3.
    const base = { 'f_{ck}\\coloneq': 'f_{ck}\\coloneq60\\,\\mathrm{MPa}', '\\phi\\coloneq': '\\phi\\coloneq16\\,\\mathrm{mm}' };
    const hi = evaluate('rc-rectangular-column', { ...base, 'N_{Ed}\\coloneq': 'N_{Ed}\\coloneq1280\\,\\mathrm{kN}' });
    expect(hi.errors).toEqual([]);
    expect(num(hi, 'x_{y}\\coloneq')).toBeLessThan(0.25 * num(hi, 'd_{y}\\coloneq'));
    expect(num(hi, COTMIN)).toBe(3);
    expect(num(evaluate('rc-rectangular-column', { ...base, 'N_{Ed}\\coloneq': 'N_{Ed}\\coloneq300\\,\\mathrm{kN}' }), COTMIN)).toBeCloseTo(2.625, 6);
    // Strut limits cotθ: τEd = 4.218 MPa, ν·fcd = 9.917 → cotθ = a/2 + √((a/2)² − 1) with a/2 = 1.1755.
    // Class A links: cot θmin × 0.8.
    expect(num(evaluate('rc-rectangular-column', { '\\delta_{A}\\coloneq': '\\delta_{A}\\coloneq1' }), COTMIN)).toBe(2);
    const s = evaluate('rc-rectangular-column', { 'V_{Ed.y}\\coloneq': 'V_{Ed.y}\\coloneq1400\\,\\mathrm{kN}' });
    const h = (0.5 * 19.8333) / (2 * num(s, '\\tau_{Ed.y}\\coloneq'));
    expect(num(s, COT)).toBeCloseTo(h + Math.sqrt(h * h - 1), 4);
    expect(num(s, '\\sigma_{cd.y}\\coloneq')).toBeCloseTo(0.5 * 19.8333, 3);
  }, 120000);

  it('a small rectangular section needs no inner ties (every bar within 150 mm of a corner)', () => {
    const { errors, result } = evaluate('rc-rectangular-column', {
      'b\\coloneq': 'b\\coloneq300\\,\\mathrm{mm}',
      'h\\coloneq': 'h\\coloneq400\\,\\mathrm{mm}',
      'n_{b}\\coloneq': 'n_{b}\\coloneq3',
      'n_{h}\\coloneq': 'n_{h}\\coloneq5',
      '\\phi\\coloneq': '\\phi\\coloneq16\\,\\mathrm{mm}',
    });
    expect(errors).toEqual([]);
    expect(result('q_{b}\\coloneq')?.value?.number).toBe(0);
    expect(result('q_{h}\\coloneq')?.value?.number).toBe(0);
    expect(result('n_{w.x}\\coloneq')?.value?.number).toBe(2);
  }, 30000);

  it('ties and legs wrap the bars (never cut into one); legs in both directions', () => {
    const { errors, result, points } = evaluate('rc-rectangular-column', {
      'b\\coloneq': 'b\\coloneq700\\,\\mathrm{mm}',
      'h\\coloneq': 'h\\coloneq1200\\,\\mathrm{mm}',
      'n_{b}\\coloneq': 'n_{b}\\coloneq5',
      'n_{h}\\coloneq': 'n_{h}\\coloneq9',
    });
    expect(errors).toEqual([]);
    expect(result('n_{T}\\coloneq')?.value?.number).toBe(2);
    expect(result('n_{L}\\coloneq')?.value?.number).toBe(2);
    const bx = points('bars', 'x');
    const by = points('bars', 'y');
    expect(bx).toHaveLength(24);
    const dw = result('\\delta_{w}\\coloneq')!.value!.number!;
    for (const sid of ['ties', 'legs']) {
      const xs = points(sid, 'x');
      const ys = points(sid, 'y');
      const g = points(sid, 'r');
      expect(xs.length).toBeGreaterThan(0);
      expect(new Set(g).size).toBe(2);
      const gap = Math.min(...xs.map((x, i) => Math.min(...bx.map((b, k) => Math.hypot(x - b, ys[i] - by[k])))));
      expect(gap).toBeGreaterThan(dw - 0.01);
    }
  }, 30000);
});
