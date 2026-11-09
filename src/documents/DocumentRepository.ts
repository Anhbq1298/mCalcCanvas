import type { CalculationDocument, DocumentSummary } from './DocumentTypes';

/** Why a version snapshot was kept. */
export type VersionKind = 'auto' | 'manual' | 'migration';

export interface VersionSummary {
  id: string;
  docId: string;
  title: string;
  savedAt: string;
  kind: VersionKind;
}

export interface LoadResult {
  doc: CalculationDocument;
  /** Set when the stored worksheet was unreadable and this version snapshot was opened instead. */
  recoveredFrom?: VersionSummary;
}

export interface PutOptions {
  /** 'manual' (Ctrl+S) always keeps a version snapshot; autosaves keep one every few minutes. */
  kind?: 'auto' | 'manual';
}

/**
 * Where worksheets are stored. The app uses the IndexedDB implementation
 * (DocumentManager); other backends (files, cloud, desktop) can implement
 * the same interface without changing the document controller.
 */
export interface DocumentRepository {
  list(): Promise<DocumentSummary[]>;
  get(id: string): Promise<CalculationDocument | null>;
  /** Like get, but falls back to the latest readable version snapshot when the record is corrupt. */
  load(id: string): Promise<LoadResult | null>;
  put(doc: CalculationDocument, opts?: PutOptions): Promise<void>;
  remove(id: string): Promise<void>;
  /** Remember the .mCCV file name a worksheet was last opened from or saved to (Recent documents). */
  setFileName(id: string, fileName: string): Promise<void>;
  listVersions(docId: string): Promise<VersionSummary[]>;
  getVersion(versionId: string): Promise<CalculationDocument | null>;
  getLastOpenedId(): Promise<string | null>;
  setLastOpenedId(id: string): Promise<void>;
}
