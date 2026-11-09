// @vitest-environment happy-dom
/**
 * Annex links: an annex block is calculated where its link stands in the main
 * body, numbered in link order, and can be sorted into link order.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { step } from '../step';
import '../../canvas/canvasActions';
import { computeAnnex } from '../../canvas/annex';
import { insertAnnexLink, sortAnnexByLinkOrder } from '../../canvas/annexActions';
import { connectEngine } from '../../canvas/engineBridge';
import { loadShapes, updateShapes, useCanvasStore } from '../../canvas/model/canvasStore';
import { DEFAULT_MATH_PROPS, DEFAULT_TEXT_PROPS, type AnnexRole, type Shape } from '../../canvas/model/types';
import { parseDocument } from '../../documents/DocumentSerializer';
import { DOCUMENT_VERSION } from '../../documents/DocumentTypes';
import { useCalculationStore } from '../../store/calculationStore';
import { useAppStore } from '../../store/appStore';

const PAGE = 1123 + 48;
const math = (id: string, y: number, latex: string): Shape => ({ id, type: 'math', x: 100, y, props: { ...DEFAULT_MATH_PROPS, latex } });
const text = (id: string, y: number, annex: AnnexRole, html = ''): Shape => ({ id, type: 'text', x: 80, y, props: { ...DEFAULT_TEXT_PROPS, html, annex } });
const result = (id: string) => useCalculationStore.getState().results[id];
const shapes = () => useCanvasStore.getState().shapes;

/** Main body on page 1 (link at y 300), ANNEX title on page 2, block A on page 3. */
const doc = (): Shape[] => [
  math('b', 100, 'b\\coloneq2'),
  math('early', 200, 'e\\coloneq x_{s}+1'),
  text('lnk', 300, { kind: 'link', target: 'A' }),
  math('use', 400, 'u\\coloneq x_{s}\\cdot10'),
  math('late', 500, 'z\\coloneq5'),
  text('start', PAGE + 60, { kind: 'start' }, 'ANNEX'),
  text('hA', 2 * PAGE + 60, { kind: 'heading', id: 'A' }, 'Bar coordinates'),
  math('xs', 2 * PAGE + 160, 'x_{s}\\coloneq3b'),
];

let disconnect: (() => void) | null = null;
/** Fresh state; merged tests call it between their steps. */
const resetEach = () => {
  disconnect?.();
  useAppStore.getState().updateSettings({ canvasMode: 'page', pageOrientation: 'portrait', pages: 6 });
  loadShapes([]);
  disconnect = connectEngine();
};
beforeEach(resetEach);

describe('annex blocks are calculated at their link', () => {
  it('annex blocks are calculated at their link', () => {
    step('the main body below the link uses annex values; above the link it cannot', () => {
      loadShapes(doc());
      expect(result('use')?.value?.number).toBe(60);
      expect(result('early')?.status).toBe('error');
    });
    resetEach();
    step('an annex block sees only what is defined above its link', () => {
      loadShapes([...doc(), math('xz', 2 * PAGE + 200, 'w\\coloneq z+1')]);
      expect(result('xz')?.error?.message).toMatch(/defined below/);
      // Move the link below z: now w works, and u (above the link) loses x_s.
      updateShapes({ lnk: { y: 600 } });
      expect(result('xz')?.value?.number).toBe(6);
      expect(result('use')?.status).toBe('error');
    });
    resetEach();
    step('without a link a block is calculated where it stands', () => {
      loadShapes(doc().filter((s) => s.id !== 'lnk'));
      expect(result('use')?.status).toBe('error');
      expect(computeAnnex(shapes()).blocks[0]).toMatchObject({ number: 1, link: undefined });
    });
    resetEach();
    step('numbers follow the links; problems are reported, not guessed', () => {
      const two = [
        ...doc(),
        text('lnkB', 250, { kind: 'link', target: 'B' }),
        text('lnkB2', 450, { kind: 'link', target: 'B' }),
        text('lnkX', 460, { kind: 'link', target: 'nope' }),
        text('hB', 3 * PAGE + 60, { kind: 'heading', id: 'B' }, 'Sweep'),
        text('hEarly', 50, { kind: 'heading', id: 'C' }, 'Not in the annex'),
        text('lnkIn', 3 * PAGE + 300, { kind: 'link', target: 'A' }),
      ];
      const info = computeAnnex(Object.fromEntries(two.map((s) => [s.id, s])));
      expect(info.blocks.map((b) => [b.id, b.number])).toEqual([
        ['B', 1],
        ['A', 2],
      ]);
      expect(info.links.get('lnkB2')?.problem).toMatch(/already linked/);
      expect(info.links.get('lnkX')?.problem).toMatch(/missing/);
      expect(info.links.get('lnkIn')?.problem).toMatch(/inside the annex/);
      expect(info.headingProblems.get('hEarly')).toMatch(/Above the ANNEX title/);
    });
    resetEach();
    step('sorting moves whole annex pages into link order', () => {
      loadShapes([...doc(), text('lnkB', 250, { kind: 'link', target: 'B' }), text('hB', 3 * PAGE + 60, { kind: 'heading', id: 'B' }, 'Sweep'), math('sw', 3 * PAGE + 160, 'q\\coloneq1')]);
      const swOff = shapes().sw.y - shapes().hB.y;
      const xsOff = shapes().xs.y - shapes().hA.y;
      expect(sortAnnexByLinkOrder({ quiet: true })).toBe(true);
      // B (linked first) now on page 3, A on page 4; content moved with its heading.
      expect(Math.floor(shapes().hB.y / PAGE)).toBe(2);
      expect(shapes().sw.y - shapes().hB.y).toBe(swOff);
      expect(Math.floor(shapes().hA.y / PAGE)).toBe(3);
      expect(shapes().xs.y - shapes().hA.y).toBe(xsOff);
      expect(result('use')?.value?.number).toBe(60);
    });
    resetEach();
    step('Insert → Annex link creates the ANNEX page, a block on a new page and the link', () => {
      useAppStore.getState().updateSettings({ pages: 1 });
      loadShapes([math('b', 100, 'b\\coloneq2')]);
      useCanvasStore.setState({ crosshair: { x: 100, y: 300 } });
      const heading = insertAnnexLink()!;
      const info = computeAnnex(shapes());
      expect(info.start).toBeTruthy();
      expect(info.blocks).toHaveLength(1);
      expect(info.blocks[0].heading).toBe(heading);
      expect(info.blocks[0].link).toBeTruthy();
      expect(Math.floor(shapes()[heading].y / PAGE)).toBe(2);
      expect(Math.floor(shapes()[info.start!].y / PAGE)).toBe(1);
    });
    resetEach();
    step('files keep annex roles and drop malformed ones', () => {
      const raw = {
        format: 'calccanvas',
        version: DOCUMENT_VERSION,
        id: 'd',
        title: 't',
        shapes: [
          { id: 't1', type: 'text', x: 0, y: 0, props: { html: 'x', annex: { kind: 'link', target: 'ax_1' } } },
          { id: 't2', type: 'text', x: 0, y: 40, props: { html: 'x', annex: { kind: 'heading', id: '<bad>' } } },
        ],
      };
      const d = parseDocument(raw);
      const byId = Object.fromEntries(d.shapes.map((s) => [s.id, s]));
      expect(byId.t1.type === 'text' && byId.t1.props.annex).toEqual({ kind: 'link', target: 'ax_1' });
      expect(byId.t2.type === 'text' && byId.t2.props.annex).toBeUndefined();
    });
  });
});
