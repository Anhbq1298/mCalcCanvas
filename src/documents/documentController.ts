/**
 * Document lifecycle: new / open / save / save as / autosave / recovery.
 * Files are .mCCV (see FILE_EXT); browser storage is DocumentManager.
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
import type { LoadResult } from './DocumentRepository';

let suppressAutosave = false;
let storageWarningShown = false;

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function applySettings() {
  const { settings } = useAppStore.getState();
  useCanvasStore.setState({ isSnap: settings.snapToGrid === true });
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
    const app = useAppStore.getState();
    if (!app.documentId) useAppStore.setState({ documentId: doc.id });
    if (!app.documentId || app.documentId === doc.id) useAppStore.setState({ savedAt: doc.updatedAt });
  },
  onError: (e) => {
    console.warn('Save failed', e);
    if (!storageWarningShown) {
      storageWarningShown = true;
      useAppStore.getState().showToast('info', 'This view can’t save to browser storage. Use File → Save As to keep your work in a .mCCV file.');
    }
  },
});

function scheduleSave() {
  if (suppressAutosave) return;
  saves.markDirty();
  const { file } = useAppStore.getState();
  if (file && !file.dirty) useAppStore.setState({ file: { ...file, dirty: true } });
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
  // Leaving or closing the tab: write pending edits now (more reliable than beforeunload alone).
  const hidden = () => {
    if (document.visibilityState === 'hidden' && saves.dirty) void saves.flush();
  };
  const pagehide = () => {
    if (saves.dirty) void saves.flush();
  };
  window.addEventListener('beforeunload', flush);
  window.addEventListener('pagehide', pagehide);
  document.addEventListener('visibilitychange', hidden);
  return () => {
    stopCanvas();
    stopApp();
    window.removeEventListener('beforeunload', flush);
    window.removeEventListener('pagehide', pagehide);
    document.removeEventListener('visibilitychange', hidden);
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
  if (linkedFile?.docId !== doc.id) linkedFile = null;
  useAppStore.setState({ file: linkedFile ? { name: linkedFile.handle.name, dirty: false } : null, savedAt: doc.updatedAt });
  void DocumentManager.setLastOpenedId(doc.id).catch(() => {});
}

/** Load a worksheet read from storage; a recovered one is saved again at once (replacing the unreadable record). */
async function openLoaded(res: LoadResult): Promise<void> {
  await loadDocument(res.doc);
  if (res.recoveredFrom) {
    await saves.flush(true);
    useAppStore.getState().showToast('info', `“${res.doc.title}” could not be read; recovered the version of ${new Date(res.recoveredFrom.savedAt).toLocaleString()}.`);
  }
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
  linkedFile = null;
  useAppStore.setState({ file: null });
  await saves.flush(true);
}

export async function openDocument(id: string): Promise<void> {
  await flushBeforeSwitch();
  let res: LoadResult | null;
  try {
    res = await DocumentManager.load(id);
  } catch (e) {
    useAppStore.getState().showToast('error', `That worksheet can’t be opened: ${e instanceof Error ? e.message : 'unreadable'}`);
    return;
  }
  if (!res) {
    useAppStore.getState().showToast('error', 'That worksheet no longer exists.');
    return;
  }
  await openLoaded(res);
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
    const last = lastId ? await DocumentManager.load(lastId).catch(() => null) : null;
    if (last) return openLoaded(last);
    for (const d of await DocumentManager.list()) {
      const res = await DocumentManager.load(d.id).catch(() => null);
      if (res) return openLoaded(res);
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

/**
 * mCalcCanvas worksheet file (.mCCV): the JSON document envelope of
 * `serializeDocument`. Worksheets and templates use only this extension.
 * Files from earlier versions (.mCalcCanvas, .json) contain the same
 * envelope: they still open (drag & drop, or "All files" in the picker),
 * are migrated by `parseDocument`, and are written back as .mCCV.
 */
export const FILE_EXT = '.mCCV';
export const FILE_MIME = 'application/vnd.mccv+json';
/** Small .mCCV document icon (public/icons, made by tools/icons/build-file-icon.mjs). */
export const FILE_ICON = `${import.meta.env.BASE_URL}icons/mccv-file-small.svg`;
/** File picker filter (.mCCV only). */
export const FILE_ACCEPT = '.mccv';
const LEGACY_FILE = /\.(mcalccanvas|json)$/i;

export function isWorksheetFile(f: File): boolean {
  return /\.mccv$/i.test(f.name) || LEGACY_FILE.test(f.name) || f.type === 'application/json' || f.type === FILE_MIME;
}

/** `Title.mCCV` with characters Windows does not allow in file names replaced. */
export function worksheetFileName(title: string): string {
  return (title.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 120) || 'calculation') + FILE_EXT;
}

/** The .mCCV name for an opened file (a legacy extension is replaced). */
function withExt(name: string): string {
  return /\.mccv$/i.test(name) ? name : name.replace(LEGACY_FILE, '') + FILE_EXT;
}

interface WritableFileHandle {
  name: string;
  createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }>;
}
type SavePicker = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<WritableFileHandle>;

/** The .mCCV file chosen with Save As in this session (Chrome/Edge): Save writes it again. */
let linkedFile: { docId: string; handle: WritableFileHandle } | null = null;

function fileBlob(): Blob {
  return new Blob([serializeDocument(currentDocument())], { type: FILE_MIME });
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function writeHandle(handle: WritableFileHandle): Promise<void> {
  const w = await handle.createWritable();
  await w.write(fileBlob());
  await w.close();
}

async function rememberFileName(name: string): Promise<void> {
  const id = useAppStore.getState().documentId;
  if (id) await DocumentManager.setFileName(id, name).catch(() => {});
}

/**
 * Save (Ctrl+S): write the worksheet to browser storage now (with a version
 * snapshot) and, if it was saved to a .mCCV file with Save As in this
 * session, to that file too. Returns the file name written, if any.
 */
export async function saveDocument(): Promise<string | null> {
  await saves.flush(true);
  const app = useAppStore.getState();
  if (!linkedFile || linkedFile.docId !== app.documentId) return null;
  try {
    await writeHandle(linkedFile.handle);
    useAppStore.setState({ file: { name: linkedFile.handle.name, dirty: false } });
    return linkedFile.handle.name;
  } catch (e) {
    console.warn('Writing the .mCCV file failed', e);
    app.showToast('error', `Could not write “${linkedFile.handle.name}”. Use File → Save As.`);
    return null;
  }
}

/**
 * Save As: write the worksheet to a .mCCV file on the user's computer. Uses
 * the browser's "Save as" dialog where available (Chrome/Edge; Save then
 * keeps writing that file), else a download. Returns false if cancelled.
 */
export async function saveAsFile(): Promise<boolean> {
  await saves.flush();
  const app = useAppStore.getState();
  const name = worksheetFileName(app.title);
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker && window.self === window.top) {
    try {
      const handle = await picker({ suggestedName: name, types: [{ description: 'mCalcCanvas worksheet', accept: { [FILE_MIME]: [FILE_EXT] } }] });
      await writeHandle(handle);
      if (app.documentId) linkedFile = { docId: app.documentId, handle };
      useAppStore.setState({ file: { name: handle.name, dirty: false } });
      await rememberFileName(handle.name);
      app.showToast('info', `Saved “${handle.name}”.`);
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false;
      /* picker unavailable (e.g. sandboxed): fall back to a download */
    }
  }
  downloadBlob(fileBlob(), name);
  await rememberFileName(name);
  return true;
}

/** Open a .mCCV file (or a legacy .mCalcCanvas / .json one, which is migrated). */
export async function openFile(file: File): Promise<void> {
  const legacy = !/\.mccv$/i.test(file.name);
  try {
    const parsed = parseDocument(JSON.parse(await file.text()));
    let existing: unknown = null;
    try {
      existing = await DocumentManager.get(parsed.id);
    } catch {
      existing = true; // unreadable record with that id: open as a new worksheet
    }
    // Never overwrite a worksheet already in this browser: an opened file is a copy.
    const doc = existing ? { ...parsed, id: newId() } : parsed;
    await flushBeforeSwitch();
    await loadDocument(doc);
    await saves.flush(true);
    await rememberFileName(withExt(file.name));
    useAppStore
      .getState()
      .showToast('info', legacy ? `Converted “${file.name}” to the .mCCV format. Use File → Save As to write a .mCCV copy.` : `Opened “${file.name}”.`);
  } catch (e) {
    useAppStore.getState().showToast('error', `Could not open “${file.name}”: ${e instanceof Error ? e.message : 'not an mCalcCanvas worksheet'}`);
  }
}

/** Replace the open worksheet with one of its version snapshots (the current state is kept as a version first). */
export async function restoreVersion(versionId: string): Promise<void> {
  await saves.flush(true);
  const doc = await DocumentManager.getVersion(versionId);
  if (!doc) {
    useAppStore.getState().showToast('error', 'That version no longer exists.');
    return;
  }
  const when = new Date(doc.updatedAt).toLocaleString();
  await loadDocument({ ...doc, updatedAt: new Date().toISOString() });
  await saves.flush(true);
  useAppStore.getState().showToast('info', `Restored the version of ${when}.`);
}
