/**
 * Worker pool of the section optimiser for mCompositeBeamDesign: each worker holds the worksheet and designs
 * one section at a time (designSection in model.ts), so several sections are designed in parallel.
 */
import type { ConstructionBracing, TaperProfile, Design, DesignCriteria, OptimizeResult } from './model';
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
export function warmOptimizer(state: { bracing?: ConstructionBracing; taper?: TaperProfile; values: Record<string, number>; tables: { id: string; rows: string[][] }[] }): void {
  for (const w of ensurePool()) w.postMessage({ kind: 'state', ...state } satisfies ToWorker);
}

let token = 0;

/**
 * Design engine: every section is designed by a worker (camber, fewest studs, smallest bar: designSection),
 * lightest first. The lightest passing section wins; heavier ones are not tried once one passes. Composite designs first; only when no
 * section works as composite are the sections tried as bare steel.
 */
export function optimizeDesign(
  label: string,
  secs: { id: number; name: string; mass: number; h: number }[], // lightest first
  spanM: number,
  criteria: DesignCriteria,
  state: { bracing?: ConstructionBracing; taper?: TaperProfile; values: Record<string, number>; tables: { id: string; rows: string[][] }[] },
  progress: (done: number, total: number, name: string) => void,
): Promise<OptimizeResult> {
  const workers = ensurePool();
  const run = ++token;
  const pass = (mode: 'composite' | 'bare', offset: number, total: number) => new Promise<{ i: number; d: Design; cost: number } | null>((resolve) => {
    for (const w of workers) w.postMessage({ kind: 'state', ...state } satisfies ToWorker); // each pass starts from the page's inputs
    let next = 0, running = 0, done = 0;
    let best: { i: number; d: Design; cost: number } | null = null;
    const feed = (w: Worker) => {
      // sections are sorted by mass: once the steel alone costs as much as the best design, the rest cannot win
      while (next < secs.length && best && secs[next].mass * spanM >= best.cost) next = secs.length;
      if (next >= secs.length) { if (!running) { workers.forEach((x) => (x.onmessage = null)); resolve(best); } return; }
      const i = next++;
      running++;
      w.postMessage({ kind: 'design', id: secs[i].id, mode, token: run * 100000 + i, criteria } satisfies ToWorker);
    };
    for (const w of workers) {
      w.onmessage = (ev: MessageEvent<{ kind: string; token: number; design: Design }>) => {
        const m = ev.data;
        if (m.kind !== 'designed' || Math.floor(m.token / 100000) !== run) return;
        const i = m.token % 100000;
        running--; done++;
        if (m.design.pass) {
          const cost = secs[i].mass * spanM; // lightest passing section wins
          if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) <= 1e-9 && i < best.i)) best = { i, d: m.design, cost };
        }
        progress(offset + done, total, secs[i].name);
        feed(w);
      };
      feed(w);
    }
  });
  return (async () => {
    const total = secs.length * 2;
    let b = await pass('composite', 0, total), tried = secs.length;
    if (!b) { b = await pass('bare', secs.length, total); tried = total; }
    const s = b ? secs[b.i] : null;
    return {
      family: label, maxDepth: null, targets: criteria, tried, total,
      best: b && s ? { id: s.id, name: s.name, mass: s.mass, h: s.h, sc: b.d.sc, scB: b.d.scB, bar: b.d.bar, sf: b.d.sf, nr: b.d.nr, eta: b.d.eta, studs: b.d.studs, camber: b.d.camber, layout: b.d.layout, composite: b.d.composite, strength: b.d.strength, deflection: b.d.deflection } : null,
    };
  })();
}
