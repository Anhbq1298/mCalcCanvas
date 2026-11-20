/** The report worksheet of one combination, drawn read-only as on the mCalcCanvas page (scaled to the column). */
import { memo, useLayoutEffect, useRef, useState } from 'react';
import { MathRenderer } from '../../math/MathRenderer';
import { SectionDrawing } from './charts';
import type { SheetView } from './sheetView';
import type { Shape } from './sections';

export const SheetPanel = memo(function SheetPanel({ view, shape, v }: { view: SheetView | null; shape: Shape; v: Record<string, number> }) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const scale = view && width ? Math.min(1, width / view.pageW) : 1;
  const stride = view ? view.pageH + view.gap : 0;
  return (
    <div ref={host} className="sheet-host" data-testid="sheet">
      {view && (
        <div style={{ height: (view.pages * stride - view.gap) * scale, position: 'relative' }}>
          <div className="sheet-pages" style={{ width: view.pageW, transform: `scale(${scale})` }} aria-readonly="true">
            {Array.from({ length: view.pages }, (_, i) => <div key={i} className="sheet-page" style={{ top: i * stride, width: view.pageW, height: view.pageH }} />)}
            {view.items.map((it) => {
              if (it.kind === 'text') {
                return <div key={it.id} className={`sheet-text ${it.heading ? `h${it.heading}` : ''}`} style={{ left: it.x, top: it.y, width: it.w, fontSize: it.fontSize, color: it.color, textAlign: it.align as 'left' }} dangerouslySetInnerHTML={{ __html: it.html }} />;
              }
              if (it.kind === 'math') {
                return (
                  <div key={it.id} className={`sheet-math ${it.error ? 'err' : ''}`} style={{ left: it.x, top: it.y, fontSize: it.fontSize, color: it.color }} title={it.error}>
                    <MathRenderer latex={it.latex} />
                    {it.check !== undefined && <span className={`sheet-check ${it.check ? 'pass' : 'fail'}`}>{it.check ? 'PASS' : 'FAIL'}</span>}
                  </div>
                );
              }
              if (it.kind === 'image') return <img key={it.id} className="sheet-img" src={it.src} alt="" style={{ left: it.x, top: it.y, width: it.w, height: it.h }} />;
              return <div key={it.id} className="sheet-graph" style={{ left: it.x, top: it.y, width: it.w, height: it.h }}><SectionDrawing shape={shape} v={v} /></div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
});
