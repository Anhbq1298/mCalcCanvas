import type { Shape } from '../canvas/model/types';
import { optimizeTemplateLayout } from '../canvas/templateLayout';
import catalog from './templateMetrics.json';

/** Stored browser metrics keep template loading stable before the first worker result. */
export function compactTemplate(id: keyof typeof catalog, shapes: Shape[]): Shape[] {
  const metrics = catalog[id] as Record<string, number[]>;
  const measured = shapes.map(s => {
    if (s.type !== 'math' && s.type !== 'text') return s;
    const size = metrics[s.type === 'math' ? s.props.latex : s.props.html];
    if (!size) return s;
    return { ...s, props: { ...s.props, h: size[1], ...(s.type === 'math' ? { w: size[0], baseline: size[2] } : {}) } } as Shape;
  });
  return optimizeTemplateLayout(measured).shapes;
}
