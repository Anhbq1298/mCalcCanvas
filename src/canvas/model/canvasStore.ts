/**
 * The canvas document store (shapes, order, selection, camera, tool) plus
 * snapshot-based undo/redo. Shapes are immutable records: every change
 * replaces the changed shape objects, so a snapshot is just two references.
 */
import { create } from 'zustand';
import type { Box, Camera, Point, Shape, ToolId } from './types';

interface Snapshot {
  shapes: Record<string, Shape>;
  order: string[];
}

export interface CanvasState {
  shapes: Record<string, Shape>;
  order: string[];
  selection: string[];
  editingId: string | null;
  tool: ToolId;
  camera: Camera;
  isGrid: boolean;
  isSnap: boolean;
  /** Mathcad-style red insertion cross: where the next typed region goes. */
  crosshair: Point | null;
  /** While dragging: where the dragged block will land (grid-snapped). */
  dropPreview: Box | null;
  /** True while shapes are being dragged. */
  dragging: boolean;
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  /** Increments on every document (shape) change caused by the user. */
  docVersion: number;
}

export const useCanvasStore = create<CanvasState>(() => ({
  shapes: {},
  order: [],
  selection: [],
  editingId: null,
  tool: 'select',
  camera: { x: -40, y: -24, z: 1 },
  isGrid: true,
  isSnap: false,
  crosshair: null,
  dropPreview: null,
  dragging: false,
  undoStack: [],
  redoStack: [],
  docVersion: 0,
}));

const get = () => useCanvasStore.getState();
const set = useCanvasStore.setState;

const HISTORY_LIMIT = 200;

/**
 * Position normaliser applied whenever a shape is added, loaded or moved.
 * Installed by the page module: math and text regions snap to the grid.
 */
let normalizePosition: (s: Shape) => Shape = (s) => s;
export function setPositionNormalizer(fn: (s: Shape) => Shape): void {
  normalizePosition = fn;
}
export const GRID_SIZE = 20;
/** Major lines every 2 squares (40 px), drawn like the minor ones. Math and text sit with their baseline on a grid line. */
export const GRID_MAJOR_EVERY = 2;
export const GRID_MAJOR = GRID_SIZE * GRID_MAJOR_EVERY;

export function newShapeId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** Record an undo point before a user change. */
let transactionDepth = 0;

/**
 * Group several changes into one undo step: the state before the first
 * change is recorded once, and changes inside do not add further entries.
 * Nested transactions join the outer one.
 */
export function transaction<T>(fn: () => T): T {
  if (transactionDepth === 0) markHistory();
  transactionDepth++;
  try {
    return fn();
  } finally {
    transactionDepth--;
  }
}

export function markHistory(): void {
  if (transactionDepth > 0) return;
  const { shapes, order, undoStack } = get();
  const last = undoStack[undoStack.length - 1];
  if (last && last.shapes === shapes && last.order === order) return;
  set({ undoStack: [...undoStack, { shapes, order }].slice(-HISTORY_LIMIT), redoStack: [] });
}

function restore(snap: Snapshot) {
  const sel = get().selection.filter((id) => snap.shapes[id]);
  set((s) => ({ shapes: snap.shapes, order: snap.order, selection: sel, editingId: null, docVersion: s.docVersion + 1 }));
}

export function undo(): void {
  const { undoStack, redoStack, shapes, order } = get();
  let stack = [...undoStack];
  let snap = stack.pop();
  // Skip snapshots identical to the current state (marks without changes).
  while (snap && snap.shapes === shapes && snap.order === order) snap = stack.pop();
  if (!snap) return;
  set({ undoStack: stack, redoStack: [...redoStack, { shapes, order }] });
  stack = [];
  restore(snap);
}

export function redo(): void {
  const { undoStack, redoStack, shapes, order } = get();
  const stack = [...redoStack];
  const snap = stack.pop();
  if (!snap) return;
  set({ redoStack: stack, undoStack: [...undoStack, { shapes, order }] });
  restore(snap);
}

export function canUndo(s: CanvasState): boolean {
  return s.undoStack.some((u) => u.shapes !== s.shapes || u.order !== s.order);
}

// ---------------------------------------------------------------------------
// Shape mutations
// ---------------------------------------------------------------------------

interface ChangeOptions {
  /** false = do not create an undo point (layout measurements, live drags). */
  history?: boolean;
  /** Skip grid normalisation (live drag preview; the drop snaps). */
  raw?: boolean;
}

export function addShapes(list: Shape[], opts: ChangeOptions & { select?: boolean } = {}): void {
  if (!list.length) return;
  if (opts.history !== false) markHistory();
  set((s) => {
    const shapes = { ...s.shapes };
    list = list.map(normalizePosition);
    for (const sh of list) shapes[sh.id] = sh;
    return {
      shapes,
      order: [...s.order, ...list.map((sh) => sh.id)],
      selection: opts.select ? list.map((sh) => sh.id) : s.selection,
      docVersion: s.docVersion + 1,
    };
  });
}

export type ShapePatch = { x?: number; y?: number; groupId?: string | undefined; props?: Record<string, unknown> };

export function updateShapes(patches: Record<string, ShapePatch>, opts: ChangeOptions = {}): void {
  const ids = Object.keys(patches).filter((id) => get().shapes[id]);
  if (!ids.length) return;
  if (opts.history !== false) markHistory();
  set((s) => {
    const shapes = { ...s.shapes };
    for (const id of ids) {
      const prev = shapes[id];
      const p = patches[id];
      let next = { ...prev, ...p, props: p.props ? { ...prev.props, ...p.props } : prev.props } as Shape;
      // Re-align on moves, and when a change shifts the text baseline (font size, measured baseline).
      const shiftsBaseline = !!p.props && ('fontSize' in p.props || 'baseline' in p.props);
      if (('x' in p || 'y' in p || shiftsBaseline) && !opts.raw) next = normalizePosition(next);
      if ('groupId' in p && p.groupId === undefined) delete (next as { groupId?: string }).groupId;
      shapes[id] = next;
    }
    return { shapes, docVersion: s.docVersion + 1 };
  });
}

export function updateShape(id: string, patch: ShapePatch, opts: ChangeOptions = {}): void {
  updateShapes({ [id]: patch }, opts);
}

export function deleteShapes(ids: string[], opts: ChangeOptions = {}): void {
  const existing = ids.filter((id) => get().shapes[id]);
  if (!existing.length) return;
  if (opts.history !== false) markHistory();
  const gone = new Set(existing);
  set((s) => {
    const shapes = { ...s.shapes };
    for (const id of existing) delete shapes[id];
    return {
      shapes,
      order: s.order.filter((id) => !gone.has(id)),
      selection: s.selection.filter((id) => !gone.has(id)),
      editingId: s.editingId && gone.has(s.editingId) ? null : s.editingId,
      docVersion: s.docVersion + 1,
    };
  });
}

/** Replace the whole document (load / new). Clears undo history. */
/** Shapes as loadShapes will place them (grid and page alignment). */
export function placeShapes(list: Shape[]): Shape[] {
  return list.map(normalizePosition);
}

export function loadShapes(list: Shape[]): void {
  list = placeShapes(list);
  const shapes: Record<string, Shape> = {};
  for (const s of list) shapes[s.id] = s;
  set({
    shapes,
    order: list.map((s) => s.id),
    selection: [],
    editingId: null,
    undoStack: [],
    redoStack: [],
    tool: 'select',
  });
}

export function orderedShapes(state: CanvasState = get()): Shape[] {
  return state.order.map((id) => state.shapes[id]).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Selection, editing, tools, camera
// ---------------------------------------------------------------------------

/** Selecting any member of a group selects the whole group. */
export function expandGroups(ids: string[]): string[] {
  const { shapes, order } = get();
  const groups = new Set(ids.map((id) => shapes[id]?.groupId).filter(Boolean));
  if (!groups.size) return ids;
  const out = new Set(ids);
  for (const id of order) if (groups.has(shapes[id].groupId)) out.add(id);
  return [...out];
}

export function select(ids: string[]): void {
  set({ selection: expandGroups(ids) });
}

export function selectAll(): void {
  set((s) => ({ selection: [...s.order] }));
}

export function startEditing(id: string): void {
  const sh = get().shapes[id];
  if (!sh || (sh.type !== 'math' && sh.type !== 'text')) return;
  markHistory();
  set({ editingId: id, selection: [id], tool: 'select' });
}

export function stopEditing(): void {
  const { editingId, shapes } = get();
  if (!editingId) return;
  set({ editingId: null });
  const sh = shapes[editingId];
  // Like Mathcad, an empty region disappears when you leave it (same undo step).
  if (sh && ((sh.type === 'math' && !sh.props.latex.trim()) || (sh.type === 'text' && !sh.props.html.replace(/<[^>]*>|&nbsp;/g, '').trim()))) {
    deleteShapes([editingId], { history: false });
  }
}

export function setTool(tool: ToolId): void {
  stopEditing();
  set({ tool, selection: tool === 'select' ? get().selection : [] });
}

/** Keeps the view on the worksheet (installed by canvasActions; identity until then). */
let clampCamera: (c: Camera) => Camera = (c) => c;
export function setCameraClamp(fn: (c: Camera) => Camera): void {
  clampCamera = fn;
}

export function setCamera(camera: Camera): void {
  const c = clampCamera({ x: camera.x, y: camera.y, z: Math.min(8, Math.max(0.1, camera.z)) });
  set({ camera: c });
}
