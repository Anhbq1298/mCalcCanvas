/**
 * Document lifecycle: new / open / save / autosave / JSON import & export.
 */
import { focusPage, separateRegion } from '../canvas/canvasActions';
import { primeEngine, resyncAll } from '../canvas/engineBridge';
import { loadShapes, orderedShapes, updateShapes, useCanvasStore } from '../canvas/model/canvasStore';
import { pageSize } from '../export/pageGeometry';
import { useAppStore } from '../store/appStore';
import { engine } from '../store/calculationStore';
import { templateById, type TemplateId } from './templates';
import { DocumentManager } from './DocumentManager';
import { SaveCoordinator } from './SaveCoordinator';
import { parseDocument, serializeDocument } from './DocumentSerializer';
import { DEFAULT_SETTINGS, DOCUMENT_VERSION, type CalculationDocument } from './DocumentTypes';

let suppressAutosave = false;
let storageWarningShown = false;

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function applySettings() {
  const { settings } = useAppStore.getState();
  engine.setSettings({
    unitSystem: settings.unitSystem,
    precision: settings.precision,
    vectorLimit: settings.vectorLimit ?? 10,
    resultFormat: settings.resultFormat,
    trailingZeros: settings.trailingZeros,
  });
}

function focusFirstPage() {
  const w = pageSize(useAppStore.getState().settings.pageOrientation).w;
  focusPage(w);
  requestAnimationFrame(() => focusPage(w));
}

export function currentDocument(): CalculationDocument {
  const s = useAppStore.getState();
  return {
    id: s.documentId ?? newId(),
    version: DOCUMENT_VERSION,
    title: s.title,
    metadata: s.metadata,
    settings: s.settings,
    inputResult: s.inputResult,
    shapes: orderedShapes(),
    createdAt: s.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

/** All saving goes through one coordinator: serialised, revision-checked (see SaveCoordinator). */
export const saves = new SaveCoordinator({
  repository: DocumentManager,
  snapshot: () => currentDocument(),
  onState: (state) => useAppStore.getState().setSaveState(state),
  onSaved: (doc) => {
    if (!useAppStore.getState().documentId) useAppStore.setState({ documentId: doc.id });
  },
  onError: (e) => {
    console.warn('Save failed', e);
    if (!storageWarningShown) {
      storageWarningShown = true;
      useAppStore.getState().showToast('info', 'This view can’t save to browser storage. Use File → Save to file to keep your work.');
    }
  },
});

/** Save now (Ctrl+S): writes the current revision after any save in progress. */
export function saveDocument(): Promise<void> {
  return saves.flush(true);
}

function scheduleSave() {
  if (suppressAutosave) return;
  saves.markDirty();
}

/** Before switching documents: write pending edits of the current one. */
async function flushBeforeSwitch(): Promise<void> {
  if (saves.dirty) await saves.flush();
}

export function startAutosave(): () => void {
  const stopCanvas = useCanvasStore.subscribe((s, prev) => {
    if (s.docVersion !== prev.docVersion) scheduleSave();
  });
  const stopApp = useAppStore.subscribe((s, prev) => {
    if (s.settings !== prev.settings) applySettings();
    // Paper size, orientation and margins only move the page frames: regions keep
    // their document positions (and the calculation is not touched).
    if (s.settings.canvasMode !== prev.settings.canvasMode || s.settings.baselineSnap !== prev.settings.baselineSnap) {
      // The grid origin moved: put math/text regions back on the grid.
      const { shapes } = useCanvasStore.getState();
      updateShapes(
        Object.fromEntries(Object.values(shapes).filter((sh) => sh.type === 'math' || sh.type === 'text').map((sh) => [sh.id, { x: sh.x, y: sh.y }])),
        { history: false },
      );
      // Re-aligning can bring regions onto the same line: separate them.
      separateRegion(...Object.values(useCanvasStore.getState().shapes).filter((sh) => sh.type === 'math').map((sh) => sh.id));
    }
    if (s.title !== prev.title || s.metadata !== prev.metadata || s.settings !== prev.settings || s.inputResult !== prev.inputResult) scheduleSave();
  });
  const flush = (e: BeforeUnloadEvent) => {
    if (!saves.dirty) return;
    void saves.flush();
    // The write is asynchronous and may not finish before the page closes: ask the browser to warn.
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', flush);
  return () => {
    stopCanvas();
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

/** Lets a message just posted to the calculation worker reach it (see primeEngine). */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function loadDocument(doc: CalculationDocument): Promise<void> {
  withoutAutosave(() => {
    // Settings first: grid snapping depends on page layout and orientation.
    useAppStore.getState().setDocument(doc);
    applySettings();
  });
  // Results are never trusted from storage: the worker recalculates while the canvas renders.
  const placed = primeEngine(doc.shapes);
  await nextTask();
  withoutAutosave(() => {
    loadShapes(placed);
    resyncAll();
    focusFirstPage();
  });
  saves.reset();
  void DocumentManager.setLastOpenedId(doc.id).catch(() => {});
}

export async function newDocument(opts: { demo?: boolean; template?: TemplateId } = {}): Promise<void> {
  const tpl = templateById(opts.template ?? (opts.demo ? 'steel-beam' : 'blank'));
  await flushBeforeSwitch();
  const made = tpl?.instantiate?.();
  const shapes = made ? made.shapes : tpl ? tpl.shapes() : [];
  withoutAutosave(() => {
    useAppStore.getState().setDocument({
      id: newId(),
      title: tpl?.title ?? 'Untitled calculation',
      metadata: tpl ? { ...tpl.metadata } : {},
      settings: { ...DEFAULT_SETTINGS, ...(tpl?.settings ?? {}) },
      inputResult: made?.inputResult,
      createdAt: new Date().toISOString(),
    });
    applySettings();
  });
  const placed = primeEngine(shapes);
  await nextTask();
  withoutAutosave(() => {
    loadShapes(placed);
    resyncAll();
    focusFirstPage();
  });
  saves.reset();
  await saveDocument();
}

export async function openDocument(id: string): Promise<void> {
  await flushBeforeSwitch();
  const doc = await DocumentManager.get(id);
  if (!doc) {
    useAppStore.getState().showToast('error', 'That worksheet no longer exists.');
    return;
  }
  await loadDocument(doc);
}

export async function initDocuments(): Promise<void> {
  // Let the calculation worker finish starting first: messages posted while it is
  // still loading are only handed over when the UI thread is free, i.e. after the
  // (long) first render of the worksheet. Posted now, they are calculated during it.
  await engine.ready();
  // ?template=<id> always starts a new worksheet from that template (link-friendly);
  // the parameter is removed so a reload reopens the worksheet instead of creating another.
  const asked = new URLSearchParams(window.location.search).get('template');
  if (asked && templateById(asked as TemplateId)) {
    const url = new URL(window.location.href);
    url.searchParams.delete('template');
    window.history.replaceState(null, '', url);
    writeDefaultVersion();
    return newDocument({ template: asked as TemplateId });
  }
  // One-time: when the default template changes, open it once for returning
  // visitors too (their own worksheets stay in File → Open).
  if (readDefaultVersion() !== DEFAULT_TEMPLATE_VERSION) {
    writeDefaultVersion();
    return newDocument({ template: firstRunTemplate() });
  }
  try {
    const lastId = await DocumentManager.getLastOpenedId();
    const doc = lastId ? await DocumentManager.get(lastId) : null;
    if (doc) return loadDocument(doc);
    const docs = await DocumentManager.list();
    if (docs.length) {
      const latest = await DocumentManager.get(docs[0].id);
      if (latest) return loadDocument(latest);
    }
  } catch (e) {
    console.warn('Saved worksheets are unavailable here', e);
  }
  await newDocument({ template: firstRunTemplate() });
}

const DEFAULT_TEMPLATE_VERSION = 'rc-beam-1';
const DEFAULT_KEY = 'calccanvas.defaultTemplate';
function readDefaultVersion(): string | null {
  try {
    return localStorage.getItem(DEFAULT_KEY);
  } catch {
    return DEFAULT_TEMPLATE_VERSION; // storage blocked: behave as before
  }
}
function writeDefaultVersion(): void {
  try {
    localStorage.setItem(DEFAULT_KEY, DEFAULT_TEMPLATE_VERSION);
  } catch {
    /* ignore */
  }
}

/** Worksheet for a first visit. */
function firstRunTemplate(): TemplateId {
  return 'rc-beam';
}

/** CalcCanvas worksheet file: the JSON document, saved with its own extension. */
export const FILE_EXT = '.mCalcCanvas';
export const FILE_ACCEPT = '.mCalcCanvas,.mcalccanvas,.json,application/json';

export function isWorksheetFile(f: File): boolean {
  return /\.(mcalccanvas|json)$/i.test(f.name) || f.type === 'application/json';
}

function fileBaseName(title: string): string {
  return title.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 120) || 'calculation';
}

type SavePicker = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{
  createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }>;
}>;

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Save the worksheet to a .mCalcCanvas file on the user's computer. Uses the
 * browser's "Save as" dialog where available (Chrome/Edge), else a download.
 * Returns false if the user cancelled.
 */
export async function saveToFile(format: 'mcalc' | 'json' = 'mcalc'): Promise<boolean> {
  const doc = currentDocument();
  const blob = new Blob([serializeDocument(doc)], { type: 'application/json' });
  const name = fileBaseName(doc.title) + (format === 'json' ? '.json' : FILE_EXT);
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker && window.self === window.top) {
    try {
      const handle = await picker({
        suggestedName: name,
        types: [format === 'json' ? { description: 'JSON', accept: { 'application/json': ['.json'] } } : { description: 'CalcCanvas worksheet', accept: { 'application/json': [FILE_EXT] } }],
      });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      useAppStore.getState().showToast('info', `Saved “${name}”.`);
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false;
      /* picker unavailable (e.g. sandboxed): fall back to a download */
    }
  }
  downloadBlob(blob, name);
  return true;
}

/** Kept for existing callers: JSON download. */
export function exportJson(): void {
  void saveToFile('json');
}

export async function importJson(file: File): Promise<void> {
  try {
    const parsed = parseDocument(JSON.parse(await file.text()));
    let existing = null;
    try {
      existing = await DocumentManager.get(parsed.id);
    } catch {
      /* storage unavailable */
    }
    const doc = existing ? { ...parsed, id: newId() } : parsed;
    await flushBeforeSwitch();
    await loadDocument(doc);
    await saveDocument();
    useAppStore.getState().showToast('info', `Imported “${doc.title}”.`);
  } catch (e) {
    useAppStore.getState().showToast('error', `Import failed: ${e instanceof Error ? e.message : 'invalid file'}`);
  }
}
