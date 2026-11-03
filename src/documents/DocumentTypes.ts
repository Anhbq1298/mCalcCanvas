import type { UnitSystemName } from '../engine';

export const DOCUMENT_VERSION = 1;

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
}

/**
 * Persisted worksheet. `shapes` is the tldraw document snapshot (shapes,
 * pages, assets – including embedded images). Calculation results are never
 * stored: they are recomputed from the LaTeX on load.
 */
export interface CalculationDocument {
  id: string;
  version: number;
  title: string;
  metadata: DocumentMetadata;
  settings: DocumentSettings;
  shapes: unknown;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_SETTINGS: DocumentSettings = {
  unitSystem: 'SI',
  precision: 2,
  canvasMode: 'page',
  pageOrientation: 'portrait',
};

export interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: string;
  project?: string;
}
