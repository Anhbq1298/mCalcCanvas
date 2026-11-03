// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseDocument, serializeDocument } from '../../documents/DocumentSerializer';
import { DOCUMENT_VERSION } from '../../documents/DocumentTypes';

const base = {
  id: 'doc-1',
  title: 'Beam',
  metadata: { project: 'P1' },
  settings: { unitSystem: 'SI', precision: 3, canvasMode: 'page', pageOrientation: 'portrait' },
  shapes: [
    { id: 'a', type: 'math', x: 10, y: 20, props: { latex: 'L\\coloneq8.5m', w: 80, h: 30 } },
    { id: 'b', type: 'text', x: 0, y: 0, props: { html: '<b>Title</b><script>alert(1)</script><img src=x onerror=alert(1)>', w: 200 } },
    { id: 'c', type: 'image', x: 0, y: 0, props: { src: 'https://evil.example/x.png', w: 10, h: 10 } },
    { id: 'd', type: 'line', x: 0, y: 0, props: { x2: 50, y2: 0, arrow: true } },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('document serializer', () => {
  it('round-trips a document', () => {
    const doc = parseDocument({ ...base, version: DOCUMENT_VERSION });
    const again = parseDocument(JSON.parse(serializeDocument(doc)));
    expect(again).toEqual(doc);
  });

  it('sanitises shapes from untrusted files', () => {
    const doc = parseDocument({ ...base, version: DOCUMENT_VERSION });
    expect(doc.shapes.map((s) => s.id)).toEqual(['a', 'b', 'd']); // remote image dropped
    const text = doc.shapes.find((s) => s.type === 'text');
    expect(text?.type === 'text' && text.props.html).toBe('<b>Title</b>');
  });

  it('migrates a v1 (tldraw) worksheet', () => {
    const v1 = {
      ...base,
      version: 1,
      shapes: {
        store: {
          'shape:m1': { typeName: 'shape', id: 'shape:m1', type: 'math', x: 5, y: 6, index: 'a1', props: { latex: 'b\\coloneq2m', w: 70, h: 30 } },
          'shape:t1': {
            typeName: 'shape', id: 'shape:t1', type: 'text', x: 1, y: 2, index: 'a2',
            props: { w: 300, richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi <you>' }] }] } },
          },
        },
      },
    };
    const doc = parseDocument(v1);
    expect(doc.version).toBe(DOCUMENT_VERSION);
    expect(doc.shapes).toHaveLength(2);
    expect(doc.shapes[0]).toMatchObject({ type: 'math', x: 5, props: { latex: 'b\\coloneq2m' } });
    expect(doc.shapes[1]).toMatchObject({ type: 'text', props: { html: '<div>Hi &lt;you&gt;</div>' } });
  });

  it('rejects foreign or newer files', () => {
    expect(() => parseDocument({ format: 'other' })).toThrow();
    expect(() => parseDocument({ ...base, version: DOCUMENT_VERSION + 1 })).toThrow(/newer/);
    expect(() => parseDocument(null)).toThrow();
  });

  it('sanitises settings and metadata', () => {
    const doc = parseDocument({ ...base, version: DOCUMENT_VERSION, settings: { precision: 99, unitSystem: 'x' }, metadata: { project: 5, preparedBy: 'MB' } });
    expect(doc.settings.precision).toBe(8);
    expect(doc.settings.unitSystem).toBe('SI');
    expect(doc.metadata).toEqual({ preparedBy: 'MB' });
  });
});
