// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { step } from '../step';
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
  it('document serializer', () => {
    step('round-trips a document', () => {
      const doc = parseDocument({ ...base, version: DOCUMENT_VERSION });
      const again = parseDocument(JSON.parse(serializeDocument(doc)));
      expect(again).toEqual(doc);
    });
    step('sanitises shapes from untrusted files', () => {
      const doc = parseDocument({ ...base, version: DOCUMENT_VERSION });
      expect(doc.shapes.map((s) => s.id)).toEqual(['a', 'b', 'd']); // remote image dropped
      const text = doc.shapes.find((s) => s.type === 'text');
      expect(text?.type === 'text' && text.props.html).toBe('<b>Title</b>');
    });
    step('keeps only supported math text fonts', () => {
      const valid = parseDocument({ ...base, version: DOCUMENT_VERSION, shapes: [{ ...base.shapes[0], props: { ...base.shapes[0].props, textFont: 'Georgia' } }] });
      const invalid = parseDocument({ ...base, version: DOCUMENT_VERSION, shapes: [{ ...base.shapes[0], props: { ...base.shapes[0].props, textFont: 'url(evil)' } }] });
      expect(valid.shapes[0]?.type === 'math' && valid.shapes[0].props.textFont).toBe('Georgia');
      expect(invalid.shapes[0]?.type === 'math' && invalid.shapes[0].props.textFont).toBe('Inter');
    });
    step('migrates a v1 (tldraw) worksheet', () => {
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
    step('migrates a v2 worksheet with an empty Input & Results configuration', () => {
      const doc = parseDocument({ ...base, version: 2 });
      expect(doc.version).toBe(DOCUMENT_VERSION);
      expect(doc.inputResult).toEqual({ title: 'Batch calculation', inputs: [], outputs: [], rows: [] });
    });
    step('rejects foreign or newer files', () => {
      expect(() => parseDocument({ format: 'other' })).toThrow();
      expect(() => parseDocument({ ...base, version: DOCUMENT_VERSION + 1 })).toThrow(/newer/);
      expect(() => parseDocument(null)).toThrow();
    });
    step('sanitises settings and metadata', () => {
      const doc = parseDocument({ ...base, version: DOCUMENT_VERSION, settings: { precision: 99, unitSystem: 'x' }, metadata: { project: 5, preparedBy: 'MB' } });
      expect(doc.settings.precision).toBe(8);
      expect(doc.settings.unitSystem).toBe('SI');
      expect(doc.metadata).toEqual({ preparedBy: 'MB' });
    });
    step('persists Input & Results bindings and numeric batch inputs without calculated outputs', () => {
      const doc = parseDocument({
        ...base,
        version: DOCUMENT_VERSION,
        inputResult: {
          title: 'Beam batch',
          inputs: [{ id: 'span', regionId: 'a', label: 'Span' }],
          outputs: [{ id: 'moment', regionId: 'a', label: 'Moment' }],
          rows: [{ id: 'b1', name: 'B1', values: { span: 6.5, ignored: 99 }, calculated: { moment: 42 } }],
        },
      });
      expect(doc.inputResult).toEqual({
        title: 'Beam batch',
        inputs: [{ id: 'span', regionId: 'a', label: 'Span' }],
        outputs: [{ id: 'moment', regionId: 'a', label: 'Moment' }],
        rows: [{ id: 'b1', name: 'B1', values: { span: 6.5 } }],
      });
      expect(serializeDocument(doc)).not.toContain('"calculated"');
    });
    step('drops Input & Results bindings to missing or non-math regions', () => {
      const doc = parseDocument({
        ...base,
        version: DOCUMENT_VERSION,
        inputResult: {
          inputs: [{ id: 'ok', regionId: 'a', label: 'OK' }, { id: 'missing', regionId: 'nope', label: 'Missing' }],
          outputs: [{ id: 'text', regionId: 'b', label: 'Text' }],
          rows: [{ id: 'case', values: { ok: 1, missing: 2 } }],
        },
      });
      expect(doc.inputResult.inputs).toEqual([{ id: 'ok', regionId: 'a', label: 'OK' }]);
      expect(doc.inputResult.outputs).toEqual([]);
      expect(doc.inputResult.rows[0]?.values).toEqual({ ok: 1 });
    });
  });
});

describe('serializer robustness', () => {
  const doc = (shapes: unknown[]) => ({ ...base, version: DOCUMENT_VERSION, shapes });

  it('serializer robustness', () => {
    step('keeps duplicate ids under a new id instead of dropping content', () => {
      const d = parseDocument(
        doc([
          { id: 'a', type: 'math', x: 0, y: 0, props: { latex: 'x\\coloneq1' } },
          { id: 'a', type: 'math', x: 0, y: 40, props: { latex: 'y\\coloneq2' } },
        ]),
      );
      expect(d.shapes).toHaveLength(2);
      expect(new Set(d.shapes.map((s) => s.id)).size).toBe(2);
      expect(d.shapes.map((s) => (s.type === 'math' ? s.props.latex : ''))).toEqual(['x\\coloneq1', 'y\\coloneq2']);
    });
    step('normalises invalid numbers and ignores unknown fields and types', () => {
      const d = parseDocument(
        doc([
          { id: 'm', type: 'math', x: 1e300, y: Number.NaN, extra: { evil: true }, props: { latex: 'a\\coloneq1', precision: 900, w: -5, fontSize: 1e9 } },
          { id: 'z', type: 'video', x: 0, y: 0, props: {} },
          { id: 'r', type: 'rect', x: 0, y: 0, props: { w: 'big', strokeWidth: 1e6 } },
          null,
          42,
        ]),
      );
      expect(d.shapes.map((s) => s.id)).toEqual(['m', 'r']);
      const m = d.shapes[0];
      expect(m.x).toBe(1e7);
      expect(m.y).toBe(0);
      expect(m.type === 'math' && m.props.precision).toBe(8);
      expect(m.type === 'math' && m.props.w).toBe(1);
      expect(m.type === 'math' && m.props.fontSize).toBe(64);
      expect('extra' in m).toBe(false);
      const r = d.shapes[1];
      expect(r.type === 'rect' && r.props.strokeWidth).toBe(20);
    });
    step('round-trips every supported shape type without loss', () => {
      const d1 = parseDocument(
        doc([
          { id: 'm', type: 'math', x: 10, y: 20, props: { latex: 'M\\coloneq1', displayMode: 'full', displayUnit: 'kN·m', precision: 3, autoSize: false, w: 80, h: 30, fontSize: 18, color: '#0f172a' } },
          { id: 't', type: 'text', x: 0, y: 0, props: { html: '<b>H</b>', heading: 2, w: 300, h: 24, fontFamily: 'Inter', fontSize: 16, color: '#0f172a', align: 'center' } },
          { id: 'r', type: 'rect', x: 1, y: 2, props: { w: 30, h: 40, stroke: '#ff0000', strokeWidth: 2 } },
          { id: 'l', type: 'line', x: 1, y: 2, props: { x2: 30, y2: 40, stroke: '#ff0000', strokeWidth: 2, arrow: true } },
          { id: 'p', type: 'draw', x: 1, y: 2, props: { points: [[0, 0], [5, 5]], stroke: '#ff0000', strokeWidth: 2 } },
          { id: 'i', type: 'image', x: 1, y: 2, props: { w: 1, h: 1, src: 'data:image/png;base64,AAAA' } },
        ]),
      );
      const d2 = parseDocument(JSON.parse(serializeDocument(d1)));
      expect(d2).toEqual(d1);
      expect(d2.shapes).toHaveLength(6);
      // Results are never persisted.
      expect(serializeDocument(d1)).not.toMatch(/"result"|"value"/);
    });
  });
});
