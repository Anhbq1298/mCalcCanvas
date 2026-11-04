import { useEffect, useLayoutEffect, useRef } from 'react';
import { stopEditing, updateShape, useCanvasStore } from '../model/canvasStore';
import { separateRegion } from '../canvasActions';
import { useSeparateAfterEditing } from './useSeparate';
import { fontStack, PARAGRAPH_STYLES, type TextShape } from '../model/types';
import { plainTextToHtml, sanitizeHtml } from '../sanitize';

/**
 * Rich text region. While editing it is a contentEditable box (Ctrl+B/I/U
 * work natively; headings and lists come from the properties panel).
 */
export function TextView({ shape, editing, isStatic }: { shape: TextShape; editing: boolean; isStatic: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { html, w, fontSize, color, align, fontFamily, heading } = shape.props;

  // Keep stored height equal to the rendered height (no undo entries).
  useEffect(() => {
    if (isStatic) return;
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const nh = Math.ceil(el.offsetHeight);
      if (Math.abs(nh - shape.props.h) > 1) {
        updateShape(shape.id, { props: { h: nh } }, { history: false });
        if (!editing && !useCanvasStore.getState().dragging) separateRegion(shape.id);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shape.id, shape.props.h, isStatic, editing]);

  useSeparateAfterEditing(shape.id, editing, isStatic);

  // Initialise the editable content once per editing session (not on every keystroke).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !editing) return;
    el.innerHTML = html;
    // Focus now (so no keystroke is lost) and again after the pointer event's
    // default focus handling has run.
    el.focus();
    const raf = requestAnimationFrame(() => {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
    return () => cancelAnimationFrame(raf);
    // Only on entering edit mode; later html changes come from the user typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const style: React.CSSProperties = {
    width: w,
    fontFamily: fontStack(fontFamily),
    fontSize,
    color,
    textAlign: align,
    fontWeight: heading ? PARAGRAPH_STYLES[heading].weight : undefined,
    lineHeight: 1.45,
    minHeight: fontSize * 1.45,
    outline: 'none',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  };

  if (editing) {
    return (
      <div
        ref={ref}
        className="text-region text-region--editing"
        data-testid="text-region"
        contentEditable
        suppressContentEditableWarning
        style={style}
        onInput={(e) => updateShape(shape.id, { props: { html: sanitizeHtml(e.currentTarget.innerHTML) } }, { history: false })}
        onPaste={(e) => {
          // Insert sanitised content ourselves so foreign markup never enters the live DOM.
          const html = e.clipboardData.getData('text/html');
          const text = e.clipboardData.getData('text/plain');
          if (!html && !text) return;
          e.preventDefault();
          const clean = html ? sanitizeHtml(html) : plainTextToHtml(text);
          document.execCommand('insertHTML', false, clean);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            stopEditing();
          }
        }}
      />
    );
  }
  return <div ref={ref} className="text-region" data-testid="text-region" data-heading={heading || undefined} style={style} dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }} />;
}
