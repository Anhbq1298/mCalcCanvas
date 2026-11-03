/**
 * CalcCanvas document model. Every shape is plain JSON so the whole
 * document can be snapshotted for undo, saved to IndexedDB and exported.
 */

export type MathDisplayMode = 'auto' | 'formula' | 'result' | 'formulaResult' | 'full';

export interface MathProps {
  w: number;
  h: number;
  /** Source of truth for the calculation: MathLive LaTeX. */
  latex: string;
  displayMode: MathDisplayMode;
  /** Result unit override, e.g. "kN·mm"; empty = automatic. */
  displayUnit: string;
  /** Decimal places; -1 = worksheet default. */
  precision: number;
  /** Box follows the rendered equation until resized manually. */
  autoSize: boolean;
  fontSize: number;
  color: string;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextProps {
  w: number;
  /** Measured height (kept in sync with the rendered text). */
  h: number;
  /** Sanitised rich text (b, i, u, h1–h3, ul/ol/li, br, p, div). */
  html: string;
  fontSize: number;
  color: string;
  align: TextAlign;
}

export interface ImageProps {
  w: number;
  h: number;
  src: string;
}

export interface RectProps {
  w: number;
  h: number;
  stroke: string;
  strokeWidth: number;
}

export interface LineProps {
  /** End point relative to (x, y). */
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  arrow: boolean;
}

export interface DrawProps {
  /** Points relative to (x, y). */
  points: [number, number][];
  stroke: string;
  strokeWidth: number;
}

interface Base<T extends string, P> {
  id: string;
  type: T;
  x: number;
  y: number;
  groupId?: string;
  props: P;
}

export type MathShape = Base<'math', MathProps>;
export type TextShape = Base<'text', TextProps>;
export type ImageShape = Base<'image', ImageProps>;
export type RectShape = Base<'rect', RectProps>;
export type LineShape = Base<'line', LineProps>;
export type DrawShape = Base<'draw', DrawProps>;

export type Shape = MathShape | TextShape | ImageShape | RectShape | LineShape | DrawShape;
export type ShapeType = Shape['type'];

export type ToolId = 'select' | 'hand' | 'math' | 'text' | 'rect' | 'line' | 'arrow' | 'draw';

export interface Camera {
  /** Page coordinate shown at the viewport's left/top edge. */
  x: number;
  y: number;
  /** Zoom factor. */
  z: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MATH_COLORS = ['#0f172a', '#1e3a5f', '#2563eb', '#047857', '#b45309', '#dc2626'] as const;

export const DEFAULT_MATH_PROPS: MathProps = {
  w: 60,
  h: 32,
  latex: '',
  displayMode: 'auto',
  displayUnit: '',
  precision: -1,
  autoSize: true,
  fontSize: 18,
  color: MATH_COLORS[0],
};

export const DEFAULT_TEXT_PROPS: TextProps = {
  w: 320,
  h: 24,
  html: '',
  fontSize: 15,
  color: '#0f172a',
  align: 'left',
};
