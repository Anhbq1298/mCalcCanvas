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
  insertImageFile,
  insertionPoint,
  resetZoom,
  ungroupSelection,
  zoomIn,
  zoomOut,
  zoomToFit,
} from '../canvas/canvasActions';
import { resyncAll } from '../canvas/engineBridge';
import { pasteShapes } from '../canvas/canvasActions';
import { redo, selectAll, setTool, stopEditing, undo, updateShapes, useCanvasStore } from '../canvas/model/canvasStore';
import type { MathDisplayMode, ToolId } from '../canvas/model/types';
import { exportJson, importJson, newDocument, saveDocument } from '../documents/documentController';
import { exportPdf } from '../export/PdfExporter';
import { useAppStore } from '../store/appStore';

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
    resyncAll();
    useAppStore.getState().showToast('info', 'All regions recalculated.');
  },

  toggleGrid: () => useCanvasStore.setState((s) => ({ isGrid: !s.isGrid })),
  toggleSnap: () => useCanvasStore.setState((s) => ({ isSnap: !s.isSnap })),
  setCanvasMode(mode: 'free' | 'page') {
    useAppStore.getState().updateSettings({ canvasMode: mode });
  },

  zoomIn,
  zoomOut,
  resetZoom,
  zoomToFit,

  async save() {
    await saveDocument();
    useAppStore.getState().showToast('info', 'Worksheet saved.');
  },
  async newWorksheet(demo = false) {
    await newDocument({ demo });
  },
  open: () => useAppStore.getState().openDialog('open'),
  exportJson,
  async importJson() {
    const file = await pickFile('application/json,.json');
    if (file) await importJson(file);
  },
  exportPdf: () => exportPdf(),
};
