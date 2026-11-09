import { describe, expect, it } from 'vitest';
import { step } from '../step';
import { CalculationEngine } from '../../engine';

describe('progressive results', () => {
  it('progressive results', () => {
    step('publishes finished regions during a long recalculation, in reading order, each once', () => {
      const e = new CalculationEngine();
      e.progressIntervalMs = 1e-9; // publish before every region
      const batches: string[][] = [];
      e.subscribe((ids) => batches.push([...ids]));
      e.batch(() => {
        e.setRegion('c', { latex: 'c\\coloneq a+b', order: [3] });
        e.setRegion('a', { latex: 'a\\coloneq1', order: [1] });
        e.setRegion('b', { latex: 'b\\coloneq2', order: [2] });
        e.setRegion('d', { latex: 'c=', order: [4] });
      });
      expect(batches.length).toBeGreaterThan(1);
      expect(batches[0]).toEqual(['a']);
      expect(batches.flat().sort()).toEqual(['a', 'b', 'c', 'd']);
      expect(e.getResult('d')?.status).toBe('valid');
    });
    step('publishes once when disabled (default)', () => {
      const e = new CalculationEngine();
      const batches: string[][] = [];
      e.subscribe((ids) => batches.push([...ids]));
      e.batch(() => {
        e.setRegion('a', { latex: 'a\\coloneq1', order: [1] });
        e.setRegion('b', { latex: 'b\\coloneq a+1', order: [2] });
      });
      expect(batches).toHaveLength(1);
    });
  });
});
