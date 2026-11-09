import { boxContains, shapeBounds } from '../canvas/model/geometry';
import type { Box, Shape } from '../canvas/model/types';
import { DEFAULT_MARGINS, type PageMargins, type PageOrientation, type PaperSize } from '../documents/DocumentTypes';

/**
 * Page geometry. Document coordinates are CSS px (96 per inch); pages are
 * stacked vertically from (0, 0) with PAGE_GAP between them. Paper and margins
 * are in mm and converted once here (1 mm = 96 / 25.4 px, rounded to whole px
 * so the grid origin stays on whole pixels). Region positions never depend on
 * these settings: changing paper, orientation or margins moves the page
 * frames, not the regions.
 */
export const MM = 96 / 25.4;
export const mmToPx = (mm: number): number => Math.round(mm * MM);
export const pxToMm = (px: number): number => px / MM;

export const PAPER_MM: Record<PaperSize, { w: number; h: number }> = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } };

/** A4 at 96 CSS px per inch. */
export const A4 = { w: mmToPx(210), h: mmToPx(297) };
export const PAGE_GAP = 48;

/** The active document's paper and margins (set from its settings; see setPageSetup). */
let paper: PaperSize = 'A4';
let margins: PageMargins = DEFAULT_MARGINS;

export function setPageSetup(next: { paper?: PaperSize; margins?: PageMargins }): void {
  paper = next.paper ?? 'A4';
  margins = next.margins ?? DEFAULT_MARGINS;
}

export function currentPageSetup(): { paper: PaperSize; margins: PageMargins } {
  return { paper, margins };
}

/** Margins in px: left, right, top, bottom. */
export function marginPx(): { left: number; right: number; top: number; bottom: number } {
  return { left: mmToPx(margins.left), right: mmToPx(margins.right), top: mmToPx(margins.top), bottom: mmToPx(margins.bottom) };
}

/** Paper size in mm for an orientation (width and height swap in landscape). */
export function paperMm(orientation: PageOrientation, size: PaperSize = paper): { w: number; h: number } {
  const p = PAPER_MM[size];
  return orientation === 'portrait' ? p : { w: p.h, h: p.w };
}

export function pageSize(orientation: PageOrientation): { w: number; h: number } {
  const p = paperMm(orientation);
  return { w: mmToPx(p.w), h: mmToPx(p.h) };
}

/** Pages are stacked vertically from the page origin (0, 0). */
export function pageBox(index: number, orientation: PageOrientation): Box {
  const { w, h } = pageSize(orientation);
  return { x: 0, y: index * (h + PAGE_GAP), w, h };
}

export function printableBox(index: number, orientation: PageOrientation): Box {
  const p = pageBox(index, orientation);
  const m = marginPx();
  return { x: p.x + m.left, y: p.y + m.top, w: p.w - m.left - m.right, h: p.h - m.top - m.bottom };
}

/** Margins leave a printable area of at least 20 mm each way. */
export function marginsValid(m: PageMargins, orientation: PageOrientation, size: PaperSize): boolean {
  const p = paperMm(orientation, size);
  return [m.top, m.bottom, m.left, m.right].every((v) => Number.isFinite(v) && v >= 0) && p.w - m.left - m.right >= 20 && p.h - m.top - m.bottom >= 20;
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
