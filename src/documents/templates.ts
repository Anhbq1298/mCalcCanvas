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

export type TemplateId = 'blank' | 'steel-beam' | 'rc-beam' | 'rc-column';

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

  // Layout on the ruled page: ln(n) = baseline on major line n (40 px apart)
  // of page 1; ln2(n) the same on page 2. Positions are snapped on load.
  const ln = (n: number) => 60 + 40 * n - 20;
  const ln2 = (n: number) => P2 + ln(n);

  // ---- Page 1 -------------------------------------------------------------
  text(80, ln(1), 'RC BEAM – BENDING DESIGN TO EN 1992-1-1', { heading: 1 });
  text(80, ln(2), 'Edit the inputs in section 2 (or in the Parameters panel) – every result updates.', { w: 620 });

  text(80, ln(3), '1. DESIGN BASIS', { heading: 2 });
  text(80, ln(4), 'ULS, EN 1990 eq. 6.10. Singly reinforced rectangular section (EN 1992-1-1 §3.1.7).', { w: 620 });

  text(80, ln(5), '2. INPUTS', { heading: 2 });
  text(80, ln(6), '2.1 Materials', { heading: 3 });
  math(96, ln(7), 'f_{ck}\\coloneq30\\,\\mathrm{MPa}');
  math(270, ln(7), '\\gamma_{c}\\coloneq1.5');
  math(420, ln(7), '\\alpha_{cc}\\coloneq0.85');
  math(96, ln(8), 'f_{yk}\\coloneq500\\,\\mathrm{MPa}');
  math(270, ln(8), '\\gamma_{s}\\coloneq1.15');

  text(80, ln(9), '2.2 Section', { heading: 3 });
  math(96, ln(10), 'b\\coloneq300\\,\\mathrm{mm}');
  math(270, ln(10), 'h\\coloneq600\\,\\mathrm{mm}');
  math(96, ln(11), 'c_{nom}\\coloneq35\\,\\mathrm{mm}');
  math(270, ln(11), '\\phi_{w}\\coloneq10\\,\\mathrm{mm}');
  math(96, ln(12), '\\phi\\coloneq20\\,\\mathrm{mm}');
  math(270, ln(12), 'n\\coloneq6');
  text(370, ln(12) + 3, 'tension bars of diameter ϕ', { w: 200, size: 12.5, italic: true });

  // Section sketch (to scale 300 × 600 → 60 × 120).
  const SX = 590;
  const SY = 60 + 40 * 9 + 10;
  const ink = '#1e3a5f';
  out.push({ id: newShapeId(), type: 'rect', x: SX, y: SY, props: { w: 60, h: 120, stroke: ink, strokeWidth: 2 } });
  out.push({ id: newShapeId(), type: 'rect', x: SX + 7, y: SY + 7, props: { w: 46, h: 106, stroke: '#94a3b8', strokeWidth: 1 } });
  for (const cx of [SX + 13, SX + 30, SX + 47]) out.push(circle(cx, SY + 106, 3.5, '#dc2626'));
  out.push({ id: newShapeId(), type: 'text', x: SX, y: SY + 124, props: { ...DEFAULT_TEXT_PROPS, w: 60, h: 20, align: 'center', html: '<i>b</i>', fontSize: 13, color: '#475569' } });
  out.push({ id: newShapeId(), type: 'text', x: SX + 66, y: SY + 50, props: { ...DEFAULT_TEXT_PROPS, w: 20, h: 20, html: '<i>h</i>', fontSize: 13, color: '#475569' } });

  text(80, ln(13), '2.3 Span and loads', { heading: 3 });
  math(96, ln(14), 'L\\coloneq7.2\\,\\mathrm{m}');
  math(270, ln(14), 'g_{k}\\coloneq25\\,\\frac{\\mathrm{kN}}{\\mathrm{m}}');
  math(470, ln(14), 'q_{k}\\coloneq15\\,\\frac{\\mathrm{kN}}{\\mathrm{m}}');

  text(80, ln(16), '3. DESIGN ACTIONS', { heading: 2 });
  math(96, ln(17), 'w_{Ed}\\coloneq1.35g_{k}+1.5q_{k}', { displayMode: 'formulaResult' });
  math(96, ln(19), 'M_{Ed}\\coloneq\\frac{w_{Ed}L^2}{8}', { displayMode: 'full' });
  math(96, ln(23), 'V_{Ed}\\coloneq\\frac{w_{Ed}L}{2}', { displayMode: 'formulaResult' });

  // ---- Page 2 -------------------------------------------------------------
  text(80, ln2(1), '4. MATERIAL DESIGN VALUES', { heading: 2 });
  math(96, ln2(2), 'f_{cd}\\coloneq\\frac{\\alpha_{cc}f_{ck}}{\\gamma_{c}}', { displayMode: 'full' });
  math(400, ln2(2), 'f_{yd}\\coloneq\\frac{f_{yk}}{\\gamma_{s}}');
  math(96, ln2(6), 'f_{ctm}\\coloneq0.30\\left(\\frac{f_{ck}}{\\mathrm{MPa}}\\right)^{\\frac{2}{3}}\\,\\mathrm{MPa}');

  text(80, ln2(7), '5. BENDING DESIGN', { heading: 2 });
  text(80, ln2(8), '5.1 Effective depth', { heading: 3 });
  math(96, ln2(9), 'd\\coloneq h-c_{nom}-\\phi_{w}-\\frac{\\phi}{2}', { displayMode: 'full', displayUnit: 'mm' });
  text(80, ln2(12), '5.2 Lever arm', { heading: 3 });
  math(96, ln2(13), 'K_{Ed}\\coloneq\\frac{M_{Ed}}{b\\cdot d^2\\cdot f_{ck}}');
  math(400, ln2(13), 'K_{lim}\\coloneq0.167');
  math(96, ln2(14), 'K_{Ed}\\le K_{lim}');
  text(400, ln2(14) + 3, 'No compression steel needed.', { w: 300, size: 12.5, italic: true });
  math(96, ln2(15), 'z\\coloneq\\min\\left(d\\left(0.5+\\sqrt{0.25-\\frac{K_{Ed}}{1.134}}\\right),0.95d\\right)', { displayUnit: 'mm', precision: 0 });
  text(80, ln2(16), '5.3 Tension reinforcement', { heading: 3 });
  math(96, ln2(17), 'A_{s.req}\\coloneq\\frac{M_{Ed}}{f_{yd}z}', { displayUnit: 'mm^2', precision: 0 });
  math(400, ln2(17), 'A_{s.prov}\\coloneq n\\frac{\\pi\\phi^2}{4}', { displayUnit: 'mm^2', precision: 0 });
  math(96, ln2(19), '\\eta_{M}\\coloneq\\frac{A_{s.req}}{A_{s.prov}}');
  math(400, ln2(19), '\\eta_{M}\\le1');

  text(80, ln2(20), '6. MINIMUM REINFORCEMENT (§9.2.1.1)', { heading: 2 });
  math(96, ln2(21), 'A_{s.min}\\coloneq\\max\\left(0.26\\frac{f_{ctm}}{f_{yk}}b\\cdot d,0.0013b\\cdot d\\right)', { displayUnit: 'mm^2', precision: 0 });
  math(96, ln2(22), 'A_{s.min}\\le A_{s.prov}');

  text(80, ln2(23), '7. SUMMARY', { heading: 2 });
  math(96, ln2(24), 'M_{Ed}=');
  math(300, ln2(24), 'A_{s.prov}=', { displayUnit: 'mm^2', precision: 0 });
  math(500, ln2(24), '\\eta_{M}=');
  return out;
}


/** Reinforced concrete column, concentric axial resistance to EN 1992-1-1. */
function rcColumnShapes(): Shape[] {
  const { out, text, math } = builder();
  const ln = (n: number) => 60 + 40 * n - 20;

  text(80, ln(1), 'RC COLUMN – AXIAL RESISTANCE TO EN 1992-1-1', { heading: 1 });
  text(80, ln(2), 'Use Input & Results to compare column sizes, materials, reinforcement and axial loads.', { w: 640 });

  text(80, ln(3), '1. INPUTS', { heading: 2 });
  text(80, ln(4), '1.1 Materials', { heading: 3 });
  math(96, ln(5), 'f_{ck}\\coloneq40\\,\\mathrm{MPa}');
  math(280, ln(5), 'f_{yk}\\coloneq500\\,\\mathrm{MPa}');
  math(500, ln(5), '\\alpha_{cc}\\coloneq0.85');
  math(96, ln(6), '\\gamma_{c}\\coloneq1.5');
  math(280, ln(6), '\\gamma_{s}\\coloneq1.15');

  text(80, ln(7), '1.2 Section and design action', { heading: 3 });
  math(96, ln(8), 'b\\coloneq600\\,\\mathrm{mm}');
  math(280, ln(8), 'h\\coloneq600\\,\\mathrm{mm}');
  math(500, ln(8), 'A_{s}\\coloneq9425\\,\\mathrm{mm}^2');
  math(96, ln(9), 'N_{Ed}\\coloneq6500\\,\\mathrm{kN}');

  const SX = 555;
  const SY = ln(10) + 4;
  const ink = '#1e3a5f';
  out.push({ id: newShapeId(), type: 'rect', x: SX, y: SY, props: { w: 116, h: 116, stroke: ink, strokeWidth: 2 } });
  out.push({ id: newShapeId(), type: 'rect', x: SX + 10, y: SY + 10, props: { w: 96, h: 96, stroke: '#94a3b8', strokeWidth: 1 } });
  for (const [cx, cy] of [[SX + 17, SY + 17], [SX + 58, SY + 17], [SX + 99, SY + 17], [SX + 17, SY + 58], [SX + 99, SY + 58], [SX + 17, SY + 99], [SX + 58, SY + 99], [SX + 99, SY + 99]]) {
    out.push(circle(cx, cy, 3.8, '#dc2626'));
  }

  text(80, ln(11), '2. DESIGN VALUES', { heading: 2 });
  math(96, ln(12), 'f_{cd}\\coloneq\\frac{\\alpha_{cc}f_{ck}}{\\gamma_{c}}', { displayMode: 'full' });
  math(400, ln(12), 'f_{yd}\\coloneq\\frac{f_{yk}}{\\gamma_{s}}', { displayMode: 'full' });
  math(96, ln(15), 'A_{c}\\coloneq b\\cdot h', { displayUnit: 'mm^2', precision: 0 });

  text(80, ln(16), '3. AXIAL RESISTANCE', { heading: 2 });
  math(96, ln(17), 'N_{Rd}\\coloneq f_{cd}\\left(A_{c}-A_{s}\\right)+f_{yd}A_{s}', { displayUnit: 'kN', precision: 0 });
  math(96, ln(19), '\\eta_{N}\\coloneq\\frac{N_{Ed}}{N_{Rd}}', { precision: 3 });
  math(400, ln(19), '\\eta_{N}\\le1');

  text(80, ln(21), '4. SCOPE NOTE', { heading: 2 });
  text(80, ln(22), 'This template demonstrates concentric section resistance only. Add slenderness, second-order effects and interaction checks for a complete column design.', { w: 650, size: 12.5 });
  return out;
}

export const TEMPLATES: WorksheetTemplate[] = [
  {
    id: 'rc-column',
    name: 'RC column – axial resistance (EN 1992-1-1)',
    description: 'One-page column template for batch comparison of section size, materials, reinforcement and axial load.',
    title: 'RC Column Axial Resistance',
    metadata: { project: 'Project name', calculationReference: 'CALC-003', preparedBy: '', checkedBy: '', revision: 'A' },
    shapes: rcColumnShapes,
  },
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
