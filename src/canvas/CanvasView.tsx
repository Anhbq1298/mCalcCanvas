/**
 * CalcCanvas's own infinite canvas: pan/zoom viewport, shape rendering,
 * selection, marquee, move, resize and drawing tools.
 *
 * Shapes are DOM elements inside one transformed layer
 * (screen = (page − camera) · zoom), so math regions stay real, editable
 * HTML at every zoom level.
 */
import { importJson, isWorksheetFile } from '../documents/documentController';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { createMathRegion, createTextRegion, insertImageFile, lastPointer, snapPoint, viewport, zoomAt } from './canvasActions';
import { PageOverlay } from './PageOverlay';
import { SelectionOverlay } from './SelectionOverlay';
import {
  addShapes,
  deleteShapes,
  expandGroups,
  markHistory,
  newShapeId,
  select,
  setCamera,
  startEditing,
  stopEditing,
  updateShape,
  updateShapes,
  useCanvasStore,
  GRID_MAJOR_EVERY,
  type ShapePatch,
} from './model/canvasStore';
import { boxFromPoints, boxesIntersect, screenToPage, shapeBounds, unionBounds } from './model/geometry';
import { clampDelta, clampPoint, crossPoint, gridAlign, printableAt } from './pageConstraint';
import { separateRegion } from './canvasActions';
import type { Box, Camera, Point, Shape } from './model/types';
import { ShapeView } from './shapes/ShapeView';

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end';

type Drag =
  | { kind: 'pan'; startScreen: Point; cam: Camera }
  | { kind: 'move'; start: Point; orig: Record<string, Point>; bounds: Box; moved: boolean; clickedId: string; wasSelected: boolean; shift: boolean }
  | { kind: 'marquee'; start: Point; base: string[] }
  | { kind: 'resize'; id: string; handle: HandleId; start: Point; orig: Shape }
  | { kind: 'create-rect'; id: string; start: Point; box: Box }
  | { kind: 'create-line'; id: string; start: Point; box: Box }
  | { kind: 'draw'; id: string; origin: Point; box: Box };

const MIN_SIZE = 16;
const STROKE = '#1e3a5f';

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return !!t.closest('math-field') || t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

/** New geometry for a box or line shape dragged by one of its handles. */
function resizePatch(orig: Shape, handle: HandleId, p: Point, keepAspect: boolean): ShapePatch | null {
  if (orig.type === 'line') {
    const endX = orig.x + orig.props.x2;
    const endY = orig.y + orig.props.y2;
    if (handle === 'end') return { props: { x2: p.x - orig.x, y2: p.y - orig.y } };
    if (handle === 'start') return { x: p.x, y: p.y, props: { x2: endX - p.x, y2: endY - p.y } };
    return null;
  }
  if (orig.type === 'draw') return null;
  const b = shapeBounds(orig);
  let left = b.x, top = b.y, right = b.x + b.w, bottom = b.y + b.h;
  if (handle.includes('w')) left = Math.min(p.x, right - MIN_SIZE);
  if (handle.includes('e')) right = Math.max(p.x, left + MIN_SIZE);
  if (handle.includes('n')) top = Math.min(p.y, bottom - MIN_SIZE);
  if (handle.includes('s')) bottom = Math.max(p.y, top + MIN_SIZE);
  let w = right - left;
  let h = bottom - top;
  if (keepAspect && b.w > 0 && b.h > 0) {
    const ratio = b.w / b.h;
    if (handle === 'n' || handle === 's') w = h * ratio;
    else if (handle === 'e' || handle === 'w') h = w / ratio;
    else if (w / h > ratio) h = w / ratio;
    else w = h * ratio;
    if (handle.includes('w')) left = right - w;
    if (handle.includes('n')) top = bottom - h;
  }
  if (orig.type === 'text') return { x: left, props: { w } };
  if (orig.type === 'math') return { x: left, y: top, props: { w, h, autoSize: false } };
  return { x: left, y: top, props: { w, h } };
}

/**
 * Grid-snapped landing spot for a dragged block: math/text snap strictly to
 * the grid (anchor = first such shape), others follow the same offset.
 */
function landing(orig: Record<string, Point>, dx: number, dy: number): { patches: Record<string, ShapePatch>; preview: Box | null } {
  const shapes = useCanvasStore.getState().shapes;
  const ids = Object.keys(orig);
  const anchorId = ids.find((id) => shapes[id]?.type === 'math' || shapes[id]?.type === 'text') ?? ids[0];
  const a = shapes[anchorId];
  let sdx = dx;
  let sdy = dy;
  if (a) {
    const moved = { ...a, x: orig[anchorId].x + dx, y: orig[anchorId].y + dy } as Shape;
    const aligned = a.type === 'math' || a.type === 'text' ? gridAlign(moved) : (() => {
      const q = snapPoint(moved);
      return { ...moved, x: q.x, y: q.y } as Shape;
    })();
    sdx = aligned.x - orig[anchorId].x;
    sdy = aligned.y - orig[anchorId].y;
  }
  const patches: Record<string, ShapePatch> = {};
  const boxes: Box[] = [];
  for (const [id, o] of Object.entries(orig)) {
    patches[id] = { x: o.x + sdx, y: o.y + sdy };
    const s = shapes[id];
    if (s) boxes.push(shapeBounds({ ...s, x: o.x + sdx, y: o.y + sdy } as Shape));
  }
  return { patches, preview: unionBounds(boxes) };
}

export function CanvasView() {
  const order = useCanvasStore((s) => s.order);
  const shapes = useCanvasStore((s) => s.shapes);
  const camera = useCanvasStore((s) => s.camera);
  const editingId = useCanvasStore((s) => s.editingId);
  const tool = useCanvasStore((s) => s.tool);
  const isGrid = useCanvasStore((s) => s.isGrid);
  const crosshair = useCanvasStore((s) => s.crosshair);
  const dropPreview = useCanvasStore((s) => s.dropPreview);
  const dragging = useCanvasStore((s) => s.dragging);
  const selection = useCanvasStore((s) => s.selection);
  const selectionSet = new Set(selection);
  const canvasMode = useAppStore((s) => s.settings.canvasMode);
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [panning, setPanning] = useState(false);

  // Track viewport size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    viewport.el = el;
    const ro = new ResizeObserver(() => {
      viewport.w = el.clientWidth;
      viewport.h = el.clientHeight;
    });
    ro.observe(el);
    viewport.w = el.clientWidth;
    viewport.h = el.clientHeight;
    return () => ro.disconnect();
  }, []);

  // Space + drag pans.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        space.current = true;
        setPanning(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        space.current = false;
        setPanning(false);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Wheel: Ctrl/⌘ zooms around the pointer, otherwise pans.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element).closest?.('[data-editing] math-field')) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt({ x: e.clientX - rect.left, y: e.clientY - rect.top }, Math.exp(-e.deltaY * 0.0015));
      } else {
        const cam = useCanvasStore.getState().camera;
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        setCamera({ ...cam, x: cam.x + dx / cam.z, y: cam.y + dy / cam.z });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toPage = useCallback((e: { clientX: number; clientY: number }): Point => {
    const rect = containerRef.current!.getBoundingClientRect();
    return screenToPage({ x: e.clientX - rect.left, y: e.clientY - rect.top }, useCanvasStore.getState().camera);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    const target = e.target as Element;
    // The ⠿ grip moves a region — even while you are typing in it.
    const grip = target.closest('[data-grip]');
    if (grip && useCanvasStore.getState().tool === 'select') {
      const gid = grip.getAttribute('data-grip')!;
      const st0 = useCanvasStore.getState();
      if (st0.shapes[gid]) {
        e.preventDefault();
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        if (!st0.selection.includes(gid)) select([gid]);
        markHistory();
        const sel = useCanvasStore.getState().selection;
        const orig: Record<string, Point> = {};
        for (const sid of sel) orig[sid] = { x: st0.shapes[sid].x, y: st0.shapes[sid].y };
        const bounds = unionBounds(sel.map((sid) => shapeBounds(st0.shapes[sid])))!;
        drag.current = { kind: 'move', start: toPage(e), orig, bounds, moved: false, clickedId: gid, wasSelected: true, shift: false };
        return;
      }
    }
    if (target.closest('[data-editing]')) return; // the editor owns these events
    const st = useCanvasStore.getState();
    if (st.editingId) stopEditing();
    if (st.tool !== 'math' && st.tool !== 'text') containerRef.current?.focus({ preventScroll: true });
    const p = toPage(e);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);

    if (e.button === 1 || space.current || st.tool === 'hand') {
      drag.current = { kind: 'pan', startScreen: { x: e.clientX, y: e.clientY }, cam: st.camera };
      return;
    }

    // Page Layout: tools only work on the white area inside the margins.
    const area = printableAt(p);
    if (st.tool !== 'select' && !area) {
      useAppStore.getState().showToast('info', 'Place content inside the page margins.');
      return;
    }

    switch (st.tool) {
      case 'select': {
        const handleEl = target.closest('[data-handle]');
        if (handleEl && st.selection.length === 1) {
          markHistory();
          const id = st.selection[0];
          drag.current = { kind: 'resize', id, handle: handleEl.getAttribute('data-handle') as HandleId, start: p, orig: st.shapes[id] };
          return;
        }
        const shapeEl = target.closest('[data-shape-id]');
        const id = shapeEl?.getAttribute('data-shape-id');
        if (id && st.shapes[id]) {
          useCanvasStore.setState({ crosshair: null });
          const wasSelected = st.selection.includes(id);
          if (!wasSelected) select(e.shiftKey ? [...st.selection, id] : [id]);
          markHistory();
          const sel = useCanvasStore.getState().selection;
          const orig: Record<string, Point> = {};
          for (const sid of sel) orig[sid] = { x: st.shapes[sid].x, y: st.shapes[sid].y };
          const bounds = unionBounds(sel.map((sid) => shapeBounds(st.shapes[sid])))!;
          drag.current = { kind: 'move', start: p, orig, bounds, moved: false, clickedId: id, wasSelected, shift: e.shiftKey };
        } else {
          const base = e.shiftKey ? st.selection : [];
          if (!e.shiftKey) select([]);
          // The insertion cross only lands on the writable (white) part of a page.
          useCanvasStore.setState({ crosshair: printableAt(p) ? crossPoint(p) : null });
          drag.current = { kind: 'marquee', start: p, base };
        }
        return;
      }
      case 'math':
        // Keep the browser from moving focus to the canvas after the new editor took it.
        e.preventDefault();
        createMathRegion({ x: p.x, y: p.y - 14 });
        return;
      case 'text':
        e.preventDefault();
        createTextRegion({ x: p.x, y: p.y - 10 });
        return;
      case 'rect': {
        const id = newShapeId();
        const s = clampPoint(snapPoint(p), area);
        addShapes([{ id, type: 'rect', x: s.x, y: s.y, props: { w: 1, h: 1, stroke: STROKE, strokeWidth: 1.5 } }], { select: true });
        drag.current = { kind: 'create-rect', id, start: s, box: area! };
        return;
      }
      case 'line':
      case 'arrow': {
        const id = newShapeId();
        const s = clampPoint(snapPoint(p), area);
        addShapes([{ id, type: 'line', x: s.x, y: s.y, props: { x2: 0, y2: 0, stroke: STROKE, strokeWidth: 1.5, arrow: st.tool === 'arrow' } }], { select: true });
        drag.current = { kind: 'create-line', id, start: s, box: area! };
        return;
      }
      case 'draw': {
        const id = newShapeId();
        addShapes([{ id, type: 'draw', x: p.x, y: p.y, props: { points: [[0, 0]], stroke: STROKE, strokeWidth: 2 } }]);
        drag.current = { kind: 'draw', id, origin: p, box: area! };
        return;
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toPage(e);
    lastPointer.x = p.x;
    lastPointer.y = p.y;
    lastPointer.inside = true;
    const d = drag.current;
    if (!d) return;
    const st = useCanvasStore.getState();
    switch (d.kind) {
      case 'pan': {
        const z = d.cam.z;
        setCamera({ x: d.cam.x - (e.clientX - d.startScreen.x) / z, y: d.cam.y - (e.clientY - d.startScreen.y) / z, z });
        return;
      }
      case 'move': {
        let dx = p.x - d.start.x;
        let dy = p.y - d.start.y;
        if (!d.moved && Math.hypot(dx, dy) * st.camera.z < 3) return;
        d.moved = true;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        // Follow the pointer smoothly (only kept inside the margins)…
        ({ dx, dy } = clampDelta(d.bounds, dx, dy));
        const patches: Record<string, ShapePatch> = {};
        for (const [id, o] of Object.entries(d.orig)) patches[id] = { x: o.x + dx, y: o.y + dy };
        updateShapes(patches, { history: false, raw: true });
        // …and show where the block will land on the grid.
        const snapped = landing(d.orig, dx, dy);
        useCanvasStore.setState({ dragging: true, dropPreview: snapped.preview });
        updateShapes(patches, { history: false });
        return;
      }
      case 'marquee': {
        const box = boxFromPoints(d.start, p);
        if (box.w * st.camera.z > 4 || box.h * st.camera.z > 4) useCanvasStore.setState({ crosshair: null });
        setMarquee(box);
        const hits = st.order.filter((id) => boxesIntersect(box, shapeBounds(st.shapes[id])));
        select([...new Set([...d.base, ...hits])]);
        return;
      }
      case 'resize': {
        const keepAspect = d.orig.type === 'image' ? !e.shiftKey : e.shiftKey;
        const ob = shapeBounds(d.orig);
        const patch = resizePatch(d.orig, d.handle, clampPoint(snapPoint(p), printableAt({ x: ob.x + 1, y: ob.y + 1 })), keepAspect);
        if (patch) updateShape(d.id, patch, { history: false });
        return;
      }
      case 'create-rect': {
        const q = clampPoint(snapPoint(p), d.box);
        const b = boxFromPoints(d.start, q);
        updateShape(d.id, { x: b.x, y: b.y, props: { w: Math.max(1, b.w), h: Math.max(1, b.h) } }, { history: false });
        return;
      }
      case 'create-line': {
        const q = clampPoint(snapPoint(p), d.box);
        let x2 = q.x - d.start.x;
        let y2 = q.y - d.start.y;
        if (e.shiftKey) {
          // Constrain to 15° steps.
          const ang = Math.round(Math.atan2(y2, x2) / (Math.PI / 12)) * (Math.PI / 12);
          const len = Math.hypot(x2, y2);
          x2 = Math.cos(ang) * len;
          y2 = Math.sin(ang) * len;
        }
        updateShape(d.id, { props: { x2, y2 } }, { history: false });
        return;
      }
      case 'draw': {
        const sh = st.shapes[d.id];
        if (sh?.type !== 'draw') return;
        const pts = sh.props.points;
        const cp = clampPoint(p, d.box);
        const nx = cp.x - d.origin.x;
        const ny = cp.y - d.origin.y;
        const last = pts[pts.length - 1];
        if (Math.hypot(nx - last[0], ny - last[1]) * st.camera.z < 2) return;
        updateShape(d.id, { props: { points: [...pts, [nx, ny]] } }, { history: false });
        return;
      }
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setMarquee(null);
    if (!d) return;
    const st = useCanvasStore.getState();
    switch (d.kind) {
      case 'move':
        if (d.moved) {
          // Drop: apply the grid-snapped positions (normal, normalised update).
          const cur = useCanvasStore.getState().shapes;
          const first = Object.keys(d.orig)[0];
          const dx = cur[first].x - d.orig[first].x;
          const dy = cur[first].y - d.orig[first].y;
          const { patches } = landing(d.orig, dx, dy);
          updateShapes(patches, { history: false });
        }
        useCanvasStore.setState({ dragging: false, dropPreview: null });
        // Dropped onto another region: push the later one down instead of overlapping.
        if (d.moved) separateRegion(...Object.keys(d.orig));
        // A plain click on an already-selected shape narrows the selection to it.
        if (!d.moved && d.wasSelected && !d.shift) select([d.clickedId]);
        if (!d.moved && d.wasSelected && d.shift) select(st.selection.filter((id) => !expandGroups([d.clickedId]).includes(id)));
        return;
      case 'create-rect': {
        const s = st.shapes[d.id];
        if (s?.type === 'rect' && s.props.w < 4 && s.props.h < 4) updateShape(d.id, { props: { w: 160, h: 100 } }, { history: false });
        useCanvasStore.setState({ tool: 'select' });
        return;
      }
      case 'create-line': {
        const s = st.shapes[d.id];
        if (s?.type === 'line' && Math.hypot(s.props.x2, s.props.y2) < 4) updateShape(d.id, { props: { x2: 160, y2: 0 } }, { history: false });
        useCanvasStore.setState({ tool: 'select' });
        return;
      }
      case 'draw': {
        const s = st.shapes[d.id];
        if (s?.type === 'draw' && s.props.points.length < 2) deleteShapes([d.id], { history: false });
        return;
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    // Pointer capture retargets click events to the container: hit-test by position.
    const target = (document.elementFromPoint(e.clientX, e.clientY) ?? e.target) as Element;
    if (target.closest('[data-editing]')) return;
    const st = useCanvasStore.getState();
    if (st.tool !== 'select') return;
    if (target.closest('[data-page-chrome]') && !target.closest('[data-shape-id]')) {
      // Header/footer text comes from the worksheet details.
      select([]);
      useAppStore.getState().togglePanel(true);
      requestAnimationFrame(() => document.getElementById('ws-title')?.focus());
      return;
    }
    const id = target.closest('[data-shape-id]')?.getAttribute('data-shape-id');
    const sh = id ? st.shapes[id] : null;
    if (sh && (sh.type === 'math' || sh.type === 'text')) {
      startEditing(sh.id);
    } else if (!sh) {
      const p = toPage(e);
      if (printableAt(p)) createMathRegion({ x: p.x, y: p.y - 14 });
    }
  };

  const onDrop = (e: React.DragEvent) => {
    const sheet = [...e.dataTransfer.files].find(isWorksheetFile);
    if (sheet) {
      e.preventDefault();
      void importJson(sheet);
      return;
    }
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const p = clampPoint(toPage(e));
    files.forEach((f, i) => void insertImageFile(f, { x: p.x + i * 24, y: p.y + i * 24 }));
  };

  const cursor = dragging ? 'grabbing' : panning || tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair';
  const gridPx = 10 * camera.z;

  return (
    <div
      ref={containerRef}
      className="cc-canvas absolute inset-0 overflow-hidden outline-none"
      data-testid="canvas"
      data-mode={canvasMode}
      data-tool={tool}
      data-dragging={dragging || undefined}
      tabIndex={0}
      aria-label="Calculation canvas"
      style={{
        cursor,
        touchAction: 'none',
        backgroundColor: canvasMode === 'page' ? 'var(--color-desk)' : 'var(--color-paper)',
        backgroundImage:
          canvasMode === 'page'
            ? undefined
            : isGrid && gridPx >= 4
            ? 'linear-gradient(var(--grid-major) 1px, transparent 1px), linear-gradient(90deg, var(--grid-major) 1px, transparent 1px), linear-gradient(var(--grid-minor) 1px, transparent 1px), linear-gradient(90deg, var(--grid-minor) 1px, transparent 1px)'
            : undefined,
        backgroundSize: canvasMode === 'page' ? undefined : isGrid ? `${gridPx * GRID_MAJOR_EVERY}px ${gridPx * GRID_MAJOR_EVERY}px, ${gridPx * GRID_MAJOR_EVERY}px ${gridPx * GRID_MAJOR_EVERY}px, ${gridPx}px ${gridPx}px, ${gridPx}px ${gridPx}px` : undefined,
        backgroundPosition: canvasMode === 'page' ? undefined : isGrid ? `${-camera.x * camera.z}px ${-camera.y * camera.z}px` : undefined,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => (lastPointer.inside = false)}
      onDoubleClick={onDoubleClick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div
        className="cc-layer"
        style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `scale(${camera.z}) translate(${-camera.x}px, ${-camera.y}px)` }}
      >
        <PageOverlay />
        {order.map((id) => (
          <ShapeView key={id} shape={shapes[id]} editing={editingId === id} selected={selectionSet.has(id)} />
        ))}
        <SelectionOverlay />
        {dropPreview && (
          <div
            data-testid="drop-preview"
            style={{
              position: 'absolute',
              left: dropPreview.x,
              top: dropPreview.y,
              width: dropPreview.w,
              height: dropPreview.h,
              border: `${1.5 / camera.z}px dashed var(--color-docs-blue)`,
              borderRadius: 3 / camera.z,
              background: 'rgb(11 87 208 / 0.05)',
              pointerEvents: 'none',
            }}
          />
        )}
        {crosshair && !editingId && tool === 'select' && (
          <svg
            data-testid="crosshair"
            width={1}
            height={1}
            style={{ position: 'absolute', left: crosshair.x, top: crosshair.y, overflow: 'visible', pointerEvents: 'none' }}
          >
            <path d={`M${-7 / camera.z},0 H${7 / camera.z} M0,${-7 / camera.z} V${7 / camera.z}`} stroke="var(--color-crosshair)" strokeWidth={1.5 / camera.z} />
          </svg>
        )}
        {marquee && (
          <div
            data-testid="marquee"
            style={{
              position: 'absolute',
              left: marquee.x,
              top: marquee.y,
              width: marquee.w,
              height: marquee.h,
              border: `${1 / camera.z}px solid var(--color-accent)`,
              background: 'rgb(37 99 235 / 0.06)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}
