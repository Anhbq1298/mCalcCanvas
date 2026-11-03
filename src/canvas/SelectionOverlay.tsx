import { useCanvasStore } from './model/canvasStore';
import { shapeBounds } from './model/geometry';
import type { HandleId } from './CanvasView';

const BOX_HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CURSORS: Record<string, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', start: 'move', end: 'move',
};

/** Selection outlines and resize handles, sized to stay constant on screen. */
export function SelectionOverlay() {
  const selection = useCanvasStore((s) => s.selection);
  const shapes = useCanvasStore((s) => s.shapes);
  const editingId = useCanvasStore((s) => s.editingId);
  const z = useCanvasStore((s) => s.camera.z);
  if (!selection.length) return null;

  const px = 1 / z;
  const hs = 9 / z;
  const single = selection.length === 1 ? shapes[selection[0]] : null;

  return (
    <>
      {selection.map((id) => {
        const s = shapes[id];
        if (!s || id === editingId) return null;
        const b = shapeBounds(s);
        if (s.type === 'line') return null;
        return (
          <div
            key={id}
            data-testid="selection-outline"
            style={{
              position: 'absolute',
              left: b.x - 2 * px,
              top: b.y - 2 * px,
              width: b.w + 4 * px,
              height: b.h + 4 * px,
              border: `${1.25 * px}px solid var(--color-accent)`,
              pointerEvents: 'none',
            }}
          />
        );
      })}
      {single && single.id !== editingId && single.type !== 'draw' && (() => {
        let handles: { id: HandleId; x: number; y: number }[];
        if (single.type === 'line') {
          handles = [
            { id: 'start', x: single.x, y: single.y },
            { id: 'end', x: single.x + single.props.x2, y: single.y + single.props.y2 },
          ];
        } else {
          const b = shapeBounds(single);
          const pos: Record<string, [number, number]> = {
            nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5],
          };
          const ids = single.type === 'text' ? (['e', 'w'] as HandleId[]) : BOX_HANDLES;
          handles = ids.map((h) => ({ id: h, x: b.x + pos[h][0] * b.w, y: b.y + pos[h][1] * b.h }));
        }
        return handles.map((h) => (
          <div
            key={h.id}
            data-handle={h.id}
            data-testid={`handle-${h.id}`}
            style={{
              position: 'absolute',
              left: h.x - hs / 2,
              top: h.y - hs / 2,
              width: hs,
              height: hs,
              background: 'var(--color-card)',
              border: `${1.25 * px}px solid var(--color-accent)`,
              borderRadius: single.type === 'line' ? '50%' : 1.5 * px,
              cursor: CURSORS[h.id],
              pointerEvents: 'auto',
            }}
          />
        ));
      })()}
    </>
  );
}
