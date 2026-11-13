import { useEffect, useLayoutEffect, useRef } from 'react';
import { flushPendingKeys, setActiveMathEditor, setKeyReplayer } from './activeEditor';
import { forgetMathcadContext, handleMathcadKey } from './mathcadKeys';
import { configureMathfield, MathfieldElement } from './mathliveSetup';
import { convertibleMathWord } from './mathToText';

interface MathEditorProps {
  latex: string;
  onChange(latex: string): void;
  /** Enter / Escape: finish editing. */
  onExit(reason: 'enter' | 'escape'): void;
  onConvertToText(text: string, caretOffset: number): void;
  /** Report the rendered size so the region can grow while typing. */
  ariaLabel?: string;
  /** The result preview renders the trailing evaluation equals sign. */
  hideTrailingEquals?: boolean;
}

/**
 * MathLive editor mounted imperatively so React never re-creates the
 * element (which would lose caret position) while the user types.
 *
 * Keyboard and pointer events are stopped at the mathfield boundary so
 * canvas shortcuts (tool letters, Delete, Ctrl+D…) never steal input.
 */
export function MathEditor({ latex, onChange, onExit, onConvertToText, ariaLabel, hideTrailingEquals }: MathEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<MathfieldElement | null>(null);
  const callbacks = useRef({ onChange, onExit, onConvertToText });
  useLayoutEffect(() => {
    callbacks.current = { onChange, onExit, onConvertToText };
  });
  const initialLatex = useRef(latex);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const mf = new MathfieldElement();
    mf.setAttribute('aria-label', ariaLabel ?? 'Math input');
    mf.setAttribute('data-testid', 'math-input');
    host.appendChild(mf);
    fieldRef.current = mf;
    configureMathfield(mf);
    mf.value = initialLatex.current;
    const changed = () => callbacks.current.onChange(mf.value);
    setActiveMathEditor({ mf, changed });
    setKeyReplayer((key) => {
      const ev = new KeyboardEvent('keydown', { key });
      if (!handleMathcadKey(ev, mf, changed)) {
        mf.executeCommand(['typedText', key]);
        changed();
      }
    });

    const onInput = () => callbacks.current.onChange(mf.value);
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        callbacks.current.onChange(mf.value);
        callbacks.current.onExit(e.key === 'Enter' ? 'enter' : 'escape');
        return;
      }
      e.stopPropagation();
    };
    const stop = (e: Event) => e.stopPropagation();
    const forgetContext = () => forgetMathcadContext(mf);

    // Mathcad keystrokes (":" → ≔, "\\" → √, Ctrl+G Greek, "=" evaluates the
    // whole region…). Capture phase, i.e. before MathLive handles the key.
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const word = convertibleMathWord(mf.value);
        if (word) {
          e.preventDefault();
          e.stopPropagation();
          const prefixLength = Math.min(word.length, mf.getValue(0, mf.position, 'plain-text').length);
          callbacks.current.onConvertToText(`${word.slice(0, prefixLength)} ${word.slice(prefixLength)}`, prefixLength + 1);
          return;
        }
      }
      if (handleMathcadKey(e, mf, () => callbacks.current.onChange(mf.value))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    mf.addEventListener('keydown', onKeyDownCapture, { capture: true });
    mf.addEventListener('pointerdown', forgetContext);
    mf.addEventListener('input', onInput);
    mf.addEventListener('keydown', onKeyDown);
    for (const type of ['keyup', 'keypress', 'copy', 'cut', 'paste', 'wheel']) mf.addEventListener(type, stop);

    // Focus right away so no keystroke is lost, and again after the
    // pointer event that created the region has finished.
    const startCaret = () => {
      if (mf.value.includes('\\placeholder')) {
        mf.executeCommand('moveToMathfieldStart');
        mf.executeCommand('moveToNextPlaceholder');
      } else mf.executeCommand('moveToMathfieldEnd');
    };
    mf.focus();
    startCaret();
    const raf = requestAnimationFrame(() => {
      mf.focus();
      startCaret();
      flushPendingKeys();
    });

    return () => {
      cancelAnimationFrame(raf);
      mf.removeEventListener('keydown', onKeyDownCapture, { capture: true });
      mf.removeEventListener('pointerdown', forgetContext);
      mf.removeEventListener('input', onInput);
      mf.removeEventListener('keydown', onKeyDown);
      for (const type of ['keyup', 'keypress', 'copy', 'cut', 'paste', 'wheel']) mf.removeEventListener(type, stop);
      setActiveMathEditor(null);
      setKeyReplayer(null);
      mf.remove();
      fieldRef.current = null;
    };
  }, [ariaLabel]);

  useEffect(() => {
    const mf = fieldRef.current;
    if (hideTrailingEquals && mf?.isConnected && /=\s*$/.test(mf.value)) {
      mf.value = mf.value.replace(/=\s*$/, '');
      mf.executeCommand('moveToMathfieldEnd');
    }
  }, [hideTrailingEquals, latex]);

  return <div ref={hostRef} className="inline-block" />;
}
