/** Small SVG charts and drawings for mCompositeBeamDesign (no dependencies). */
import { useEffect, useId, useRef, useState } from 'react';

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
import { Rich, SvgRich } from './rich';

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
          <text x={tipLeft + 8} y={m.t + 13} fontSize="10.5" fill="#C3CBC8" className="num"><SvgRich text={`x = ${fmt(hx, 2)} ${xUnit}`} size={10.5} /></text>
          {tip.map(({ s, y }, i) => (
            <text key={i} x={tipLeft + 8} y={m.t + 27 + 14 * i} fontSize="10.5" fill="#fff" className="num">
              <tspan fill={s.color === C.blue ? '#8FA2FF' : s.color === C.red ? '#FF7B6E' : s.color === C.green ? '#5FD08F' : s.color}>■ </tspan>
              <SvgRich text={`${s.label} ${fmt(y, digits)} ${yUnit}`} size={10.5} />
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
          <Rich text={it.label} />
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
  const groups = new Map<number, PointLoad[]>();
  points.forEach((p) => groups.set(p.a, [...(groups.get(p.a) ?? []), p]));
  const maxT = Math.max(1e-9, ...[...groups.values()].map((ps) => ps.reduce((t, p) => t + Math.abs(p.F), 0)));
  const stack = Math.max(1, ...[...groups.values()].map((ps) => ps.length));
  const beamY = 92 + 14 * stack, H = beamY + 72;
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Point loads: ${points.map((p) => `${p.q ? 'Q' : 'G'} ${fmt(p.F, 1)} kN at ${fmt(p.a, 2)} m`).join('; ') || 'none'}`}>
        {points.length === 0 && <text x={W / 2} y={beamY - 30} textAnchor="middle" fill={C.muted} fontSize={CAD.font}>No point loads</text>}
        {[...groups.entries()].map(([a, ps], gi) => {
          // Loads at the same position share one arrow on the exact station; labels stack, Q above G.
          const x = X(a), total = ps.reduce((t, p) => t + Math.abs(p.F), 0);
          const len = 30 + 52 * Math.min(1, total / maxT);
          const col = ps.length === 1 ? layer(ps[0].q) : C.ink;
          const sorted = [...ps].sort((p, q) => Number(p.q) - Number(q.q));
          return (
            <g key={gi}>
              <line x1={x} x2={x} y1={beamY - 2 - len} y2={beamY - 9} stroke={col} strokeWidth={1.6} />
              <path d={`M${x - 4},${beamY - 11} L${x},${beamY - 2} L${x + 4},${beamY - 11} z`} fill={col} />
              {sorted.map((p, j) => (
                <text key={j} x={x} y={beamY - 7 - len - 14 * j} textAnchor="middle" fill={layer(p.q)} fontSize={CAD.font} fontWeight="500">
                  {`${p.q ? 'Q' : 'G'} `}<tspan fontWeight="700" className="num">{`${fmt(p.F, 1)} kN`}</tspan>
                </text>
              ))}
            </g>
          );
        })}
        <Beam X0={X0} X1={X1} y={beamY} />
        <DimChain stations={[0, L, ...points.map((p) => p.a)]} X={X} y={beamY + 44} yTop={beamY + 26} />
        <DimChain stations={[0, L]} X={X} y={beamY + 64} yTop={beamY + 48} />
      </svg>
    </div>
  );
}

/**
 * Plastic stress block at x_M, drawn as a CAD section: hatched concrete (AR-CONC) and steel (ANSI31),
 * break lines on a wide slab, chained level dimensions, a centre-line PNA, and the rectangular
 * stress diagram (compression left of the zero axis, tension right) with its values.
 * Partial interaction gives two neutral axes: the concrete is stressed to x_c, the steel PNA is y_a
 * below the steel top (worksheet §EC4 6.2.1.3, k_M = 0 slab, 1 flange, 2 fillet, 3 web).
 */
export function SectionDrawing({ r }: { r: Record<string, number>; showPna?: boolean }) {
  const [box, W] = useWidth(520);
  const uid = useId().replace(/:/g, '');
  const { h_a, b_a, t_f, t_w, h_c, b_eff } = r;
  if (![h_a, b_a, t_f, t_w, h_c, b_eff].every(Number.isFinite)) return <div ref={box} />;
  const kM = r.kM, xc = Math.min(r.xc, h_c), ya = kM >= 1 ? r.ya : 0;
  const H = 292, top = 36, depth = 220;
  const total = h_c + h_a;
  const room = Math.min(200, W * 0.36);
  const sc = Math.min(depth / total, (room * 0.6) / b_a);
  const dimX = 34, cx = dimX + 26 + room / 2;
  const broken = b_eff * sc > room;
  const slabW = Math.min(b_eff * sc, room), sL = cx - slabW / 2, sR = cx + slabW / 2;
  const Y = (mm: number) => top + mm * sc;
  const xa = cx - (b_a * sc) / 2, bf = b_a * sc, tw2 = (t_w * sc) / 2;
  const bw = 44, axis = Math.max(sR + 40 + bw, cx + room / 2 + 40 + bw), lx = axis + bw + 12;
  const yPna = kM >= 1 ? Y(h_c + ya) : Y(xc);
  const steel = `M${xa},${Y(h_c)} h${bf} v${t_f * sc} H${cx + tw2} V${Y(total - t_f)} H${xa + bf} v${t_f * sc} h${-bf} v${-t_f * sc} H${cx - tw2} V${Y(h_c + t_f)} H${xa} z`;
  const brk = (x: number, dir: number) => {
    const y0 = Y(0) - 5, y1 = Y(h_c) + 5, m = (y0 + y1) / 2;
    return `M${x},${y0} V${m - 6} l${3 * dir},3 l${-6 * dir},6 l${3 * dir},3 V${y1}`;
  };
  // labels on the right of the stress diagram, pushed apart so they never overlap
  const labels: { y: number; lines: [string, string, string][]; color: string }[] = [
    { y: (Y(0) + Y(xc)) / 2, lines: [['0.85 f', 'cd', ''], ['N', 'c', ` = ${fmt(r.Nc, 0)} kN`], ['x', 'c', ` = ${fmt(xc, 1)} mm`]], color: C.blue },
    ...(kM >= 1 ? [{ y: (Y(h_c) + yPna) / 2, lines: [['f', 'yd', ''], ['compression', '', '']] as [string, string, string][], color: C.blue }] : []),
    { y: (yPna + Y(total)) / 2, lines: [['f', 'yd', ''], ['tension', '', '']], color: C.red },
  ];
  let last = -Infinity;
  for (const l of labels) { l.y = Math.max(l.y - 6, last + 16); last = l.y + 13 * (l.lines.length - 1); }
  const vdim = (x: number, a: number, b: number, text: string, side = -1) => (
    <g key={`${x}${a}`} stroke={C.muted} strokeWidth={CAD.dim}>
      <line x1={x} x2={x} y1={a} y2={b} />
      {[a, b].map((y) => <line key={y} x1={x - 4} x2={x + 4} y1={y + 4} y2={y - 4} stroke={C.ink} strokeWidth={1.2} />)}
      <text x={x + side * 5} y={(a + b) / 2} transform={`rotate(-90 ${x + side * 5} ${(a + b) / 2})`} textAnchor="middle" fill={C.ink} stroke="none" fontSize={CAD.font - 1} className="num"><SvgRich text={text} size={CAD.font - 1} /></text>
    </g>
  );
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Plastic stress block at x_M: concrete stressed to ${fmt(xc, 1)} mm, ${kM >= 1 ? `steel PNA ${fmt(ya, 1)} mm below the steel top` : 'PNA in the slab'}`}>
        <defs>
          <pattern id={`${uid}c`} width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="4" r="0.7" fill={C.muted} /><circle cx="10" cy="10" r="0.6" fill={C.muted} /><path d="M9,2 l2.2,3.4 h-4.4 z M2,9.5 l1.8,2.8 h-3.6 z" fill="none" stroke={C.muted} strokeWidth="0.5" />
          </pattern>
          <pattern id={`${uid}s`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke={C.ink} strokeWidth="0.45" /></pattern>
          <pattern id={`${uid}b`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke={C.blue} strokeWidth="0.8" /></pattern>
          <pattern id={`${uid}r`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="5" stroke={C.red} strokeWidth="0.8" /></pattern>
        </defs>

        {/* b_eff */}
        <g stroke={C.muted} strokeWidth={CAD.dim}>
          <line x1={sL} x2={sR} y1={top - 14} y2={top - 14} />
          {[sL, sR].map((x) => <g key={x}><line x1={x} x2={x} y1={top - 20} y2={top - 3} /><line x1={x - 4} x2={x + 4} y1={top - 10} y2={top - 18} stroke={C.ink} strokeWidth={1.2} /></g>)}
          <text x={cx} y={top - 18} textAnchor="middle" fill={C.ink} stroke="none" fontSize={CAD.font - 1} className="num"><SvgRich text={`b_eff = ${fmt(b_eff, 0)}${broken ? ' (broken)' : ''}`} size={CAD.font - 1} /></text>
        </g>

        {/* section */}
        <rect x={sL} y={Y(0)} width={slabW} height={h_c * sc} fill={`url(#${uid}c)`} stroke={C.ink} strokeWidth={CAD.geo} />
        {broken && <><path d={brk(sL, -1)} fill={C.sheet} stroke={C.ink} strokeWidth={CAD.dim} /><path d={brk(sR, 1)} fill={C.sheet} stroke={C.ink} strokeWidth={CAD.dim} /></>}
        <path d={steel} fill={`url(#${uid}s)`} stroke={C.ink} strokeWidth={CAD.geo} />

        {/* level dimensions */}
        {[Y(0), Y(h_c), Y(total)].map((y) => <line key={y} x1={dimX - 6} x2={sL - 4} y1={y} y2={y} stroke={C.muted} strokeWidth={CAD.dim} />)}
        {vdim(dimX, Y(0), Y(h_c), `h_c ${fmt(h_c, 0)}`)}
        {vdim(dimX, Y(h_c), Y(total), `h_a ${fmt(h_a, 1)}`)}

        {/* extension lines to the stress diagram */}
        {[Y(0), Y(h_c), Y(total)].map((y) => <line key={`e${y}`} x1={Math.max(sR, xa + bf) + 4} x2={axis + bw} y1={y} y2={y} stroke={C.rule} strokeWidth={CAD.dim} strokeDasharray="3 2" />)}

        {/* stress diagram */}
        <rect x={axis - bw} y={Y(0)} width={bw} height={Y(xc) - Y(0)} fill={`url(#${uid}b)`} stroke={C.blue} strokeWidth={1} />
        {kM >= 1 && <rect x={axis - bw} y={Y(h_c)} width={bw} height={Math.max(0.8, yPna - Y(h_c))} fill={`url(#${uid}b)`} stroke={C.blue} strokeWidth={1} />}
        <rect x={axis} y={Math.max(yPna, Y(h_c))} width={bw} height={Y(total) - Math.max(yPna, Y(h_c))} fill={`url(#${uid}r)`} stroke={C.red} strokeWidth={1} />
        <line x1={axis} x2={axis} y1={Y(0) - 8} y2={Y(total) + 8} stroke={C.ink} strokeWidth={CAD.geo} />
        <text x={axis - bw / 2} y={Y(total) + 18} textAnchor="middle" fill={C.blue} fontSize={CAD.font - 1.5}>C</text>
        <text x={axis + bw / 2} y={Y(total) + 18} textAnchor="middle" fill={C.red} fontSize={CAD.font - 1.5}>T</text>
        {xc < h_c - 0.5 && vdim(axis - bw - 10, Y(0), Y(xc), '', -1)}

        {/* PNA, centre line */}
        <line x1={dimX - 10} x2={axis + bw + 6} y1={yPna} y2={yPna} stroke={C.red} strokeWidth={0.9} strokeDasharray="10 3 2 3" />
        <text x={dimX + 8} y={yPna - 4} fill={C.red} fontSize={CAD.font - 0.5} fontWeight="700">PNA</text>
        {kM >= 1 && <text x={dimX + 8} y={yPna + 13} fill={C.red} fontSize={CAD.font - 1.5} className="num">y<tspan fontSize={CAD.font - 4} dy="3">a</tspan><tspan dy="-3">{` ${fmt(ya, 1)}`}</tspan></text>}

        {/* values */}
        {labels.map((l, i) => (
          <g key={i} fill={l.color} fontSize={CAD.font}>
            {l.lines.map(([t, sub, tail], j) => (
              <text key={j} x={lx} y={l.y + 13 * j} fontWeight={j ? 400 : 700} className={j ? 'num' : ''}>
                {t}{sub && <tspan fontSize={CAD.font - 3} dy="3">{sub}</tspan>}{tail && <tspan dy={sub ? -3 : 0}>{tail}</tspan>}
              </text>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
