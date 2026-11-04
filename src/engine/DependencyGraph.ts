/**
 * Dependency graph between calculation regions, keyed by the *defining
 * region* rather than by variable name.
 *
 * - `definesById` / `definersByName`: which region defines which name (a
 *   name may have several definers; reading order picks one per reference).
 * - `depsById` / `dependentsById`: resolved edges "region R uses the value
 *   of definition D" – exactly one definer per referenced name, so two
 *   definitions of `x` feed two independent sets of regions.
 * - `candidatesById` / `watchersByName`: every name whose definitions could
 *   change how a region resolves its identifiers (the whole identifier and,
 *   for letter runs, each letter). When a definition of such a name is
 *   added, removed, renamed or moved, the region is re-resolved.
 *
 * Canvas coordinates play no part here; ordering is supplied by the engine.
 */
export class DependencyGraph {
  private definesById = new Map<string, string>();
  private definersByName = new Map<string, Set<string>>();
  private depsById = new Map<string, Map<string, string>>();
  private dependentsById = new Map<string, Set<string>>();
  private candidatesById = new Map<string, Set<string>>();
  private watchersByName = new Map<string, Set<string>>();
  private nodes = new Set<string>();

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  ids(): string[] {
    return [...this.nodes];
  }

  /** Register a region and the name it defines (undefined for non-definitions). */
  setDefinition(id: string, name: string | undefined): void {
    this.nodes.add(id);
    const old = this.definesById.get(id);
    if (old === name) return;
    if (old) removeFrom(this.definersByName, old, id);
    if (name) {
      this.definesById.set(id, name);
      addTo(this.definersByName, name, id);
    } else {
      this.definesById.delete(id);
    }
  }

  /** Store a region's resolved dependencies (name → defining region) and the names it watches. */
  setResolution(id: string, deps: Map<string, string>, candidates: Set<string>): void {
    this.nodes.add(id);
    const oldDeps = this.depsById.get(id);
    if (oldDeps) for (const d of oldDeps.values()) removeFrom(this.dependentsById, d, id);
    this.depsById.set(id, deps);
    for (const d of deps.values()) addTo(this.dependentsById, d, id);

    const oldCands = this.candidatesById.get(id);
    if (oldCands) for (const n of oldCands) removeFrom(this.watchersByName, n, id);
    this.candidatesById.set(id, candidates);
    for (const n of candidates) addTo(this.watchersByName, n, id);
  }

  removeNode(id: string): void {
    const def = this.definesById.get(id);
    if (def) removeFrom(this.definersByName, def, id);
    this.definesById.delete(id);
    const deps = this.depsById.get(id);
    if (deps) for (const d of deps.values()) removeFrom(this.dependentsById, d, id);
    this.depsById.delete(id);
    const cands = this.candidatesById.get(id);
    if (cands) for (const n of cands) removeFrom(this.watchersByName, n, id);
    this.candidatesById.delete(id);
    // Incoming edges (regions that used this definition) are re-resolved by the engine.
    this.nodes.delete(id);
  }

  definesOf(id: string): string | undefined {
    return this.definesById.get(id);
  }

  /** Names this region uses as variables (resolved). */
  refsOf(id: string): Set<string> {
    return new Set(this.depsById.get(id)?.keys() ?? []);
  }

  /** Resolved name → defining region for this region. */
  depsOf(id: string): ReadonlyMap<string, string> {
    return this.depsById.get(id) ?? EMPTY;
  }

  definers(name: string): string[] {
    return [...(this.definersByName.get(name) ?? [])];
  }

  isDefined(name: string): boolean {
    return (this.definersByName.get(name)?.size ?? 0) > 0;
  }

  /** Regions whose identifier resolution depends on definitions of `name`. */
  watchers(name: string): string[] {
    return [...(this.watchersByName.get(name) ?? [])];
  }

  /** Regions that directly use the value of definition `id`. */
  dependents(id: string): string[] {
    return [...(this.dependentsById.get(id) ?? [])];
  }

  /** The seeds plus every region that transitively uses one of their values. */
  affected(seedIds: Iterable<string>): Set<string> {
    const out = new Set<string>();
    const queue: string[] = [];
    const push = (id: string) => {
      if (!out.has(id)) {
        out.add(id);
        queue.push(id);
      }
    };
    for (const id of seedIds) push(id);
    while (queue.length) {
      const id = queue.pop()!;
      for (const r of this.dependentsById.get(id) ?? []) push(r);
    }
    return out;
  }
}

const EMPTY: ReadonlyMap<string, string> = new Map();

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
