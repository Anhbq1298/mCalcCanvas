/**
 * Formatting helpers for the text region being edited. The selection is
 * remembered so that controls which take focus (the colour picker) can
 * still apply to the text the user had selected.
 */
let savedRange: Range | null = null;
let savedRoot: HTMLElement | null = null;

if (typeof document !== 'undefined') {
  document.addEventListener('selectionchange', () => {
    // Only a text region being edited matters (cheap check; selection changes are frequent).
    if (!document.querySelector('.text-region--editing')) return;
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount) return;
    const node = sel.anchorNode;
    const el = (node instanceof Element ? node : node?.parentElement)?.closest('.text-region--editing') as HTMLElement | null;
    if (el) {
      savedRange = sel.getRangeAt(0).cloneRange();
      savedRoot = el;
    }
  });
}

/** Run a document.execCommand on the editing text region, restoring its selection first. */
export function formatEditingText(command: string, value?: string): boolean {
  const root = document.querySelector<HTMLElement>('.text-region--editing');
  if (!root) return false;
  if (savedRange && savedRoot === root && root.isConnected) {
    root.focus();
    const sel = document.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(savedRange);
  }
  document.execCommand('styleWithCSS', false, 'false');
  document.execCommand(command, false, value);
  root.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/** True when the editing text region has a non-empty selection. */
export function hasTextSelection(): boolean {
  const root = document.querySelector<HTMLElement>('.text-region--editing');
  return !!root && !!savedRange && savedRoot === root && !savedRange.collapsed;
}
