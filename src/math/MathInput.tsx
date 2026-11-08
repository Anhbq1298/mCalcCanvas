import { useEffect, useLayoutEffect, useRef } from 'react';
import { handleMathcadKey } from './mathcadKeys';
import { configureMathfield, MathfieldElement } from './mathliveSetup';

/**
 * A one-line MathLive field for a LaTeX value in a panel (graph series x, y …).
 * It commits on blur or Enter, so typing does not create one undo step per key.
 * Keyboard events stay inside the field (canvas shortcuts never fire).
 */
export function MathInput({ value, onCommit, label, testId, placeholder }: { value: string; onCommit(latex: string): void; label: string; testId?: string; placeholder?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mfRef = useRef<MathfieldElement | null>(null);
  const commitRef = useRef(onCommit);
  useLayoutEffect(() => {
    commitRef.current = onCommit;
  });
  const valueRef = useRef(value);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const mf = new MathfieldElement();
    mf.setAttribute('aria-label', label);
    if (testId) mf.setAttribute('data-testid', testId);
    if (placeholder) mf.setAttribute('placeholder', placeholder);
    host.appendChild(mf);
    configureMathfield(mf);
    mf.mathVirtualKeyboardPolicy = 'manual';
    mf.style.width = '100%';
    mf.value = valueRef.current;
    mfRef.current = mf;
    const commit = () => {
      if (mf.value !== valueRef.current) {
        valueRef.current = mf.value;
        commitRef.current(mf.value);
      }
    };
    // Capture phase (before MathLive): Mathcad keys, and Enter/Escape commit.
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        commit();
        mf.blur();
        return;
      }
      if (handleMathcadKey(e, mf, () => {})) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // Bubble phase: keep keys away from canvas shortcuts.
    const stop = (e: Event) => e.stopPropagation();
    const stopped = ['keydown', 'keyup', 'keypress', 'copy', 'cut', 'paste', 'pointerdown'];
    mf.addEventListener('keydown', onKeyDownCapture, { capture: true });
    for (const t of stopped) mf.addEventListener(t, stop);
    mf.addEventListener('blur', commit);
    // A click must focus the field even when page-level pointer handlers keep focus elsewhere.
    const focusOnClick = () => requestAnimationFrame(() => document.activeElement !== mf && mf.focus());
    mf.addEventListener('pointerup', focusOnClick);
    return () => {
      mf.removeEventListener('pointerup', focusOnClick);
      mf.removeEventListener('keydown', onKeyDownCapture, { capture: true });
      for (const t of stopped) mf.removeEventListener(t, stop);
      mf.removeEventListener('blur', commit);
      mf.remove();
      mfRef.current = null;
    };
  }, [label, testId, placeholder]);

  // External changes (undo, another panel) update the field when it is not being edited.
  useEffect(() => {
    valueRef.current = value;
    const mf = mfRef.current;
    if (mf && mf.value !== value && document.activeElement !== mf) mf.value = value;
  }, [value]);

  return <div ref={hostRef} className="cc-math-input min-h-[30px] rounded border border-border bg-white px-1 text-[15px]" />;
}
