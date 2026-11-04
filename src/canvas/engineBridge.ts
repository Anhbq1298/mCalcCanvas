/**
 * One-way synchronisation: canvas store (authoritative) → calculation engine.
 * Every change — typing, undo/redo, paste, load, move — flows through here,
 * so results can never drift from what is on the canvas.
 */
import { engine } from '../store/calculationStore';
import { useAppStore } from '../store/appStore';
import { PAGE_GAP, pageSize } from '../export/pageGeometry';
import { orderKeysEqual, type OrderKey } from '../engine';
import { useCanvasStore, type CanvasState } from './model/canvasStore';
import type { MathShape, Shape } from './model/types';

const isMath = (s: Shape | undefined): s is MathShape => s?.type === 'math';

/**
 * Reading-order key of a math region (Mathcad order), compared
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

function readingOrder(shapes: Record<string, Shape>): Map<string, OrderKey> {
  const m = new Map<string, OrderKey>();
  for (const s of Object.values(shapes)) if (isMath(s)) m.set(s.id, readingKey(s));
  return m;
}

function inputFor(s: MathShape, editingId: string | null, order: OrderKey | undefined) {
  return {
    latex: s.props.latex,
    displayUnit: s.props.displayUnit.trim() || null,
    precision: s.props.precision >= 0 ? s.props.precision : null,
    draft: s.id === editingId,
    order,
  };
}

let lastOrder = new Map<string, OrderKey>();

export function resyncAll(): void {
  const { shapes, editingId } = useCanvasStore.getState();
  lastOrder = readingOrder(shapes);
  engine.batch(() => {
    engine.clear();
    for (const s of Object.values(shapes)) if (isMath(s)) engine.setRegion(s.id, inputFor(s, editingId, lastOrder.get(s.id)));
  });
}

/** Re-key every region (page size or layout mode changed). Only regions whose key changed are touched. */
function syncOrder(): void {
  const { shapes, editingId } = useCanvasStore.getState();
  const order = readingOrder(shapes);
  engine.batch(() => {
    for (const [id, key] of order) {
      if (!orderKeysEqual(key, lastOrder.get(id))) engine.setRegion(id, inputFor(shapes[id] as MathShape, editingId, key));
    }
  });
  lastOrder = order;
}

export function connectEngine(): () => void {
  resyncAll();
  const offCanvas = useCanvasStore.subscribe((next: CanvasState, prev: CanvasState) => {
    if (next.shapes === prev.shapes && next.editingId === prev.editingId) return;
    const order = next.shapes === prev.shapes ? lastOrder : readingOrder(next.shapes);
    engine.batch(() => {
      if (next.shapes !== prev.shapes) {
        for (const [id, s] of Object.entries(next.shapes)) {
          if (!isMath(s)) continue;
          const old = prev.shapes[id] as MathShape | undefined;
          const calcChanged =
            !old ||
            old.props.latex !== s.props.latex ||
            old.props.displayUnit !== s.props.displayUnit ||
            old.props.precision !== s.props.precision;
          // Size-only changes (auto-size) don't matter; position matters for reading order.
          if (calcChanged || !orderKeysEqual(order.get(id), lastOrder.get(id))) {
            engine.setRegion(id, inputFor(s, next.editingId, order.get(id)));
          }
        }
        for (const id of Object.keys(prev.shapes)) if (!next.shapes[id] && isMath(prev.shapes[id])) engine.removeRegion(id);
      }
      if (next.editingId !== prev.editingId) {
        for (const id of [prev.editingId, next.editingId]) {
          const s = id ? next.shapes[id] : undefined;
          if (isMath(s)) engine.setRegion(s.id, inputFor(s, next.editingId, order.get(s.id)));
        }
      }
    });
    lastOrder = order;
  });
  const offApp = useAppStore.subscribe((next, prev) => {
    if (next.settings.canvasMode !== prev.settings.canvasMode || next.settings.pageOrientation !== prev.settings.pageOrientation) syncOrder();
  });
  return () => {
    offCanvas();
    offApp();
  };
}
