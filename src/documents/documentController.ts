/**
 * Document lifecycle: new / open / save / autosave / JSON import & export.
 */
import { getSnapshot, loadSnapshot, type Editor } from 'tldraw';
import { resyncAll } from '../canvas/engineBridge';
import { pageBox } from '../export/pageGeometry';
import { useAppStore } from '../store/appStore';
import { engine } from '../store/calculationStore';
import { createDemoWorksheet } from './demoWorksheet';
import { DocumentManager } from './DocumentManager';
import { parseDocument, serializeDocument } from './DocumentSerializer';
import { DEFAULT_SETTINGS, DOCUMENT_VERSION, type CalculationDocument } from './DocumentTypes';

let suppressAutosave = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function applySettings(editor: Editor) {
  const { settings } = useAppStore.getState();
  engine.setSettings({ unitSystem: settings.unitSystem, precision: settings.precision });
  void editor;
}

/** Show the top of page 1 at 100 %, centred horizontally. */
function focusFirstPage(editor: Editor) {
  const apply = () => {
    const box = pageBox(0, useAppStore.getState().settings.pageOrientation);
    const vp = editor.getViewportScreenBounds();
    editor.setCamera({ x: Math.max(24, (vp.w - box.w) / 2), y: 24, z: 1 }, { immediate: true });
  };
  apply();
  // The container may not have its final size on the first frame.
  requestAnimationFrame(apply);
}

export function currentDocument(editor: Editor): CalculationDocument {
  const s = useAppStore.getState();
  return {
    id: s.documentId ?? newId(),
    version: DOCUMENT_VERSION,
    title: s.title,
    metadata: s.metadata,
    settings: s.settings,
    shapes: getSnapshot(editor.store).document,
    createdAt: s.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

export async function saveDocument(editor: Editor): Promise<void> {
  const store = useAppStore.getState();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  store.setSaveState('saving');
  try {
    const doc = currentDocument(editor);
    await DocumentManager.put(doc);
    await DocumentManager.setLastOpenedId(doc.id);
    if (!store.documentId) useAppStore.setState({ documentId: doc.id });
    useAppStore.getState().setSaveState('saved');
  } catch (e) {
    console.error(e);
    useAppStore.getState().setSaveState('error');
    useAppStore.getState().showToast('error', 'Saving failed – your browser storage may be full or blocked.');
  }
}

function scheduleSave(editor: Editor) {
  if (suppressAutosave) return;
  useAppStore.getState().setSaveState('dirty');
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveDocument(editor), 800);
}

export function startAutosave(editor: Editor): () => void {
  const stopStore = editor.store.listen(() => scheduleSave(editor), { scope: 'document', source: 'user' });
  const stopApp = useAppStore.subscribe((s, prev) => {
    if (s.title !== prev.title || s.metadata !== prev.metadata || s.settings !== prev.settings) {
      if (s.settings !== prev.settings) applySettings(editor);
      scheduleSave(editor);
    }
  });
  const flush = () => {
    if (useAppStore.getState().saveState === 'dirty') void saveDocument(editor);
  };
  window.addEventListener('beforeunload', flush);
  return () => {
    stopStore();
    stopApp();
    window.removeEventListener('beforeunload', flush);
  };
}

function withoutAutosave(fn: () => void) {
  suppressAutosave = true;
  try {
    fn();
  } finally {
    suppressAutosave = false;
  }
}

export function loadDocument(editor: Editor, doc: CalculationDocument): void {
  withoutAutosave(() => {
    editor.setEditingShape(null);
    loadSnapshot(editor.store, { document: doc.shapes as never });
    editor.clearHistory();
    useAppStore.getState().setDocument(doc);
    applySettings(editor);
    // Results are never trusted from storage: recompute everything.
    resyncAll(editor);
    focusFirstPage(editor);
  });
  void DocumentManager.setLastOpenedId(doc.id);
}

export async function newDocument(editor: Editor, opts: { demo?: boolean } = {}): Promise<void> {
  withoutAutosave(() => {
    editor.setEditingShape(null);
    editor.setCurrentTool('select');
    const ids = [...editor.getCurrentPageShapeIds()];
    editor.run(() => editor.deleteShapes(ids), { history: 'ignore' });
    useAppStore.getState().setDocument({
      id: newId(),
      title: opts.demo ? 'Simply Supported Steel Beam Calculation' : 'Untitled calculation',
      metadata: opts.demo
        ? { project: 'Demonstration project', calculationReference: 'CALC-001', preparedBy: '', checkedBy: '', revision: 'A' }
        : {},
      settings: DEFAULT_SETTINGS,
      createdAt: new Date().toISOString(),
    });
    applySettings(editor);
    if (opts.demo) editor.run(() => createDemoWorksheet(editor), { history: 'ignore' });
    editor.clearHistory();
    resyncAll(editor);
    focusFirstPage(editor);
  });
  await saveDocument(editor);
}

export async function openDocument(editor: Editor, id: string): Promise<void> {
  if (useAppStore.getState().saveState === 'dirty') await saveDocument(editor);
  const doc = await DocumentManager.get(id);
  if (!doc) {
    useAppStore.getState().showToast('error', 'That worksheet no longer exists.');
    return;
  }
  loadDocument(editor, doc);
}

export async function initDocuments(editor: Editor): Promise<void> {
  try {
    const lastId = await DocumentManager.getLastOpenedId();
    const doc = lastId ? await DocumentManager.get(lastId) : null;
    if (doc) return loadDocument(editor, doc);
    const docs = await DocumentManager.list();
    if (docs.length) {
      const latest = await DocumentManager.get(docs[0].id);
      if (latest) return loadDocument(editor, latest);
    }
  } catch (e) {
    console.error('Could not open saved worksheets', e);
    useAppStore.getState().showToast('error', 'Saved worksheets could not be read; starting a new one.');
  }
  await newDocument(editor, { demo: true });
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'calculation';
}

export function exportJson(editor: Editor): void {
  const doc = currentDocument(editor);
  const blob = new Blob([serializeDocument(doc)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug(doc.title)}.calccanvas.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importJson(editor: Editor, file: File): Promise<void> {
  try {
    const parsed = parseDocument(JSON.parse(await file.text()));
    // Never overwrite an existing worksheet on import.
    const existing = await DocumentManager.get(parsed.id);
    const doc = existing ? { ...parsed, id: newId() } : parsed;
    loadDocument(editor, doc);
    await saveDocument(editor);
    useAppStore.getState().showToast('info', `Imported “${doc.title}”.`);
  } catch (e) {
    useAppStore.getState().showToast('error', `Import failed: ${e instanceof Error ? e.message : 'invalid file'}`);
  }
}
