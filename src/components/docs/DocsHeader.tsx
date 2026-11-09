/**
 * Google Docs–style chrome: document title + menu row, then one rounded
 * toolbar. Controls act on what is selected (or being edited).
 */
import {
  FileDown,
  ListTree,
  Variable,
  PanelRight,
  Redo2,
  Sigma,
  TableProperties,
  Undo2,
} from 'lucide-react';
import { TEMPLATES } from '../../documents/templates';
import { useState } from 'react';
import { commands } from '../../app/commands';
import { canUndo, useCanvasStore } from '../../canvas/model/canvasStore';
import { useAppStore } from '../../store/appStore';
import { withShortcut } from '../../app/shortcuts';
import { MenuButton, type MenuEntry } from '../common/MenuButton';
import { openDocument } from '../../documents/documentController';
import { SaveStatus } from './SaveStatus';
import { useRecentDocuments } from './useRecentDocuments';
import { RibbonPanel, RibbonTabs, type RibbonTabId } from '../ribbon/Ribbon';
import { SmallButton, TB } from '../ribbon/parts';
import { MOD } from '../ribbon/ribbonState';
// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export function DocsHeader() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const title = useAppStore((s) => s.title);
  const documentId = useAppStore((s) => s.documentId);
  const recent = useRecentDocuments(openMenu === 'File').filter((d) => d.id !== documentId);
  const panelOpen = useAppStore((s) => s.panelOpen);
  const paramsOpen = useAppStore((s) => s.paramsOpen);
  const leftTab = useAppStore((s) => s.leftTab);
  const workspace = useAppStore((s) => s.workspace);
  const { updateTitle, togglePanel, showLeftTab, setWorkspace } = useAppStore.getState();
  const undoable = useCanvasStore(canUndo);
  const [ribbonTab, setRibbonTab] = useState<RibbonTabId>('math');
  const redoable = useCanvasStore((s) => s.redoStack.length > 0);

  const menus: Record<string, MenuEntry[]> = {
    File: [
      { label: 'New worksheet', onSelect: () => void commands.newWorksheet(false) },
      { type: 'separator' },
      { label: 'Open…', shortcut: `${MOD}O`, onSelect: commands.open },
      ...(recent.length
        ? [{ type: 'heading', label: 'Recent' } as const, ...recent.map((d) => ({ label: d.fileName ?? d.title, onSelect: () => void openDocument(d.id) }))]
        : []),
      { type: 'separator' },
      { label: 'Save', shortcut: `${MOD}S`, onSelect: () => void commands.save() },
      { label: 'Save As… (.mCCV)', shortcut: `${MOD}⇧S`, onSelect: () => void commands.saveAs() },
      { type: 'separator' },
      { label: 'Export PDF / Print…', shortcut: `${MOD}P`, onSelect: () => void commands.exportPdf() },
      { label: 'Page setup…', onSelect: () => useAppStore.getState().openDialog('page-setup') },
      { label: 'Worksheet details…', onSelect: () => togglePanel(true) },
    ],
    Templates: [
      { type: 'heading', label: 'Load a worksheet from a template' },
      { label: 'Blank worksheet', onSelect: () => void commands.newWorksheet(false) },
      { type: 'separator' },
      ...TEMPLATES.map((t) => ({ label: t.name, onSelect: () => void commands.newFromTemplate(t.id) })),
    ],
  };

  return (
    <header className="shrink-0 bg-docs-bg" data-testid="docs-header">
      {/* Title + menus */}
      <div className="flex items-center gap-2 px-3 pt-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-docs-blue text-white" aria-hidden>
          <Sigma size={22} strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <input
              aria-label="Worksheet title"
              value={title}
              onChange={(e) => updateTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
              className="h-7 min-w-0 max-w-[480px] rounded border border-transparent bg-transparent px-1.5 text-[18px] text-docs-ink hover:border-docs-border focus:border-docs-blue focus:outline-none"
              style={{ width: `${Math.max(8, title.length + 2)}ch` }}
            />
            <div className="rb-quick" role="toolbar" aria-label="Quick access">
              <TB icon={Undo2} label={withShortcut('Undo', 'undo')} disabled={!undoable} onClick={commands.undo} testId="quick-undo" />
              <TB icon={Redo2} label={withShortcut('Redo', 'redo')} disabled={!redoable} onClick={commands.redo} testId="quick-redo" />
            </div>
            <SaveStatus />
          </div>
          <nav role="menubar" aria-label="Main menu" className="-ml-1 flex items-center [&_button[role=menuitem][aria-haspopup]]:h-6 [&_button[role=menuitem][aria-haspopup]]:px-2 [&_button[role=menuitem][aria-haspopup]]:text-[14px] [&_button[role=menuitem][aria-haspopup]]:text-docs-ink">
            {Object.entries(menus).map(([name, entries]) => (
              <MenuButton
                key={name}
                label={name}
                entries={entries}
                open={openMenu === name}
                onOpenChange={(o) => setOpenMenu(o ? name : null)}
                onHover={() => openMenu && openMenu !== name && setOpenMenu(name)}
                highlight={name === 'Templates'}
              />
            ))}
            <span className="mx-1.5 h-4 w-px bg-docs-border" aria-hidden />
            {workspace === 'calculation' && (
              <>
                <RibbonTabs tab={ribbonTab} setTab={setRibbonTab} only={(id) => id !== 'help'} />
                <span className="mx-1.5 h-4 w-px bg-docs-border" aria-hidden />
              </>
            )}
            <div role="tablist" aria-label="Workspace" className="flex items-center gap-0.5">
              <button
                type="button"
                role="tab"
                aria-selected={workspace === 'calculation'}
                onClick={() => setWorkspace('calculation')}
                className={'docs-workspace-tab ' + (workspace === 'calculation' ? 'is-active' : '')}
                data-testid="workspace-calccanvas"
              >
                <Sigma size={13} aria-hidden /> CalcCanvas
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={workspace === 'input-results'}
                onClick={() => setWorkspace('input-results')}
                className={'docs-workspace-tab ' + (workspace === 'input-results' ? 'is-active' : '')}
                data-testid="workspace-input-results"
              >
                <TableProperties size={13} aria-hidden /> Table In&amp;Out
              </button>
            </div>
            {workspace === 'calculation' && (
              <>
                <span className="mx-1.5 h-4 w-px bg-docs-border" aria-hidden />
                <RibbonTabs tab={ribbonTab} setTab={setRibbonTab} only={(id) => id === 'help'} label="Help" />
              </>
            )}
          </nav>
        </div>
        {workspace === 'calculation' && <button
          type="button"
          data-testid="export-pdf"
          onClick={() => void commands.exportPdf()}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-docs-share px-5 text-[14px] font-medium text-docs-ink transition-colors duration-150 hover:bg-docs-share-hover"
        >
          <FileDown size={17} aria-hidden /> Export PDF
        </button>}
      </div>

      {/* Ribbon */}
      {workspace === 'calculation' && (
        <div role="toolbar" aria-label="Ribbon" className="rb" data-testid="ribbon">
          <div className="rb-body">
            <RibbonPanel tab={ribbonTab} />
            <div className="rb-side" role="group" aria-label="Panels">
              <SmallButton icon={ListTree} label="Outline" active={paramsOpen && leftTab === 'outline'} onClick={() => showLeftTab('outline')} testId="toggle-outline" />
              <SmallButton icon={Variable} label="Parameters" active={paramsOpen && leftTab === 'params'} onClick={() => showLeftTab('params')} testId="toggle-params" />
              <SmallButton icon={PanelRight} label="Properties" active={panelOpen} onClick={() => togglePanel()} testId="toggle-properties" />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
