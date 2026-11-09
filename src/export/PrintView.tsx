import type { ReactNode } from 'react';
import { ShapeView } from '../canvas/shapes/ShapeView';
import type { Shape } from '../canvas/model/types';
import type { CalculationResult } from '../engine/CalculationEngine';
import { useAppStore } from '../store/appStore';
import { ReportResults } from '../store/reportResults';
import { PageChrome } from './PageChrome';
import { pageBox } from './pageGeometry';

/** One printed sheet: a worksheet page (optionally with one case's results) or a free page (case summary). */
export type PrintSheet =
  | { key: string; kind: 'page'; index: number; shapes: Shape[]; results?: Record<string, CalculationResult>; caseLabel?: string }
  | { key: string; kind: 'free'; content: ReactNode; caseLabel?: string };

/** The printable A4 pages: each page renders its shapes in static mode plus the header/footer. */
export function PrintView({ pages }: { pages: { index: number; shapes: Shape[] }[] }) {
  return <PrintSheets sheets={pages.map((p) => ({ key: String(p.index), kind: 'page', index: p.index, shapes: p.shapes }))} />;
}

export function PrintSheets({ sheets }: { sheets: PrintSheet[] }) {
  const { settings } = useAppStore.getState();
  const landscape = settings.pageOrientation === 'landscape';
  const total = sheets.length;
  return (
    <>
      {sheets.map((sheet, n) => (
        <section key={sheet.key} className={`print-page${landscape ? ' landscape' : ''}`} data-page={n + 1} data-case={sheet.caseLabel}>
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
