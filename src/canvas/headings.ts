/**
 * Document outline: text regions styled as headings, in reading order.
 */
import { clampShapesIntoPage, constrained, nextWritingPoint } from './pageConstraint';
import { createTextRegion, revealShape, viewportCenter } from './canvasActions';
import { orderedShapes, updateShapes, useCanvasStore, type ShapePatch } from './model/canvasStore';
import { PARAGRAPH_STYLES, TEXT_STYLES, type HeadingLevel, type Shape, type TextShape, type TextStyleId } from './model/types';
import { escapeHtml } from './sanitize';
import { shapeBounds } from './model/geometry';
import { annexInfo, annexNumber } from './annex';

function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(div|p|li|h\d)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Heading level of a shape (0 = not a heading). */
function headingLevel(s: Shape): HeadingLevel {
  if (s.type !== 'text') return 0;
  return s.props.heading ?? 0;
}

interface OutlineItem {
  id: string;
  level: 1 | 2 | 3;
  /** Shown text (annex headings get their A.n number in front). */
  text: string;
  /** Editable title (the heading text itself). */
  title: string;
}

function readingSort<T extends { x: number; y: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.y - b.y || a.x - b.x);
}

export function outlineOf(shapes: Record<string, Shape>): OutlineItem[] {
  const items = readingSort(Object.values(shapes).filter((s): s is TextShape => headingLevel(s) > 0));
  const annex = annexInfo(shapes);
  return items.map((s) => {
    const block = annex.byHeading.get(s.id);
    const title = plainText(s.props.html);
    return { id: s.id, level: headingLevel(s) as 1 | 2 | 3, text: (block ? `${annexNumber(block.number)} ` : '') + title, title };
  });
}

/** The heading whose section contains `shape` (nearest heading above it in reading order). */
export function sectionOf(shapes: Record<string, Shape>, id: string | undefined): string | undefined {
  const s = id ? shapes[id] : undefined;
  if (!s) return undefined;
  let found: string | undefined;
  for (const h of outlineOf(shapes)) {
    const hs = shapes[h.id];
    if (hs.y < s.y || (hs.y === s.y && hs.x <= s.x)) found = h.id;
    else break;
  }
  return found;
}

/** Apply a paragraph style (normal text or heading 1–3) to text regions. */
export function setParagraphStyle(ids: string[], level: HeadingLevel): void {
  const { shapes } = useCanvasStore.getState();
  const st = PARAGRAPH_STYLES[level];
  const patches: Record<string, ShapePatch> = {};
  for (const id of ids) {
    const s = shapes[id];
    if (s?.type !== 'text') continue;
    patches[id] = { props: { heading: level || undefined, textStyle: undefined, fontSize: st.fontSize, color: st.color } };
  }
  if (Object.keys(patches).length) updateShapes(patches);
}

/** Apply a gallery style: Normal / Heading 1–3 (outline) or Title / Subtitle. */
export function setTextStyle(ids: string[], style: HeadingLevel | TextStyleId): void {
  if (typeof style === 'number') return setParagraphStyle(ids, style);
  const { shapes } = useCanvasStore.getState();
  const st = TEXT_STYLES[style];
  const patches: Record<string, ShapePatch> = {};
  for (const id of ids) if (shapes[id]?.type === 'text') patches[id] = { props: { heading: undefined, textStyle: style, fontSize: st.fontSize, color: st.color } };
  if (Object.keys(patches).length) updateShapes(patches);
}

export function renameHeading(id: string, text: string): void {
  const s = useCanvasStore.getState().shapes[id];
  if (s?.type !== 'text' || !text.trim()) return;
  updateShapes({ [id]: { props: { html: escapeHtml(text.trim()) } } });
}

/**
 * Add a heading: at the insertion cross if one is placed, else below the
 * last content on the page in view. Starts editing it.
 */
export function addHeading(level: 1 | 2 | 3): string {
  const cross = useCanvasStore.getState().crosshair;
  const at = cross ? { x: cross.x, y: cross.y - 14 } : constrained() ? nextWritingPoint(viewportCenter()) : lastContentPoint();
  const id = createTextRegion(at, '');
  const st = PARAGRAPH_STYLES[level];
  updateShapes({ [id]: { props: { heading: level, fontSize: st.fontSize, color: st.color, w: 520 } } }, { history: false });
  clampShapesIntoPage([id]);
  revealShape(id);
  useCanvasStore.setState({ editingId: id });
  return id;
}

function lastContentPoint() {
  const all = orderedShapes();
  if (!all.length) return viewportCenter();
  const bottom = Math.max(...all.map((s) => shapeBounds(s).y + shapeBounds(s).h));
  return { x: Math.min(...all.map((s) => s.x)), y: bottom + 30 };
}
