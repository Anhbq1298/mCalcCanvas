/**
 * PDF export through the browser's print pipeline.
 *
 * Each A4 page is exported by tldraw as an SVG (math regions are embedded as
 * HTML in <foreignObject> with their fonts), inserted into #print-root and
 * printed. Text and equations stay vector in the resulting PDF.
 */
import type { Editor } from 'tldraw';
import { useAppStore } from '../store/appStore';
import { pageBox, pageCount, shapesOnPage, shapesOutsidePrintArea } from './pageGeometry';

function el(tag: string, className: string, children: (Node | string)[] = []): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  for (const c of children) e.append(c);
  return e;
}

function span(text: string, strong = false): HTMLElement {
  const e = document.createElement(strong ? 'strong' : 'span');
  e.textContent = text;
  return e;
}

/** Build the printable pages. Returns the number of pages. */
export async function buildPrintView(editor: Editor): Promise<{ pages: number; outside: number }> {
  const { settings, title, metadata } = useAppStore.getState();
  const orientation = settings.pageOrientation;
  const root = document.getElementById('print-root');
  if (!root) throw new Error('#print-root missing');

  editor.setEditingShape(null);
  editor.selectNone();
  root.replaceChildren();

  const pages = pageCount(editor, orientation);
  const outside = shapesOutsidePrintArea(editor, orientation).length;

  for (let i = 0; i < pages; i++) {
    const page = el('section', `print-page${orientation === 'landscape' ? ' landscape' : ''}`);
    page.setAttribute('data-page', String(i + 1));
    const ids = shapesOnPage(editor, i, orientation).map((s) => s.id);
    if (ids.length) {
      const res = await editor.getSvgString(ids, { bounds: pageBox(i, orientation), padding: 0, background: false, scale: 1 });
      if (res) {
        const svg = new DOMParser().parseFromString(res.svg, 'image/svg+xml').documentElement;
        if (svg.nodeName.toLowerCase() === 'svg') {
          svg.setAttribute('class', 'print-content');
          svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
          page.append(document.importNode(svg, true));
        }
      }
    }
    page.append(
      el('header', 'print-header', [
        el('div', '', [span(title, true)]),
        el('div', '', [
          span([metadata.project, metadata.calculationReference].filter(Boolean).join('  ·  ')),
        ]),
      ]),
      el('footer', 'print-footer', [
        el('div', '', [
          span(
            [
              metadata.preparedBy && `Prepared: ${metadata.preparedBy}`,
              metadata.checkedBy && `Checked: ${metadata.checkedBy}`,
              metadata.revision && `Rev ${metadata.revision}`,
            ]
              .filter(Boolean)
              .join('   '),
          ),
        ]),
        el('div', '', [span(`Page ${i + 1} of ${pages}`)]),
      ]),
    );
    root.append(page);
  }
  await document.fonts.ready;
  return { pages, outside };
}

export async function exportPdf(editor: Editor): Promise<void> {
  const { pages, outside } = await buildPrintView(editor);
  if (outside > 0) {
    useAppStore
      .getState()
      .showToast('info', `${outside} object${outside > 1 ? 's are' : ' is'} outside the print area and may be cut off.`);
  }
  const prevTitle = document.title;
  document.title = useAppStore.getState().title;
  // Choose "Save as PDF" in the print dialog.
  window.print();
  document.title = prevTitle;
  void pages;
}
