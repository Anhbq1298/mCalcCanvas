// @vitest-environment happy-dom
/**
 * Layout service: pure plans (no store mutation), cascaded separation in one
 * batched update, page flow, and undo/redo as one transaction.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { step } from '../step';
import { deleteSelection, separateRegion } from '../../canvas/canvasActions';
import { anchorY, globalLine, lineY, planLineShift, planSeparation } from '../../canvas/layout';
import { addShapes, loadShapes, redo, select, transaction, undo, updateShapes, useCanvasStore } from '../../canvas/model/canvasStore';
import { DEFAULT_MATH_PROPS, type Shape } from '../../canvas/model/types';
import { useAppStore } from '../../store/appStore';

/** A math region whose baseline sits on line g, with a given height. */
const region = (id: string, g: number, h = 32, baseline = 22): Shape => ({
  id,
  type: 'math',
  x: 96,
  y: lineY(g) - baseline,
  props: { ...DEFAULT_MATH_PROPS, latex: `${id}\\coloneq1`, h, w: 200, baseline },
});
const rec = (list: Shape[]) => Object.fromEntries(list.map((s) => [s.id, s]));
const lineOf = (s: Shape) => globalLine(anchorY(s));

/** Fresh state; merged tests call it between their steps. */
const resetEach = () => {
  useAppStore.getState().updateSettings({ canvasMode: 'page', pageOrientation: 'portrait', pages: 1, baselineSnap: 'major' });
  loadShapes([]);
};
beforeEach(resetEach);

describe('layout plans', () => {
  it('layout plans', () => {
    step('a tall region pushes the following lines down, cascading, as one plan', () => {
      // a is 3 lines tall and now overlaps b (line 1) and c (line 2); d (line 6) is clear.
      const shapes = rec([region('a', 0, 110), region('b', 1), region('c', 2), region('d', 6)]);
      const plan = planSeparation(shapes, ['a']);
      const moved = Object.fromEntries(Object.entries(plan.patches).map(([id, p]) => [id, lineOf({ ...shapes[id], y: p.y } as Shape)]));
      expect(moved.b).toBe(3); // cleared a's bottom
      expect(moved.c).toBe(4); // kept its distance below b
      expect(moved.d).toBe(8); // everything after moves with them
      expect(plan.patches.a).toBeUndefined(); // the earlier region stays
    });
    resetEach();
    step('deleting regions closes the lines they leave empty (one undo step); a shared line stays', () => {
      const label: Shape = { ...region('label', 4), id: 'label', x: 420 };
      loadShapes([region('a', 1), region('b', 2, 110, 40), region('c', 4), label, region('d', 6)]);
      select(['b']);
      deleteSelection();
      const line = (id: string) => lineOf(useCanvasStore.getState().shapes[id]);
      // b covered lines 2–3: both close, everything below moves up two lines.
      expect([line('a'), line('c'), line('label'), line('d')]).toEqual([1, 2, 2, 4]);
      // c shares its line with a label: deleting c alone leaves the line.
      select(['c']);
      deleteSelection();
      expect([line('label'), line('d')]).toEqual([2, 4]);
      undo();
      undo();
      expect(Object.keys(useCanvasStore.getState().shapes).sort()).toEqual(['a', 'b', 'c', 'd', 'label']);
      expect(line('d')).toBe(6);
    });
    resetEach();
    step('plans are pure: the store is not touched until applied', () => {
      addShapes([region('a', 0, 110), region('b', 1)], { history: false });
      const before = useCanvasStore.getState().shapes;
      planSeparation(before, ['a']);
      planLineShift(before, 0, 3);
      expect(useCanvasStore.getState().shapes).toBe(before);
    });
    resetEach();
    step('content pushed past the bottom margin flows onto the next page', () => {
      const shapes = rec([region('a', 23), region('b', 24)]);
      const plan = planLineShift(shapes, 23, 2);
      expect(lineOf({ ...shapes.b, y: plan.patches.b.y } as Shape)).toBe(25 + 1); // page 2, line 2
      expect(plan.pagesNeeded).toBe(2);
    });
    resetEach();
    step('resolves long chains completely (no fixed iteration cap)', () => {
      const list = [region('r0', 0, 70)];
      for (let i = 1; i < 60; i++) list.push(region(`r${i}`, i, 70)); // every region overlaps the next
      const plan = planSeparation(rec(list), list.map((s) => s.id));
      const after = list.map((s) => ({ ...s, y: plan.patches[s.id]?.y ?? s.y }) as Shape);
      for (let i = 1; i < after.length; i++) {
        const prev = after[i - 1];
        expect(after[i].y).toBeGreaterThanOrEqual(prev.y + (prev.type === 'math' ? prev.props.h : 0) - 8);
      }
    });
  });
});

describe('applying layout', () => {
  it('applying layout', () => {
    step('separation is applied in one store update', () => {
      addShapes([region('a', 0, 110), region('b', 1), region('c', 2), region('d', 3)], { history: false });
      let updates = 0;
      const off = useCanvasStore.subscribe((s, p) => s.shapes !== p.shapes && updates++);
      separateRegion('a');
      off();
      expect(updates).toBe(1);
    });
    resetEach();
    step('a move and the layout it causes are one undo step; redo restores the same layout', () => {
      addShapes([region('a', 0), region('b', 2), region('c', 3)], { history: false });
      const initial = useCanvasStore.getState().shapes;
      // "Drop" a onto b's line, then separate – one transaction.
      transaction(() => {
        updateShapes({ a: { y: lineY(2) - 22 } });
        separateRegion('a');
      });
      const after = useCanvasStore.getState().shapes;
      expect(lineOf(after.a)).toBe(2);
      expect(lineOf(after.b)).toBe(3);
      expect(lineOf(after.c)).toBe(4);
      undo();
      const undone = useCanvasStore.getState().shapes;
      expect(['a', 'b', 'c'].map((id) => undone[id].y)).toEqual(['a', 'b', 'c'].map((id) => initial[id].y));
      redo();
      const redone = useCanvasStore.getState().shapes;
      expect(['a', 'b', 'c'].map((id) => redone[id].y)).toEqual(['a', 'b', 'c'].map((id) => after[id].y));
    });
    resetEach();
    step('500-region worksheet: one region growing re-flows everything below quickly, in one update', () => {
      const list: Shape[] = [];
      for (let i = 0; i < 500; i++) list.push(region(`r${i}`, i * 2));
      useAppStore.getState().updateSettings({ pages: 45 });
      addShapes(list, { history: false });
      updateShapes({ r0: { props: { h: 140 } } }, { history: false }); // grew by ~3 lines
      let updates = 0;
      const off = useCanvasStore.subscribe((s, p) => s.shapes !== p.shapes && updates++);
      const t0 = performance.now();
      separateRegion('r0');
      const ms = performance.now() - t0;
      off();
      console.log(`[perf] separation, 500 regions: ${ms.toFixed(1)} ms`);
      expect(updates).toBe(1);
      const sh = useCanvasStore.getState().shapes;
      expect(lineOf(sh.r1)).toBeGreaterThan(2);
      expect(ms).toBeLessThan(2000);
    });
  });
});

describe('baseline snapping', () => {
  it('snaps baselines to major lines by default and to every grid line when chosen', () => {
    addShapes([{ ...region('m', 2), y: 60 + 40 * 3 - 22 + 13 }], { history: false }); // 13 px below a major line
    const base = () => {
      const s = useCanvasStore.getState().shapes.m;
      return s.y + (s.type === 'math' ? s.props.baseline! : 0) - 60;
    };
    expect(base() % 40).toBe(0);
    useAppStore.getState().updateSettings({ baselineSnap: 'minor' });
    updateShapes({ m: { y: 60 + 40 * 3 - 22 + 13 } }, { history: false });
    expect(base() % 10).toBe(0);
    expect(base() % 40).not.toBe(0); // landed on a minor line
  });
});
