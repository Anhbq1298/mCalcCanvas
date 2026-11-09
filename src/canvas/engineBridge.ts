/**
 * One-way synchronisation: canvas store (authoritative) → calculation engine.
 * Every change — typing, undo/redo, paste, load, move — flows through here,
 * so results can never drift from what is on the canvas.
 *
 * A math shape is one engine region. A graph is several hidden regions, one
 * per series field (x, y, r, show), keyed at the graph's own reading
 * position, so a graph sees exactly the variables defined above it.
 */
import { engine } from '../store/calculationStore';
import { useAppStore } from '../store/appStore';
import { PAGE_GAP, pageSize } from '../export/pageGeometry';
import { orderKeysEqual, type OrderKey } from '../engine/light';
import type { RegionInput } from '../engine';
import { placeShapes, useCanvasStore, type CanvasState } from './model/canvasStore';
import type { GraphShape, Shape } from './model/types';
import { graphRegionId, isDefinitionLatex, type GraphField } from './graphData';
import { annexInfo } from './annex';

export { graphRegionId, isDefinitionLatex, type GraphField } from './graphData';

/**
 * Reading-order key of a region (Mathcad order), compared
 * lexicographically by the engine: page, then top to bottom, then left to
 * right, then the region id so equal positions still have a fixed order.
 * Coordinates are used exactly (no rounding or numeric packing), so large
 * and negative positions order correctly. A key depends only on the
 * region's own position, so moving one region re-keys only that region.
 */
export function readingKey(s: Shape): OrderKey {
  const { canvasMode, pageOrientation } = useAppStore.getState().settings;
  const page = canvasMode === 'page' ? Math.max(0, Math.floor(s.y / (pageSize(pageOrientation).h + PAGE_GAP))) : 0;
  return [page, s.y, s.x, s.id];
}

type Regions = Map<string, RegionInput>;

/**
 * Calculation key of a shape: its reading key, or – inside an annex block
 * placed by a link – the link's reading key followed by its own, so the block
 * is calculated where the link stands.
 */
export function calcKey(s: Shape, shapes: Record<string, Shape>): OrderKey {
  const link = annexInfo(shapes).anchorOf.get(s.id);
  const anchor = link ? shapes[link] : undefined;
  return anchor ? [...readingKey(anchor), ...readingKey(s)] : readingKey(s);
}

/** Changes whenever any annex placement changes (then every key is recomputed). */
function annexSignature(shapes: Record<string, Shape>): string {
  const info = annexInfo(shapes);
  let sig = '';
  for (const b of info.blocks) {
    if (!b.link) continue;
    sig += `${b.link}@${readingKey(shapes[b.link]).join(',')}:${b.heading},${b.members.join(',')};`;
  }
  return sig;
}

/** The engine regions a shape contributes (none for text, images, drawings). */
function regionsOf(s: Shape, editingId: string | null, shapes: Record<string, Shape>): Regions {
  const out: Regions = new Map();
  if (s.type === 'math') {
    out.set(s.id, {
      latex: s.props.latex,
      displayUnit: s.props.displayUnit.trim() || null,
      precision: s.props.precision >= 0 ? s.props.precision : null,
      ...(s.props.vectorLayout === 'column' ? { vectorLayout: 'column' as const } : {}),
      ...(s.props.vectorExpanded ? { vectorExpanded: true } : {}),
      draft: s.id === editingId,
      order: calcKey(s, shapes),
    });
  } else if (s.type === 'graph') {
    graphRegions(s, out, calcKey(s, shapes));
  }
  return out;
}

function graphRegions(s: GraphShape, out: Regions, key: OrderKey): void {
  const { xUnit, yUnit } = s.props;
  s.props.series.forEach((series, i) => {
    const fields: [GraphField, string, string][] = [
      ['x', series.x, xUnit],
      ['y', series.y, yUnit],
      series.style === 'segments' ? ['r', series.r, ''] : ['r', series.style === 'circle' ? series.r : '', xUnit],
      ['show', series.show, ''],
    ];
    for (const [field, latex, unit] of fields) {
      if (!latex.trim() || isDefinitionLatex(latex)) continue;
      out.set(graphRegionId(s.id, series.id, field), {
        latex,
        displayUnit: unit.trim() || null,
        // Full precision: graphs plot the numbers, not their display text.
        precision: 8,
        order: [...key, i, field],
      });
    }
  });
}

function sameInput(a: RegionInput | undefined, b: RegionInput): boolean {
  return (
    !!a &&
    a.latex === b.latex &&
    a.displayUnit === b.displayUnit &&
    a.precision === b.precision &&
    (a.vectorLayout ?? 'row') === (b.vectorLayout ?? 'row') &&
    !!a.vectorExpanded === !!b.vectorExpanded &&
    !!a.draft === !!b.draft &&
    orderKeysEqual(a.order as OrderKey, b.order as OrderKey)
  );
}

/** Regions currently registered with the engine, per shape. */
let registered = new Map<string, Regions>();

function allRegions(shapes: Record<string, Shape>, editingId: string | null): Map<string, Regions> {
  const m = new Map<string, Regions>();
  for (const s of Object.values(shapes)) {
    const r = regionsOf(s, editingId, shapes);
    if (r.size) m.set(s.id, r);
  }
  return m;
}

let registeredAnnex = '';

/** Every engine region of a worksheet (math and graph series), as the canvas registers them. */
export function worksheetRegions(shapes: Record<string, Shape>): { id: string; input: RegionInput }[] {
  const out: { id: string; input: RegionInput }[] = [];
  for (const regions of allRegions(shapes, null).values()) for (const [id, input] of regions) out.push({ id, input });
  return out;
}

/**
 * Registers every region with the engine. Regions whose input is unchanged keep
 * their results (a document load must not clear and recalculate a sheet that is
 * already calculated); `force` (Calculate all) clears the engine first.
 */
export function resyncAll(opts: { force?: boolean } = {}): void {
  const { shapes, editingId } = useCanvasStore.getState();
  const old = registered;
  registered = allRegions(shapes, editingId);
  registeredAnnex = annexSignature(shapes);
  engine.batch(() => {
    if (opts.force) engine.clear();
    else for (const [shapeId, regions] of old) for (const id of regions.keys()) if (!registered.get(shapeId)?.has(id)) engine.removeRegion(id);
    for (const regions of registered.values()) for (const [id, input] of regions) engine.setRegion(id, input);
  });
}

/**
 * Sends a worksheet's regions to the engine before its shapes are put on the
 * canvas, so the worker calculates while the UI thread renders. A message
 * posted from the UI thread reaches the worker only when the posting task ends,
 * so callers yield (setTimeout) before the render. Returns the shapes placed
 * on the grid (pass these to loadShapes: the regions then match and nothing
 * is sent again).
 */
export function primeEngine(list: Shape[]): Shape[] {
  const placed = placeShapes(list);
  const rec = Object.fromEntries(placed.map((s) => [s.id, s]));
  registeredAnnex = annexSignature(rec);
  applyDiff(allRegions(rec, null));
  return placed;
}

/** Sends only the regions that changed since the last sync. */
function applyDiff(next: Map<string, Regions>): void {
  engine.batch(() => {
    for (const [shapeId, regions] of next) {
      const old = registered.get(shapeId);
      if (old === regions) continue;
      for (const [id, input] of regions) if (!sameInput(old?.get(id), input)) engine.setRegion(id, input);
      if (old) for (const id of old.keys()) if (!regions.has(id)) engine.removeRegion(id);
    }
    for (const [shapeId, old] of registered) if (!next.has(shapeId)) for (const id of old.keys()) engine.removeRegion(id);
  });
  registered = next;
}

/** Recomputes regions only for shapes that changed (object identity), reusing the rest. */
function regionsAfterChange(next: CanvasState, prev: CanvasState, rekeyAll: boolean): Map<string, Regions> {
  const m = new Map<string, Regions>();
  const sig = annexSignature(next.shapes);
  if (sig !== registeredAnnex) rekeyAll = true;
  registeredAnnex = sig;
  const editingChanged = next.editingId !== prev.editingId;
  for (const [id, s] of Object.entries(next.shapes)) {
    const reuse =
      !rekeyAll &&
      prev.shapes[id] === s &&
      !(editingChanged && (id === next.editingId || id === prev.editingId)) &&
      registered.has(id);
    if (reuse) {
      m.set(id, registered.get(id)!);
      continue;
    }
    const r = regionsOf(s, next.editingId, next.shapes);
    if (r.size) m.set(id, r);
  }
  return m;
}

export function connectEngine(): () => void {
  resyncAll();
  const offCanvas = useCanvasStore.subscribe((next: CanvasState, prev: CanvasState) => {
    if (next.shapes === prev.shapes && next.editingId === prev.editingId) return;
    applyDiff(regionsAfterChange(next, prev, false));
  });
  const offApp = useAppStore.subscribe((next, prev) => {
    if (next.settings.canvasMode !== prev.settings.canvasMode || next.settings.pageOrientation !== prev.settings.pageOrientation) {
      // Page size or layout mode changed: every reading key may change.
      const st = useCanvasStore.getState();
      applyDiff(regionsAfterChange(st, st, true));
    }
  });
  return () => {
    offCanvas();
    offApp();
  };
}
