import { useEffect } from 'react';
import { commands } from '../app/commands';
import { queueKey } from '../math/activeEditor';
import {
  beginEditSelected,
  copySelection,
  createMathRegion,
  createTextRegion,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  handlePasteData,
  insertionPoint,
  nudgeSelection,
  ungroupSelection,
} from './canvasActions';
import { redo, select, selectAll, setTool, undo, useCanvasStore } from './model/canvasStore';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('math-field')) return true;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Characters that start a math region when typed with nothing selected. */
const STARTS_MATH = /^[A-Za-z0-9.(\-+]$/;

/**
 * Global shortcuts. Input inside MathLive, text regions and form fields is
 * never intercepted (except Ctrl+S / Ctrl+O).
 */
export function useCanvasKeyboard(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && !e.altKey && key === 's') {
        e.preventDefault();
        void commands.save();
        return;
      }
      if (mod && !e.altKey && key === 'o') {
        e.preventDefault();
        commands.open();
        return;
      }
      if (mod && !e.altKey && key === 'p') {
        e.preventDefault();
        void commands.exportPdf();
        return;
      }
      if (e.key === 'F9') {
        e.preventDefault();
        commands.calculateAll();
        return;
      }
      if (isTypingTarget(e.target)) return;
      // A math region is being created but its editor hasn't taken focus yet:
      // hand the keystroke to it instead of dropping it.
      {
        const st0 = useCanvasStore.getState();
        if (st0.editingId && st0.shapes[st0.editingId]?.type === 'math' && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          queueKey(e.key);
          return;
        }
      }
      // Don't steal keys from open menus or dialogs.
      if ((e.target as HTMLElement)?.closest?.('[role=menu], dialog')) return;

      const st = useCanvasStore.getState();
      if (mod) {
        const handlers: Record<string, () => void> = {
          z: () => (e.shiftKey ? redo() : undo()),
          y: redo,
          c: () => void copySelection(),
          x: () => void cutSelection(),
          d: duplicateSelection,
          a: selectAll,
          g: () => (e.shiftKey ? ungroupSelection() : groupSelection()),
        };
        const h = handlers[key];
        if (h) {
          e.preventDefault();
          h();
        }
        return; // Ctrl+V is handled by the paste event.
      }
      if (e.altKey) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (st.selection.length) {
          e.preventDefault();
          deleteSelection();
        }
        return;
      }
      if (e.key === 'Escape') {
        if (st.tool !== 'select') setTool('select');
        else select([]);
        return;
      }
      if (e.key === 'Enter' && beginEditSelected()) {
        e.preventDefault();
        return;
      }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[e.key] && st.selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        nudgeSelection(arrows[e.key][0] * step, arrows[e.key][1] * step);
        return;
      }
      // Mathcad: a double quote on empty space starts a text region.
      if (e.key === '"' && !st.editingId && st.selection.length === 0 && st.tool === 'select') {
        e.preventDefault();
        createTextRegion(insertionPoint());
        return;
      }
      // Mathcad behaviour: just start typing to create a math region.
      if (STARTS_MATH.test(e.key) && !e.isComposing && !st.editingId && st.selection.length === 0 && (st.tool === 'select' || st.tool === 'math')) {
        e.preventDefault();
        createMathRegion(insertionPoint(), e.key);
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target) || useCanvasStore.getState().editingId) return;
      if (handlePasteData(e.clipboardData)) e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPaste);
    };
  }, []);
}
