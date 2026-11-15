/** Calculation order of shapes (pure: no stores), shared by the canvas bridge and headless runners. */
import type { OrderKey } from '../engine/light';
import { annexInfo } from './annex';
import type { Shape } from './model/types';

/**
 * Reading-order key of a region (Mathcad order), compared
 * lexicographically by the engine: top to bottom (pages included), then left to
 * right, then the region id so equal positions still have a fixed order.
 * Coordinates are used exactly (no rounding or numeric packing), so large
 * and negative positions order correctly. A key depends only on the
 * region's own position, so moving one region re-keys only that region.
 */
export function readingKey(s: Shape): OrderKey {
  // Pages are stacked top to bottom, so y alone gives the page order: the key
  // does not change with paper size, orientation or margins (no recalculation).
  return [s.y, s.x, s.id];
}

/**
 * Calculation key of a shape: its reading key, or – inside an annex block
 * placed by a link – the link's reading key followed by its own, so the block
 * is calculated where the link stands.
 */
export function calcKey(s: Shape, shapes: Record<string, Shape>): OrderKey {
  const link = annexInfo(shapes).anchorOf.get(s.id);
  const anchor = link ? shapes[link] : undefined;
  return anchor ? [...readingKey(anchor), ...readingKey(s)] : readingKey(s);
}
