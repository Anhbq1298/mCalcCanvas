/** Single-file build: the worker is inlined (no separate file to load offline). */
import EngineWorker from '../engine/worker/engine.worker.ts?worker&inline';

export const createEngineWorker = (): Worker => new EngineWorker();
