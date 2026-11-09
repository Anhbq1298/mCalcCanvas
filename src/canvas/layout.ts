/**
 * Layout service: line model, line insertion/removal with page flow, and
 * overlap resolution.
 *
 * Everything here is computed on a shapes record passed in and returns a
 * plan – the position changes to make – without touching the canvas store.
 * Callers apply a plan in one batched update (and one undo step), which
 * keeps layout deterministic and testable on its own.
 */
import { GRID_MAJOR } from './model/canvasStore';
import { shapeBounds } from './model/geometry';
import type { Shape } from './model/types';
import { baselineOf, constrained } from './pageConstraint';
import { printableBox } from '../export/pageGeometry';
import { useAppStore } from '../store/appStore';
export { optimizeTemplateLayout } from './templateLayout';

export interface LayoutPlan {
  /** New y for each moved shape. */
  patches: Record<string, { y: number }>;
  /** Pages the document needs after the change (content may flow onto new pages). */
  pagesNeeded: number;
}

const EMPTY: LayoutPlan = { patches: {}, pagesNeeded: 0 };

/** Overlap (px) tolerated between region boxes: their 4 px paddings may touch. */
const OVERLAP_TOLERANCE = 8;

// -- line model: major lines numbered continuously across pages ---------------

export function pageLines() {
  const orientation = useAppStore.getState().settings.pageOrientation;
  const p0 = printableBox(0, orientation);
  const p1 = printableBox(1, orientation);
  return { stride: p1.y - p0.y, top: p0.y, perPage: Math.floor(p0.h / GRID_MAJOR), orientation };
}

/** The y a shape is "written on": its first baseline (math/text) or, for drawings, a baseline under its top. */
export function anchorY(s: Shape): number {
  if (s.type === 'math' || s.type === 'text') return s.y + baselineOf(s);
  return shapeBounds(s).y + 22;
}

/** Index of the major line nearest to y, counted across pages (page mode) or from the origin (free canvas). */
export function globalLine(y: number): number {
  if (!constrained()) return Math.round(y / GRID_MAJOR);
  const { stride, top, perPage } = pageLines();
  const page = Math.max(0, Math.floor(y / stride));
  const l = Math.min(perPage, Math.max(1, Math.round((y - page * stride - top) / GRID_MAJOR)));
  return page * perPage + (l - 1);
}

/** y of a global line index (inverse of globalLine). */
export function lineY(g: number): number {
  if (!constrained()) return g * GRID_MAJOR;
  const { stride, top, perPage } = pageLines();
  const page = Math.floor(g / perPage);
  return page * stride + top + GRID_MAJOR * ((g % perPage) + 1);
}

/** True if anything is written on line g or reaches into its band. */
export function lineOccupied(shapes: Record<string, Shape>, g: number): boolean {
  const y = lineY(g);
  return Object.values(shapes).some((s) => {
    if (globalLine(anchorY(s)) === g) return true;
    const b = shapeBounds(s);
    return b.y < y + 10 && b.y + b.h > y - 30;
  });
}

/**
 * True if line g can be removed: nothing is written on it and nothing crosses
 * it (the descent of a region on the line above does not count).
 */
export function lineRemovable(shapes: Record<string, Shape>, g: number): boolean {
  const y = lineY(g);
  return !Object.values(shapes).some((s) => {
    if (globalLine(anchorY(s)) === g) return true;
    const b = shapeBounds(s);
    return b.y < y - 20 && b.y + b.h > y + 5;
  });
}

const byReadingOrder = (a: Shape, b: Shape) => anchorY(a) - anchorY(b) || a.x - b.x || (a.id < b.id ? -1 : 1);

/**
 * Move every shape written on line ≥ g by `delta` lines. Lines are handled
 * in order; a line whose blocks would not fit above the bottom margin of
 * their page moves to the first line of the next page, and every later line
 * moves with it, so the reading order is kept. `keep` stays where it is.
 */
export function planLineShift(shapes: Record<string, Shape>, g: number, delta: number, keep?: string): LayoutPlan {
  const groups = new Map<number, Shape[]>();
  for (const s of Object.values(shapes)) {
    if (s.id === keep) continue;
    const line = globalLine(anchorY(s));
    if (line < g) continue;
    if (!groups.has(line)) groups.set(line, []);
    groups.get(line)!.push(s);
  }
  if (!groups.size || delta === 0) return EMPTY;
  const { perPage, stride, orientation } = pageLines();
  const paged = constrained();
  const patches: LayoutPlan['patches'] = {};
  let extra = 0;
  let lowest = 0;
  for (const line of [...groups.keys()].sort((x, y) => x - y)) {
    const list = groups.get(line)!;
    let target = line + delta + extra;
    if (paged) {
      const fits = (t: number) => {
        const box = printableBox(Math.floor(t / perPage), orientation);
        const dy = lineY(t) - lineY(line);
        return list.every((s) => {
          const b = shapeBounds(s);
          return b.y + dy >= box.y - 0.5 && b.y + dy + b.h <= box.y + box.h + 0.5;
        });
      };
      if (!fits(target)) {
        // Continue at the top of the next page (moving down), or stay put (moving up).
        const bumped = delta > 0 ? (Math.floor(target / perPage) + 1) * perPage : line + extra;
        extra += bumped - target;
        target = bumped;
      }
    }
    const dy = lineY(target) - lineY(line);
    for (const s of list) {
      if (dy) patches[s.id] = { y: s.y + dy };
      const b = shapeBounds(s);
      lowest = Math.max(lowest, b.y + dy + b.h);
    }
  }
  return { patches, pagesNeeded: paged ? Math.floor(lowest / stride) + 1 : 0 };
}

/** Lines that `late` must move down to clear `early`, or 0 if they don't overlap. */
function overlapLines(early: Shape, late: Shape): number {
  const a = shapeBounds(early);
  const b = shapeBounds(late);
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ox <= OVERLAP_TOLERANCE || oy <= OVERLAP_TOLERANCE) return 0;
  return Math.max(0, Math.ceil((a.y + a.h - OVERLAP_TOLERANCE - b.y) / GRID_MAJOR));
}

const collides = (s: Shape, o: Shape) =>
  s.id !== o.id && (s.type === 'math' || s.type === 'text') && (o.type === 'math' || o.type === 'text') && (s.type === 'math' || o.type === 'math'); // text labels may overlap each other's boxes

/**
 * Overlap resolution (Mathcad "separate regions"). Starting from the given
 * regions, whenever an equation overlaps another equation or text region,
 * the later one in reading order – and everything after it – moves down by
 * whole lines. The cascade is simulated on a working copy until nothing
 * overlaps, and returned as a single plan. Shifts only ever move content
 * down, so the process terminates; a generous iteration bound guards against
 * pathological input.
 */
export function planSeparation(shapes: Record<string, Shape>, startIds: string[]): LayoutPlan {
  const work: Record<string, Shape> = { ...shapes };
  const queue = startIds.filter((id) => work[id]);
  const limit = Math.max(50, Object.keys(work).length * 8);
  let pagesNeeded = 0;
  for (let steps = 0; queue.length && steps < limit; steps++) {
    const id = queue.shift()!;
    const s = work[id];
    if (!s || (s.type !== 'math' && s.type !== 'text')) continue;
    let push: { line: number; lines: number; keep: string } | null = null;
    for (const o of Object.values(work)) {
      if (!collides(s, o)) continue;
      const [early, late] = byReadingOrder(s, o) <= 0 ? [s, o] : [o, s];
      const lines = overlapLines(early, late);
      if (!lines) continue;
      const line = globalLine(anchorY(late));
      if (!push || line < push.line) push = { line, lines, keep: early.id };
    }
    if (!push) continue;
    const plan = planLineShift(work, push.line, push.lines, push.keep);
    pagesNeeded = Math.max(pagesNeeded, plan.pagesNeeded);
    for (const [mid, p] of Object.entries(plan.patches)) {
      work[mid] = { ...work[mid], y: p.y } as Shape;
      queue.push(mid); // a moved region may now overlap the next one
    }
    queue.push(id); // re-check: it may overlap something else too
  }
  const patches: LayoutPlan['patches'] = {};
  for (const [id, s] of Object.entries(work)) if (shapes[id] && s.y !== shapes[id].y) patches[id] = { y: s.y };
  return { patches, pagesNeeded };
}
