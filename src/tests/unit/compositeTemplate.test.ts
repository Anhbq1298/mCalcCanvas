import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { step } from '../step';
import { CalculationEngine } from '../../engine';
import { calcKey } from '../../canvas/engineBridge';
import type { Shape } from '../../canvas/model/types';

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
      expect(value('M_{direct}','kN m')).toBeCloseTo(787.060803554457,6);
      expect(value('R_N','kN')).toBeCloseTo(0,10);
      expect(value('y_a','mm')).toBeCloseTo(5.985316722874,7);
    });
    step('construction stability failure remains visible', () => {
      expect(value('M_{cr}','kN m')).toBeCloseTo(109.24582399696,6);
      expect(value('M_{b.Rd}','kN m')).toBeCloseTo(91.271498877837,6);
      expect(value('\\mathrm{UR}_{LT}')).toBeCloseTo(1.87427046672,7);
      expect(value('\\delta_1','mm')).toBeCloseTo(18.329901234568,6);
    });
    step('staged stiffness, shrinkage and reinforcement are independently pinned', () => {
      expect(value('I_L','mm^4')).toBeCloseTo(633331327.3353621,3);
      expect(value('\\delta_{slip}','mm')).toBeCloseTo(0.920286617569,7);
      expect(value('\\delta_{sh}','mm')).toBeCloseTo(5.444690799949,7);
      expect(value('\\delta_{tot}','mm')).toBeCloseTo(25.139012406252,7);
      expect(value('a_{sf.req}','mm^2/m')).toBeCloseTo(563.428306139531,6);
      expect(value('\\mathrm{UR}_{sf}')).toBeGreaterThan(1);
    });
    step('eleven editable figures and explicit review status', () => {
      const texts=doc.shapes.filter(s => s.type==='text');
      for(let n=1;n<=11;n++) expect(texts.some(s=>s.props.html.startsWith(`D${String(n).padStart(2,'0')} —`))).toBe(true);
      expect(doc.shapes.some(s=>s.type==='image')).toBe(false);
      expect(texts.some(s=>s.props.html.includes('Singapore NA verification is outstanding'))).toBe(true);
    });
  });
});
