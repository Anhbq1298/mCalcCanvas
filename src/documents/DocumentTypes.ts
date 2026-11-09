import type { Shape } from '../canvas/model/types';
import type { UnitSystemName } from '../engine';

export const DOCUMENT_VERSION = 3;

export type CanvasMode = 'free' | 'page';
export type PageOrientation = 'portrait' | 'landscape';

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
  /** Show the title block (header/footer) on pages and in the PDF. */
  showHeaderFooter: boolean;
  /** Default font for new text regions (one of TEXT_FONTS). */
  textFont: string;
  /** Baselines snap to every major line (ruled paper, default) or to every minor grid line. */
  baselineSnap?: 'major' | 'minor';
  /** Minimum number of pages (keeps inserted blank pages). */
  pages?: number;
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
};

export interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: string;
  project?: string;
}
