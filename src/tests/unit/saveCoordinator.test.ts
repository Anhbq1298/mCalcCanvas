import { describe, expect, it } from 'vitest';
import { SaveCoordinator, type SaveState } from '../../documents/SaveCoordinator';
import type { CalculationDocument } from '../../documents/DocumentTypes';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A repository whose writes take a controllable time, recording the order they land. */
function harness(writeMs: (n: number) => number) {
  let content = 'A';
  let docId = 'doc-1';
  const landed: string[] = [];
  const states: SaveState[] = [];
  let failNext = false;
  let n = 0;
  const repo = {
    async put(doc: CalculationDocument) {
      const i = n++;
      if (failNext) {
        failNext = false;
        throw new Error('quota');
      }
      await sleep(writeMs(i));
      landed.push(`${doc.id}:${doc.title}`);
    },
    async setLastOpenedId() {},
  };
  const coord = new SaveCoordinator({
    repository: repo,
    snapshot: () => ({ id: docId, title: content } as CalculationDocument),
    onState: (s) => states.push(s),
    delay: 5,
  });
  return {
    coord,
    landed,
    states,
    edit(v: string) {
      content = v;
      coord.markDirty();
    },
    switchTo(id: string, v: string) {
      docId = id;
      content = v;
    },
    failOnce() {
      failNext = true;
    },
  };
}

describe('SaveCoordinator (autosave reliability)', () => {
  it('never lets an older snapshot land after a newer one', async () => {
    // First write is slow, second fast: without serialisation B would land before A.
    const h = harness((i) => (i === 0 ? 40 : 1));
    h.edit('A');
    const first = h.coord.flush();
    await sleep(2); // A's write has started
    h.edit('B');
    const second = h.coord.flush();
    await Promise.all([first, second]);
    expect(h.landed).toEqual(['doc-1:A', 'doc-1:B']);
    expect(h.coord.dirty).toBe(false);
  });

  it('stays dirty when edits arrive during a save, then saves them', async () => {
    const h = harness(() => 30);
    h.edit('A');
    const p = h.coord.flush();
    await sleep(5);
    h.edit('B'); // while A is being written
    await p;
    expect(h.coord.dirty).toBe(true);
    expect(h.states.at(-1)).toBe('dirty'); // not "saved"
    await sleep(80); // the scheduled follow-up save
    expect(h.landed).toEqual(['doc-1:A', 'doc-1:B']);
    expect(h.coord.dirty).toBe(false);
    expect(h.states.at(-1)).toBe('saved');
  });

  it('a failed save keeps the changes dirty and reports an error', async () => {
    const h = harness(() => 1);
    h.edit('A');
    h.failOnce();
    await h.coord.flush();
    expect(h.coord.dirty).toBe(true);
    expect(h.states.at(-1)).toBe('error');
    await h.coord.flush();
    expect(h.coord.dirty).toBe(false);
    expect(h.landed).toEqual(['doc-1:A']);
  });

  it('switching documents writes the pending edits of the previous one first', async () => {
    const h = harness(() => 5);
    h.edit('last edit of doc 1'); // autosave still pending (debounced)
    await h.coord.flush(); // what the controller does before switching
    h.switchTo('doc-2', 'new doc');
    h.coord.reset();
    await h.coord.flush(true);
    expect(h.landed).toEqual(['doc-1:last edit of doc 1', 'doc-2:new doc']);
  });

  it('only the latest revision counts as saved', async () => {
    const h = harness(() => 10);
    h.edit('A');
    h.edit('B');
    h.edit('C');
    await h.coord.flush();
    expect(h.landed).toEqual(['doc-1:C']); // one write of the latest snapshot
    expect(h.coord.lastSavedRevision).toBe(h.coord.currentRevision);
  });
});
