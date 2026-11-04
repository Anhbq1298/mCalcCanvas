/**
 * Higher-level canvas operations used by tools, menus and shortcuts.
 */
import {
  addShapes,
  deleteShapes,
  expandGroups,
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
import { clampDelta, clampShapesIntoPage, constrained, nextWritingPoint, printableAt } from './pageConstraint';
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

function cloneShapes(list: Shape[], offset: number): Shape[] {
  const groupMap = new Map<string, string>();
  return list.map((s) => {
    const clone: Shape = { ...s, id: newShapeId(), x: s.x + offset, y: s.y + offset } as Shape;
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
  const clones = cloneShapes(list, GRID_SIZE * 2 * pasteCount);
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
      const parsed = JSON.parse(text.slice(CLIP_PREFIX.length)) as Shape[];
      if (Array.isArray(parsed)) {
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
  const clones = cloneShapes(shapes, GRID_SIZE * 2);
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
