import { memo, useContext } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCalculationStore } from '../../store/calculationStore';
import { ReportResults } from '../../store/reportResults';
import { buildGraphData, graphRegionId, dataRange, GRAPH_FIELDS, niceStep, tickLabel, valueLabel, type Range } from '../graphData';
import { fontStack, type GraphShape } from '../model/types';

export const GraphView = memo(function GraphView({ shape }: { shape: GraphShape }) {
  const ids = shape.props.series.flatMap((s) => GRAPH_FIELDS.map((f) => graphRegionId(shape.id, s.id, f)));
  const report = useContext(ReportResults);
  const live = useCalculationStore(useShallow((st) => ids.map((id) => st.results[id])));
  const results = report ? ids.map((id) => report[id]) : live;
  const byId = new Map(ids.map((id, i) => [id, results[i]]));
  const data = buildGraphData(shape, (id) => byId.get(id));
  const { w, h, title, xLabel, yLabel, equalAxes, grid, axesAtOrigin, background, invertY } = shape.props;
  const FONT = fontStack(shape.props.font);

  // Legend: one or more rows under the x-axis label, items wrapped to the plot width.
  const legend = data.plots.filter((p) => p.series.label);
  const LEG_ROW = 14;
  const legendPos: { x: number; row: number }[] = [];
  {
    const avail = Math.max(60, w - 52 - 12);
    let x = 0;
    let row = 0;
    for (const p of legend) {
      const itemW = 18 + p.series.label.length * 5.6 + 14;
      if (x > 0 && x + itemW > avail) {
        x = 0;
        row++;
      }
      legendPos.push({ x, row });
      x += itemW;
    }
  }
  const legendRows = legend.length ? legendPos[legendPos.length - 1].row + 1 : 0;
  const legendH = legendRows ? legendRows * LEG_ROW + 4 : 0;
  const axisLabelH = xLabel || data.xUnit ? 40 : 26;
  const m = { l: 52, r: 12, t: title ? 26 : 12, b: axisLabelH + legendH };
  const pw = Math.max(10, w - m.l - m.r);
  const ph = Math.max(10, h - m.t - m.b);
  const range = dataRange(data.plots);

  let body: React.ReactNode = null;
  if (range) {
    let { x, y } = range;
    // Small margin so markers on the boundary are not clipped.
    const mx = (x.max - x.min) * 0.04;
    const my = (y.max - y.min) * 0.04;
    x = { min: x.min - mx, max: x.max + mx };
    y = { min: y.min - my, max: y.max + my };
    let sx = pw / (x.max - x.min);
    let sy = ph / (y.max - y.min);
    if (equalAxes) {
      const s = Math.min(sx, sy);
      const cx = (x.min + x.max) / 2;
      const cy = (y.min + y.max) / 2;
      sx = sy = s;
      x = { min: cx - pw / s / 2, max: cx + pw / s / 2 };
      y = { min: cy - ph / s / 2, max: cy + ph / s / 2 };
    }
    const X = (v: number) => m.l + (v - x.min) * sx;
    const Y = (v: number) => (invertY ? m.t + (v - y.min) * sy : m.t + ph - (v - y.min) * sy);
    const stepX = niceStep(x.max - x.min);
    const stepY = equalAxes ? stepX : niceStep(y.max - y.min);
    const ticks = (r: Range, step: number) => {
      const out: number[] = [];
      for (let v = Math.ceil(r.min / step) * step; v <= r.max + step * 1e-9 && out.length < 50; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
      return out;
    };
    const tx = ticks(x, stepX);
    const ty = ticks(y, stepY);
    body = (
      <>
        <g stroke="#e2e8f0" strokeWidth={1}>
          {grid && tx.map((v) => <line key={`gx${v}`} x1={X(v)} x2={X(v)} y1={m.t} y2={m.t + ph} />)}
          {grid && ty.map((v) => <line key={`gy${v}`} x1={m.l} x2={m.l + pw} y1={Y(v)} y2={Y(v)} />)}
        </g>
        {axesAtOrigin && (
          // Axis lines through (0, 0) when it is in view; values stay on the bottom/left edges.
          <g stroke="#334155" strokeWidth={1} data-testid="graph-axes">
            {y.min <= 0 && y.max >= 0 && <line x1={m.l} x2={m.l + pw} y1={Y(0)} y2={Y(0)} />}
            {x.min <= 0 && x.max >= 0 && <line x1={X(0)} x2={X(0)} y1={m.t} y2={m.t + ph} />}
          </g>
        )}
        <g stroke="#64748b" strokeWidth={1}>
          {tx.map((v) => <line key={`mx${v}`} x1={X(v)} x2={X(v)} y1={m.t + ph} y2={m.t + ph + 3} />)}
          {ty.map((v) => <line key={`my${v}`} x1={m.l - 3} x2={m.l} y1={Y(v)} y2={Y(v)} />)}
        </g>
        <g fill="#475569" fontSize={10} fontFamily={FONT}>
          {tx.map((v) => (
            <text key={`tx${v}`} x={X(v)} y={m.t + ph + 13} textAnchor="middle">
              {tickLabel(v, stepX)}
            </text>
          ))}
          {ty.map((v) => (
            <text key={`ty${v}`} x={m.l - 5} y={Y(v) + 3} textAnchor="end">
              {tickLabel(v, stepY)}
            </text>
          ))}
        </g>
        <clipPath id={`clip-${shape.id}`}>
          <rect x={m.l} y={m.t} width={pw} height={ph} />
        </clipPath>
        <g clipPath={`url(#clip-${shape.id})`}>
          {data.plots.map((p) => {
            const { series } = p;
            const common = { 'data-testid': 'graph-series', 'data-series': series.id, 'data-points': p.xs.length } as const;
            if (series.style === 'segments') {
              const pieces: string[][] = [];
              p.xs.forEach((v, i) => {
                if (i === 0 || !p.groups || p.groups[i] !== p.groups[i - 1]) pieces.push([]);
                pieces[pieces.length - 1].push(`${X(v).toFixed(2)},${Y(p.ys[i]).toFixed(2)}`);
              });
              return (
                <g key={series.id} {...common} data-pieces={pieces.length} fill="none" stroke={series.color} strokeWidth={series.width} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={series.dash ? '6 4' : undefined}>
                  {pieces.map((pts, j) => (pts.length > 1 ? <polyline key={j} points={pts.join(' ')} /> : null))}
                </g>
              );
            }
            if (series.style === 'area') {
              const pts = p.xs.map((v, i) => `${X(v).toFixed(2)},${Y(p.ys[i]).toFixed(2)}`);
              const base = Y(Math.min(Math.max(0, y.min), y.max)).toFixed(2);
              const fill = `${X(p.xs[0]).toFixed(2)},${base} ${pts.join(' ')} ${X(p.xs[p.xs.length - 1]).toFixed(2)},${base}`;
              return (
                <g key={series.id} {...common}>
                  <polygon points={fill} fill={series.color} fillOpacity={0.14} stroke="none" />
                  <polyline points={pts.join(' ')} fill="none" stroke={series.color} strokeWidth={series.width} strokeLinejoin="round" strokeDasharray={series.dash ? '6 4' : undefined} />
                </g>
              );
            }
            if (series.style === 'values') return null; // drawn unclipped below
            if (series.style === 'line') {
              const pts = p.xs.map((v, i) => `${X(v).toFixed(2)},${Y(p.ys[i]).toFixed(2)}`).join(' ');
              return <polyline key={series.id} {...common} points={pts} fill="none" stroke={series.color} strokeWidth={series.width} strokeLinejoin="round" strokeDasharray={series.dash ? '6 4' : undefined} />;
            }
            return (
              <g key={series.id} {...common} fill={series.color} fillOpacity={series.style === 'circle' ? 0.35 : 1} stroke={series.color} strokeWidth={series.style === 'circle' ? series.width : 0}>
                {p.xs.map((v, i) => (
                  <circle key={i} cx={X(v)} cy={Y(p.ys[i])} r={series.style === 'circle' ? Math.max(0.5, Math.abs(p.rs![i]) * sx) : series.width + 1.5} />
                ))}
              </g>
            );
          })}
        </g>
        {data.plots.filter((p) => p.series.style === 'values').map((p) => {
          const { series } = p;
          const common = { 'data-testid': 'graph-series', 'data-series': series.id, 'data-points': p.xs.length } as const;
          // Label away from the zero line: above positive values (below when the y axis is inverted).
          return (
            <g key={series.id} {...common} fill={series.color} fontSize={10.5} fontFamily={FONT} fontWeight={600}>
              {p.xs.map((v, i) => {
                const py = Y(p.ys[i]);
                // Away from the zero line, but kept inside the plot so it never meets the tick labels.
                let up = (p.ys[i] >= 0) !== !!invertY;
                if (!up && py + 14 > m.t + ph) up = true;
                else if (up && py - 16 < m.t) up = false;
                return (
                  <g key={i}>
                    <circle cx={X(v)} cy={py} r={series.width + 1} />
                    <text x={X(v)} y={py + (up ? -6 : 14)} textAnchor={X(v) < m.l + 30 ? 'start' : X(v) > m.l + pw - 30 ? 'end' : 'middle'}>
                      {valueLabel(p.ys[i])}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </>
    );
  }

  const axisX = [xLabel, data.xUnit && `(${data.xUnit})`].filter(Boolean).join(' ');
  const axisY = [yLabel, data.yUnit && `(${data.yUnit})`].filter(Boolean).join(' ');
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      data-testid="graph"
      data-series-count={data.plots.length}
      data-errors={data.errors.length}
      data-axes={axesAtOrigin ? 'origin' : 'frame'}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <rect x={0} y={0} width={w} height={h} fill={background} data-testid="graph-background" />
      {title && (
        <text x={m.l + pw / 2} y={16} textAnchor="middle" fontSize={12} fontWeight={600} fill="#0f172a" fontFamily={FONT}>
          {title}
        </text>
      )}
      {!axesAtOrigin && <rect x={m.l} y={m.t} width={pw} height={ph} fill="none" stroke="#94a3b8" strokeWidth={1} />}
      {body}
      {axisX && (
        <text x={m.l + pw / 2} y={h - 6 - legendH} textAnchor="middle" fontSize={11} fill="#334155" fontFamily={FONT}>
          {axisX}
        </text>
      )}
      {axisY && (
        <text transform={`translate(12 ${m.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="#334155" fontFamily={FONT}>
          {axisY}
        </text>
      )}
      {legend.length > 0 && (
        <g fontSize={10} fontFamily={FONT} fill="#334155" data-testid="graph-legend">
          {legend.map((p, i) => (
            <g key={p.series.id} transform={`translate(${m.l + legendPos[i].x} ${h - legendH + 10 + legendPos[i].row * LEG_ROW})`}>
              {p.series.style === 'line' || p.series.style === 'segments' || p.series.style === 'area' ? (
                <line x1={0} x2={14} y1={-3} y2={-3} stroke={p.series.color} strokeWidth={2} strokeDasharray={p.series.dash ? '4 2' : undefined} />
              ) : (
                <circle cx={7} cy={-3} r={3.5} fill={p.series.color} fillOpacity={p.series.style === 'circle' ? 0.35 : 1} stroke={p.series.color} />
              )}
              <text x={18} y={0}>
                {p.series.label}
              </text>
            </g>
          ))}
        </g>
      )}
      {!range && data.errors.length === 0 && (
        <text x={m.l + pw / 2} y={m.t + ph / 2} textAnchor="middle" fontSize={12} fill="#64748b" fontFamily={FONT}>
          {shape.props.series.length ? 'No data to plot yet' : 'Add a series in the Plots tab'}
        </text>
      )}
      {data.errors.length > 0 && (
        <g data-testid="graph-error">
          <rect x={m.l + 4} y={m.t + ph - 6 - 16 * Math.min(3, data.errors.length)} width={pw - 8} height={16 * Math.min(3, data.errors.length) + 2} fill="#fef2f2" stroke="#fca5a5" rx={3} />
          {data.errors.slice(0, 3).map((e, i) => (
            <text key={i} x={m.l + 10} y={m.t + ph - 6 - 16 * Math.min(3, data.errors.length) + 13 + i * 16} fontSize={10.5} fill="#b91c1c" fontFamily={FONT}>
              {e.length > 90 ? `${e.slice(0, 89)}…` : e}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
});
