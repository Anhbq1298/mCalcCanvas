/** Messages between the UI thread and the calculation worker. */
import type { CalculationResult, EngineSettings, RegionInput } from '../CalculationEngine';

export type EngineOp =
  | { op: 'set'; id: string; input: RegionInput }
  | { op: 'remove'; id: string }
  | { op: 'clear' }
  | { op: 'settings'; settings: Partial<EngineSettings> };

export type ToWorker =
  | { type: 'ops'; ops: EngineOp[] }
  | { type: 'inputInUnit'; req: number; id: string; unit: string }
  /** Answered after everything before it has been calculated. */
  | { type: 'ping'; req: number };

export type FromWorker =
  | { type: 'results'; results: Record<string, CalculationResult | null> }
  | { type: 'reply'; req: number; ok: boolean; value?: string | null; error?: string };
