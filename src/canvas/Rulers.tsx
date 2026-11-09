/**
 * Millimetre rulers along the top and left edge of the canvas (Document → Ruler).
 * They use the same page-to-screen transform as the shapes (camera x, y, zoom),
 * so they follow zooming and scrolling; the vertical ruler restarts at 0 on each
 * page. Margins are shaded. Purely visual: no pointer events, no store writes.
 */
import { useEffect, useState } from 'react';
import { MM, PAGE_GAP, marginPx, pageSize } from '../export/pageGeometry';
import { useAppStore } from '../store/appStore';
import { useCanvasStore } from './model/canvasStore';

export const RULER = 18;

/** Tick spacing in mm so that minor ticks are at least ~5 screen px apart. */
function steps(pxPerMm: number): { minor: number; major: number } {
  for (const [minor, major] of [[1, 10], [2, 10], [5, 50], [10, 50], [20, 100], [50, 500]] as const) if (minor * pxPerMm >= 5) return { minor, major };
  return { minor: 100, major: 1000 };
}

export function Rulers() {
  const on = useAppStore((s) => s.view.ruler);
  const mode = useAppStore((s) => s.settings.canvasMode);
  const orientation = useAppStore((s) => s.settings.pageOrientation);
  useAppStore((s) => s.settings.paper);
  useAppStore((s) => s.settings.margins);
  const cam = useCanvasStore((s) => s.camera);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = host?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [host]);
  if (!on) return null;

  const z = cam.z;
  const pxPerMm = MM * z;
  const { minor, major } = steps(pxPerMm);
  const page = pageSize(orientation);
  const m = marginPx();
  const stride = page.h + PAGE_GAP;
  const toX = (x: number) => (x - cam.x) * z;
  const toY = (y: number) => (y - cam.y) * z;
  const paged = mode === 'page';

  // Horizontal: mm from the left paper edge (x = 0).
  const hTicks: { x: number; mm: number }[] = [];
  const firstMm = Math.floor((cam.x / MM) / minor) * minor;
  const lastMm = (cam.x + size.w / z) / MM;
  for (let mm = firstMm; mm <= lastMm; mm += minor) hTicks.push({ x: toX(mm * MM), mm });

  // Vertical: mm from the top of each page.
  const vTicks: { y: number; mm: number }[] = [];
  const y0 = cam.y;
  const y1 = cam.y + size.h / z;
  if (paged) {
    for (let p = Math.max(0, Math.floor(y0 / stride)); p * stride <= y1; p++) {
      const top = p * stride;
      const pageMm = page.h / MM;
      for (let mm = 0; mm <= pageMm; mm += minor) {
        const y = top + mm * MM;
        if (y >= y0 - 1 && y <= y1 + 1) vTicks.push({ y: toY(y), mm });
      }
    }
  } else {
    for (let mm = Math.floor(y0 / MM / minor) * minor; mm * MM <= y1; mm += minor) vTicks.push({ y: toY(mm * MM), mm });
  }
  const label = (mm: number) => Math.round(mm) % major === 0;
  const shade = 'rgb(0 0 0 / 0.07)';

  return (
    <div ref={setHost} aria-hidden data-testid="rulers" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
      <svg width={size.w} height={RULER} style={{ position: 'absolute', left: 0, top: 0, background: '#f8f9fa', borderBottom: '1px solid #dadce0' }} data-testid="ruler-h">
        {paged && (
          <>
            <rect x={toX(0)} y={0} width={m.left * z} height={RULER} fill={shade} />
            <rect x={toX(page.w - m.right)} y={0} width={m.right * z} height={RULER} fill={shade} />
          </>
        )}
        {hTicks.map((t) => (
          <g key={t.mm}>
            <line x1={t.x} x2={t.x} y1={label(t.mm) ? 4 : t.mm % (major / 2) === 0 ? 9 : 13} y2={RULER} stroke="#80868b" strokeWidth={1} />
            {label(t.mm) && (
              <text x={t.x + 2} y={10} fontSize={9} fill="#5f6368" fontFamily="var(--font-sans)">
                {Math.round(t.mm)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <svg width={RULER} height={size.h} style={{ position: 'absolute', left: 0, top: 0, background: '#f8f9fa', borderRight: '1px solid #dadce0' }} data-testid="ruler-v">
        {paged &&
          Array.from({ length: Math.max(0, Math.floor(y1 / stride) - Math.max(0, Math.floor(y0 / stride)) + 1) }, (_, k) => {
            const top = (Math.max(0, Math.floor(y0 / stride)) + k) * stride;
            return (
              <g key={top}>
                <rect x={0} y={toY(top)} width={RULER} height={m.top * z} fill={shade} />
                <rect x={0} y={toY(top + page.h - m.bottom)} width={RULER} height={m.bottom * z} fill={shade} />
                <rect x={0} y={toY(top + page.h)} width={RULER} height={PAGE_GAP * z} fill="#e8eaed" />
              </g>
            );
          })}
        {vTicks.map((t, i) => (
          <g key={i}>
            <line y1={t.y} y2={t.y} x1={label(t.mm) ? 4 : t.mm % (major / 2) === 0 ? 9 : 13} x2={RULER} stroke="#80868b" strokeWidth={1} />
            {label(t.mm) && (
              <text x={9} y={t.y + 2} fontSize={9} fill="#5f6368" fontFamily="var(--font-sans)" transform={`rotate(-90 9 ${t.y + 2})`}>
                {Math.round(t.mm)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div style={{ position: 'absolute', left: 0, top: 0, width: RULER, height: RULER, background: '#f1f3f4', borderRight: '1px solid #dadce0', borderBottom: '1px solid #dadce0' }} />
    </div>
  );
}
