import { useContext, useLayoutEffect, useRef } from 'react';
import { ReportShapes } from '../../store/reportResults';
import { stopEditing, updateShape, useCanvasStore } from '../model/canvasStore';
import { useSeparateAfterEditing } from './useSeparate';
import { fontStack, PARAGRAPH_STYLES, TEXT_STYLES, type TextShape } from '../model/types';
import { escapeHtml, plainTextToHtml, sanitizeHtml } from '../sanitize';
import { annexInfo, annexNumber, blockTitle, pageNumberOf } from '../annex';
import { useAppStore } from '../../store/appStore';

/**
 * Rich text region. While editing it is a contentEditable box (Ctrl+B/I/U
 * work natively; headings and lists come from the properties panel).
 */
export function TextView({ shape, editing, isStatic }: { shape: TextShape; editing: boolean; isStatic: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { html, w, fontSize, color, align, fontFamily, heading, textStyle } = shape.props;
  const annexHtml = useAnnexHtml(shape);

  useSeparateAfterEditing(shape.id, editing, isStatic);

  // Initialise the editable content once per editing session (not on every keystroke).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !editing) return;
    el.innerHTML = html;
    const pending = useCanvasStore.getState().pendingTextCaret;
    const converted = pending?.id === shape.id;
    // Focus now (so no keystroke is lost) and again after the pointer event's
    // default focus handling has run.
    el.focus();
    placeCaret(el, converted ? pending.offset : Number.POSITIVE_INFINITY);
    if (converted) useCanvasStore.setState({ pendingTextCaret: null });
    const raf = requestAnimationFrame(() => {
      el.focus();
      if (!converted) placeCaret(el, Number.POSITIVE_INFINITY);
    });
    return () => cancelAnimationFrame(raf);
    // Only on entering edit mode; later html changes come from the user typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const style: React.CSSProperties = {
    width: w,
    height: shape.props.h,
    fontFamily: fontStack(fontFamily),
    fontSize,
    color,
    textAlign: align,
    fontWeight: heading ? PARAGRAPH_STYLES[heading].weight : textStyle ? TEXT_STYLES[textStyle].weight : undefined,
    fontStyle: textStyle && TEXT_STYLES[textStyle].italic ? 'italic' : undefined,
    lineHeight: 1.45,
    minHeight: fontSize * 1.45,
    overflow: editing ? 'auto' : 'hidden',
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
        onInput={(e) => {
          const nextHeight = Math.max(shape.props.h, Math.ceil(e.currentTarget.scrollHeight));
          updateShape(shape.id, { props: { html: sanitizeHtml(e.currentTarget.innerHTML), h: nextHeight } }, { history: false });
        }}
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
      data-text-style={textStyle}
      data-annex={shape.props.annex?.kind}
      style={style}
      onClick={(e) => {
        // Links open with Ctrl/⌘+click (a plain click selects the region).
        const a = (e.target as HTMLElement).closest('a');
        if (a && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          window.open(a.href, '_blank', 'noopener,noreferrer');
        } else if (a) e.preventDefault();
      }}
      dangerouslySetInnerHTML={{ __html: annexHtml || html || '&nbsp;' }}
    />
  );
}

/** Put the caret at a plain-text offset without assuming a particular HTML shape. */
function placeCaret(root: HTMLElement, offset: number): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, Math.max(0, remaining));
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Rendered content of an annex link or annex heading (number, title, page); null for other text. */
function useAnnexHtml(shape: TextShape): string | null {
  const reportShapes = useContext(ReportShapes);
  const role = shape.props.annex;
  const { canvasMode, pageOrientation } = useAppStore((s) => s.settings);
  return useCanvasStore((st) => {
    if (!role || role.kind === 'start') return null;
    const shapes = reportShapes ?? st.shapes;
    // Numbering and block membership follow the editable reading order;
    // only destination page references use the planned print geometry.
    const info = annexInfo(st.shapes);
    const page = (id: string) => (canvasMode === 'page' && shapes[id] ? ` · page ${pageNumberOf(shapes[id], pageOrientation)}` : '');
    if (role.kind === 'link') {
      const ls = info.links.get(shape.id);
      if (!ls?.block) return `▸ Annex link <span class="annex-bad">${escapeHtml(ls?.problem ?? 'Annex missing.')}</span>`;
      const b = ls.block;
      const where = canvasMode === 'page' ? `see page ${pageNumberOf(shapes[b.heading], pageOrientation)}` : 'see annex';
      return `▸ <b>${annexNumber(b.number)}</b> ${escapeHtml(blockTitle(shapes, b))} <span class="annex-page">· ${where}</span>`;
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
