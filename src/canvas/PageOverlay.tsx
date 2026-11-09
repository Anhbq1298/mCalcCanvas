import { useMemo } from 'react';
import { PageChrome } from '../export/PageChrome';
import { marginPx, pageBox, pageCount, shapesOutsidePrintArea } from '../export/pageGeometry';
import { useAppStore } from '../store/appStore';
import { GRID_MAJOR, GRID_SIZE, orderedShapes, useCanvasStore } from './model/canvasStore';
import { shapeBounds } from './model/geometry';

/** A4 sheets, margins and out-of-print-area markers (Page Layout mode). */
export function PageOverlay() {
  const mode = useAppStore((s) => s.settings.canvasMode);
  const orientation = useAppStore((s) => s.settings.pageOrientation);
  const shapesMap = useCanvasStore((s) => s.shapes);
  const isGrid = useCanvasStore((s) => s.isGrid);
  const zoom = useCanvasStore((s) => s.camera.z);
  const showChrome = useAppStore((s) => s.settings.showHeaderFooter);
  const order = useCanvasStore((s) => s.order);
  const shapes = useMemo(() => orderedShapes({ ...useCanvasStore.getState(), shapes: shapesMap, order }), [shapesMap, order]);
  const minPages = useAppStore((s) => s.settings.pages);
  // Paper and margins (page geometry reads them; these keep the overlay in step).
  const paper = useAppStore((s) => s.settings.paper);
  const margins = useAppStore((s) => s.settings.margins);
  const boundaries = useAppStore((s) => s.view.boundaries);
  const m = useMemo(() => marginPx(), [margins]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = useMemo(() => pageCount(shapes, orientation, minPages), [shapes, orientation, minPages, paper]); // eslint-disable-line react-hooks/exhaustive-deps
  const outside = useMemo(() => (mode === 'page' ? shapesOutsidePrintArea(shapes, orientation).map(shapeBounds) : []), [shapes, orientation, mode, paper, margins]); // eslint-disable-line react-hooks/exhaustive-deps
  if (mode !== 'page') return null;

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} aria-hidden>
      {Array.from({ length: pages }, (_, i) => {
        const b = pageBox(i, orientation);
        const line = 1 / zoom;
        const gridImage = `linear-gradient(var(--grid-major) ${line}px, transparent ${line}px), linear-gradient(90deg, var(--grid-major) ${line}px, transparent ${line}px), linear-gradient(var(--grid-minor) ${line}px, transparent ${line}px), linear-gradient(90deg, var(--grid-minor) ${line}px, transparent ${line}px)`;
        return (
          <div
            key={i}
            data-testid="page-sheet"
            style={{
              position: 'absolute',
              left: b.x,
              top: b.y,
              width: b.w,
              height: b.h,
              background: 'var(--color-paper)',
              // Google Docs page edge
              boxShadow: '0 0 0 0.75pt #d1d1d1, 0 0 3pt 0.75pt #ccc',
            }}
          >
            <div
              data-testid={isGrid ? 'page-grid' : undefined}
              style={{
                position: 'absolute',
                left: m.left,
                right: m.right,
                top: m.top,
                bottom: m.bottom,
                outline: boundaries ? '1px dashed var(--color-docs-blue)' : isGrid ? '1px solid var(--grid-major)' : undefined,
                // Engineering pad: 10 px minor / 40 px major (4 × 4) squares inside the print area.
                backgroundImage: isGrid ? gridImage : undefined,
                backgroundSize: isGrid ? `${GRID_MAJOR}px ${GRID_MAJOR}px, ${GRID_MAJOR}px ${GRID_MAJOR}px, ${GRID_SIZE}px ${GRID_SIZE}px, ${GRID_SIZE}px ${GRID_SIZE}px` : undefined,
              }}
            />
            {boundaries && <div data-testid="page-boundary" style={{ position: 'absolute', inset: 0, outline: '1px solid #9aa0a6' }} />}
            <MarginMarks m={m} />
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

/** Docs-style "L" marks at the four corners of the writable area. */
function MarginMarks({ m }: { m: { left: number; right: number; top: number; bottom: number } }) {
  const len = 14;
  const c = '#bdc1c6';
  const corner = (style: React.CSSProperties) => <div style={{ position: 'absolute', width: len, height: len, ...style }} />;
  return (
    <>
      {corner({ left: m.left - len, top: m.top - len, borderRight: `1px solid ${c}`, borderBottom: `1px solid ${c}` })}
      {corner({ right: m.right - len, top: m.top - len, borderLeft: `1px solid ${c}`, borderBottom: `1px solid ${c}` })}
      {corner({ left: m.left - len, bottom: m.bottom - len, borderRight: `1px solid ${c}`, borderTop: `1px solid ${c}` })}
      {corner({ right: m.right - len, bottom: m.bottom - len, borderLeft: `1px solid ${c}`, borderTop: `1px solid ${c}` })}
    </>
  );
}
