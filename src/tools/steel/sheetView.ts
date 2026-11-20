/**
 * Read-only view of the report worksheet for the page: the report document of one combination is
 * recalculated in its own engine (exactly as mCalcCanvas opens it) and every shape is turned into
 * something the page can draw without an editor: positioned text, the displayed equation with its
 * result (as MathView shows it), check pass/fail, images, and the section graph slot.
 */
import { CalculationEngine } from '../../engine';
import { calcKey } from '../../canvas/calcOrder';
import { buildDisplay } from '../../math/MathFormatter';
import { fractionUnitLatex } from '../../math/resultUnit';
import { SECTION_DEF, sectionById } from '../../engineering/steel/sections';
import { PAGE_GAP, pageSize } from '../../export/pageGeometry';
import type { MathShape, Shape, TextShape } from '../../canvas/model/types';

export type SheetItem =
  | { kind: 'text'; id: string; x: number; y: number; w: number; html: string; fontSize: number; color: string; fontFamily: string; align: string; heading?: number }
  | { kind: 'math'; id: string; x: number; y: number; latex: string; fontSize: number; color: string; check?: boolean; error?: string }
  | { kind: 'image'; id: string; x: number; y: number; w: number; h: number; src: string }
  | { kind: 'graph'; id: string; x: number; y: number; w: number; h: number };

export interface SheetView { pageW: number; pageH: number; gap: number; pages: number; items: SheetItem[]; seconds: number }

export function sheetView(doc: { shapes: Shape[] }): SheetView {
  const t0 = performance.now();
  const shapes = doc.shapes;
  const rec = Object.fromEntries(shapes.map((s) => [s.id, s]));
  const e = new CalculationEngine({ unitSystem: 'SI' });
  e.batch(() => {
    for (const s of shapes) {
      if (s.type !== 'math') continue;
      const p = (s as MathShape).props;
      e.setRegion(s.id, {
        latex: p.latex, displayUnit: p.displayUnit?.trim() || null, precision: p.precision >= 0 ? p.precision : null, order: calcKey(s, rec),
        ...(p.resultFormat ? { resultFormat: p.resultFormat } : {}), ...(p.trailingZeros !== undefined ? { trailingZeros: p.trailingZeros } : {}),
      } as never);
    }
  });
  const items: SheetItem[] = [];
  for (const s of shapes) {
    if (s.type === 'text') {
      const p = (s as TextShape).props;
      items.push({ kind: 'text', id: s.id, x: s.x, y: s.y, w: p.w, html: p.html, fontSize: p.fontSize, color: p.color, fontFamily: p.fontFamily, align: p.align, heading: p.heading });
    } else if (s.type === 'math') {
      const p = (s as MathShape).props;
      const r = e.getResult(s.id);
      if (p.latex.startsWith(SECTION_DEF)) {
        let name = '–';
        try { name = sectionById(r?.value?.number ?? 0).name; } catch { /* custom section */ }
        items.push({ kind: 'math', id: s.id, x: s.x, y: s.y, latex: `\\mathrm{Section}=\\text{${name}}`, fontSize: p.fontSize, color: p.color });
        continue;
      }
      const unit = r?.value?.unitLatex;
      const res = r && unit && !(r.kind === 'definition' && r.references.length === 0) ? { ...r, value: { ...r.value!, latex: r.value!.latex.replace(unit, fractionUnitLatex(unit)) } } : r;
      const parts = buildDisplay(p.latex, res, p.displayMode);
      items.push({ kind: 'math', id: s.id, x: s.x, y: s.y, latex: parts.latex, fontSize: p.fontSize, color: p.color, ...(parts.check ? { check: parts.check.pass } : {}), ...(r?.status === 'error' ? { error: r.error?.message ?? 'error' } : {}) });
    } else if (s.type === 'image') {
      const p = s.props as unknown as { w: number; h: number; src: string };
      items.push({ kind: 'image', id: s.id, x: s.x, y: s.y, w: p.w, h: p.h, src: p.src });
    } else if (s.type === 'graph') {
      const p = s.props as unknown as { w: number; h: number };
      items.push({ kind: 'graph', id: s.id, x: s.x, y: s.y, w: p.w, h: p.h });
    }
  }
  const { w, h } = pageSize('portrait');
  const pages = Math.floor(Math.max(0, ...items.map((i) => i.y)) / (h + PAGE_GAP)) + 1;
  return { pageW: w, pageH: h, gap: PAGE_GAP, pages, items, seconds: (performance.now() - t0) / 1000 };
}
