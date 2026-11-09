import { describe, expect, it } from 'vitest';
import { step } from '../step';
import { CalculationEngine } from '../../engine';

describe('definition overrides', () => {
  it('definition overrides', () => {
    step('overrides a definition without replacing its source expression', () => {
      const engine = new CalculationEngine({ unitSystem: 'SI', precision: 2 });
      engine.batch(() => {
        engine.setRegion('load', { latex: 'N_{Ed}\\coloneq5000\\mathrm{kN}', order: 0 });
        engine.setRegion('ratio', { latex: '\\eta\\coloneq\\frac{N_{Ed}}{10000\\mathrm{kN}}', order: 1 });
        engine.setDefinitionOverride('load', { value: 6500, unit: 'kN' });
      });

      expect(engine.getResult('load')?.overridden).toBe(true);
      expect(engine.getResult('load')?.value?.number).toBe(6500);
      expect(engine.getResult('ratio')?.value?.number).toBeCloseTo(0.65, 9);
      expect(engine.getResult('load')?.expressionLatex).toContain('5000');
    });
    step('restores the worksheet definition when an override is cleared', () => {
      const engine = new CalculationEngine();
      engine.batch(() => {
        engine.setRegion('load', { latex: 'N_{Ed}\\coloneq5000\\mathrm{kN}', order: 0 });
        engine.setRegion('ratio', { latex: '\\eta\\coloneq\\frac{N_{Ed}}{10000\\mathrm{kN}}', order: 1 });
        engine.setDefinitionOverride('load', { value: 6500, unit: 'kN' });
      });
      engine.setDefinitionOverride('load', null);

      expect(engine.getResult('load')?.overridden).toBeUndefined();
      expect(engine.getResult('ratio')?.value?.number).toBeCloseTo(0.5, 9);
    });
    step('rejects non-finite scenario values', () => {
      const engine = new CalculationEngine();
      expect(() => engine.setDefinitionOverride('load', { value: Number.NaN, unit: 'kN' })).toThrow('finite number');
    });
  });
});
