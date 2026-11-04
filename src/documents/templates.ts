/**
 * Worksheet templates. Each one is a ready-to-edit calculation that shows the
 * app's features: outline headings (H1–H3), inputs with units, every display
 * format, result units, checks with PASS/FAIL, a sketch and two A4 pages.
 */
import { newShapeId } from '../canvas/model/canvasStore';
import { DEFAULT_MATH_PROPS, DEFAULT_TEXT_PROPS, PARAGRAPH_STYLES, type MathProps, type Shape } from '../canvas/model/types';
import type { DocumentMetadata } from './DocumentTypes';
import { escapeHtml } from '../canvas/sanitize';
import { demoWorksheetShapes } from './demoWorksheet';
import { A4, PAGE_GAP } from '../export/pageGeometry';

export type TemplateId = 'blank' | 'steel-beam' | 'rc-beam';

export interface WorksheetTemplate {
  id: TemplateId;
  name: string;
  description: string;
  title: string;
  metadata: DocumentMetadata;
  shapes(): Shape[];
}

function builder() {
  const out: Shape[] = [];
  const text = (x: number, y: number, t: string, o: { heading?: 1 | 2 | 3; color?: string; w?: number; size?: number; italic?: boolean } = {}) => {
    const st = PARAGRAPH_STYLES[o.heading ?? 0];
    const body = escapeHtml(t);
    out.push({
      id: newShapeId(),
      type: 'text',
      x,
      y,
      props: {
        ...DEFAULT_TEXT_PROPS,
        w: o.w ?? 600,
        html: o.italic ? `<i>${body}</i>` : body,
        fontSize: o.size ?? (o.heading ? st.fontSize : 14),
        color: o.color ?? (o.heading ? st.color : '#475569'),
        ...(o.heading ? { heading: o.heading } : {}),
      },
    });
  };
  const math = (x: number, y: number, latex: string, extra: Partial<MathProps> = {}) =>
    out.push({ id: newShapeId(), type: 'math', x, y, props: { ...DEFAULT_MATH_PROPS, latex, ...extra } });
  return { out, text, math };
}

/** Circle as a closed freehand path (for reinforcement bars in sketches). */
function circle(cx: number, cy: number, r: number, color: string): Shape {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 16; i++) pts.push([r * Math.cos((i / 16) * 2 * Math.PI), r * Math.sin((i / 16) * 2 * Math.PI)]);
  return { id: newShapeId(), type: 'draw', x: cx, y: cy, props: { points: pts, stroke: color, strokeWidth: 2.5 } };
}

/** Reinforced concrete beam, bending design to EN 1992-1-1 (rectangular section, singly reinforced). */
function rcBeamShapes(): Shape[] {
  const { out, text, math } = builder();
  const P2 = A4.h + PAGE_GAP; // top of page 2

  // ---- Page 1 -------------------------------------------------------------
  text(80, 80, 'RC BEAM – BENDING DESIGN TO EN 1992-1-1', { heading: 1 });
  text(80, 114, 'Template: edit the inputs in section 2 (or in the Parameters panel) and every result updates. Change how a result is shown with Format → Equation display.', { w: 620 });

  text(80, 170, '1. DESIGN BASIS', { heading: 2 });
  text(80, 196, 'ULS, EN 1990 eq. 6.10 (1.35 G + 1.5 Q). Rectangular section, singly reinforced, simplified rectangular stress block (EN 1992-1-1 §3.1.7). Simply supported span, uniform load.', { w: 620 });

  text(80, 260, '2. INPUTS', { heading: 2 });
  text(80, 290, '2.1 Materials', { heading: 3 });
  math(96, 316, 'f_{ck}\\coloneq30\\,\\mathrm{MPa}');
  math(270, 316, '\\gamma_{c}\\coloneq1.5');
  math(420, 316, '\\alpha_{cc}\\coloneq0.85');
  math(96, 356, 'f_{yk}\\coloneq500\\,\\mathrm{MPa}');
  math(270, 356, '\\gamma_{s}\\coloneq1.15');

  text(80, 410, '2.2 Section', { heading: 3 });
  math(96, 436, 'b\\coloneq300\\,\\mathrm{mm}');
  math(270, 436, 'h\\coloneq600\\,\\mathrm{mm}');
  math(96, 476, 'c_{nom}\\coloneq35\\,\\mathrm{mm}');
  math(270, 476, '\\phi_{w}\\coloneq10\\,\\mathrm{mm}');
  math(96, 516, '\\phi\\coloneq20\\,\\mathrm{mm}');
  math(270, 516, 'n\\coloneq6');
  text(96, 556, 'n = number of tension bars of diameter ϕ.', { w: 330, size: 12.5, italic: true });

  // Section sketch (to scale 300 × 600 → 60 × 120).
  const SX = 560;
  const SY = 430;
  const ink = '#1e3a5f';
  out.push({ id: newShapeId(), type: 'rect', x: SX, y: SY, props: { w: 60, h: 120, stroke: ink, strokeWidth: 2 } });
  out.push({ id: newShapeId(), type: 'rect', x: SX + 7, y: SY + 7, props: { w: 46, h: 106, stroke: '#94a3b8', strokeWidth: 1 } });
  for (const cx of [SX + 13, SX + 30, SX + 47]) out.push(circle(cx, SY + 106, 3.5, '#dc2626'));
  out.push({ id: newShapeId(), type: 'text', x: SX, y: SY + 126, props: { ...DEFAULT_TEXT_PROPS, w: 60, h: 20, align: 'center', html: '<i>b</i>', fontSize: 13, color: '#475569' } });
  out.push({ id: newShapeId(), type: 'text', x: SX + 66, y: SY + 50, props: { ...DEFAULT_TEXT_PROPS, w: 20, h: 20, html: '<i>h</i>', fontSize: 13, color: '#475569' } });

  text(80, 600, '2.3 Span and loads', { heading: 3 });
  math(96, 626, 'L\\coloneq7.2\\,\\mathrm{m}');
  math(270, 626, 'g_{k}\\coloneq25\\,\\frac{\\mathrm{kN}}{\\mathrm{m}}');
  math(470, 626, 'q_{k}\\coloneq15\\,\\frac{\\mathrm{kN}}{\\mathrm{m}}');

  text(80, 700, '3. DESIGN ACTIONS', { heading: 2 });
  math(96, 730, 'w_{Ed}\\coloneq1.35g_{k}+1.5q_{k}', { displayMode: 'full' });
  math(96, 830, 'M_{Ed}\\coloneq\\frac{w_{Ed}L^2}{8}', { displayMode: 'full' });
  math(96, 980, 'V_{Ed}\\coloneq\\frac{w_{Ed}L}{2}', { displayMode: 'formulaResult' });

  // ---- Page 2 -------------------------------------------------------------
  text(80, P2 + 70, '4. MATERIAL DESIGN VALUES', { heading: 2 });
  math(96, P2 + 100, 'f_{cd}\\coloneq\\frac{\\alpha_{cc}f_{ck}}{\\gamma_{c}}', { displayMode: 'full' });
  math(400, P2 + 100, 'f_{yd}\\coloneq\\frac{f_{yk}}{\\gamma_{s}}');
  math(96, P2 + 210, 'f_{ctm}\\coloneq0.30\\left(\\frac{f_{ck}}{\\mathrm{MPa}}\\right)^{\\frac{2}{3}}\\,\\mathrm{MPa}');

  text(80, P2 + 290, '5. BENDING DESIGN', { heading: 2 });
  text(80, P2 + 318, '5.1 Effective depth', { heading: 3 });
  math(96, P2 + 344, 'd\\coloneq h-c_{nom}-\\phi_{w}-\\frac{\\phi}{2}', { displayMode: 'full', displayUnit: 'mm' });
  text(80, P2 + 450, '5.2 Lever arm', { heading: 3 });
  math(96, P2 + 476, 'K_{Ed}\\coloneq\\frac{M_{Ed}}{b\\cdot d^2\\cdot f_{ck}}');
  math(400, P2 + 476, 'K_{lim}\\coloneq0.167');
  math(96, P2 + 540, 'K_{Ed}\\le K_{lim}');
  text(400, P2 + 544, 'No compression steel needed.', { w: 300, size: 12.5, italic: true });
  math(96, P2 + 590, 'z\\coloneq\\min\\left(d\\left(0.5+\\sqrt{0.25-\\frac{K_{Ed}}{1.134}}\\right),0.95d\\right)', { displayUnit: 'mm', precision: 0 });
  text(80, P2 + 660, '5.3 Tension reinforcement', { heading: 3 });
  math(96, P2 + 686, 'A_{s.req}\\coloneq\\frac{M_{Ed}}{f_{yd}z}', { displayUnit: 'mm^2', precision: 0 });
  math(400, P2 + 686, 'A_{s.prov}\\coloneq n\\frac{\\pi\\phi^2}{4}', { displayUnit: 'mm^2', precision: 0 });
  math(96, P2 + 750, '\\eta_{M}\\coloneq\\frac{A_{s.req}}{A_{s.prov}}');
  math(400, P2 + 756, '\\eta_{M}\\le1');

  text(80, P2 + 820, '6. MINIMUM REINFORCEMENT (§9.2.1.1)', { heading: 2 });
  math(96, P2 + 850, 'A_{s.min}\\coloneq\\max\\left(0.26\\frac{f_{ctm}}{f_{yk}}b\\cdot d,0.0013b\\cdot d\\right)', { displayUnit: 'mm^2', precision: 0 });
  math(96, P2 + 910, 'A_{s.min}\\le A_{s.prov}');

  text(80, P2 + 960, '7. SUMMARY', { heading: 2 });
  math(96, P2 + 990, 'M_{Ed}=');
  math(300, P2 + 990, 'A_{s.prov}=', { displayUnit: 'mm^2', precision: 0 });
  math(500, P2 + 990, '\\eta_{M}=');
  return out;
}

export const TEMPLATES: WorksheetTemplate[] = [
  {
    id: 'rc-beam',
    name: 'RC beam – bending (EN 1992-1-1)',
    description: 'Two-page report with sections, inputs, full calculations, checks and a section sketch.',
    title: 'RC Beam Bending Design',
    metadata: { project: 'Project name', calculationReference: 'CALC-002', preparedBy: '', checkedBy: '', revision: 'A' },
    shapes: rcBeamShapes,
  },
  {
    id: 'steel-beam',
    name: 'Steel beam – simply supported',
    description: 'One-page sample: loads, bending moment, shear and a capacity check.',
    title: 'Simply Supported Steel Beam Calculation',
    metadata: { project: 'Demonstration project', calculationReference: 'CALC-001', preparedBy: '', checkedBy: '', revision: 'A' },
    shapes: demoWorksheetShapes,
  },
];

export function templateById(id: TemplateId): WorksheetTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
