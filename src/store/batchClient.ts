/**
 * Runs Input & Results batches off the UI thread on a small pool of calculation
 * workers (kept between runs, separate from the worksheet's own worker). The
 * cases are dealt out to up to 3 workers; each registers the worksheet once and
 * then works through its cases (see engine/batch.ts). Results arrive per case.
 * Cancelling terminates the workers of that run (a long synchronous calculation
 * cannot read a cancel message); new ones are started for the next run.
 * Without workers (unit tests) the run is in-process.
 */
import type { EngineSettings } from '../engine/CalculationEngine';
import type { BatchJob, BatchResults, BatchRowResult } from '../engine/batch';
import type { FromWorker, ToWorker } from '../engine/worker/protocol';
import { createEngineWorker } from './engineWorker';

export interface BatchHandle {
  /** All cases (rejects with a CancelledError after cancel()). */
  done: Promise<BatchResults>;
  cancel(): void;
}

export interface BatchOptions {
  detail?: boolean;
  onRow?(rowId: string, result: BatchRowResult): void;
}

export class CancelledError extends Error {
  constructor() {
    super('Batch calculation cancelled.');
  }
}

const MAX_WORKERS = 3;
const idleWorkers: Worker[] = [];
let nextJobId = 1;

const workersAvailable = () => typeof Worker !== 'undefined' && typeof window !== 'undefined' && import.meta.env?.MODE !== 'test';

/** How many workers a run of n cases uses (each worker first calculates the whole worksheet once). */
export function poolSize(n: number): number {
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
  return Math.max(1, Math.min(n, MAX_WORKERS, cores - 1));
}

export function runBatch(job: BatchJob, settings: Partial<EngineSettings>, opts: BatchOptions = {}): BatchHandle {
  if (!workersAvailable()) return inProcess(job, settings, opts);
  const jobId = nextJobId++;
  const k = poolSize(job.rows.length);
  // Deal the cases out round-robin (neighbouring cases often cost the same).
  const parts = Array.from({ length: k }, (_, w) => ({ ...job, rows: job.rows.filter((_, i) => i % k === w) })).filter((p) => p.rows.length);
  const busy: Worker[] = [];
  const results: BatchResults = {};
  let finished = false;
  let fail: (e: Error) => void = () => {};
  const done = new Promise<BatchResults>((resolve, reject) => {
    fail = (e) => {
      if (finished) return;
      finished = true;
      for (const w of busy) w.terminate();
      reject(e);
    };
    let remaining = parts.length;
    if (!remaining) {
      finished = true;
      resolve(results);
      return;
    }
    for (const part of parts) {
      let w: Worker;
      try {
        w = idleWorkers.pop() ?? createEngineWorker();
      } catch (e) {
        fail(e as Error);
        return;
      }
      busy.push(w);
      w.onerror = (ev) => fail(new Error(ev.message || 'A batch worker stopped unexpectedly.'));
      w.onmessage = (ev: MessageEvent<FromWorker>) => {
        const m = ev.data;
        if (finished || !('jobId' in m) || m.jobId !== jobId) return;
        if (m.type === 'batchRow') {
          results[m.rowId] = m.result;
          opts.onRow?.(m.rowId, m.result);
        } else if (m.type === 'batchError') {
          fail(new Error(m.error));
        } else if (m.type === 'batchDone') {
          busy.splice(busy.indexOf(w), 1);
          idleWorkers.push(w);
          if (--remaining === 0) {
            finished = true;
            resolve(results);
          }
        }
      };
      w.postMessage({ type: 'batch', jobId, job: part, settings, detail: !!opts.detail } satisfies ToWorker);
    }
  });
  return { done, cancel: () => fail(new CancelledError()) };
}

function inProcess(job: BatchJob, settings: Partial<EngineSettings>, opts: BatchOptions): BatchHandle {
  let cancelled = false;
  const done = import('../engine/batch').then(({ runBatchJob }) => {
    if (cancelled) throw new CancelledError();
    return runBatchJob(job, settings, opts);
  });
  return {
    done,
    cancel: () => {
      cancelled = true;
    },
  };
}
