import type { Shape } from '../canvas/model/types';
import type { UnitSystemName } from '../engine/light';

export const DOCUMENT_VERSION = 2;

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
  /** Arrays longer than this are shown as the first and last half (pandas style); 0 = show all. */
  vectorLimit?: number;
}

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
