import { create } from 'zustand';
import type { Box } from '../model/types';

/** Transient editor geometry; never saved or sent to the calculation engine. */
export const useMathEditingBounds = create<{ bounds: Record<string, Box> }>(() => ({ bounds: {} }));

export function setMathEditingBounds(id: string, box: Box | null): void {
  useMathEditingBounds.setState(state => {
    const previous = state.bounds[id];
    if (box && previous && previous.x === box.x && previous.y === box.y && previous.w === box.w && previous.h === box.h) return state;
    if (!box && !previous) return state;
    const bounds = { ...state.bounds };
    if (box) bounds[id] = box;
    else delete bounds[id];
    return { bounds };
  });
}
