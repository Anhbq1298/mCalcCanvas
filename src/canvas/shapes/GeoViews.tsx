import type { DrawShape, ImageShape, LineShape, RectShape } from '../model/types';

/** Invisible wide stroke so thin lines are easy to hit. */
const HIT = 12;

export function ImageView({ shape }: { shape: ImageShape }) {
  return (
    <img
      src={shape.props.src}
      alt=""
      draggable={false}
      style={{ width: shape.props.w, height: shape.props.h, maxWidth: 'none', display: 'block', userSelect: 'none' }}
    />
  );
}

export function RectView({ shape }: { shape: RectShape }) {
  const { w, h, stroke, strokeWidth } = shape.props;
  return (
    <svg width={w} height={h} style={{ overflow: 'visible', display: 'block' }}>
      <rect x={0} y={0} width={w} height={h} fill="transparent" stroke="transparent" strokeWidth={HIT} style={{ pointerEvents: 'stroke' }} />
      <rect x={0} y={0} width={w} height={h} fill="none" stroke={stroke} strokeWidth={strokeWidth} style={{ pointerEvents: 'none' }} />
    </svg>
  );
}

export function LineView({ shape }: { shape: LineShape }) {
  const { x2, y2, stroke, strokeWidth, arrow } = shape.props;
  const len = Math.hypot(x2, y2) || 1;
  const ux = x2 / len;
  const uy = y2 / len;
  const head = Math.min(14, len * 0.4) + strokeWidth;
  const hx1 = x2 - ux * head - uy * head * 0.5;
  const hy1 = y2 - uy * head + ux * head * 0.5;
  const hx2 = x2 - ux * head + uy * head * 0.5;
  const hy2 = y2 - uy * head - ux * head * 0.5;
  return (
    <svg width={1} height={1} style={{ overflow: 'visible', display: 'block' }}>
      <line x1={0} y1={0} x2={x2} y2={y2} stroke="transparent" strokeWidth={HIT} style={{ pointerEvents: 'stroke' }} />
      <line x1={0} y1={0} x2={x2} y2={y2} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
      {arrow && len > 2 && (
        <polygon points={`${x2},${y2} ${hx1},${hy1} ${hx2},${hy2}`} fill={stroke} stroke={stroke} strokeWidth={1} strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
      )}
    </svg>
  );
}

function drawPath(points: [number, number][]): string {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0][0]},${points[0][1]} l0.01,0`;
  // Few points = a deliberate polygon (e.g. a support symbol): keep corners sharp.
  if (points.length <= 6) return 'M' + points.map(([x, y]) => `${x},${y}`).join(' L');
  // Quadratic smoothing through midpoints.
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += ` Q${x},${y} ${(x + nx) / 2},${(y + ny) / 2}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last[0]},${last[1]}`;
}

export function DrawView({ shape }: { shape: DrawShape }) {
  const d = drawPath(shape.props.points);
  return (
    <svg width={1} height={1} style={{ overflow: 'visible', display: 'block' }}>
      <path d={d} fill="none" stroke="transparent" strokeWidth={HIT} style={{ pointerEvents: 'stroke' }} />
      <path d={d} fill="none" stroke={shape.props.stroke} strokeWidth={shape.props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
    </svg>
  );
}
