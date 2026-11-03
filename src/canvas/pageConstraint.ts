/**
 * Page Layout mode keeps every region inside the printable (white, inside
 * the margins) area of an A4 page — like typing in a Google Docs page.
 * Free canvas mode has no limits.
 */
import { GRID_SIZE, orderedShapes, setPositionNormalizer, updateShapes, useCanvasStore, type ShapePatch } from './model/canvasStore';
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
  const max = pageCount(orderedShapes(), orientation());
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

/** Math and text regions always sit on a grid point, inside the margins. */
function gridAlign(s: Shape): Shape {
  if (s.type !== 'math' && s.type !== 'text') return s;
  let { x, y } = gridPoint(s);
  if (constrained()) {
    const box = printableBox(pageIndexAt(s.y), orientation());
    const w = s.props.w;
    const h = s.props.h;
    while (x + w > box.x + box.w && x - GRID_SIZE >= box.x) x -= GRID_SIZE;
    while (y + h > box.y + box.h && y - GRID_SIZE >= box.y) y -= GRID_SIZE;
    x = Math.max(box.x, x);
    y = Math.max(box.y, y);
  }
  return x === s.x && y === s.y ? s : ({ ...s, x, y } as Shape);
}

setPositionNormalizer(gridAlign);
