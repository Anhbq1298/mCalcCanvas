import type { ReactNode } from 'react';
import { ShapeView } from '../canvas/shapes/ShapeView';
import type { Shape } from '../canvas/model/types';
import type { CalculationResult } from '../engine/CalculationEngine';
import { useAppStore } from '../store/appStore';
import { ReportResults, ReportShapes } from '../store/reportResults';
import { PageChrome } from './PageChrome';
import { printColumns } from '../canvas/templateLayout';
import { shapeBounds } from '../canvas/model/geometry';
import { currentPageSetup, marginPx, pageBox, pageSize, paperMm } from './pageGeometry';

/** One printed sheet: a worksheet page (optionally with one case's results) or a free page (case summary). */
export type PrintSheet =
  | { key: string; kind: 'page'; index: number; shapes: Shape[]; results?: Record<string, CalculationResult>; caseLabel?: string }
  | { key: string; kind: 'free'; content: ReactNode; caseLabel?: string };

/** The printable A4 pages: each page renders its shapes in static mode plus the header/footer. */
export function PrintView({ pages, columns = 1 }: { pages: { index: number; shapes: Shape[] }[]; columns?: number }) {
  const shapes = Object.fromEntries(pages.flatMap(p => p.shapes).map(s => [s.id, s]));
  return <ReportShapes.Provider value={shapes}><PrintSheets columns={columns} sheets={pages.map((p) => ({ key: String(p.index), kind: 'page', index: p.index, shapes: p.shapes }))} /></ReportShapes.Provider>;
}

/** Thin vertical rules in the gutters of a page that uses more than one reading column. */
function ColumnRules({ index, shapes, columns }: { index: number; shapes: Shape[]; columns: number }) {
  const { settings } = useAppStore.getState();
  const page = pageBox(index, settings.pageOrientation);
  const m = marginPx();
  const { width, gutter } = printColumns(pageSize(settings.pageOrientation).w - m.left - m.right);
  const rules: number[] = [];
  for (let c = 1; c < columns; c++) {
    const x = m.left + c * (width + gutter) - gutter / 2;
    // Only between columns that hold content on this page.
    if (shapes.some((s) => shapeBounds(s).x - page.x > x)) rules.push(x);
  }
  return <>{rules.map((x) => <div key={x} className="print-column-rule" data-testid="print-column-rule" style={{ left: x, top: m.top, height: page.h - m.top - m.bottom }} />)}</>;
}

export function PrintSheets({ sheets, columns = 1 }: { sheets: PrintSheet[]; columns?: number }) {
  const { settings } = useAppStore.getState();
  const total = sheets.length;
  // Paper from the page setup (A4/A3, portrait/landscape); the PDF page size follows it.
  const paper = paperMm(settings.pageOrientation);
  const size = { width: `${paper.w}mm`, height: `${paper.h}mm` };
  return (
    <>
      <style>{`@media print { @page { size: ${paper.w}mm ${paper.h}mm; margin: 0; } }`}</style>
      {sheets.map((sheet, n) => (
        <section key={sheet.key} className="print-page" style={size} data-page={n + 1} data-case={sheet.caseLabel} data-paper={`${currentPageSetup().paper} ${settings.pageOrientation}`}>
          {sheet.kind === 'page' ? (
            <ReportResults.Provider value={sheet.results ?? null}>
              <div className="print-content" style={{ position: 'absolute', left: -pageBox(sheet.index, settings.pageOrientation).x, top: -pageBox(sheet.index, settings.pageOrientation).y, width: 0, height: 0 }}>
                {sheet.shapes.map((s) => (
                  <ShapeView key={s.id} shape={s} editing={false} isStatic />
                ))}
              </div>
            </ReportResults.Provider>
          ) : (
            <div className="print-free">{sheet.content}</div>
          )}
          {sheet.kind === 'page' && columns > 1 && <ColumnRules index={sheet.index} shapes={sheet.shapes} columns={columns} />}
          <PageChrome index={n} total={total} caseLabel={sheet.caseLabel} />
        </section>
      ))}
    </>
  );
}
