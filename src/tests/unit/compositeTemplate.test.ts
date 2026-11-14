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
      for (const s of math) if (s.props.displayMode !== 'formula') e.setRegion(s.id, {
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
      expect(math.filter(s => s.props.displayMode !== 'formula').flatMap(s => {
        const r=e.getResult(s.id);return r?.status === 'error' ? [`${s.props.latex}: ${r.error?.message}`] : [];
      })).toEqual([]);
    });
    step('reference forces, connection and bending resistance', () => {
      expect(value('P_{Rd}','kN')).toBeCloseTo(81.6562762521,7);
      expect(value('\\eta')).toBeCloseTo(0.72162409281,8);
      expect(value('\\eta_{min}')).toBeCloseTo(0.49,10);
      expect(value('M_{1.Ed}','kN m')).toBeCloseTo(171.0674748,6);
      expect(value('M_{2.Ed}','kN m')).toBeCloseTo(284.4674748,6);
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
    step('staged stiffness, shrinkage and longitudinal shear are independently pinned', () => {
      expect(value('I_L','mm^4')).toBeCloseTo(633331327.3353621,3);
      expect(value('\\delta_{slip}','mm')).toBeCloseTo(0.920286617569,7);
      expect(value('\\delta_{sh}','mm')).toBeCloseTo(5.444690799949,7);
      expect(value('\\delta_{tot}','mm')).toBeCloseTo(25.139012406252,7);
      expect(value('a_{sf.req}','mm^2/m')).toBeCloseTo(281.714153069765,6);
      expect(value('\\mathrm{UR}_{sf}')).toBeCloseTo(0.5380344,7);
    });
    step('eleven editable figures, one governing stress block in the main body, explicit review status', () => {
      const texts=doc.shapes.filter(s => s.type==='text');
      for(let n=1;n<=11;n++) expect(texts.some(s=>s.props.html.startsWith(`D${String(n).padStart(2,'0')} —`))).toBe(true);
      expect(doc.shapes.some(s=>s.type==='image')).toBe(false);
      const annexY = texts.find(s => s.props.annex?.kind === 'start')!.y;
      const stressFigures = texts.filter(s => /^D0[5-7] —/.test(s.props.html));
      expect(stressFigures.filter(s => s.y < annexY).map(s => s.props.html.slice(0, 3))).toEqual(['D05']);
      expect(texts.some(s=>s.props.html.includes('Singapore NA verification is outstanding'))).toBe(true);
    });
  });
});
