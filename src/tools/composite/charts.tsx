/** Small SVG charts and drawings for mCompositeBeamDesign (no dependencies). */
import type { ReactNode } from 'react';

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

/** Line chart over x; invertY draws positive values downwards (moments, deflections). */
export function LineChart({ series, height = 170, invertY = false, xUnit = 'm', yUnit = '', labels = [], label = 'Chart' }: { series: Series[]; height?: number; invertY?: boolean; xUnit?: string; yUnit?: string; labels?: { x: number; y: number; text: string; color: string }[]; label?: string }) {
  const W = 640, H = height, m = { l: 48, r: 14, t: 12, b: 26 };
  const xs = series.flatMap((s) => s.x), ys = series.flatMap((s) => s.y).concat(0);
  if (!xs.length) return <div className="h-24 text-sm text-slate-500">No data</div>;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = (y1 - y0) * 0.12 || 1;
  y1 += pad; if (y0 < 0) y0 -= pad;
  const X = (v: number) => m.l + ((v - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const Y = (v: number) => (invertY ? m.t + ((v - y0) / (y1 - y0)) * (H - m.t - m.b) : H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
      {ticks(y0, y1).map((t) => (
        <g key={`y${t}`}>
          <line x1={m.l} x2={W - m.r} y1={Y(t)} y2={Y(t)} stroke="#eef2f6" />
          <text x={m.l - 6} y={Y(t) + 3.5} fontSize="10" textAnchor="end" fill="#475569">{t}</text>
        </g>
      ))}
      {ticks(x0, x1, 8).map((t) => (
        <text key={`x${t}`} x={X(t)} y={H - 8} fontSize="10" textAnchor="middle" fill="#475569">{t}</text>
      ))}
      <line x1={m.l} x2={W - m.r} y1={Y(0)} y2={Y(0)} stroke={C.ink} strokeWidth="1" />
      <text x={6} y={m.t + 8} fontSize="10" fill={C.muted}>{yUnit}</text>
      <text x={W - m.r} y={H - 8} fontSize="10" textAnchor="end" fill={C.muted} dx="0" dy="-12">{xUnit}</text>
      {series.map((s, i) => {
        const pts = s.x.map((v, j) => `${X(v).toFixed(1)},${Y(s.y[j]).toFixed(1)}`).join(' ');
        return (
          <g key={i}>
            {s.fill && <polygon points={`${X(s.x[0])},${Y(0)} ${pts} ${X(s.x[s.x.length - 1])},${Y(0)}`} fill={s.color} fillOpacity="0.12" />}
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash ? '6 4' : undefined} strokeLinejoin="round" />
          </g>
        );
      })}
      {labels.map((l, i) => (
        <g key={i}>
          <circle cx={X(l.x)} cy={Y(l.y)} r="3" fill={l.color} />
          <text x={X(l.x)} y={Y(l.y) + (invertY ? 14 : -7)} fontSize="10.5" fontWeight="600" textAnchor="middle" fill={l.color}>{l.text}</text>
        </g>
      ))}
    </svg>
  );
}

export function Legend({ items }: { items: { color: string; label: string; dash?: boolean }[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-4 text-[11.5px] text-slate-600">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" stroke={it.color} strokeWidth="2.5" strokeDasharray={it.dash ? '4 3' : undefined} /></svg>
          {it.label}
        </span>
      ))}
    </div>
  );
}

export interface AreaLoad { x1: number; x2: number; p: number; q: boolean }
export interface PointLoad { a: number; F: number; q: boolean }

/** Loading diagram: beam, supports, area loads (per row, G grey / Q green) and point loads. */
export function LoadingDiagram({ L, area, points, sb }: { L: number; area: AreaLoad[]; points: PointLoad[]; sb: number }) {
  const W = 640, x0 = 40, x1 = W - 30, beamY = 150;
  const X = (v: number) => x0 + (Math.min(Math.max(v, 0), L) / (L || 1)) * (x1 - x0);
  const blocks: ReactNode[] = [];
  let top = beamY - 8;
  const maxW = Math.max(1e-9, ...area.map((a) => a.p * sb));
  area.forEach((a, i) => {
    const h = 12 + 26 * ((a.p * sb) / maxW);
    const color = a.q ? C.green : C.grey;
    top -= h;
    blocks.push(
      <g key={`a${i}`}>
        <rect x={X(a.x1)} y={top} width={Math.max(2, X(a.x2) - X(a.x1))} height={h} fill={color} fillOpacity="0.18" stroke={color} />
        <text x={X(a.x2) + 4 > W - 120 ? X(a.x1) + 4 : X(a.x2) + 4} y={top + h / 2 + 4} fontSize="10.5" fill={color}>{`${a.q ? 'Q' : 'G'}: ${fmt(a.p, 2)} kPa × ${fmt(sb, 2)} m = ${fmt(a.p * sb, 2)} kN/m`}</text>
      </g>,
    );
  });
  const maxF = Math.max(1e-9, ...points.map((p) => p.F));
  const groups = new Map<number, PointLoad[]>();
  points.forEach((p) => groups.set(p.a, [...(groups.get(p.a) ?? []), p]));
  const arrows: ReactNode[] = [];
  [...groups.entries()].forEach(([a, ps], gi) => {
    ps.forEach((p, j) => {
      const len = 28 + 46 * (p.F / maxF);
      const x = X(a) + (j - (ps.length - 1) / 2) * 9;
      const color = p.q ? C.green : C.navy;
      arrows.push(
        <g key={`p${gi}-${j}`}>
          <line x1={x} x2={x} y1={beamY - 8 - len} y2={beamY - 10} stroke={color} strokeWidth="2" markerEnd={p.q ? 'url(#ahq)' : 'url(#ahg)'} />
          <text x={x + (ps.length > 1 ? (j % 2 ? 6 : -6) : 0)} y={beamY - 14 - len} fontSize="10.5" fontWeight="600" textAnchor={ps.length > 1 ? (j % 2 ? 'start' : 'end') : 'middle'} fill={color} paintOrder="stroke" stroke="#fff" strokeWidth="3">{`${p.q ? 'Q' : 'G'} ${fmt(p.F, 0)} kN`}</text>
        </g>,
      );
    });
    arrows.push(<text key={`d${gi}`} x={X(a)} y={beamY + 34} fontSize="10" textAnchor="middle" fill={C.muted}>{`a = ${fmt(a, 2)} m`}</text>);
  });
  return (
    <svg viewBox={`0 0 ${W} 200`} className="w-full" role="img" aria-label="Loading diagram">
      <defs>
        <marker id="ahg" markerWidth="8" markerHeight="8" refX="4" refY="7" orient="auto"><path d="M0,0 L8,0 L4,8 z" transform="rotate(-90 4 4)" fill={C.navy} /></marker>
        <marker id="ahq" markerWidth="8" markerHeight="8" refX="4" refY="7" orient="auto"><path d="M0,0 L8,0 L4,8 z" transform="rotate(-90 4 4)" fill={C.green} /></marker>
      </defs>
      {blocks}
      {arrows}
      <rect x={x0} y={beamY - 6} width={x1 - x0} height="12" fill={C.navy} rx="1" />
      <path d={`M${x0},${beamY + 6} l-10,16 h20 z`} fill="none" stroke={C.ink} strokeWidth="1.5" />
      <path d={`M${x1},${beamY + 6} l-10,16 h20 z`} fill="none" stroke={C.ink} strokeWidth="1.5" />
      <line x1={x1 - 12} x2={x1 + 12} y1={beamY + 26} y2={beamY + 26} stroke={C.ink} strokeWidth="1.5" />
      <text x={(x0 + x1) / 2} y={196} fontSize="11" textAnchor="middle" fill={C.ink}>{`L = ${fmt(L, 2)} m`}</text>
      <text x={x0} y={196} fontSize="10" fill={C.muted}>A</text>
      <text x={x1} y={196} fontSize="10" textAnchor="end" fill={C.muted}>B</text>
    </svg>
  );
}

/** Composite section to scale (slab b_eff × h_c over the I section), with the plastic stress block. */
export function SectionDrawing({ r, showPna }: { r: Record<string, number>; showPna: boolean }) {
  const { h_a, b_a, t_f, t_w, h_c, b_eff } = r;
  if (![h_a, b_a, t_f, t_w, h_c, b_eff].every(Number.isFinite)) return null;
  const W = 300, H = 270;
  const total = h_c + h_a;
  const sc = Math.min(220 / total, 200 / b_a);
  const cx = W / 2, top = 26;
  const broken = b_eff * sc > 280; // wide slab: drawn cut, b_eff given in the label
  const slabW = Math.min(b_eff * sc, 280);
  const Y = (mm: number) => top + mm * sc;
  const xa = cx - (b_a * sc) / 2;
  const kM = r.kM, xc = showPna ? (kM === 0 ? r.xf : r.xc) : NaN, ya = r.ya;
  return (
    <svg viewBox={`0 0 ${showPna ? W + 190 : W + 20} ${H}`} className="w-full" role="img" aria-label="Section">
      <rect x={cx - slabW / 2} y={Y(0)} width={slabW} height={h_c * sc} fill={C.concrete} stroke={C.muted} />
      {broken && [cx - slabW / 2, cx + slabW / 2].map((x, i) => (
        <path key={i} d={`M${x},${Y(0) - 4} l${i ? 5 : -5},${(h_c * sc) / 3 + 4} l${i ? -10 : 10},${(h_c * sc) / 3} l${i ? 5 : -5},${(h_c * sc) / 3 + 4}`} fill="none" stroke={C.muted} strokeWidth="1.2" />
      ))}
      <path
        d={`M${xa},${Y(h_c)} h${b_a * sc} v${t_f * sc} h${-(b_a - t_w) * sc / 2} V${Y(h_c + h_a - t_f)} h${(b_a - t_w) * sc / 2} v${t_f * sc} h${-b_a * sc} v${-t_f * sc} h${(b_a - t_w) * sc / 2} V${Y(h_c + t_f)} h${-(b_a - t_w) * sc / 2} z`}
        fill="#e2e8f0" stroke={C.navy} strokeWidth="1.5"
      />
      {showPna && Number.isFinite(xc) && <rect x={cx - slabW / 2} y={Y(0)} width={slabW} height={Math.min(xc, h_c) * sc} fill={C.blue} fillOpacity="0.28" />}
      {showPna && kM >= 1 && Number.isFinite(ya) && <line x1={xa - 20} x2={xa + b_a * sc + 20} y1={Y(h_c + ya)} y2={Y(h_c + ya)} stroke={C.red} strokeWidth="1.5" strokeDasharray="5 3" />}
      {/* stress block */}
      {showPna && (() => {
        const sx = cx + Math.max(slabW, b_a * sc) / 2 + 22, w = 30;
        const pnaY = kM >= 1 ? Y(h_c + ya) : Y(h_c);
        return (
          <g>
            <rect x={sx} y={Y(0)} width={w} height={Math.min(xc, h_c) * sc} fill={C.blue} fillOpacity="0.35" />
            <text x={sx + w + 4} y={Y(0) + 11} fontSize="10" fill={C.blue}>{`0.85 f_cd, x = ${fmt(xc, 1)} mm`}</text>
            {kM >= 1 && <rect x={sx} y={Y(h_c)} width={w} height={pnaY - Y(h_c)} fill={C.red} fillOpacity="0.35" />}
            <rect x={sx} y={pnaY} width={w} height={Y(h_c + h_a) - pnaY} fill={C.green} fillOpacity="0.3" />
            {kM >= 1 && <text x={sx + w + 4} y={pnaY + 4} fontSize="10" fill={C.red}>{`steel PNA, ${fmt(ya, 1)} mm below top`}</text>}
            <text x={sx + w + 4} y={Y(h_c + h_a) - 4} fontSize="10" fill={C.green}>f_yd tension</text>
          </g>
        );
      })()}
      <text x={cx} y={16} fontSize="10.5" textAnchor="middle" fill={C.muted}>{`b_eff = ${fmt(b_eff, 0)} mm${broken ? ' (slab drawn cut)' : ''}`}</text>
      <text x={cx - slabW / 2 + 10} y={Y(h_c / 2) + 4} fontSize="10" fill={C.ink}>{`h_c = ${fmt(h_c, 0)} mm`}</text>
      <text x={xa - 6} y={Y(h_c + h_a / 2)} fontSize="10" textAnchor="end" fill={C.muted}>{`h_a = ${fmt(h_a, 1)} mm`}</text>
    </svg>
  );
}
