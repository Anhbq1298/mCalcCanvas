import { useEffect, useRef } from 'react';
import { separateRegion } from '../canvasActions';

/** When editing of a region ends, push any region it now overlaps down (after layout has settled). */
export function useSeparateAfterEditing(id: string, editing: boolean, isStatic: boolean): void {
  const was = useRef(editing);
  useEffect(() => {
    if (was.current && !editing && !isStatic) {
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => separateRegion(id)));
      was.current = editing;
      return () => cancelAnimationFrame(raf);
    }
    was.current = editing;
  }, [id, editing, isStatic]);
}
