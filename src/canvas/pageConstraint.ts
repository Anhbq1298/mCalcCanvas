/**
 * Page Layout mode keeps every region inside the printable (white, inside
 * the margins) area of an A4 page — like typing in a Google Docs page.
 * Free canvas mode has no limits.
 */
import { GRID_MAJOR, GRID_SIZE, orderedShapes, setPositionNormalizer, updateShapes, useCanvasStore, type ShapePatch } from './model/canvasStore';
import { shapeBounds, unionBounds } from './model/geometry';
import type { Box, Point, Shape } from './model/types';
import { PAGE_GAP, pageCount, pageSize, printableBox } from '../export/pageGeometry';
import { useAppStore } from '../store/appStore';

export function constrained(): boolean {
  return useAppStore.getState().settings.canvasMode === 'page';
}

function orientation() {
  return useAppStore.getState().settings.pageOrientation;
}

/** Index of the page whose vertical band contains y (pages may be added one past the last). */
function pageIndexAt(y: number): number {
  const { h } = pageSize(orientation());
  const max = pageCount(orderedShapes(), orientation(), useAppStore.getState().settings.pages);
  return Math.min(max, Math.max(0, Math.floor(y / (h + PAGE_GAP))));
}

/** The printable box containing a point, or null if the point is on the margin/background. */
export function printableAt(p: Point): Box | null {
  if (!constrained()) return { x: -Infinity, y: -Infinity, w: Infinity, h: Infinity };
  const box = printableBox(pageIndexAt(p.y), orientation());
  return p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h ? box : null;
}

export function clampPoint(p: Point, box: Box | null = null): Point {
  if (!constrained()) return p;
  const b = box ?? printableBox(pageIndexAt(p.y), orientation());
  return { x: Math.min(b.x + b.w, Math.max(b.x, p.x)), y: Math.min(b.y + b.h, Math.max(b.y, p.y)) };
}

/** Adjust a move (dx, dy) so the moved bounds stay inside one page's printable area. */
export function clampDelta(bounds: Box, dx: number, dy: number): { dx: number; dy: number } {
  if (!constrained()) return { dx, dy };
  const box = printableBox(pageIndexAt(bounds.y + dy + Math.min(bounds.h, 20) / 2), orientation());
  let x = bounds.x + dx;
  let y = bounds.y + dy;
  x = bounds.w > box.w ? box.x : Math.min(box.x + box.w - bounds.w, Math.max(box.x, x));
  y = bounds.h > box.h ? box.y : Math.min(box.y + box.h - bounds.h, Math.max(box.y, y));
  return { dx: x - bounds.x, dy: y - bounds.y };
}

/** Move the given shapes (as one block) back inside the printable area if needed. */
export function clampShapesIntoPage(ids: string[]): void {
  if (!constrained() || !ids.length) return;
  const { shapes } = useCanvasStore.getState();
  const list = ids.map((id) => shapes[id]).filter(Boolean) as Shape[];
  const b = unionBounds(list.map(shapeBounds));
  if (!b) return;
  const { dx, dy } = clampDelta(b, 0, 0);
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
  const patches: Record<string, ShapePatch> = {};
  for (const s of list) patches[s.id] = { x: s.x + dx, y: s.y + dy };
  updateShapes(patches, { history: false });
}

/**
 * Where typing goes when no insertion cross is set: below the last region
 * on the page in view, inside the margins (Docs-like "continue writing").
 */
export function nextWritingPoint(viewCenter: Point): Point {
  const box = printableBox(pageIndexAt(Math.max(0, viewCenter.y)), orientation());
  let bottom = box.y + 8;
  for (const s of orderedShapes()) {
    const b = shapeBounds(s);
    if (b.y >= box.y - 1 && b.y <= box.y + box.h) bottom = Math.max(bottom, b.y + b.h + 16);
  }
  return { x: box.x + 16, y: Math.min(bottom, box.y + box.h - 40) };
}

// ---------------------------------------------------------------------------
// Strict grid for math and text regions
// ---------------------------------------------------------------------------

/** Grid origin for a point: the corner of the page's writable area (or 0,0 on the free canvas). */
function gridOrigin(p: Point): Point {
  if (!constrained()) return { x: 0, y: 0 };
  const box = printableBox(pageIndexAt(p.y), orientation());
  return { x: box.x, y: box.y };
}

/** Nearest grid point (the same grid that is drawn on the page). */
export function gridPoint(p: Point): Point {
  const o = gridOrigin(p);
  return { x: o.x + Math.round((p.x - o.x) / GRID_SIZE) * GRID_SIZE, y: o.y + Math.round((p.y - o.y) / GRID_SIZE) * GRID_SIZE };
}

/** Nearest major horizontal line (every GRID_MAJOR px from the grid origin). */
function nearestMajor(y: number, originY: number): number {
  return originY + Math.round((y - originY) / GRID_MAJOR) * GRID_MAJOR;
}

/** Insertion cross: x on the minor grid, y on the nearest major line (where the next baseline goes). */
export function crossPoint(p: Point): Point {
  const o = gridOrigin(p);
  return { x: gridPoint(p).x, y: nearestMajor(p.y, o.y) };
}

/** Top of the writable area of the page after the one containing y (null if that page doesn't exist yet). */
export function nextPrintableTop(y: number): number | null {
  const stride = pageSize(orientation()).h + PAGE_GAP;
  const next = Math.floor(y / stride) + 1;
  if (next >= pageCount(orderedShapes(), orientation(), useAppStore.getState().settings.pages)) return null;
  return printableBox(next, orientation()).y;
}

/** First major line at or below y (for placing the cross under a region). */
export function majorLineAtOrBelow(y: number): number {
  const o = gridOrigin({ x: 0, y });
  return o.y + Math.ceil((y - o.y) / GRID_MAJOR) * GRID_MAJOR;
}

/**
 * Distance from a region's top to its first baseline. Math regions report a
 * measured value (props.baseline); otherwise it is estimated from the font
 * size (text: line-height 1.45, ascent ≈ 0.97 em).
 */
export function baselineOf(s: Shape): number {
  if (s.type === 'math') return s.props.baseline ?? 4 + s.props.fontSize;
  if (s.type === 'text') return Math.round(s.props.fontSize * 1.09);
  return 0;
}

/**
 * Math and text regions sit like writing on ruled paper: x on the minor
 * grid, and the first baseline on a major line, inside the margins.
 */
export function gridAlign(s: Shape): Shape {
  if (s.type !== 'math' && s.type !== 'text') return s;
  const b = baselineOf(s);
  const o = gridOrigin(s);
  let x = gridPoint(s).x;
  let y = Math.round(nearestMajor(s.y + b, o.y) - b);
  if (constrained()) {
    const box = printableBox(pageIndexAt(s.y), orientation());
    const w = s.props.w;
    const h = s.props.h;
    while (x + w > box.x + box.w && x - GRID_SIZE >= box.x) x -= GRID_SIZE;
    while (y + h > box.y + box.h && y - GRID_MAJOR >= box.y) y -= GRID_MAJOR;
    while (y < box.y) y += GRID_MAJOR;
    x = Math.max(box.x, x);
  }
  return x === s.x && y === s.y ? s : ({ ...s, x, y } as Shape);
}

setPositionNormalizer(gridAlign);

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function pageStride(): number {
  return pageSize(orientation()).h + PAGE_GAP;
}

export function totalPages(): number {
  return pageCount(orderedShapes(), orientation(), useAppStore.getState().settings.pages);
}

/** Page the user is working on: the selection, the crosshair, else the page in view. */
export function currentPageIndex(viewY: number): number {
  const st = useCanvasStore.getState();
  const sel = st.selection.map((id) => st.shapes[id]).filter(Boolean);
  const y = sel.length ? Math.min(...sel.map((s) => shapeBounds(s).y)) : st.crosshair ? st.crosshair.y : viewY;
  return Math.min(totalPages() - 1, Math.max(0, Math.floor(y / pageStride())));
}

/** Insert a blank page after `index`; content on later pages moves down one page. Returns the new page's index. */
export function insertBlankPageAfter(index: number): number {
  const stride = pageStride();
  const total = totalPages();
  const startY = (index + 1) * stride;
  useAppStore.getState().updateSettings({ pages: total + 1 });
  const later = orderedShapes().filter((s) => shapeBounds(s).y >= startY - PAGE_GAP / 2);
  if (later.length) updateShapes(Object.fromEntries(later.map((s) => [s.id, { y: s.y + stride }])), { raw: true });
  return index + 1;
}

/** Remove page `index` if nothing is on it; later content moves up. Returns false if the page has content. */
export function deletePage(index: number): boolean {
  const stride = pageStride();
  const total = totalPages();
  const top = index * stride;
  const shapes = orderedShapes();
  const onPage = shapes.some((s) => {
    const b = shapeBounds(s);
    return b.y + b.h > top && b.y < top + stride - PAGE_GAP / 2;
  });
  if (onPage || total <= 1) return false;
  const later = shapes.filter((s) => shapeBounds(s).y >= top + stride - PAGE_GAP / 2);
  if (later.length) updateShapes(Object.fromEntries(later.map((s) => [s.id, { y: s.y - stride }])), { raw: true });
  useAppStore.getState().updateSettings({ pages: total - 1 });
  return true;
}
