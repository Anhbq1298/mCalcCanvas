import { createShapeId, type Editor, type TLShapeId, type VecLike } from 'tldraw';
import { MATH_SHAPE_TYPE, type MathShape } from './shapes/mathShapeTypes';

export function isMathShape(shape: unknown): shape is MathShape {
  return !!shape && typeof shape === 'object' && (shape as { type?: string }).type === MATH_SHAPE_TYPE;
}

/** Enter MathLive editing for a region (same state transition tldraw uses for text). */
export function startEditingMath(editor: Editor, id: TLShapeId): void {
  const shape = editor.getShape(id);
  if (!shape) return;
  editor.select(id);
  editor.setEditingShape(shape);
  editor.setCurrentTool('select.editing_shape', { target: 'shape', shape });
}

/** Create a math region at a page point and start editing it. */
export function createMathRegion(editor: Editor, point: VecLike, latex = ''): TLShapeId {
  const id = createShapeId();
  let { x, y } = point;
  if (editor.getInstanceState().isGridMode) {
    const g = editor.getDocumentSettings().gridSize;
    x = Math.round(x / g) * g;
    y = Math.round(y / g) * g;
  }
  editor.markHistoryStoppingPoint('create math region');
  editor.createShape({ id, type: MATH_SHAPE_TYPE, x, y, props: { latex } });
  startEditingMath(editor, id);
  return id;
}

/** A sensible insertion point: last pointer position if visible, else viewport centre. */
export function insertionPoint(editor: Editor): VecLike {
  const p = editor.inputs.getCurrentPagePoint();
  const viewport = editor.getViewportPageBounds();
  if (viewport.containsPoint(p)) return { x: p.x, y: p.y - 14 };
  return { x: viewport.center.x - 40, y: viewport.center.y - 14 };
}
