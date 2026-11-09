import { describe, expect, it } from 'vitest';
import { step } from '../step';
import { optimizeTemplateLayout } from '../../canvas/templateLayout';
import { flowColumnVectors } from '../../math/MathFormatter';
import { DEFAULT_MATH_PROPS, DEFAULT_TEXT_PROPS, type Shape } from '../../canvas/model/types';

const math = (id: string, x: number, y: number, w = 180, h = 40): Shape => ({ id, type: 'math', x, y, props: { ...DEFAULT_MATH_PROPS, latex: id, w, h } });
describe('template and print layout', () => {
  it('packs measured rows without losing content, order or editable geometry', () => {
    step('removes old page gaps and keeps heading with its content without mutating the worksheet', () => {
      const heading: Shape = { id: 'h', type: 'text', x: 76, y: 900, props: { ...DEFAULT_TEXT_PROPS, html: 'Section', heading: 2, w: 600, h: 24 } };
      const source = [math('a', 76, 80), heading, math('b', 76, 1250), math('c', 330, 1250)];
      const copy = structuredClone(source);
      const plan = optimizeTemplateLayout(source, { mode: 'print' });
      expect(source).toEqual(copy);
      expect(plan.pages).toBe(1);
      expect(plan.issues).toEqual([]);
      expect(plan.shapes.map(s => s.id)).toEqual(source.map(s => s.id));
      expect(plan.shapes[1].y + 24).toBeLessThan(plan.shapes[2].y);
      expect(plan.shapes[2].y).toBe(plan.shapes[3].y);
      expect(plan.shapes.every(s => s.x >= 76 && s.y >= 60)).toBe(true);
    });
    step('reflows colliding columns into intact rows on a short landscape sheet', () => {
      const plan = optimizeTemplateLayout([math('a', 76, 80, 320, 380), math('b', 280, 80, 320, 380)], { width: 1123, height: 794, margins: { left: 76, right: 76, top: 60, bottom: 60 } });
      expect(plan.issues).toEqual([]);
      const [a, b] = plan.shapes;
      expect(a.x + 320).toBeLessThan(b.x);
      expect(a.y).toBe(b.y);
    });
    step('long numeric columns retain every entry and display explicit continuation ranges', () => {
      const values = Array.from({ length: 55 }, (_, i) => String(i + 1));
      const latex = `v=\\begin{bmatrix}${values.join('\\\\')}\\end{bmatrix}`;
      const flowed = flowColumnVectors(latex);
      expect(flowed).toContain('1:28');
      expect(flowed).toContain('29:55');
      expect(flowed.match(/\\begin\{bmatrix\}/g)).toHaveLength(2);
      expect(flowed).toContain(values.slice(28).join('\\\\'));
      expect(flowColumnVectors('\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}')).toBe('\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}');
    });
    step('a table caption follows its grouped data onto the next page', () => {
      const caption: Shape = { id: 'caption', groupId: 'table', type: 'text', x: 76, y: 1200, props: { ...DEFAULT_TEXT_PROPS, html: 'Bar table', w: 300, h: 24 } };
      const table = { ...math('table', 76, 1230, 300, 350), groupId: 'table' };
      const plan = optimizeTemplateLayout([math('previous', 76, 60, 600, 850), caption, table]);
      const [, title, data] = plan.shapes;
      expect(Math.floor(title.y / 1171)).toBe(Math.floor(data.y / 1171));
      expect(data.y - title.y).toBe(30);
      expect(plan.issues).toEqual([]);
    });
  });
});
