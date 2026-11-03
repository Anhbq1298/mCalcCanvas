import { useMemo } from 'react';
import { PAGE_MARGIN, pageBox, pageCount, shapesOutsidePrintArea } from '../export/pageGeometry';
import { useAppStore } from '../store/appStore';
import { orderedShapes, useCanvasStore } from './model/canvasStore';
import { shapeBounds } from './model/geometry';

/** A4 sheets, margins and out-of-print-area markers (Page Layout mode). */
export function PageOverlay() {
  const mode = useAppStore((s) => s.settings.canvasMode);
  const orientation = useAppStore((s) => s.settings.pageOrientation);
  const shapesMap = useCanvasStore((s) => s.shapes);
  const order = useCanvasStore((s) => s.order);
  const shapes = useMemo(() => orderedShapes({ ...useCanvasStore.getState(), shapes: shapesMap, order }), [shapesMap, order]);
  const pages = useMemo(() => pageCount(shapes, orientation), [shapes, orientation]);
  const outside = useMemo(() => (mode === 'page' ? shapesOutsidePrintArea(shapes, orientation).map(shapeBounds) : []), [shapes, orientation, mode]);
  if (mode !== 'page') return null;

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} aria-hidden>
      {Array.from({ length: pages }, (_, i) => {
        const b = pageBox(i, orientation);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: b.x,
              top: b.y,
              width: b.w,
              height: b.h,
              background: 'var(--color-card)',
              boxShadow: '0 1px 2px rgb(15 23 42 / 0.08), 0 4px 16px rgb(15 23 42 / 0.06)',
            }}
          >
            <div style={{ position: 'absolute', left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_MARGIN * 0.6, bottom: PAGE_MARGIN * 0.6, border: '1px dashed var(--color-border)' }} />
            <div style={{ position: 'absolute', right: 8, bottom: 6, font: '500 10px var(--font-sans)', color: 'var(--color-muted-foreground)' }}>Page {i + 1}</div>
          </div>
        );
      })}
      {outside.map((b, i) => (
        <div
          key={`o${i}`}
          data-testid="outside-print-marker"
          style={{ position: 'absolute', left: b.x - 3, top: b.y - 3, width: b.w + 6, height: b.h + 6, border: '1.5px dashed var(--color-destructive)' }}
        />
      ))}
    </div>
  );
}
