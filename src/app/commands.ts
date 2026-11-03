/**
 * Application commands shared by the menu bar, toolbar and keyboard shortcuts.
 */
import type { Editor } from 'tldraw';
import { resyncAll } from '../canvas/engineBridge';
import { createMathRegion, insertionPoint, isMathShape } from '../canvas/regionActions';
import type { MathDisplayMode } from '../canvas/shapes/mathShapeTypes';
import { MATH_SHAPE_TYPE } from '../canvas/shapes/mathShapeTypes';
import { exportJson, importJson, newDocument, saveDocument } from '../documents/documentController';
import { exportPdf } from '../export/PdfExporter';
import { useAppStore } from '../store/appStore';

function ed(): Editor | null {
  return useAppStore.getState().editor;
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

function runAction(id: string) {
  const action = useAppStore.getState().actions?.[id];
  action?.onSelect('menu');
}

export type ToolId = 'select' | 'math' | 'text' | 'line' | 'geo' | 'arrow' | 'draw' | 'hand' | 'eraser';

export const commands = {
  setTool(tool: ToolId) {
    const editor = ed();
    if (!editor) return;
    editor.setEditingShape(null);
    editor.setCurrentTool(tool);
  },

  insertMath(latex = '') {
    const editor = ed();
    if (!editor) return;
    editor.setEditingShape(null);
    editor.setCurrentTool('select');
    createMathRegion(editor, insertionPoint(editor), latex);
  },

  insertCheck() {
    this.insertMath('\\le1');
  },

  async insertImage() {
    const editor = ed();
    if (!editor) return;
    const file = await pickFile('image/png,image/jpeg,image/webp,image/svg+xml');
    if (!file) return;
    const c = editor.getViewportPageBounds().center;
    await editor.putExternalContent({ type: 'files', files: [file], point: c, ignoreParent: false });
  },

  undo: () => ed()?.undo(),
  redo: () => ed()?.redo(),
  copy: () => runAction('copy'),
  cut: () => runAction('cut'),
  paste: () => runAction('paste'),
  duplicate() {
    const editor = ed();
    if (!editor) return;
    const ids = editor.getSelectedShapeIds();
    if (ids.length) editor.duplicateShapes(ids, { x: 16, y: 16 });
  },
  deleteSelection() {
    const editor = ed();
    if (!editor) return;
    editor.deleteShapes(editor.getSelectedShapeIds());
  },
  selectAll: () => ed()?.selectAll(),
  group() {
    const editor = ed();
    if (!editor) return;
    const ids = editor.getSelectedShapeIds();
    if (ids.length > 1) editor.groupShapes(ids);
  },
  ungroup() {
    const editor = ed();
    if (!editor) return;
    editor.ungroupShapes(editor.getSelectedShapeIds());
  },

  /** Apply a display mode to selected math regions. */
  setDisplayMode(mode: MathDisplayMode) {
    const editor = ed();
    if (!editor) return;
    const shapes = editor.getSelectedShapes().filter(isMathShape);
    editor.updateShapes(shapes.map((s) => ({ id: s.id, type: MATH_SHAPE_TYPE, props: { displayMode: mode } })));
  },

  calculateAll() {
    const editor = ed();
    if (editor) resyncAll(editor);
    useAppStore.getState().showToast('info', 'All regions recalculated.');
  },

  toggleGrid() {
    const editor = ed();
    if (!editor) return;
    editor.updateInstanceState({ isGridMode: !editor.getInstanceState().isGridMode });
  },
  toggleSnap() {
    const editor = ed();
    if (!editor) return;
    editor.user.updateUserPreferences({ isSnapMode: !editor.user.getIsSnapMode() });
  },
  setCanvasMode(mode: 'free' | 'page') {
    useAppStore.getState().updateSettings({ canvasMode: mode });
  },

  zoomIn: () => ed()?.zoomIn(undefined, { animation: { duration: 120 } }),
  zoomOut: () => ed()?.zoomOut(undefined, { animation: { duration: 120 } }),
  resetZoom: () => ed()?.resetZoom(undefined, { animation: { duration: 120 } }),
  zoomToFit: () => ed()?.zoomToFit({ animation: { duration: 160 } }),

  async save() {
    const editor = ed();
    if (!editor) return;
    await saveDocument(editor);
    useAppStore.getState().showToast('info', 'Worksheet saved.');
  },
  async newWorksheet(demo = false) {
    const editor = ed();
    if (editor) await newDocument(editor, { demo });
  },
  open: () => useAppStore.getState().openDialog('open'),
  exportJson() {
    const editor = ed();
    if (editor) exportJson(editor);
  },
  async importJson() {
    const editor = ed();
    if (!editor) return;
    const file = await pickFile('application/json,.json');
    if (file) await importJson(editor, file);
  },
  async exportPdf() {
    const editor = ed();
    if (editor) await exportPdf(editor);
  },
};
