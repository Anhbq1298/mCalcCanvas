/**
 * The MathLive editor currently open on the canvas, so ribbon palettes
 * (operators, Greek symbols, constants, units) can insert into it.
 */
import type { MathfieldElement } from 'mathlive';
import { leaveLiteralSubscript } from './mathcadKeys';

let active: { mf: MathfieldElement; changed: () => void } | null = null;

export function setActiveMathEditor(editor: { mf: MathfieldElement; changed: () => void } | null): void {
  active = editor;
}

/** An unmounting field must not disconnect a different field that just took focus. */
export function releaseActiveMathEditor(mf: MathfieldElement): void {
  if (active?.mf !== mf) return;
  active = null;
  replayKey = null;
}

/** Insert LaTeX at the caret of the open editor. Returns false if none is open. */
export function insertIntoActiveMath(latex: string): boolean {
  if (!active || !active.mf.isConnected) return false;
  active.mf.focus();
  if (/^(?:[+*/=<>^:-]|#@\^|\\(?:cdot|times|div|frac|sqrt|leq?|geq?|neq?|equiv|coloneq|land|lor)\b)/.test(latex)) leaveLiteralSubscript(active.mf);
  active.mf.insert(latex, { selectionMode: 'placeholder', focus: true });
  active.changed();
  return true;
}

/** Literal LaTeX for a new region from a palette template ("#?" → empty placeholder). */
export function templateToLatex(latex: string): string {
  return latex.replace(/#[?@0-9]/g, '\\placeholder{}');
}

/**
 * Keystrokes that arrive before the new editor has focus (MathLive needs a
 * moment to initialise) are queued and replayed, so fast typists lose nothing.
 */
const pending: string[] = [];

export function queueKey(key: string): void {
  if (active && active.mf.isConnected && replayKey) {
    active.mf.focus();
    replay(key);
    return;
  }
  pending.push(key);
}

let replayKey: ((key: string) => void) | null = null;

/** Registered by the editor: how to apply one key (Mathcad handling, then MathLive). */
export function setKeyReplayer(fn: ((key: string) => void) | null): void {
  replayKey = fn;
}

function replay(key: string) {
  replayKey?.(key);
}

export function flushPendingKeys(): void {
  while (pending.length && replayKey) replayKey(pending.shift()!);
  pending.length = 0;
}
