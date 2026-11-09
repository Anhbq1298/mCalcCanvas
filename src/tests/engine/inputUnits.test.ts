import { describe, expect, it } from 'vitest';
import { step } from '../step';
import { CalculationEngine } from '../../engine';

function setup(regions: Record<string, string>) {
  const e = new CalculationEngine();
  e.batch(() => {
    let k = 0;
    for (const [id, latex] of Object.entries(regions)) e.setRegion(id, { latex, order: [k++] });
  });
  return e;
}

describe('changing the unit of an input keeps its value', () => {
  it('changing the unit of an input keeps its value', () => {
    step('35 MPa in ksi is 5.0763… ksi, and results downstream do not change', () => {
      const e = setup({ f: 'f_{ck}\\coloneq35\\,\\mathrm{MPa}', r: 'f_{cd}\\coloneq\\frac{f_{ck}}{1.5}', o: 'f_{cd}=' });
      const before = e.getResult('o')!.value!.number!;
      const latex = e.inputInUnit('f', 'ksi')!;
      expect(latex).toMatch(/^f_\{ck\}\\coloneq5\.0763\d*\\,\\mathrm\{ksi\}$/);
      e.setRegion('f', { latex, order: [0] });
      expect(e.getResult('o')!.value!.number!).toBeCloseTo(before, 9);
    });
    step('round numbers stay short; units with powers convert', () => {
      const e = setup({ a: 'A\\coloneq2500\\,\\mathrm{mm}^2', s: 's\\coloneq150\\,\\mathrm{mm}' });
      expect(e.inputInUnit('s', 'm')).toBe('s\\coloneq0.15\\,\\mathrm{m}');
      expect(e.inputInUnit('a', 'cm²')).toBe('A\\coloneq25\\,\\mathrm{cm}^{2}');
    });
    step('not an input → null; another dimension → error', () => {
      const e = setup({ f: 'f\\coloneq35\\,\\mathrm{MPa}', g: 'g\\coloneq2f', n: 'n\\coloneq3' });
      expect(e.inputInUnit('g', 'ksi')).toBeNull();
      expect(e.inputInUnit('n', 'mm')).toBeNull();
      expect(() => e.inputInUnit('f', 'kN')).toThrow(/Cannot display/);
    });
  });
});
