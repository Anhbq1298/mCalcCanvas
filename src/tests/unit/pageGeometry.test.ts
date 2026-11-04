import { describe, expect, it } from 'vitest';
import { A4, PAGE_GAP, pageCount, shapesOnPage } from '../../export/pageGeometry';
import { DEFAULT_MATH_PROPS, type Shape } from '../../canvas/model/types';

const rect = (id: string, y: number, h: number): Shape => ({ id, type: 'rect', x: 100, y, props: { w: 100, h, stroke: '#000000', strokeWidth: 1 } });

describe('PDF page assignment', () => {
  it('prints every shape on exactly one page, in page order', () => {
    const stride = A4.h + PAGE_GAP;
    const shapes: Shape[] = [
      rect('top', 100, 50),
      rect('crossing', A4.h - 40, 200), // starts on page 1, crosses into the gap and page 2
      rect('p2', stride + 100, 50),
      { id: 'm', type: 'math', x: 100, y: 2 * stride + 10, props: { ...DEFAULT_MATH_PROPS, latex: 'x' } },
    ];
    const n = pageCount(shapes, 'portrait');
    expect(n).toBe(3);
    const pages = Array.from({ length: n }, (_, i) => shapesOnPage(shapes, i, 'portrait').map((s) => s.id));
    expect(pages).toEqual([['top', 'crossing'], ['p2'], ['m']]);
    expect(pages.flat()).toHaveLength(shapes.length);
  });
});
