import { useEffect } from 'react';
import type { Editor } from 'tldraw';
import { commands } from '../../app/commands';
import { createMathRegion, insertionPoint } from '../regionActions';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('math-field')) return true;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Characters that may start a math region when typed on an empty canvas. */
const STARTS_MATH = /^[A-Za-z0-9.(\-+]$/;

/**
 * App-level shortcuts, registered in the capture phase so they run before
 * tldraw's own handlers:
 *  - Ctrl/Cmd+S save, Ctrl+Y redo
 *  - typing on the canvas with nothing selected creates a math region at
 *    the pointer (Mathcad behaviour) instead of switching tools.
 * Input inside MathLive, text shapes or form fields is never intercepted.
 */
export function useCanvasKeyboard(editor: Editor | null): void {
  useEffect(() => {
    if (!editor) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void commands.save();
        return;
      }
      if (mod && !e.altKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        commands.open();
        return;
      }
      if (e.key === 'F9') {
        e.preventDefault();
        commands.calculateAll();
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        e.stopPropagation();
        editor.redo();
        return;
      }
      if (mod || e.altKey || e.isComposing) return;
      if (!STARTS_MATH.test(e.key)) return;
      if (editor.getEditingShapeId()) return;
      if (editor.getCurrentToolId() !== 'select' && editor.getCurrentToolId() !== 'math') return;
      if (editor.getSelectedShapeIds().length > 0) return;
      // Only when the canvas (not a toolbar/menu) has focus.
      const container = editor.getContainer();
      if (!(e.target instanceof Node) || (!container.contains(e.target) && e.target !== document.body)) return;

      e.preventDefault();
      e.stopPropagation();
      createMathRegion(editor, insertionPoint(editor), e.key);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [editor]);
}
