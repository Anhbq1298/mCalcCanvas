/**
 * PDF export through the browser's print pipeline. Each A4 page is rendered
 * from the same shape components as the canvas (static mode), so text and
 * equations stay vector in the resulting PDF.
 */
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { orderedShapes } from '../canvas/model/canvasStore';
import { useAppStore } from '../store/appStore';
import { PrintSheets, PrintView, type PrintSheet } from './PrintView';
import { pageCount, shapesOnPage, shapesOutsidePrintArea } from './pageGeometry';

let root: Root | null = null;

/** Render the printable pages into #print-root. */
async function buildPrintView(): Promise<{ pages: number; outside: number }> {
  const { settings } = useAppStore.getState();
  const shapes = orderedShapes();
  const n = pageCount(shapes, settings.pageOrientation, settings.pages);
  const pages = Array.from({ length: n }, (_, i) => ({ index: i, shapes: shapesOnPage(shapes, i, settings.pageOrientation) }));
  await renderPrint(<PrintView pages={pages} />);
  return { pages: n, outside: shapesOutsidePrintArea(shapes, settings.pageOrientation).length };
}

async function renderPrint(node: React.ReactNode): Promise<void> {
  const el = document.getElementById('print-root');
  if (!el) throw new Error('#print-root missing');
  root ??= createRoot(el);
  flushSync(() => root!.render(node));
  await document.fonts.ready;
}

/** Print prepared sheets (e.g. Input & Results case reports) under the given document title. */
export async function printSheets(sheets: PrintSheet[], title: string): Promise<void> {
  await renderPrint(<PrintSheets sheets={sheets} />);
  const prevTitle = document.title;
  document.title = title;
  window.print();
  document.title = prevTitle;
}

export async function exportPdf(): Promise<void> {
  const { outside } = await buildPrintView();
  if (outside > 0) {
    useAppStore.getState().showToast('info', `${outside} object${outside > 1 ? 's are' : ' is'} outside the print area and may be cut off.`);
  }
  const prevTitle = document.title;
  document.title = useAppStore.getState().title;
  // Choose "Save as PDF" in the print dialog.
  window.print();
  document.title = prevTitle;
}
