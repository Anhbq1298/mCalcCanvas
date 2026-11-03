import { useMemo } from 'react';
import { PageChrome } from '../export/PageChrome';
import { PAGE_MARGIN, PAGE_MARGIN_V, pageBox, pageCount, shapesOutsidePrintArea } from '../export/pageGeometry';
import { useAppStore } from '../store/appStore';
import { orderedShapes, useCanvasStore } from './model/canvasStore';
import { shapeBounds } from './model/geometry';

/** A4 sheets, margins and out-of-print-area markers (Page Layout mode). */
export function PageOverlay() {
  const mode = useAppStore((s) => s.settings.canvasMode);
  const orientation = useAppStore((s) => s.settings.pageOrientation);
  const shapesMap = useCanvasStore((s) => s.shapes);
  const isGrid = useCanvasStore((s) => s.isGrid);
  const showChrome = useAppStore((s) => s.settings.showHeaderFooter);
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
              background: 'var(--color-paper)',
              boxShadow: '0 2px 10px rgb(0 0 0 / 0.35)',
            }}
          >
            <div
              data-testid={isGrid ? 'page-grid' : undefined}
              style={{
                position: 'absolute',
                left: PAGE_MARGIN,
                right: PAGE_MARGIN,
                top: PAGE_MARGIN_V,
                bottom: PAGE_MARGIN_V,
                border: '1px dashed var(--color-border)',
                // Engineering pad: 10 px minor / 50 px major squares inside the print area.
                backgroundImage: isGrid
                  ? 'linear-gradient(var(--grid-major) 1px, transparent 1px), linear-gradient(90deg, var(--grid-major) 1px, transparent 1px), linear-gradient(var(--grid-minor) 1px, transparent 1px), linear-gradient(90deg, var(--grid-minor) 1px, transparent 1px)'
                  : undefined,
                backgroundSize: isGrid ? '50px 50px, 50px 50px, 10px 10px, 10px 10px' : undefined,
              }}
            />
            <PageChrome index={i} total={pages} />
            {!showChrome && (
              <div style={{ position: 'absolute', right: 8, bottom: 6, font: '500 10px var(--font-sans)', color: 'var(--color-muted-foreground)' }}>Page {i + 1}</div>
            )}
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
