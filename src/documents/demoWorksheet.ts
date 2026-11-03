import { createShapeId, type Editor, type TLRichText } from 'tldraw';
import { MATH_SHAPE_TYPE } from '../canvas/shapes/mathShapeTypes';

function rich(text: string, opts: { bold?: boolean } = {}): TLRichText {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text, ...(opts.bold ? { marks: [{ type: 'bold' }] } : {}) }],
      },
    ],
  } as TLRichText;
}

/**
 * "Simply Supported Steel Beam Calculation" sample. Every number shown on
 * the sheet is computed by the engine from these LaTeX inputs.
 * Coordinates are A4 page pixels (794 × 1123 at 96 dpi, 20 mm ≈ 76 px margins).
 */
export function createDemoWorksheet(editor: Editor): void {
  const text = (x: number, y: number, t: string, size: 's' | 'm' | 'l' = 's', bold = false, w = 600) =>
    editor.createShape({
      id: createShapeId(),
      type: 'text',
      x,
      y,
      props: { richText: rich(t, { bold }), size, font: 'sans', color: 'black', autoSize: false, w, textAlign: 'start' },
    });
  const math = (x: number, y: number, latex: string, extra: Record<string, unknown> = {}) =>
    editor.createShape({ id: createShapeId(), type: MATH_SHAPE_TYPE, x, y, props: { latex, ...extra } });

  editor.run(() => {
    text(80, 92, 'SIMPLY SUPPORTED STEEL BEAM CALCULATION', 'm', true, 600);
    text(80, 132, 'ULS bending and shear check of a simply supported beam under uniform load (EN 1990 load factors).', 's', false, 600);

    text(80, 196, '1. DESIGN PARAMETERS', 'm', true);
    text(80, 228, 'Span, tributary width and characteristic area loads.', 's');
    math(96, 262, 'L\\coloneq8.5\\,\\mathrm{m}');
    math(300, 262, 'b\\coloneq2\\,\\mathrm{m}');
    math(96, 306, 'G\\coloneq5\\,\\mathrm{kPa}');
    math(300, 306, 'Q\\coloneq5\\,\\mathrm{kPa}');

    text(80, 370, '2. DESIGN LOADING', 'm', true);
    math(96, 404, 'w\\coloneq\\left(1.35G+1.5Q\\right)b');

    text(80, 470, '3. BENDING MOMENT', 'm', true);
    math(96, 504, 'M_{Ed}\\coloneq\\frac{wL^2}{8}', { displayMode: 'full' });

    text(80, 640, '4. SHEAR FORCE', 'm', true);
    math(96, 674, 'V_{Ed}\\coloneq\\frac{wL}{2}');

    text(80, 760, '5. CAPACITY CHECK', 'm', true);
    math(96, 794, 'M_{Rd}\\coloneq300\\,\\mathrm{kN}\\cdot\\mathrm{m}');
    math(96, 846, '\\eta_{M}\\coloneq\\frac{M_{Ed}}{M_{Rd}}');
    math(96, 914, '\\eta_{M}\\le1');
  });
}
