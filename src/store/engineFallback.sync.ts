/** Synchronous in-process engine for unit tests (aliased over engineFallback.ts in vite.config.ts). */
import { CalculationEngine } from '../engine/CalculationEngine';
import type { EngineClient } from './engineClient';

export function createFallbackEngine(): EngineClient {
  const e = new CalculationEngine({ unitSystem: 'SI', precision: 2 });
  return {
    batch: (fn) => e.batch(fn),
    setRegion: (id, input) => e.setRegion(id, input),
    removeRegion: (id) => e.removeRegion(id),
    clear: () => e.clear(),
    setSettings: (s) => e.setSettings(s),
    getResult: (id) => e.getResult(id),
    subscribe: (fn) => e.subscribe(fn),
    inputInUnit: async (id, unit) => e.inputInUnit(id, unit),
    ready: async () => {},
    idle: async () => {},
  };
}
