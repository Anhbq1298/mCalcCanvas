/**
 * One-way synchronisation: tldraw store (authoritative) → calculation engine.
 *
 * Math shape props are the only persisted calculation state; the engine is a
 * derived cache. Any store change (user edit, undo/redo, load, paste) flows
 * through here, so results can never drift from what is on the canvas.
 */
import type { Editor, TLRecord, TLShapeId } from 'tldraw';
import { engine } from '../store/calculationStore';
import { isMathShape } from './regionActions';
import type { MathShape } from './shapes/mathShapeTypes';

function inputFor(shape: MathShape, editingId: TLShapeId | null) {
  return {
    latex: shape.props.latex,
    displayUnit: shape.props.displayUnit.trim() || null,
    precision: shape.props.precision >= 0 ? shape.props.precision : null,
    draft: shape.id === editingId,
  };
}

export function resyncAll(editor: Editor): void {
  const editingId = editor.getEditingShapeId();
  const shapes = editor.store.allRecords().filter(isMathShape) as MathShape[];
  engine.batch(() => {
    engine.clear();
    for (const s of shapes) engine.setRegion(s.id, inputFor(s, editingId));
  });
}

export function connectEngine(editor: Editor): () => void {
  resyncAll(editor);
  let editingId = editor.getEditingShapeId();

  const unlisten = editor.store.listen(
    ({ changes }) => {
      const nowEditing = editor.getEditingShapeId();
      const touched: MathShape[] = [];
      const removed: string[] = [];
      for (const rec of Object.values(changes.added) as TLRecord[]) if (isMathShape(rec)) touched.push(rec);
      for (const [from, to] of Object.values(changes.updated) as [TLRecord, TLRecord][]) {
        if (isMathShape(to) && (from as MathShape).props !== to.props) touched.push(to);
      }
      for (const rec of Object.values(changes.removed) as TLRecord[]) if (isMathShape(rec)) removed.push(rec.id);

      let finishedEditing: TLShapeId | null = null;
      if (nowEditing !== editingId) {
        finishedEditing = editingId;
        editingId = nowEditing;
      }

      if (touched.length || removed.length || finishedEditing) {
        engine.batch(() => {
          for (const s of touched) engine.setRegion(s.id, inputFor(s, editingId));
          for (const id of removed) engine.removeRegion(id);
          if (finishedEditing) {
            const shape = editor.getShape(finishedEditing);
            if (isMathShape(shape)) engine.setRegion(shape.id, inputFor(shape, editingId));
          }
        });
      }

      // Like Mathcad, an empty region disappears when you leave it.
      if (finishedEditing) {
        const id = finishedEditing;
        queueMicrotask(() => {
          const shape = editor.getShape(id);
          if (isMathShape(shape) && shape.props.latex.trim() === '' && editor.getEditingShapeId() !== id) {
            editor.run(() => editor.deleteShape(id), { history: 'ignore' });
          }
        });
      }
    },
    { scope: 'all' },
  );

  return unlisten;
}
