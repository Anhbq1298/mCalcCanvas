/**
 * Higher-level canvas operations used by tools, menus and shortcuts.
 */
import {
  addShapes,
  deleteShapes,
  expandGroups,
  GRID_MAJOR,
  GRID_SIZE,
  markHistory,
  newShapeId,
  orderedShapes,
  select,
  setCamera,
  setCameraClamp,
  startEditing,
  transaction,
  updateShapes,
  useCanvasStore,
  type ShapePatch,
} from './model/canvasStore';
import { screenToPage, shapeBounds, snap, unionBounds } from './model/geometry';
import { DEFAULT_GRAPH_STYLE, DEFAULT_MATH_PROPS, DEFAULT_TEXT_PROPS, type GraphProps, type GraphSeries, type Point, type Shape } from './model/types';
import { plainTextToHtml } from './sanitize';
import { sanitizeShape } from '../documents/DocumentSerializer';
import { clampDelta, clampPoint, clampShapesIntoPage, constrained, crossPoint, nextPrintableTop, nextWritingPoint, printableAt } from './pageConstraint';
import { PAGE_GAP, pageBox, pageCount, pageSize } from '../export/pageGeometry';
import { globalLine, lineOccupied, lineRemovable, lineY, pageLines, planLineShift, planSeparation, type LayoutPlan } from './layout';
import { useAppStore } from '../store/appStore';
import { buildLibraryShape, SHAPE_LIBRARY } from './shapeLibrary';

const get = () => useCanvasStore.getState();

/** Viewport element size, kept up to date by CanvasView. */
export const viewport = { w: 1200, h: 800, el: null as HTMLElement | null };

/**
 * Page layout: scrolling stops a little past the pages (no endless empty desk
 * above, below or beside them). When the pages are smaller than the view they
 * can move only within it. Free canvas: unlimited.
 */
setCameraClamp((cam) => {
  const { canvasMode, pageOrientation, pages } = useAppStore.getState().settings;
  if (canvasMode !== 'page') return cam;
  const page = pageSize(pageOrientation);
  const n = pageCount(orderedShapes(), pageOrientation, pages);
  const m = 48 / cam.z;
  const axis = (pos: number, c0: number, c1: number, view: number) => {
    const lo = c0 - m;
    const hi = c1 + m - view;
    return Math.min(Math.max(pos, Math.min(lo, hi)), Math.max(lo, hi));
  };
  return {
    x: axis(cam.x, 0, page.w, viewport.w / cam.z),
    y: axis(cam.y, 0, n * (page.h + PAGE_GAP) - PAGE_GAP, viewport.h / cam.z),
    z: cam.z,
  };
});
/** Last pointer position in page coordinates. */
export const lastPointer = { x: 0, y: 0, inside: false };

export function snapPoint(p: Point): Point {
  const on = get().isSnap || get().isGrid;
  return { x: snap(p.x, GRID_SIZE, on), y: snap(p.y, GRID_SIZE, on) };
}

export function viewportCenter(): Point {
  return screenToPage({ x: viewport.w / 2, y: viewport.h / 2 }, get().camera);
}

/** Where a new region goes: the pointer if it is over the canvas, else the view centre. */
export function insertionPoint(): Point {
  const cross = get().crosshair;
  if (cross) return { x: cross.x, y: cross.y - 14 };
  if (lastPointer.inside && printableAt(lastPointer)) return { x: lastPointer.x, y: lastPointer.y - 14 };
  if (constrained()) return nextWritingPoint(viewportCenter());
  const c = viewportCenter();
  return { x: c.x - 40, y: c.y - 14 };
}

/** Move the + insertion cross, keeping it on the writable page area (it may continue onto the next page). */
export function moveCrosshair(dx: number, dy: number): void {
  const c = get().crosshair;
  if (!c) return;
  let next = crossPoint({ x: c.x + dx, y: c.y + dy });
  if (constrained() && !printableAt(next)) {
    if (dy > 0) {
      // Past the bottom margin: first line of the next page.
      const after = nextPrintableTop(next.y);
      if (after === null) return;
      next = crossPoint({ x: next.x, y: after + GRID_MAJOR });
    } else if (dy < 0) {
      return;
    } else {
      next = crossPoint(clampPoint(next));
    }
  }
  setCross(next);
}

function setCross(next: Point): void {
  useCanvasStore.setState({ crosshair: next });
  const cam = get().camera;
  const top = cam.y + 40 / cam.z;
  const bottom = cam.y + (viewport.h - 60) / cam.z;
  if (next.y > bottom) setCamera({ ...cam, y: next.y - (viewport.h - 120) / cam.z });
  else if (next.y < top) setCamera({ ...cam, y: next.y - 80 / cam.z });
}

/**
 * Enter at the + cross inserts a blank line, like pressing Enter in a
 * document: everything on that line and below moves down one major line
 * (content past the bottom of a page continues on the next page) and the
 * cross moves down with it. One undo step.
 */
export function insertLineAtCrosshair(): void {
  const c = get().crosshair;
  if (!c) return;
  const g = globalLine(c.y);
  transaction(() => applyLayout(planLineShift(get().shapes, g, +1)));
  setCross({ x: c.x, y: lineY(g + 1) });
}

/**
 * Delete at the + cross removes the blank line the cross is on: everything
 * below moves up one line and the cross stays. Does nothing if that line has content.
 */
export function deleteLineAtCrosshair(): boolean {
  const c = get().crosshair;
  if (!c) return false;
  const g = globalLine(c.y);
  if (!lineRemovable(get().shapes, g)) return false;
  transaction(() => applyLayout(planLineShift(get().shapes, g + 1, -1)));
  return true;
}

/**
 * Backspace at the + cross removes the blank line above it: everything
 * from the cross down moves up one line. Does nothing if that line has content.
 */
export function deleteLineAboveCrosshair(): boolean {
  const c = get().crosshair;
  if (!c) return false;
  const g = globalLine(c.y);
  if (g <= 0 || lineOccupied(get().shapes, g - 1)) return false;
  transaction(() => applyLayout(planLineShift(get().shapes, g, -1)));
  setCross({ x: c.x, y: lineY(g - 1) });
  return true;
}

/**
 * Keep regions from sitting on top of each other (see layout.planSeparation).
 * Runs after a drop, after a region grows or re-aligns to its baseline, and
 * when editing ends. The whole cascade is computed first and applied as one
 * update; it joins the current undo step (layout follows the user's action).
 */
export function separateRegion(...ids: string[]): void {
  const plan = planSeparation(get().shapes, ids);
  if (plan.patches && Object.keys(plan.patches).length) applyLayout(plan, { history: false });
}

/** Apply a layout plan in one store update (adding pages if content was pushed past the last one). */
function applyLayout(plan: LayoutPlan, opts: { history?: boolean } = {}): void {
  if (!Object.keys(plan.patches).length) return;
  if (plan.pagesNeeded > totalPagesNow()) useAppStore.getState().updateSettings({ pages: plan.pagesNeeded });
  updateShapes(plan.patches, { history: opts.history });
}

function totalPagesNow(): number {
  const orientation = useAppStore.getState().settings.pageOrientation;
  return pageCount(orderedShapes(), orientation, useAppStore.getState().settings.pages);
}

export function createMathRegion(point: Point, latex = ''): string {
  const id = newShapeId();
  const p = snapPoint(point);
  addShapes([{ id, type: 'math', x: p.x, y: p.y, props: { ...DEFAULT_MATH_PROPS, latex } }], { select: true });
  clampShapesIntoPage([id]);
  useCanvasStore.setState({ editingId: id, tool: 'select', crosshair: null });
  return id;
}

export function createTextRegion(point: Point, html = ''): string {
  const id = newShapeId();
  const p = snapPoint(point);
  const fontFamily = useAppStore.getState().settings.textFont;
  const box = constrained() ? printableAt(p) ?? null : null;
  const w = box ? Math.min(DEFAULT_TEXT_PROPS.w, box.x + box.w - p.x) : DEFAULT_TEXT_PROPS.w;
  addShapes([{ id, type: 'text', x: p.x, y: p.y, props: { ...DEFAULT_TEXT_PROPS, w: Math.max(80, w), fontFamily, html } }], { select: true });
  clampShapesIntoPage([id]);
  useCanvasStore.setState({ editingId: id, tool: 'select', crosshair: null });
  return id;
}

export function beginEditSelected(): boolean {
  const { selection, shapes } = get();
  if (selection.length !== 1) return false;
  const s = shapes[selection[0]];
  if (s?.type !== 'math' && s?.type !== 'text') return false;
  if (s.type === 'text' && s.props.annex?.kind === 'link') return false;
  startEditing(s.id);
  return true;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 300, h: img.naturalHeight || 200 });
    img.onerror = () => resolve({ w: 300, h: 200 });
    img.src = src;
  });
}

export async function insertImageFile(file: Blob, at?: Point): Promise<void> {
  if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.type)) return;
  const src = await readAsDataUrl(file);
  const nat = await imageSize(src);
  // Fit into roughly the printable page width.
  const scale = Math.min(1, 560 / nat.w, 600 / nat.h);
  const w = Math.round(nat.w * scale);
  const h = Math.round(nat.h * scale);
  const c = at ?? viewportCenter();
  const p = snapPoint({ x: c.x - w / 2, y: c.y - h / 2 });
  const imgId = newShapeId();
  addShapes([{ id: imgId, type: 'image', x: p.x, y: p.y, props: { w, h, src } }], { select: true });
  clampShapesIntoPage([imgId]);
  useCanvasStore.setState({ tool: 'select' });
}

/** Insert a ready-made shape (Insert tab) at the insertion point, selected as one group. */
export function insertLibraryShape(id: string): string[] {
  const item = SHAPE_LIBRARY.find((i) => i.id === id);
  if (!item) return [];
  const p = snapPoint(insertionPoint());
  const list = buildLibraryShape(item, p.x, p.y + 14, newShapeId);
  addShapes(list, { select: true });
  clampShapesIntoPage(list.map((sh) => sh.id));
  useCanvasStore.setState({ tool: 'select', crosshair: null });
  return list.map((sh) => sh.id);
}

/** A new X-Y graph at the insertion point (series are added in the Plots tab). */
export function insertGraph(at?: Point, props: Partial<GraphProps> = {}): string {
  const p = snapPoint(at ?? insertionPoint());
  const id = newShapeId();
  const graph: GraphProps = { w: 360, h: 280, title: '', xLabel: '', yLabel: '', xUnit: '', yUnit: '', equalAxes: false, ...DEFAULT_GRAPH_STYLE, series: [], ...props };
  addShapes([{ id, type: 'graph', x: p.x, y: p.y, props: graph }], { select: true });
  clampShapesIntoPage([id]);
  useCanvasStore.setState({ tool: 'select' });
  return id;
}

const SERIES_COLORS = ['#1e3a5f', '#dc2626', '#047857', '#ea580c', '#7c3aed', '#0891b2'];

/** A new empty series for a graph (unique id, next colour). */
export function newGraphSeries(existing: GraphSeries[]): GraphSeries {
  let n = existing.length + 1;
  const ids = new Set(existing.map((s) => s.id));
  while (ids.has(`s${n}`)) n++;
  return { id: `s${n}`, label: '', x: '', y: '', style: 'line', r: '', color: SERIES_COLORS[existing.length % SERIES_COLORS.length], width: 1.5, show: '' };
}

// ---------------------------------------------------------------------------
// Clipboard, duplicate, delete, group, nudge
// ---------------------------------------------------------------------------

const CLIP_PREFIX = 'calccanvas-shapes:';
let internalClipboard: Shape[] = [];
let pasteCount = 0;

function selectedShapes(): Shape[] {
  const { selection } = get();
  const set = new Set(selection);
  return orderedShapes().filter((s) => set.has(s.id));
}

export async function copySelection(): Promise<void> {
  const shapes = selectedShapes();
  if (!shapes.length) return;
  internalClipboard = shapes;
  pasteCount = 0;
  try {
    await navigator.clipboard.writeText(CLIP_PREFIX + JSON.stringify(shapes));
  } catch {
    /* clipboard permission denied: internal clipboard still works */
  }
}

export async function cutSelection(): Promise<void> {
  await copySelection();
  deleteShapes(get().selection);
}

function cloneShapes(list: Shape[], times: number): Shape[] {
  const groupMap = new Map<string, string>();
  // Offset copies by two minor squares sideways and one major line down, so they stay on the ruled lines.
  const dx = GRID_SIZE * 2 * times;
  const dy = GRID_MAJOR * times;
  return list.map((s) => {
    const clone: Shape = { ...s, id: newShapeId(), x: s.x + dx, y: s.y + dy } as Shape;
    if (s.groupId) {
      if (!groupMap.has(s.groupId)) groupMap.set(s.groupId, newShapeId());
      clone.groupId = groupMap.get(s.groupId);
    }
    return clone;
  });
}

export function pasteShapes(list: Shape[] = internalClipboard): void {
  if (!list.length) return;
  pasteCount++;
  const clones = cloneShapes(list, pasteCount);
  addShapes(clones, { select: true });
  clampShapesIntoPage(clones.map((s) => s.id));
}

/** Handle a paste event: shapes from CalcCanvas, images, or plain text. */
export function handlePasteData(data: DataTransfer | null): boolean {
  if (!data) return false;
  const image = [...data.files].find((f) => f.type.startsWith('image/'));
  if (image) {
    void insertImageFile(image, insertionPoint());
    return true;
  }
  const text = data.getData('text/plain');
  if (text.startsWith(CLIP_PREFIX)) {
    try {
      const raw: unknown = JSON.parse(text.slice(CLIP_PREFIX.length));
      // The clipboard is untrusted (any page can put this prefix on it): validate like an imported file.
      const parsed = Array.isArray(raw) ? raw.slice(0, 5000).map(sanitizeShape).filter((s): s is Shape => !!s) : null;
      if (parsed && parsed.length) {
        if (JSON.stringify(parsed) !== JSON.stringify(internalClipboard)) pasteCount = 0;
        internalClipboard = parsed;
        pasteShapes(parsed);
        return true;
      }
    } catch {
      /* fall through to text */
    }
  }
  if (internalClipboard.length && !text) {
    pasteShapes();
    return true;
  }
  if (text.trim()) {
    const id = createTextRegion(insertionPoint(), plainTextToHtml(text));
    useCanvasStore.setState({ editingId: null, selection: [id] });
    return true;
  }
  return false;
}

export function duplicateSelection(): void {
  const shapes = selectedShapes();
  if (!shapes.length) return;
  const clones = cloneShapes(shapes, 1);
  addShapes(clones, { select: true });
  clampShapesIntoPage(clones.map((s) => s.id));
}

/**
 * Delete the selected regions and close the gap they leave, like deleting
 * lines in a document: each line they covered that is now empty is removed
 * and everything below moves up. A line still holding something (a label
 * beside the deleted equation) stays. One undo step.
 */
export function deleteSelection(): void {
  const before = get().shapes;
  const ids = get().selection.filter((id) => before[id]);
  if (!ids.length) return;
  const lines = new Set<number>();
  for (const id of ids) {
    const b = shapeBounds(before[id]);
    // Lines whose baseline lies inside the region.
    for (let g = globalLine(b.y + 10); lineY(g) <= b.y + b.h + 9; g++) if (lineY(g) >= b.y + 10) lines.add(g);
  }
  transaction(() => {
    deleteShapes(ids);
    // Bottom-up, so the line numbers above stay valid.
    for (const g of [...lines].sort((a, b) => b - a)) {
      if (!lineRemovable(get().shapes, g)) continue;
      applyLayout(planLineShift(get().shapes, g + 1, -1));
    }
  });
}

export function groupSelection(): void {
  const ids = get().selection;
  if (ids.length < 2) return;
  const gid = newShapeId();
  updateShapes(Object.fromEntries(ids.map((id) => [id, { groupId: gid }])));
}

export function ungroupSelection(): void {
  const ids = get().selection.filter((id) => get().shapes[id]?.groupId);
  if (!ids.length) return;
  updateShapes(Object.fromEntries(ids.map((id) => [id, { groupId: undefined } as ShapePatch])));
}

export function nudgeSelection(dx: number, dy: number): void {
  const { selection, shapes } = get();
  if (!selection.length) return;
  const b = unionBounds(selection.map((id) => shapeBounds(shapes[id])));
  if (b) ({ dx, dy } = clampDelta(b, dx, dy));
  updateShapes(Object.fromEntries(selection.map((id) => [id, { x: shapes[id].x + dx, y: shapes[id].y + dy }])));
}

export function selectByIds(ids: string[]): void {
  select(expandGroups(ids));
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export function zoomAt(screen: Point, factor: number): void {
  const cam = get().camera;
  const z = Math.min(8, Math.max(0.1, cam.z * factor));
  const page = screenToPage(screen, cam);
  setCamera({ x: page.x - screen.x / z, y: page.y - screen.y / z, z });
}

export function zoomIn(): void {
  zoomAt({ x: viewport.w / 2, y: viewport.h / 2 }, 1.25);
}
export function zoomOut(): void {
  zoomAt({ x: viewport.w / 2, y: viewport.h / 2 }, 0.8);
}
export function resetZoom(): void {
  const cam = get().camera;
  zoomAt({ x: viewport.w / 2, y: viewport.h / 2 }, 1 / cam.z);
}
export function zoomToFit(): void {
  const b = unionBounds(orderedShapes().map(shapeBounds));
  if (!b) return;
  const pad = 48;
  const z = Math.min(2, Math.max(0.1, Math.min((viewport.w - pad * 2) / Math.max(b.w, 1), (viewport.h - pad * 2) / Math.max(b.h, 1))));
  setCamera({ x: b.x + b.w / 2 - viewport.w / 2 / z, y: b.y + b.h / 2 - viewport.h / 2 / z, z });
}

/** The page under the middle of the view. */
function pageInView(): number {
  const orientation = useAppStore.getState().settings.pageOrientation;
  const { h } = pageSize(orientation);
  const c = screenToPage({ x: viewport.w / 2, y: viewport.h / 2 }, get().camera);
  return Math.max(0, Math.floor(c.y / (h + 48)));
}

/** Zoom so the whole page under the view fits, centred. */
export function zoomFitPage(): void {
  const b = pageBox(pageInView(), useAppStore.getState().settings.pageOrientation);
  const z = Math.min(8, Math.max(0.1, Math.min((viewport.w - 32) / b.w, (viewport.h - 32) / b.h)));
  setCamera({ x: b.x + b.w / 2 - viewport.w / 2 / z, y: b.y + b.h / 2 - viewport.h / 2 / z, z });
}

/** Zoom so the page width fills the view, keeping the page's top in view. */
export function zoomFitWidth(): void {
  const b = pageBox(pageInView(), useAppStore.getState().settings.pageOrientation);
  const cam = get().camera;
  const centreY = screenToPage({ x: 0, y: viewport.h / 2 }, cam).y;
  const z = Math.min(8, Math.max(0.1, (viewport.w - 32) / b.w));
  setCamera({ x: b.x - 16 / z, y: centreY - viewport.h / 2 / z, z });
}

/** 100 %, keeping the centre of the view. */
export function zoomActualSize(): void {
  zoomAt({ x: viewport.w / 2, y: viewport.h / 2 }, 1 / get().camera.z);
}

/**
 * Page break at the + cross (or above the selected regions): the line there and
 * everything below it move to the top of the next page. It is a layout move,
 * so it is saved, printed and undone like any other (one undo step).
 */
export function insertPageBreak(): boolean {
  if (!constrained()) return false;
  const st = get();
  const sel = st.selection.map((id) => st.shapes[id]).filter(Boolean);
  const y = st.crosshair ? st.crosshair.y : sel.length ? Math.min(...sel.map((s) => shapeBounds(s).y)) + 20 : null;
  if (y === null) return false;
  const g = globalLine(y);
  const { perPage } = pageLines();
  const next = (Math.floor(g / perPage) + 1) * perPage;
  if (g % perPage === 0) return false; // already the first line of a page
  transaction(() => applyLayout(planLineShift(get().shapes, g, next - g)));
  if (st.crosshair) setCross({ x: st.crosshair.x, y: lineY(next) });
  return true;
}

/** Show the top of page 1 at 100 %, centred horizontally. */
/** Show the top of page 1, centred; zoom out to fit the width on narrow windows. */
export function focusPage(pageWidth: number): void {
  const z = Math.min(1, Math.max(0.3, (viewport.w - 32) / pageWidth));
  setCamera({ x: -Math.max(16, (viewport.w / z - pageWidth) / 2), y: -24 / z, z });
}

/** Scroll so a region is in view (keeping the zoom), and select it. */
export function revealShape(id: string): void {
  const s = get().shapes[id];
  if (!s) return;
  const b = shapeBounds(s);
  const cam = get().camera;
  const vw = viewport.w / cam.z;
  const vh = viewport.h / cam.z;
  const inView = b.x >= cam.x && b.y >= cam.y && b.x + b.w <= cam.x + vw && b.y + b.h <= cam.y + vh;
  if (!inView) setCamera({ x: b.x + b.w / 2 - vw / 2, y: b.y - vh / 3, z: cam.z });
  select([id]);
}

export { markHistory };
