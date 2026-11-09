/** Shared ribbon state and constants (no components, so the component files keep fast refresh). */
import { updateShapes, useCanvasStore, type ShapePatch } from '../../canvas/model/canvasStore';
import type { Shape } from '../../canvas/model/types';

export const MOD = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';

// Google Docs text colour grid (subset) plus engineering inks.
export const COLOR_GRID = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff',
  '#4a86e8', '#0000ff', '#9900ff', '#ff00ff', '#1e3a5f', '#2563eb',
  '#cc0000', '#e69138', '#38761d', '#134f5c', '#0b5394', '#741b47',
];

export const HIGHLIGHTS = ['#fff59d', '#fff6bf', '#c8e6c9', '#b3e5fc', '#f8bbd0', '#ffe0b2'];

export function useSelectedShapes(): Shape[] {
  const selection = useCanvasStore((s) => s.selection);
  const shapes = useCanvasStore((s) => s.shapes);
  return selection.map((id) => shapes[id]).filter(Boolean);
}

export function patchSelected(fn: (s: Shape) => ShapePatch | null) {
  const { selection, shapes } = useCanvasStore.getState();
  const patches: Record<string, ShapePatch> = {};
  for (const id of selection) {
    const p = shapes[id] && fn(shapes[id]);
    if (p) patches[id] = p;
  }
  if (Object.keys(patches).length) updateShapes(patches);
}
