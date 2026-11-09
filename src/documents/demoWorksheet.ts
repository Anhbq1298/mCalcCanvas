import { newShapeId } from '../canvas/model/canvasStore';
import { DEFAULT_MATH_PROPS, DEFAULT_TEXT_PROPS, type MathProps, type Shape } from '../canvas/model/types';
import { escapeHtml } from '../canvas/sanitize';

/**
 * "Simply Supported Steel Beam Calculation" sample. Every number shown on
 * the sheet is computed by the engine from these LaTeX inputs.
 * Coordinates are A4 page pixels (794 × 1123 at 96 dpi, 20 mm ≈ 76 px margins).
 */
export function demoWorksheetShapes(): Shape[] {
  const out: Shape[] = [];
  const text = (x: number, y: number, t: string, opts: { size?: number; bold?: boolean; color?: string; w?: number; heading?: 1 | 2 } = {}) =>
    out.push({
      id: newShapeId(),
      type: 'text',
      x,
      y,
      props: {
        ...DEFAULT_TEXT_PROPS,
        w: opts.w ?? 330,
        html: opts.bold ? `<b>${escapeHtml(t)}</b>` : escapeHtml(t),
        fontSize: opts.size ?? 13,
        color: opts.color ?? '#0f172a',
        ...(opts.heading ? { heading: opts.heading } : {}),
      },
    });
  const math = (x: number, y: number, latex: string, extra: Partial<MathProps> = {}) =>
    out.push({ id: newShapeId(), type: 'math', x, y, props: { ...DEFAULT_MATH_PROPS, fontSize: 16, latex, ...extra } });

  // Baseline of each line on major grid line n (40 px apart); snapped on load.
  const ln = (n: number) => 60 + 40 * n - 20;
  text(80, ln(1), 'SIMPLY SUPPORTED STEEL BEAM CALCULATION', { size: 20, bold: true, color: '#1e3a5f', w: 620, heading: 1 });
  text(80, ln(2), 'ULS bending and shear check of a simply supported beam (EN 1990 load factors).', { color: '#475569', w: 620 });

  text(80, ln(3), '1. DESIGN PARAMETERS', { size: 15, bold: true, heading: 2 });
  text(80, ln(4), 'Span, tributary width and characteristic area loads.', { color: '#475569', w: 520 });
  math(96, ln(5), 'L\\coloneq8.5\\,\\mathrm{m}');
  math(300, ln(5), 'b\\coloneq2\\,\\mathrm{m}');
  math(96, ln(6), 'G\\coloneq5\\,\\mathrm{kPa}');
  math(300, ln(6), 'Q\\coloneq5\\,\\mathrm{kPa}');

  text(80, ln(8), '2. DESIGN LOADING', { size: 15, bold: true, heading: 2 });
  math(96, ln(9), 'w\\coloneq\\left(1.35G+1.5Q\\right)b');

  text(80, ln(11), '3. BENDING MOMENT', { size: 15, bold: true, heading: 2 });
  math(96, ln(12), 'M_{Ed}\\coloneq\\frac{wL^2}{8}', { displayMode: 'full' });

  text(80, ln(16), '4. SHEAR FORCE', { size: 15, bold: true, heading: 2 });
  math(96, ln(17), 'V_{Ed}\\coloneq\\frac{wL}{2}');

  text(80, ln(19), '5. CAPACITY CHECK', { size: 15, bold: true, heading: 2 });
  math(96, ln(20), 'M_{Rd}\\coloneq300\\,\\mathrm{kN}\\cdot\\mathrm{m}');
  math(96, ln(21), '\\eta_{M}\\coloneq\\frac{M_{Ed}}{M_{Rd}}');
  math(96, ln(22), '\\eta_{M}\\le1');

  // Beam sketch: support line, span and load arrows.
  const sketchStart = out.length;
  const S = '#1e3a5f';
  out.push({ id: newShapeId(), type: 'line', x: 440, y: 460, props: { x2: 220, y2: 0, stroke: S, strokeWidth: 2.5, arrow: false } });
  for (let i = 0; i <= 5; i++) {
    out.push({ id: newShapeId(), type: 'line', x: 440 + i * 44, y: 422, props: { x2: 0, y2: 34, stroke: '#2563eb', strokeWidth: 1.25, arrow: true } });
  }
  out.push({ id: newShapeId(), type: 'line', x: 440, y: 422, props: { x2: 220, y2: 0, stroke: '#2563eb', strokeWidth: 1.25, arrow: false } });
  out.push({ id: newShapeId(), type: 'draw', x: 440, y: 462, props: { points: [[0, 0], [-9, 15], [9, 15], [0, 0]], stroke: S, strokeWidth: 1.5 } });
  out.push({ id: newShapeId(), type: 'draw', x: 660, y: 462, props: { points: [[0, 0], [-9, 15], [9, 15], [0, 0]], stroke: S, strokeWidth: 1.5 } });
  out.push({ id: newShapeId(), type: 'text', x: 520, y: 482, props: { ...DEFAULT_TEXT_PROPS, w: 60, align: 'center', html: '<i>L</i>', fontSize: 14, color: '#475569' } });
  out.push({ id: newShapeId(), type: 'text', x: 520, y: 396, props: { ...DEFAULT_TEXT_PROPS, w: 60, align: 'center', html: '<i>w</i>', fontSize: 14, color: '#2563eb' } });
  const sketchGroup = newShapeId();
  for (const shape of out.slice(sketchStart)) shape.groupId = sketchGroup;
  return out;
}
