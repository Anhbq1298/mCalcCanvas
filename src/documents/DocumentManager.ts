import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { parseDocument } from './DocumentSerializer';
import type { CalculationDocument, DocumentSummary } from './DocumentTypes';
import type { DocumentRepository } from './DocumentRepository';

interface CalcDB extends DBSchema {
  documents: { key: string; value: CalculationDocument; indexes: { updatedAt: string } };
  meta: { key: string; value: { key: string; value: string } };
}

let dbPromise: Promise<IDBPDatabase<CalcDB>> | null = null;

function db(): Promise<IDBPDatabase<CalcDB>> {
  dbPromise ??= openDB<CalcDB>('calccanvas', 1, {
    upgrade(database) {
      const store = database.createObjectStore('documents', { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
      database.createObjectStore('meta', { keyPath: 'key' });
    },
  });
  return dbPromise;
}

/** Local worksheet storage in IndexedDB. */
export const DocumentManager: DocumentRepository = {
  async list(): Promise<DocumentSummary[]> {
    const all = await (await db()).getAll('documents');
    return all
      .map((d) => ({ id: d.id, title: d.title, updatedAt: d.updatedAt, project: d.metadata.project }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async get(id: string): Promise<CalculationDocument | null> {
    const raw = await (await db()).get('documents', id);
    return raw ? parseDocument(raw) : null;
  },

  async put(doc: CalculationDocument): Promise<void> {
    await (await db()).put('documents', doc);
  },

  async remove(id: string): Promise<void> {
    await (await db()).delete('documents', id);
  },

  async getLastOpenedId(): Promise<string | null> {
    return (await (await db()).get('meta', 'lastOpened'))?.value ?? null;
  },

  async setLastOpenedId(id: string): Promise<void> {
    await (await db()).put('meta', { key: 'lastOpened', value: id });
  },
};
