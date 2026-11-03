import { describe, expect, it } from 'vitest';
import { parseDocument, serializeDocument } from '../../documents/DocumentSerializer';
import { DOCUMENT_VERSION } from '../../documents/DocumentTypes';

const base = {
  id: 'doc-1',
  title: 'Beam',
  metadata: { project: 'P1' },
  settings: { unitSystem: 'SI', precision: 3, canvasMode: 'page', pageOrientation: 'portrait' },
  shapes: { store: {}, schema: {} },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('document serializer', () => {
  it('round-trips a document', () => {
    const doc = parseDocument({ ...base, version: DOCUMENT_VERSION });
    const again = parseDocument(JSON.parse(serializeDocument(doc)));
    expect(again).toEqual(doc);
  });

  it('migrates version 0 documents', () => {
    const doc = parseDocument({ ...base, version: 0, settings: { unitSystem: 'Imperial' } });
    expect(doc.version).toBe(DOCUMENT_VERSION);
    expect(doc.settings.unitSystem).toBe('Imperial');
    expect(doc.settings.pageOrientation).toBe('portrait');
  });

  it('rejects foreign or newer files', () => {
    expect(() => parseDocument({ format: 'other' })).toThrow();
    expect(() => parseDocument({ ...base, version: DOCUMENT_VERSION + 1 })).toThrow(/newer/);
    expect(() => parseDocument(null)).toThrow();
  });

  it('sanitises settings and metadata', () => {
    const doc = parseDocument({ ...base, version: 1, settings: { precision: 99, unitSystem: 'x' }, metadata: { project: 5, preparedBy: 'MB' } });
    expect(doc.settings.precision).toBe(8);
    expect(doc.settings.unitSystem).toBe('SI');
    expect(doc.metadata).toEqual({ preparedBy: 'MB' });
  });
});
