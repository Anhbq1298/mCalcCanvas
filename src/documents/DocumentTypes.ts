import type { Shape } from '../canvas/model/types';
import type { UnitSystemName } from '../engine/light';

export const DOCUMENT_VERSION = 3;

export type CanvasMode = 'free' | 'page';
export type PageOrientation = 'portrait' | 'landscape';
export type PaperSize = 'A4' | 'A3';

/** Page margins in millimetres. */
export interface PageMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Margins of worksheets made before page setup existed (20 mm sides, 16 mm top/bottom ≈ 76/60 px). */
export const DEFAULT_MARGINS: PageMargins = { top: 16, bottom: 16, left: 20, right: 20 };

/** How result numbers are written: general (engineering default), fixed decimals, scientific, engineering (exponent a multiple of 3). */
export type ResultFormat = 'general' | 'decimal' | 'scientific' | 'engineering';

export interface LabelStyles {
  unitColor: string;
  inputColor: string;
  inputBackground: string;
}

export const DEFAULT_LABEL_STYLES: LabelStyles = { unitColor: '#2b8fd6', inputColor: '#1d4ed8', inputBackground: '#fff6bf' };

export interface DocumentMetadata {
  project?: string;
  calculationReference?: string;
  preparedBy?: string;
  checkedBy?: string;
  revision?: string;
}

export interface DocumentSettings {
  unitSystem: UnitSystemName;
  precision: number;
  canvasMode: CanvasMode;
  pageOrientation: PageOrientation;
  /** Paper size (A4 when absent). */
  paper?: PaperSize;
  /** Page margins in mm (DEFAULT_MARGINS when absent). */
  margins?: PageMargins;
  /** Result number format for equations without their own (general when absent). */
  resultFormat?: ResultFormat;
  /** Keep trailing zeros in results (2.50 instead of 2.5). */
  trailingZeros?: boolean;
  /** Label styles: colour of units and of inputs (literal definitions). */
  labelStyles?: LabelStyles;
  /** Show the title block (header/footer) on pages and in the PDF. */
  showHeaderFooter: boolean;
  /** Default font for new text regions (one of TEXT_FONTS). */
  textFont: string;
  /** Baselines snap to every major line (ruled paper, default) or to every minor grid line. */
  baselineSnap?: 'major' | 'minor';
  /** Minimum number of pages (keeps inserted blank pages). */
  pages?: number;
  /** Arrays longer than this are shown as the first and last half (pandas style); 0 = show all. */
  vectorLimit?: number;
}

/** A worksheet region exposed as a column in the Input & Results workspace. */
export interface InputResultColumn {
  /** Stable id used by batch rows even if the display label changes. */
  id: string;
  /** Exact math region that owns the definition or result. */
  regionId: string;
  label: string;
}

export interface InputResultRow {
  id: string;
  name: string;
  /** Numeric input values only. Units come from the bound worksheet regions. */
  values: Record<string, number | null>;
}

export interface InputResultConfig {
  title: string;
  inputs: InputResultColumn[];
  outputs: InputResultColumn[];
  rows: InputResultRow[];
}

export const EMPTY_INPUT_RESULT_CONFIG: InputResultConfig = {
  title: 'Batch calculation',
  inputs: [],
  outputs: [],
  rows: [],
};

/**
 * Persisted worksheet. `shapes` is the ordered list of canvas shapes (images
 * embedded as data URLs). Calculation results are never stored: they are
 * recomputed from the LaTeX on load.
 */
export interface CalculationDocument {
  id: string;
  version: number;
  title: string;
  metadata: DocumentMetadata;
  settings: DocumentSettings;
  /** Persisted table definition and draft batch inputs. Calculated outputs are recomputed on demand. */
  inputResult: InputResultConfig;
  shapes: Shape[];
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_SETTINGS: DocumentSettings = {
  unitSystem: 'SI',
  precision: 2,
  canvasMode: 'page',
  pageOrientation: 'portrait',
  showHeaderFooter: true,
  textFont: 'Inter',
  vectorLimit: 10,
};

export interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: string;
  project?: string;
}
