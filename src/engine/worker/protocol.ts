/** Messages between the UI thread and the calculation worker. */
import type { CalculationResult, EngineSettings, RegionInput } from '../CalculationEngine';
import type { BatchJob, BatchResults } from '../batch';

export type EngineOp =
  | { op: 'set'; id: string; input: RegionInput }
  | { op: 'remove'; id: string }
  | { op: 'clear' }
  | { op: 'settings'; settings: Partial<EngineSettings> };

export type ToWorker =
  | { type: 'ops'; ops: EngineOp[] }
  | { type: 'inputInUnit'; req: number; id: string; unit: string }
  /** Answered after everything before it has been calculated. */
  | { type: 'ping'; req: number }
  /** Input & Results run (sent to a fresh worker, see store/batchClient.ts). */
  | { type: 'batch'; job: BatchJob; settings: Partial<EngineSettings> };

export type FromWorker =
  | { type: 'results'; results: Record<string, CalculationResult | null> }
  | { type: 'reply'; req: number; ok: boolean; value?: string | null; error?: string }
  | { type: 'batchResult'; ok: true; results: BatchResults }
  | { type: 'batchResult'; ok: false; error: string };
