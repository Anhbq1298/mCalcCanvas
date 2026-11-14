import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { step } from '../step';
import { CalculationEngine } from '../../engine';
import { calcKey } from '../../canvas/engineBridge';
import type { Shape } from '../../canvas/model/types';

// Independent references: tools/templates/reference_composite.py (docs/composite-design/reference.json) and,
// for the PNA branches, a numerical integration of the rolled width with circular root fillets
// (see docs/composite-design/VALIDATION.md). None of these re-uses the worksheet formulas.
describe('EC4 phase-one composite worksheet', () => {
  it('evaluates existing operators and pins the independent N-mm-MPa reference', () => {
    const doc = JSON.parse(readFileSync('templates/Composite_Beam_EC4.mCCV', 'utf8')) as { shapes: Shape[] };
    const rec = Object.fromEntries(doc.shapes.map(s => [s.id, s]));
    const e = new CalculationEngine({ unitSystem:'SI' });
    const math = doc.shapes.filter(s => s.type === 'math');
    e.batch(() => {
      for (const s of math) e.setRegion(s.id, {
        latex:s.props.latex, order:calcKey(s,rec), displayUnit:s.props.displayUnit || null, precision:null,
      });
    });
    const value = (name:string, unit:string|null = null) => {
      e.setRegion('probe',{latex:`${name}=`,order:[1e9] as never,displayUnit:unit,precision:null});
      const r=e.getResult('probe');
      if(r?.status!=='valid') throw new Error(`${name}: ${r?.error?.message}`);
      return r.value!.number!;
    };
    const region = (start:string) => {
      const s = math.find(m => m.props.latex.startsWith(start));
      if (!s) throw new Error(`no region ${start}`);
      return s.id;
    };
    const passes = (start:string) => e.getResult(region(start))?.check?.pass;
    const studs = region('n_h\\coloneq');
    step('all active equations are dimensionally valid', () => {
      expect(math.flatMap(s => {
        const r=e.getResult(s.id);return r?.status === 'error' ? [`${s.props.latex}: ${r.error?.message}`] : [];
      })).toEqual([]);
    });
    step('reference forces, connection and bending resistance', () => {
      expect(value('P_{Rd}','kN')).toBeCloseTo(81.6562762521,7);
      expect(value('\\eta')).toBeCloseTo(0.72162409281,8);
      expect(value('\\eta_{min}')).toBeCloseTo(0.49,10);
      expect(value('M_{1.Ed}','kN m')).toBeCloseTo(171.0674748,6);
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(469.188257625,6);
      expect(value('M_{pl.Rd}','kN m')).toBeCloseTo(850.742634375,6);
      expect(value('M_{Rd}','kN m')).toBeCloseTo(732.504518208868,6);
      expect(value('M_{Rd.pl}','kN m')).toBeCloseTo(787.060803554457,5);
    });
    step('neutral axes follow from the inputs: slab depth and steel PNA differ', () => {
      expect(value('x_f','mm')).toBeCloseTo(79.875,9);
      expect(value('x_c','mm')).toBeCloseTo(57.6397244133,8);
      expect(value('y_a','mm')).toBeCloseTo(5.985316722873,7);
      expect(value('y_a','mm')).toBeLessThan(value('t_f','mm'));
      expect(value('\\eta_f')).toBeCloseTo(0.404674509804,9);
      expect(Math.abs(value('R_N','kN'))).toBeLessThan(1e-9);
      expect(passes('A_{ac}\\le')).toBe(true);
      expect(passes('\\min\\left(A_{ac}-A_f')).toBe(true);
    });
    step('reduced connection moves the steel PNA down, through the flange into the web', () => {
      // n_h = 14: eta = 0.4209 > eta_f, flange branch; n_h = 8: eta = 0.2405, web below the fillet toe.
      e.setDefinitionOverride(studs, { value: 14 });
      expect(value('y_a','mm')).toBeCloseTo(12.450119409312,7);
      expect(value('M_{Rd.pl}','kN m')).toBeCloseTo(694.310485488021,5);
      e.setDefinitionOverride(studs, { value: 8 });
      expect(value('y_a','mm')).toBeCloseTo(86.617080739391,3);
      expect(value('M_{Rd.pl}','kN m')).toBeCloseTo(612.145793942433,2);
      expect(passes('\\eta_{min}\\le')).toBe(false);
      expect(value('M_{Rd}','kN m')).toBeCloseTo(426,9); // eta < eta_min: no composite credit
      // n_h = 13: eta = 0.391 lies between the fillet-toe and flange boundaries: the unimplemented branch is flagged.
      e.setDefinitionOverride(studs, { value: 13 });
      expect(passes('\\min\\left(A_{ac}-A_f')).toBe(false);
      e.setDefinitionOverride(studs, null);
      expect(value('y_a','mm')).toBeCloseTo(5.985316722873,7);
    });
    step('construction stability failure remains visible', () => {
      expect(value('M_{cr}','kN m')).toBeCloseTo(109.24582399696,6);
      expect(value('M_{b.Rd}','kN m')).toBeCloseTo(91.271498877837,6);
      expect(value('\\mathrm{UR}_{LT}')).toBeCloseTo(1.87427046672,7);
      expect(value('\\delta_1','mm')).toBeCloseTo(18.329901234568,6);
    });
    step('load tables: internal forces, stud spacing from the max-moment position, PNA case, staged deflection', () => {
      expect(value('V_{2.Ed}','kN')).toBeCloseTo(209.7337374,6);
      expect(value('x_M','m')).toBeCloseTo(3,9);
      expect(value('\\eta_{req}')).toBeCloseTo(0.49,10);
      expect(value('n_{req}')).toBe(17);
      expect(value('n_A')).toBe(24);
      expect(value('n_B')).toBe(25);
      expect(value('n_h')).toBe(24);
      expect(value('\\mathrm{UR}_{M.x}')).toBeCloseTo(0.66006407439817,8); // just right of the load, 24 studs at 200 mm reach support B
      expect(value('n_{P}')).toBe(24);
      expect(value('k_M')).toBe(1);
      expect(value('k_P')).toBe(1);
      expect(value('v_f','kN/m')).toBeCloseTo(653.250210016847,6);
      expect(value('\\mathrm{UR}_{sf}')).toBeCloseTo(0.7173792,7);
      // virtual-work sum on the 200-step grid vs closed-form midspan deflections
      expect(value('\\delta_{LT}','mm')).toBeCloseTo(6.076147064926,3);
      expect(value('\\delta_{tr}','mm')).toBeCloseTo(3.763195482790,3);
      expect(value('\\delta_{slip}','mm')).toBeCloseTo(1.850200836823,3);
      expect(value('\\delta_{sh}','mm')).toBeCloseTo(5.444690799949,7);
      expect(value('\\delta_{tot}','mm')).toBeCloseTo(31.054964343218,2);
      expect(value('\\sigma_{c.bot}','MPa')).toBeCloseTo(0.211129167388,7);
      expect(value('I_L','mm^4')).toBeCloseTo(633331327.3353621,3);
    });
    // Load tables: one column region per variable, one row per load.
    const original = new Map<string, string>();
    const setColumn = (name: string, entries: string[] | null) => {
      const id = region(`${name}\\coloneq`);
      if (!original.has(id)) original.set(id, (math.find(s => s.id === id) as Extract<Shape, { type: 'math' }>).props.latex);
      const latex = entries ? `${name}\\coloneq\\begin{bmatrix}${entries.join('\\\\')}\\end{bmatrix}` : original.get(id)!;
      e.setRegion(id, { latex, order: calcKey(rec[id], rec), displayUnit: null, precision: null });
    };
    const restore = (...names: string[]) => names.forEach((n) => setColumn(n, null));
    const q = (v: number, u: string) => `${v}\\,\\mathrm{${u}}`;
    step('adding a table row adds a load', () => {
      setColumn('a_{j}', [q(3, 'm'), q(3, 'm'), q(6, 'm')]);
      setColumn('G_{k.j}', [q(30, 'kN'), q(0, 'kN'), q(10, 'kN')]);
      setColumn('Q_{k.j}', [q(0, 'kN'), q(45, 'kN'), q(10, 'kN')]);
      // closed form: maximum 490.6303 kNm at x = 3.0614 m; the 40 mm grid is within w·Δx²/8 = 0.007 kNm
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(490.630293556811,1);
      expect(value('V_{2.Ed}','kN')).toBeCloseTo(216.8587374,6);
      expect(value('M_P','kN m')).toBeCloseTo(490.563257625, 6); // first row: moment under the 3 m load
      restore('a_{j}', 'G_{k.j}', 'Q_{k.j}');
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(469.188257625,6);
    });
    step('area-load rows are pressures times the load width', () => {
      expect(value('g_u','kN/m')).toBeCloseTo(4.5,9); // 1.5 kPa × 3 m
      setColumn('x_{1.i}', [q(0, 'm'), q(0, 'm'), q(0, 'm')]);
      setColumn('x_{2.i}', [q(8, 'm'), q(8, 'm'), q(8, 'm')]);
      setColumn('g_{k.i}', [q(1.5, 'kPa'), q(0, 'kPa'), q(1, 'kPa')]);
      setColumn('q_{k.i}', [q(0, 'kPa'), q(3, 'kPa'), q(0, 'kPa')]);
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(499.563257625,6); // closed form, extra 1 kPa × 3 m permanent
      expect(value('V_{2.Ed}','kN')).toBeCloseTo(225.9337374,6);
      restore('x_{1.i}', 'x_{2.i}', 'g_{k.i}', 'q_{k.i}');
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(469.188257625,6);
    });
    step('a large point load moves the maximum moment and the stud spacing with it', () => {
      setColumn('a_{j}', [q(2, 'm')]);
      setColumn('G_{k.j}', [q(100, 'kN')]);
      setColumn('Q_{k.j}', [q(150, 'kN')]);
      expect(value('x_M','m')).toBeCloseTo(2,9);
      expect(value('n_A')).toBe(16); // 125 mm spacing over 2 m: too few studs for eta_min
      expect(passes('\\eta_{min}\\le')).toBe(false);
      restore('a_{j}', 'G_{k.j}', 'Q_{k.j}');
      expect(value('x_M','m')).toBeCloseTo(3,9);
    });
    step('propped construction: span and LTB length k_LT L, g0 on the composite section, slip factor 0.5', () => {
      const prop = region('c_{prop}\\coloneq');
      e.setDefinitionOverride(prop, { value: 1 });
      expect(value('L_{LT}','m')).toBeCloseTo(4,9);
      expect(value('M_{1.Ed}','kN m')).toBeCloseTo(42.7668687,6);
      expect(value('\\mathrm{UR}_{LT}')).toBeCloseTo(0.215961724294,7);
      expect(value('\\delta_1','mm')).toBeCloseTo(1.145618827160,7);
      expect(value('\\delta_g','mm')).toBeCloseTo(4.747716691888,7);
      expect(value('C_s')).toBeCloseTo(0.5,10);
      expect(value('\\delta_{slip}','mm')).toBeCloseTo(3.083668061372,3);
      expect(value('\\delta_{tot}','mm')).toBeCloseTo(23.115418100925,2);
      e.setDefinitionOverride(prop, null);
      expect(value('\\mathrm{UR}_{LT}')).toBeCloseTo(1.87427046672,7);
    });
    step('SCI P364 Example 8 (533×165×75 UKB S275, L = 12 m, C25/30): same equations, same results', () => {
      const set: [string, number, string | null][] = [['L\\coloneq',12,'m'],['s_b\\coloneq',3.5,'m'],['h_c\\coloneq',130,'mm'],['f_y\\coloneq',275,'MPa'],
        ['f_{ck}\\coloneq',25,'MPa'],['E_{cm}\\coloneq',31,'GPa'],['h_a\\coloneq',529.1,'mm'],['b_a\\coloneq',165.9,'mm'],['t_f\\coloneq',13.6,'mm'],
        ['t_w\\coloneq',9.7,'mm'],['r\\coloneq',12.7,'mm'],['A_a\\coloneq',9520,'mm^2'],['W_{pl}\\coloneq',1810000,'mm^3']];
      for (const [start, v, u] of set) e.setDefinitionOverride(region(start), { value: v, unit: u });
      expect(value('P_{c.Rd}','kN')).toBeCloseTo(73.7303062899,6);  // SCI 73.7
      expect(value('\\eta_{min}')).toBeCloseTo(0.496545454545,9);    // SCI 0.50
      expect(value('b_{eff}','mm')).toBeCloseTo(3000,9);              // SCI 3.00 m
      expect(value('x_f','mm')).toBeCloseTo(61.6,9);                  // SCI 61.5
      expect(value('M_{pl.Rd}','kN m')).toBeCloseTo(952.2975,6);       // SCI 952.4
      const eta = region('\\eta\\coloneq');
      e.setDefinitionOverride(eta, { value: 1252 / 2618 });
      // η = 0.478 < η_min 0.497 of (6.12): no composite credit here, as in SCI's standard rule
      expect(value('M_{Rd}','kN m')).toBeCloseTo(497.75,6);
      // SCI accepts it with the relaxed deck rule η_min = 0.4 (not in this solid-slab sheet): same (6.3)
      const etaMin = region('\\eta_{min}\\coloneq');
      e.setDefinitionOverride(etaMin, { value: 0.4 });
      expect(value('M_{Rd}','kN m')).toBeCloseTo(715.127184873950,6);  // SCI 715.7 (η rounded to 0.48)
      e.setDefinitionOverride(etaMin, null);
      e.setDefinitionOverride(eta, null);
      for (const [start] of set) e.setDefinitionOverride(region(start), null);
      expect(value('M_{pl.Rd}','kN m')).toBeCloseTo(850.742634375,6);
    });
    step('three static symbolic figures and three graphs; explicit review status', () => {
      const texts=doc.shapes.filter(s => s.type==='text');
      expect(texts.filter(s=>/^F\d —/.test(s.props.html)).map(s=>s.props.html.slice(0,2))).toEqual(['F1','F2','F3']);
      expect(texts.some(s=>s.props.html.includes('<i>h</i><sub>c</sub>'))).toBe(true);
      expect(doc.shapes.filter(s=>s.type==='graph')).toHaveLength(3);
      expect(doc.shapes.some(s=>s.type==='image')).toBe(false);
      expect(texts.some(s=>s.props.html.includes('Singapore NA verification is outstanding'))).toBe(true);
    });
  });
});
