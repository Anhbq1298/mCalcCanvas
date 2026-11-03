import { create } from 'zustand';
import { CalculationEngine, type CalculationResult } from '../engine';

/**
 * The single engine instance for the app. Results are mirrored into a
 * Zustand store keyed by region id so each region subscribes only to its
 * own result and re-renders only when that result changes.
 */
export const engine = new CalculationEngine({ unitSystem: 'SI', precision: 2 });

interface CalculationState {
  results: Record<string, CalculationResult | undefined>;
  /** Monotonic counter, bumped on every engine pass (status bar, tests). */
  revision: number;
}

export const useCalculationStore = create<CalculationState>(() => ({ results: {}, revision: 0 }));

engine.subscribe((ids) => {
  useCalculationStore.setState((s) => {
    const results = { ...s.results };
    for (const id of ids) results[id] = engine.getResult(id);
    return { results, revision: s.revision + 1 };
  });
});

export function useRegionResult(id: string): CalculationResult | undefined {
  return useCalculationStore((s) => s.results[id]);
}
