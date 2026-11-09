/**
 * Lazy rendering: a region far outside the window is drawn as an empty box of
 * its stored size until it first comes near the view (then it stays drawn).
 * Typesetting 170 equations of a long template is the slowest part of opening it.
 */
import { useEffect, useState, type RefObject } from 'react';

const callbacks = new Map<Element, () => void>();
let observer: IntersectionObserver | null = null;

function watch(el: Element, onSeen: () => void): () => void {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const cb = callbacks.get(e.target);
        callbacks.delete(e.target);
        observer!.unobserve(e.target);
        cb?.();
      }
    },
    // Draw a screen or so ahead in every direction (scrolling and zooming out stay smooth).
    { rootMargin: '1200px' },
  );
  callbacks.set(el, onSeen);
  observer.observe(el);
  return () => {
    callbacks.delete(el);
    observer?.unobserve(el);
  };
}

const lazySupported = typeof IntersectionObserver !== 'undefined' && import.meta.env?.MODE !== 'test';

/** True once the element has been near the viewport (always true when `eager`). */
export function useSeen(ref: RefObject<Element | null>, eager: boolean): boolean {
  const [seen, setSeen] = useState(!lazySupported);
  useEffect(() => {
    if (seen || eager || !ref.current) return;
    return watch(ref.current, () => setSeen(true));
  }, [seen, eager, ref]);
  return seen || eager;
}
