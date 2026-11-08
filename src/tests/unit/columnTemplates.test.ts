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
  it('RC circular column check calculates without errors (ηR, ηV)', () => {
    const { errors, result, tpl } = evaluate('rc-circular-column');
    expect(errors).toEqual([]);
    expect(tpl.settings?.baselineSnap).toBe('minor');
    expect(result('\\eta_{R}\\coloneq')?.value?.number).toBeCloseTo(0.7689, 3);
    expect(result('\\eta_{V}\\coloneq')?.value?.number).toBeCloseTo(0.612, 3);
    // Hand check at the ray point gives back (MEd, NEd)/ηR.
    const eta = result('\\eta_{R}\\coloneq')!.value!.number!;
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
    // Hand check: the strain plane at the ray point gives back (MEd, NEd)/ηR.
    const eta = result('\\eta_{R}\\coloneq')!.value!.number!;
    const nAt = result('N_{R}\\left(c_{R}')!.value!.number!;
    const mAt = result('\\sqrt{\\left(M_{Rx}\\left(c_{R}')!.value!.number!;
    expect(Math.abs(nAt / (3000 / eta) - 1)).toBeLessThan(0.02);
    expect(Math.abs(mAt / (Math.hypot(600, 300) / eta) - 1)).toBeLessThan(0.02);
    expect(eta).toBeCloseTo(0.6435, 2);
    // Ray from the origin through (MEd, NEd) = (670.8, 3000): reference capacity (1042.4, 4661.7), ηR = 0.6435.
    expect(result('\\eta_{R}\\coloneq')?.value?.number).toBeCloseTo(0.6435, 2);
  }, 30000);

  it('rectangular column in tension: cotθ from CSA, kept within 1 … Copt', () => {
    const { errors, result } = evaluate('rc-rectangular-column', { 'N_{Ed}\\coloneq': 'N_{Ed}\\coloneq-500\\,\\mathrm{kN}' });
    expect(errors).toEqual([]);
    const t = result('t_{y}\\coloneq')!.value!.number!;
    const csa = result('C_{CSA.y}\\coloneq')!.value!.number!;
    const opt = result('C_{opt.y}\\coloneq')!.value!.number!;
    expect(t).toBeCloseTo(Math.max(1, Math.min(csa, opt)), 6);
    expect(t).toBeLessThan(opt);
  }, 30000);

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
