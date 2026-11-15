/** Small SVG charts and drawings for mCompositeBeamDesign (no dependencies). */
import { useEffect, useRef, useState } from 'react';

/** Width of an element in CSS px, so SVG text is drawn at its real size. */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

import { C, fmt } from './format';

export interface Series { x: number[]; y: number[]; color: string; label: string; width?: number; dash?: boolean; fill?: boolean }

function ticks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** y of a series at x, linear between its points (x ascending). */
function yAt(s: Series, x: number): number {
  const { x: xs, y: ys } = s;
  if (!xs.length) return NaN;
  if (x <= xs[0]) return ys[0];
  for (let j = 1; j < xs.length; j++) if (x <= xs[j]) return xs[j] === xs[j - 1] ? ys[j] : ys[j - 1] + ((ys[j] - ys[j - 1]) * (x - xs[j - 1])) / (xs[j] - xs[j - 1]);
  return ys[ys.length - 1];
}

/**
 * Line chart over x; invertY draws positive values downwards (moments, deflections).
 * Pointer or arrow keys move a crosshair that reads every series at that x.
 */
export function LineChart({ series, height = 170, invertY = false, xUnit = 'm', yUnit = '', labels = [], label = 'Chart', digits = 1 }: { series: Series[]; height?: number; invertY?: boolean; xUnit?: string; yUnit?: string; labels?: { x: number; y: number; text: string; color: string }[]; label?: string; digits?: number }) {
  const [hx, setHx] = useState<number | null>(null);
  const [box, W] = useWidth(640);
  const H = height, m = { l: 48, r: 14, t: 12, b: 26 };
  const xs = series.flatMap((s) => s.x), ys = series.flatMap((s) => s.y).filter(Number.isFinite).concat(0);
  if (!xs.length) return <div ref={box} className="h-24 text-sm text-slate-500">No data</div>;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = (y1 - y0) * 0.12 || 1;
  y1 += pad; if (y0 < 0) y0 -= pad;
  const X = (v: number) => m.l + ((v - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const Y = (v: number) => (invertY ? m.t + ((v - y0) / (y1 - y0)) * (H - m.t - m.b) : H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b));
  const step = (x1 - x0) / 80 || 0.1;
  const clamp = (v: number) => Math.min(x1, Math.max(x0, v));
  const tip = hx === null ? null : series.map((s) => ({ s, y: yAt(s, hx) }));
  const tipX = hx === null ? 0 : X(hx), tipW = 150, tipH = 16 + 14 * series.length;
  const tipLeft = tipX + 10 + tipW > W - m.r ? tipX - 10 - tipW : tipX + 10;
  return (
    <div ref={box}>
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="chart block w-full touch-none select-none"
      role="img"
      aria-label={label}
      tabIndex={0}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * W;
        setHx(px < m.l || px > W - m.r ? null : clamp(x0 + ((px - m.l) / (W - m.l - m.r)) * (x1 - x0)));
      }}
      onPointerLeave={() => setHx(null)}
      onBlur={() => setHx(null)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          setHx((h) => clamp((h ?? (e.key === 'ArrowRight' ? x0 - step : x1 + step)) + (e.key === 'ArrowRight' ? step : -step)));
        } else if (e.key === 'Escape') setHx(null);
      }}
    >
      {ticks(y0, y1, H < 150 ? 3 : 5).map((t) => (
        <g key={`y${t}`}>
          <line x1={m.l} x2={W - m.r} y1={Y(t)} y2={Y(t)} stroke={C.rule} strokeDasharray="2 3" strokeWidth="0.7" />
          <text x={m.l - 6} y={Y(t) + 3.5} className="num" fontSize="10" textAnchor="end" fill={C.muted}>{t}</text>
        </g>
      ))}
      {ticks(x0, x1, W < 420 ? 4 : 8).map((t) => (
        <text key={`x${t}`} x={X(t)} y={H - 8} className="num" fontSize="10" textAnchor="middle" fill={C.muted}>{t}</text>
      ))}
      <line x1={m.l} x2={W - m.r} y1={Y(0)} y2={Y(0)} stroke={C.ink} strokeWidth="1" />
      <text x={6} y={m.t + 8} fontSize="10" fill={C.muted}>{yUnit}</text>
      <text x={W - m.r} y={H - 8} fontSize="10" textAnchor="end" fill={C.muted} dy="-12">{xUnit}</text>
      {series.map((s, i) => {
        const pts = s.x.map((v, j) => `${X(v).toFixed(1)},${Y(s.y[j]).toFixed(1)}`).join(' ');
        return (
          <g key={i}>
            {s.fill && <polygon points={`${X(s.x[0])},${Y(0)} ${pts} ${X(s.x[s.x.length - 1])},${Y(0)}`} fill={s.color} fillOpacity="0.08" />}
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth={s.width ?? 1.6} strokeDasharray={s.dash ? '6 4' : undefined} strokeLinejoin="round" />
          </g>
        );
      })}
      {labels.map((l, i) => (
        <g key={i}>
          <circle cx={X(l.x)} cy={Y(l.y)} r="3" fill={l.color} />
          <text x={X(l.x)} y={Y(l.y) + (invertY ? 14 : -7)} className="num" fontSize="10.5" fontWeight="600" textAnchor="middle" fill={l.color} paintOrder="stroke" stroke="#fff" strokeWidth="3">{l.text}</text>
        </g>
      ))}
      {tip && hx !== null && (
        <g pointerEvents="none">
          <line x1={tipX} x2={tipX} y1={m.t} y2={H - m.b} stroke="#64748b" strokeDasharray="3 3" />
          {tip.map(({ s, y }, i) => Number.isFinite(y) && <circle key={i} cx={tipX} cy={Y(y)} r="3.5" fill="#fff" stroke={s.color} strokeWidth="2" />)}
          <rect x={tipLeft} y={m.t} width={tipW} height={tipH} rx="4" fill={C.ink} fillOpacity="0.92" />
          <text x={tipLeft + 8} y={m.t + 13} fontSize="10.5" fill="#C3CBC8" className="num">{`x = ${fmt(hx, 2)} ${xUnit}`}</text>
          {tip.map(({ s, y }, i) => (
            <text key={i} x={tipLeft + 8} y={m.t + 27 + 14 * i} fontSize="10.5" fill="#fff" className="num">
              <tspan fill={s.color === C.blue ? '#8FA2FF' : s.color === C.red ? '#FF7B6E' : s.color === C.green ? '#5FD08F' : s.color}>■ </tspan>
              {`${s.label} ${fmt(y, digits)} ${yUnit}`}
            </text>
          ))}
        </g>
      )}
    </svg>
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: string; dash?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label}>
          <svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" stroke={it.color} strokeWidth="2.5" strokeDasharray={it.dash ? '4 3' : undefined} /></svg>
          {it.label}
        </span>
      ))}
    </div>
  );
}

export interface AreaLoad { x1: number; x2: number; p: number; q: boolean }
export interface PointLoad { a: number; F: number; q: boolean }

/* ── CAD-style load drawings ────────────────────────────────────────────────
 * Drawn like a structural GA sketch: hairline geometry, pinned and roller supports
 * with hatched ground, load arrays with a top line, chained dimensions with 45° ticks. */
const CAD = { geo: 1.4, load: 1, dim: 0.7, font: 11.5 };
const layer = (q: boolean) => (q ? C.q : C.blue);

/** Beam on a pin (A) and a roller (B), hatched ground under both. */
function Beam({ X0, X1, y }: { X0: number; X1: number; y: number }) {
  const hatch = (cx: number, gy: number) => (
    <g stroke={C.ink} strokeWidth={CAD.dim}>
      <line x1={cx - 14} x2={cx + 14} y1={gy} y2={gy} strokeWidth={CAD.geo} />
      {[-12, -6, 0, 6, 12].map((d) => <line key={d} x1={cx + d} y1={gy} x2={cx + d - 5} y2={gy + 5} />)}
    </g>
  );
  return (
    <g fill="none" stroke={C.ink}>
      <line x1={X0} x2={X1} y1={y} y2={y} strokeWidth={3} />
      <path d={`M${X0},${y + 1.5} l-8,13 h16 z`} strokeWidth={CAD.geo} fill={C.sheet} />
      {hatch(X0, y + 15)}
      <path d={`M${X1},${y + 1.5} l-8,11 h16 z`} strokeWidth={CAD.geo} fill={C.sheet} />
      <circle cx={X1 - 4} cy={y + 15} r="2" strokeWidth={CAD.dim} />
      <circle cx={X1 + 4} cy={y + 15} r="2" strokeWidth={CAD.dim} />
      {hatch(X1, y + 18)}
      <text x={X0} y={y - 6} textAnchor="end" dx="-6" fill={C.ink} stroke="none" fontSize={CAD.font} fontWeight="500">A</text>
      <text x={X1} y={y - 6} dx="6" fill={C.ink} stroke="none" fontSize={CAD.font} fontWeight="500">B</text>
    </g>
  );
}

/** A chain of dimensions at height y through the given stations (m), with extension lines up to yTop. */
function DimChain({ stations, X, y, yTop }: { stations: number[]; X: (v: number) => number; y: number; yTop: number }) {
  const st = [...new Set(stations.map((v) => Number(v.toFixed(4))))].sort((p, q) => p - q);
  return (
    <g stroke={C.muted} strokeWidth={CAD.dim} fill="none">
      <line x1={X(st[0])} x2={X(st[st.length - 1])} y1={y} y2={y} />
      {st.map((v) => (
        <g key={v}>
          <line x1={X(v)} x2={X(v)} y1={yTop} y2={y + 4} strokeDasharray="none" />
          <line x1={X(v) - 4} x2={X(v) + 4} y1={y + 4} y2={y - 4} strokeWidth={1.2} stroke={C.ink} />
        </g>
      ))}
      {st.slice(1).map((v, i) => {
        const mid = (X(st[i]) + X(v)) / 2, len = v - st[i];
        return X(v) - X(st[i]) > 26 ? (
          <text key={`t${v}`} x={mid} y={y - 4} textAnchor="middle" fill={C.ink} stroke="none" fontSize={CAD.font - 0.5} className="num">{fmt(len, 2)}</text>
        ) : null;
      })}
    </g>
  );
}

function useCad(L: number) {
  const [box, W] = useWidth(560);
  const X0 = 34, X1 = W - 34;
  const X = (v: number) => X0 + (Math.min(Math.max(v, 0), L) / (L || 1)) * (X1 - X0);
  return { box, W, X0, X1, X };
}

/** Uniformly distributed loads: one arrow array per table row, stacked above the beam. */
export function UdlDrawing({ L, area, sb }: { L: number; area: AreaLoad[]; sb: number }) {
  const { box, W, X0, X1, X } = useCad(L);
  const band = 36, lab = 15, rows = Math.max(area.length, 1);
  const beamY = 10 + rows * (band + lab) + 6;
  const chain = [...new Set([0, L, ...area.flatMap((a) => [a.x1, a.x2])].map((x) => Number(Math.min(Math.max(x, 0), L).toFixed(4))))];
  const H = beamY + (chain.length > 2 ? 72 : 52);
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Distributed loads: ${area.map((a) => `${a.q ? 'Q' : 'G'} ${fmt(a.p * sb, 2)} kN/m from ${fmt(a.x1, 2)} to ${fmt(a.x2, 2)} m`).join('; ') || 'none'}`}>
        {area.length === 0 && <text x={W / 2} y={beamY - 20} textAnchor="middle" fill={C.muted} fontSize={CAD.font}>No distributed loads</text>}
        {area.map((a, i) => {
          const top = 10 + i * (band + lab) + lab, bot = top + band - 4;
          const xa = X(Math.min(a.x1, a.x2)), xb = X(Math.max(a.x1, a.x2)), n = Math.max(2, Math.round((xb - xa) / 22));
          const col = layer(a.q);
          return (
            <g key={i} stroke={col} fill="none" strokeWidth={CAD.load}>
              <line x1={xa} x2={xb} y1={top} y2={top} strokeWidth={CAD.geo} />
              {Array.from({ length: n + 1 }, (_, k) => xa + ((xb - xa) * k) / n).map((x, k) => (
                <g key={k}>
                  <line x1={x} x2={x} y1={top} y2={bot - 5} />
                  <path d={`M${x - 3},${bot - 6} L${x},${bot} L${x + 3},${bot - 6} z`} fill={col} stroke="none" />
                </g>
              ))}
              <text x={xa} y={top - 4} fill={col} stroke="none" fontSize={CAD.font} fontWeight="500">
                {`${a.q ? 'Q' : 'G'}${i + 1}  ${fmt(a.p, 2)} kPa × ${fmt(sb, 2)} m = `}
                <tspan fontWeight="700" className="num">{`${fmt(a.p * sb, 2)} kN/m`}</tspan>
              </text>
            </g>
          );
        })}
        <Beam X0={X0} X1={X1} y={beamY} />
        {chain.length > 2 && <DimChain stations={chain} X={X} y={beamY + 44} yTop={beamY + 26} />}
        <DimChain stations={[0, L]} X={X} y={chain.length > 2 ? beamY + 64 : beamY + 44} yTop={chain.length > 2 ? beamY + 48 : beamY + 26} />
      </svg>
    </div>
  );
}

/** Point loads: arrows scaled to F, labelled, with a chained dimension to every load from A. */
export function PointDrawing({ L, points }: { L: number; points: PointLoad[] }) {
  const { box, W, X0, X1, X } = useCad(L);
  const beamY = 104, H = beamY + 72;
  const maxF = Math.max(1e-9, ...points.map((p) => Math.abs(p.F)));
  const groups = new Map<number, PointLoad[]>();
  points.forEach((p) => groups.set(p.a, [...(groups.get(p.a) ?? []), p]));
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Point loads: ${points.map((p) => `${p.q ? 'Q' : 'G'} ${fmt(p.F, 1)} kN at ${fmt(p.a, 2)} m`).join('; ') || 'none'}`}>
        {points.length === 0 && <text x={W / 2} y={beamY - 30} textAnchor="middle" fill={C.muted} fontSize={CAD.font}>No point loads</text>}
        {[...groups.entries()].map(([a, ps], gi) =>
          ps.map((p, j) => {
            const len = 30 + 52 * (Math.abs(p.F) / maxF);
            const x = X(a) + (j - (ps.length - 1) / 2) * 12;
            const col = layer(p.q);
            const right = j >= (ps.length - 1) / 2;
            return (
              <g key={`${gi}-${j}`} stroke={col} fill="none">
                <line x1={x} x2={x} y1={beamY - 2 - len} y2={beamY - 9} strokeWidth={1.6} />
                <path d={`M${x - 4},${beamY - 11} L${x},${beamY - 2} L${x + 4},${beamY - 11} z`} fill={col} stroke="none" />
                <text x={x + (ps.length > 1 ? (right ? 5 : -5) : 0)} y={beamY - 6 - len} textAnchor={ps.length > 1 ? (right ? 'start' : 'end') : 'middle'} fill={col} stroke="none" fontSize={CAD.font} fontWeight="500">
                  {`${p.q ? 'Q' : 'G'} `}<tspan fontWeight="700" className="num">{`${fmt(p.F, 1)} kN`}</tspan>
                </text>
              </g>
            );
          }),
        )}
        <Beam X0={X0} X1={X1} y={beamY} />
        <DimChain stations={[0, L, ...points.map((p) => p.a)]} X={X} y={beamY + 44} yTop={beamY + 26} />
        <DimChain stations={[0, L]} X={X} y={beamY + 64} yTop={beamY + 48} />
      </svg>
    </div>
  );
}

/**
 * Composite section to scale (slab b_eff × h_c over the I section). With showPna, the plastic
 * stress block beside it. Drawn in a ~300 unit wide box so its text keeps its real size in a card.
 */
export function SectionDrawing({ r, showPna }: { r: Record<string, number>; showPna: boolean }) {
  const { h_a, b_a, t_f, t_w, h_c, b_eff } = r;
  if (![h_a, b_a, t_f, t_w, h_c, b_eff].every(Number.isFinite)) return null;
  const W = 300, H = 236, top = 22;
  const room = showPna ? 150 : 250; // width available for the slab
  const total = h_c + h_a;
  const sc = Math.min(190 / total, (room * 0.62) / b_a);
  const cx = showPna ? 84 : W / 2;
  const broken = b_eff * sc > room;
  const slabW = Math.min(b_eff * sc, room);
  const Y = (mm: number) => top + mm * sc;
  const xa = cx - (b_a * sc) / 2;
  const kM = r.kM, xc = showPna ? (kM === 0 ? r.xf : r.xc) : NaN, ya = r.ya;
  const sx = cx + slabW / 2 + 18, w = 22, lx = sx + w + 6;
  const pnaY = kM >= 1 ? Y(h_c + ya) : Y(h_c);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-[22rem]" role="img" aria-label={showPna ? `Plastic stress block, concrete depth ${fmt(xc, 1)} mm` : 'Composite section'} style={{ fontSize: 11 }}>
      <rect x={cx - slabW / 2} y={Y(0)} width={slabW} height={h_c * sc} fill={C.concrete} stroke={C.muted} />
      {broken && [cx - slabW / 2, cx + slabW / 2].map((x, i) => (
        <path key={i} d={`M${x},${Y(0) - 4} l${i ? 4 : -4},${(h_c * sc) / 3 + 4} l${i ? -8 : 8},${(h_c * sc) / 3} l${i ? 4 : -4},${(h_c * sc) / 3 + 4}`} fill="none" stroke={C.muted} strokeWidth="1.2" />
      ))}
      <path
        d={`M${xa},${Y(h_c)} h${b_a * sc} v${t_f * sc} h${-(b_a - t_w) * sc / 2} V${Y(h_c + h_a - t_f)} h${(b_a - t_w) * sc / 2} v${t_f * sc} h${-b_a * sc} v${-t_f * sc} h${(b_a - t_w) * sc / 2} V${Y(h_c + t_f)} h${-(b_a - t_w) * sc / 2} z`}
        fill="#E3E8E6" stroke={C.ink} strokeWidth="1.2"
      />
      {showPna && Number.isFinite(xc) && <rect x={cx - slabW / 2} y={Y(0)} width={slabW} height={Math.min(xc, h_c) * sc} fill={C.blue} fillOpacity="0.28" />}
      {showPna && kM >= 1 && Number.isFinite(ya) && <line x1={cx - slabW / 2} x2={sx + w} y1={pnaY} y2={pnaY} stroke={C.red} strokeWidth="1.5" strokeDasharray="5 3" />}
      {showPna && Number.isFinite(xc) && (
        <g>
          <rect x={sx} y={Y(0)} width={w} height={Math.min(xc, h_c) * sc} fill={C.blue} fillOpacity="0.4" />
          <text x={lx} y={Y(0) + 9} fill={C.blue}>0.85 f<tspan fontSize="8" dy="2">cd</tspan></text>
          <text x={lx} y={Y(0) + 23} fill={C.blue}>{`x = ${fmt(xc, 1)} mm`}</text>
          {kM >= 1 && <rect x={sx} y={Y(h_c)} width={w} height={Math.max(0, pnaY - Y(h_c))} fill={C.red} fillOpacity="0.4" />}
          <rect x={sx} y={pnaY} width={w} height={Y(h_c + h_a) - pnaY} fill={C.green} fillOpacity="0.32" />
          {kM >= 1 && <text x={lx} y={Math.max(pnaY + 4, Y(0) + 38)} fill={C.red}>{`PNA ${fmt(ya, 1)} mm`}</text>}
          {kM >= 1 && <text x={lx} y={Math.max(pnaY + 17, Y(0) + 51)} fill={C.red}>below steel top</text>}
          <text x={lx} y={Y(h_c + h_a) - 18} fill={C.green}>f<tspan fontSize="8" dy="2">yd</tspan></text>
          <text x={lx} y={Y(h_c + h_a) - 4} fill={C.green}>tension</text>
        </g>
      )}
      <text x={cx} y={13} textAnchor="middle" fill={C.muted}>{`b_eff = ${fmt(b_eff, 0)} mm${broken ? ' (cut)' : ''}`}</text>
      <text x={cx - slabW / 2 + 6} y={Y(h_c / 2) + 4} fill={C.ink}>{`h_c = ${fmt(h_c, 0)}`}</text>
      <text x={cx + (t_w * sc) / 2 + 5} y={Y(h_c + h_a / 2)} fill={C.muted}>{`h_a = ${fmt(h_a, 1)}`}</text>
    </svg>
  );
}
