/** What each registered shortcut (app/shortcuts.ts, by id) does. */
import { setParagraphStyle } from '../canvas/headings';
import type { HeadingLevel } from '../canvas/model/types';
import { copySelection, cutSelection, duplicateSelection, groupSelection, ungroupSelection } from '../canvas/canvasActions';
import { redo, selectAll, undo, useCanvasStore } from '../canvas/model/canvasStore';
import { useAppStore } from '../store/appStore';
import { commands } from './commands';
import type { ShortcutAction } from './shortcuts';

const heading = (level: HeadingLevel): ShortcutAction => () => {
  const st = useCanvasStore.getState();
  const ids = st.editingId ? [st.editingId] : st.selection;
  if (!ids.some((id) => st.shapes[id]?.type === 'text')) return false;
  setParagraphStyle(ids, level);
};

export const SHORTCUT_ACTIONS: Record<string, ShortcutAction> = {
  save: () => void commands.save(),
  open: () => commands.open(),
  'save-file': () => void commands.saveAs(),
  'open-file': () => void commands.openFile(),
  print: () => void commands.exportPdf(),
  calculate: () => commands.calculateAll(),
  help: () => useAppStore.getState().openHelp(),
  undo: () => undo(),
  redo: () => redo(),
  copy: () => void copySelection(),
  cut: () => void cutSelection(),
  duplicate: () => duplicateSelection(),
  'select-all': () => selectAll(),
  group: () => groupSelection(),
  ungroup: () => ungroupSelection(),
  'blank-page': () => commands.insertBlankPage(),
  'page-break': () => commands.pageBreak(),
  'heading-0': heading(0),
  'heading-1': heading(1),
  'heading-2': heading(2),
  'heading-3': heading(3),
};
