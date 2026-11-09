/**
 * Changing the unit of a math region. For an input (a definition from literals
 * only, e.g. f_ck := 35 MPa) the literal is rewritten with the same value in the
 * new unit (35 MPa → 5.07632… ksi); for any other region it sets the result unit.
 */
import { engine } from '../store/calculationStore';
import type { ShapePatch } from './model/canvasStore';
import type { Shape } from './model/types';

/** Patch for one shape; rejects (with an engineer-readable message) for an unknown or mismatching unit. */
export async function unitPatch(shape: Shape, unit: string): Promise<ShapePatch | null> {
  if (shape.type !== 'math') return null;
  const v = unit.trim();
  if (v) {
    let latex: string | null;
    try {
      await engine.idle();
      latex = await engine.inputInUnit(shape.id, v);
    } catch (e) {
      throw new Error((e as Error).message.replace(/^Cannot display/, 'Cannot convert'));
    }
    if (latex !== null) return { props: { latex, displayUnit: v } };
  }
  return { props: { displayUnit: v } };
}
