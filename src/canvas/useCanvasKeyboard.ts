import { baselineStep } from './pageConstraint';
import { deleteLineAboveCrosshair, deleteLineAtCrosshair, insertLineAtCrosshair, moveCrosshair } from './canvasActions';
import { useEffect } from 'react';
import { runShortcut } from '../app/shortcuts';
import { SHORTCUT_ACTIONS } from '../app/shortcutActions';
import { queueKey } from '../math/activeEditor';
import {
  beginEditSelected,
  createMathRegion,
  createTextRegion,
  deleteSelection,
  handlePasteData,
  insertionPoint,
  nudgeSelection,
} from './canvasActions';
import { GRID_MAJOR, GRID_SIZE, select, setTool, useCanvasStore } from './model/canvasStore';

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
      // Global shortcuts (also while typing in an editor): see app/shortcuts.ts.
      if (runShortcut(e, 'global', SHORTCUT_ACTIONS)) return;
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
        runShortcut(e, 'worksheet', SHORTCUT_ACTIONS);
        return; // Ctrl+V is handled by the paste event.
      }
      if (e.altKey) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (st.selection.length) {
          e.preventDefault();
          deleteSelection();
        } else if (e.key === 'Backspace' && st.crosshair) {
          // Remove the blank line above the + cross (undoes an Enter).
          e.preventDefault();
          deleteLineAboveCrosshair();
        } else if (e.key === 'Delete' && st.crosshair) {
          // Remove the blank line the + cross is on: what is below moves up.
          e.preventDefault();
          deleteLineAtCrosshair();
        }
        return;
      }
      if (e.key === 'Escape') {
        if (st.tool !== 'select') setTool('select');
        else select([]);
        return;
      }
      // Mathcad: with the + cross on the page (nothing selected), Enter moves it down one line and
      // the arrow keys move it (one major line up/down, one grid square sideways).
      if (st.crosshair && st.selection.length === 0 && !e.altKey && !(e.ctrlKey || e.metaKey)) {
        if (e.key === 'Enter') {
          // Like a document: Enter inserts a line and pushes the blocks below down.
          e.preventDefault();
          insertLineAtCrosshair();
          return;
        }
        const move: Record<string, [number, number]> = {
          ArrowDown: [0, baselineStep()],
          ArrowUp: [0, -baselineStep()],
          ArrowRight: [GRID_SIZE, 0],
          ArrowLeft: [-GRID_SIZE, 0],
        };
        const d = move[e.key];
        if (d) {
          e.preventDefault();
          moveCrosshair(d[0] * (e.shiftKey ? 4 : 1), d[1]);
          return;
        }
      }
      if (e.key === 'Enter' && beginEditSelected()) {
        e.preventDefault();
        return;
      }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[e.key] && st.selection.length) {
        e.preventDefault();
        // Math/text regions move one grid square sideways and one major line up/down (baselines sit on major lines).
        const onGrid = st.selection.some((id) => st.shapes[id]?.type === 'math' || st.shapes[id]?.type === 'text');
        const stepX = onGrid ? (e.shiftKey ? GRID_MAJOR : GRID_SIZE) : e.shiftKey ? 10 : 1;
        const line = baselineStep();
        const stepY = onGrid ? (e.shiftKey ? GRID_MAJOR : line) : e.shiftKey ? 10 : 1;
        nudgeSelection(arrows[e.key][0] * stepX, arrows[e.key][1] * stepY);
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
