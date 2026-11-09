/**
 * Application commands shared by the menu bar, toolbar and keyboard shortcuts.
 */
import {
  copySelection,
  createMathRegion,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  handlePasteData,
  insertGraph,
  insertImageFile,
  insertionPoint,
  resetZoom,
  ungroupSelection,
  zoomIn,
  zoomOut,
  zoomToFit,
  viewportCenter,
  zoomFitPage,
  zoomFitWidth,
  zoomActualSize,
  insertPageBreak,
} from '../canvas/canvasActions';
import { currentPageIndex, deletePage, insertBlankPageAfter, totalPages } from '../canvas/pageConstraint';
import { pageBox } from '../export/pageGeometry';
import { resyncAll } from '../canvas/engineBridge';
import { pasteShapes } from '../canvas/canvasActions';
import { redo, selectAll, setCamera, setTool, stopEditing, undo, updateShapes, useCanvasStore } from '../canvas/model/canvasStore';
import type { MathDisplayMode, ToolId } from '../canvas/model/types';
import { FILE_ACCEPT, newDocument, openFile, saveAsFile, saveDocument } from '../documents/documentController';
import { exportPdf } from '../export/PdfExporter';
import { useAppStore } from '../store/appStore';
import type { TemplateId } from '../documents/templates';

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export type { ToolId };

export const commands = {
  setTool,

  insertMath(latex = '') {
    stopEditing();
    createMathRegion(insertionPoint(), latex);
  },
  insertCheck() {
    // Empty slot for the checked value, then "≤ 1"; the caret starts in the slot.
    this.insertMath('\\placeholder{}\\le1');
  },
  insertGraph() {
    stopEditing();
    insertGraph();
  },
  async insertImage() {
    const file = await pickFile('image/png,image/jpeg,image/webp,image/svg+xml,image/gif');
    if (file) await insertImageFile(file);
  },

  undo,
  redo,
  copy: () => void copySelection(),
  cut: () => void cutSelection(),
  async paste() {
    try {
      const items = await navigator.clipboard.read();
      const dt = new DataTransfer();
      for (const item of items) {
        for (const type of item.types) {
          const blob = await item.getType(type);
          if (type.startsWith('image/')) dt.items.add(new File([blob], 'pasted', { type }));
          else if (type === 'text/plain') dt.setData('text/plain', await blob.text());
        }
      }
      if (handlePasteData(dt)) return;
    } catch {
      /* clipboard read not permitted: fall back to the internal clipboard */
    }
    pasteShapes();
  },
  duplicate: duplicateSelection,
  deleteSelection,
  selectAll,
  group: groupSelection,
  ungroup: ungroupSelection,

  /** Apply a display mode to the selected math regions. */
  setDisplayMode(mode: MathDisplayMode) {
    const { selection, shapes } = useCanvasStore.getState();
    const ids = selection.filter((id) => shapes[id]?.type === 'math');
    updateShapes(Object.fromEntries(ids.map((id) => [id, { props: { displayMode: mode } }])));
  },

  calculateAll() {
    resyncAll({ force: true });
    useAppStore.getState().showToast('info', 'All regions recalculated.');
  },

  toggleGrid: () => useCanvasStore.setState((s) => ({ isGrid: !s.isGrid })),
  toggleSnap() {
    const isSnap = !useCanvasStore.getState().isSnap;
    useCanvasStore.setState({ isSnap });
    useAppStore.getState().updateSettings({ snapToGrid: isSnap });
  },
  setCanvasMode(mode: 'free' | 'page') {
    useAppStore.getState().updateSettings({ canvasMode: mode });
  },

  zoomIn,
  zoomOut,
  resetZoom,
  zoomToFit,
  zoomFitPage,
  zoomFitWidth,
  zoomActualSize,

  /** Page break at the + cross or above the selection (Page layout view). */
  pageBreak() {
    const app = useAppStore.getState();
    if (app.settings.canvasMode !== 'page') {
      app.showToast('info', 'Page breaks exist in Page layout view.');
      return;
    }
    if (!insertPageBreak()) app.showToast('info', 'Click on a line (the + cross) or select a region where the new page should start.');
  },

  /** Insert a blank page after the current page and scroll to it. */
  insertBlankPage() {
    const app = useAppStore.getState();
    if (app.settings.canvasMode !== 'page') {
      app.showToast('info', 'Pages exist in Page layout view (Document → Pages).');
      return;
    }
    stopEditing();
    const idx = insertBlankPageAfter(currentPageIndex(viewportCenter().y));
    const top = pageBox(idx, app.settings.pageOrientation).y;
    const cam = useCanvasStore.getState().camera;
    setCamera({ x: cam.x, y: top - 24 / cam.z, z: cam.z });
    useCanvasStore.setState({ selection: [], crosshair: null });
    app.showToast('info', `Blank page ${idx + 1} inserted.`);
  },
  /** Delete the current page if it is empty. */
  deletePage() {
    const app = useAppStore.getState();
    if (app.settings.canvasMode !== 'page') return;
    const idx = currentPageIndex(viewportCenter().y);
    if (deletePage(idx)) app.showToast('info', `Page ${idx + 1} deleted.`);
    else app.showToast('error', totalPages() <= 1 ? 'A worksheet needs at least one page.' : `Page ${idx + 1} is not empty. Delete its content first.`);
  },

  async save() {
    const file = await saveDocument();
    const app = useAppStore.getState();
    if (app.saveState !== 'error') app.showToast('info', file ? `Saved “${file}”.` : 'Worksheet saved in this browser.');
  },
  async newWorksheet(demo = false) {
    await newDocument({ demo });
  },
  async newFromTemplate(template: TemplateId) {
    await newDocument({ template });
  },
  open: () => useAppStore.getState().openDialog('open'),
  /** Save As: write a .mCCV file. */
  saveAs: () => saveAsFile(),
  /** Open a .mCCV file from the computer. */
  async openFile() {
    const file = await pickFile(FILE_ACCEPT);
    if (file) await openFile(file);
  },
  exportPdf: () => exportPdf(),
};
