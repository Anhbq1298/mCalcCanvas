import { setParagraphStyle } from './headings';
import { moveCrosshair } from './canvasActions';
import type { HeadingLevel } from './model/types';
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
import { GRID_MAJOR, GRID_SIZE, redo, select, selectAll, setTool, undo, useCanvasStore } from './model/canvasStore';

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
      if (mod && e.shiftKey && !e.altKey && key === 's') {
        e.preventDefault();
        void commands.saveToFile();
        return;
      }
      if (mod && e.shiftKey && !e.altKey && key === 'o') {
        e.preventDefault();
        void commands.importJson();
        return;
      }
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
      // Google Docs: Ctrl+Alt+1..3 heading, Ctrl+Alt+0 normal text (also while editing the text).
      if (mod && e.altKey && /^Digit[0-3]$/.test(e.code)) {
        const st = useCanvasStore.getState();
        const ids = st.editingId ? [st.editingId] : st.selection;
        if (ids.some((id) => st.shapes[id]?.type === 'text')) {
          e.preventDefault();
          setParagraphStyle(ids, Number(e.code.slice(5)) as HeadingLevel);
          return;
        }
      }
      if (mod && !e.altKey && e.key === 'Enter') {
        // Google Docs: Ctrl+Enter inserts a page break / blank page.
        e.preventDefault();
        commands.insertBlankPage();
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
      // Mathcad: with the + cross on the page (nothing selected), Enter moves it down one line and
      // the arrow keys move it (one major line up/down, one grid square sideways).
      if (st.crosshair && st.selection.length === 0 && !e.altKey && !(e.ctrlKey || e.metaKey)) {
        const move: Record<string, [number, number]> = {
          Enter: [0, GRID_MAJOR],
          ArrowDown: [0, GRID_MAJOR],
          ArrowUp: [0, -GRID_MAJOR],
          ArrowRight: [GRID_SIZE, 0],
          ArrowLeft: [-GRID_SIZE, 0],
        };
        const d = move[e.key];
        if (d) {
          e.preventDefault();
          moveCrosshair(d[0] * (e.shiftKey && e.key !== 'Enter' ? 4 : 1), d[1]);
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
        const stepY = onGrid ? (e.shiftKey ? 2 * GRID_MAJOR : GRID_MAJOR) : e.shiftKey ? 10 : 1;
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
