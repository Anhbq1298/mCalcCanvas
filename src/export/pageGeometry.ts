import { Box, type Editor, type TLShape } from 'tldraw';
import type { PageOrientation } from '../documents/DocumentTypes';

/** A4 at 96 CSS px per inch. */
export const A4 = { w: 794, h: 1123 };
export const PAGE_GAP = 48;
/** 20 mm margins. */
export const PAGE_MARGIN = 76;

export function pageSize(orientation: PageOrientation): { w: number; h: number } {
  return orientation === 'portrait' ? A4 : { w: A4.h, h: A4.w };
}

/** Pages are stacked vertically from the page origin (0, 0). */
export function pageBox(index: number, orientation: PageOrientation): Box {
  const { w, h } = pageSize(orientation);
  return new Box(0, index * (h + PAGE_GAP), w, h);
}

export function printableBox(index: number, orientation: PageOrientation): Box {
  const p = pageBox(index, orientation);
  return new Box(p.x + PAGE_MARGIN, p.y + PAGE_MARGIN * 0.6, p.w - 2 * PAGE_MARGIN, p.h - PAGE_MARGIN * 1.2);
}

function topLevelShapes(editor: Editor): TLShape[] {
  return editor.getCurrentPageShapes().filter((s) => s.parentId === editor.getCurrentPageId());
}

/** Number of pages needed to hold all content (at least one). */
export function pageCount(editor: Editor, orientation: PageOrientation): number {
  const { h } = pageSize(orientation);
  let max = 1;
  for (const s of topLevelShapes(editor)) {
    const b = editor.getShapePageBounds(s);
    if (!b || b.maxY < 0) continue;
    max = Math.max(max, Math.floor(Math.max(0, b.minY) / (h + PAGE_GAP)) + 1);
  }
  return Math.min(max, 200);
}

/** Shapes not fully inside the printable area of a single page. */
export function shapesOutsidePrintArea(editor: Editor, orientation: PageOrientation): TLShape[] {
  const { h } = pageSize(orientation);
  return topLevelShapes(editor).filter((s) => {
    const b = editor.getShapePageBounds(s);
    if (!b) return false;
    const index = Math.max(0, Math.floor(b.minY / (h + PAGE_GAP)));
    return !printableBox(index, orientation).contains(b);
  });
}

/** Top-level shapes intersecting a page. */
export function shapesOnPage(editor: Editor, index: number, orientation: PageOrientation): TLShape[] {
  const box = pageBox(index, orientation);
  return topLevelShapes(editor).filter((s) => {
    const b = editor.getShapePageBounds(s);
    return !!b && box.collides(b);
  });
}
