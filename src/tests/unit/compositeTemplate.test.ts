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
      expect(value('s_A','mm')).toBeCloseTo(125,9);
      expect(value('s_B','mm')).toBeCloseTo(208.333333333333,9);
      // just right of the 3 m point load only 23 studs reach support B: UR exceeds the value at x_M
      expect(value('\\mathrm{UR}_{M.x}')).toBeCloseTo(0.67014302413677,8);
      expect(value('\\mathrm{UR}_{M.x}')).toBeGreaterThan(value('\\mathrm{UR}_{M.2}'));
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
    step('adding a table row adds a load', () => {
      const pt = region('P_{pt}\\coloneq');
      const latex = (math.find(s => s.id === pt) as Extract<Shape, { type: 'math' }>).props.latex;
      e.setRegion(pt, { latex: latex.replace('\\end{bmatrix}', '\\\\6\\,\\mathrm{m}&10\\,\\mathrm{kN}&10\\,\\mathrm{kN}\\end{bmatrix}'), order: calcKey(rec[pt], rec), displayUnit: null, precision: null });
      // closed form: maximum 490.6303 kNm at x = 3.0614 m; the 40 mm grid is within w·Δx²/8 = 0.007 kNm
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(490.630293556811,1);
      expect(value('V_{2.Ed}','kN')).toBeCloseTo(216.8587374,6);
      expect(value('M_P','kN m')).toBeCloseTo(490.563257625, 6); // first row: moment under the 3 m load
      e.setRegion(pt, { latex, order: calcKey(rec[pt], rec), displayUnit: null, precision: null });
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(469.188257625,6);
    });
    step('a large point load moves the maximum moment and the stud spacing with it', () => {
      const pt = region('P_{pt}\\coloneq');
      const latex = (math.find(s => s.id === pt) as Extract<Shape, { type: 'math' }>).props.latex;
      e.setRegion(pt, { latex: '\\begin{bmatrix}2\\,\\mathrm{m}&100\\,\\mathrm{kN}&150\\,\\mathrm{kN}\\end{bmatrix}'.replace(/^/, 'P_{pt}\\coloneq'), order: calcKey(rec[pt], rec), displayUnit: null, precision: null });
      expect(value('x_M','m')).toBeCloseTo(2,9);
      expect(value('s_A','mm')).toBeCloseTo(83.333333333333,9);
      expect(passes('s_{min}\\le s_A')).toBe(false); // 24 studs over 2 m are closer than 5d
      e.setRegion(pt, { latex, order: calcKey(rec[pt], rec), displayUnit: null, precision: null });
      expect(value('x_M','m')).toBeCloseTo(3,9);
    });
    step('three static symbolic figures and four graphs; explicit review status', () => {
      const texts=doc.shapes.filter(s => s.type==='text');
      expect(texts.filter(s=>/^F\d —/.test(s.props.html)).map(s=>s.props.html.slice(0,2))).toEqual(['F1','F2','F3']);
      expect(texts.some(s=>s.props.html.includes('<i>h</i><sub>c</sub>'))).toBe(true);
      expect(doc.shapes.filter(s=>s.type==='graph')).toHaveLength(4);
      expect(doc.shapes.some(s=>s.type==='image')).toBe(false);
      expect(texts.some(s=>s.props.html.includes('Singapore NA verification is outstanding'))).toBe(true);
    });
  });
});
