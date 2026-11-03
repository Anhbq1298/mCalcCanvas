import type { TLShape } from 'tldraw';

export const MATH_SHAPE_TYPE = 'math';

export type MathDisplayMode = 'auto' | 'formula' | 'result' | 'formulaResult' | 'full';

export interface MathShapeProps {
  w: number;
  h: number;
  /** The region's source of truth: MathLive LaTeX. */
  latex: string;
  displayMode: MathDisplayMode;
  /** Display unit override, e.g. "kN·mm"; empty = automatic. */
  displayUnit: string;
  /** Decimal places; -1 = worksheet default. */
  precision: number;
  /** Size follows the rendered equation until the user resizes manually. */
  autoSize: boolean;
  fontSize: number;
  color: string;
}

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [MATH_SHAPE_TYPE]: MathShapeProps;
  }
}

export type MathShape = TLShape<typeof MATH_SHAPE_TYPE>;

export const MATH_COLORS = ['#0f172a', '#1e3a5f', '#2563eb', '#047857', '#b45309', '#dc2626'] as const;

export const DEFAULT_MATH_PROPS: MathShapeProps = {
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
