/**
 * Keyboard shortcuts: one registry for executing chords, the Help center, tooltips
 * and conflict checks. Entries with `chords` are executed by useCanvasKeyboard
 * through SHORTCUT_ACTIONS (app/shortcutActions.ts, same ids; global: also while
 * typing in an editor; worksheet: only on the canvas). Entries without chords
 * document keys handled elsewhere (the math editor, the canvas pointer and the
 * + cross), so the Help lists only what really works. No app imports here.
 */
export type ShortcutScope = 'global' | 'worksheet' | 'math' | 'text';

export const SHORTCUT_CATEGORIES = ['Regions', 'Math and Text', 'Constants', 'Operators', 'Plots', 'Matrices and Tables', 'General'] as const;
export type ShortcutCategory = (typeof SHORTCUT_CATEGORIES)[number];

/** A key chord. `key` is KeyboardEvent.key (lower-cased letters) unless `code` is given. */
export interface Chord {
  key?: string;
  code?: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface ShortcutDefinition {
  id: string;
  category: ShortcutCategory;
  /** Operators are grouped further (Algebra, Comparison, Definition and Evaluation …). */
  group?: string;
  command: string;
  description: string;
  /** Shown as key badges, e.g. ['Ctrl', 'S']; alternatives separated in `alt`. */
  keys: string[];
  scope: ShortcutScope;
  /** Chords this registry executes (absent: handled elsewhere, documented here). */
  chords?: Chord[];
}

/** What a shortcut does; returning false means "not handled here" (the key goes on). */
export type ShortcutAction = (e: KeyboardEvent) => boolean | void;

const MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
export const MOD_LABEL = MAC ? '⌘' : 'Ctrl';

export const SHORTCUTS: ShortcutDefinition[] = [
  // --- General -----------------------------------------------------------
  { id: 'save', category: 'General', command: 'Save', description: 'Save the worksheet in this browser (and to its .mCCV file after Save As)', keys: [MOD_LABEL, 'S'], scope: 'global', chords: [{ key: 's', mod: true }] },
  { id: 'open', category: 'General', command: 'Open', description: 'Open a recent worksheet or a .mCCV file', keys: [MOD_LABEL, 'O'], scope: 'global', chords: [{ key: 'o', mod: true }] },
  { id: 'save-file', category: 'General', command: 'Save As', description: 'Save the worksheet as a .mCCV file', keys: [MOD_LABEL, 'Shift', 'S'], scope: 'global', chords: [{ key: 's', mod: true, shift: true }] },
  { id: 'open-file', category: 'General', command: 'Open file', description: 'Open a .mCCV file from your computer', keys: [MOD_LABEL, 'Shift', 'O'], scope: 'global', chords: [{ key: 'o', mod: true, shift: true }] },
  { id: 'print', category: 'General', command: 'Print / PDF', description: 'Print or save as PDF with the page setup', keys: [MOD_LABEL, 'P'], scope: 'global', chords: [{ key: 'p', mod: true }] },
  { id: 'calculate', category: 'General', command: 'Calculate all', description: 'Recalculate the whole worksheet', keys: ['F9'], scope: 'global', chords: [{ key: 'F9' }] },
  { id: 'help', category: 'General', command: 'Help', description: 'Open the Help center', keys: ['F1'], scope: 'global', chords: [{ key: 'F1' }] },
  { id: 'undo', category: 'General', command: 'Undo', description: 'Undo the last change', keys: [MOD_LABEL, 'Z'], scope: 'worksheet', chords: [{ key: 'z', mod: true }] },
  { id: 'redo', category: 'General', command: 'Redo', description: 'Redo', keys: [MOD_LABEL, 'Y'], scope: 'worksheet', chords: [{ key: 'y', mod: true }, { key: 'z', mod: true, shift: true }] },
  { id: 'zoom', category: 'General', command: 'Zoom / pan', description: 'Zoom with Ctrl + mouse wheel; pan with Space + drag or the hand tool', keys: [MOD_LABEL, 'Wheel'], scope: 'worksheet' },

  // --- Regions -------------------------------------------------------------
  { id: 'new-math', category: 'Regions', command: 'Insert math region', description: 'Start typing on an empty spot: a math region is created at the + cross', keys: ['Type'], scope: 'worksheet' },
  { id: 'new-text', category: 'Regions', command: 'Insert text region', description: 'Type a double quote on an empty spot (Ctrl+T belongs to the browser)', keys: ['"'], scope: 'worksheet' },
  { id: 'edit', category: 'Regions', command: 'Edit region', description: 'Edit the selected region (double-click also works)', keys: ['Enter'], scope: 'worksheet' },
  { id: 'finish', category: 'Regions', command: 'Finish region', description: 'Leave the region being edited', keys: ['Esc'], scope: 'math' },
  { id: 'copy', category: 'Regions', command: 'Copy', description: 'Copy the selected regions', keys: [MOD_LABEL, 'C'], scope: 'worksheet', chords: [{ key: 'c', mod: true }] },
  { id: 'cut', category: 'Regions', command: 'Cut', description: 'Cut the selected regions', keys: [MOD_LABEL, 'X'], scope: 'worksheet', chords: [{ key: 'x', mod: true }] },
  { id: 'paste', category: 'Regions', command: 'Paste', description: 'Paste regions (or plain text as a text region)', keys: [MOD_LABEL, 'V'], scope: 'worksheet' },
  { id: 'duplicate', category: 'Regions', command: 'Duplicate', description: 'Duplicate the selected regions', keys: [MOD_LABEL, 'D'], scope: 'worksheet', chords: [{ key: 'd', mod: true }] },
  { id: 'select-all', category: 'Regions', command: 'Select all', description: 'Select every region', keys: [MOD_LABEL, 'A'], scope: 'worksheet', chords: [{ key: 'a', mod: true }] },
  { id: 'group', category: 'Regions', command: 'Group', description: 'Group the selected regions', keys: [MOD_LABEL, 'G'], scope: 'worksheet', chords: [{ key: 'g', mod: true }] },
  { id: 'ungroup', category: 'Regions', command: 'Ungroup', description: 'Ungroup the selected regions', keys: [MOD_LABEL, 'Shift', 'G'], scope: 'worksheet', chords: [{ key: 'g', mod: true, shift: true }] },
  { id: 'delete', category: 'Regions', command: 'Delete', description: 'Delete the selection; lines it leaves empty close up', keys: ['Delete'], scope: 'worksheet' },
  { id: 'delete-line', category: 'Regions', command: 'Delete blank line', description: 'With the + cross on a blank line: remove it (Backspace removes the line above)', keys: ['Delete'], scope: 'worksheet' },
  { id: 'insert-line', category: 'Regions', command: 'Insert line', description: 'With the + cross on the page: insert a line, pushing what is below down', keys: ['Enter'], scope: 'worksheet' },
  { id: 'nudge', category: 'Regions', command: 'Move', description: 'Move the selection one grid square / line (Shift: further); without a selection, move the + cross', keys: ['Arrows'], scope: 'worksheet' },
  { id: 'blank-page', category: 'Regions', command: 'Insert blank page', description: 'Insert a blank page after the current one', keys: [MOD_LABEL, 'Enter'], scope: 'global', chords: [{ key: 'Enter', mod: true }] },
  { id: 'page-break', category: 'Regions', command: 'Page break', description: 'Start a new page at the + cross (or above the selection)', keys: [MOD_LABEL, 'Shift', 'Enter'], scope: 'worksheet', chords: [{ key: 'Enter', mod: true, shift: true }] },

  // --- Math and Text -------------------------------------------------------
  { id: 'heading-0', category: 'Math and Text', command: 'Normal text', description: 'Paragraph style Normal for the selected text', keys: [MOD_LABEL, 'Alt', '0'], scope: 'global', chords: [{ code: 'Digit0', mod: true, alt: true }] },
  { id: 'heading-1', category: 'Math and Text', command: 'Heading 1', description: 'Paragraph style Heading 1', keys: [MOD_LABEL, 'Alt', '1'], scope: 'global', chords: [{ code: 'Digit1', mod: true, alt: true }] },
  { id: 'heading-2', category: 'Math and Text', command: 'Heading 2', description: 'Paragraph style Heading 2', keys: [MOD_LABEL, 'Alt', '2'], scope: 'global', chords: [{ code: 'Digit2', mod: true, alt: true }] },
  { id: 'heading-3', category: 'Math and Text', command: 'Heading 3', description: 'Paragraph style Heading 3', keys: [MOD_LABEL, 'Alt', '3'], scope: 'global', chords: [{ code: 'Digit3', mod: true, alt: true }] },
  { id: 'bold', category: 'Math and Text', command: 'Bold / italic / underline', description: 'In a text region (browser editing)', keys: [MOD_LABEL, 'B / I / U'], scope: 'text' },
  { id: 'greek', category: 'Math and Text', command: 'Greek letter', description: 'Greek ↔ Latin for the letter before the cursor (a → α)', keys: [MOD_LABEL, 'G'], scope: 'math' },
  { id: 'subscript', category: 'Math and Text', command: 'Literal subscript', description: 'After a name: M.Ed → M_Ed', keys: ['.'], scope: 'math' },

  // --- Constants -------------------------------------------------------------
  { id: 'pi', category: 'Constants', command: 'π', description: 'Insert π', keys: [MOD_LABEL, 'Shift', 'P'], scope: 'math' },

  // --- Operators -------------------------------------------------------------
  { id: 'define', category: 'Operators', group: 'Definition and Evaluation', command: 'Definition ≔', description: 'Define a variable or function (typing := also works)', keys: [':'], scope: 'math' },
  { id: 'evaluate', category: 'Operators', group: 'Definition and Evaluation', command: 'Evaluate =', description: 'Show the value of the whole region', keys: ['='], scope: 'math' },
  { id: 'fraction', category: 'Operators', group: 'Algebra', command: 'Fraction / exponent', description: 'Division as a fraction; power', keys: ['/', '^'], scope: 'math' },
  { id: 'sqrt', category: 'Operators', group: 'Algebra', command: 'Square root', description: 'Square root', keys: ['\\'], scope: 'math' },
  { id: 'nthroot', category: 'Operators', group: 'Algebra', command: 'Nth root', description: 'Nth root', keys: [MOD_LABEL, '\\'], scope: 'math' },
  { id: 'abs', category: 'Operators', group: 'Algebra', command: 'Absolute value', description: 'Absolute value |x|', keys: ['|'], scope: 'math' },
  { id: 'parens', category: 'Operators', group: 'Algebra', command: 'Parentheses', description: 'Parentheses around the selection', keys: ["'"], scope: 'math' },
  { id: 'le', category: 'Operators', group: 'Comparison', command: '≤ / ≥ / ≠', description: 'Comparison operators (a check shows PASS / FAIL)', keys: [MOD_LABEL, '9 / 0 / 3'], scope: 'math' },
  { id: 'equiv', category: 'Operators', group: 'Comparison', command: 'Boolean equal', description: 'Comparison equal ≡', keys: [MOD_LABEL, '='], scope: 'math' },
  { id: 'range', category: 'Operators', group: 'Vector and Matrix', command: 'Range', description: 'Range i := 0..n−1 (also a, a+Δ..b)', keys: [';'], scope: 'math' },
  { id: 'if', category: 'Operators', group: 'Programming', command: 'if block', description: 'Insert an if / else if / else block from the Operators palette', keys: ['Palette'], scope: 'math' },

  // --- Plots / Matrices and Tables -------------------------------------------------
  { id: 'graph', category: 'Plots', command: 'X-Y graph', description: 'Insert an X-Y graph from the toolbar (no keyboard shortcut)', keys: ['Toolbar'], scope: 'worksheet' },
  { id: 'array', category: 'Matrices and Tables', command: 'Array display', description: 'Double-click “…” in an array result to show every entry', keys: ['Double-click'], scope: 'worksheet' },
];

/** Shortcut display, e.g. "Ctrl+Shift+S". */
export const keyLabel = (d: ShortcutDefinition): string => d.keys.join('+');

/** The tooltip suffix for a command, e.g. "Save (Ctrl+S)". */
export function withShortcut(label: string, id: string): string {
  const d = SHORTCUTS.find((s) => s.id === id);
  return d ? `${label} (${keyLabel(d)})` : label;
}

function matches(c: Chord, e: KeyboardEvent): boolean {
  const mod = e.ctrlKey || e.metaKey;
  if (!!c.mod !== mod || !!c.shift !== e.shiftKey || !!c.alt !== e.altKey) return false;
  if (c.code) return e.code === c.code;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return key === c.key;
}

/** The registered shortcut for this key event in this scope (global first). */
export function findShortcut(e: KeyboardEvent, scope: 'global' | 'worksheet'): ShortcutDefinition | undefined {
  return SHORTCUTS.find((d) => d.scope === scope && d.chords?.some((c) => matches(c, e)));
}

/** Run the matching shortcut; true when it was handled (the browser default is then prevented). */
export function runShortcut(e: KeyboardEvent, scope: 'global' | 'worksheet', actions: Record<string, ShortcutAction>): boolean {
  const d = findShortcut(e, scope);
  const run = d && actions[d.id];
  if (!run || run(e) === false) return false;
  e.preventDefault();
  return true;
}

/** Chords used twice (same keys, overlapping scope): must be empty. */
export function shortcutConflicts(list: ShortcutDefinition[] = SHORTCUTS): string[] {
  const seen = new Map<string, string>();
  const out: string[] = [];
  for (const d of list) {
    for (const c of d.chords ?? []) {
      const sig = `${c.mod ? 'M' : ''}${c.shift ? 'S' : ''}${c.alt ? 'A' : ''}:${c.code ?? c.key}`;
      const prev = seen.get(sig);
      if (prev) out.push(`${prev} / ${d.id} (${sig})`);
      else seen.set(sig, d.id);
    }
  }
  return out;
}

/** Chords the browser keeps for itself: the app documents an alternative instead. */
export const BROWSER_RESERVED = ['Ctrl+T', 'Ctrl+W', 'Ctrl+Shift+T', 'Ctrl+N', 'Ctrl+Tab'];
