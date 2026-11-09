// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { step } from '../step';
/// <reference types="node" />
import fs from 'node:fs';
import { BROWSER_RESERVED, SHORTCUTS, findShortcut, keyLabel, shortcutConflicts } from '../../app/shortcuts';

const ACTION_SOURCE = fs.readFileSync('src/app/shortcutActions.ts', 'utf8');
const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('shortcut registry', () => {
  it('shortcut registry', () => {
    step('no chord is registered twice, ids are unique, every chord has a runner', () => {
      expect(shortcutConflicts()).toEqual([]);
      expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
      // Every chord has an action in shortcutActions.ts (read as text: no app import in a unit test).
      for (const s of SHORTCUTS) if (s.chords?.length) expect(ACTION_SOURCE.includes(`'${s.id}':`) || ACTION_SOURCE.includes(`  ${s.id}:`), s.id).toBe(true);
      expect(shortcutConflicts([...SHORTCUTS, { ...SHORTCUTS[0], id: 'dup' }])).toHaveLength(1);
    });
    step('key events find the registered command in its scope', () => {
      expect(findShortcut(key({ key: 's', ctrlKey: true }), 'global')?.id).toBe('save');
      expect(findShortcut(key({ key: 'S', ctrlKey: true, shiftKey: true }), 'global')?.id).toBe('save-file');
      expect(findShortcut(key({ key: 'F9' }), 'global')?.id).toBe('calculate');
      expect(findShortcut(key({ key: 'F1' }), 'global')?.id).toBe('help');
      expect(findShortcut(key({ key: 'Enter', ctrlKey: true }), 'global')?.id).toBe('blank-page');
      expect(findShortcut(key({ key: 'Enter', ctrlKey: true, shiftKey: true }), 'worksheet')?.id).toBe('page-break');
      expect(findShortcut(key({ key: 'z', metaKey: true }), 'worksheet')?.id).toBe('undo');
      expect(findShortcut(key({ key: 'z', ctrlKey: true }), 'global')).toBeUndefined();
      expect(findShortcut(key({ key: '1', code: 'Digit1', ctrlKey: true, altKey: true }), 'global')?.id).toBe('heading-1');
    });
    step('nothing claims a chord the browser keeps for itself', () => {
      const labels = SHORTCUTS.filter((s) => s.chords).map(keyLabel).map((l) => l.replace('⌘', 'Ctrl'));
      for (const r of BROWSER_RESERVED) expect(labels).not.toContain(r);
    });
  });
});
