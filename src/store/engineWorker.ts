/** The calculation worker as a separate file (normal build). The single-file build aliases this module to engineWorkerInline.ts. */
export const createEngineWorker = (): Worker => new Worker(new URL('../engine/worker/engine.worker.ts', import.meta.url), { type: 'module' });
