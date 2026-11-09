import type { ReactNode } from 'react';
import { ShapeView } from '../canvas/shapes/ShapeView';
import type { Shape } from '../canvas/model/types';
import type { CalculationResult } from '../engine/CalculationEngine';
import { useAppStore } from '../store/appStore';
import { ReportResults, ReportShapes } from '../store/reportResults';
import { PageChrome } from './PageChrome';
import { currentPageSetup, pageBox, paperMm } from './pageGeometry';

/** One printed sheet: a worksheet page (optionally with one case's results) or a free page (case summary). */
export type PrintSheet =
  | { key: string; kind: 'page'; index: number; shapes: Shape[]; results?: Record<string, CalculationResult>; caseLabel?: string }
  | { key: string; kind: 'free'; content: ReactNode; caseLabel?: string };

/** The printable A4 pages: each page renders its shapes in static mode plus the header/footer. */
export function PrintView({ pages }: { pages: { index: number; shapes: Shape[] }[] }) {
  const shapes = Object.fromEntries(pages.flatMap(p => p.shapes).map(s => [s.id, s]));
  return <ReportShapes.Provider value={shapes}><PrintSheets sheets={pages.map((p) => ({ key: String(p.index), kind: 'page', index: p.index, shapes: p.shapes }))} /></ReportShapes.Provider>;
}

export function PrintSheets({ sheets }: { sheets: PrintSheet[] }) {
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
          <PageChrome index={n} total={total} caseLabel={sheet.caseLabel} />
        </section>
      ))}
    </>
  );
}
