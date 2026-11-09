/**
 * Serialised, revision-checked saving.
 *
 * Every document mutation bumps `revision`. A save takes a snapshot of the
 * revision current when it starts and writes it; saves never run in
 * parallel, so an older snapshot can never land after a newer one. The
 * document is reported "saved" only when the saved revision equals the
 * current revision – edits made while a save was running keep it "dirty"
 * and are saved next. A failed save keeps the dirty state.
 */
import type { CalculationDocument } from './DocumentTypes';
import type { DocumentRepository } from './DocumentRepository';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export interface SaveCoordinatorOptions {
  repository: Pick<DocumentRepository, 'put' | 'setLastOpenedId'>;
  /** Snapshot of the document being edited (taken when a save starts). */
  snapshot(): CalculationDocument;
  onState(state: SaveState): void;
  onSaved?(doc: CalculationDocument): void;
  onError?(error: unknown): void;
  /** Autosave delay after the last change (ms). */
  delay?: number;
}

export class SaveCoordinator {
  private revision = 0;
  private savedRevision = 0;
  private chain: Promise<void> = Promise.resolve();
  private running = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failed = false;
  private readonly opts: Required<Pick<SaveCoordinatorOptions, 'delay'>> & SaveCoordinatorOptions;

  constructor(opts: SaveCoordinatorOptions) {
    this.opts = { delay: 800, ...opts };
  }

  /** True while there are changes not yet confirmed as written. */
  get dirty(): boolean {
    return this.savedRevision !== this.revision;
  }

  get currentRevision(): number {
    return this.revision;
  }

  get lastSavedRevision(): number {
    return this.savedRevision;
  }

  /** Record a change and schedule an autosave. */
  markDirty(): void {
    this.revision++;
    this.failed = false;
    this.opts.onState(this.running ? 'saving' : 'dirty');
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.opts.delay);
  }

  /**
   * Save the latest revision (if needed) after any save already running.
   * Resolves when everything up to the revision current at call time is
   * written, or the attempt failed. `force` (an explicit Save) writes even
   * if nothing changed and keeps a version snapshot.
   */
  flush(force = false): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const run = async () => {
      if (!force && !this.dirty) return;
      const rev = this.revision;
      const doc = this.opts.snapshot();
      this.running++;
      this.opts.onState('saving');
      try {
        await this.opts.repository.put(doc, { kind: force ? 'manual' : 'auto' });
        await this.opts.repository.setLastOpenedId(doc.id);
        this.savedRevision = Math.max(this.savedRevision, rev);
        this.opts.onSaved?.(doc);
      } catch (e) {
        this.failed = true;
        this.opts.onError?.(e);
      } finally {
        this.running--;
      }
      if (this.failed) this.opts.onState('error');
      else if (this.dirty) {
        // Edited while saving: still dirty; save again shortly.
        this.opts.onState('dirty');
        if (!this.timer) this.schedule();
      } else if (!this.running) this.opts.onState('saved');
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => {});
    return next;
  }

  /**
   * A different document was loaded: forget the old revision history. Call
   * flush() first so pending edits of the previous document are written.
   */
  reset(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.savedRevision = this.revision;
    this.failed = false;
    this.opts.onState('saved');
  }
}
