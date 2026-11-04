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
  startEditing,
  updateShapes,
  useCanvasStore,
  type ShapePatch,
} from './model/canvasStore';
import { screenToPage, shapeBounds, snap, unionBounds } from './model/geometry';
import { DEFAULT_MATH_PROPS, DEFAULT_TEXT_PROPS, type Point, type Shape } from './model/types';
import { plainTextToHtml } from './sanitize';
import { sanitizeShape } from '../documents/DocumentSerializer';
import { baselineOf, clampDelta, clampPoint, clampShapesIntoPage, constrained, crossPoint, nextPrintableTop, nextWritingPoint, printableAt } from './pageConstraint';
import { pageCount, printableBox } from '../export/pageGeometry';
import { useAppStore } from '../store/appStore';

const get = () => useCanvasStore.getState();

/** Viewport element size, kept up to date by CanvasView. */
export const viewport = { w: 1200, h: 800, el: null as HTMLElement | null };
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
  shiftLinesFrom(g, +1);
  setCross({ x: c.x, y: lineY(g + 1) });
}

/**
 * Backspace at the + cross removes the blank line above it: everything
 * from the cross down moves up one line. Does nothing if that line has content.
 */
export function deleteLineAboveCrosshair(): boolean {
  const c = get().crosshair;
  if (!c) return false;
  const g = globalLine(c.y);
  if (g <= 0) return false;
  const above = lineY(g - 1);
  const occupied = orderedShapes().some((s) => {
    if (globalLine(anchorY(s)) === g - 1) return true;
    const b = shapeBounds(s);
    return b.y < above + 10 && b.y + b.h > above - 30;
  });
  if (occupied) return false;
  shiftLinesFrom(g, -1);
  setCross({ x: c.x, y: above });
  return true;
}

// -- line model: major lines numbered continuously across pages ---------------

/** The y a shape is "written on": its first baseline (math/text) or, for drawings, a baseline under its top. */
function anchorY(s: Shape): number {
  if (s.type === 'math' || s.type === 'text') return s.y + baselineOf(s);
  return shapeBounds(s).y + 22;
}

/** Index of the major line nearest to y, counted across pages (page mode) or from the origin (free canvas). */
function globalLine(y: number): number {
  if (!constrained()) return Math.round(y / GRID_MAJOR);
  const { stride, top, perPage } = pageLines();
  const page = Math.max(0, Math.floor(y / stride));
  const l = Math.min(perPage, Math.max(1, Math.round((y - page * stride - top) / GRID_MAJOR)));
  return page * perPage + (l - 1);
}

/** y of a global line index (inverse of globalLine). */
function lineY(g: number): number {
  if (!constrained()) return g * GRID_MAJOR;
  const { stride, top, perPage } = pageLines();
  const page = Math.floor(g / perPage);
  return page * stride + top + GRID_MAJOR * ((g % perPage) + 1);
}

function pageLines() {
  const orientation = useAppStore.getState().settings.pageOrientation;
  const p0 = printableBox(0, orientation);
  const p1 = printableBox(1, orientation);
  return { stride: p1.y - p0.y, top: p0.y, perPage: Math.floor(p0.h / GRID_MAJOR) };
}

/**
 * Move every shape written on line ≥ g by `delta` lines (one undo step).
 * Lines are handled in order; a line whose blocks would not fit above the
 * bottom margin of their page moves to the first line of the next page,
 * and every later line moves with it, so the reading order is kept.
 */
function shiftLinesFrom(g: number, delta: number): void {
  const groups = new Map<number, Shape[]>();
  for (const s of orderedShapes()) {
    const line = globalLine(anchorY(s));
    if (line < g) continue;
    if (!groups.has(line)) groups.set(line, []);
    groups.get(line)!.push(s);
  }
  if (!groups.size) return;
  const { perPage } = pageLines();
  const orientation = useAppStore.getState().settings.pageOrientation;
  const patches: Record<string, ShapePatch> = {};
  let extra = 0;
  let lowest = 0;
  for (const line of [...groups.keys()].sort((x, y) => x - y)) {
    const list = groups.get(line)!;
    let target = line + delta + extra;
    if (constrained()) {
      const fits = (t: number) => {
        const page = Math.floor(t / perPage);
        const bottom = printableBox(page, orientation);
        const dy = lineY(t) - lineY(line);
        return list.every((s) => {
          const b = shapeBounds(s);
          return b.y + dy >= bottom.y - 0.5 && b.y + dy + b.h <= bottom.y + bottom.h + 0.5;
        });
      };
      if (!fits(target)) {
        // Continue at the top of the next page (moving down), or stay put (moving up).
        const bumped = delta > 0 ? (Math.floor(target / perPage) + 1) * perPage : line + extra;
        extra += bumped - target;
        target = bumped;
      }
    }
    const dy = lineY(target) - lineY(line);
    for (const s of list) {
      if (dy) patches[s.id] = { y: s.y + dy };
      lowest = Math.max(lowest, shapeBounds(s).y + dy + shapeBounds(s).h);
    }
  }
  if (!Object.keys(patches).length) return;
  // Pages needed for content pushed past the last page.
  if (constrained()) {
    const need = Math.floor(lowest / pageLines().stride) + 1;
    if (need > totalPagesNow(orientation)) useAppStore.getState().updateSettings({ pages: need });
  }
  updateShapes(patches);
}

function totalPagesNow(orientation: 'portrait' | 'landscape'): number {
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

export function deleteSelection(): void {
  deleteShapes(get().selection);
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
