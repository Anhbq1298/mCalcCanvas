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

export interface Series { x: number[]; y: number[]; color: string; label: string; width?: number; dash?: boolean; fill?: boolean; marker?: boolean }

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
export function LineChart({ alignBeam = false, series, height = 170, invertY = false, xUnit = 'm', yUnit = '', labels = [], label = 'Chart', digits = 1, xName = 'x', xDigits = 2, yMin }: { alignBeam?: boolean; series: Series[]; height?: number; invertY?: boolean; xUnit?: string; yUnit?: string; labels?: { x: number; y: number; text: string; color: string }[]; label?: string; digits?: number; xName?: string; xDigits?: number; yMin?: number }) {
  const [hx, setHx] = useState<number | null>(null);
  const [box, W] = useWidth(640);
  const H = height, m = { l: alignBeam ? 34 : 48, r: alignBeam ? 34 : 14, t: 12, b: 26 };
  const xs = series.flatMap((s) => s.x), ys = series.flatMap((s) => s.y).filter(Number.isFinite).concat(0);
  if (!xs.length) return <div ref={box} className="h-24 text-sm text-slate-500">No data</div>;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = yMin ?? Math.min(...ys), y1 = Math.max(...ys);
  const pad = (y1 - y0) * 0.12 || 1;
  y1 += pad; if (y0 < 0 && yMin === undefined) y0 -= pad;
  const X = (v: number) => m.l + ((v - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const Y = (v: number) => (invertY ? m.t + ((v - y0) / (y1 - y0)) * (H - m.t - m.b) : H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b));
  const step = (x1 - x0) / 80 || 0.1;
  const clamp = (v: number) => Math.min(x1, Math.max(x0, v));
  const tip = hx === null ? null : series.filter((s) => !s.marker).map((s) => ({ s, y: yAt(s, hx) }));
  const tipX = hx === null ? 0 : X(hx), tipW = 150, tipH = 16 + 14 * (tip?.length ?? 0);
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
          <text x={X(l.x)} y={Y(l.y) + (invertY ? 14 : -7)} className="num" fontSize="10.5" fontWeight="600" textAnchor="middle" fill={l.color} paintOrder="stroke" stroke="#fff" strokeWidth="3"><SvgRich text={l.text} size={10.5} /></text>
        </g>
      ))}
      {tip && hx !== null && (
        <g pointerEvents="none">
          <line x1={tipX} x2={tipX} y1={m.t} y2={H - m.b} stroke="#64748b" strokeDasharray="3 3" />
          {tip.map(({ s, y }, i) => Number.isFinite(y) && <circle key={i} cx={tipX} cy={Y(y)} r="3.5" fill="#fff" stroke={s.color} strokeWidth="2" />)}
          <rect x={tipLeft} y={m.t} width={tipW} height={tipH} rx="4" fill={C.ink} fillOpacity="0.92" />
          <text x={tipLeft + 8} y={m.t + 13} fontSize="10.5" fill="#C3CBC8" className="num"><SvgRich text={`${xName} = ${fmt(hx, xDigits)} ${xUnit}`} size={10.5} /></text>
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
          <span><Rich text={it.label} /></span>
        </span>
      ))}
    </div>
  );
}

export interface AreaLoad { x1: number; x2: number; p: number; q: boolean; gF?: number }
export interface PointLoad { a: number; F: number; q: boolean; gF?: number }

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
export function UdlDrawing({ L, area, sb, sw }: { L: number; area: AreaLoad[]; sb: number; sw?: { ga: number; gc: number; gF?: number } }) {
  const { box, W, X0, X1, X } = useCad(L);
  // self-weight first (steel + slab, always full span, fixed ULS factor γ_G,sw), then one row per table load
  const swRow = sw && Number.isFinite(sw.ga + sw.gc) ? 1 : 0;
  const band = 36, lab = 18, rows = Math.max(area.length + swRow, 1);
  const beamY = 10 + rows * (band + lab) + 6;
  const chain = [...new Set([0, L, ...area.flatMap((a) => [a.x1, a.x2])].map((x) => Number(Math.min(Math.max(x, 0), L).toFixed(4))))];
  const H = beamY + (chain.length > 2 ? 72 : 52);
  const arrows = (xa: number, xb: number, top: number, bot: number, col: string, dash?: string) => {
    const n = Math.max(2, Math.round((xb - xa) / 22));
    return (
      <>
        <line x1={xa} x2={xb} y1={top} y2={top} strokeWidth={CAD.geo} strokeDasharray={dash} />
        {Array.from({ length: n + 1 }, (_, k) => xa + ((xb - xa) * k) / n).map((x, k) => (
          <g key={k}>
            <line x1={x} x2={x} y1={top} y2={bot - 5} strokeDasharray={dash} />
            <path d={`M${x - 3},${bot - 6} L${x},${bot} L${x + 3},${bot - 6} z`} fill={col} stroke="none" />
          </g>
        ))}
      </>
    );
  };
  const sub = (t: string) => <tspan fontSize={CAD.font * 0.72} dy="3">{t}</tspan>;
  const up = (t: string) => <tspan dy="-3">{t}</tspan>;
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Distributed loads: ${swRow ? `self-weight ${fmt(sw!.ga + sw!.gc, 2)} kN/m; ` : ''}${area.map((a) => `${a.q ? 'Q' : 'G'} ${fmt(a.p * sb, 2)} kN/m from ${fmt(a.x1, 2)} to ${fmt(a.x2, 2)} m`).join('; ') || 'no table loads'}`}>
        {swRow === 1 && (() => {
          const top = 10 + lab, bot = top + band - 4;
          return (
            <g stroke={C.grey} fill="none" strokeWidth={CAD.load}>
              {arrows(X(0), X(L), top, bot, C.grey, '4 2')}
              <text x={X(0)} y={top - 7} fill={C.grey} stroke="none" fontSize={CAD.font} fontWeight="500">
                SW  g{sub('a')}{up(` ${fmt(sw!.ga, 2)} steel + g`)}{sub('c')}{up(` ${fmt(sw!.gc, 2)} slab = `)}
                <tspan fontWeight="700" className="num">{`${fmt(sw!.ga + sw!.gc, 2)} kN/m`}</tspan>
                {'  ULS γ'}{sub('G,sw')}{up(` ${fmt(sw!.gF ?? NaN, 2)} fixed → ${fmt((sw!.gF ?? NaN) * (sw!.ga + sw!.gc), 2)} kN/m`)}
              </text>
            </g>
          );
        })()}
        {area.length + swRow === 0 && <text x={W / 2} y={beamY - 20} textAnchor="middle" fill={C.muted} fontSize={CAD.font}>No distributed loads</text>}
        {area.map((a, i) => {
          const top = 10 + (i + swRow) * (band + lab) + lab, bot = top + band - 4;
          const col = layer(a.q);
          return (
            <g key={i} stroke={col} fill="none" strokeWidth={CAD.load}>
              {arrows(X(Math.min(a.x1, a.x2)), X(Math.max(a.x1, a.x2)), top, bot, col)}
              <text x={X(Math.min(a.x1, a.x2))} y={top - 7} fill={col} stroke="none" fontSize={CAD.font} fontWeight="500">
                {`${a.q ? 'Q' : 'G'}${i + 1}  ${fmt(a.p, 2)} kPa × ${fmt(sb, 2)} m = `}
                <tspan fontWeight="700" className="num">{`${fmt(a.p * sb, 2)} kN/m`}</tspan>
                {Number.isFinite(a.gF) && <>{'  ULS γ'}{sub('F')}{up(` ${fmt(a.gF!, 2)} → ${fmt(a.gF! * a.p * sb, 2)} kN/m`)}</>}
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
                  {Number.isFinite(p.gF) && <>{'  ×'}<tspan className="num">{fmt(p.gF!, 2)}</tspan></>}
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
 * Open trapezoidal deck, schematic: concrete ribs of mean width br at pitch er sit on the flange, one centred on c.
 * Returns the voids under the crests between the ribs as quads [x, y], y up from the flange, covering xa … xb.
 */
function deckVoids(xa: number, xb: number, c: number, hp: number, br: number, er: number, reentrant = false): [number, number][][] {
  if (!(hp > 0 && er > 0 && br > 0 && br < er)) return [];
  if (reentrant) {
    // dovetail rib between the flat pans: wide at the top (e_r − b_r), narrow neck on the flange
    const bt = er - br, neck = 0.45 * bt, q: [number, number][][] = [];
    for (let k = Math.floor((xa - c) / er) - 1; c + k * er < xb + er; k++) {
      const x = c + (k + 0.5) * er;
      q.push([[x - neck / 2, 0], [x - bt / 2, hp], [x + bt / 2, hp], [x + neck / 2, 0]]);
    }
    return q;
  }
  const t = Math.min(0.15 * hp, ((er - br) / 2) * 0.6);
  const out: [number, number][][] = [];
  for (let k = Math.floor((xa - c) / er) - 1; c + k * er < xb + er; k++) {
    const x0 = c + k * er, x1 = x0 + er;
    out.push([[x0 + br / 2 - t, 0], [x0 + br / 2 + t, hp], [x1 - br / 2 - t, hp], [x1 - br / 2 + t, 0]]);
  }
  return out;
}

/** x of the side of a concrete rib (centred on 0) at the flange and at the crest, as deckVoids draws it. */
function ribSide(hp: number, br: number, er: number, reentrant: boolean): [number, number] {
  if (reentrant) return [er / 2 - (0.45 * (er - br)) / 2, br / 2];
  const t = Math.min(0.15 * hp, ((er - br) / 2) * 0.6);
  return [br / 2 - t, br / 2 + t];
}

/** Centre level of the bottom transverse bars above the flange: on the deck crest (or the soffit) plus the cover. */
const bottomBarLevel = (r: Record<string, number>) => (r.hpe > 0 ? r.hpe : 0) + (Number.isFinite(r.cb) ? r.cb : 20) + (Number.isFinite(r.dsb) ? r.dsb : 10) / 2;

/** Deck profile with its dimensions (two pitches, a stud in the first rib), for the Define deck dialog. */
export function DeckProfile({ hc, hp, br, er, hsc, dsc, nr, reentrant = false }: { hc: number; hp: number; br: number; er: number; hsc: number; dsc: number; nr: number; reentrant?: boolean }) {
  const [box, W] = useWidth(420);
  const uid = useId().replace(/:/g, '');
  if (![hc, hp, br, er, hsc].every((v) => Number.isFinite(v) && v > 0) || hp >= hc) return <div ref={box} />;
  const len = 2 * er, k = Math.min((W - 110) / len, 120 / hc), x0 = 64, top = 26;
  const X = (x: number) => x0 + x * k, Y = (y: number) => top + (hc - y) * k; // y up from the flange
  const voids = deckVoids(0, len, er / 2, hp, br, er, reentrant);
  const H = Y(0) + 46, ink = C.ink;
  const d = Math.max(3, (Number.isFinite(dsc) ? dsc : 19) * k);
  const studs = nr >= 2 ? [er / 2 - br / 4, er / 2 + br / 4] : [er / 2];
  const tick = (x: number, y: number) => <line key={`${x}${y}`} x1={x - 4} x2={x + 4} y1={y + 4} y2={y - 4} stroke={ink} strokeWidth={1.2} />;
  const txt = (x: number, y: number, t: string, anchor: 'middle' | 'end' | 'start' = 'middle') => <text x={x} y={y} textAnchor={anchor} fill={ink} stroke="none" fontSize={CAD.font - 1} className="num"><SvgRich text={t} size={CAD.font - 1} /></text>;
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Deck profile: depth ${fmt(hp, 0)} mm, rib width ${fmt(br, 0)} mm, pitch ${fmt(er, 0)} mm, slab ${fmt(hc, 0)} mm overall`}>
        <defs><clipPath id={`${uid}k`}><rect x={X(0)} y={top - 2} width={len * k} height={hc * k + 4} /></clipPath></defs>
        <rect x={X(0)} y={Y(hc)} width={len * k} height={hc * k} fill="#EEF1EF" stroke="#B3BCC1" strokeWidth={0.5} />
        <g clipPath={`url(#${uid}k)`}>
          {voids.map((q, i) => <polygon key={i} points={q.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')} fill={C.sheet} stroke={ink} strokeWidth={CAD.geo} strokeLinejoin="round" />)}
        </g>
        <line x1={X(0)} x2={X(len)} y1={Y(0)} y2={Y(0)} stroke={ink} strokeWidth={CAD.geo} />
        {studs.map((x) => (
          <g key={x} fill="#C8CBC3" stroke={ink} strokeWidth={0.8}>
            <rect x={X(x) - d / 2} y={Y(hsc - 10)} width={d} height={(hsc - 10) * k} />
            <rect x={X(x) - d * 0.85} y={Y(hsc)} width={d * 1.7} height={10 * k} />
          </g>
        ))}
        <g stroke={C.muted} strokeWidth={CAD.dim}>
          {/* pitch */}
          <line x1={X(er / 2)} x2={X(1.5 * er)} y1={Y(0) + 30} y2={Y(0) + 30} />
          {[er / 2, 1.5 * er].map((x) => <g key={x}><line x1={X(x)} x2={X(x)} y1={Y(0) + 4} y2={Y(0) + 35} />{tick(X(x), Y(0) + 30)}</g>)}
          {txt(X(er), Y(0) + 26, `e_r ${fmt(er, 0)}`)}
          {/* rib width */}
          <line x1={X(er / 2 - br / 2)} x2={X(er / 2 + br / 2)} y1={Y(0) + 13} y2={Y(0) + 13} />
          {[er / 2 - br / 2, er / 2 + br / 2].map((x) => <g key={x}><line x1={X(x)} x2={X(x)} y1={reentrant ? Y(hp) : Y(0) + 4} y2={Y(0) + 17} strokeDasharray={reentrant ? '2 2' : undefined} />{tick(X(x), Y(0) + 13)}</g>)}
          {txt(X(er / 2 + br / 2) + 8, Y(0) + 17, `b_r ${fmt(br, 0)}`, 'start')}
          {/* depths */}
          <line x1={x0 - 14} x2={x0 - 14} y1={Y(hc)} y2={Y(0)} />
          {[hc, hp, 0].map((y) => <g key={y}><line x1={x0 - 20} x2={x0 - 2} y1={Y(y)} y2={Y(y)} />{tick(x0 - 14, Y(y))}</g>)}
          {txt(x0 - 22, (Y(hc) + Y(hp)) / 2 + 4, `h_t ${fmt(hc - hp, 0)}`, 'end')}
          {txt(x0 - 22, (Y(hp) + Y(0)) / 2 + 4, `h_p ${fmt(hp, 0)}`, 'end')}
        </g>
      </svg>
    </div>
  );
}

/**
 * Longitudinal shear surface (EC4 §6.6.6.1, Figure 6.15) on an oblique CAD view of a slab segment on the
 * beam, one surface per drawing so nothing overlaps: 'a' = the two vertical planes a-a through h_c at the
 * flange edges (crossed by top and bottom bars), 'b' = the trough b-b around the studs over
 * 2h_sc + d_head + b_0 (crossed by the bottom bars twice). Surfaces are shaded and run the whole span.
 * The cross-section (front face) is to scale; the length is not. Bar levels are schematic.
 */
export function ShearSurface3D({ r, which }: { r: Record<string, number>; which: 'a' | 'b' | 'c' }) {
  const [box, W] = useWidth(330);
  const uid = useId().replace(/:/g, '');
  const { h_c, b_a, t_f, t_w, hsc, dhead, b0, dsc } = r;
  if (![h_c, b_a, t_f, t_w, hsc, dhead].every(Number.isFinite)) return <div ref={box} />;
  const hpe = r.hpe > 0 ? r.hpe : 0, ribsAcross = hpe > 0 && r.ctr >= 1, ribsAlong = hpe > 0 && !ribsAcross; // surfaces start above the deck
  const zx = 0.62, zy = 0.36;
  const depth = W * 0.34; // drawn length along the span
  const segPx = W - 28 - depth * zx; // slab segment width on screen
  const segMm = Math.max(2.4 * b_a, 3.2 * (dhead + (b0 || 0)), 380);
  const k = Math.min(segPx / segMm, 110 / h_c);
  const halfW = segPx / 2 / k;
  const yTop = 22 + depth * zy, yBot = yTop + h_c * k, cx = 14 + segPx / 2;
  const P = (X: number, Y: number, Z: number) => [cx + X * k + Z * zx, yBot - Y * k - Z * zy] as const;
  const pts = (...q: (readonly number[])[]) => q.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const ink = C.ink, teal = '#0F766E', violet = '#6D5BD0', col = which === 'a' ? C.red : which === 'b' ? teal : violet;
  const slabLine = '#B3BCC1', slabW = 0.35; // slab outline: light and fine, so the rebar reads first
  const rebar = { stroke: ink, strokeWidth: 2 }; // all rebar: one weight, one colour
  const stud = { fill: '#C8CBC3', stroke: ink, strokeWidth: 0.8 }; // stud: cut section, solid, finer than the rebar
  // a rebar line at (y, z); the stud is opaque and drawn over it
  const rebarLines = (y: number, z: number, key: string) => {
    const cover = 30; // rebar pulled in from the slab faces by the cover
    const xL = P(-halfW + cover, y, z)[0], xR = P(halfW - cover, y, z)[0], yS = P(0, y, z)[1];
    const segs = [[xL, xR]];
    return segs.map(([a, b], i) => <line key={`${key}${i}`} x1={a} x2={b} y1={yS} y2={yS} {...rebar} />);
  };
  const yTopBar = h_c - 30, yBotBar = bottomBarLevel(r);
  const aX = b_a / 2, bX = dhead / 2 + (b0 || 0) / 2;
  // c-c (Figure 6.16): from the rib side at the crest, inclined to the stud head; below the crest it follows the rib side (not counted)
  const [sideBot, sideTop] = ribSide(hpe, r.br, r.er, r.cre >= 1), cX = Math.max(bX, r.br / 2);
  const d = Math.max(3, (Number.isFinite(dsc) ? dsc : 19) * k), hd = dhead * k;
  const H = yBot + t_f * k + 30;
  // faces of the slab (top, right) as filled polygons drawn first, cut face last
  const top = pts(P(-halfW, h_c, 0), P(halfW, h_c, 0), P(halfW, h_c, depth), P(-halfW, h_c, depth));
  const side = pts(P(halfW, 0, 0), P(halfW, 0, depth), P(halfW, h_c, depth), P(halfW, h_c, 0));
  const surfaces = which === 'a'
    ? [-aX, aX].map((X) => pts(P(X, hpe, 0), P(X, h_c, 0), P(X, h_c, depth), P(X, hpe, depth)))
    : which === 'c'
    ? [...[-1, 1].map((sg) => pts(P(sg * cX, hpe, 0), P(sg * bX, hsc, 0), P(sg * bX, hsc, depth), P(sg * cX, hpe, depth))), pts(P(-bX, hsc, 0), P(bX, hsc, 0), P(bX, hsc, depth), P(-bX, hsc, depth))]
    : [pts(P(-bX, 0, 0), P(-bX, hsc, 0), P(-bX, hsc, depth), P(-bX, 0, depth)), pts(P(-bX, hsc, 0), P(bX, hsc, 0), P(bX, hsc, depth), P(-bX, hsc, depth)), pts(P(bX, 0, 0), P(bX, hsc, 0), P(bX, hsc, depth), P(bX, 0, depth))];
  const barsZ = [0.2, 0.4, 0.6, 0.8, 1].map((f) => f * depth); // five more bars back along the span
  const arrowA = P(-halfW * 0.7, h_c, depth * 0.15), arrowB = P(-halfW * 0.7, h_c, depth * 0.8);
  const ang = (Math.atan2(arrowB[1] - arrowA[1], arrowB[0] - arrowA[0]) * 180) / Math.PI;
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={which === 'a' ? `Surface a-a: two vertical planes through the concrete depth ${fmt(h_c - hpe, 0)} mm at the flange edges, along the span, crossed by top and bottom bars` : which === 'b' ? `Surface b-b: trough around the studs from the flange, length ${fmt(r.lb, 0)} mm, along the span, crossed by the bottom bars twice` : `Surface c-c: from the rib sides at the deck crest, inclined to the stud head, length ${fmt(r.lc, 0)} mm, along the span, crossed by the bottom bars twice`}>
        <polygon points={top} fill="#EEF1EF" stroke={slabLine} strokeWidth={slabW} strokeLinejoin="round" />
        <polygon points={side} fill="#DCE1DE" stroke={slabLine} strokeWidth={slabW} strokeLinejoin="round" />
        {/* transverse bars repeated along the span (spacing indicative), seen through the concrete */}
        {barsZ.map((z) => (
          <g key={z}>
            {r.ctop !== 0 && rebarLines(yTopBar, z, 't')}
            {rebarLines(yBotBar, z, 'b')}
          </g>
        ))}
        {/* the surface, shaded, seen through the concrete */}
        {surfaces.map((q, i) => <polygon key={i} points={q} fill={col} fillOpacity={0.16} stroke={col} strokeWidth={1.2} strokeDasharray="6 4" strokeLinejoin="round" />)}
        {/* cut face: concrete, steel flange, front stud, bars */}
        <rect x={P(-halfW, 0, 0)[0]} y={yTop} width={segPx} height={yBot - yTop} fill="#F6F8F7" fillOpacity={0.55} stroke={slabLine} strokeWidth={slabW} />
        {/* deck on the cut face: profile if the ribs run along the beam, crest line if they run across */}
        {ribsAlong && (
          <g clipPath={`url(#${uid}k)`}>
            {deckVoids(-halfW, halfW, 0, hpe, r.br, r.er, r.cre >= 1).map((q, i) => <polygon key={i} points={q.map(([x, y]) => P(x, y, 0).join(',')).join(' ')} fill={C.sheet} stroke={ink} strokeWidth={0.9} strokeLinejoin="round" />)}
          </g>
        )}
        {ribsAcross && <line x1={P(-halfW, 0, 0)[0]} x2={P(halfW, 0, 0)[0]} y1={yBot - hpe * k} y2={yBot - hpe * k} stroke={ink} strokeWidth={0.9} strokeDasharray="6 3" />}
        <defs><clipPath id={`${uid}k`}><rect x={P(-halfW, 0, 0)[0]} y={yTop} width={segPx} height={yBot - yTop + 1} /></clipPath></defs>
        <rect x={P(-b_a / 2, 0, 0)[0]} y={yBot} width={b_a * k} height={t_f * k} fill="#C8CBC3" stroke={ink} strokeWidth={CAD.geo} />
        <rect x={cx - Math.max(1.5, (t_w * k) / 2)} y={yBot + t_f * k} width={Math.max(3, t_w * k)} height={24} fill="#C8CBC3" stroke={ink} strokeWidth={CAD.geo} />
        {/* cut-face bars first, then the stud over them */}
        {(r.ctop === 0 ? [yBotBar] : [yTopBar, yBotBar]).map((y) => <g key={y}>{rebarLines(y, 0, 'f')}</g>)}
        <g {...stud}>
          <rect x={cx - d / 2} y={yBot - (hsc - 10) * k} width={d} height={(hsc - 10) * k} />
          <rect x={cx - hd / 2} y={yBot - hsc * k} width={hd} height={10 * k} />
        </g>
        {/* the surface trace on the cut face, and where the bars cross it */}
        {which === 'c' && <>
          {/* below the crest the surface follows the rib side: drawn dotted, not counted (§6.6.6.4(3)) */}
          {[-1, 1].map((s) => <line key={s} x1={P(s * sideBot, 0, 0)[0]} y1={P(0, 0, 0)[1]} x2={P(s * sideTop, hpe, 0)[0]} y2={P(0, hpe, 0)[1]} stroke={col} strokeWidth={1.2} strokeDasharray="2 3" />)}
          <polyline points={pts(P(-cX, hpe, 0), P(-bX, hsc, 0), P(bX, hsc, 0), P(cX, hpe, 0))} fill="none" stroke={col} strokeWidth={2} strokeDasharray="6 4" />
        </>}
        {which === 'a'
          ? [-aX, aX].map((X) => <line key={X} x1={P(X, 0, 0)[0]} x2={P(X, 0, 0)[0]} y1={yBot - hpe * k} y2={yTop} stroke={col} strokeWidth={2} strokeDasharray="6 4" />)
          : which === 'c' ? null : <polyline points={pts(P(-bX, 0, 0), P(-bX, hsc, 0), P(bX, hsc, 0), P(bX, 0, 0))} fill="none" stroke={col} strokeWidth={2} strokeDasharray="6 4" />}
        <text x={W - 4} y={yBot + 14} textAnchor="end" fill={C.muted} fontSize={CAD.font - 1}>{`bars @ ${fmt(which !== 'a' || r.ctop === 0 ? r.sfb : Math.min(r.sft, r.sfb), 0)} mm, indicative`}</text>
        {/* longitudinal shear on the outstand, along the span */}
        <line x1={arrowA[0]} y1={arrowA[1]} x2={arrowB[0]} y2={arrowB[1]} stroke={C.blue} strokeWidth={1.6} />
        <path d="M0,0 l-9,-3.5 l0,7 z" fill={C.blue} transform={`translate(${arrowB[0]} ${arrowB[1]}) rotate(${ang})`} />
        <text x={arrowA[0] - 2} y={arrowA[1] - 6} fill={C.blue} fontSize={CAD.font} fontWeight="700"><SvgRich text="v_f" size={CAD.font} /></text>
        {/* label on the far end of the surface */}
        {which === 'a'
          ? [-aX, aX].map((X) => <text key={X} x={P(X, h_c, depth)[0]} y={P(X, h_c, depth)[1] - 5} textAnchor="middle" fill={col} fontSize={CAD.font + 1} fontWeight="700">a</text>)
          : <text x={P(0, hsc, depth)[0]} y={P(0, h_c, depth)[1] - 5} textAnchor="middle" fill={col} fontSize={CAD.font + 1} fontWeight="700">{which}</text>}
      </svg>
    </div>
  );
}

/** Longitudinal section: side elevation along the span through a stud line, drawn to scale. */
export function LongSection({ r }: { r: Record<string, number> }) {
  const [box, W] = useWidth(720);
  const uid = useId().replace(/:/g, '');
  const { h_c, t_f, hsc, dhead, dsc, dsb, dst, sfb, sft } = r;
  if (![h_c, t_f, hsc, dhead, sfb].every(Number.isFinite)) return <div ref={box} />;
  const hpe = r.hpe > 0 ? r.hpe : 0, across = hpe > 0 && r.ctr >= 1 && r.er > 0; // transverse ribs are cut by this section
  const n = 4, pitch = across ? r.er : sfb, lenMm = n * pitch;
  const ink = C.ink, teal = '#0F766E', slabLine = '#B3BCC1', slabW = 0.35;
  const dStud = Number.isFinite(dsc) ? dsc : 19;
  const k = Math.min((W - 80) / lenMm, 300 / (hsc + h_c + t_f));
  const x0 = 46, top = 40;
  const yOf = (Y: number) => top + (h_c - Y) * k; // Y in mm above the slab soffit
  const X = (x: number) => x0 + x * k;
  const H = yOf(-t_f) + 96;
  const bottomBar = bottomBarLevel(r), topBar = h_c - 30;
  const every = across ? Math.max(1, Math.round(r.sA / r.er)) : 1; // studs in every rib, or every second …
  const studX = Array.from({ length: n }, (_, i) => i).filter((i) => i % every === 0).map((i) => i * pitch + pitch / 2);
  const botBars = across ? Array.from({ length: Math.floor(lenMm / sfb) + 1 }, (_, j) => j * sfb) : Array.from({ length: n + 1 }, (_, j) => j * pitch);
  const dimY = yOf(-t_f) + 22; // stud spacing dimension sits under the flange
  const hasTop = Number.isFinite(sft) && sft > 0 && Number.isFinite(dst) && r.ctop !== 0;
  const hasBot = Number.isFinite(dsb);
  const topX = hasTop ? X(sft) : 0;
  const botX = X(across ? botBars[Math.min(botBars.length - 1, Math.round((0.72 * lenMm) / sfb))] : 3 * pitch); // a bar clear of the stud-spacing dimension
  const belowY = yOf(-t_f) + 62;
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Longitudinal section along the span through the studs, stud spacing ${fmt(sfb, 0)} mm, slab depth ${fmt(h_c, 0)} mm`}>
        {/* slab, steel top flange and studs cut on the section line */}
        <rect x={X(0)} y={yOf(h_c)} width={lenMm * k} height={h_c * k} fill="#F6F8F7" stroke={slabLine} strokeWidth={slabW} />
        {/* shear surface: a-a along the whole slab depth, b-b over the stud height */}
        <rect x={X(0)} y={yOf(h_c)} width={lenMm * k} height={(h_c - hpe) * k} fill={C.red} fillOpacity={0.1} />
        {!across && <rect x={X(0)} y={yOf(hsc)} width={lenMm * k} height={hsc * k} fill={teal} fillOpacity={0.16} stroke={teal} strokeWidth={1} />}
        {/* deck: transverse ribs cut by the section (voids under the crests); parallel ribs show as the crest line beyond */}
        <defs><clipPath id={`${uid}k`}><rect x={X(0)} y={yOf(h_c)} width={lenMm * k} height={h_c * k + 1} /></clipPath></defs>
        {across && (
          <g clipPath={`url(#${uid}k)`}>
            {deckVoids(0, lenMm, pitch / 2, hpe, r.br, r.er, r.cre >= 1).map((q, i) => <polygon key={i} points={q.map(([x, y]) => `${X(x)},${yOf(y)}`).join(' ')} fill={C.sheet} stroke={ink} strokeWidth={0.9} strokeLinejoin="round" />)}
          </g>
        )}
        {hpe > 0 && !across && <line x1={X(0)} x2={X(lenMm)} y1={yOf(hpe)} y2={yOf(hpe)} stroke={ink} strokeWidth={0.9} strokeDasharray="6 3" />}
        <rect x={X(0)} y={yOf(0)} width={lenMm * k} height={t_f * k} fill="#C8CBC3" stroke={ink} strokeWidth={CAD.geo} />
        {/* transverse bars cut by the section: dots at both bar levels, between the studs */}
        {botBars.map((x, j) => (
          <circle key={`b${j}`} cx={X(x)} cy={yOf(bottomBar)} r={3.2} fill={ink} />
        ))}
        {hasTop && Array.from({ length: Math.floor(lenMm / sft) + 1 }, (_, j) => (
          <circle key={`t${j}`} cx={X(j * sft)} cy={yOf(topBar)} r={3.2} fill={ink} />
        ))}
        {/* studs: cut through their axis, finer line than the rebar */}
        {studX.map((x) => (
          <g key={x} fill="#C8CBC3" stroke={ink} strokeWidth={0.8}>
            <rect x={X(x) - (dStud * k) / 2} y={yOf(hsc - 10)} width={dStud * k} height={(hsc - 10) * k} />
            <rect x={X(x) - (dhead * k) / 2} y={yOf(hsc)} width={dhead * k} height={10 * k} />
          </g>
        ))}
        {/* dimensions: stud spacing and slab depth */}
        <g stroke={C.muted} strokeWidth={CAD.dim}>
          {studX.length > 1 && <>
          <line x1={X(studX[0])} x2={X(studX[1])} y1={dimY} y2={dimY} />
          <line x1={X(studX[0])} x2={X(studX[0])} y1={dimY - 4} y2={dimY + 4} />
          <line x1={X(studX[1])} x2={X(studX[1])} y1={dimY - 4} y2={dimY + 4} />
          </>}
          <line x1={X(0) - 14} x2={X(0) - 14} y1={yOf(h_c)} y2={yOf(0)} />
          <line x1={X(0) - 18} x2={X(0) - 10} y1={yOf(h_c)} y2={yOf(h_c)} />
          <line x1={X(0) - 18} x2={X(0) - 10} y1={yOf(0)} y2={yOf(0)} />
        </g>
        {studX.length > 1 && <text x={(X(studX[0]) + X(studX[1])) / 2} y={dimY + 13} textAnchor="middle" fill={C.muted} fontSize={CAD.font - 1}><SvgRich text={across ? `s_A = ${fmt(r.sA, 0)} mm` : 's_{f.b}'} size={CAD.font - 1} /></text>}
        <text x={X(0) - 18} y={(yOf(h_c) + yOf(0)) / 2} textAnchor="end" dominantBaseline="middle" fill={C.muted} fontSize={CAD.font - 1}><SvgRich text="h_c" size={CAD.font - 1} /></text>
        {/* rebar callouts: leader from the bar, text kept outside the concrete */}
        {hasTop && (
          <g stroke={C.muted} strokeWidth={CAD.dim} fill="none">
            <polyline points={`${topX},${yOf(topBar) - 4} ${topX + 14},${top - 12} ${topX + 20},${top - 12}`} />
            <text x={topX + 23} y={top - 9} fill={ink} stroke="none" fontSize={CAD.font - 1}><SvgRich text={`\u00d8${fmt(dst, 0)} @ s_{f.t} = ${fmt(sft, 0)} mm`} size={CAD.font - 1} /></text>
          </g>
        )}
        {hasBot && (
          <g stroke={C.muted} strokeWidth={CAD.dim} fill="none">
            <polyline points={`${botX},${yOf(bottomBar) + 4} ${botX + 14},${belowY} ${botX + 20},${belowY}`} />
            <text x={botX + 23} y={belowY + 4} fill={ink} stroke="none" fontSize={CAD.font - 1}><SvgRich text={`\u00d8${fmt(dsb, 0)} @ s_{f.b} = ${fmt(sfb, 0)} mm`} size={CAD.font - 1} /></text>
          </g>
        )}
        <text x={X(lenMm) + 4} y={yOf(0) + 4} fill={C.muted} fontSize={CAD.font - 1}>…</text>
      </svg>
    </div>
  );
}

/**
 * Beam on the loading sheet, CAD style: the longitudinal section A–B over the whole span (slab, deck, steel
 * beam, studs at their spacing each side of x_M) and the cross-section 1–1. Lengths along the span are to
 * scale; depths are drawn larger when the beam would otherwise be too thin to read.
 */
export function BeamCad({ r, name, part }: { r: Record<string, number> & { vectors?: Record<string, number[]> }; name: string; part: 'elevation' | 'section' }) {
  const [box, W] = useWidth(part === 'section' ? 400 : 720);
  const uid = useId().replace(/:/g, '');
  const { L, h_c, h_a, b_a, t_f, t_w, hsc, dsc, dhead } = r;
  if (![L, h_c, h_a, b_a, t_f, t_w, hsc].every((v) => Number.isFinite(v) && v > 0)) return <div ref={box} />;
  const ink = C.ink, dimC = C.muted, slabFill = '#EEF1EF';
  const hpe = r.hpe > 0 ? r.hpe : 0, across = hpe > 0 && r.ctr >= 1, along = hpe > 0 && !across, re = r.cre >= 1;
  const Lmm = L * 1000, D = h_c + h_a;
  const X0 = 34, X1 = W - 34; // the same stations as the load drawings below, so the spans line up
  const kh = (X1 - X0) / Lmm, kv = Math.max(kh, 112 / D);
  // a tapered beam (r.taper) is drawn from h_A at A to h_B at B; the layout below uses the deeper end
  const tap = part === 'elevation' && r.taper >= 1 && r.hA > 0 && r.hB > 0;
  const hA = tap ? r.hA : h_a, hB = tap ? r.hB : h_a;
  // multi-segment profile (vertices x m, h mm), else the straight line A to B
  const tv = tap ? r.vectors : undefined, tx = tv?.taperX && tv.taperX.length > 2 ? tv.taperX : [0, Lmm / 1000], th = tv?.taperH && tv.taperH.length > 2 ? tv.taperH : [hA, hB];
  const top = 46, yS = top + h_c * kv, yB = yS + Math.max(...th) * kv; // slab top, steel top, steel bottom (deepest)
  const yBA = yS + hA * kv, yBB = yS + hB * kv;
  const X = (mm: number) => X0 + mm * kh, Yup = (mm: number) => yS - mm * kv; // mm above the steel top
  const xM = Math.min(Math.max(r.xM * 1000, 0), Lmm);
  const sA = r.sA > 0 ? r.sA : NaN, sB = r.sB > 0 ? r.sB : NaN;
  // studs: from each support towards x_M at the spacing of that side (ribs fix the positions on a transverse deck)
  const studs: number[] = [];
  const first = (s: number) => (across ? r.er / 2 : s / 2);
  if (sA > 0) for (let x = first(sA); x <= xM + 1e-6; x += sA) studs.push(x);
  if (sB > 0) for (let x = Lmm - first(sB); x > xM + 1e-6; x -= sB) studs.push(x);
  const dPx = Math.max(1, (dsc || 19) * kh), hdPx = Math.max(dPx + 1.5, (dhead || 32) * kh);
  const tick = (x: number, y: number, key?: string | number) => <line key={key} x1={x - 4} x2={x + 4} y1={y + 4} y2={y - 4} stroke={ink} strokeWidth={1.2} />;
  const txt = (x: number, y: number, t: string, anchor: 'start' | 'middle' | 'end' = 'middle', col = ink) => <text x={x} y={y} textAnchor={anchor} fill={col} stroke="none" fontSize={CAD.font - 0.5} className="num"><SvgRich text={t} size={CAD.font - 0.5} /></text>;
  const hatch = (cx: number, gy: number) => (
    <g stroke={ink} strokeWidth={CAD.dim}>
      <line x1={cx - 14} x2={cx + 14} y1={gy} y2={gy} strokeWidth={CAD.geo} />
      {[-12, -6, 0, 6, 12].map((d) => <line key={d} x1={cx + d} y1={gy} x2={cx + d - 5} y2={gy + 5} />)}
    </g>
  );
  const dimY = yB + 46, H1 = dimY + 30;
  const cutX = X(xM > Lmm * 0.85 ? Lmm * 0.06 : Lmm * 0.94); // clear of the stud notes
  // ── cross-section 1–1 ──
  // section with the plastic stress block at x_M: PNA label and depth dimensions on the left, stress diagram on the right
  const sTop = 58, bw = 38, labW = 104, left = 66;
  const slabMm = Math.max(1.45 * b_a, 240);
  const ks = Math.max(0.12, Math.min((W - left - 30 - 2 * bw - labW) / slabMm, 270 / D));
  const cx = left + (slabMm * ks) / 2, SY = (mm: number) => sTop + mm * ks; // mm below the slab top
  const kM = r.kM, xc = Math.min(r.xc > 0 ? r.xc : 0, h_c), ya = kM >= 1 && r.ya > 0 ? r.ya : 0;
  const yPna = kM >= 1 ? SY(h_c + ya) : SY(xc);
  const where = ['in the slab', 'in the top flange', 'in the fillet', 'in the web'][kM] ?? '';
  const full = r.eta >= 1 - 1e-9;
  const sL = cx - (slabMm * ks) / 2, sR = cx + (slabMm * ks) / 2;
  const axis = sR + 30 + bw, lx = axis + bw + 8;
  const H = part === 'section' ? SY(D) + 62 : H1;
  const nre = r.nre >= 2 ? 2 : 1, studXs = nre === 2 ? [-Math.min(b_a / 4, 50), Math.min(b_a / 4, 50)] : [0];
  const zig = (x: number, y0: number, y1: number) => `M${x},${y0 - 5} L${x},${y0 + (y1 - y0) * 0.35} l-4,${(y1 - y0) * 0.1} l8,${(y1 - y0) * 0.1} l-4,${(y1 - y0) * 0.1} L${x},${y1 + 5}`;
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Longitudinal section of the beam, span ${fmt(L, 2)} m, ${name}, slab ${fmt(h_c, 0)} mm, studs at ${fmt(sA, 0)} and ${fmt(sB, 0)} mm; cross-section 1–1`}>
        <defs>
          <clipPath id={`${uid}e`}><rect x={X0} y={top} width={X1 - X0} height={h_c * kv + 0.5} /></clipPath>
          <clipPath id={`${uid}s`}><rect x={sL} y={sTop - 1} width={sR - sL} height={h_c * ks + 2} /></clipPath>
        </defs>
        {part === 'elevation' && <>
        {/* ── longitudinal section A–B ── */}
        <rect x={X0} y={top} width={X1 - X0} height={h_c * kv} fill={slabFill} stroke={ink} strokeWidth={CAD.geo} />
        {across && (
          <g clipPath={`url(#${uid}e)`}>
            {deckVoids(0, Lmm, r.er / 2, hpe, r.br, r.er, re).map((q, i) => <polygon key={i} points={q.map(([x, y]) => `${X(x)},${Yup(y)}`).join(' ')} fill={C.sheet} stroke={ink} strokeWidth={0.6} strokeLinejoin="round" />)}
          </g>
        )}
        {along && <line x1={X0} x2={X1} y1={Yup(hpe)} y2={Yup(hpe)} stroke={ink} strokeWidth={CAD.dim} strokeDasharray="6 3" />}
        <g fill="#C8CBC3" stroke={ink} strokeWidth={0.5}>
          {studs.map((x, i) => (
            <g key={i}>
              <rect x={X(x) - dPx / 2} y={Yup(hsc)} width={dPx} height={hsc * kv} />
              <rect x={X(x) - hdPx / 2} y={Yup(hsc)} width={hdPx} height={Math.max(1.5, 10 * kv)} />
            </g>
          ))}
        </g>
        <polygon points={[`${X0},${yS}`, `${X1},${yS}`, ...tx.map((x: number, i: number) => `${X(x * 1000)},${yS + th[i] * kv}`).reverse()].join(' ')} fill={C.sheet} stroke={ink} strokeWidth={CAD.geo} strokeLinejoin="round" />
        <line x1={X0} x2={X1} y1={yS + t_f * kv} y2={yS + t_f * kv} stroke={ink} strokeWidth={CAD.dim} />
        <polyline points={tx.map((x: number, i: number) => `${X(x * 1000)},${yS + (th[i] - t_f) * kv}`).join(' ')} fill="none" stroke={ink} strokeWidth={CAD.dim} />
        {tx.length > 2 && tx.slice(1, -1).map((x: number, i: number) => <g key={`tv${i}`}><line x1={X(x * 1000)} x2={X(x * 1000)} y1={yS} y2={yS + th[i + 1] * kv} stroke={dimC} strokeWidth={CAD.dim} strokeDasharray="3 2" />{txt(X(x * 1000), yS + th[i + 1] * kv + 13, fmt(th[i + 1], 0), 'middle')}</g>)}
        {/* sunken slab zones: the slab top drops to the zone thickness */}
        {(r.vectors?.zoneX1 ?? []).map((x1: number, i: number) => {
          const x2 = r.vectors!.zoneX2[i], hz = r.vectors!.zoneHc[i], d = (h_c - hz) * kv;
          return <g key={`sz${i}`} data-testid="elev-slabzone">
            <rect x={X(x1 * 1000)} y={top - 0.5} width={X(x2 * 1000) - X(x1 * 1000)} height={d + 0.5} fill={C.sheet} />
            <polyline points={`${X(x1 * 1000)},${top} ${X(x1 * 1000)},${top + d} ${X(x2 * 1000)},${top + d} ${X(x2 * 1000)},${top}`} fill="none" stroke={ink} strokeWidth={CAD.geo} />
            {txt((X(x1 * 1000) + X(x2 * 1000)) / 2, top + d - 3, `${fmt(hz, 0)}`, 'middle')}
          </g>;
        })}
        {/* supports */}
        <g fill={C.sheet} stroke={ink} strokeWidth={CAD.geo}>
          <path d={`M${X0},${yBA + 1} l-8,13 h16 z`} />
          <path d={`M${X1},${yBB + 1} l-8,11 h16 z`} />
          <circle cx={X1 - 4} cy={yBB + 15} r="2" strokeWidth={CAD.dim} /><circle cx={X1 + 4} cy={yBB + 15} r="2" strokeWidth={CAD.dim} />
        </g>
        {hatch(X0, yBA + 14.5)}{hatch(X1, yBB + 18)}
        {txt(X0 - 6, yBA - 4, 'A', 'end')}{txt(X1 + 6, yBB - 4, 'B', 'start')}
        {tap && <>{txt(X0 + 6, (yS + yBA) / 2 + 4, `h_A ${fmt(hA, 0)}`, 'start')}{txt(X1 - 6, (yS + yBB) / 2 + 4, `h_B ${fmt(hB, 0)}`, 'end')}</>}
        {/* stud zones each side of the maximum moment */}
        <line x1={X(xM)} x2={X(xM)} y1={top - 22} y2={yB + 6} stroke={dimC} strokeWidth={CAD.dim} strokeDasharray="10 3 2 3" />
        {txt(X(xM), top - 26, `x_M ${fmt(r.xM, 2)} m`, 'middle', dimC)}
        {xM > 1 && Number.isFinite(r.nA) && txt((X0 + X(xM)) / 2, top - 8, `${fmt(r.nA, 0)} studs @ ${fmt(sA, 0)}`)}
        {Lmm - xM > 1 && Number.isFinite(r.nB) && txt((X(xM) + X1) / 2, top - 8, `${fmt(r.nB, 0)} studs @ ${fmt(sB, 0)}`)}
        {/* section mark 1–1 */}
        <g stroke={ink} strokeWidth={1.6}>
          <line x1={cutX} x2={cutX} y1={top - 14} y2={top - 2} /><line x1={cutX} x2={cutX} y1={yB + 2} y2={yB + 14} />
        </g>
        {txt(cutX + 5, top - 4, '1', 'start')}{txt(cutX + 5, yB + 14, '1', 'start')}
        {/* depth and span dimensions */}
        <g stroke={dimC} strokeWidth={CAD.dim}>
          <line x1={X0 - 16} x2={X0 - 16} y1={top} y2={yS} />
          {[top, yS].map((y) => <g key={y}><line x1={X0 - 22} x2={X0 - 3} y1={y} y2={y} />{tick(X0 - 16, y)}</g>)}
        </g>
        <text transform={`translate(${X0 - 22},${(top + yS) / 2}) rotate(-90)`} textAnchor="middle" fill={ink} fontSize={CAD.font - 1.5} className="num">{fmt(h_c, 0)}</text>

        <DimChain stations={xM > 1 && Lmm - xM > 1 ? [0, r.xM, L] : [0, L]} X={(v) => X0 + (v / L) * (X1 - X0)} y={dimY} yTop={yB + 24} />
        {txt(X0, H1 - 4, `Longitudinal section A–B, ${name}${kv > kh * 1.01 ? `; depths drawn ×${fmt(kv / kh, 1)}` : ''}${hpe > 0 ? `; deck ribs ${across ? 'perpendicular' : 'parallel'}` : ''}`, 'start', dimC)}

        </>}
        {part === 'section' && <>
        {/* ── cross-section 1–1 ── */}
        <rect x={sL} y={SY(0)} width={sR - sL} height={h_c * ks} fill={slabFill} stroke="none" />
        <line x1={sL} x2={sR} y1={SY(0)} y2={SY(0)} stroke={ink} strokeWidth={CAD.geo} />
        {!along && <line x1={sL} x2={sR} y1={SY(h_c)} y2={SY(h_c)} stroke={ink} strokeWidth={CAD.geo} />}
        {along && (
          <g clipPath={`url(#${uid}s)`}>
            <line x1={sL} x2={sR} y1={SY(h_c)} y2={SY(h_c)} stroke={ink} strokeWidth={CAD.geo} />
            {deckVoids(-slabMm / 2, slabMm / 2, 0, hpe, r.br, r.er, re).map((q, i) => <polygon key={i} points={q.map(([x, y]) => `${cx + x * ks},${SY(h_c - y)}`).join(' ')} fill={C.sheet} stroke={ink} strokeWidth={CAD.geo} strokeLinejoin="round" />)}
          </g>
        )}
        {across && <line x1={sL} x2={sR} y1={SY(h_c - hpe)} y2={SY(h_c - hpe)} stroke={ink} strokeWidth={CAD.dim} strokeDasharray="6 3" />}
        <path d={`${zig(sL, SY(0), SY(h_c))} ${zig(sR, SY(0), SY(h_c))}`} fill="none" stroke={ink} strokeWidth={CAD.dim} />
        {/* transverse bars, top and bottom */}
        {r.ctop !== 0 && <line x1={sL + 4} x2={sR - 4} y1={SY(30)} y2={SY(30)} stroke={ink} strokeWidth={1.8} />}
        <line x1={sL + 4} x2={sR - 4} y1={SY(h_c - bottomBarLevel(r))} y2={SY(h_c - bottomBarLevel(r))} stroke={ink} strokeWidth={1.8} />
        {/* steel section */}
        <g fill={C.sheet} stroke={ink} strokeWidth={CAD.geo} strokeLinejoin="round">
          <path d={`M${cx - (b_a / 2) * ks},${SY(h_c)} h${b_a * ks} v${t_f * ks} h${-((b_a - t_w) / 2) * ks} v${(h_a - 2 * t_f) * ks} h${((b_a - t_w) / 2) * ks} v${t_f * ks} h${-b_a * ks} v${-t_f * ks} h${((b_a - t_w) / 2) * ks} v${-(h_a - 2 * t_f) * ks} h${-((b_a - t_w) / 2) * ks} z`} />
        </g>
        <g fill="#C8CBC3" stroke={ink} strokeWidth={0.8}>
          {studXs.map((x) => (
            <g key={x}>
              <rect x={cx + x * ks - Math.max(2, (dsc || 19) * ks) / 2} y={SY(h_c - hsc)} width={Math.max(2, (dsc || 19) * ks)} height={hsc * ks} />
              <rect x={cx + x * ks - Math.max(3.4, (dhead || 32) * ks) / 2} y={SY(h_c - hsc)} width={Math.max(3.4, (dhead || 32) * ks)} height={Math.max(2, 10 * ks)} />
            </g>
          ))}
        </g>
        {/* dimensions */}
        <g stroke={dimC} strokeWidth={CAD.dim}>
          <line x1={sL - 16} x2={sL - 16} y1={SY(0)} y2={SY(D)} />
          {[0, h_c, D].map((y) => <g key={y}><line x1={sL - 22} x2={sL - 6} y1={SY(y)} y2={SY(y)} />{tick(sL - 16, SY(y))}</g>)}
          <line x1={cx - (b_a / 2) * ks} x2={cx + (b_a / 2) * ks} y1={SY(D) + 14} y2={SY(D) + 14} />
          {[-1, 1].map((k) => <g key={k}><line x1={cx + k * (b_a / 2) * ks} x2={cx + k * (b_a / 2) * ks} y1={SY(D) + 3} y2={SY(D) + 19} />{tick(cx + k * (b_a / 2) * ks, SY(D) + 14)}</g>)}
        </g>
        <text transform={`translate(${sL - 20},${SY(h_c / 2)}) rotate(-90)`} textAnchor="middle" fill={ink} fontSize={CAD.font - 1} className="num">{fmt(h_c, 0)}</text>
        <text transform={`translate(${sL - 20},${SY(h_c + h_a / 2)}) rotate(-90)`} textAnchor="middle" fill={ink} fontSize={CAD.font - 1} className="num">{fmt(h_a, 0)}</text>
        {txt(cx, SY(D) + 11, `b_a ${fmt(b_a, 0)}`)}
        {txt(cx, SY(D) + 36, `Section 1–1${Number.isFinite(r.b_eff) ? `, b_eff ${fmt(r.b_eff, 0)}` : ''}`, 'middle', dimC)}
        {/* degree of shear connection */}
        {Number.isFinite(r.eta) && (
          <text x={4} y={16} fill={ink} fontSize={CAD.font + 1.5} fontWeight="700" className="num">
            η = {fmt(r.eta * 100, 0)} %<tspan fontWeight="400" fontSize={CAD.font}>{`  ${r.comp >= 1 ? (full ? 'full shear connection' : 'partial shear connection') : 'not composite (below the minimum)'}`}</tspan>
          </text>
        )}
        {Number.isFinite(r.etaMin) && txt(4, 32, `minimum ${fmt(r.etaMin * 100, 0)} %; studs per shear span: ${fmt(r.nh, 0)} provided, ${fmt(r.nreq, 0)} needed`, 'start', dimC)}
        {/* plastic stress block at x_M */}
        <defs>
          <pattern id={`${uid}b`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke={C.blue} strokeWidth="0.8" /></pattern>
          <pattern id={`${uid}r`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="5" stroke={C.red} strokeWidth="0.8" /></pattern>
        </defs>
        {[SY(0), SY(h_c), SY(D)].map((y) => <line key={`e${y}`} x1={sR + 6} x2={axis + bw} y1={y} y2={y} stroke={C.rule} strokeWidth={CAD.dim} strokeDasharray="3 2" />)}
        <rect x={axis - bw} y={SY(0)} width={bw} height={Math.max(0.8, xc * ks)} fill={`url(#${uid}b)`} stroke={C.blue} strokeWidth={1} />
        {kM >= 1 && <rect x={axis - bw} y={SY(h_c)} width={bw} height={Math.max(0.8, yPna - SY(h_c))} fill={`url(#${uid}b)`} stroke={C.blue} strokeWidth={1} />}
        <rect x={axis} y={Math.max(yPna, SY(h_c))} width={bw} height={SY(D) - Math.max(yPna, SY(h_c))} fill={`url(#${uid}r)`} stroke={C.red} strokeWidth={1} />
        <line x1={axis} x2={axis} y1={SY(0) - 8} y2={SY(D) + 8} stroke={ink} strokeWidth={CAD.geo} />
        {txt(axis - bw / 2, SY(D) + 20, 'C', 'middle', C.blue)}{txt(axis + bw / 2, SY(D) + 20, 'T', 'middle', C.red)}
        {/* concrete stressed down to x_c (its own neutral axis when the connection is partial) */}
        {kM >= 1 && xc < h_c - 0.5 && <line x1={sL} x2={axis} y1={SY(xc)} y2={SY(xc)} stroke={C.blue} strokeWidth={0.9} strokeDasharray="5 3" />}
        <text x={lx} y={Math.max(SY(0) + 10, SY(xc / 2) - 10)} fill={C.blue} fontSize={CAD.font} className="num">
          <tspan fontWeight="700">0.85 f</tspan><tspan fontSize={CAD.font - 3} dy="3">cd</tspan>
          <tspan x={lx} dy="11">{`N`}</tspan><tspan fontSize={CAD.font - 3} dy="3">c</tspan><tspan dy="-3">{` ${fmt(r.Nc, 0)} kN`}</tspan>
          <tspan x={lx} dy="14">{`x`}</tspan><tspan fontSize={CAD.font - 3} dy="3">c</tspan><tspan dy="-3">{` ${fmt(xc, 1)} mm`}</tspan>
        </text>
        {kM >= 1 && yPna - SY(h_c) > 14 && <text x={lx} y={(SY(h_c) + yPna) / 2 + 4} fill={C.blue} fontSize={CAD.font - 0.5}><tspan fontWeight="700">f</tspan><tspan fontSize={CAD.font - 3} dy="3">yd</tspan><tspan dy="-3"> comp.</tspan></text>}
        <text x={lx} y={(Math.max(yPna, SY(h_c)) + SY(D)) / 2 + 4} fill={C.red} fontSize={CAD.font - 0.5}><tspan fontWeight="700">f</tspan><tspan fontSize={CAD.font - 3} dy="3">yd</tspan><tspan dy="-3"> tension</tspan></text>
        {/* PNA: centre line through the section and the diagram, labelled in the left margin */}
        <line x1={2} x2={axis + bw + 4} y1={yPna} y2={yPna} stroke={C.red} strokeWidth={1.1} strokeDasharray="12 3 2 3" />
        <text x={2} y={yPna - 5} fill={C.red} fontSize={CAD.font + 2.5} fontWeight="700">PNA</text>
        <text x={2} y={yPna + 14} fill={C.red} fontSize={CAD.font - 0.5} className="num">{kM >= 1 ? <>y<tspan fontSize={CAD.font - 3.5} dy="3">a</tspan><tspan dy="-3">{` ${fmt(ya, 1)}`}</tspan></> : <>x<tspan fontSize={CAD.font - 3.5} dy="3">c</tspan><tspan dy="-3">{` ${fmt(xc, 1)}`}</tspan></>}</text>
        {txt(4, SY(D) + 56, `PNA ${where}${kM >= 1 ? `, ${fmt(ya, 1)} mm below the steel top` : `, ${fmt(xc, 1)} mm below the slab top`}`, 'start', C.red)}
        </>}
      </svg>
    </div>
  );
}


/** Top flange follows local depth; brace markers never sit on the centroid. */
export function ConstructionBraceElevation({ L, hA, hB, positions, selected, onSelect }: {
  L: number; hA: number; hB: number; positions: number[]; selected: number | null; onSelect: (i: number) => void;
}) {
  const X = (x: number) => 40 + 560 * x / (L || 1);
  const top = (x: number) => 100 - 40 * (hA + (hB - hA) * x / (L || 1)) / Math.max(hA, hB, 1);
  const stations = [0, ...positions.filter((x) => Number.isFinite(x) && x > 0 && x < L), L];
  return <svg viewBox="0 0 640 190" className="chart" role="img" aria-label="Construction top-flange lateral bracing elevation">
    <path d={`M40 ${top(0)} L600 ${top(L)} M40 ${200 - top(0)} L600 ${200 - top(L)}`} stroke={C.ink} strokeWidth="4" fill="none" />
    <path d="M40 145 l-10 15 h20 Z M600 145 l-10 15 h20 Z" stroke={C.navy} fill="none" />
    <text x="20" y="150" fontSize="12">A</text><text x="615" y="150" fontSize="12">B</text>
    {positions.map((x, i) => Number.isFinite(x) && x > 0 && x < L && <g key={i} role="button" tabIndex={0} aria-label={`Select brace B${i + 1}`} onClick={() => onSelect(i)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i); } }} style={{ cursor: 'pointer' }}>
      <path d={`M${X(x)} ${top(x)} v-25 m-8 0 h16 m-12 -5 v10 m8 -10 v10`} fill="none" stroke={selected === i ? C.red : C.navy} strokeWidth="2" />
      <text x={X(x)} y={top(x) - 35} textAnchor="middle" fontSize="12" fill={C.navy}>B{i + 1}</text>
    </g>)}
    {stations.slice(1).map((x, i) => <g key={i} stroke={C.grey} strokeWidth="0.6"><path d={`M${X(stations[i])} 166 v14 m0 -7 H${X(x)} m0 -7 v14`} fill="none" /><text x={(X(x) + X(stations[i])) / 2} y="188" fontSize="11" stroke="none" textAnchor="middle">{fmt(x - stations[i], 3)} m</text></g>)}
  </svg>;
}
