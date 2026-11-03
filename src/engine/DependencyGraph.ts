/**
 * Name-based dependency graph between calculation regions.
 *
 * Edges are "region R references variable X" and "region D defines X".
 * Canvas coordinates play no part: order is purely topological.
 */
export class DependencyGraph {
  private definesById = new Map<string, string>();
  private refsById = new Map<string, Set<string>>();
  private definersByName = new Map<string, Set<string>>();
  private referrersByName = new Map<string, Set<string>>();

  has(id: string): boolean {
    return this.refsById.has(id);
  }

  setNode(id: string, defines: string | undefined, refs: Set<string>): void {
    this.removeNode(id);
    this.refsById.set(id, refs);
    if (defines) {
      this.definesById.set(id, defines);
      addTo(this.definersByName, defines, id);
    }
    for (const r of refs) addTo(this.referrersByName, r, id);
  }

  setRefs(id: string, refs: Set<string>): void {
    const old = this.refsById.get(id);
    if (old) for (const r of old) removeFrom(this.referrersByName, r, id);
    this.refsById.set(id, refs);
    for (const r of refs) addTo(this.referrersByName, r, id);
  }

  removeNode(id: string): void {
    const def = this.definesById.get(id);
    if (def) removeFrom(this.definersByName, def, id);
    this.definesById.delete(id);
    const refs = this.refsById.get(id);
    if (refs) for (const r of refs) removeFrom(this.referrersByName, r, id);
    this.refsById.delete(id);
  }

  definesOf(id: string): string | undefined {
    return this.definesById.get(id);
  }

  refsOf(id: string): Set<string> {
    return this.refsById.get(id) ?? new Set();
  }

  definers(name: string): string[] {
    return [...(this.definersByName.get(name) ?? [])];
  }

  isDefined(name: string): boolean {
    return (this.definersByName.get(name)?.size ?? 0) > 0;
  }

  definedNames(): Set<string> {
    return new Set([...this.definersByName.entries()].filter(([, s]) => s.size > 0).map(([n]) => n));
  }

  ids(): string[] {
    return [...this.refsById.keys()];
  }

  /**
   * All regions affected by a change to the given regions/names: the seeds,
   * every definer of a touched name, and everything that transitively
   * references them.
   */
  affected(seedIds: Iterable<string>, seedNames: Iterable<string>): Set<string> {
    const out = new Set<string>();
    const queue: string[] = [];
    const visitName = (name: string) => {
      for (const id of this.definersByName.get(name) ?? []) push(id);
      for (const id of this.referrersByName.get(name) ?? []) push(id);
    };
    const push = (id: string) => {
      if (!out.has(id)) {
        out.add(id);
        queue.push(id);
      }
    };
    for (const id of seedIds) push(id);
    for (const n of seedNames) visitName(n);
    while (queue.length) {
      const id = queue.pop()!;
      const def = this.definesById.get(id);
      if (def) for (const r of this.referrersByName.get(def) ?? []) push(r);
    }
    return out;
  }
}

function addTo(map: Map<string, Set<string>>, key: string, id: string): void {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(id);
}

function removeFrom(map: Map<string, Set<string>>, key: string, id: string): void {
  const set = map.get(key);
  if (!set) return;
  set.delete(id);
  if (set.size === 0) map.delete(key);
}
