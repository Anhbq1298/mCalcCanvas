import { boxContains, shapeBounds } from '../canvas/model/geometry';
import type { Box, Shape } from '../canvas/model/types';
import type { PageOrientation } from '../documents/DocumentTypes';

/** A4 at 96 CSS px per inch. */
export const A4 = { w: 794, h: 1123 };
export const PAGE_GAP = 48;
/** 20 mm side margins. */
export const PAGE_MARGIN = 76;
/** 16 mm top/bottom: room for the header/footer title block. */
export const PAGE_MARGIN_V = 60;

export function pageSize(orientation: PageOrientation): { w: number; h: number } {
  return orientation === 'portrait' ? A4 : { w: A4.h, h: A4.w };
}

/** Pages are stacked vertically from the page origin (0, 0). */
export function pageBox(index: number, orientation: PageOrientation): Box {
  const { w, h } = pageSize(orientation);
  return { x: 0, y: index * (h + PAGE_GAP), w, h };
}

export function printableBox(index: number, orientation: PageOrientation): Box {
  const p = pageBox(index, orientation);
  return { x: p.x + PAGE_MARGIN, y: p.y + PAGE_MARGIN_V, w: p.w - 2 * PAGE_MARGIN, h: p.h - 2 * PAGE_MARGIN_V };
}

/** Pages needed for the shapes, but at least `minPages` (blank pages the user inserted). */
export function pageCount(shapes: Shape[], orientation: PageOrientation, minPages = 1): number {
  const { h } = pageSize(orientation);
  let max = Math.max(1, Math.floor(minPages) || 1);
  for (const s of shapes) {
    const b = shapeBounds(s);
    if (b.y + b.h < 0) continue;
    max = Math.max(max, Math.floor(Math.max(0, b.y) / (h + PAGE_GAP)) + 1);
  }
  return Math.min(max, 200);
}

/** Shapes not fully inside the printable area of one page. */
export function shapesOutsidePrintArea(shapes: Shape[], orientation: PageOrientation): Shape[] {
  const { h } = pageSize(orientation);
  return shapes.filter((s) => {
    const b = shapeBounds(s);
    const index = Math.max(0, Math.floor(b.y / (h + PAGE_GAP)));
    return !boxContains(printableBox(index, orientation), b);
  });
}

/** Page a shape belongs to: the page band containing its top edge (gaps count as the page above). */
export function pageIndexOf(s: Shape, orientation: PageOrientation): number {
  const { h } = pageSize(orientation);
  return Math.max(0, Math.floor(shapeBounds(s).y / (h + PAGE_GAP)));
}

/**
 * Shapes printed on page `index`. Every shape is printed on exactly one
 * page – the one containing its top edge – so a shape crossing a page
 * boundary is never duplicated; the part below that page's edge is clipped
 * (and flagged by shapesOutsidePrintArea).
 */
export function shapesOnPage(shapes: Shape[], index: number, orientation: PageOrientation): Shape[] {
  return shapes.filter((s) => pageIndexOf(s, orientation) === index);
}
