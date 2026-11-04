/**
 * One-way synchronisation: canvas store (authoritative) → calculation engine.
 * Every change — typing, undo/redo, paste, load, move — flows through here,
 * so results can never drift from what is on the canvas.
 */
import { engine } from '../store/calculationStore';
import { useCanvasStore, type CanvasState } from './model/canvasStore';
import type { MathShape, Shape } from './model/types';

const isMath = (s: Shape | undefined): s is MathShape => s?.type === 'math';

/**
 * Reading-order key of each math region (Mathcad order): pages stack
 * vertically, so top-to-bottom, then left-to-right. The key depends only on
 * the region's own position, so moving one region re-ranks only that region.
 */
function readingOrder(shapes: Record<string, Shape>): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of Object.values(shapes)) if (isMath(s)) m.set(s.id, Math.round(s.y) * 100000 + Math.round(s.x) + 50000);
  return m;
}

function inputFor(s: MathShape, editingId: string | null, order: number | undefined) {
  return {
    latex: s.props.latex,
    displayUnit: s.props.displayUnit.trim() || null,
    precision: s.props.precision >= 0 ? s.props.precision : null,
    draft: s.id === editingId,
    order,
  };
}

let lastOrder = new Map<string, number>();

export function resyncAll(): void {
  const { shapes, editingId } = useCanvasStore.getState();
  lastOrder = readingOrder(shapes);
  engine.batch(() => {
    engine.clear();
    for (const s of Object.values(shapes)) if (isMath(s)) engine.setRegion(s.id, inputFor(s, editingId, lastOrder.get(s.id)));
  });
}

export function connectEngine(): () => void {
  resyncAll();
  return useCanvasStore.subscribe((next: CanvasState, prev: CanvasState) => {
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
          // Size-only changes (auto-size) don't matter; position matters for redefinitions.
          if (calcChanged || order.get(id) !== lastOrder.get(id)) engine.setRegion(id, inputFor(s, next.editingId, order.get(id)));
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
}
