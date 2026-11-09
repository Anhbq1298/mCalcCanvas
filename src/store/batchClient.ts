/**
 * Runs an Input & Results batch off the UI thread: a fresh calculation worker per
 * run (so the worksheet keeps calculating meanwhile), or in-process where workers
 * are unavailable (unit tests).
 */
import type { EngineSettings } from '../engine/CalculationEngine';
import type { BatchJob, BatchResults } from '../engine/batch';
import type { FromWorker, ToWorker } from '../engine/worker/protocol';
import { createEngineWorker } from './engineWorker';

export async function runBatch(job: BatchJob, settings: Partial<EngineSettings>): Promise<BatchResults> {
  if (typeof Worker !== 'undefined' && typeof window !== 'undefined' && import.meta.env?.MODE !== 'test') {
    let worker: Worker | null = null;
    try {
      worker = createEngineWorker();
    } catch {
      worker = null;
    }
    if (worker) {
      const w = worker;
      try {
        return await new Promise<BatchResults>((resolve, reject) => {
          w.onmessage = (ev: MessageEvent<FromWorker>) => {
            const m = ev.data;
            if (m.type !== 'batchResult') return;
            if (m.ok) resolve(m.results);
            else reject(new Error(m.error));
          };
          w.onerror = (e) => reject(new Error(e.message || 'Batch calculation failed.'));
          w.postMessage({ type: 'batch', job, settings } satisfies ToWorker);
        });
      } finally {
        w.terminate();
      }
    }
  }
  const { runBatchJob } = await import('../engine/batch');
  return runBatchJob(job, settings);
}
