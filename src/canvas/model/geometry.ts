import type { Box, Camera, Point, Shape } from './types';

export function shapeBounds(s: Shape): Box {
  switch (s.type) {
    case 'line': {
      const { x2, y2 } = s.props;
      return { x: s.x + Math.min(0, x2), y: s.y + Math.min(0, y2), w: Math.abs(x2), h: Math.abs(y2) };
    }
    case 'draw': {
      const pts = s.props.points;
      if (!pts.length) return { x: s.x, y: s.y, w: 0, h: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [px, py] of pts) {
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      }
      return { x: s.x + minX, y: s.y + minY, w: maxX - minX, h: maxY - minY };
    }
    default:
      return { x: s.x, y: s.y, w: s.props.w, h: s.props.h };
  }
}

export function unionBounds(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

export function boxContains(outer: Box, inner: Box): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

export function boxFromPoints(a: Point, b: Point): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function screenToPage(p: Point, cam: Camera): Point {
  return { x: p.x / cam.z + cam.x, y: p.y / cam.z + cam.y };
}

export function pageToScreen(p: Point, cam: Camera): Point {
  return { x: (p.x - cam.x) * cam.z, y: (p.y - cam.y) * cam.z };
}

export function snap(v: number, grid: number, enabled: boolean): number {
  return enabled ? Math.round(v / grid) * grid : v;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
