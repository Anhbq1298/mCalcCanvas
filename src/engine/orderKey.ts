/**
 * Reading-order key of a region. Keys are compared lexicographically
 * element by element (numbers numerically, strings by code unit; a number
 * sorts before a string, a shorter key before its extensions). The canvas
 * passes [page, y, x, id]: top to bottom, then left to right, with the id
 * as a deterministic tie-break. The engine itself knows nothing about
 * geometry – it only compares keys.
 */
export type OrderKey = readonly (number | string)[];

export function compareOrderKeys(a: OrderKey, b: OrderKey): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1;
    if (typeof x === 'number') return -1;
    if (typeof y === 'number') return 1;
    return x < y ? -1 : 1;
  }
  return a.length - b.length;
}

export function orderKeysEqual(a: OrderKey | undefined, b: OrderKey | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return compareOrderKeys(a, b) === 0;
}

