import { useEffect, useLayoutEffect, useRef } from 'react';
import { stopEditing, updateShape, useCanvasStore } from '../model/canvasStore';
import { separateRegion } from '../canvasActions';
import { useSeparateAfterEditing } from './useSeparate';
import { fontStack, PARAGRAPH_STYLES, type TextShape } from '../model/types';
import { escapeHtml, plainTextToHtml, sanitizeHtml } from '../sanitize';
import { annexInfo, annexNumber, blockTitle, pageNumberOf } from '../annex';
import { useAppStore } from '../../store/appStore';

/**
 * Rich text region. While editing it is a contentEditable box (Ctrl+B/I/U
 * work natively; headings and lists come from the properties panel).
 */
export function TextView({ shape, editing, isStatic }: { shape: TextShape; editing: boolean; isStatic: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { html, w, fontSize, color, align, fontFamily, heading } = shape.props;
  const annexHtml = useAnnexHtml(shape);

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
  return (
    <div
      ref={ref}
      className={shape.props.annex?.kind === 'link' ? 'text-region text-region--annex-link' : 'text-region'}
      data-testid="text-region"
      data-heading={heading || undefined}
      data-annex={shape.props.annex?.kind}
      style={style}
      dangerouslySetInnerHTML={{ __html: annexHtml || html || '&nbsp;' }}
    />
  );
}

/** Rendered content of an annex link or annex heading (number, title, page); null for other text. */
function useAnnexHtml(shape: TextShape): string | null {
  const role = shape.props.annex;
  const { canvasMode, pageOrientation } = useAppStore((s) => s.settings);
  return useCanvasStore((st) => {
    if (!role || role.kind === 'start') return null;
    const info = annexInfo(st.shapes);
    const page = (id: string) => (canvasMode === 'page' && st.shapes[id] ? ` · page ${pageNumberOf(st.shapes[id], pageOrientation)}` : '');
    if (role.kind === 'link') {
      const ls = info.links.get(shape.id);
      if (!ls?.block) return `▸ Annex link <span class="annex-bad">${escapeHtml(ls?.problem ?? 'Annex missing.')}</span>`;
      const b = ls.block;
      const where = canvasMode === 'page' ? `see page ${pageNumberOf(st.shapes[b.heading], pageOrientation)}` : 'see annex';
      return `▸ <b>${annexNumber(b.number)}</b> ${escapeHtml(blockTitle(st.shapes, b))} <span class="annex-page">· ${where}</span>`;
    }
    const b = info.byHeading.get(shape.id);
    const title = shape.props.html || 'Annex';
    if (!b) return `${title}<span class="annex-bad">${escapeHtml(info.headingProblems.get(shape.id) ?? '')}</span>`;
    const back = b.link
      ? `<span class="annex-back" data-annex-go="${b.link}">↩ calculated at the link${page(b.link)}</span>`
      : '<span class="annex-back annex-unlinked">not linked: calculated here</span>';
    return `<span class="annex-num">${annexNumber(b.number)}</span>&nbsp; ${title}${back}`;
  });
}
