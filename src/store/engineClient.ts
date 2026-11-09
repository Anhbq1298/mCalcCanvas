/**
 * The app's calculation engine behind one small interface. In the browser it
 * runs in a Web Worker, so heavy worksheets never freeze typing or scrolling;
 * results arrive asynchronously through subscribe(). Where workers are not
 * available (unit tests, very old browsers) the same interface runs in-process.
 */
import type { CalculationResult, EngineSettings, RegionInput } from '../engine';
import { createFallbackEngine } from './engineFallback';
import type { EngineOp, FromWorker, ToWorker } from '../engine/worker/protocol';
import { createEngineWorker } from './engineWorker';

type Listener = (ids: string[]) => void;

export interface EngineClient {
  batch(fn: () => void): void;
  setRegion(id: string, input: RegionInput): void;
  removeRegion(id: string): void;
  clear(): void;
  setSettings(settings: Partial<EngineSettings>): void;
  getResult(id: string): CalculationResult | undefined;
  subscribe(fn: Listener): () => void;
  /** See CalculationEngine.inputInUnit; rejects with the error message for a bad unit. */
  inputInUnit(id: string, unit: string): Promise<string | null>;
  /** Resolves once the engine has started (worker loaded; at most ~2 s). */
  ready(): Promise<void>;
  /** Resolves once every change sent so far has been calculated. */
  idle(): Promise<void>;
}

function inWorker(worker: Worker): EngineClient {
  const results = new Map<string, CalculationResult>();
  const listeners = new Set<Listener>();
  const pending = new Map<number, { resolve(v: string | null): void; reject(e: Error): void }>();
  let ops: EngineOp[] = [];
  let depth = 0;
  let req = 0;
  let calculating = 0;
  let idleWaiters: (() => void)[] = [];
  let markReady: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    markReady = resolve;
    // Never wait forever (a worker that fails to load reports nothing).
    setTimeout(resolve, 2000);
  });
  const flush = () => {
    if (depth > 0 || !ops.length) return;
    worker.postMessage({ type: 'ops', ops } satisfies ToWorker);
    ops = [];
    // The worker answers a ping after the batch before it has been calculated.
    calculating++;
    const r = ++req;
    pending.set(r, {
      resolve: () => {
        if (--calculating === 0) {
          idleWaiters.forEach((w) => w());
          idleWaiters = [];
        }
      },
      reject: () => {},
    });
    worker.postMessage({ type: 'ping', req: r } satisfies ToWorker);
  };
  const push = (o: EngineOp) => {
    ops.push(o);
    flush();
  };
  // A worker that fails (load error, crash) must not leave callers waiting forever.
  worker.onerror = (ev) => {
    console.error('Calculation worker failed', ev.message);
    markReady();
    calculating = 0;
    idleWaiters.forEach((w) => w());
    idleWaiters = [];
    for (const [, p] of pending) p.reject(new Error('The calculation worker stopped.'));
    pending.clear();
  };
  worker.onmessage = (ev: MessageEvent<FromWorker>) => {
    const m = ev.data;
    if (m.type === 'ready') {
      markReady();
    } else if (m.type === 'results') {
      const ids = Object.keys(m.results);
      for (const id of ids) {
        const r = m.results[id];
        if (r) results.set(id, r);
        else results.delete(id);
      }
      listeners.forEach((fn) => fn(ids));
    } else if (m.type === 'reply') {
      const p = pending.get(m.req);
      pending.delete(m.req);
      if (!p) return;
      if (m.ok) p.resolve(m.value ?? null);
      else p.reject(new Error(m.error));
    }
  };
  return {
    batch: (fn) => {
      depth++;
      try {
        fn();
      } finally {
        depth--;
        flush();
      }
    },
    setRegion: (id, input) => push({ op: 'set', id, input }),
    removeRegion: (id) => push({ op: 'remove', id }),
    clear: () => push({ op: 'clear' }),
    setSettings: (settings) => push({ op: 'settings', settings }),
    getResult: (id) => results.get(id),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    inputInUnit: (id, unit) =>
      new Promise((resolve, reject) => {
        const r = ++req;
        pending.set(r, { resolve, reject });
        worker.postMessage({ type: 'inputInUnit', req: r, id, unit } satisfies ToWorker);
      }),
    ready: () => started,
    idle: () => (calculating === 0 ? Promise.resolve() : new Promise((r) => idleWaiters.push(r))),
  };
}

export function createEngineClient(): EngineClient {
  if (typeof Worker === 'undefined' || typeof window === 'undefined' || import.meta.env?.MODE === 'test') return createFallbackEngine();
  try {
    return inWorker(createEngineWorker());
  } catch {
    return createFallbackEngine();
  }
}
