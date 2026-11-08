import { describe, expect, it } from 'vitest';
import { CalculationEngine } from '../../engine';
import { readingKey } from '../../canvas/engineBridge';
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
  const e = new CalculationEngine();
  const ids: string[] = [];
  e.batch(() => {
    for (const s of shapes) {
      if (s.type === 'math') {
        e.setRegion(s.id, { latex: s.props.latex, order: readingKey(s), displayUnit: s.props.displayUnit || null, precision: s.props.precision >= 0 ? s.props.precision : null });
        ids.push(s.id);
      } else if (s.type === 'graph') {
        s.props.series.forEach((ser, k) => {
          for (const f of ['x', 'y'] as const) {
            const rid = graphRegionId(s.id, ser.id, f);
            e.setRegion(rid, { latex: `${ser[f]}=`, order: [...readingKey(s), k, f] as never, displayUnit: (f === 'x' ? s.props.xUnit : s.props.yUnit) || null, precision: 8 });
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
  return { errors: ids.filter((i) => e.getResult(i)?.status === 'error').map((i) => `${i}: ${e.getResult(i)?.error?.message}`), result, tpl };
}

describe('column templates', () => {
  it('RC circular column check calculates without errors (ηM, ηR, ηV)', () => {
    const { errors, result, tpl } = evaluate('rc-circular-column');
    expect(errors).toEqual([]);
    expect(tpl.settings?.baselineSnap).toBe('minor');
    expect(result('\\eta_{M}\\coloneq')?.value?.number).toBeCloseTo(0.7675, 3);
    expect(result('\\eta_{R}\\coloneq')?.value?.number).toBeCloseTo(0.7689, 3);
    expect(result('\\eta_{V}\\coloneq')?.value?.number).toBeCloseTo(0.612, 3);
  }, 30000);

  it('RC rectangular column check calculates without errors (MRd,x, MRd,y, (5.39))', () => {
    const { errors, result } = evaluate('rc-rectangular-column');
    expect(errors).toEqual([]);
    // Independent fibre integration (2000 strips, exact root on c): 1463.7 / 955.1 kN·m, η = 0.6308.
    expect(result('M_{Rd.x}\\coloneq')?.value?.number).toBeCloseTo(1463.5, 0);
    expect(result('M_{Rd.y}\\coloneq')?.value?.number).toBeCloseTo(954.9, 0);
    expect(result('\\eta_{xy}\\coloneq')?.value?.number).toBeCloseTo(0.631, 3);
    // Ties: corners + every other bar, mirrored pairs in one inner closed tie (6 bars on h: one tie at bars 2–3).
    expect(result('q_{h}\\coloneq')?.value?.number).toBe(1);
    expect(result('n_{w.y}\\coloneq')?.value?.number).toBe(2);
    expect(result('n_{w.x}\\coloneq')?.value?.number).toBe(4);
    // P–Mθ (NA ⟂ θ = 63.4°): independent 400×400 fibre grid gives 1282.8 kN·m.
    expect(result('M_{Rd.\\theta}\\coloneq')?.value?.number).toBeCloseTo(1282.6, 0);
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
});
