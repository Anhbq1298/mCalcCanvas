// @vitest-environment happy-dom
/**
 * Canvas store → engine synchronisation with the real stores: create, edit,
 * move (including across pages), duplicate, delete, undo/redo, load, display
 * units, and no recalculation for purely visual changes.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { step } from '../step';
import '../../canvas/canvasActions'; // installs the grid/page position normaliser
import { connectEngine, readingKey } from '../../canvas/engineBridge';
import { addShapes, deleteShapes, loadShapes, redo, undo, updateShapes } from '../../canvas/model/canvasStore';
import { DEFAULT_MATH_PROPS, type Shape } from '../../canvas/model/types';
import { compareOrderKeys } from '../../engine';
import { A4, PAGE_GAP } from '../../export/pageGeometry';
import { engine, useCalculationStore } from '../../store/calculationStore';
import { useAppStore } from '../../store/appStore';

const P2 = A4.h + PAGE_GAP; // top of page 2
const math = (id: string, x: number, y: number, latex: string): Shape => ({ id, type: 'math', x, y, props: { ...DEFAULT_MATH_PROPS, latex } });
const result = (id: string) => useCalculationStore.getState().results[id];
const text = (id: string) => result(id)?.value?.text;

let disconnect: (() => void) | null = null;
/** Fresh state; merged tests call it between their steps. */
const resetEach = () => {
  disconnect?.();
  useAppStore.getState().updateSettings({ canvasMode: 'page', pageOrientation: 'portrait' });
  loadShapes([]);
  disconnect = connectEngine();
};
beforeEach(resetEach);

describe('engine bridge', () => {
  it('engine bridge', () => {
    step('orders by page, then y, then x, then id', () => {
      const a = readingKey(math('a', 100, 900, ''));
      const b = readingKey(math('b', 80, P2 + 100, ''));
      const c = readingKey(math('c', 300, 900, ''));
      expect(a[0]).toBe(0);
      expect(b[0]).toBe(1);
      expect(compareOrderKeys(a, b)).toBeLessThan(0);
      expect(compareOrderKeys(a, c)).toBeLessThan(0);
    });
    resetEach();
    step('create, edit, move, move across pages, undo/redo, delete', () => {
      addShapes([math('L', 100, 100, 'L\\coloneq2\\,\\mathrm{m}'), math('A', 100, 200, 'A\\coloneq L^2')]);
      expect(text('A')).toBe('4 m²');

      updateShapes({ L: { props: { latex: 'L\\coloneq3\\,\\mathrm{m}' } } });
      expect(text('A')).toBe('9 m²');

      // Move the definition below its user → error; undo → valid again; redo → error.
      updateShapes({ L: { y: 400 } });
      expect(result('A')?.error?.code).toBe('defined-later');
      undo();
      expect(text('A')).toBe('9 m²');
      redo();
      expect(result('A')?.error?.code).toBe('defined-later');
      undo();

      // A user on page 2 sees the definition on page 1.
      addShapes([math('B', 100, P2 + 100, 'B\\coloneq L\\cdot2')]);
      expect(text('B')).toBe('6 m');
      // Moving the definition to page 2 below B breaks B; above B fixes it.
      updateShapes({ L: { y: P2 + 300 } });
      expect(result('B')?.error?.code).toBe('defined-later');
      updateShapes({ L: { y: P2 + 70 } });
      expect(text('B')).toBe('6 m');

      deleteShapes(['L']);
      expect(result('A')?.error?.code).toBe('undefined-variable');
      expect(result('L')).toBeUndefined();
    });
    resetEach();
    step('duplicate and copy create independent redefinitions', () => {
      addShapes([math('x1', 100, 100, 'x\\coloneq1'), math('u', 100, 300, 'x=')]);
      expect(text('u')).toBe('1');
      addShapes([{ ...math('x2', 100, 200, 'x\\coloneq5') }]); // e.g. pasted copy, then edited
      expect(text('u')).toBe('5');
      expect(result('x2')?.redefines?.name).toBe('x');
    });
    resetEach();
    step('purely visual changes do not touch the engine; display units do not recalculate dependents', () => {
      addShapes([math('L', 100, 100, 'L\\coloneq2\\,\\mathrm{m}'), math('A', 100, 200, 'A\\coloneq L^2')]);
      const seen: string[] = [];
      const off = engine.subscribe((ids) => seen.push(...ids));
      updateShapes({ L: { props: { w: 300, h: 40, color: '#ff0000' } } });
      expect(seen).toEqual([]);
      updateShapes({ L: { props: { displayUnit: 'mm' } } });
      expect(seen).toEqual(['L']);
      expect(text('L')).toBe('2000 mm');
      off();
    });
    resetEach();
    step('loading a worksheet recalculates everything', () => {
      loadShapes([math('a', 100, 100, 'a\\coloneq2'), math('b', 100, 200, 'b\\coloneq a\\cdot3')]);
      expect(text('b')).toBe('6');
    });
    resetEach();
    step('orientation change re-keys regions without breaking results', () => {
      addShapes([math('L', 100, 100, 'L\\coloneq2'), math('B', 100, P2 + 100, 'B\\coloneq L+1')]);
      expect(text('B')).toBe('3');
      useAppStore.getState().updateSettings({ pageOrientation: 'landscape' });
      expect(text('B')).toBe('3');
    });
  });
});
