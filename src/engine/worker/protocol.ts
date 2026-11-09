/** Messages between the UI thread and the calculation worker. */
import type { CalculationResult, EngineSettings, RegionInput } from '../CalculationEngine';
import type { BatchJob, BatchRowResult } from '../batch';

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
  /** Input & Results run on a batch worker (see store/batchClient.ts). */
  | { type: 'batch'; jobId: number; job: BatchJob; settings: Partial<EngineSettings>; detail: boolean };

export type FromWorker =
  | { type: 'results'; results: Record<string, CalculationResult | null> }
  | { type: 'reply'; req: number; ok: boolean; value?: string | null; error?: string }
  /** Sent once the worker has started and can take messages. */
  | { type: 'ready' }
  | { type: 'batchRow'; jobId: number; rowId: string; result: BatchRowResult }
  | { type: 'batchDone'; jobId: number }
  | { type: 'batchError'; jobId: number; error: string };
