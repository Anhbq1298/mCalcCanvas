/**
 * Local worksheet storage in IndexedDB.
 *
 * - `documents`: the current state of each worksheet (one record per id).
 * - `versions`: snapshots for history and recovery (see VERSION_* below).
 *   A failing snapshot never fails the save itself.
 * - `meta`: the last opened worksheet.
 *
 * Records are migrated lazily: a record written by an older document
 * version is upgraded with `parseDocument` when it is read, written back,
 * and the original is kept as a 'migration' snapshot (never pruned).
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { parseDocument } from './DocumentSerializer';
import { DOCUMENT_VERSION, type CalculationDocument, type DocumentSummary } from './DocumentTypes';
import type { DocumentRepository, LoadResult, PutOptions, VersionKind, VersionSummary } from './DocumentRepository';

/** A stored worksheet: the document plus storage-only fields. */
type StoredDocument = CalculationDocument & { fileName?: string };

interface VersionRecord extends VersionSummary {
  /** The document as it was stored (possibly an older document version). */
  doc: unknown;
}

interface CalcDB extends DBSchema {
  documents: { key: string; value: StoredDocument; indexes: { updatedAt: string } };
  meta: { key: string; value: { key: string; value: string } };
  versions: { key: string; value: VersionRecord; indexes: { docId: string } };
}

export const DB_NAME = 'calccanvas';
/** IndexedDB schema: 1 = documents + meta, 2 = + versions. */
export const DB_VERSION = 2;
/** Autosaves keep a snapshot at most this often. */
export const VERSION_INTERVAL_MS = 5 * 60_000;
/** Snapshots kept per worksheet (migration backups are not counted or pruned). */
export const MAX_VERSIONS = 25;

let dbPromise: Promise<IDBPDatabase<CalcDB>> | null = null;

function db(): Promise<IDBPDatabase<CalcDB>> {
  dbPromise ??= openDB<CalcDB>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const store = database.createObjectStore('documents', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
        database.createObjectStore('meta', { keyPath: 'key' });
      }
      if (oldVersion < 2) {
        database.createObjectStore('versions', { keyPath: 'id' }).createIndex('docId', 'docId');
      }
    },
    // Another tab opened a newer schema: let it upgrade; reopen on next use.
    blocking() {
      void dbPromise?.then((d) => d.close());
      dbPromise = null;
    },
  });
  return dbPromise;
}

/** Test hook: forget the open connection (e.g. after deleting the database). */
export async function closeDatabase(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  if (p) (await p).close();
}

let versionCounter = 0;
const versionId = (docId: string, savedAt: string) => `${docId}@${savedAt}#${(versionCounter++).toString(36)}`;

const summary = ({ doc: _doc, ...rest }: VersionRecord): VersionSummary => rest;

async function versionsOf(docId: string): Promise<VersionRecord[]> {
  const all = await (await db()).getAllFromIndex('versions', 'docId', docId);
  return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Snapshot times are strictly increasing, so history order and pruning never depend on ties. */
let lastSnapshotMs = 0;

async function addVersion(docId: string, title: string, kind: VersionKind, doc: unknown, after?: string): Promise<void> {
  lastSnapshotMs = Math.max(Date.now(), lastSnapshotMs + 1, after ? Date.parse(after) + 1 : 0);
  const savedAt = new Date(lastSnapshotMs).toISOString();
  await (await db()).put('versions', { id: versionId(docId, savedAt), docId, title, savedAt, kind, doc });
}

/** Snapshot after a save: always for a manual save, else when the last one is old enough. Prunes old snapshots. */
async function snapshot(doc: CalculationDocument, kind: 'auto' | 'manual'): Promise<void> {
  const existing = (await versionsOf(doc.id)).filter((v) => v.kind !== 'migration');
  const last = existing[0];
  if (kind === 'auto' && last && Date.now() - Date.parse(last.savedAt) < VERSION_INTERVAL_MS) return;
  await addVersion(doc.id, doc.title, kind, doc, last?.savedAt);
  const database = await db();
  for (const old of existing.slice(MAX_VERSIONS - 1)) await database.delete('versions', old.id);
}

export const DocumentManager: DocumentRepository = {
  async list(): Promise<DocumentSummary[]> {
    const all = await (await db()).getAll('documents');
    return all
      .map((d) => ({ id: d.id, title: d.title, updatedAt: d.updatedAt, project: d.metadata?.project, ...(d.fileName ? { fileName: d.fileName } : {}) }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async get(id: string): Promise<CalculationDocument | null> {
    return (await DocumentManager.load(id))?.doc ?? null;
  },

  async load(id: string): Promise<LoadResult | null> {
    const raw = await (await db()).get('documents', id);
    if (!raw) return null;
    try {
      const doc = parseDocument(raw);
      if (raw.version !== DOCUMENT_VERSION) {
        // Schema migration: keep the original, store the upgraded document.
        try {
          await addVersion(id, doc.title, 'migration', raw);
          await (await db()).put('documents', { ...doc, ...(raw.fileName ? { fileName: raw.fileName } : {}) });
        } catch (e) {
          console.warn('Could not store the migrated worksheet', e);
        }
      }
      return { doc };
    } catch (e) {
      // A worksheet from a newer app must not be replaced by an older snapshot.
      if (typeof raw.version === 'number' && raw.version > DOCUMENT_VERSION) throw e;
      for (const v of await versionsOf(id)) {
        try {
          return { doc: { ...parseDocument(v.doc), id }, recoveredFrom: summary(v) };
        } catch {
          /* try an older snapshot */
        }
      }
      throw e;
    }
  },

  async put(doc: CalculationDocument, opts: PutOptions = {}): Promise<void> {
    const database = await db();
    const tx = database.transaction('documents', 'readwrite');
    const prev = await tx.store.get(doc.id);
    await tx.store.put({ ...doc, ...(prev?.fileName ? { fileName: prev.fileName } : {}) });
    await tx.done;
    try {
      await snapshot(doc, opts.kind ?? 'auto');
    } catch (e) {
      // Out of quota or similar: the worksheet itself is saved.
      console.warn('Version snapshot skipped', e);
    }
  },

  async remove(id: string): Promise<void> {
    const database = await db();
    const tx = database.transaction(['documents', 'versions'], 'readwrite');
    await tx.objectStore('documents').delete(id);
    const versions = tx.objectStore('versions');
    for (const key of await versions.index('docId').getAllKeys(id)) await versions.delete(key);
    await tx.done;
  },

  async setFileName(id: string, fileName: string): Promise<void> {
    const database = await db();
    const tx = database.transaction('documents', 'readwrite');
    const rec = await tx.store.get(id);
    if (rec) await tx.store.put({ ...rec, fileName });
    await tx.done;
  },

  async listVersions(docId: string): Promise<VersionSummary[]> {
    return (await versionsOf(docId)).map(summary);
  },

  async getVersion(id: string): Promise<CalculationDocument | null> {
    const v = await (await db()).get('versions', id);
    return v ? { ...parseDocument(v.doc), id: v.docId } : null;
  },

  async getLastOpenedId(): Promise<string | null> {
    return (await (await db()).get('meta', 'lastOpened'))?.value ?? null;
  },

  async setLastOpenedId(id: string): Promise<void> {
    await (await db()).put('meta', { key: 'lastOpened', value: id });
  },
};
