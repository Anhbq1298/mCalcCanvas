import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { step } from '../step';
import { closeDatabase, DB_NAME, DocumentManager, MAX_VERSIONS } from '../../documents/DocumentManager';
import { parseDocument } from '../../documents/DocumentSerializer';
import { DOCUMENT_VERSION, type CalculationDocument } from '../../documents/DocumentTypes';

const raw = (id: string, version: number, extra: Record<string, unknown> = {}) => ({
  id,
  version,
  title: `Beam ${id}`,
  metadata: { project: 'P1' },
  settings: { unitSystem: 'SI', precision: 2, canvasMode: 'page', pageOrientation: 'portrait' },
  shapes: [{ id: 'a', type: 'math', x: 10, y: 20, props: { latex: 'L\\coloneq8.5m', w: 80, h: 30 } }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});
const doc = (id: string, title?: string): CalculationDocument => ({ ...parseDocument(raw(id, DOCUMENT_VERSION)), ...(title ? { title } : {}) });

async function resetEach() {
  await closeDatabase();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = () => resolve();
  });
}

/** Write a record straight into the documents store (bypassing DocumentManager), at the given schema. */
async function writeRaw(record: object, dbVersion = 2) {
  const database = await openDB(DB_NAME, dbVersion, {
    upgrade(d) {
      const store = d.createObjectStore('documents', { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
      d.createObjectStore('meta', { keyPath: 'key' });
    },
  });
  await database.put('documents', record);
  database.close();
}

describe('document storage (IndexedDB)', () => {
  it('migrates, keeps versions and recovers', async () => {
    await resetEach();
    await step('upgrades a schema-1 database and migrates an old (v2) worksheet without losing the original', async () => {
      await writeRaw(raw('old', 2), 1);
      const loaded = await DocumentManager.load('old');
      expect(loaded?.doc.version).toBe(DOCUMENT_VERSION);
      expect(loaded?.doc.inputResult.rows).toEqual([]);
      expect(loaded?.doc.shapes[0]).toMatchObject({ type: 'math', props: { latex: 'L\\coloneq8.5m' } });
      const versions = await DocumentManager.listVersions('old');
      expect(versions.map((v) => v.kind)).toEqual(['migration']);
      // The stored record is now current; reading again adds no second backup.
      await DocumentManager.load('old');
      expect(await DocumentManager.listVersions('old')).toHaveLength(1);
      expect((await DocumentManager.getVersion(versions[0].id))?.title).toBe('Beam old');
    });

    await resetEach();
    await step('manual saves keep a snapshot, autosaves only every few minutes; old snapshots are pruned', async () => {
      await DocumentManager.put(doc('d', 'first'), { kind: 'manual' });
      await DocumentManager.put(doc('d', 'auto edit'));
      expect((await DocumentManager.listVersions('d')).map((v) => v.title)).toEqual(['first']);
      for (let i = 0; i < MAX_VERSIONS + 3; i++) await DocumentManager.put(doc('d', `save ${i}`), { kind: 'manual' });
      const versions = await DocumentManager.listVersions('d');
      expect(versions).toHaveLength(MAX_VERSIONS);
      expect(versions[0].title).toBe(`save ${MAX_VERSIONS + 2}`);
      expect((await DocumentManager.get('d'))?.title).toBe(`save ${MAX_VERSIONS + 2}`);
    });

    await resetEach();
    await step('file name survives later saves and shows in the recent list', async () => {
      await DocumentManager.put(doc('f'));
      await DocumentManager.setFileName('f', 'beam.mCCV');
      await DocumentManager.put(doc('f', 'renamed'));
      expect(await DocumentManager.list()).toMatchObject([{ id: 'f', title: 'renamed', fileName: 'beam.mCCV' }]);
      expect(await DocumentManager.get('f')).not.toHaveProperty('fileName');
    });

    await resetEach();
    await step('an unreadable record is recovered from its latest readable snapshot', async () => {
      await DocumentManager.put(doc('c', 'good'), { kind: 'manual' });
      await closeDatabase();
      await writeRaw({ id: 'c', version: DOCUMENT_VERSION, shapes: 'corrupt' });
      const res = await DocumentManager.load('c');
      expect(res?.doc).toMatchObject({ id: 'c', title: 'good' });
      expect(res?.recoveredFrom?.kind).toBe('manual');
    });

    await resetEach();
    await step('a worksheet from a newer app is not replaced by an older snapshot', async () => {
      await DocumentManager.put(doc('n'), { kind: 'manual' });
      await closeDatabase();
      await writeRaw({ ...raw('n', DOCUMENT_VERSION + 1) });
      await expect(DocumentManager.load('n')).rejects.toThrow(/newer version/);
    });

    await resetEach();
    await step('deleting a worksheet deletes its versions', async () => {
      await DocumentManager.put(doc('r'), { kind: 'manual' });
      await DocumentManager.remove('r');
      expect(await DocumentManager.get('r')).toBeNull();
      expect(await DocumentManager.listVersions('r')).toEqual([]);
    });
  });
});
