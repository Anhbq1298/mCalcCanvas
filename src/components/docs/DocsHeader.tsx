/**
 * Google Docs–style chrome: document title + menu row, then one rounded
 * toolbar. Controls act on what is selected (or being edited).
 */
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  BookOpen,
  Eraser,
  FileText,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Info,
  Keyboard,
  Link2,
  Unlink,
  Maximize,
  MoveHorizontal,
  RectangleHorizontal,
  RectangleVertical,
  RotateCcw,
  Ruler,
  ScissorsLineDashed,
  SquareDashed,
  ArrowUpRight,
  Bold,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Table2,
  Trash2,
  BoxSelect,
  Group as Group_,
  Heading2,
  Ungroup,
  ClipboardPaste,
  Copy,
  CopyPlus,
  FileMinus2,
  Heading,
  Scale,
  Scissors,
  Search,
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
  Pencil,
  Plus,
  Redo2,
  Sigma,
  Square,
  TableProperties,
  Type,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { addHeading, setTextStyle } from '../../canvas/headings';
import { insertAnnexLink, sortAnnexByLinkOrder } from '../../canvas/annexActions';
import { unitPatch } from '../../canvas/inputUnits';
import { TEMPLATES } from '../../documents/templates';
import { useState, type ReactNode } from 'react';
import { commands, type ToolId } from '../../app/commands';
import { newGraphSeries, viewport, zoomAt } from '../../canvas/canvasActions';
import { canUndo, updateShapes, useCanvasStore, type ShapePatch } from '../../canvas/model/canvasStore';
import { fontStack, PARAGRAPH_STYLES, TEXT_FONTS, TEXT_STYLES, type GraphShape, type HeadingLevel, type MathDisplayMode, type MathFontStyle, type Shape, type TextStyleId } from '../../canvas/model/types';
import { formatEditingText, hasTextSelection } from '../../canvas/textFormatting';
import { useAppStore } from '../../store/appStore';
import { DEFAULT_LABEL_STYLES, DEFAULT_MARGINS, type ResultFormat } from '../../documents/DocumentTypes';
import { MARGIN_PRESETS, presetOf } from '../../export/marginPresets';
import { safeHref } from '../../canvas/sanitize';
import { withShortcut } from '../../app/shortcuts';
import { parseDisplayUnit } from '../../engine/light';
import { MenuButton, type MenuEntry } from '../common/MenuButton';
import { CONSTANTS, OPERATORS, SYMBOLS, UNITS_PALETTE } from '../ribbon/palettes';
import { Popover, PalettePopover } from './Popover';
import { CharacterMap } from './CharacterMap';
import { ShapeGallery } from './ShapeGallery';
import { DimensionPicker, FunctionsMenu, OperatorsMenu } from '../ribbon/MatricesTablesRibbon';
import { applyGridCommand, type GridCommand } from '../../canvas/matrixTableCommands';

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

/** A ribbon group: controls (one or two rows) with its name underneath, like Mathcad Prime. */
function Group({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="rb-group" role="group" aria-label={label} data-testid={testId}>
      <div className="rb-controls">{children}</div>
      <div className="rb-label">{label}</div>
    </div>
  );
}
const Row = ({ children }: { children: ReactNode }) => <div className="rb-row">{children}</div>;

/** Small labelled checkbox for the ribbon. */
function Check({ label, checked, onChange, testId, title, disabled, mixed }: { label: string; checked: boolean; onChange(v: boolean): void; testId?: string; title?: string; disabled?: boolean; mixed?: boolean }) {
  return (
    <label className={'rb-check ' + (disabled ? 'opacity-40' : '')} title={title ?? label}>
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = !!mixed;
        }}
        onMouseDown={(e) => e.preventDefault()}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/** Large ribbon button: icon above the label (the main commands of a group, as in Mathcad Prime). */
function BigButton({ icon: Icon, label, onClick, testId, title, disabled, active }: { icon: LucideIcon; label: string; onClick(): void; testId?: string; title?: string; disabled?: boolean; active?: boolean }) {
  return (
    <button type="button" className={'rb-big ' + (active ? 'is-active' : '')} title={title ?? label} aria-label={title ?? label} aria-pressed={active} data-testid={testId} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <span className="rb-big-icon">
        <Icon size={24} strokeWidth={1.6} aria-hidden />
      </span>
      <span className="rb-big-text">{label}</span>
    </button>
  );
}

/** Small ribbon button: icon with its label to the right, stacked three per column. */
function SmallButton({ icon: Icon, label, onClick, testId, title, disabled, active }: { icon: LucideIcon; label: string; onClick(): void; testId?: string; title?: string; disabled?: boolean; active?: boolean }) {
  return (
    <button type="button" className={'rb-small ' + (active ? 'is-active' : '')} title={title ?? label} aria-label={title ?? label} aria-pressed={active} data-testid={testId} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <Icon size={15} strokeWidth={1.8} aria-hidden />
      <span>{label}</span>
    </button>
  );
}

/** A column of up to three small controls. */
const Col = ({ children }: { children: ReactNode }) => <div className="rb-col">{children}</div>;

/** A labelled field row inside a column: "Unit [____]". */
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="rb-field">
    <span className="rb-mini">{label}</span>
    {children}
  </div>
);

/** Swatch colour picker (no text), for label styles and highlights. */
function SwatchPicker({ testId, title, value, onPick, allowNone }: { testId: string; title: string; value: string | null; onPick(c: string | null): void; allowNone?: boolean }) {
  return (
    <Popover
      title={title}
      testId={testId}
      width={216}
      trigger={
        <span className="flex items-center gap-1">
          <span className="h-3.5 w-3.5 rounded-sm border border-black/20" style={{ background: value ?? 'transparent' }} />
        </span>
      }
    >
      {(close) => (
        <div className="space-y-2">
          <div className="grid grid-cols-6 gap-1">
            {[...HIGHLIGHTS, ...COLOR_GRID.slice(6, 18)].map((c) => (
              <button key={c} type="button" aria-label={`Color ${c}`} title={c} onMouseDown={(e) => e.preventDefault()} onClick={() => (onPick(c), close())} className="h-6 w-6 cursor-pointer rounded border border-black/10" style={{ background: c }} />
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-docs-border pt-2 text-[12px]">
            <input type="color" aria-label={`${title}: custom colour`} value={value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff'} onChange={(e) => onPick(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-docs-border p-0.5" />
            Custom…
            {allowNone && (
              <button type="button" className="ml-auto text-docs-blue" onMouseDown={(e) => e.preventDefault()} onClick={() => (onPick(null), close())}>
                None
              </button>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}

const HIGHLIGHTS = ['#fff59d', '#fff6bf', '#c8e6c9', '#b3e5fc', '#f8bbd0', '#ffe0b2'];

function TBSelect({ value, onChange, options, label, width, testId, style, disabled }: { value: string | number; onChange(v: string): void; options: [string | number, string][]; label: string; width: number; testId?: string; style?: React.CSSProperties; disabled?: boolean }) {
  return (
    <select
      aria-label={label}
      title={label}
      data-testid={testId}
      disabled={disabled}
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

/** Text Formatting tab: Text Font, Paragraph, Styles, Links (Mathcad Prime layout). */
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
  const editingId = useCanvasStore((s) => s.editingId);
  const styleTargets = editingText && editingId ? [editingId] : textIds;
  const level = text?.type === 'text' ? (text.props.heading ?? 0) : 0;
  const styleValue = text?.type === 'text' ? (text.props.textStyle ?? String(level)) : '';
  const fmt = (icon: LucideIcon, label: string, command: string, testId?: string) => (
    <TB icon={icon} label={label} disabled={!editingText} testId={testId} onClick={() => formatEditingText(command)} />
  );
  const link = () => {
    if (!hasTextSelection()) {
      useAppStore.getState().showToast('info', 'Select the text to link first (while editing the text region).');
      return;
    }
    const url = window.prompt('Link address (https://…, http://… or mailto:…)', 'https://');
    if (url === null) return;
    const href = safeHref(url);
    if (!href) {
      useAppStore.getState().showToast('error', 'Only http, https and mailto links are allowed.');
      return;
    }
    formatEditingText('createLink', href);
  };
  const styles: { id: string; label: string; apply: HeadingLevel | TextStyleId; css: React.CSSProperties }[] = [
    { id: '0', label: 'Normal', apply: 0, css: { fontSize: 12 } },
    { id: 'title', label: 'Title', apply: 'title', css: { fontSize: 14, fontWeight: 700, color: TEXT_STYLES.title.color } },
    { id: 'subtitle', label: 'Subtitle', apply: 'subtitle', css: { fontSize: 12, fontStyle: 'italic', color: TEXT_STYLES.subtitle.color } },
    { id: '1', label: 'Heading 1', apply: 1, css: { fontSize: 13, fontWeight: 700, color: PARAGRAPH_STYLES[1].color } },
    { id: '2', label: 'Heading 2', apply: 2, css: { fontSize: 12, fontWeight: 700 } },
    { id: '3', label: 'Heading 3', apply: 3, css: { fontSize: 11, fontWeight: 600, color: PARAGRAPH_STYLES[3].color } },
  ];
  return (
    <>
      <Group label="Text Font">
        <Row>
          <TBSelect
            label={text ? 'Font' : 'Font for new text'}
            testId="text-font"
            value={font}
            width={132}
            style={{ fontFamily: fontStack(font) }}
            onChange={setFont}
            options={Object.keys(TEXT_FONTS).map((f) => [f, f])}
          />
          <SizeControl kinds={['text']} label="Font size" />
        </Row>
        <Row>
          {fmt(Bold, `Bold (${MOD}B)`, 'bold')}
          {fmt(Italic, `Italic (${MOD}I)`, 'italic')}
          {fmt(Underline, `Underline (${MOD}U)`, 'underline')}
          {fmt(Subscript, 'Subscript', 'subscript')}
          {fmt(Superscript, 'Superscript', 'superscript')}
        </Row>
        <Row>
          <ColorButton testId="text-color" title="Text color" kinds={['text']} />
          <SwatchPicker testId="text-highlight" title="Text highlight colour (select text while editing)" value={null} onPick={(c) => formatEditingText('hiliteColor', c ?? 'transparent')} allowNone />
          {fmt(Eraser, 'Clear formatting of the selected text', 'removeFormat', 'text-clear')}
        </Row>
      </Group>
      <Group label="Paragraph">
        <Row>
          <AlignControls />
        </Row>
        <Row>
          {fmt(List, 'Bulleted list', 'insertUnorderedList')}
          {fmt(ListOrdered, 'Numbered list', 'insertOrderedList')}
        </Row>
        <Row>
          {fmt(IndentDecrease, 'Decrease indent', 'outdent', 'text-outdent')}
          {fmt(IndentIncrease, 'Increase indent', 'indent', 'text-indent')}
        </Row>
      </Group>
      <Group label="Styles">
        <div className="rb-gallery" role="listbox" aria-label="Text styles">
          {styles.map((st) => (
            <button
              key={st.id}
              type="button"
              role="option"
              aria-selected={styleValue === st.id}
              data-testid={`text-style-${st.id}`}
              disabled={!styleTargets.length}
              title={`Style: ${st.label}${typeof st.apply === 'number' ? ` (${MOD}Alt+${st.apply})${st.apply > 0 ? ', shown in the outline' : ''}` : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setTextStyle(styleTargets, st.apply)}
              className="rb-style"
            >
              <span style={st.css}>{st.label}</span>
            </button>
          ))}
        </div>
        <TBSelect
          label="Paragraph style (headings appear in the outline)"
          testId="paragraph-style"
          value={textIds.length ? styleValue : ''}
          width={0}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
          onChange={(v) => setTextStyle(textIds, v === 'title' || v === 'subtitle' ? v : (Number(v) as HeadingLevel))}
          options={[...(textIds.length ? [] : [['', 'Style'] as [string, string]]), ...([0, 1, 2, 3] as const).map((l) => [l, PARAGRAPH_STYLES[l].label] as [number, string]), ['title', 'Title'], ['subtitle', 'Subtitle']]}
        />
      </Group>
      <Group label="Links">
        <Col>
          <SmallButton icon={Link2} label="Link" title="Insert or edit a link on the selected text (http, https, mailto)" disabled={!editingText} onClick={link} testId="text-link" />
          <SmallButton icon={Unlink} label="Remove link" disabled={!editingText} onClick={() => formatEditingText('unlink')} testId="text-unlink" />
        </Col>
      </Group>
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
  const currentFontStyle = first?.props.fontStyle ?? 'normal';
  const isMathBold = currentFontStyle === 'bold' || currentFontStyle === 'bold-italic';
  const isMathItalic = currentFontStyle === 'italic' || currentFontStyle === 'bold-italic';
  const toggleMathStyle = (kind: 'bold' | 'italic') => {
    const bold = kind === 'bold' ? !isMathBold : isMathBold;
    const italic = kind === 'italic' ? !isMathItalic : isMathItalic;
    const style: MathFontStyle = bold ? (italic ? 'bold-italic' : 'bold') : italic ? 'italic' : 'normal';
    patchSelected((sh) => (sh.type === 'math' ? { props: { fontStyle: style } } : null));
  };
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
    const { selection, shapes } = useCanvasStore.getState();
    const targets = selection.map((id) => shapes[id]).filter((s): s is Shape => !!s);
    Promise.all(targets.map(async (s) => [s.id, await unitPatch(s, v)] as const)).then(
      (list) => {
        const patches: Record<string, ShapePatch> = {};
        for (const [id, p] of list) if (p) patches[id] = p;
        if (Object.keys(patches).length) updateShapes(patches);
        setUnitError(null);
      },
      (e: Error) => setUnitError(e.message),
    );
  };
  // Results: the selected equations, or the worksheet defaults when none is selected.
  const formats = new Set(math.map((m) => m.props.resultFormat ?? 'inherit'));
  const zeros = new Set(math.map((m) => m.props.trailingZeros ?? 'inherit'));
  const formatValue = !first ? settings.resultFormat ?? 'general' : formats.size > 1 ? 'mixed' : (first.props.resultFormat ?? 'inherit');
  const setFormat = (v: string) => {
    if (v === 'mixed') return;
    if (!first) useAppStore.getState().updateSettings({ resultFormat: v as ResultFormat });
    else patchSelected((sh) => (sh.type === 'math' ? { props: { resultFormat: v === 'inherit' ? undefined : (v as ResultFormat) } } : null));
  };
  const zerosOn = !first ? !!settings.trailingZeros : (first.props.trailingZeros ?? !!settings.trailingZeros);
  const setZeros = (v: boolean) => {
    if (!first) useAppStore.getState().updateSettings({ trailingZeros: v });
    else patchSelected((sh) => (sh.type === 'math' ? { props: { trailingZeros: v } } : null));
  };
  const resetResults = () => {
    if (!first) useAppStore.getState().updateSettings({ resultFormat: undefined, trailingZeros: undefined, precision: 2 });
    else patchSelected((sh) => (sh.type === 'math' ? { props: { resultFormat: undefined, trailingZeros: undefined, precision: -1, displayUnit: '', displayMode: 'auto' } } : null));
  };
  const resetFormatting = () =>
    patchSelected((sh) => (sh.type === 'math' ? { props: { textFont: 'Inter', fontStyle: 'normal', fontSize: 16, color: '#0f172a', highlight: undefined } } : null));
  const labels = settings.labelStyles ?? DEFAULT_LABEL_STYLES;
  const setLabel = (k: keyof typeof labels, c: string | null) => useAppStore.getState().updateSettings({ labelStyles: { ...labels, [k]: c ?? DEFAULT_LABEL_STYLES[k] } });
  const fmtNames: [string, string][] = [['general', 'General'], ['decimal', 'Decimal'], ['scientific', 'Scientific'], ['engineering', 'Engineering']];
  return (
    <>
      <Group label="Display">
        <Col>
          <Field label="Show">
            <DisplayModeSelect />
          </Field>
          <Field label="Unit">
            <input
              aria-label="Result unit"
              title={unitError ?? 'Result unit for the selected equations (e.g. kN·m, MPa). Empty = automatic.'}
              data-testid="math-result-unit"
              list="cc-result-units"
              disabled={!first}
              placeholder="automatic"
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
              className={'rb-input w-[132px] ' + (unitError ? 'border-destructive' : '')}
            />
          </Field>
          <datalist id="cc-result-units">
            {RESULT_UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <Field label="Array">
            <TBSelect
              label="Array results of the selected equations: row or column, shortened (first … last) or every entry"
              testId="math-array"
              value={first ? `${first.props.vectorLayout ?? 'row'}-${first.props.vectorExpanded ? 'all' : 'short'}` : 'row-short'}
              width={132}
              onChange={(v) => {
                const [layout, entries] = v.split('-');
                patchSelected((sh) =>
                  sh.type === 'math' ? { props: { vectorLayout: layout === 'column' ? 'column' : undefined, vectorExpanded: entries === 'all' ? true : undefined } } : null,
                );
              }}
              options={[
                ['row-short', 'Row, shortened'],
                ['row-all', 'Row, all entries'],
                ['column-short', 'Column, shortened'],
                ['column-all', 'Column, all entries'],
              ]}
            />
          </Field>
        </Col>
      </Group>
      <Group label={first ? 'Results' : 'Results (worksheet default)'}>
        <Col>
          <Field label="Format">
            <TBSelect
              label={first ? 'Number format of the selected results (presentation only)' : 'Default number format of results'}
              testId="math-result-format"
              value={formatValue}
              width={124}
              onChange={setFormat}
              options={[...(formatValue === 'mixed' ? [['mixed', 'Mixed'] as [string, string]] : []), ...(first ? [['inherit', `Default (${settings.resultFormat ?? 'general'})`] as [string, string]] : []), ...fmtNames]}
            />
          </Field>
          <Field label="Decimals">
            <TBSelect
              label="Decimal places of the selected equations"
              testId="math-decimals"
              value={first ? String(first.props.precision) : '-1'}
              width={124}
              onChange={(v) => patchSelected((sh) => (sh.type === 'math' ? { props: { precision: Number(v) } } : null))}
              options={[['-1', `Auto (${settings.precision})`], ...[0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), `${d}`] as [string, string])]}
            />
          </Field>
          <Check label="Show trailing zeros" testId="math-trailing-zeros" checked={zerosOn} mixed={zeros.size > 1} onChange={setZeros} title="Show trailing zeros (2.50 instead of 2.5); the value is not rounded" />
        </Col>
        <BigButton icon={RotateCcw} label="Reset" title={first ? 'Reset result formatting of the selected equations' : 'Reset the worksheet result defaults'} onClick={resetResults} testId="math-reset-results" />
      </Group>
      <Group label="Math Font">
        <Col>
          <Field label="Text font">
            <TBSelect
              label="Text font of the selected equations"
              testId="math-text-font"
              disabled={!first}
              value={first?.props.textFont ?? 'Inter'}
              width={132}
              style={{ fontFamily: fontStack(first?.props.textFont ?? 'Inter') }}
              onChange={(v) => patchSelected((sh) => (sh.type === 'math' ? { props: { textFont: v } } : null))}
              options={Object.keys(TEXT_FONTS).map((f) => [f, f])}
            />
          </Field>
          <div className="rb-field" aria-label="Math font style">
            <TB icon={Bold} label="Bold equation" active={isMathBold} disabled={!first} testId="math-font-bold" onClick={() => toggleMathStyle('bold')} />
            <TB icon={Italic} label="Italic equation" active={isMathItalic} disabled={!first} testId="math-font-italic" onClick={() => toggleMathStyle('italic')} />
          </div>
          <div className="rb-field">
            <SizeControl kinds={['math']} label="Equation size" />
          </div>
          <div className="rb-field">
            <ColorButton testId="math-color" title="Equation color" kinds={['math']} />
            <SwatchPicker testId="math-highlight" title="Highlight the selected equations" value={first?.props.highlight ?? null} allowNone onPick={(c) => patchSelected((sh) => (sh.type === 'math' ? { props: { highlight: c ?? undefined } } : null))} />
          </div>
          <SmallButton icon={Eraser} label="Clear format" title="Reset text font, size, colour and highlight of the selected equations" disabled={!first} onClick={resetFormatting} testId="math-reset-format" />
        </Col>
      </Group>
      <Group label="Label Styles">
        <Col>
          <Field label="Units">
            <SwatchPicker testId="label-unit-color" title="Colour of units (whole worksheet)" value={labels.unitColor} onPick={(c) => setLabel('unitColor', c)} />
          </Field>
          <Field label="Inputs">
            <SwatchPicker testId="label-input-color" title="Text colour of inputs (literal definitions)" value={labels.inputColor} onPick={(c) => setLabel('inputColor', c)} />
            <SwatchPicker testId="label-input-bg" title="Background of inputs" value={labels.inputBackground} onPick={(c) => setLabel('inputBackground', c)} />
          </Field>
          <SmallButton icon={RotateCcw} label="Default styles" onClick={() => useAppStore.getState().updateSettings({ labelStyles: undefined })} testId="label-reset" />
        </Col>
      </Group>
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
  const set = (a: 'left' | 'center' | 'right' | 'justify') => patchSelected((s) => (s.type === 'text' ? { props: { align: a } } : null));
  return (
    <>
      <TB icon={AlignLeft} label="Left align" disabled={!text} active={!!text && align === 'left'} onClick={() => set('left')} />
      <TB icon={AlignCenter} label="Center align" disabled={!text} active={!!text && align === 'center'} onClick={() => set('center')} />
      <TB icon={AlignRight} label="Right align" disabled={!text} active={!!text && align === 'right'} onClick={() => set('right')} />
      <TB icon={AlignJustify} label="Justify" disabled={!text} active={!!text && align === 'justify'} onClick={() => set('justify')} testId="text-justify" />
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

/** Math tab: clipboard, regions, operators and symbols, selection. */
function MathTab() {
  const tool = useCanvasStore((s) => s.tool);
  return (
    <>
      <Group label="Clipboard">
        <BigButton icon={ClipboardPaste} label="Paste" title={`Paste (${MOD}V)`} onClick={() => void commands.paste()} />
        <Col>
          <SmallButton icon={Scissors} label="Cut" title={`Cut (${MOD}X)`} onClick={commands.cut} />
          <SmallButton icon={Copy} label="Copy" title={`Copy (${MOD}C)`} onClick={commands.copy} />
          <SmallButton icon={CopyPlus} label="Duplicate" title={`Duplicate (${MOD}D)`} onClick={commands.duplicate} />
        </Col>
      </Group>
      <Group label="Regions">
        <BigButton icon={Sigma} label="Math" title="Math region (or just type on the page)" active={tool === 'math'} onClick={() => commands.setTool('math')} testId="tool-math" />
        <BigButton icon={Type} label="Text" title="Text region (or type &quot;)" active={tool === 'text'} onClick={() => commands.setTool('text')} testId="tool-text" />
        <Col>
          <SmallButton icon={CheckSquare} label="Check" title="Insert check (≤ 1)" onClick={() => commands.insertCheck()} testId="insert-check" />
          <SmallButton icon={Heading} label="Heading" title="Section heading (shown in the outline)" onClick={() => addHeading(1)} />
          <SmallButton icon={Heading2} label="Sub-heading" title="Sub-section heading (shown in the outline)" onClick={() => addHeading(2)} />
        </Col>
        <Col>
          <SmallButton icon={Link2} label="Annex link" title="Link to a new annex block on the ANNEX page" onClick={() => insertAnnexLink()} testId="insert-annex" />
        </Col>
      </Group>
      <Group label="Operators and Symbols">
        <PalettePopover big label="Operators" glyph="√" sections={OPERATORS} testId="palette-operators" columns={5} />
        <PalettePopover big label="Symbols" glyph="β" sections={SYMBOLS} testId="palette-symbols" />
        <PalettePopover big label="Constants" glyph="π" sections={CONSTANTS} testId="palette-constants" />
        <PalettePopover big label="Units" glyph="m" sections={UNITS_PALETTE} testId="palette-units" />
      </Group>
      <Group label="Selection">
        <Col>
          <SmallButton icon={BoxSelect} label="Select all" title={`Select all (${MOD}A)`} onClick={commands.selectAll} />
          <SmallButton icon={Group_} label="Group" title={`Group (${MOD}G)`} onClick={commands.group} />
          <SmallButton icon={Ungroup} label="Ungroup" title={`Ungroup (${MOD}⇧G)`} onClick={commands.ungroup} />
        </Col>
      </Group>
    </>
  );
}

/** Insert tab: free drawing tools, ready-made shapes, images and special characters. */
function InsertTab() {
  const tool = useCanvasStore((s) => s.tool);
  const t = (id: ToolId, icon: LucideIcon, label: string) => <SmallButton icon={icon} label={label} active={tool === id} onClick={() => commands.setTool(id)} testId={`tool-${id}`} />;
  return (
    <>
      <Group label="Free Shapes">
        <Col>
          {t('select', MousePointer2, 'Select')}
          {t('hand', Hand, 'Pan')}
          {t('draw', Pencil, 'Freehand')}
        </Col>
        <Col>
          {t('line', Minus, 'Line')}
          {t('arrow', ArrowUpRight, 'Arrow')}
          {t('rect', Square, 'Rectangle')}
        </Col>
      </Group>
      <Group label="Shapes">
        <ShapeGallery />
      </Group>
      <Group label="Image">
        <BigButton icon={ImagePlus} label="Image" title="Insert an image (PNG, JPG, SVG…)" onClick={() => void commands.insertImage()} testId="insert-image" />
      </Group>
      <Group label="Symbols">
        <CharacterMap />
      </Group>
    </>
  );
}

/** Matrices/Tables tab (Mathcad Prime): insert a matrix or table, operators, functions, rows and columns, result display. */
function MatricesTab() {
  const gridSelected = useCanvasStore((s) => {
    if (s.selection.length !== 1) return false;
    const shape = s.shapes[s.selection[0]];
    return shape?.type === 'table' || (shape?.type === 'math' && /\\begin\{bmatrix\}/.test(shape.props.latex));
  });
  const settings = useAppStore((s) => s.settings);
  const toggle = (key: 'showMatrixIndices' | 'collapseNestedMatrices') => useAppStore.getState().updateSettings({ [key]: !settings[key] });
  const cmd = (icon: LucideIcon, label: string, c: GridCommand, testId: string) => <SmallButton icon={icon} label={label} disabled={!gridSelected} onClick={() => applyGridCommand(c)} testId={testId} />;
  return (
    <>
      <Group label="Matrices and Tables">
        <Popover title="Insert matrix" testId="insert-matrix" big="Matrix" width={248} trigger={<Grid3x3 size={24} strokeWidth={1.6} aria-hidden />}>
          {(close) => <DimensionPicker kind="matrix" close={close} />}
        </Popover>
        <Popover title="Insert table" testId="insert-table" big="Table" width={248} trigger={<Table2 size={24} strokeWidth={1.6} aria-hidden />}>
          {(close) => <DimensionPicker kind="table" close={close} />}
        </Popover>
      </Group>
      <Group label="Operators and Functions">
        <Popover title="Vector/matrix operators" testId="matrix-operators" big="Operators" width={310} trigger={<span className="font-math text-[22px] italic leading-none">Aᵀ</span>}>
          {() => <OperatorsMenu />}
        </Popover>
        <Popover title="Vector/matrix functions" testId="matrix-functions" big="Functions" width={520} trigger={<span className="font-math text-[20px] italic leading-none">f(M)</span>}>
          {() => <FunctionsMenu />}
        </Popover>
      </Group>
      <Group label="Rows and Columns">
        <Col>
          {cmd(ArrowUpToLine, 'Insert above', 'above', 'grid-insert-above')}
          {cmd(ArrowDownToLine, 'Insert below', 'below', 'grid-insert-below')}
          {cmd(Trash2, 'Delete row', 'delete-row', 'grid-delete-row')}
        </Col>
        <Col>
          {cmd(ArrowLeftToLine, 'Insert left', 'left', 'grid-insert-left')}
          {cmd(ArrowRightToLine, 'Insert right', 'right', 'grid-insert-right')}
          {cmd(Trash2, 'Delete column', 'delete-column', 'grid-delete-column')}
        </Col>
        <Col>
          {cmd(Eraser, 'Clear cell', 'clear', 'grid-clear')}
        </Col>
      </Group>
      <Group label="Result Format">
        <Col>
          <Check label="Show indices" testId="matrix-indices" checked={!!settings.showMatrixIndices} onChange={() => toggle('showMatrixIndices')} />
          <Check label="Collapse nested" testId="matrix-collapse" checked={!!settings.collapseNestedMatrices} onChange={() => toggle('collapseNestedMatrices')} />
        </Col>
      </Group>
    </>
  );
}

/** Calculation tab: calculate, worksheet units and precision. */
function CalculationTab() {
  const settings = useAppStore((s) => s.settings);
  const { updateSettings } = useAppStore.getState();
  return (
    <>
      <Group label="Worksheet Calculation">
        <BigButton icon={Calculator} label="Calculate" title={withShortcut('Calculate all', 'calculate')} onClick={commands.calculateAll} testId="rb-calculate" />
      </Group>
      <Group label="Worksheet Settings">
        <Col>
          <Field label="Unit system">
            <TBSelect
              label="Unit system for results (whole worksheet)"
              testId="worksheet-units"
              value={settings.unitSystem}
              width={96}
              onChange={(v) => updateSettings({ unitSystem: v as 'SI' | 'Imperial' })}
              options={[['SI', 'SI'], ['Imperial', 'USCS']]}
            />
          </Field>
          <Field label="Decimals">
            <TBSelect
              label="Default decimal places (whole worksheet)"
              testId="worksheet-decimals"
              value={settings.precision}
              width={96}
              onChange={(v) => updateSettings({ precision: Number(v) })}
              options={[0, 1, 2, 3, 4, 5, 6].map((d) => [d, `${d}`])}
            />
          </Field>
          <Field label="Snap">
            <TBSelect
              label="Equations and text snap their baseline to major lines (every 2 squares) or to every grid line"
              testId="baseline-snap"
              value={settings.baselineSnap ?? 'major'}
              width={96}
              onChange={(v) => updateSettings({ baselineSnap: v as 'major' | 'minor' })}
              options={[['major', 'Lines'], ['minor', 'Squares']]}
            />
          </Field>
        </Col>
      </Group>
      <Group label="Annex">
        <Col>
          <SmallButton icon={ListOrdered} label="Sort annex" title="Sort annex blocks by link order" onClick={() => sortAnnexByLinkOrder()} />
        </Col>
      </Group>
    </>
  );
}

/** Plots tab: insert an X-Y plot; axes, options and series of the selected plot. */
function PlotsTab() {
  const selected = useSelectedShapes();
  const graph = selected.find((s): s is GraphShape => s.type === 'graph');
  const [draft, setDraft] = useState<{ field: 'xUnit' | 'yUnit' | 'title'; value: string } | null>(null);
  const [unitError, setUnitError] = useState<string | null>(null);
  const patch = (props: Partial<GraphShape['props']>) => graph && updateShapes({ [graph.id]: { props } as ShapePatch });
  const field = (f: 'xUnit' | 'yUnit' | 'title', label: string, placeholder: string) => (
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
      className={'rb-input w-[120px] ' + (unitError && f !== 'title' ? 'border-destructive' : '')}
    />
  );
  return (
    <>
      <Group label="Insert">
        <BigButton icon={LineChart} label="X-Y Plot" title="Insert X-Y plot" onClick={() => commands.insertGraph()} testId="graph-insert" />
      </Group>
      <Group label="Axes">
        <Col>
          <Field label="Title">{field('title', 'Graph title', 'Title')}</Field>
          <Field label="X unit">{field('xUnit', 'X axis unit', 'automatic')}</Field>
          <Field label="Y unit">{field('yUnit', 'Y axis unit', 'automatic')}</Field>
        </Col>
      </Group>
      <Group label="Options">
        <Col>
          <SmallButton icon={Scale} label="Equal axes" title="Equal axes (same scale on X and Y, for sections and plans)" disabled={!graph} active={!!graph?.props.equalAxes} onClick={() => patch({ equalAxes: !graph!.props.equalAxes })} testId="graph-equal" />
          <SmallButton icon={Grid3x3} label="Grid lines" disabled={!graph} active={!!graph?.props.grid} onClick={() => patch({ grid: !graph!.props.grid })} testId="graph-grid" />
          <SmallButton icon={Crosshair} label="Axes at origin" title="Axes through origin (values on bottom/left)" disabled={!graph} active={!!graph?.props.axesAtOrigin} onClick={() => patch({ axesAtOrigin: !graph!.props.axesAtOrigin })} testId="graph-origin" />
        </Col>
      </Group>
      <Group label="Series">
        <BigButton
          icon={Plus}
          label="Add series"
          title="Add a series (edit x, y and style in the Properties panel)"
          disabled={!graph}
          onClick={() => {
            patch({ series: [...graph!.props.series, newGraphSeries(graph!.props.series)] });
            useAppStore.getState().togglePanel(true);
          }}
          testId="graph-add-series"
        />
        <span className="self-center px-1 text-[12px] text-docs-muted">{graph ? `${graph.props.series.length} series` : 'Select a plot'}</span>
      </Group>
    </>
  );
}

/** Document tab: page setup, show, zoom and page spacing. */
function DocumentTab() {
  const settings = useAppStore((s) => s.settings);
  const view = useAppStore((s) => s.view);
  const isGrid = useCanvasStore((s) => s.isGrid);
  const isSnap = useCanvasStore((s) => s.isSnap);
  const zoom = useCanvasStore((s) => s.camera.z);
  const { updateSettings, setView, openDialog } = useAppStore.getState();
  const paged = settings.canvasMode === 'page';
  const margins = settings.margins ?? DEFAULT_MARGINS;
  const preset = presetOf(margins);
  const zoomPct = Math.round(zoom * 100);
  const steps = [50, 75, 90, 100, 125, 150, 200];
  return (
    <>
      <Group label="Page Setup" testId="group-page-setup">
        <Col>
          <Field label="Size">
            <TBSelect label="Paper size" testId="doc-paper" value={settings.paper ?? 'A4'} width={112} onChange={(v) => updateSettings({ paper: v as 'A4' | 'A3' })} options={[['A4', 'A4'], ['A3', 'A3']]} />
          </Field>
          <Field label="Orientation">
            <TB icon={RectangleVertical} label="Portrait" active={settings.pageOrientation === 'portrait'} onClick={() => updateSettings({ pageOrientation: 'portrait' })} testId="doc-portrait" />
            <TB icon={RectangleHorizontal} label="Landscape" active={settings.pageOrientation === 'landscape'} onClick={() => updateSettings({ pageOrientation: 'landscape' })} testId="doc-landscape" />
          </Field>
          <Field label="Margins">
            <TBSelect
              label="Margins"
              testId="doc-margins"
              value={preset}
              width={112}
              onChange={(v) => (v === 'custom' ? openDialog('page-setup') : updateSettings({ margins: MARGIN_PRESETS.find((p) => p.id === v)!.margins }))}
              options={[...MARGIN_PRESETS.map((p) => [p.id, p.label.split(' (')[0]] as [string, string]), ['custom', preset === 'custom' ? `Custom (${margins.left}/${margins.top})` : 'Custom…']]}
            />
          </Field>
        </Col>
        <BigButton icon={FileText} label="Page Setup" title="Page setup… (paper, orientation, margins, preview)" onClick={() => openDialog('page-setup')} testId="doc-page-setup" />
      </Group>
      <Group label="Show">
        <Col>
          <Check label="Page boundaries" testId="doc-boundaries" checked={view.boundaries} disabled={!paged} onChange={(v) => setView({ boundaries: v })} title="Show the paper edge and the printable area (dashed) of every page" />
          <Check label="Grid" testId="toggle-grid" checked={isGrid} onChange={() => commands.toggleGrid()} />
          <Check label="Ruler" testId="doc-ruler" checked={view.ruler} onChange={(v) => setView({ ruler: v })} title="Millimetre rulers along the top and left (follow zoom and scrolling)" />
        </Col>
        <Col>
          <Check label="Header & footer" testId="toggle-chrome" checked={settings.showHeaderFooter} onChange={(v) => updateSettings({ showHeaderFooter: v })} />
          <Check label="Snap to grid" testId="doc-snap" checked={isSnap} onChange={() => commands.toggleSnap()} />
          <Check label="Pages" testId="doc-pages" checked={paged} onChange={(v) => updateSettings({ canvasMode: v ? 'page' : 'free' })} title="Page layout (checked) or a free canvas without pages" />
        </Col>
      </Group>
      <Group label="Zoom">
        <Col>
          <TBSelect
            label="Zoom"
            value={steps.includes(zoomPct) ? zoomPct : 'cur'}
            width={96}
            onChange={(v) => {
              if (v === 'fit') commands.zoomToFit();
              else if (v !== 'cur') zoomAt({ x: viewport.w / 2, y: viewport.h / 2 }, Number(v) / 100 / useCanvasStore.getState().camera.z);
            }}
            options={[...(!steps.includes(zoomPct) ? [['cur', `${zoomPct}%`] as [string, string]] : []), ...steps.map((z) => [z, `${z}%`] as [number, string]), ['fit', 'Fit content']]}
          />
          <SmallButton icon={Search} label="100 %" title="Actual size (100 %)" onClick={commands.zoomActualSize} testId="doc-zoom-100" />
        </Col>
        <Col>
          <SmallButton icon={Maximize} label="Fit page" onClick={commands.zoomFitPage} testId="doc-fit-page" disabled={!paged} />
          <SmallButton icon={MoveHorizontal} label="Fit width" onClick={commands.zoomFitWidth} testId="doc-fit-width" disabled={!paged} />
        </Col>
      </Group>
      <Group label="Pages">
        <BigButton icon={ScissorsLineDashed} label="Page Break" title={withShortcut('Page break at the + cross', 'page-break')} onClick={commands.pageBreak} testId="doc-page-break" disabled={!paged} />
        <Col>
          <SmallButton icon={FilePlus2} label="Blank page" title={withShortcut('Insert blank page', 'blank-page')} onClick={commands.insertBlankPage} testId="insert-page" disabled={!paged} />
          <SmallButton icon={FileMinus2} label="Delete empty page" onClick={commands.deletePage} disabled={!paged} testId="doc-delete-page" />
        </Col>
      </Group>
    </>
  );
}

/** Help tab: help center, shortcuts and guides. */
function HelpTab() {
  const { openHelp, openDialog } = useAppStore.getState();
  return (
    <>
      <Group label="Help">
        <BigButton icon={BookOpen} label="Help Center" onClick={() => openHelp('getting-started')} testId="help-open" title={withShortcut('Help center', 'help')} />
        <BigButton icon={Keyboard} label="Shortcuts" onClick={() => openHelp('shortcuts')} testId="help-shortcuts" title="Keyboard shortcuts (searchable)" />
      </Group>
      <Group label="Guides">
        <BigButton icon={Highlighter} label="Formats" onClick={() => openDialog('guide')} testId="help-guide" title="Display formats & units guide" />
        <BigButton icon={SquareDashed} label="Syntax" onClick={() => openDialog('syntax')} testId="help-syntax" title="Math syntax, units & constants" />
        <BigButton icon={Ruler} label="Pages" onClick={() => openHelp('document')} testId="help-document" title="Document settings: paper, margins, rulers, page breaks" />
      </Group>
      <Group label="About">
        <BigButton icon={Info} label="About" onClick={() => openDialog('about')} testId="help-about" />
      </Group>
    </>
  );
}

type RibbonTabId = 'math' | 'insert' | 'matrices' | 'plots' | 'math-format' | 'text-format' | 'calculation' | 'document' | 'help';

/** Mathcad Prime order. The tab stays where the user put it (no switching on selection). */
const TAB_LABELS: [RibbonTabId, string][] = [
  ['math', 'Math'],
  ['insert', 'Insert'],
  ['matrices', 'Matrices/Tables'],
  ['plots', 'Plots'],
  ['math-format', 'Math Formatting'],
  ['text-format', 'Text Formatting'],
  ['calculation', 'Calculation'],
  ['document', 'Document'],
  ['help', 'Help'],
];

function RibbonTabs({ tab, setTab, only, label = 'Ribbon' }: { tab: RibbonTabId; setTab(t: RibbonTabId): void; only: (id: RibbonTabId) => boolean; label?: string }) {
  return (
    <div role="tablist" aria-label={label} className="rb-tabs">
      {TAB_LABELS.filter(([id]) => only(id)).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          data-testid={`format-tab-${id}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setTab(id)}
          className={'rb-tab ' + (tab === id ? 'is-active' : '')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const TAB_CONTENT: Record<RibbonTabId, () => ReactNode> = {
  math: MathTab,
  insert: InsertTab,
  matrices: MatricesTab,
  calculation: CalculationTab,
  plots: PlotsTab,
  'math-format': MathFormattingTab,
  'text-format': TextFormattingTab,
  document: DocumentTab,
  help: HelpTab,
};

function RibbonPanel({ tab }: { tab: RibbonTabId }) {
  const label = TAB_LABELS.find(([id]) => id === tab)![1];
  const Content = TAB_CONTENT[tab];
  return (
    <div role="tabpanel" aria-label={label} className="rb-panel" data-testid={`format-panel-${tab}`}>
      <Content />
    </div>
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
  const workspace = useAppStore((s) => s.workspace);
  const { updateTitle, updateSettings, togglePanel, showLeftTab, setWorkspace } = useAppStore.getState();
  const undoable = useCanvasStore(canUndo);
  const [ribbonTab, setRibbonTab] = useState<RibbonTabId>('math');
  const redoable = useCanvasStore((s) => s.redoStack.length > 0);

  const menus: Record<string, MenuEntry[]> = {
    File: [
      { label: 'New worksheet', onSelect: () => void commands.newWorksheet(false) },
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
