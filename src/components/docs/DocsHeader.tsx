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
import { fontStack, PARAGRAPH_STYLES, TEXT_FONTS, TEXT_STYLES, type GraphShape, type HeadingLevel, type MathDisplayMode, type Shape, type TextStyleId } from '../../canvas/model/types';
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
import { MatricesTablesRibbon } from '../ribbon/MatricesTablesRibbon';

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

const Sep = () => <div className="mx-1 h-5 w-px shrink-0 bg-docs-sep" aria-hidden />;

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

/** Ribbon button with a small icon above a label (used for the main commands of a group). */
function BigButton({ icon: Icon, label, onClick, testId, title, disabled, active }: { icon: LucideIcon; label: string; onClick(): void; testId?: string; title?: string; disabled?: boolean; active?: boolean }) {
  return (
    <button type="button" className={'rb-big ' + (active ? 'is-active' : '')} title={title ?? label} aria-label={title ?? label} aria-pressed={active} data-testid={testId} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <Icon size={18} strokeWidth={1.8} aria-hidden />
      <span>{label}</span>
    </button>
  );
}

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
            width={128}
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
        <Row>
          <TB icon={Link2} label="Insert or edit a link on the selected text (http, https, mailto)" disabled={!editingText} onClick={link} testId="text-link" />
        </Row>
        <Row>
          <TB icon={Unlink} label="Remove the link" disabled={!editingText} onClick={() => formatEditingText('unlink')} testId="text-unlink" />
        </Row>
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
    patchSelected((sh) => (sh.type === 'math' ? { props: { fontSize: 16, color: '#0f172a', highlight: undefined } } : null));
  const labels = settings.labelStyles ?? DEFAULT_LABEL_STYLES;
  const setLabel = (k: keyof typeof labels, c: string | null) => useAppStore.getState().updateSettings({ labelStyles: { ...labels, [k]: c ?? DEFAULT_LABEL_STYLES[k] } });
  const fmtNames: [string, string][] = [['general', 'General'], ['decimal', 'Decimal'], ['scientific', 'Scientific'], ['engineering', 'Engineering']];
  return (
    <>
      <Group label="Operators & Symbols">
        <Row>
          <PalettePopover label="Operators" glyph="√" sections={OPERATORS} testId="palette-operators" columns={5} />
          <PalettePopover label="Symbols" glyph="β" sections={SYMBOLS} testId="palette-symbols" />
        </Row>
        <Row>
          <PalettePopover label="Constants" glyph="π" sections={CONSTANTS} testId="palette-constants" />
          <PalettePopover label="Units" glyph="m" sections={UNITS_PALETTE} testId="palette-units" />
        </Row>
      </Group>
      <Group label="Display">
        <Row>
          <DisplayModeSelect />
        </Row>
        <Row>
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
            className={'h-7 w-[64px] rounded border bg-white px-1.5 text-[13px] disabled:opacity-40 ' + (unitError ? 'border-destructive' : 'border-docs-border')}
          />
          <datalist id="cc-result-units">
            {RESULT_UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <TBSelect
            label="Array results of the selected equations: row or column, shortened (first … last) or every entry"
            testId="math-array"
            value={first ? `${first.props.vectorLayout ?? 'row'}-${first.props.vectorExpanded ? 'all' : 'short'}` : 'row-short'}
            width={136}
            onChange={(v) => {
              const [layout, entries] = v.split('-');
              patchSelected((sh) =>
                sh.type === 'math' ? { props: { vectorLayout: layout === 'column' ? 'column' : undefined, vectorExpanded: entries === 'all' ? true : undefined } } : null,
              );
            }}
            options={[
              ['row-short', 'Array: row, short'],
              ['row-all', 'Array: row, all'],
              ['column-short', 'Array: column, short'],
              ['column-all', 'Array: column, all'],
            ]}
          />
        </Row>
      </Group>
      <Group label={first ? 'Results' : 'Results (worksheet default)'}>
        <Row>
          <TBSelect
            label={first ? 'Number format of the selected results (presentation only)' : 'Default number format of results'}
            testId="math-result-format"
            value={formatValue}
            width={112}
            onChange={setFormat}
            options={[...(formatValue === 'mixed' ? [['mixed', 'Mixed'] as [string, string]] : []), ...(first ? [['inherit', `Default (${settings.resultFormat ?? 'general'})`] as [string, string]] : []), ...fmtNames]}
          />
          <TBSelect
            label="Decimal places of the selected equations"
            testId="math-decimals"
            value={first ? String(first.props.precision) : '-1'}
            width={84}
            onChange={(v) => patchSelected((sh) => (sh.type === 'math' ? { props: { precision: Number(v) } } : null))}
            options={[['-1', `Auto (${settings.precision})`], ...[0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), `${d} dp`] as [string, string])]}
          />
        </Row>
        <Row>
          <Check label="Trailing zeros" testId="math-trailing-zeros" checked={zerosOn} mixed={zeros.size > 1} onChange={setZeros} title="Show trailing zeros (2.50 instead of 2.5); the value is not rounded" />
          <TB icon={RotateCcw} label={first ? 'Reset result formatting of the selected equations' : 'Reset the worksheet result defaults'} onClick={resetResults} testId="math-reset-results" />
        </Row>
      </Group>
      <Group label="Math Font">
        <Row>
          <SizeControl kinds={['math']} label="Equation size" />
        </Row>
        <Row>
          <ColorButton testId="math-color" title="Equation color" kinds={['math']} />
          <SwatchPicker testId="math-highlight" title="Highlight the selected equations" value={first?.props.highlight ?? null} allowNone onPick={(c) => patchSelected((sh) => (sh.type === 'math' ? { props: { highlight: c ?? undefined } } : null))} />
          <TB icon={Eraser} label="Reset size, colour and highlight of the selected equations" disabled={!first} onClick={resetFormatting} testId="math-reset-format" />
        </Row>
      </Group>
      <Group label="Label Styles">
        <Row>
          <span className="rb-mini">Unit</span>
          <SwatchPicker testId="label-unit-color" title="Colour of units (whole worksheet)" value={labels.unitColor} onPick={(c) => setLabel('unitColor', c)} />
          <span className="rb-mini">Input</span>
          <SwatchPicker testId="label-input-color" title="Text colour of inputs (literal definitions)" value={labels.inputColor} onPick={(c) => setLabel('inputColor', c)} />
          <SwatchPicker testId="label-input-bg" title="Background of inputs" value={labels.inputBackground} onPick={(c) => setLabel('inputBackground', c)} />
        </Row>
        <Row>
          <TB icon={RotateCcw} label="Default label styles" onClick={() => useAppStore.getState().updateSettings({ labelStyles: undefined })} testId="label-reset" />
        </Row>
      </Group>
      <Group label="Worksheet">
        <Row>
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
            width={64}
            onChange={(v) => useAppStore.getState().updateSettings({ precision: Number(v) })}
            options={[0, 1, 2, 3, 4, 5, 6].map((d) => [d, `${d} dp`])}
          />
        </Row>
        <Row>
          <TBSelect
            label="Equations and text snap their baseline to major lines (every 2 squares) or to every grid line"
            testId="baseline-snap"
            value={settings.baselineSnap ?? 'major'}
            width={110}
            onChange={(v) => useAppStore.getState().updateSettings({ baselineSnap: v as 'major' | 'minor' })}
            options={[['major', 'Snap: lines'], ['minor', 'Snap: squares']]}
          />
        </Row>
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

function ToolButtons({ first }: { first: boolean }) {
  const tool = useCanvasStore((s) => s.tool);
  const t = (id: ToolId, icon: LucideIcon, label: string) => <TB key={id} icon={icon} label={label} active={tool === id} onClick={() => commands.setTool(id)} testId={`tool-${id}`} />;
  return first ? (
    <>
      {t('select', MousePointer2, 'Select')}
      {t('hand', Hand, 'Pan (Space+drag)')}
      {t('draw', Pencil, 'Freehand')}
    </>
  ) : (
    <>
      {t('line', Minus, 'Line')}
      {t('arrow', ArrowUpRight, 'Arrow')}
      {t('rect', Square, 'Rectangle')}
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
    <Group label="X-Y Graph">
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
    </Group>
  );
}

/** Document tab: page setup, page view, zoom and insert (pages, regions). */
function DocumentTab() {
  const settings = useAppStore((s) => s.settings);
  const view = useAppStore((s) => s.view);
  const isGrid = useCanvasStore((s) => s.isGrid);
  const zoom = useCanvasStore((s) => s.camera.z);
  const { updateSettings, setView, openDialog } = useAppStore.getState();
  const paged = settings.canvasMode === 'page';
  const margins = settings.margins ?? DEFAULT_MARGINS;
  const preset = presetOf(margins);
  const zoomPct = Math.round(zoom * 100);
  return (
    <>
      <Group label="Page Setup" testId="group-page-setup">
        <Row>
          <TBSelect label="Paper size" testId="doc-paper" value={settings.paper ?? 'A4'} width={62} onChange={(v) => updateSettings({ paper: v as 'A4' | 'A3' })} options={[['A4', 'A4'], ['A3', 'A3']]} />
          <TB icon={RectangleVertical} label="Portrait" active={settings.pageOrientation === 'portrait'} onClick={() => updateSettings({ pageOrientation: 'portrait' })} testId="doc-portrait" />
          <TB icon={RectangleHorizontal} label="Landscape" active={settings.pageOrientation === 'landscape'} onClick={() => updateSettings({ pageOrientation: 'landscape' })} testId="doc-landscape" />
        </Row>
        <Row>
          <TBSelect
            label="Margins"
            testId="doc-margins"
            value={preset}
            width={150}
            onChange={(v) => (v === 'custom' ? openDialog('page-setup') : updateSettings({ margins: MARGIN_PRESETS.find((p) => p.id === v)!.margins }))}
            options={[...MARGIN_PRESETS.map((p) => [p.id, `Margins: ${p.label.split(' (')[0]}`] as [string, string]), ['custom', preset === 'custom' ? `Custom (${margins.left}/${margins.top} mm)` : 'Custom…']]}
          />
          <TB icon={FileText} label="Page setup… (paper, orientation, margins, preview)" onClick={() => openDialog('page-setup')} testId="doc-page-setup" />
        </Row>
      </Group>
      <Group label="Page View">
        <Row>
          <Check label="Page boundaries" testId="doc-boundaries" checked={view.boundaries} disabled={!paged} onChange={(v) => setView({ boundaries: v })} title="Show the paper edge and the printable area (dashed) of every page" />
          <Check label="Ruler" testId="doc-ruler" checked={view.ruler} onChange={(v) => setView({ ruler: v })} title="Millimetre rulers along the top and left (follow zoom and scrolling)" />
        </Row>
        <Row>
          <Check label="Grid" testId="doc-grid" checked={isGrid} onChange={() => commands.toggleGrid()} />
          <Check label="Header & footer" testId="doc-header" checked={settings.showHeaderFooter} onChange={(v) => updateSettings({ showHeaderFooter: v })} />
          <Check label="Pages" testId="doc-pages" checked={paged} onChange={(v) => updateSettings({ canvasMode: v ? 'page' : 'free' })} title="Page layout (checked) or a free canvas without pages" />
        </Row>
      </Group>
      <Group label="Zoom">
        <Row>
          <TBSelect
            label="Zoom"
            value={[50, 75, 90, 100, 125, 150, 200].includes(zoomPct) ? zoomPct : 'cur'}
            width={70}
            onChange={(v) => {
              if (v === 'fit') commands.zoomToFit();
              else if (v !== 'cur') zoomAt({ x: viewport.w / 2, y: viewport.h / 2 }, Number(v) / 100 / useCanvasStore.getState().camera.z);
            }}
            options={[...(![50, 75, 90, 100, 125, 150, 200].includes(zoomPct) ? [['cur', `${zoomPct}%`] as [string, string]] : []), ...[50, 75, 90, 100, 125, 150, 200].map((z) => [z, `${z}%`] as [number, string]), ['fit', 'Fit content']]}
          />
          <TB label="Actual size (100 %)" onClick={commands.zoomActualSize} testId="doc-zoom-100">
            <span className="text-[11px] font-semibold">1:1</span>
          </TB>
        </Row>
        <Row>
          <TB icon={Maximize} label="Fit page" onClick={commands.zoomFitPage} testId="doc-fit-page" disabled={!paged} />
          <TB icon={MoveHorizontal} label="Fit width" onClick={commands.zoomFitWidth} testId="doc-fit-width" disabled={!paged} />
        </Row>
      </Group>
      <Group label="Insert">
        <Row>
          <TB icon={Sigma} label="Math region (or just type on the page)" onClick={() => commands.setTool('math')} testId="doc-insert-math" />
          <TB icon={Type} label="Text region (or type &quot;)" onClick={() => commands.setTool('text')} testId="doc-insert-text" />
        </Row>
        <Row>
          <TB icon={ScissorsLineDashed} label={withShortcut('Page break at the + cross', 'page-break')} onClick={commands.pageBreak} testId="doc-page-break" disabled={!paged} />
          <TB icon={FilePlus2} label={withShortcut('Insert blank page', 'blank-page')} onClick={commands.insertBlankPage} testId="insert-page" disabled={!paged} />
        </Row>
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
        <BigButton icon={BookOpen} label="Help center" onClick={() => openHelp('getting-started')} testId="help-open" title={withShortcut('Help center', 'help')} />
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

type FormatTab = 'document' | 'math' | 'text' | 'graph' | 'matrices' | 'help';

const TAB_LABELS: [FormatTab, string][] = [
  ['document', 'Document'],
  ['math', 'Math Formatting'],
  ['text', 'Text Formatting'],
  ['graph', 'Graph'],
  ['matrices', 'Matrices/Tables'],
  ['help', 'Help'],
];

/**
 * The ribbon (Mathcad Prime style): tabs on top, groups with their names
 * underneath. Selecting or editing an equation shows Math Formatting, a text
 * region Text Formatting, a graph Graph; any tab can also be chosen.
 */
function useRibbonTab(): [FormatTab, (t: FormatTab) => void] {
  const [tab, setTab] = useState<FormatTab>('math');
  const focusKind = useCanvasStore((s) => {
    const id = s.editingId ?? (s.selection.length ? s.selection[0] : null);
    const shape = id ? s.shapes[id] : undefined;
    if (shape?.type === 'table' || (shape?.type === 'math' && /\\begin\\{bmatrix\\}/.test(shape.props.latex))) return 'matrices';
    const t = shape?.type;
    return t === 'math' || t === 'text' || t === 'graph' ? t : null;
  });
  const [lastKind, setLastKind] = useState<FormatTab | null>(null);
  if (focusKind !== lastKind) {
    setLastKind(focusKind);
    if (focusKind) setTab(focusKind);
  }
  return [tab, setTab];
}

function RibbonTabs({ tab, setTab }: { tab: FormatTab; setTab(t: FormatTab): void }) {
  return (
    <div role="tablist" aria-label="Ribbon" className="rb-tabs">
      {TAB_LABELS.map(([id, label]) => (
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

function RibbonPanel({ tab }: { tab: FormatTab }) {
  const label = TAB_LABELS.find(([id]) => id === tab)![1];
  return (
    <div role="tabpanel" aria-label={label} className="rb-panel" data-testid={`format-panel-${tab}`}>
      {tab === 'document' ? <DocumentTab /> : tab === 'math' ? <MathFormattingTab /> : tab === 'text' ? <TextFormattingTab /> : tab === 'graph' ? <GraphTab /> : tab === 'matrices' ? <MatricesTablesRibbon /> : <HelpTab />}
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
  const view = useAppStore((s) => s.view);
  const { updateTitle, updateSettings, togglePanel, showLeftTab, openDialog, setWorkspace } = useAppStore.getState();
  const tool = useCanvasStore((s) => s.tool);
  const isGrid = useCanvasStore((s) => s.isGrid);
  const isSnap = useCanvasStore((s) => s.isSnap);
  const undoable = useCanvasStore(canUndo);
  const [ribbonTab, setRibbonTab] = useRibbonTab();
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
      { label: 'Page boundaries', checked: view.boundaries, onSelect: () => useAppStore.getState().setView({ boundaries: !view.boundaries }) },
      { label: 'Ruler', checked: view.ruler, onSelect: () => useAppStore.getState().setView({ ruler: !view.ruler }) },
      { label: 'Page setup…', onSelect: () => openDialog('page-setup') },
      { label: 'Outline', checked: paramsOpen && leftTab === 'outline', onSelect: () => showLeftTab('outline') },
      { label: 'Parameters', checked: paramsOpen && leftTab === 'params', onSelect: () => showLeftTab('params') },
      { label: 'Properties panel', checked: panelOpen, onSelect: () => togglePanel() },
      { type: 'separator' },
      { label: 'Zoom in', onSelect: commands.zoomIn },
      { label: 'Zoom out', onSelect: commands.zoomOut },
      { label: 'Zoom to 100%', onSelect: commands.resetZoom },
      { label: 'Fit page', onSelect: commands.zoomFitPage },
      { label: 'Fit width', onSelect: commands.zoomFitWidth },
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
      { label: 'Page break', shortcut: `${MOD}⇧↵`, onSelect: commands.pageBreak },
      { label: 'Blank page', shortcut: `${MOD}↵`, onSelect: commands.insertBlankPage },
      { label: 'Delete empty page', onSelect: commands.deletePage },
      { type: 'separator' },
      { label: 'Line', onSelect: () => commands.setTool('line') },
      { label: 'Arrow', onSelect: () => commands.setTool('arrow') },
      { label: 'Rectangle', onSelect: () => commands.setTool('rect') },
      { label: 'Freehand', onSelect: () => commands.setTool('draw') },
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
      { label: 'Help center', shortcut: 'F1', onSelect: () => useAppStore.getState().openHelp('getting-started') },
      { label: 'Keyboard shortcuts', onSelect: () => useAppStore.getState().openHelp('shortcuts') },
      { label: 'Display formats & units guide', onSelect: () => openDialog('guide') },
      { label: 'Math syntax, units & constants', onSelect: () => openDialog('syntax') },
      { label: 'About CalcCanvas', onSelect: () => openDialog('about') },
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
            <span className="mx-1 h-4 w-px bg-docs-border" aria-hidden />
            <div role="tablist" aria-label="Workspace" className="flex items-center gap-0.5">
              <button
                type="button"
                role="tab"
                aria-selected={workspace === 'calculation'}
                onClick={() => setWorkspace('calculation')}
                className={'docs-workspace-tab ' + (workspace === 'calculation' ? 'is-active' : '')}
              >
                <Sigma size={13} aria-hidden /> Calculation
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={workspace === 'input-results'}
                onClick={() => setWorkspace('input-results')}
                className={'docs-workspace-tab ' + (workspace === 'input-results' ? 'is-active' : '')}
                data-testid="workspace-input-results"
              >
                <TableProperties size={13} aria-hidden /> Input &amp; Results
              </button>
            </div>
            {workspace === 'calculation' && (
              <>
                <span className="mx-1.5 h-4 w-px bg-docs-border" aria-hidden />
                <RibbonTabs tab={ribbonTab} setTab={setRibbonTab} />
              </>
            )}
          </nav>
        </div>
        {workspace === 'calculation' && <button
          type="button"
          onClick={commands.calculateAll}
          title="Calculate all (F9)"
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[14px] text-docs-ink transition-colors duration-150 hover:bg-docs-hover"
        >
          <Calculator size={17} aria-hidden /> Calculate
        </button>}
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
        <div role="toolbar" aria-label="Formatting" className="rb" data-testid="ribbon">
          <div className="rb-body">
            <Group label="Edit">
              <Row>
                <TB icon={Undo2} label={withShortcut('Undo', 'undo')} disabled={!undoable} onClick={commands.undo} />
                <TB icon={Redo2} label={withShortcut('Redo', 'redo')} disabled={!redoable} onClick={commands.redo} />
                <TB icon={Calculator} label={withShortcut('Calculate all', 'calculate')} onClick={commands.calculateAll} testId="rb-calculate" />
              </Row>
              <Row>
                <ToolButtons first />
              </Row>
            </Group>
            <Group label="Regions">
              <Row>
                <TB icon={Sigma} label="Insert equation (or just type on the page)" active={tool === 'math'} onClick={() => commands.setTool('math')} testId="tool-math" />
                <TB icon={Type} label="Text (or type &quot;)" active={tool === 'text'} onClick={() => commands.setTool('text')} testId="tool-text" />
                <TB icon={CheckSquare} label="Insert check (≤ 1)" onClick={() => commands.insertCheck()} testId="insert-check" />
              </Row>
              <Row>
                <TB icon={ImagePlus} label="Insert image" onClick={() => void commands.insertImage()} />
                <TB icon={LineChart} label="Insert X-Y graph" onClick={() => commands.insertGraph()} testId="insert-graph" />
                <ToolButtons first={false} />
              </Row>
            </Group>
            <RibbonPanel tab={ribbonTab} />
            <div className="rb-side" aria-label="Panels and view">
              <Row>
                <TB icon={ListTree} label="Outline" active={paramsOpen && leftTab === 'outline'} onClick={() => showLeftTab('outline')} testId="toggle-outline" />
                <TB icon={Variable} label="Parameters" active={paramsOpen && leftTab === 'params'} onClick={() => showLeftTab('params')} testId="toggle-params" />
                <TB icon={PanelRight} label="Properties panel" active={panelOpen} onClick={() => togglePanel()} testId="toggle-properties" />
              </Row>
              <Row>
                <TB icon={Grid3x3} label="Grid" active={isGrid} onClick={commands.toggleGrid} testId="toggle-grid" />
                <TB icon={PanelTop} label="Header & footer" active={settings.showHeaderFooter} onClick={() => updateSettings({ showHeaderFooter: !settings.showHeaderFooter })} testId="toggle-chrome" />
              </Row>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
