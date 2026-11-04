/**
 * Deterministic performance checks for large worksheets. Evaluation counts
 * are asserted (they are deterministic); wall-clock times are only logged.
 */
import { describe, expect, it } from 'vitest';
import { CalculationEngine } from '../../engine';

/** N regions: groups of 5 (an input and a 4-step chain), plus a shared x redefined every 50 regions. */
function worksheet(n: number): [string, string][] {
  const out: [string, string][] = [];
  for (let k = 0; k < n; k++) {
    if (k % 50 === 0) out.push([`r${k}`, `x\\coloneq${k + 1}`]);
    else if (k % 5 === 0 || k % 50 === 1) out.push([`r${k}`, `v_{${k}}\\coloneq${k}\\,\\mathrm{m}`]);
    else if (k % 5 === 4) out.push([`r${k}`, `v_{${k}}\\coloneq v_{${k - 1}}\\cdot x`]);
    else out.push([`r${k}`, `v_{${k}}\\coloneq2v_{${k - 1}}`]);
  }
  return out;
}

function load(n: number) {
  const e = new CalculationEngine();
  const regs = worksheet(n);
  const t0 = performance.now();
  e.batch(() => regs.forEach(([id, latex], i) => e.setRegion(id, { latex, order: i * 10 })));
  return { e, regs, ms: performance.now() - t0 };
}

function measure(e: CalculationEngine, fn: () => void) {
  let count = 0;
  const off = e.subscribe((ids) => (count += ids.length));
  const t0 = performance.now();
  fn();
  const ms = performance.now() - t0;
  off();
  return { count, ms };
}

describe('performance (100 / 500 / 1000 regions)', () => {
  for (const n of [100, 500, 1000]) {
    it(`${n} regions`, () => {
      const { e, ms: loadMs } = load(n);
      expect([...Array(n).keys()].every((k) => e.getResult(`r${k}`)?.status === 'valid')).toBe(true);

      // Edit one input in the middle: only its 4-step chain recalculates.
      const mid = Math.floor(n / 2 / 50) * 50 + 5; // an input (not x)
      const edit = measure(e, () => e.setRegion(`r${mid}`, { latex: `v_{${mid}}\\coloneq${mid + 1}\\,\\mathrm{m}`, order: mid * 10 }));

      // Edit the first x: regions using that definition of x (until the next x) recalculate.
      const editX = measure(e, () => e.setRegion('r0', { latex: 'x\\coloneq2', order: 0 }));

      // Move a chain step a little (same relative order): only that region is re-resolved.
      const move = measure(e, () => e.setRegion(`r${mid + 2}`, { latex: `v_{${mid + 2}}\\coloneq2v_{${mid + 1}}`, order: mid * 10 + 21 }));

      // 20 keystrokes in one input.
      const typing = measure(e, () => {
        for (let i = 0; i < 20; i++) e.setRegion(`r${mid}`, { latex: `v_{${mid}}\\coloneq${i + 1}\\,\\mathrm{m}`, order: mid * 10, draft: true });
      });
      console.log(
        `[perf] n=${n} load=${loadMs.toFixed(1)}ms | edit input: ${edit.count} evaluated ${edit.ms.toFixed(2)}ms | edit x: ${editX.count} evaluated ${editX.ms.toFixed(2)}ms | move: ${move.count} evaluated ${move.ms.toFixed(2)}ms | 20 keystrokes: ${typing.count} evaluated ${typing.ms.toFixed(1)}ms`,
      );
      expect(edit.count).toBeLessThanOrEqual(5);
      expect(editX.count).toBeLessThanOrEqual(1 + 10); // r0 + the x-users before the next x (k = 4, 9, …, 49)
      expect(move.count).toBeLessThanOrEqual(3);
    });
  }
});
