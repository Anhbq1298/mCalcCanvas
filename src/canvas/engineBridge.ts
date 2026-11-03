/**
 * One-way synchronisation: canvas store (authoritative) → calculation engine.
 * Every change — typing, undo/redo, paste, load — flows through here, so
 * results can never drift from what is on the canvas.
 */
import { engine } from '../store/calculationStore';
import { useCanvasStore, type CanvasState } from './model/canvasStore';
import type { MathShape, Shape } from './model/types';

function inputFor(s: MathShape, editingId: string | null) {
  return {
    latex: s.props.latex,
    displayUnit: s.props.displayUnit.trim() || null,
    precision: s.props.precision >= 0 ? s.props.precision : null,
    draft: s.id === editingId,
  };
}

const isMath = (s: Shape | undefined): s is MathShape => s?.type === 'math';

export function resyncAll(): void {
  const { shapes, editingId } = useCanvasStore.getState();
  engine.batch(() => {
    engine.clear();
    for (const s of Object.values(shapes)) if (isMath(s)) engine.setRegion(s.id, inputFor(s, editingId));
  });
}

export function connectEngine(): () => void {
  resyncAll();
  return useCanvasStore.subscribe((next: CanvasState, prev: CanvasState) => {
    if (next.shapes === prev.shapes && next.editingId === prev.editingId) return;
    engine.batch(() => {
      if (next.shapes !== prev.shapes) {
        for (const [id, s] of Object.entries(next.shapes)) {
          const old = prev.shapes[id];
          if (isMath(s) && (!old || (old as MathShape).props !== s.props)) {
            const o = old as MathShape | undefined;
            // Size-only changes (auto-size) don't affect the calculation.
            if (o && o.props.latex === s.props.latex && o.props.displayUnit === s.props.displayUnit && o.props.precision === s.props.precision) continue;
            engine.setRegion(id, inputFor(s, next.editingId));
          }
        }
        for (const id of Object.keys(prev.shapes)) if (!next.shapes[id] && isMath(prev.shapes[id])) engine.removeRegion(id);
      }
      if (next.editingId !== prev.editingId) {
        for (const id of [prev.editingId, next.editingId]) {
          const s = id ? next.shapes[id] : undefined;
          if (isMath(s)) engine.setRegion(s.id, inputFor(s, next.editingId));
        }
      }
    });
  });
}
