import type { CalculationDocument, DocumentSummary } from './DocumentTypes';

/**
 * Where worksheets are stored. The app uses the IndexedDB implementation
 * (DocumentManager); other backends (files, cloud, desktop) can implement
 * the same interface without changing the document controller.
 */
export interface DocumentRepository {
  list(): Promise<DocumentSummary[]>;
  get(id: string): Promise<CalculationDocument | null>;
  put(doc: CalculationDocument): Promise<void>;
  remove(id: string): Promise<void>;
  getLastOpenedId(): Promise<string | null>;
  setLastOpenedId(id: string): Promise<void>;
}
