/** Insert tab → Shapes: ready-made outlines and structural symbols with previews. */
import { Shapes } from 'lucide-react';
import { insertLibraryShape } from '../../canvas/canvasActions';
import { SHAPE_LIBRARY, type LibraryShape } from '../../canvas/shapeLibrary';
import { Popover } from './Popover';

/** Small SVG preview of a library shape, scaled to fit 40×32. */
function Thumb({ item }: { item: LibraryShape }) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of item.parts) {
    const pts: [number, number][] =
      p.type === 'draw' ? p.points : p.type === 'rect' ? [[p.x, p.y], [p.x + p.w, p.y + p.h]] : [[p.x, p.y], [p.x + p.x2, p.y + p.y2]];
    for (const [x, y] of pts) {
      xs.push(x);
      ys.push(y);
    }
  }
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0 || 1, h = Math.max(...ys) - y0 || 1;
  const pad = 6;
  const sw = 1.6 * (Math.max(w, h) / 28);
  return (
    <svg viewBox={`${x0 - pad} ${y0 - pad} ${w + 2 * pad} ${h + 2 * pad}`} width={40} height={32} aria-hidden>
      <defs>
        <marker id={`ah-${item.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
        </marker>
      </defs>
      <g fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        {item.parts.map((p, i) =>
          p.type === 'draw' ? (
            <polyline key={i} points={p.points.map((q) => q.join(',')).join(' ')} />
          ) : p.type === 'rect' ? (
            <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} />
          ) : (
            <line key={i} x1={p.x} y1={p.y} x2={p.x + p.x2} y2={p.y + p.y2} markerEnd={p.arrow ? `url(#ah-${item.id})` : undefined} />
          ),
        )}
      </g>
    </svg>
  );
}

export function ShapeGallery() {
  const groups = ['Basic', 'Structural', 'Steel'] as const;
  return (
    <Popover title="Insert a ready-made shape" testId="insert-shapes" big="Shapes" width={356} trigger={<Shapes size={24} strokeWidth={1.6} aria-hidden />}>
      {(close) => (
        <>
          {groups.map((g) => (
            <div key={g} className="mb-2 last:mb-0">
              <div className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-docs-muted">{g}</div>
              <div className="grid grid-cols-4 gap-1">
                {SHAPE_LIBRARY.filter((s) => s.group === g).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title={s.label}
                    aria-label={s.label}
                    data-testid={`shape-${s.id}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      insertLibraryShape(s.id);
                      close();
                    }}
                    className="flex cursor-pointer flex-col items-center gap-0.5 rounded py-1 text-[11px] text-docs-ink transition-colors duration-150 hover:bg-docs-hover"
                  >
                    <span className="text-[#1e3a5f]">
                      <Thumb item={s} />
                    </span>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="mt-1 border-t border-docs-border px-1 pt-1.5 text-[11px] leading-snug text-docs-muted">Placed at the + cross (or the view) as one group: move, copy or ungroup it like any shape.</p>
        </>
      )}
    </Popover>
  );
}
