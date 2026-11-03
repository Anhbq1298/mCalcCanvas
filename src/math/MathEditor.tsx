import { useEffect, useLayoutEffect, useRef } from 'react';
import { configureMathfield, MathfieldElement } from './mathliveSetup';

interface MathEditorProps {
  latex: string;
  onChange(latex: string): void;
  /** Enter / Escape: finish editing. */
  onExit(): void;
  /** Report the rendered size so the region can grow while typing. */
  ariaLabel?: string;
}

/**
 * MathLive editor mounted imperatively so React never re-creates the
 * element (which would lose caret position) while the user types.
 *
 * Keyboard and pointer events are stopped at the mathfield boundary so
 * canvas shortcuts (tool letters, Delete, Ctrl+D…) never steal input.
 */
export function MathEditor({ latex, onChange, onExit, ariaLabel }: MathEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChange, onExit });
  useLayoutEffect(() => {
    callbacks.current = { onChange, onExit };
  });
  const initialLatex = useRef(latex);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const mf = new MathfieldElement();
    mf.setAttribute('aria-label', ariaLabel ?? 'Math input');
    mf.setAttribute('data-testid', 'math-input');
    host.appendChild(mf);
    configureMathfield(mf);
    mf.value = initialLatex.current;

    const onInput = () => callbacks.current.onChange(mf.value);
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        callbacks.current.onChange(mf.value);
        callbacks.current.onExit();
        return;
      }
      e.stopPropagation();
    };
    const stop = (e: Event) => e.stopPropagation();

    // Mathcad behaviour: "=" always evaluates the whole region. If the caret
    // is still inside a fraction/exponent (e.g. after typing a denominator),
    // jump to the end instead of writing "=" into the sub-expression.
    // Runs in the capture phase, i.e. before MathLive handles the key.
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key !== '=' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (mf.position === mf.lastOffset) return;
      const before = mf.getValue(0, mf.position, 'latex');
      if (before.endsWith(':')) return; // typing ":=" mid-expression
      e.preventDefault();
      e.stopPropagation();
      mf.executeCommand('moveToMathfieldEnd');
      mf.executeCommand(['insert', '=']);
      callbacks.current.onChange(mf.value);
    };

    mf.addEventListener('keydown', onKeyDownCapture, { capture: true });
    mf.addEventListener('input', onInput);
    mf.addEventListener('keydown', onKeyDown);
    for (const type of ['keyup', 'keypress', 'copy', 'cut', 'paste', 'wheel']) mf.addEventListener(type, stop);

    const raf = requestAnimationFrame(() => {
      mf.focus();
      mf.executeCommand('moveToMathfieldEnd');
    });

    return () => {
      cancelAnimationFrame(raf);
      mf.removeEventListener('keydown', onKeyDownCapture, { capture: true });
      mf.removeEventListener('input', onInput);
      mf.removeEventListener('keydown', onKeyDown);
      for (const type of ['keyup', 'keypress', 'copy', 'cut', 'paste', 'wheel']) mf.removeEventListener(type, stop);
      mf.remove();
    };
  }, [ariaLabel]);

  return <div ref={hostRef} className="inline-block" />;
}
