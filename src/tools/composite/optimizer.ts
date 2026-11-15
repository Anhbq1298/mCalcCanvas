/**
 * Parallel section optimiser for mCompositeBeamDesign. Every candidate needs a full worksheet recalculation
 * (about 0.2 s), so candidates are checked by a pool of workers, one per spare CPU core. Sections are handed
 * out lightest first; when one passes, only the lighter ones still running are awaited, and the lightest
 * passing section wins — the same answer as checking them one by one (CompositeModel.optimizeSection).
 */
import type { SteelSection } from '../../engineering/steel/sections';
import type { OptimizeResult } from './model';
import type { ToWorker } from './worker';

let pool: Worker[] = [];

function poolSize(): number {
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  return Math.max(2, Math.min(4, cores - 1)); // each worker holds two worksheet models: keep memory bounded
}

function ensurePool(): Worker[] {
  if (!pool.length) pool = Array.from({ length: poolSize() }, () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }));
  return pool;
}

/** Start the pool in the background (models built while the user is still entering data). */
export function warmOptimizer(state: { values: Record<string, number>; tables: { id: string; rows: string[][] }[] }): void {
  for (const w of ensurePool()) w.postMessage({ kind: 'state', ...state } satisfies ToWorker);
}

let token = 0;

export function optimizeParallel(
  family: string,
  candidates: SteelSection[],
  maxDepth: number | null,
  state: { values: Record<string, number>; tables: { id: string; rows: string[][] }[] },
  progress: (done: number, total: number, name: string) => void,
): Promise<OptimizeResult> {
  const workers = ensurePool();
  const run = ++token;
  const total = candidates.length;
  const ur = new Map<number, { ur: number; label: string }>(); // candidate index → governing check
  let next = 0, done = 0, bestIdx = Infinity;
  return new Promise((resolve) => {
    const finish = () => {
      workers.forEach((w) => (w.onmessage = null));
      const b = Number.isFinite(bestIdx) ? candidates[bestIdx] : null;
      const tried = Number.isFinite(bestIdx) ? bestIdx + 1 : total; // lightest-first count, as in the serial search
      resolve({ family, maxDepth, tried, total, best: b ? { id: b.id, name: b.name, mass: b.values.mass, ur: ur.get(bestIdx)!.ur, label: ur.get(bestIdx)!.label } : null });
    };
    // all lighter candidates are back: the answer cannot change any more
    const settled = () => (Number.isFinite(bestIdx) ? [...Array(bestIdx).keys()].every((i) => ur.has(i)) : done === total);
    const feed = (w: Worker) => {
      if (next >= total || next > bestIdx) return false;
      const i = next++;
      w.postMessage({ kind: 'evaluate', id: candidates[i].id, token: run * 100000 + i } satisfies ToWorker);
      return true;
    };
    if (!total) return finish();
    let busy = 0;
    for (const w of workers) {
      w.postMessage({ kind: 'state', ...state } satisfies ToWorker);
      w.onmessage = (ev) => {
        const m = ev.data;
        if (m.kind !== 'evaluated' || Math.floor(m.token / 100000) !== run) return;
        const i = m.token % 100000;
        busy--; done++;
        ur.set(i, { ur: m.ur, label: m.label });
        if (m.ur <= 1 && i < bestIdx) bestIdx = i;
        progress(done, total, candidates[i].name);
        if (settled()) return finish();
        if (feed(w)) busy++;
        else if (!busy) finish();
      };
      if (feed(w)) busy++;
    }
  });
}
