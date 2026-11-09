/**
 * CalcCanvas document model. Every shape is plain JSON so the whole
 * document can be snapshotted for undo, saved to IndexedDB and exported.
 */

export type MathDisplayMode = 'auto' | 'formula' | 'result' | 'formulaResult' | 'full';

export type VectorLayout = 'row' | 'column';

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
  /** Result number format; absent = worksheet default. Presentation only. */
  resultFormat?: 'general' | 'decimal' | 'scientific' | 'engineering';
  /** Keep trailing zeros in the result; absent = worksheet default. */
  trailingZeros?: boolean;
  /** Background highlight of the region (absent = none; inputs keep their input colour). */
  highlight?: string;
  /** How a vector result is shown: a compact row (default) or a column with every entry. */
  vectorLayout?: VectorLayout;
  /** Show every entry of a long vector result instead of the shortened first … last view. */
  vectorExpanded?: boolean;
  /** A literal definition that is not a user input (a code constant such as ν = 0.5): no input highlight. */
  constant?: boolean;
  /** Box follows the rendered equation until resized manually. */
  autoSize: boolean;
  fontSize: number;
  color: string;
  /** Measured distance from the region top to the equation baseline (px), kept so the baseline sits on a major grid line. */
  baseline?: number;
}

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

/** Text styles of the Text Formatting gallery besides Normal and the headings. */
export type TextStyleId = 'title' | 'subtitle';

export interface TextProps {
  w: number;
  /** Measured height (kept in sync with the rendered text). */
  h: number;
  /** Sanitised rich text (b, i, u, h1–h3, ul/ol/li, br, p, div). */
  html: string;
  /** One of TEXT_FONTS. */
  fontFamily: string;
  fontSize: number;
  color: string;
  align: TextAlign;
  /** Paragraph style: 0 normal text, 1–3 heading levels (shown in the outline). */
  heading?: HeadingLevel;
  /** Title or Subtitle style (not in the outline); absent for Normal and headings. */
  textStyle?: TextStyleId;
  /** Annex role (see canvas/annex.ts): the ANNEX title, an annex heading, or a link to one. */
  annex?: AnnexRole;
}

/**
 * start: the ANNEX title; everything below it is the annex.
 * heading: starts annex block `id` (until the next annex heading).
 * link: the block `target` is calculated as if it stood at this line.
 */
export type AnnexRole = { kind: 'start' } | { kind: 'heading'; id: string } | { kind: 'link'; target: string };

export type HeadingLevel = 0 | 1 | 2 | 3;

/** Google Docs-like paragraph styles. Applying one sets size, weight and colour. */
export const PARAGRAPH_STYLES: Record<HeadingLevel, { label: string; fontSize: number; weight: number; color: string }> = {
  0: { label: 'Normal text', fontSize: 15, weight: 400, color: '#0f172a' },
  1: { label: 'Heading 1', fontSize: 20, weight: 700, color: '#1e3a5f' },
  2: { label: 'Heading 2', fontSize: 16, weight: 700, color: '#0f172a' },
  3: { label: 'Heading 3', fontSize: 14, weight: 600, color: '#334155' },
};

/** Title and Subtitle styles of the Text Formatting gallery (not in the outline). */
export const TEXT_STYLES: Record<TextStyleId, { label: string; fontSize: number; weight: number; color: string; italic?: boolean }> = {
  title: { label: 'Title', fontSize: 26, weight: 700, color: '#1e3a5f' },
  subtitle: { label: 'Subtitle', fontSize: 17, weight: 400, color: '#475569', italic: true },
};

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

/** House style for new graphs: Roboto, light lemon background, no grid, axes through the origin. */
export const DEFAULT_GRAPH_STYLE = { grid: false, axesAtOrigin: true, font: 'Roboto', background: '#fff9c4' } as const;

/** segments: like line, but r holds a group id per point; a change of id starts a new piece. */
export type GraphSeriesStyle = 'line' | 'marker' | 'circle' | 'segments';

/** One data series of an X-Y graph. x, y, r and show are LaTeX expressions evaluated by the engine. */
export interface GraphSeries {
  id: string;
  label: string;
  /** X values: a vector (e.g. x_{l1}) or a single value. */
  x: string;
  /** Y values, same length as x (or a single value). */
  y: string;
  style: GraphSeriesStyle;
  /** Circle radius in x units (style 'circle'); a single value or one per point. */
  r: string;
  color: string;
  /** Line width / marker size in px. */
  width: number;
  /** Optional condition (e.g. n_{set}\ge2); empty = always shown. */
  show: string;
}

export interface GraphProps {
  w: number;
  h: number;
  title: string;
  xLabel: string;
  yLabel: string;
  /** Display units of the axes (e.g. "mm"); empty = automatic. */
  xUnit: string;
  yUnit: string;
  /** Same scale on both axes (sections, plans). */
  equalAxes: boolean;
  grid: boolean;
  /** Axis lines drawn through (0, 0); tick values stay on the bottom and left edges. */
  axesAtOrigin: boolean;
  /** One of TEXT_FONTS. */
  font: string;
  /** Background colour of the whole graph. */
  background: string;
  series: GraphSeries[];
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
export type GraphShape = Base<'graph', GraphProps>;

export type Shape = MathShape | TextShape | ImageShape | RectShape | LineShape | DrawShape | GraphShape;
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

/** Text fonts: Inter is bundled via Google Fonts, the rest are system fonts with fallbacks. */
export const TEXT_FONTS: Record<string, string> = {
  Inter: "'Inter', ui-sans-serif, system-ui, sans-serif",
  Roboto: "'Roboto', 'Segoe UI', Arial, sans-serif",
  Arial: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
  'Segoe UI': "'Segoe UI', system-ui, sans-serif",
  Calibri: "Calibri, Carlito, 'Segoe UI', sans-serif",
  'Times New Roman': "'Times New Roman', Times, 'Liberation Serif', serif",
  Georgia: "Georgia, 'Times New Roman', serif",
  Cambria: "Cambria, Caladea, Georgia, serif",
  'Courier New': "'Courier New', Courier, 'Liberation Mono', monospace",
};

export function fontStack(name: string): string {
  return TEXT_FONTS[name] ?? TEXT_FONTS.Inter;
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
  fontFamily: 'Inter',
  fontSize: 15,
  color: '#0f172a',
  align: 'left',
};
