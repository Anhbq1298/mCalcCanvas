/**
 * Google Docs–style chrome: document title + menu row, then one rounded
 * toolbar. Controls act on what is selected (or being edited).
 */
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowUpRight,
  Bold,
  Calculator,
  CheckSquare,
  FileDown,
  Grid3x3,
  Hand,
  FilePlus2,
  ImagePlus,
  List,
  ListOrdered,
  ListTree,
  LineChart,
  Crosshair,
  Subscript,
  Superscript,
  Variable,
  Italic,
  Minus,
  MousePointer2,
  PanelRight,
  PanelTop,
  Pencil,
  Plus,
  Redo2,
  Sigma,
  Square,
  Type,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { addHeading, setParagraphStyle } from '../../canvas/headings';
import { insertAnnexLink, sortAnnexByLinkOrder } from '../../canvas/annexActions';
import { TEMPLATES } from '../../documents/templates';
import { useState, type ReactNode } from 'react';
import { commands, type ToolId } from '../../app/commands';
import { newGraphSeries, viewport, zoomAt } from '../../canvas/canvasActions';
import { canUndo, updateShapes, useCanvasStore, type ShapePatch } from '../../canvas/model/canvasStore';
import { fontStack, PARAGRAPH_STYLES, TEXT_FONTS, type GraphShape, type HeadingLevel, type MathDisplayMode, type Shape } from '../../canvas/model/types';
import { formatEditingText, hasTextSelection } from '../../canvas/textFormatting';
import { useAppStore } from '../../store/appStore';
import { parseDisplayUnit } from '../../engine';
import { MenuButton, type MenuEntry } from '../common/MenuButton';
import { CONSTANTS, OPERATORS, SYMBOLS, UNITS_PALETTE } from '../ribbon/palettes';
import { Popover, PalettePopover } from './Popover';

const MOD = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';

// Google Docs text colour grid (subset) plus engineering inks.
const COLOR_GRID = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff',
  '#4a86e8', '#0000ff', '#9900ff', '#ff00ff', '#1e3a5f', '#2563eb',
  '#cc0000', '#e69138', '#38761d', '#134f5c', '#0b5394', '#741b47',
];

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

function useSelectedShapes(): Shape[] {
  const selection = useCanvasStore((s) => s.selection);
  const shapes = useCanvasStore((s) => s.shapes);
  return selection.map((id) => shapes[id]).filter(Boolean);
}

function selectedTextIds(): string[] {
  const { selection, shapes } = useCanvasStore.getState();
  return selection.filter((id) => shapes[id]?.type === 'text');
}

function patchSelected(fn: (s: Shape) => ShapePatch | null) {
  const { selection, shapes } = useCanvasStore.getState();
  const patches: Record<string, ShapePatch> = {};
  for (const id of selection) {
    const p = shapes[id] && fn(shapes[id]);
    if (p) patches[id] = p;
  }
  if (Object.keys(patches).length) updateShapes(patches);
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function TB({ icon: Icon, label, onClick, active, disabled, testId, children }: { icon?: LucideIcon; label: string; onClick(): void; active?: boolean; disabled?: boolean; testId?: string; children?: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      data-testid={testId}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={'docs-tb-btn ' + (active ? 'is-active' : '')}
    >
      {Icon ? <Icon size={17} strokeWidth={1.9} aria-hidden /> : children}
    </button>
  );
}

const Sep = () => <div className="mx-1 h-5 w-px shrink-0 bg-docs-sep" aria-hidden />;

function TBSelect({ value, onChange, options, label, width, testId, style }: { value: string | number; onChange(v: string): void; options: [string | number, string][]; label: string; width: number; testId?: string; style?: React.CSSProperties }) {
  return (
    <select
      aria-label={label}
      title={label}
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width, ...style }}
      className="docs-tb-select"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Toolbar sections
// ---------------------------------------------------------------------------

/** Font size stepper for the selected regions of the given kinds. */
function SizeControl({ kinds, label }: { kinds: ('text' | 'math')[]; label: string }) {
  const selected = useSelectedShapes();
  const sized = selected.find((s) => (kinds as string[]).includes(s.type));
  const size = sized && (sized.type === 'text' || sized.type === 'math') ? sized.props.fontSize : kinds[0] === 'math' ? 18 : 15;
  const [draft, setDraft] = useState<string | null>(null);
  const setSize = (n: number) => {
    const v = Math.min(72, Math.max(8, Math.round(n)));
    patchSelected((s) => ((kinds as string[]).includes(s.type) && (s.type === 'text' || s.type === 'math') ? { props: { fontSize: v } } : null));
  };
  return (
    <>
      <TB icon={Minus} label={`Decrease ${label.toLowerCase()}`} disabled={!sized} onClick={() => setSize(size - 1)} />
      <input
        aria-label={label}
        disabled={!sized}
        value={draft ?? String(size)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && Number(draft)) setSize(Number(draft));
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        className="h-6 w-9 rounded border border-docs-ink/40 bg-transparent text-center text-[13px] tabular-nums disabled:opacity-40"
      />
      <TB icon={Plus} label={`Increase ${label.toLowerCase()}`} disabled={!sized} onClick={() => setSize(size + 1)} />
    </>
  );
}

/** Text formatting tab: paragraph style, font, size, emphasis, colour, alignment, lists. */
function TextFormattingTab() {
  const selected = useSelectedShapes();
  const textFont = useAppStore((s) => s.settings.textFont);
  const editingText = useCanvasStore((s) => (s.editingId ? s.shapes[s.editingId]?.type === 'text' : false));
  const text = selected.find((s) => s.type === 'text');
  const font = text?.type === 'text' ? text.props.fontFamily : textFont;

  const setFont = (f: string) => {
    if (selected.some((s) => s.type === 'text')) patchSelected((s) => (s.type === 'text' ? { props: { fontFamily: f } } : null));
    else useAppStore.getState().updateSettings({ textFont: f });
  };

  const textIds = selected.filter((s) => s.type === 'text').map((s) => s.id);
  const level = text?.type === 'text' ? (text.props.heading ?? 0) : 0;
  const fmt = (icon: LucideIcon, label: string, command: string) => (
    <TB icon={icon} label={label} disabled={!editingText} onClick={() => formatEditingText(command)} />
  );
  return (
    <>
      <TBSelect
        label="Paragraph style (headings appear in the outline)"
        testId="paragraph-style"
        value={textIds.length ? level : ''}
        width={118}
        onChange={(v) => setParagraphStyle(textIds, Number(v) as HeadingLevel)}
        options={[...(textIds.length ? [] : [['', 'Style'] as [string, string]]), ...([0, 1, 2, 3] as const).map((l) => [l, PARAGRAPH_STYLES[l].label] as [number, string])]}
      />
      <Sep />
      <TBSelect
        label={text ? 'Font' : 'Font for new text'}
        testId="text-font"
        value={font}
        width={128}
        style={{ fontFamily: fontStack(font) }}
        onChange={setFont}
        options={Object.keys(TEXT_FONTS).map((f) => [f, f])}
      />
      <Sep />
      <SizeControl kinds={['text']} label="Font size" />
      <Sep />
      {fmt(Bold, `Bold (${MOD}B)`, 'bold')}
      {fmt(Italic, `Italic (${MOD}I)`, 'italic')}
      {fmt(Underline, `Underline (${MOD}U)`, 'underline')}
      {fmt(Subscript, 'Subscript', 'subscript')}
      {fmt(Superscript, 'Superscript', 'superscript')}
      <ColorButton testId="text-color" title="Text color" kinds={['text']} />
      <Sep />
      <AlignControls />
      <Sep />
      {fmt(List, 'Bulleted list', 'insertUnorderedList')}
      {fmt(ListOrdered, 'Numbered list', 'insertOrderedList')}
    </>
  );
}

/** Common result units for the result-unit box. */
const RESULT_UNITS = ['mm', 'm', 'mm²', 'm²', 'mm³', 'mm⁴', 'kN', 'N', 'kN·m', 'kN·mm', 'N·mm', 'kN/m', 'kPa', 'MPa', 'GPa', 'N/mm²', 'kN/m²', 'kN/m³', 'kg', 'kg/m³', 'deg', 'kip', 'kip·ft', 'ksi', 'psi', 'ft', 'in'];

/** Math formatting tab: palettes, display format, result unit, decimals, size, colour, worksheet units. */
function MathFormattingTab() {
  const selected = useSelectedShapes();
  const settings = useAppStore((s) => s.settings);
  const math = selected.filter((s): s is Extract<Shape, { type: 'math' }> => s.type === 'math');
  const first = math[0];
  const [unitDraft, setUnitDraft] = useState<string | null>(null);
  const [unitError, setUnitError] = useState<string | null>(null);
  const applyUnit = (raw: string) => {
    const v = raw.trim();
    if (v) {
      try {
        parseDisplayUnit(v);
      } catch (e) {
        setUnitError((e as Error).message);
        return;
      }
    }
    setUnitError(null);
    patchSelected((s) => (s.type === 'math' ? { props: { displayUnit: v } } : null));
  };
  return (
    <>
      <PalettePopover label="Operators" glyph="√" sections={OPERATORS} testId="palette-operators" columns={5} />
      <PalettePopover label="Symbols" glyph="β" sections={SYMBOLS} testId="palette-symbols" />
      <PalettePopover label="Constants" glyph="π" sections={CONSTANTS} testId="palette-constants" />
      <PalettePopover label="Units" glyph="m" sections={UNITS_PALETTE} testId="palette-units" />
      <Sep />
      <DisplayModeSelect />
      <Sep />
      <input
        aria-label="Result unit"
        title={unitError ?? 'Result unit for the selected equations (e.g. kN·m, MPa). Empty = automatic.'}
        data-testid="math-result-unit"
        list="cc-result-units"
        disabled={!first}
        placeholder="Unit"
        value={unitDraft ?? first?.props.displayUnit ?? ''}
        onChange={(e) => {
          setUnitDraft(e.target.value);
          setUnitError(null);
        }}
        onBlur={() => {
          if (unitDraft !== null) applyUnit(unitDraft);
          setUnitDraft(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        className={'h-7 w-[78px] rounded border bg-white px-1.5 text-[13px] disabled:opacity-40 ' + (unitError ? 'border-destructive' : 'border-docs-border')}
      />
      <datalist id="cc-result-units">
        {RESULT_UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <TBSelect
        label="Decimal places of the selected equations"
        testId="math-decimals"
        value={first ? String(first.props.precision) : '-1'}
        width={92}
        onChange={(v) => patchSelected((s) => (s.type === 'math' ? { props: { precision: Number(v) } } : null))}
        options={[['-1', `Auto (${settings.precision})`], ...[0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), `${d} dp`] as [string, string])]}
      />
      <TBSelect
        label="Array results of the selected equations: row or column, shortened (first … last) or every entry"
        testId="math-array"
        value={first ? `${first.props.vectorLayout ?? 'row'}-${first.props.vectorExpanded ? 'all' : 'short'}` : 'row-short'}
        width={156}
        onChange={(v) => {
          const [layout, entries] = v.split('-');
          patchSelected((s) =>
            s.type === 'math' ? { props: { vectorLayout: layout === 'column' ? 'column' : undefined, vectorExpanded: entries === 'all' ? true : undefined } } : null,
          );
        }}
        options={[
          ['row-short', 'Array: row, short'],
          ['row-all', 'Array: row, all'],
          ['column-short', 'Array: column, short'],
          ['column-all', 'Array: column, all'],
        ]}
      />
      <Sep />
      <SizeControl kinds={['math']} label="Equation size" />
      <ColorButton testId="math-color" title="Equation color" kinds={['math']} />
      <Sep />
      <span className="px-1 text-[12px] text-docs-muted">Worksheet</span>
      <TBSelect
        label="Equations and text snap their baseline to major lines (every 4 squares) or to every grid line"
        testId="baseline-snap"
        value={settings.baselineSnap ?? 'major'}
        width={110}
        onChange={(v) => useAppStore.getState().updateSettings({ baselineSnap: v as 'major' | 'minor' })}
        options={[['major', 'Snap: lines'], ['minor', 'Snap: squares']]}
      />
      <TBSelect
        label="Unit system for results (whole worksheet)"
        testId="worksheet-units"
        value={settings.unitSystem}
        width={70}
        onChange={(v) => useAppStore.getState().updateSettings({ unitSystem: v as 'SI' | 'Imperial' })}
        options={[['SI', 'SI'], ['Imperial', 'USCS']]}
      />
      <TBSelect
        label="Default decimal places (whole worksheet)"
        testId="worksheet-decimals"
        value={settings.precision}
        width={70}
        onChange={(v) => useAppStore.getState().updateSettings({ precision: Number(v) })}
        options={[0, 1, 2, 3, 4, 5, 6].map((d) => [d, `${d} dp`])}
      />
    </>
  );
}

function ColorButton({ testId, title, kinds }: { testId: string; title: string; kinds: ('text' | 'math')[] }) {
  const all = useSelectedShapes();
  const selected = all.filter((s) => (kinds as string[]).includes(s.type));
  const editingText = useCanvasStore((s) => (s.editingId ? s.shapes[s.editingId]?.type === 'text' : false)) && kinds.includes('text');
  const first = selected[0];
  const current = !first ? '#000000' : first.type === 'text' || first.type === 'math' ? first.props.color : 'stroke' in first.props ? first.props.stroke : '#000000';
  const apply = (c: string) => {
    if (editingText && hasTextSelection()) formatEditingText('foreColor', c);
    else patchSelected((s) => ((kinds as string[]).includes(s.type) && (s.type === 'text' || s.type === 'math') ? { props: { color: c } } : null));
  };
  return (
    <Popover
      title={title}
      testId={testId}
      width={232}
      trigger={
        <span className="flex flex-col items-center leading-none">
          <span className="text-[15px] font-semibold text-docs-ink">A</span>
          <span className="mt-px h-[3px] w-4 rounded-sm" style={{ background: current }} />
        </span>
      }
    >
      {(close) => (
        <div className="space-y-2">
          <div className="grid grid-cols-6 gap-1">
            {COLOR_GRID.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                title={c}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  apply(c);
                  close();
                }}
                className={'h-6 w-6 cursor-pointer rounded-full border transition-transform duration-150 hover:scale-110 ' + (c.toLowerCase() === current.toLowerCase() ? 'border-docs-blue ring-2 ring-docs-blue/40' : 'border-black/10')}
                style={{ background: c }}
              />
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 border-t border-docs-border pt-2 text-[13px] text-docs-ink">
            <input type="color" data-testid="custom-color" value={/^#[0-9a-fA-F]{6}$/.test(current) ? current : '#000000'} onChange={(e) => apply(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-docs-border p-0.5" />
            Custom…
          </label>
          {!selected.length && !editingText && <p className="text-[11px] text-docs-muted">Select a region first.</p>}
        </div>
      )}
    </Popover>
  );
}

function AlignControls() {
  const selected = useSelectedShapes();
  const text = selected.find((s) => s.type === 'text');
  const align = text?.type === 'text' ? text.props.align : 'left';
  const set = (a: 'left' | 'center' | 'right') => patchSelected((s) => (s.type === 'text' ? { props: { align: a } } : null));
  return (
    <>
      <TB icon={AlignLeft} label="Left align" disabled={!text} active={!!text && align === 'left'} onClick={() => set('left')} />
      <TB icon={AlignCenter} label="Center align" disabled={!text} active={!!text && align === 'center'} onClick={() => set('center')} />
      <TB icon={AlignRight} label="Right align" disabled={!text} active={!!text && align === 'right'} onClick={() => set('right')} />
    </>
  );
}

function DisplayModeSelect() {
  const selected = useSelectedShapes();
  const math = selected.filter((s) => s.type === 'math');
  const value = math[0]?.type === 'math' ? math[0].props.displayMode : 'auto';
  return (
    <TBSelect
      label="Equation display"
      value={value}
      width={136}
      onChange={(v) => commands.setDisplayMode(v as MathDisplayMode)}
      options={[
        ['auto', 'Auto display'],
        ['formula', 'Formula only'],
        ['result', 'Result only'],
        ['formulaResult', 'Formula = result'],
        ['full', 'Full calculation'],
      ]}
    />
  );
}

function ToolButtons() {
  const tool = useCanvasStore((s) => s.tool);
  const t = (id: ToolId, icon: LucideIcon, label: string) => <TB key={id} icon={icon} label={label} active={tool === id} onClick={() => commands.setTool(id)} testId={`tool-${id}`} />;
  return (
    <>
      {t('select', MousePointer2, 'Select')}
      {t('hand', Hand, 'Pan (Space+drag)')}
      {t('line', Minus, 'Line')}
      {t('arrow', ArrowUpRight, 'Arrow')}
      {t('rect', Square, 'Rectangle')}
      {t('draw', Pencil, 'Freehand')}
    </>
  );
}

/** Graph tab: insert an X-Y graph; axes and series of the selected graph. */
function GraphTab() {
  const selected = useSelectedShapes();
  const graph = selected.find((s): s is GraphShape => s.type === 'graph');
  const [draft, setDraft] = useState<{ field: 'xUnit' | 'yUnit' | 'title'; value: string } | null>(null);
  const [unitError, setUnitError] = useState<string | null>(null);
  const patch = (props: Partial<GraphShape['props']>) => graph && updateShapes({ [graph.id]: { props } as ShapePatch });
  const field = (f: 'xUnit' | 'yUnit' | 'title', label: string, width: number, placeholder: string) => (
    <input
      aria-label={label}
      title={f === 'title' ? label : unitError ?? `${label} (e.g. mm, kN). Empty = automatic.`}
      data-testid={`graph-${f}`}
      disabled={!graph}
      placeholder={placeholder}
      value={draft?.field === f ? draft.value : graph?.props[f] ?? ''}
      onChange={(e) => {
        setDraft({ field: f, value: e.target.value });
        setUnitError(null);
      }}
      onBlur={() => {
        if (!draft || draft.field !== f) return;
        const v = draft.value.trim();
        setDraft(null);
        if (f !== 'title' && v) {
          try {
            parseDisplayUnit(v);
          } catch (err) {
            setUnitError((err as Error).message);
            return;
          }
        }
        patch({ [f]: v });
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      style={{ width }}
      className={'h-7 rounded border bg-white px-1.5 text-[13px] disabled:opacity-40 ' + (unitError && f !== 'title' ? 'border-destructive' : 'border-docs-border')}
    />
  );
  return (
    <>
      <TB icon={LineChart} label="Insert X-Y graph" onClick={() => commands.insertGraph()} testId="graph-insert" />
      <Sep />
      {field('title', 'Graph title', 120, 'Title')}
      {field('xUnit', 'X axis unit', 56, 'X unit')}
      {field('yUnit', 'Y axis unit', 56, 'Y unit')}
      <TB label="Equal axes (same scale on X and Y, for sections and plans)" disabled={!graph} active={!!graph?.props.equalAxes} onClick={() => patch({ equalAxes: !graph!.props.equalAxes })} testId="graph-equal">
        <span className="text-[13px]">1:1</span>
      </TB>
      <TB icon={Grid3x3} label="Grid lines" disabled={!graph} active={!!graph?.props.grid} onClick={() => patch({ grid: !graph!.props.grid })} testId="graph-grid" />
      <TB icon={Crosshair} label="Axes through origin (values on bottom/left)" disabled={!graph} active={!!graph?.props.axesAtOrigin} onClick={() => patch({ axesAtOrigin: !graph!.props.axesAtOrigin })} testId="graph-origin" />
      <Sep />
      <TB
        icon={Plus}
        label="Add a series (edit x, y and style in the Properties panel)"
        disabled={!graph}
        onClick={() => {
          patch({ series: [...graph!.props.series, newGraphSeries(graph!.props.series)] });
          useAppStore.getState().togglePanel(true);
        }}
        testId="graph-add-series"
      />
      <span className="px-1 text-[12px] text-docs-muted">{graph ? `${graph.props.series.length} series` : 'Select a graph'}</span>
    </>
  );
}

type FormatTab = 'math' | 'text' | 'graph';

/**
 * Formatting tabs (like Mathcad's Math / Text Formatting ribbons). The tab
 * follows what you work on: selecting or editing an equation shows Math
 * formatting, a text region shows Text formatting; it can also be chosen.
 */
function FormatTabs() {
  const [tab, setTab] = useState<FormatTab>('math');
  const focusKind = useCanvasStore((s) => {
    const id = s.editingId ?? (s.selection.length ? s.selection[0] : null);
    const t = id ? s.shapes[id]?.type : undefined;
    return t === 'math' || t === 'text' || t === 'graph' ? t : null;
  });
  const [lastKind, setLastKind] = useState<FormatTab | null>(null);
  if (focusKind !== lastKind) {
    setLastKind(focusKind);
    if (focusKind) setTab(focusKind);
  }
  const tabBtn = (id: FormatTab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      data-testid={`format-tab-${id}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setTab(id)}
      className={
        'h-7 cursor-pointer whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition-colors duration-150 ' +
        (tab === id ? 'bg-docs-active text-docs-blue' : 'text-docs-muted hover:bg-docs-hover hover:text-docs-ink')
      }
    >
      {label}
    </button>
  );
  return (
    <>
      <div role="tablist" aria-label="Formatting" className="mr-1 flex items-center gap-0.5 rounded-full bg-white/70 p-0.5">
        {tabBtn('math', 'Math formatting')}
        {tabBtn('text', 'Text formatting')}
        {tabBtn('graph', 'Graph')}
      </div>
      <div role="tabpanel" aria-label={tab === 'math' ? 'Math formatting' : tab === 'text' ? 'Text formatting' : 'Graph'} className="flex flex-wrap items-center gap-0.5" data-testid={`format-panel-${tab}`}>
        {tab === 'math' ? <MathFormattingTab /> : tab === 'text' ? <TextFormattingTab /> : <GraphTab />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export function DocsHeader() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const title = useAppStore((s) => s.title);
  const saveState = useAppStore((s) => s.saveState);
  const settings = useAppStore((s) => s.settings);
  const panelOpen = useAppStore((s) => s.panelOpen);
  const paramsOpen = useAppStore((s) => s.paramsOpen);
  const leftTab = useAppStore((s) => s.leftTab);
  const { updateTitle, updateSettings, togglePanel, showLeftTab, openDialog } = useAppStore.getState();
  const tool = useCanvasStore((s) => s.tool);
  const zoom = useCanvasStore((s) => s.camera.z);
  const isGrid = useCanvasStore((s) => s.isGrid);
  const isSnap = useCanvasStore((s) => s.isSnap);
  const undoable = useCanvasStore(canUndo);
  const redoable = useCanvasStore((s) => s.redoStack.length > 0);

  const menus: Record<string, MenuEntry[]> = {
    File: [
      { label: 'New worksheet', onSelect: () => void commands.newWorksheet(false) },
      { type: 'heading', label: 'New from template' },
      ...TEMPLATES.map((t) => ({ label: t.name, onSelect: () => void commands.newFromTemplate(t.id) })),
      { type: 'separator' },
      { label: 'Open…', shortcut: `${MOD}O`, onSelect: commands.open },
      { label: 'Save', shortcut: `${MOD}S`, onSelect: () => void commands.save() },
      { type: 'separator' },
      { label: 'Open file (.mCalcCanvas / .json)…', shortcut: `${MOD}⇧O`, onSelect: () => void commands.importJson() },
      { label: 'Save to file (.mCalcCanvas)…', shortcut: `${MOD}⇧S`, onSelect: () => void commands.saveToFile() },
      { label: 'Download as JSON', onSelect: () => commands.exportJson() },
      { label: 'Download PDF / Print…', shortcut: `${MOD}P`, onSelect: () => void commands.exportPdf() },
      { type: 'separator' },
      { label: 'Page setup: landscape', checked: settings.pageOrientation === 'landscape', onSelect: () => updateSettings({ pageOrientation: settings.pageOrientation === 'landscape' ? 'portrait' : 'landscape' }) },
      { label: 'Worksheet details…', onSelect: () => togglePanel(true) },
    ],
    Edit: [
      { label: 'Undo', shortcut: `${MOD}Z`, onSelect: commands.undo },
      { label: 'Redo', shortcut: `${MOD}Y`, onSelect: commands.redo },
      { type: 'separator' },
      { label: 'Cut', shortcut: `${MOD}X`, onSelect: commands.cut },
      { label: 'Copy', shortcut: `${MOD}C`, onSelect: commands.copy },
      { label: 'Paste', shortcut: `${MOD}V`, onSelect: () => void commands.paste() },
      { label: 'Duplicate', shortcut: `${MOD}D`, onSelect: commands.duplicate },
      { label: 'Delete', shortcut: 'Del', onSelect: commands.deleteSelection },
      { type: 'separator' },
      { label: 'Select all', shortcut: `${MOD}A`, onSelect: commands.selectAll },
      { label: 'Group', shortcut: `${MOD}G`, onSelect: commands.group },
      { label: 'Ungroup', shortcut: `${MOD}⇧G`, onSelect: commands.ungroup },
    ],
    View: [
      { label: 'Page layout', checked: settings.canvasMode === 'page', onSelect: () => commands.setCanvasMode('page') },
      { label: 'Free canvas (no margins)', checked: settings.canvasMode === 'free', onSelect: () => commands.setCanvasMode('free') },
      { type: 'separator' },
      { label: 'Grid', checked: isGrid, onSelect: commands.toggleGrid },
      { label: 'Snap to grid', checked: isSnap, onSelect: commands.toggleSnap },
      { label: 'Snap equations to minor grid lines', checked: settings.baselineSnap === 'minor', onSelect: () => updateSettings({ baselineSnap: settings.baselineSnap === 'minor' ? 'major' : 'minor' }) },
      { label: 'Header & footer', checked: settings.showHeaderFooter, onSelect: () => updateSettings({ showHeaderFooter: !settings.showHeaderFooter }) },
      { label: 'Outline', checked: paramsOpen && leftTab === 'outline', onSelect: () => showLeftTab('outline') },
      { label: 'Parameters', checked: paramsOpen && leftTab === 'params', onSelect: () => showLeftTab('params') },
      { label: 'Properties panel', checked: panelOpen, onSelect: () => togglePanel() },
      { type: 'separator' },
      { label: 'Zoom in', onSelect: commands.zoomIn },
      { label: 'Zoom out', onSelect: commands.zoomOut },
      { label: 'Zoom to 100%', onSelect: commands.resetZoom },
    ],
    Insert: [
      { label: 'Equation', shortcut: 'type', onSelect: () => commands.insertMath() },
      { label: 'Check (≤ limit)', onSelect: () => commands.insertCheck() },
      { label: 'Text', shortcut: '"', onSelect: () => commands.setTool('text') },
      { label: 'Image…', onSelect: () => void commands.insertImage() },
      { label: 'Graph (X-Y plot)', onSelect: () => commands.insertGraph() },
      { type: 'separator' },
      { label: 'Section heading', onSelect: () => addHeading(1) },
      { label: 'Sub-section heading', onSelect: () => addHeading(2) },
      { label: 'Annex link', onSelect: () => insertAnnexLink() },
      { type: 'separator' },
      { label: 'Blank page', shortcut: `${MOD}↵`, onSelect: commands.insertBlankPage },
      { label: 'Delete empty page', onSelect: commands.deletePage },
      { type: 'separator' },
      { label: 'Line', onSelect: () => commands.setTool('line') },
      { label: 'Arrow', onSelect: () => commands.setTool('arrow') },
      { label: 'Rectangle', onSelect: () => commands.setTool('rect') },
      { label: 'Freehand', onSelect: () => commands.setTool('draw') },
    ],
    Format: [
      { type: 'heading', label: 'Equation display' },
      { label: 'Automatic', onSelect: () => commands.setDisplayMode('auto') },
      { label: 'Formula only', onSelect: () => commands.setDisplayMode('formula') },
      { label: 'Result only', onSelect: () => commands.setDisplayMode('result') },
      { label: 'Formula = result', onSelect: () => commands.setDisplayMode('formulaResult') },
      { label: 'Full calculation', onSelect: () => commands.setDisplayMode('full') },
      { type: 'heading', label: 'Paragraph style (text)' },
      ...([0, 1, 2, 3] as const).map((l) => ({ label: PARAGRAPH_STYLES[l].label, shortcut: `${MOD}⌥${l}`, onSelect: () => setParagraphStyle(selectedTextIds(), l) })),
      { type: 'separator' },
      { label: 'Text, colour & units…', onSelect: () => togglePanel(true) },
      { type: 'separator' },
      { label: 'Help: formats & units', onSelect: () => openDialog('guide') },
    ],
    Tools: [
      { label: 'Calculate all', shortcut: 'F9', onSelect: commands.calculateAll },
      { label: 'Sort annex by link order', onSelect: () => sortAnnexByLinkOrder() },
      { type: 'heading', label: 'Unit system' },
      { label: 'SI (kN, m, kPa)', checked: settings.unitSystem === 'SI', onSelect: () => updateSettings({ unitSystem: 'SI' }) },
      { label: 'USCS (kip, ft, ksi)', checked: settings.unitSystem === 'Imperial', onSelect: () => updateSettings({ unitSystem: 'Imperial' }) },
      { type: 'heading', label: 'Decimal places' },
      ...[1, 2, 3, 4].map((p) => ({ label: String(p), checked: settings.precision === p, onSelect: () => updateSettings({ precision: p }) })),
    ],
    Help: [
      { label: 'Keyboard shortcuts', onSelect: () => openDialog('shortcuts') },
      { label: 'Display formats & units guide', onSelect: () => openDialog('guide') },
      { label: 'Math syntax, units & constants', onSelect: () => openDialog('syntax') },
      { label: 'About CalcCanvas', onSelect: () => openDialog('about') },
    ],
  };

  const zoomPct = Math.round(zoom * 100);
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
            <span data-testid="save-state" aria-live="polite" className="whitespace-nowrap text-[12px] text-docs-muted">
              {saveState === 'saved' ? 'Saved to this browser' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved (no storage)' : 'Unsaved changes'}
            </span>
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
              />
            ))}
          </nav>
        </div>
        <button
          type="button"
          onClick={commands.calculateAll}
          title="Calculate all (F9)"
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[14px] text-docs-ink transition-colors duration-150 hover:bg-docs-hover"
        >
          <Calculator size={17} aria-hidden /> Calculate
        </button>
        <button
          type="button"
          data-testid="export-pdf"
          onClick={() => void commands.exportPdf()}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-docs-share px-5 text-[14px] font-medium text-docs-ink transition-colors duration-150 hover:bg-docs-share-hover"
        >
          <FileDown size={17} aria-hidden /> Export PDF
        </button>
      </div>

      {/* Toolbar */}
      <div role="toolbar" aria-label="Formatting" className="mx-2 mb-1.5 mt-1.5 flex min-h-10 flex-wrap items-center gap-x-0.5 gap-y-0.5 rounded-[20px] bg-docs-toolbar px-3 py-1">
        <TB icon={Undo2} label={`Undo (${MOD}Z)`} disabled={!undoable} onClick={commands.undo} />
        <TB icon={Redo2} label={`Redo (${MOD}Y)`} disabled={!redoable} onClick={commands.redo} />
        <TBSelect
          label="Zoom"
          value={[50, 75, 90, 100, 125, 150, 200].includes(zoomPct) ? zoomPct : 'cur'}
          width={74}
          onChange={(v) => {
            if (v === 'fit') commands.zoomToFit();
            else if (v !== 'cur') zoomAt({ x: viewport.w / 2, y: viewport.h / 2 }, Number(v) / 100 / useCanvasStore.getState().camera.z);
          }}
          options={[...(![50, 75, 90, 100, 125, 150, 200].includes(zoomPct) ? [['cur', `${zoomPct}%`] as [string, string]] : []), ...[50, 75, 90, 100, 125, 150, 200].map((z) => [z, `${z}%`] as [number, string]), ['fit', 'Fit']]}
        />
        <Sep />
        <TB icon={Sigma} label="Insert equation (or just type on the page)" active={tool === 'math'} onClick={() => commands.setTool('math')} testId="tool-math" />
        <TB icon={Type} label="Text (or type &quot;)" active={tool === 'text'} onClick={() => commands.setTool('text')} testId="tool-text" />
        <TB icon={CheckSquare} label="Insert check (≤ 1)" onClick={() => commands.insertCheck()} testId="insert-check" />
        <TB icon={ImagePlus} label="Insert image" onClick={() => void commands.insertImage()} />
        <TB icon={LineChart} label="Insert X-Y graph" onClick={() => commands.insertGraph()} testId="insert-graph" />
        <TB icon={FilePlus2} label="Insert blank page (Ctrl+Enter)" onClick={commands.insertBlankPage} testId="insert-page" />
        <Sep />
        <ToolButtons />
        <Sep />
        <FormatTabs />
        <div className="ml-auto flex items-center gap-0.5 pl-2">
          <TB icon={ListTree} label="Outline" active={paramsOpen && leftTab === 'outline'} onClick={() => showLeftTab('outline')} testId="toggle-outline" />
          <TB icon={Variable} label="Parameters" active={paramsOpen && leftTab === 'params'} onClick={() => showLeftTab('params')} testId="toggle-params" />
          <TB icon={Grid3x3} label="Grid" active={isGrid} onClick={commands.toggleGrid} testId="toggle-grid" />
          <TB icon={PanelTop} label="Header & footer" active={settings.showHeaderFooter} onClick={() => updateSettings({ showHeaderFooter: !settings.showHeaderFooter })} testId="toggle-chrome" />
          <TB icon={PanelRight} label="Properties panel" active={panelOpen} onClick={() => togglePanel()} testId="toggle-properties" />
        </div>
      </div>
    </header>
  );
}
