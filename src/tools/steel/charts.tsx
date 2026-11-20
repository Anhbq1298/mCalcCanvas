/** mSteelBeamColumn drawing: the cross-section to scale. */
import { C, fmt } from '../composite/format';
import { SvgRich } from '../composite/rich';
import type { Shape } from './sections';

type V = Record<string, number>;

/** Section to scale with its main dimensions (sheet values, mm). */
export function SectionDrawing({ shape, v }: { shape: Shape; v: V }) {
  const W = 300, H = 260, pad = 46;
  const ext = shape === 'CHS' ? [v.d, v.d] : [v.b, v.h];
  if (!ext.every((x) => x > 0) || (shape === 'I' && !(v.tf > 0 && v.tw > 0)) || (shape !== 'I' && !(v.t > 0))) return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Section" />;
  const s = Math.min((W - 2 * pad) / ext[0], (H - 2 * pad) / ext[1]), cx = W / 2, cy = H / 2;
  const X = (y: number) => cx + y * s, Y = (z: number) => cy - z * s;
  const fill = { fill: '#DDE3EC', stroke: C.navy, strokeWidth: 1.4 };
  const dim = (x1: number, y1: number, x2: number, y2: number, label: string, side: 'h' | 'v') => (
    <g stroke={C.grey} strokeWidth={0.8} fill={C.grey} fontSize={11}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} markerStart="url(#arr)" markerEnd="url(#arr)" />
      <text stroke="none" x={side === 'h' ? (x1 + x2) / 2 : x1 - 6} y={side === 'h' ? y1 - 5 : (y1 + y2) / 2} textAnchor={side === 'h' ? 'middle' : 'end'} dominantBaseline={side === 'v' ? 'middle' : undefined}><SvgRich text={label} /></text>
    </g>
  );
  let body: React.ReactNode;
  if (shape === 'I') {
    const { h, b, tw, tf } = v, r = v.r || 0;
    // outline with root radii, clockwise from top-left
    const p = (y: number, z: number) => `${X(y)},${Y(z)}`;
    const arc = (y: number, z: number, sweep: 0 | 1) => `A${r * s},${r * s} 0 0 ${sweep} ${p(y, z)}`;
    const d = [`M${p(-b / 2, h / 2)}`, `L${p(b / 2, h / 2)}`, `L${p(b / 2, h / 2 - tf)}`, `L${p(tw / 2 + r, h / 2 - tf)}`, arc(tw / 2, h / 2 - tf - r, 0),
      `L${p(tw / 2, -h / 2 + tf + r)}`, arc(tw / 2 + r, -h / 2 + tf, 0), `L${p(b / 2, -h / 2 + tf)}`, `L${p(b / 2, -h / 2)}`, `L${p(-b / 2, -h / 2)}`, `L${p(-b / 2, -h / 2 + tf)}`,
      `L${p(-tw / 2 - r, -h / 2 + tf)}`, arc(-tw / 2, -h / 2 + tf + r, 0), `L${p(-tw / 2, h / 2 - tf - r)}`, arc(-tw / 2 - r, h / 2 - tf, 0), `L${p(-b / 2, h / 2 - tf)}`, 'Z'].join(' ');
    body = <>
      <path d={d} {...fill} />
      {dim(X(-b / 2), Y(h / 2) - 12, X(b / 2), Y(h / 2) - 12, `b = ${fmt(b, 0)}`, 'h')}
      {dim(X(-b / 2) - 12, Y(h / 2), X(-b / 2) - 12, Y(-h / 2), `h = ${fmt(h, 0)}`, 'v')}
      <text x={X(tw / 2) + 6} y={cy + 16} fontSize={11} fill={C.grey}><SvgRich text={`t_w = ${fmt(tw, 1)}`} /></text>
      <text x={X(b / 2) + 4} y={Y(-h / 2 + tf / 2) + 4} fontSize={11} fill={C.grey}><SvgRich text={`t_f = ${fmt(tf, 1)}`} /></text>
    </>;
  } else if (shape === 'RHS') {
    const { h, b, t, ro, ri } = v;
    const rr = (B: number, Hh: number, r: number) => `M${X(-B / 2 + r)},${Y(Hh / 2)} H${X(B / 2 - r)} A${r * s},${r * s} 0 0 1 ${X(B / 2)},${Y(Hh / 2 - r)} V${Y(-Hh / 2 + r)} A${r * s},${r * s} 0 0 1 ${X(B / 2 - r)},${Y(-Hh / 2)} H${X(-B / 2 + r)} A${r * s},${r * s} 0 0 1 ${X(-B / 2)},${Y(-Hh / 2 + r)} V${Y(Hh / 2 - r)} A${r * s},${r * s} 0 0 1 ${X(-B / 2 + r)},${Y(Hh / 2)} Z`;
    body = <>
      <path d={`${rr(b, h, ro)} ${rr(b - 2 * t, h - 2 * t, ri)}`} fillRule="evenodd" {...fill} />
      {dim(X(-b / 2), Y(h / 2) - 12, X(b / 2), Y(h / 2) - 12, `b = ${fmt(b, 0)}`, 'h')}
      {dim(X(-b / 2) - 12, Y(h / 2), X(-b / 2) - 12, Y(-h / 2), `h = ${fmt(h, 0)}`, 'v')}
      <text x={X(b / 2)} y={Y(-h / 2) + 16} fontSize={11} fill={C.grey} textAnchor="end">t = {fmt(t, 1)}</text>
    </>;
  } else {
    const { d, t } = v;
    body = <>
      <path d={`M${X(-d / 2)},${cy} a${(d / 2) * s},${(d / 2) * s} 0 1 0 ${d * s},0 a${(d / 2) * s},${(d / 2) * s} 0 1 0 ${-d * s},0 M${X(-d / 2 + t)},${cy} a${(d / 2 - t) * s},${(d / 2 - t) * s} 0 1 0 ${(d - 2 * t) * s},0 a${(d / 2 - t) * s},${(d / 2 - t) * s} 0 1 0 ${-(d - 2 * t) * s},0`} fillRule="evenodd" {...fill} />
      {dim(X(-d / 2), Y(d / 2) - 12, X(d / 2), Y(d / 2) - 12, `d = ${fmt(d, 1)}`, 'h')}
      <text x={X(d / 2)} y={Y(-d / 2) + 16} fontSize={11} fill={C.grey} textAnchor="end">t = {fmt(t, 1)}</text>
    </>;
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cross-section to scale" data-testid="section-drawing" style={{ width: '100%', maxWidth: 360 }}>
      <defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9" fill="none" stroke={C.grey} strokeWidth="1.2" /></marker></defs>
      <g stroke={C.rule} strokeDasharray="4 3" strokeWidth={0.8}>
        <line x1={pad / 2} y1={cy} x2={W - pad / 2} y2={cy} /><line x1={cx} y1={pad / 2} x2={cx} y2={H - pad / 2} />
      </g>
      {body}
      <text x={W - pad / 2} y={cy - 4} fontSize={11} fill={C.grey} textAnchor="end">y</text>
      <text x={cx + 4} y={H - pad / 2} fontSize={11} fill={C.grey}>z</text>
    </svg>
  );
}
