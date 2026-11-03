import { Calculator } from 'lucide-react';
import { useState } from 'react';
import { useValue } from 'tldraw';
import { commands } from '../../app/commands';
import { useAppStore } from '../../store/appStore';
import { MenuButton, type MenuEntry } from '../common/MenuButton';

const MOD = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';

export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const editor = useAppStore((s) => s.editor);
  const settings = useAppStore((s) => s.settings);
  const panelOpen = useAppStore((s) => s.panelOpen);
  const title = useAppStore((s) => s.title);
  const saveState = useAppStore((s) => s.saveState);
  const { updateSettings, togglePanel, openDialog } = useAppStore.getState();
  const isGrid = useValue('grid', () => editor?.getInstanceState().isGridMode ?? false, [editor]);
  const isSnap = useValue('snap', () => editor?.user.getIsSnapMode() ?? false, [editor]);

  const menus: Record<string, MenuEntry[]> = {
    File: [
      { label: 'New worksheet', onSelect: () => void commands.newWorksheet(false) },
      { label: 'New from steel beam sample', onSelect: () => void commands.newWorksheet(true) },
      { label: 'Open…', shortcut: `${MOD}O`, onSelect: commands.open },
      { label: 'Save', shortcut: `${MOD}S`, onSelect: () => void commands.save() },
      { type: 'separator' },
      { label: 'Import JSON…', onSelect: () => void commands.importJson() },
      { label: 'Export JSON', onSelect: commands.exportJson },
      { label: 'Export PDF…', onSelect: () => void commands.exportPdf() },
    ],
    Edit: [
      { label: 'Undo', shortcut: `${MOD}Z`, onSelect: commands.undo },
      { label: 'Redo', shortcut: `${MOD}Y`, onSelect: commands.redo },
      { type: 'separator' },
      { label: 'Cut', shortcut: `${MOD}X`, onSelect: commands.cut },
      { label: 'Copy', shortcut: `${MOD}C`, onSelect: commands.copy },
      { label: 'Paste', shortcut: `${MOD}V`, onSelect: commands.paste },
      { label: 'Duplicate', shortcut: `${MOD}D`, onSelect: commands.duplicate },
      { label: 'Delete', shortcut: 'Del', onSelect: commands.deleteSelection },
      { type: 'separator' },
      { label: 'Select all', shortcut: `${MOD}A`, onSelect: commands.selectAll },
      { label: 'Group', shortcut: `${MOD}G`, onSelect: commands.group },
      { label: 'Ungroup', shortcut: `${MOD}⇧G`, onSelect: commands.ungroup },
    ],
    Insert: [
      { label: 'Math region', shortcut: 'M', onSelect: () => commands.insertMath() },
      { label: 'Check (≤ limit)', onSelect: () => commands.insertCheck() },
      { label: 'Text', shortcut: 'T', onSelect: () => commands.setTool('text') },
      { label: 'Image…', onSelect: () => void commands.insertImage() },
      { type: 'separator' },
      { label: 'Line', onSelect: () => commands.setTool('line') },
      { label: 'Rectangle', onSelect: () => commands.setTool('geo') },
      { label: 'Arrow', onSelect: () => commands.setTool('arrow') },
      { label: 'Freehand', onSelect: () => commands.setTool('draw') },
    ],
    Format: [
      { type: 'heading', label: 'Equation display' },
      { label: 'Automatic', onSelect: () => commands.setDisplayMode('auto') },
      { label: 'Formula only', onSelect: () => commands.setDisplayMode('formula') },
      { label: 'Result only', onSelect: () => commands.setDisplayMode('result') },
      { label: 'Formula and result', onSelect: () => commands.setDisplayMode('formulaResult') },
      { label: 'Full calculation', onSelect: () => commands.setDisplayMode('full') },
      { type: 'separator' },
      { label: 'Properties panel', checked: panelOpen, onSelect: () => togglePanel() },
    ],
    Calculate: [
      { label: 'Calculate all', shortcut: 'F9', onSelect: commands.calculateAll },
      { type: 'separator' },
      { type: 'heading', label: 'Unit system' },
      { label: 'SI (kN, m, kPa)', checked: settings.unitSystem === 'SI', onSelect: () => updateSettings({ unitSystem: 'SI' }) },
      { label: 'Imperial (kip, ft, ksi)', checked: settings.unitSystem === 'Imperial', onSelect: () => updateSettings({ unitSystem: 'Imperial' }) },
      { type: 'heading', label: 'Decimal places' },
      ...[1, 2, 3, 4].map((p) => ({
        label: String(p),
        checked: settings.precision === p,
        onSelect: () => updateSettings({ precision: p }),
      })),
    ],
    View: [
      { label: 'Free canvas', checked: settings.canvasMode === 'free', onSelect: () => commands.setCanvasMode('free') },
      { label: 'Page layout (A4)', checked: settings.canvasMode === 'page', onSelect: () => commands.setCanvasMode('page') },
      {
        label: 'Landscape pages',
        checked: settings.pageOrientation === 'landscape',
        onSelect: () => updateSettings({ pageOrientation: settings.pageOrientation === 'landscape' ? 'portrait' : 'landscape' }),
      },
      { type: 'separator' },
      { label: 'Grid', checked: isGrid, onSelect: commands.toggleGrid },
      { label: 'Snap', checked: isSnap, onSelect: commands.toggleSnap },
      { type: 'separator' },
      { label: 'Zoom in', shortcut: `${MOD}+`, onSelect: commands.zoomIn },
      { label: 'Zoom out', shortcut: `${MOD}−`, onSelect: commands.zoomOut },
      { label: 'Zoom to 100%', shortcut: '⇧0', onSelect: commands.resetZoom },
      { label: 'Zoom to fit', shortcut: '⇧1', onSelect: commands.zoomToFit },
    ],
    Help: [
      { label: 'Math syntax & units', onSelect: () => openDialog('syntax') },
      { label: 'Keyboard shortcuts', onSelect: () => openDialog('shortcuts') },
      { type: 'separator' },
      { label: 'About CalcCanvas', onSelect: () => openDialog('about') },
    ],
  };

  return (
    <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-card px-2">
      <div className="mr-2 flex items-center gap-1.5 pl-1 text-[13px] font-semibold text-primary">
        <Calculator size={16} aria-hidden />
        <span>CalcCanvas</span>
      </div>
      <nav role="menubar" aria-label="Main menu" className="flex items-center">
        {Object.entries(menus).map(([name, entries]) => (
          <MenuButton
            key={name}
            label={name}
            entries={entries}
            open={open === name}
            onOpenChange={(o) => setOpen(o ? name : null)}
            onHover={() => open && open !== name && setOpen(name)}
          />
        ))}
      </nav>
      <div className="ml-auto flex min-w-0 items-center gap-3 pr-2 text-[12px] text-muted-foreground">
        <span className="truncate font-medium text-foreground" title={title}>
          {title}
        </span>
        <span data-testid="save-state" aria-live="polite">
          {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Unsaved changes'}
        </span>
      </div>
    </header>
  );
}
