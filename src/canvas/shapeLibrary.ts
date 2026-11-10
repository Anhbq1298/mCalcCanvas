/**
 * Ready-made shapes for the Insert tab: plain outlines, common structural
 * sketch symbols and steel section outlines. Each is built from the existing primitives (draw polylines,
 * lines/arrows, rectangles) relative to (0, 0) and inserted as one group, so it
 * moves and copies as a unit and prints like any other shape.
 */
import type { Shape } from './model/types';

const SHAPE_STROKE = '#1e3a5f';
const W = 1.5;

type Part =
  | { type: 'draw'; points: [number, number][] }
  | { type: 'line'; x: number; y: number; x2: number; y2: number; arrow?: boolean }
  | { type: 'rect'; x: number; y: number; w: number; h: number };

export interface LibraryShape {
  id: string;
  label: string;
  group: 'Basic' | 'Structural' | 'Steel';
  parts: Part[];
}

/** Closed polygon through n points on an ellipse (smoothed when drawn). */
function ellipse(cx: number, cy: number, rx: number, ry: number, n = 32): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n + 1; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([round(cx + rx * Math.cos(a)), round(cy + ry * Math.sin(a))]);
  }
  return pts;
}

/** Open arc from a0 to a1 (radians, clockwise on screen). */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 20): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([round(cx + r * Math.cos(a)), round(cy + r * Math.sin(a))]);
  }
  return pts;
}

const round = (v: number) => Math.round(v * 10) / 10;

/** Closed outline through the given corners. */
const outline = (...pts: [number, number][]): Part => ({ type: 'draw', points: [...pts, pts[0]] });

export const SHAPE_LIBRARY: LibraryShape[] = [
  { id: 'rectangle', label: 'Rectangle', group: 'Basic', parts: [{ type: 'rect', x: 0, y: 0, w: 120, h: 80 }] },
  { id: 'circle', label: 'Circle', group: 'Basic', parts: [{ type: 'draw', points: ellipse(40, 40, 40, 40) }] },
  { id: 'ellipse', label: 'Ellipse', group: 'Basic', parts: [{ type: 'draw', points: ellipse(60, 35, 60, 35) }] },
  { id: 'triangle', label: 'Triangle', group: 'Basic', parts: [{ type: 'draw', points: [[40, 0], [80, 70], [0, 70], [40, 0]] }] },
  { id: 'diamond', label: 'Diamond', group: 'Basic', parts: [{ type: 'draw', points: [[40, 0], [80, 40], [40, 80], [0, 40], [40, 0]] }] },
  { id: 'arrow-right', label: 'Arrow', group: 'Basic', parts: [{ type: 'line', x: 0, y: 0, x2: 120, y2: 0, arrow: true }] },
  {
    id: 'double-arrow',
    label: 'Double arrow',
    group: 'Basic',
    parts: [
      { type: 'line', x: 60, y: 0, x2: 60, y2: 0, arrow: true },
      { type: 'line', x: 60, y: 0, x2: -60, y2: 0, arrow: true },
    ],
  },
  {
    id: 'pin-support',
    label: 'Pin support',
    group: 'Structural',
    parts: [
      { type: 'draw', points: [[20, 0], [40, 28], [0, 28], [20, 0]] },
      { type: 'line', x: -6, y: 28, x2: 52, y2: 0 },
    ],
  },
  {
    id: 'roller-support',
    label: 'Roller support',
    group: 'Structural',
    parts: [
      { type: 'draw', points: [[20, 0], [40, 24], [0, 24], [20, 0]] },
      { type: 'draw', points: ellipse(8, 29, 4, 4, 16) },
      { type: 'draw', points: ellipse(32, 29, 4, 4, 16) },
      { type: 'line', x: -6, y: 34, x2: 52, y2: 0 },
    ],
  },
  {
    id: 'fixed-support',
    label: 'Fixed support',
    group: 'Structural',
    parts: [
      { type: 'line', x: 0, y: 0, x2: 60, y2: 0 },
      ...[0, 12, 24, 36, 48].map((x): Part => ({ type: 'line', x: x + 12, y: 0, x2: -12, y2: 12 })),
    ],
  },
  { id: 'point-load', label: 'Point load', group: 'Structural', parts: [{ type: 'line', x: 0, y: 0, x2: 0, y2: 60, arrow: true }] },
  {
    id: 'distributed-load',
    label: 'Distributed load',
    group: 'Structural',
    parts: [
      // Load line on top, evenly spaced arrows with small open heads (the filled
      // line arrowheads are sized for long arrows and would merge into a band).
      { type: 'line', x: 0, y: 0, x2: 160, y2: 0 },
      ...[0, 20, 40, 60, 80, 100, 120, 140, 160].flatMap((x): Part[] => [
        { type: 'line', x, y: 0, x2: 0, y2: 36 },
        { type: 'draw', points: [[x - 4, 29], [x, 36], [x + 4, 29]] },
      ]),
    ],
  },
  {
    id: 'moment',
    label: 'Moment',
    group: 'Structural',
    parts: [
      { type: 'draw', points: arc(30, 30, 30, Math.PI * 0.75, Math.PI * 1.8) },
      // Arrowhead along the tangent at the end of the arc (clockwise).
      { type: 'line', x: round(30 + 30 * Math.cos(Math.PI * 1.8)), y: round(30 + 30 * Math.sin(Math.PI * 1.8)), x2: round(-22 * Math.sin(Math.PI * 1.8)), y2: round(22 * Math.cos(Math.PI * 1.8)), arrow: true },
    ],
  },
  {
    id: 'dimension',
    label: 'Dimension',
    group: 'Structural',
    parts: [
      { type: 'line', x: 80, y: 12, x2: 80, y2: 0, arrow: true },
      { type: 'line', x: 80, y: 12, x2: -80, y2: 0, arrow: true },
      { type: 'line', x: 0, y: 0, x2: 0, y2: 24 },
      { type: 'line', x: 160, y: 0, x2: 0, y2: 24 },
    ],
  },
  // Steel section outlines (sharp corners, proportions of common rolled sections).
  { id: 'steel-i', label: 'I-section', group: 'Steel', parts: [outline([0, 0], [60, 0], [60, 9], [34, 9], [34, 111], [60, 111], [60, 120], [0, 120], [0, 111], [26, 111], [26, 9], [0, 9])] },
  { id: 'steel-h', label: 'H-section', group: 'Steel', parts: [outline([0, 0], [100, 0], [100, 14], [55, 14], [55, 86], [100, 86], [100, 100], [0, 100], [0, 86], [45, 86], [45, 14], [0, 14])] },
  { id: 'steel-channel', label: 'Channel', group: 'Steel', parts: [outline([0, 0], [50, 0], [50, 10], [8, 10], [8, 110], [50, 110], [50, 120], [0, 120])] },
  { id: 'steel-angle', label: 'Angle', group: 'Steel', parts: [outline([0, 0], [10, 0], [10, 80], [90, 80], [90, 90], [0, 90])] },
  { id: 'steel-tee', label: 'T-section', group: 'Steel', parts: [outline([0, 0], [100, 0], [100, 12], [56, 12], [56, 100], [44, 100], [44, 12], [0, 12])] },
  { id: 'steel-rhs', label: 'Hollow box', group: 'Steel', parts: [{ type: 'rect', x: 0, y: 0, w: 80, h: 120 }, { type: 'rect', x: 8, y: 8, w: 64, h: 104 }] },
  { id: 'steel-chs', label: 'Hollow circle', group: 'Steel', parts: [{ type: 'draw', points: ellipse(50, 50, 50, 50) }, { type: 'draw', points: ellipse(50, 50, 42, 42) }] },
  { id: 'steel-plate', label: 'Plate', group: 'Steel', parts: [{ type: 'rect', x: 0, y: 0, w: 140, h: 12 }] },
];

/** The shapes of a library item placed at (x, y), sharing one group id when there is more than one part. */
export function buildLibraryShape(item: LibraryShape, x: number, y: number, newId: () => string): Shape[] {
  const groupId = item.parts.length > 1 ? newId() : undefined;
  return item.parts.map((p): Shape => {
    const base = { id: newId(), groupId };
    if (p.type === 'draw') return { ...base, type: 'draw', x, y, props: { points: p.points, stroke: SHAPE_STROKE, strokeWidth: W } };
    if (p.type === 'rect') return { ...base, type: 'rect', x: x + p.x, y: y + p.y, props: { w: p.w, h: p.h, stroke: SHAPE_STROKE, strokeWidth: W } };
    return { ...base, type: 'line', x: x + p.x, y: y + p.y, props: { x2: p.x2, y2: p.y2, stroke: SHAPE_STROKE, strokeWidth: W, arrow: !!p.arrow } };
  });
}
