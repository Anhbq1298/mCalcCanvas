/**
 * Mathcad Prime–style ribbon: tabs of grouped commands with large buttons
 * and dropdown palettes that insert into the equation being edited.
 */
import {
  ArrowUpRight,
  Bold,
  Calculator,
  CheckSquare,
  ChevronDown,
  ClipboardPaste,
  Copy,
  FileDown,
  FileJson,
  FolderOpen,
  Grid3x3,
  Hand,
  ImagePlus,
  Italic,
  Magnet,
  Minus,
  MousePointer2,
  PanelRight,
  PanelTop,
  Pencil,
  Redo2,
  Save,
  Scissors,
  Square,
  Trash2,
  Type,
  Underline,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { commands, type ToolId } from '../../app/commands';
import { canUndo, useCanvasStore } from '../../canvas/model/canvasStore';
import { formatEditingText } from '../../canvas/textFormatting';
import { insertIntoActiveMath, templateToLatex } from '../../math/activeEditor';
import { useAppStore } from '../../store/appStore';
import { MenuButton, type MenuEntry } from '../common/MenuButton';
import { CONSTANTS, OPERATORS, SYMBOLS, UNITS_PALETTE, type PaletteSection } from './palettes';

type TabId = 'math' | 'formatting' | 'calculation' | 'document';
const TABS: { id: TabId; label: string }[] = [
  { id: 'math', label: 'Math' },
  { id: 'formatting', label: 'Formatting' },
  { id: 'calculation', label: 'Calculation' },
  { id: 'document', label: 'Document' },
];

/** Insert a palette template into the open equation, or start a new region with it. */
function insertTemplate(latex: string) {
  if (!insertIntoActiveMath(latex)) commands.insertMath(templateToLatex(latex));
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 flex-col border-r border-ribbon-border px-1.5 last:border-r-0">
      <div className="flex min-h-[64px] flex-1 items-start gap-0.5 pt-1">{children}</div>
      <div className="pb-0.5 text-center text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

const glyphCls = 'font-math text-[24px] italic leading-none text-ribbon-glyph';

/** Large ribbon button: icon or math glyph above, label below. Mouse-down keeps focus in the editor. */
function BigButton({
  icon: Icon,
  glyph,
  label,
  onClick,
  active,
  disabled,
  testId,
  caret,
  title,
}: {
  icon?: LucideIcon;
  glyph?: string;
  label: string;
  onClick(): void;
  active?: boolean;
  disabled?: boolean;
  testId?: string;
  caret?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      aria-pressed={active}
      disabled={disabled}
      data-testid={testId}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={
        'flex min-w-[52px] cursor-pointer flex-col items-center gap-1 rounded px-1.5 py-1 text-[12px] text-foreground transition-colors duration-150 disabled:cursor-default disabled:opacity-40 ' +
        (active ? 'bg-ribbon-active ring-1 ring-ribbon-active-border' : 'hover:bg-ribbon-hover')
      }
    >
      <span className="flex h-7 items-center justify-center">
        {Icon ? <Icon size={24} strokeWidth={1.5} className="text-ribbon-glyph" aria-hidden /> : <span className={glyphCls}>{glyph}</span>}
      </span>
      <span className="flex items-center gap-0.5 whitespace-nowrap leading-tight">
        {label}
        {caret && <ChevronDown size={11} aria-hidden />}
      </span>
    </button>
  );
}

function SmallButton({ icon: Icon, label, onClick, disabled, active, testId }: { icon: LucideIcon; label: string; onClick(): void; disabled?: boolean; active?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      aria-pressed={active}
      data-testid={testId}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={
        'flex h-[21px] cursor-pointer items-center gap-1.5 rounded px-1.5 text-[12px] text-foreground transition-colors duration-150 disabled:cursor-default disabled:opacity-40 ' +
        (active ? 'bg-ribbon-active' : 'hover:bg-ribbon-hover')
      }
    >
      <Icon size={14} strokeWidth={1.75} className="text-ribbon-glyph" aria-hidden />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

const Stack = ({ children }: { children: ReactNode }) => <div className="flex flex-col gap-px">{children}</div>;

/** Big button with a dropdown palette of symbols. */
function PaletteButton({ glyph, label, sections, testId }: { glyph: string; label: string; sections: PaletteSection[]; testId: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const toggle = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 340)), top: r.bottom + 4 });
    setOpen((o) => !o);
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && !popRef.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <BigButton glyph={glyph} label={label} caret active={open} onClick={toggle} testId={testId} />
      {open && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label={label}
          style={{ left: pos.left, top: pos.top }}
          className="fixed z-50 max-h-[70vh] w-[332px] overflow-y-auto rounded-md border border-ribbon-border bg-card p-2 shadow-xl"
        >
          {sections.map((sec) => (
            <div key={sec.title} className="mb-2 last:mb-0">
              <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{sec.title}</div>
              <div className="flex flex-wrap gap-1">
                {sec.items.map((it) => (
                  <button
                    key={it.title + it.label}
                    type="button"
                    title={it.title}
                    aria-label={it.title}
                    data-testid={`palette-${it.label}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertTemplate(it.latex)}
                    className={
                      'flex h-8 min-w-[36px] cursor-pointer items-center justify-center rounded border border-transparent px-1.5 text-[15px] text-foreground transition-colors duration-150 hover:border-ribbon-active-border hover:bg-ribbon-hover ' +
                      (it.math ? 'font-math italic' : '')
                    }
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="mt-1 border-t border-ribbon-border px-1 pt-1.5 text-[11px] leading-snug text-muted-foreground">
            Inserts at the cursor of the equation you are editing, or starts a new region.
          </p>
        </div>,
        document.body,
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, options, width = 'w-24', testId }: { label: string; value: string | number; onChange(v: string): void; options: [string | number, string][]; width?: string; testId?: string }) {
  return (
    <label className="flex h-[21px] items-center gap-1.5 px-1 text-[12px]">
      <span className="whitespace-nowrap text-muted-foreground">{label}</span>
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${width} h-[21px] cursor-pointer rounded-sm border border-ribbon-border bg-card px-1 text-[12px] focus:border-accent focus:outline-none`}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function MathTab() {
  const tool = useCanvasStore((s) => s.tool);
  const hasSelection = useCanvasStore((s) => s.selection.length > 0);
  const unitSystem = useAppStore((s) => s.settings.unitSystem);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const toolBtn = (id: ToolId, icon: LucideIcon, label: string) => (
    <SmallButton icon={icon} label={label} active={tool === id} onClick={() => commands.setTool(id)} testId={`tool-${id}`} />
  );
  return (
    <>
      <Group label="Regions">
        <BigButton glyph="x+y" label="Math" title="Math region – click the page, or just start typing" active={tool === 'math'} onClick={() => commands.setTool('math')} testId="tool-math" />
        <Stack>
          {toolBtn('text', Type, 'Text Block')}
          <SmallButton icon={ImagePlus} label="Image" onClick={() => void commands.insertImage()} />
          <SmallButton icon={CheckSquare} label="Check (≤ 1)" onClick={() => commands.insertCheck()} />
        </Stack>
        <BigButton icon={Trash2} label="Delete Region" disabled={!hasSelection} onClick={commands.deleteSelection} />
      </Group>
      <Group label="Operators and Symbols">
        <PaletteButton glyph="√" label="Operators" sections={OPERATORS} testId="palette-operators" />
        <PaletteButton glyph="β" label="Symbols" sections={SYMBOLS} testId="palette-symbols" />
        <PaletteButton glyph="π" label="Constants" sections={CONSTANTS} testId="palette-constants" />
      </Group>
      <Group label="Style">
        <Stack>
          <SmallButton icon={Type} label="Subscript" onClick={() => insertTemplate('_{#?}')} />
          <SmallButton icon={Calculator} label="Evaluate  =" onClick={() => insertTemplate('=')} />
          <SmallButton icon={Calculator} label="Define  ≔" onClick={() => insertTemplate('\\coloneq ')} />
        </Stack>
      </Group>
      <Group label="Units">
        <PaletteButton glyph="m" label="Units" sections={UNITS_PALETTE} testId="palette-units" />
        <Stack>
          <SelectField
            label="Unit System:"
            value={unitSystem}
            width="w-20"
            onChange={(v) => updateSettings({ unitSystem: v as 'SI' | 'Imperial' })}
            options={[
              ['SI', 'SI'],
              ['Imperial', 'USCS'],
            ]}
          />
        </Stack>
      </Group>
      <Group label="Drawing">
        <Stack>
          {toolBtn('select', MousePointer2, 'Select')}
          {toolBtn('hand', Hand, 'Pan')}
          {toolBtn('draw', Pencil, 'Freehand')}
        </Stack>
        <Stack>
          {toolBtn('line', Minus, 'Line')}
          {toolBtn('arrow', ArrowUpRight, 'Arrow')}
          {toolBtn('rect', Square, 'Rectangle')}
        </Stack>
      </Group>
      <Group label="Clipboard">
        <Stack>
          <SmallButton icon={Scissors} label="Cut" disabled={!hasSelection} onClick={commands.cut} />
          <SmallButton icon={Copy} label="Copy" disabled={!hasSelection} onClick={commands.copy} />
          <SmallButton icon={ClipboardPaste} label="Paste" onClick={() => void commands.paste()} />
        </Stack>
      </Group>
    </>
  );
}

function FormattingTab() {
  const panelOpen = useAppStore((s) => s.panelOpen);
  const editingText = useCanvasStore((s) => (s.editingId ? s.shapes[s.editingId]?.type === 'text' : false));
  return (
    <>
      <Group label="Text (while editing)">
        <Stack>
          <SmallButton icon={Bold} label="Bold" disabled={!editingText} onClick={() => formatEditingText('bold')} />
          <SmallButton icon={Italic} label="Italic" disabled={!editingText} onClick={() => formatEditingText('italic')} />
          <SmallButton icon={Underline} label="Underline" disabled={!editingText} onClick={() => formatEditingText('underline')} />
        </Stack>
        <Stack>
          <SmallButton icon={Type} label="Heading" disabled={!editingText} onClick={() => formatEditingText('formatBlock', 'H2')} />
          <SmallButton icon={Type} label="Normal" disabled={!editingText} onClick={() => formatEditingText('formatBlock', 'DIV')} />
          <SmallButton icon={Type} label="Bullets" disabled={!editingText} onClick={() => formatEditingText('insertUnorderedList')} />
        </Stack>
      </Group>
      <Group label="Equation display">
        <Stack>
          <SmallButton icon={Calculator} label="Formula only" onClick={() => commands.setDisplayMode('formula')} />
          <SmallButton icon={Calculator} label="Formula and result" onClick={() => commands.setDisplayMode('formulaResult')} />
          <SmallButton icon={Calculator} label="Full calculation" onClick={() => commands.setDisplayMode('full')} />
        </Stack>
        <Stack>
          <SmallButton icon={Calculator} label="Result only" onClick={() => commands.setDisplayMode('result')} />
          <SmallButton icon={Calculator} label="Automatic" onClick={() => commands.setDisplayMode('auto')} />
        </Stack>
      </Group>
      <Group label="More">
        <BigButton icon={PanelRight} label="Properties" title="Font, colour, size and units of the selection" active={panelOpen} onClick={() => useAppStore.getState().togglePanel()} testId="toggle-properties" />
      </Group>
    </>
  );
}

function CalculationTab() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  return (
    <>
      <Group label="Controls">
        <BigButton icon={Calculator} label="Calculate" title="Recalculate all regions (F9)" onClick={commands.calculateAll} />
      </Group>
      <Group label="Results">
        <Stack>
          <SelectField
            label="Decimal places"
            value={settings.precision}
            width="w-14"
            onChange={(v) => updateSettings({ precision: Number(v) })}
            options={[0, 1, 2, 3, 4, 5, 6].map((p) => [p, String(p)])}
          />
          <SelectField
            label="Unit system"
            value={settings.unitSystem}
            width="w-24"
            onChange={(v) => updateSettings({ unitSystem: v as 'SI' | 'Imperial' })}
            options={[
              ['SI', 'SI (kN, m)'],
              ['Imperial', 'USCS (kip, ft)'],
            ]}
          />
        </Stack>
      </Group>
    </>
  );
}

function DocumentTab() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const isGrid = useCanvasStore((s) => s.isGrid);
  const isSnap = useCanvasStore((s) => s.isSnap);
  const zoom = useCanvasStore((s) => s.camera.z);
  return (
    <>
      <Group label="Layout">
        <BigButton icon={Square} label="Page" active={settings.canvasMode === 'page'} onClick={() => commands.setCanvasMode('page')} />
        <BigButton icon={Grid3x3} label="Free Canvas" active={settings.canvasMode === 'free'} onClick={() => commands.setCanvasMode('free')} />
        <Stack>
          <SelectField
            label="Orientation"
            value={settings.pageOrientation}
            onChange={(v) => updateSettings({ pageOrientation: v as 'portrait' | 'landscape' })}
            options={[
              ['portrait', 'Portrait'],
              ['landscape', 'Landscape'],
            ]}
          />
        </Stack>
      </Group>
      <Group label="Show">
        <BigButton icon={Grid3x3} label="Grid" active={isGrid} onClick={commands.toggleGrid} testId="toggle-grid" />
        <BigButton icon={PanelTop} label="Header/Footer" active={settings.showHeaderFooter} onClick={() => updateSettings({ showHeaderFooter: !settings.showHeaderFooter })} testId="toggle-chrome" />
        <Stack>
          <SmallButton icon={Magnet} label="Snap to grid" active={isSnap} onClick={commands.toggleSnap} />
          <SmallButton icon={PanelRight} label="Worksheet details" onClick={() => useAppStore.getState().togglePanel(true)} />
        </Stack>
      </Group>
      <Group label="Zoom">
        <Stack>
          <SmallButton icon={ZoomIn} label="Zoom in" onClick={commands.zoomIn} />
          <SmallButton icon={ZoomOut} label="Zoom out" onClick={commands.zoomOut} />
          <SmallButton icon={Grid3x3} label={`100%  (now ${Math.round(zoom * 100)}%)`} onClick={commands.resetZoom} />
        </Stack>
      </Group>
      <Group label="Export">
        <BigButton icon={FileDown} label="PDF" onClick={() => void commands.exportPdf()} testId="export-pdf" />
        <BigButton icon={FileJson} label="JSON" onClick={() => commands.exportJson()} />
      </Group>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ribbon
// ---------------------------------------------------------------------------

export function Ribbon() {
  const [tab, setTab] = useState<TabId>('math');
  const [fileOpen, setFileOpen] = useState(false);
  const title = useAppStore((s) => s.title);
  const saveState = useAppStore((s) => s.saveState);
  const openDialog = useAppStore((s) => s.openDialog);
  const undoable = useCanvasStore(canUndo);
  const redoable = useCanvasStore((s) => s.redoStack.length > 0);

  const fileEntries: MenuEntry[] = [
    { label: 'New worksheet', onSelect: () => void commands.newWorksheet(false) },
    { label: 'New from steel beam sample', onSelect: () => void commands.newWorksheet(true) },
    { label: 'Open…', shortcut: 'Ctrl+O', onSelect: commands.open },
    { label: 'Save', shortcut: 'Ctrl+S', onSelect: () => void commands.save() },
    { type: 'separator' },
    { label: 'Import JSON…', onSelect: () => void commands.importJson() },
    { label: 'Export JSON', onSelect: () => commands.exportJson() },
    { label: 'Export PDF…', onSelect: () => void commands.exportPdf() },
    { type: 'separator' },
    { label: 'Keyboard shortcuts', onSelect: () => openDialog('shortcuts') },
    { label: 'Math syntax, units & constants', onSelect: () => openDialog('syntax') },
    { label: 'About CalcCanvas', onSelect: () => openDialog('about') },
  ];

  return (
    <div className="shrink-0 select-none bg-ribbon" data-testid="ribbon">
      {/* Quick access + tabs */}
      <div className="flex h-8 items-end gap-0.5 border-b border-ribbon-border bg-ribbon-top px-1.5">
        <div className="mb-1 mr-1 flex items-center gap-0.5">
          <div className="[&>div>button]:h-6 [&>div>button]:bg-ribbon-file [&>div>button]:font-semibold [&>div>button]:text-white [&>div>button:hover]:bg-ribbon-file-hover">
            <MenuButton label="File" entries={fileEntries} open={fileOpen} onOpenChange={setFileOpen} onHover={() => {}} />
          </div>
          <button type="button" title="Save (Ctrl+S)" aria-label="Save" onClick={() => void commands.save()} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-ribbon-glyph hover:bg-ribbon-hover">
            <Save size={14} aria-hidden />
          </button>
          <button type="button" title="Open (Ctrl+O)" aria-label="Open" onClick={commands.open} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-ribbon-glyph hover:bg-ribbon-hover">
            <FolderOpen size={14} aria-hidden />
          </button>
          <button type="button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!undoable} onClick={commands.undo} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-ribbon-glyph hover:bg-ribbon-hover disabled:opacity-35">
            <Undo2 size={14} aria-hidden />
          </button>
          <button type="button" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!redoable} onClick={commands.redo} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-ribbon-glyph hover:bg-ribbon-hover disabled:opacity-35">
            <Redo2 size={14} aria-hidden />
          </button>
        </div>
        <div role="tablist" aria-label="Ribbon" className="flex items-end gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={
                'h-7 cursor-pointer rounded-t px-3.5 text-[13px] transition-colors duration-150 ' +
                (tab === t.id ? 'relative -mb-px border border-b-0 border-ribbon-border bg-ribbon text-foreground' : 'text-muted-foreground hover:text-foreground')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mb-1.5 ml-auto pr-1 text-[12px] font-semibold text-ribbon-glyph">CalcCanvas</div>
      </div>

      {/* Groups */}
      <div role="tabpanel" className="flex h-[92px] items-stretch overflow-x-auto overflow-y-hidden px-1 py-1">
        {tab === 'math' && <MathTab />}
        {tab === 'formatting' && <FormattingTab />}
        {tab === 'calculation' && <CalculationTab />}
        {tab === 'document' && <DocumentTab />}
      </div>

      {/* Document tab strip */}
      <div className="flex h-[26px] items-end border-t border-ribbon-border bg-ribbon-strip px-1">
        <div className="flex h-[22px] max-w-[60%] items-center gap-2 rounded-t-sm border border-b-0 border-ribbon-border bg-ribbon px-2.5 text-[12px]">
          <span className="truncate font-semibold" title={title}>
            {title}
          </span>
          <span data-testid="save-state" aria-live="polite" className="whitespace-nowrap text-[11px] text-muted-foreground">
            {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved (no storage)' : 'Unsaved changes'}
          </span>
        </div>
      </div>
    </div>
  );
}
