import type { Shape } from '../canvas/model/types';
import type { UnitSystemName } from '../engine';

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
  /** Minimum number of pages (keeps inserted blank pages). */
  pages?: number;
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
};

export interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: string;
  project?: string;
}
