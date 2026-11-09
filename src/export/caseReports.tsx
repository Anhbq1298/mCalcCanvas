/**
 * Input & Results case reports: the whole worksheet printed once per case, with
 * that case's input values and results, after a summary page of all cases.
 * The detailed results are calculated only when a report is asked for (batch
 * workers, detail on) and are dropped with the next print.
 */
import { orderedShapes, useCanvasStore } from '../canvas/model/canvasStore';
import { caseShapes, type AvailableField } from '../components/inputResults/batchCalculation';
import type { InputResultConfig, InputResultRow } from '../documents/DocumentTypes';
import type { BatchResults } from '../engine/batch';
import { useAppStore } from '../store/appStore';
import { pageCount, shapesOnPage } from './pageGeometry';
import { printSheets } from './PdfExporter';
import type { PrintSheet } from './PrintView';
import { CaseSummary } from './CaseSummary';

/** Summary page + every page of the worksheet per case. */
function buildCaseSheets(config: InputResultConfig, fields: Map<string, AvailableField>, rows: InputResultRow[], results: BatchResults): PrintSheet[] {
  const { settings, title, documentId } = useAppStore.getState();
  const shapes = orderedShapes();
  const stamp = `Worksheet “${title}” (document ${documentId?.slice(0, 8) ?? '—'}, version ${useCanvasStore.getState().docVersion}) · ${settings.unitSystem} · calculated ${new Date().toLocaleString()}`;
  const sheets: PrintSheet[] = [{ key: 'summary', kind: 'free', content: <CaseSummary config={config} fields={fields} rows={rows} results={results} stamp={stamp} /> }];
  for (const row of rows) {
    const cs = caseShapes(config, row, shapes);
    const n = pageCount(cs, settings.pageOrientation, settings.pages);
    for (let i = 0; i < n; i++) {
      sheets.push({ key: `${row.id}/${i}`, kind: 'page', index: i, shapes: shapesOnPage(cs, i, settings.pageOrientation), results: results[row.id]?.regions ?? {}, caseLabel: row.name });
    }
  }
  return sheets;
}

export async function printCaseReports(config: InputResultConfig, fields: Map<string, AvailableField>, rows: InputResultRow[], results: BatchResults): Promise<void> {
  const title = useAppStore.getState().title;
  await printSheets(buildCaseSheets(config, fields, rows, results), rows.length === 1 ? `${title} – ${rows[0].name}` : `${title} – ${config.title || 'cases'}`);
}
