/**
 * The engine in-process, for browsers without module workers. Loaded on demand
 * (it brings mathjs); changes made before it is ready are replayed. Unit tests
 * use engineFallback.sync.ts instead (vite.config.ts alias), which is synchronous.
 */
import type { CalculationEngine, CalculationResult } from '../engine';
import type { EngineClient } from './engineClient';

export function createFallbackEngine(): EngineClient {
  let e: CalculationEngine | null = null;
  const queue: ((e: CalculationEngine) => void)[] = [];
  const listeners = new Set<(ids: string[]) => void>();
  const ready = import('../engine/CalculationEngine').then(({ CalculationEngine }) => {
    e = new CalculationEngine({ unitSystem: 'SI', precision: 2 });
    e.subscribe((ids) => listeners.forEach((fn) => fn(ids)));
    e.batch(() => queue.splice(0).forEach((f) => f(e!)));
  });
  const run = (f: (e: CalculationEngine) => void) => (e ? f(e) : queue.push(f));
  return {
    batch: (fn) => (e ? e.batch(fn) : fn()),
    setRegion: (id, input) => run((x) => x.setRegion(id, input)),
    removeRegion: (id) => run((x) => x.removeRegion(id)),
    clear: () => run((x) => x.clear()),
    setSettings: (s) => run((x) => x.setSettings(s)),
    getResult: (id): CalculationResult | undefined => e?.getResult(id),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    inputInUnit: async (id, unit) => {
      await ready;
      return e!.inputInUnit(id, unit);
    },
    ready: () => ready,
    idle: () => ready,
  };
}
