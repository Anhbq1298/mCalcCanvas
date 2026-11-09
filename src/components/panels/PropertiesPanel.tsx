import { AlignCenter, AlignLeft, AlignRight, Bold, Heading2, Italic, List, ListOrdered, Pilcrow, Plus, Trash2, Underline, X, type LucideIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { updateShape, useCanvasStore } from '../../canvas/model/canvasStore';
import { shapeBounds } from '../../canvas/model/geometry';
import { formatEditingText, hasTextSelection } from '../../canvas/textFormatting';
import { fontStack, TEXT_FONTS, type DrawShape, type GraphProps, type GraphSeries, type GraphShape, type LineShape, type MathDisplayMode, type MathShape, type RectShape, type Shape, type TextShape } from '../../canvas/model/types';
import { newGraphSeries } from '../../canvas/canvasActions';
import { MathInput } from '../../math/MathInput';
import { SeriesSources } from './SeriesSources';
import { unitPatch } from '../../canvas/inputUnits';
import { parseDisplayUnit } from '../../engine';
import { useAppStore } from '../../store/appStore';
import { useRegionResult } from '../../store/calculationStore';

const inputCls =
  'h-8 w-full rounded border border-border bg-card px-2 text-[13px] text-foreground transition-colors duration-150 placeholder:text-muted-foreground/70 hover:border-border-strong focus:border-accent focus:outline-none';

function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-[12px] font-medium text-muted-foreground">
        {label}
      </label>
      {children(id)}
      {hint}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-border px-4 py-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** Number input that commits on blur / Enter (no history entry per keystroke). */
type NumberInputProps = { id: string; value: number; onCommit(v: number): void; step?: number; min?: number };

/** Remounts when the external value changes, so the draft resets without an effect. */
function NumberInput(props: NumberInputProps) {
  return <NumberInputInner key={Math.round(props.value * 100)} {...props} />;
}

function NumberInputInner({ id, value, onCommit, step = 1, min }: NumberInputProps) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && (min === undefined || n >= min)) onCommit(n);
    else setDraft(String(Math.round(value * 100) / 100));
  };
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      step={step}
      className={inputCls + ' tabular-nums'}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

function GeometrySection({ shape }: { shape: Shape }) {
  const b = shapeBounds(shape);
  const move = (patch: { x?: number; y?: number }) => updateShape(shape.id, patch);
  return (
    <Section title="Position & size">
      <div className="grid grid-cols-2 gap-2">
        <Field label="X">{(id) => <NumberInput id={id} value={shape.x} onCommit={(x) => move({ x })} />}</Field>
        <Field label="Y">{(id) => <NumberInput id={id} value={shape.y} onCommit={(y) => move({ y })} />}</Field>
        <Field label="Width">{(id) => <input id={id} className={inputCls + ' tabular-nums'} value={Math.round(b.w)} readOnly />}</Field>
        <Field label="Height">{(id) => <input id={id} className={inputCls + ' tabular-nums'} value={Math.round(b.h)} readOnly />}</Field>
      </div>
    </Section>
  );
}

function UnitInput({ id, value, onCommit }: { id: string; value: string; onCommit(v: string): void }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      id={id}
      data-testid="display-unit-input"
      className={inputCls}
      value={draft}
      placeholder="Automatic"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => e.key === 'Enter' && onCommit(draft)}
    />
  );
}

const DISPLAY_MODES: { value: MathDisplayMode; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'formula', label: 'Formula only' },
  { value: 'result', label: 'Result only' },
  { value: 'formulaResult', label: 'Formula and result' },
  { value: 'full', label: 'Full calculation' },
];

function MathProperties({ shape }: { shape: MathShape }) {
  const result = useRegionResult(shape.id);
  const update = (props: Partial<MathShape['props']>) => updateShape(shape.id, { props });
  const [convertError, setConvertError] = useState<string | null>(null);
  const unitError = convertError ?? (result?.error?.code === 'display-unit' ? result.error.message : null);

  return (
    <>
      <Section title="Calculation">
        <div className="rounded border border-border bg-muted px-2.5 py-2 text-[12px] leading-relaxed">
          <div>
            <span className="text-muted-foreground">Type: </span>
            {result?.kind === 'definition' ? `Definition of ${result.defines}` : result?.kind === 'evaluation' ? 'Evaluation' : result?.kind === 'check' ? 'Check' : result?.kind === 'expression' ? 'Expression' : '—'}
          </div>
          {result?.value && (
            <div>
              <span className="text-muted-foreground">Value: </span>
              <span className="font-medium tabular-nums">{result.value.text}</span>
              {result.value.dimension !== 'Dimensionless' && <span className="text-muted-foreground"> ({result.value.dimension})</span>}
            </div>
          )}
          {result && result.references.length > 0 && (
            <div>
              <span className="text-muted-foreground">Uses: </span>
              {result.references.join(', ')}
            </div>
          )}
        </div>
        <Field label="Equation display">
          {(id) => (
            <select id={id} className={inputCls + ' cursor-pointer'} value={shape.props.displayMode} onChange={(e) => update({ displayMode: e.target.value as MathDisplayMode })}>
              {DISPLAY_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        {result?.kind === 'definition' && result.references.length === 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              data-testid="math-constant"
              className="h-4 w-4 cursor-pointer accent-accent"
              checked={!!shape.props.constant}
              onChange={(e) => update({ constant: e.target.checked || undefined })}
            />
            Code constant (not an input: no yellow highlight)
          </label>
        )}
        {result?.value?.length !== undefined && (
          <Field label="Vector display">
            {(id) => (
              <select
                id={id}
                data-testid="vector-layout"
                className={inputCls + ' cursor-pointer'}
                value={`${shape.props.vectorLayout ?? 'row'}-${shape.props.vectorExpanded ? 'all' : 'short'}`}
                onChange={(e) => {
                  const [layout, entries] = e.target.value.split('-');
                  update({ vectorLayout: layout === 'column' ? 'column' : undefined, vectorExpanded: entries === 'all' ? true : undefined });
                }}
              >
                <option value="row-short">Row, shortened</option>
                <option value="row-all">Row, every entry</option>
                <option value="column-short">Column, shortened</option>
                <option value="column-all">Column, every entry</option>
              </select>
            )}
          </Field>
        )}
        <Field
          label="Result unit"
          hint={
            unitError ? (
              <p className="text-[11px] text-destructive" role="alert">
                {unitError}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">e.g. kN·mm, MPa, kN/m². Empty = automatic. On an input the value is converted (35 MPa → ksi).</p>
            )
          }
        >
          {(id) => (
            <UnitInput
              key={`${shape.id}:${shape.props.displayUnit}`}
              id={id}
              value={shape.props.displayUnit}
              onCommit={(displayUnit) => {
                try {
                  const p = unitPatch(shape, displayUnit);
                  if (p) updateShape(shape.id, p);
                  setConvertError(null);
                } catch (e) {
                  setConvertError((e as Error).message);
                }
              }}
            />
          )}
        </Field>
        <Field label="Decimal places">
          {(id) => (
            <select id={id} className={inputCls + ' cursor-pointer'} value={shape.props.precision} onChange={(e) => update({ precision: Number(e.target.value) })}>
              <option value={-1}>Worksheet default</option>
              {[0, 1, 2, 3, 4, 5, 6].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
        </Field>
      </Section>
      <Section title="Appearance">
        <Field label="Font size">
          {(id) => (
            <select id={id} className={inputCls + ' cursor-pointer'} value={shape.props.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })}>
              {[12, 14, 16, 18, 20, 24, 28, 32].map((s) => (
                <option key={s} value={s}>
                  {s} px
                </option>
              ))}
            </select>
          )}
        </Field>
        <ColorSwatches label="Color" value={shape.props.color} onChange={(color) => update({ color })} />
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" className="h-4 w-4 cursor-pointer accent-accent" checked={shape.props.autoSize} onChange={(e) => update({ autoSize: e.target.checked })} />
          Size to fit equation
        </label>
      </Section>
    </>
  );
}

const INK_COLORS = ['#0f172a', '#475569', '#1e3a5f', '#2563eb', '#047857', '#b45309', '#dc2626'] as const;

function ColorSwatches({ value, onChange, label }: { value: string; onChange(c: string): void; label: string }) {
  const id = useId();
  const [hex, setHex] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setHex(value);
  }
  const commitHex = () => {
    const v = hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`;
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) onChange(v.toLowerCase());
    else setHex(value);
  };
  return (
    <div className="space-y-1.5">
      <span className="block text-[12px] font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {INK_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={`Color ${c}`}
            // mousedown + preventDefault keeps a text selection alive while editing
            onMouseDown={(e) => {
              e.preventDefault();
              onChange(c);
            }}
            className={'h-6 w-6 cursor-pointer rounded-full border-2 transition-transform duration-150 hover:scale-110 ' + (value === c ? 'border-accent' : 'border-transparent')}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label}: custom`}
          data-testid="custom-color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-border bg-card p-0.5"
        />
        <label htmlFor={id} className="sr-only">
          {label} hex code
        </label>
        <input
          id={id}
          className={inputCls + ' font-mono uppercase'}
          value={hex}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => setHex(e.target.value)}
          onBlur={commitHex}
          onKeyDown={(e) => e.key === 'Enter' && commitHex()}
        />
      </div>
    </div>
  );
}

/** execCommand-based formatting for the text region being edited. */
function FormatButton({ label, icon: Icon, command, value, disabled }: { label: string; icon: LucideIcon; command: string; value?: string; disabled: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={disabled ? `${label} (double-click the text to edit first)` : label}
      disabled={disabled}
      onMouseDown={(e) => {
        // Keep focus (and the text selection) inside the text region.
        e.preventDefault();
        formatEditingText(command, value);
      }}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-border text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40"
    >
      <Icon size={15} aria-hidden />
    </button>
  );
}

function TextProperties({ shape }: { shape: TextShape }) {
  const editing = useCanvasStore((s) => s.editingId === shape.id);
  const update = (props: Partial<TextShape['props']>) => updateShape(shape.id, { props });
  return (
    <Section title="Text">
      <div className="space-y-1">
        <span className="block text-[12px] font-medium text-muted-foreground">Formatting</span>
        <div className="flex flex-wrap gap-1">
          <FormatButton label="Bold (Ctrl+B)" icon={Bold} command="bold" disabled={!editing} />
          <FormatButton label="Italic (Ctrl+I)" icon={Italic} command="italic" disabled={!editing} />
          <FormatButton label="Underline (Ctrl+U)" icon={Underline} command="underline" disabled={!editing} />
          <FormatButton label="Heading" icon={Heading2} command="formatBlock" value="H2" disabled={!editing} />
          <FormatButton label="Normal paragraph" icon={Pilcrow} command="formatBlock" value="DIV" disabled={!editing} />
          <FormatButton label="Bullet list" icon={List} command="insertUnorderedList" disabled={!editing} />
          <FormatButton label="Numbered list" icon={ListOrdered} command="insertOrderedList" disabled={!editing} />
        </div>
      </div>
      <Field label="Font">
        {(id) => (
          <select
            id={id}
            data-testid="text-font"
            className={inputCls + ' cursor-pointer'}
            value={shape.props.fontFamily}
            style={{ fontFamily: fontStack(shape.props.fontFamily) }}
            onChange={(e) => update({ fontFamily: e.target.value })}
          >
            {Object.keys(TEXT_FONTS).map((f) => (
              <option key={f} value={f} style={{ fontFamily: fontStack(f) }}>
                {f}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Font size">
        {(id) => (
          <select id={id} className={inputCls + ' cursor-pointer'} value={shape.props.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })}>
            {[11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32].map((v) => (
              <option key={v} value={v}>
                {v} px
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="space-y-1">
        <span className="block text-[12px] font-medium text-muted-foreground">Alignment</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Text alignment">
          {(
            [
              ['left', AlignLeft],
              ['center', AlignCenter],
              ['right', AlignRight],
            ] as const
          ).map(([v, Icon]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={shape.props.align === v}
              aria-label={`Align ${v}`}
              onClick={() => update({ align: v })}
              className={'flex h-8 w-8 cursor-pointer items-center justify-center rounded border transition-colors duration-150 ' + (shape.props.align === v ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted-foreground hover:bg-muted')}
            >
              <Icon size={15} aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <ColorSwatches
        label={editing ? 'Text color (selection, or whole text)' : 'Text color'}
        value={shape.props.color}
        onChange={(color) => {
          // While editing with text selected, colour only the selection.
          if (editing && hasTextSelection()) formatEditingText('foreColor', color);
          else update({ color });
        }}
      />
    </Section>
  );
}

function StrokeProperties({ shape }: { shape: RectShape | LineShape | DrawShape }) {
  const update = (props: Record<string, unknown>) => updateShape(shape.id, { props });
  return (
    <Section title="Line">
      <ColorSwatches label="Color" value={shape.props.stroke} onChange={(stroke) => update({ stroke })} />
      <Field label="Thickness">
        {(id) => (
          <select id={id} className={inputCls + ' cursor-pointer'} value={shape.props.strokeWidth} onChange={(e) => update({ strokeWidth: Number(e.target.value) })}>
            {[0.75, 1, 1.5, 2, 2.5, 3, 4].map((v) => (
              <option key={v} value={v}>
                {v} px
              </option>
            ))}
          </select>
        )}
      </Field>
      {shape.type === 'line' && (
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" className="h-4 w-4 cursor-pointer accent-accent" checked={shape.props.arrow} onChange={(e) => update({ arrow: e.target.checked })} />
          Arrowhead
        </label>
      )}
    </Section>
  );
}

/** Text input that commits on blur / Enter; remounts when the stored value changes. */
function CommitInput({ id, value, onCommit, placeholder, testId, validate }: { id: string; value: string; onCommit(v: string): void; placeholder?: string; testId?: string; validate?(v: string): string | null }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <input
        id={id}
        data-testid={testId}
        className={inputCls + (error ? ' border-destructive' : '')}
        placeholder={placeholder}
        value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onBlur={() => {
          if (draft === null) return;
          const v = draft.trim();
          const err = validate?.(v) ?? null;
          setDraft(null);
          if (err) return void setError(err);
          if (v !== value) onCommit(v);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        }}
      />
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </>
  );
}

const unitError = (v: string): string | null => {
  if (!v) return null;
  try {
    parseDisplayUnit(v);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

function SeriesEditor({ shapeId, series, index, onChange, onDelete }: { shapeId: string; series: GraphSeries; index: number; onChange(patch: Partial<GraphSeries>): void; onDelete(): void }) {
  const tid = (f: string) => `series-${index}-${f}`;
  return (
    <div className="space-y-2 rounded border border-border p-2" data-testid={`series-${index}`}>
      <div className="flex items-center gap-2">
        <input type="color" aria-label="Series colour" value={series.color} onChange={(e) => onChange({ color: e.target.value })} className="h-6 w-6 cursor-pointer rounded border border-border" />
        <input
          aria-label="Series label"
          data-testid={tid('label')}
          className={inputCls + ' h-7'}
          placeholder={`Series ${index + 1} (legend)`}
          defaultValue={series.label}
          key={series.label}
          onBlur={(e) => e.target.value !== series.label && onChange({ label: e.target.value })}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
        />
        <button type="button" aria-label="Delete series" title="Delete series" onClick={onDelete} className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive">
          <Trash2 size={14} aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-[18px_1fr] items-center gap-x-1.5 gap-y-1.5 text-[12px] text-muted-foreground">
        <span>x</span>
        <MathInput label="X values" testId={tid('x')} value={series.x} onCommit={(x) => onChange({ x })} />
        <span>y</span>
        <MathInput label="Y values" testId={tid('y')} value={series.y} onCommit={(y) => onChange({ y })} />
        {series.style === 'segments' && (
          <>
            <span>g</span>
            <MathInput label="Group id per point (a change starts a new piece)" testId={tid('r')} value={series.r} onCommit={(r) => onChange({ r })} />
          </>
        )}
        {series.style === 'circle' && (
          <>
            <span>r</span>
            <MathInput label="Circle radius" testId={tid('r')} value={series.r} onCommit={(r) => onChange({ r })} />
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <select aria-label="Series style" data-testid={tid('style')} className={inputCls + ' h-7 cursor-pointer'} value={series.style} onChange={(e) => onChange({ style: e.target.value as GraphSeries['style'] })}>
          <option value="line">Line</option>
          <option value="marker">Markers</option>
          <option value="circle">Circles (radius r)</option>
          <option value="segments">Segments (group g)</option>
        </select>
        <select aria-label="Line width / marker size" className={inputCls + ' h-7 w-20 cursor-pointer'} value={series.width} onChange={(e) => onChange({ width: Number(e.target.value) })}>
          {[0.75, 1, 1.5, 2, 3, 4].map((v) => (
            <option key={v} value={v}>
              {v} px
            </option>
          ))}
        </select>
      </div>
      <SeriesSources shapeId={shapeId} seriesId={series.id} index={index} />
      <div className="space-y-1">
        <span className="block text-[11px] text-muted-foreground">Show when (optional, e.g. n_set ≥ 2)</span>
        <MathInput label="Show when" testId={tid('show')} value={series.show} onCommit={(show) => onChange({ show })} />
      </div>
    </div>
  );
}

function GraphProperties({ shape }: { shape: GraphShape }) {
  const update = (props: Partial<GraphProps>) => updateShape(shape.id, { props });
  const series = shape.props.series;
  const setSeries = (next: GraphSeries[]) => update({ series: next });
  return (
    <>
      <Section title="Graph">
        <Field label="Title">{(id) => <CommitInput id={id} value={shape.props.title} onCommit={(title) => update({ title })} testId="graph-prop-title" />}</Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X label">{(id) => <CommitInput id={id} value={shape.props.xLabel} onCommit={(xLabel) => update({ xLabel })} />}</Field>
          <Field label="X unit">{(id) => <CommitInput id={id} value={shape.props.xUnit} placeholder="auto" validate={unitError} onCommit={(xUnit) => update({ xUnit })} testId="graph-prop-xunit" />}</Field>
          <Field label="Y label">{(id) => <CommitInput id={id} value={shape.props.yLabel} onCommit={(yLabel) => update({ yLabel })} />}</Field>
          <Field label="Y unit">{(id) => <CommitInput id={id} value={shape.props.yUnit} placeholder="auto" validate={unitError} onCommit={(yUnit) => update({ yUnit })} testId="graph-prop-yunit" />}</Field>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" className="h-4 w-4 cursor-pointer accent-accent" checked={shape.props.equalAxes} onChange={(e) => update({ equalAxes: e.target.checked })} />
          Equal axes (1:1 scale)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" className="h-4 w-4 cursor-pointer accent-accent" checked={shape.props.grid} onChange={(e) => update({ grid: e.target.checked })} />
          Grid lines
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" data-testid="graph-prop-origin" className="h-4 w-4 cursor-pointer accent-accent" checked={shape.props.axesAtOrigin} onChange={(e) => update({ axesAtOrigin: e.target.checked })} />
          Axes through origin (values on bottom/left)
        </label>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field label="Font">
            {(id) => (
              <select id={id} data-testid="graph-prop-font" className={inputCls + ' cursor-pointer'} value={shape.props.font} onChange={(e) => update({ font: e.target.value })}>
                {Object.keys(TEXT_FONTS).map((f) => (
                  <option key={f} value={f} style={{ fontFamily: fontStack(f) }}>
                    {f}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Background">
            {(id) => <input id={id} type="color" data-testid="graph-prop-background" value={shape.props.background} onChange={(e) => update({ background: e.target.value })} className="h-8 w-12 cursor-pointer rounded border border-border" />}
          </Field>
        </div>
      </Section>
      <Section title="Series">
        <p className="text-[12px] leading-relaxed text-muted-foreground">x and y are expressions using variables defined above the graph, e.g. a vector from a range (i := 0..n−1, type ;).</p>
        {series.map((s, i) => (
          <SeriesEditor
            key={s.id}
            shapeId={shape.id}
            series={s}
            index={i}
            onChange={(patch) => setSeries(series.map((q) => (q.id === s.id ? { ...q, ...patch } : q)))}
            onDelete={() => setSeries(series.filter((q) => q.id !== s.id))}
          />
        ))}
        <button
          type="button"
          data-testid="graph-prop-add-series"
          onClick={() => setSeries([...series, newGraphSeries(series)])}
          disabled={series.length >= 20}
          className="flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded border border-dashed border-border text-[13px] text-muted-foreground hover:border-accent hover:text-foreground disabled:opacity-40"
        >
          <Plus size={14} aria-hidden /> Add series
        </button>
      </Section>
    </>
  );
}

function DocumentProperties() {
  const title = useAppStore((s) => s.title);
  const metadata = useAppStore((s) => s.metadata);
  const settings = useAppStore((s) => s.settings);
  const { updateTitle, updateMetadata, updateSettings } = useAppStore.getState();
  const meta: [keyof typeof metadata, string][] = [
    ['project', 'Project'],
    ['calculationReference', 'Calculation reference'],
    ['preparedBy', 'Prepared by'],
    ['checkedBy', 'Checked by'],
    ['revision', 'Revision'],
  ];
  return (
    <>
      <Section title="Worksheet">
        <Field label="Title">{() => <input id="ws-title" className={inputCls} value={title} onChange={(e) => updateTitle(e.target.value)} />}</Field>
        {meta.map(([k, label]) => (
          <Field key={k} label={label}>
            {(id) => <input id={id} className={inputCls} value={metadata[k] ?? ''} onChange={(e) => updateMetadata({ [k]: e.target.value })} />}
          </Field>
        ))}
      </Section>
      <Section title="Calculation settings">
        <Field label="Unit system">
          {(id) => (
            <select id={id} className={inputCls + ' cursor-pointer'} value={settings.unitSystem} onChange={(e) => updateSettings({ unitSystem: e.target.value as 'SI' | 'Imperial' })}>
              <option value="SI">SI (kN, m, kPa)</option>
              <option value="Imperial">Imperial (kip, ft, ksi)</option>
            </select>
          )}
        </Field>
        <Field label="Decimal places">
          {(id) => (
            <select id={id} className={inputCls + ' cursor-pointer'} value={settings.precision} onChange={(e) => updateSettings({ precision: Number(e.target.value) })}>
              {[0, 1, 2, 3, 4, 5, 6].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Array display">
          {(id) => (
            <select
              id={id}
              data-testid="vector-limit"
              className={inputCls + ' cursor-pointer'}
              value={settings.vectorLimit ?? 10}
              onChange={(e) => updateSettings({ vectorLimit: Number(e.target.value) })}
            >
              {[6, 10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  First {n / 2} … last {n / 2}
                </option>
              ))}
              <option value={0}>All entries</option>
            </select>
          )}
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            data-testid="toggle-header-footer"
            className="h-4 w-4 cursor-pointer accent-accent"
            checked={settings.showHeaderFooter}
            onChange={(e) => updateSettings({ showHeaderFooter: e.target.checked })}
          />
          Header &amp; footer on pages and PDF
        </label>
        <Field label="Default text font">
          {(id) => (
            <select id={id} className={inputCls + ' cursor-pointer'} value={settings.textFont} onChange={(e) => updateSettings({ textFont: e.target.value })}>
              {Object.keys(TEXT_FONTS).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Page orientation">
          {(id) => (
            <select id={id} className={inputCls + ' cursor-pointer'} value={settings.pageOrientation} onChange={(e) => updateSettings({ pageOrientation: e.target.value as 'portrait' | 'landscape' })}>
              <option value="portrait">A4 portrait</option>
              <option value="landscape">A4 landscape</option>
            </select>
          )}
        </Field>
      </Section>
    </>
  );
}

export function PropertiesPanel() {
  const togglePanel = useAppStore((s) => s.togglePanel);
  const selection = useCanvasStore((s) => s.selection);
  const selected = useCanvasStore((s) => (s.selection.length === 1 ? s.shapes[s.selection[0]] : null));
  const count = selection.length;

  let body: ReactNode;
  if (count === 0) body = <DocumentProperties />;
  else if (!selected) body = <p className="px-4 py-4 text-[13px] text-muted-foreground">{count} objects selected. Ctrl+G groups them.</p>;
  else
    body = (
      <>
        {selected.type === 'math' && <MathProperties shape={selected} />}
        {selected.type === 'text' && <TextProperties shape={selected} />}
        {(selected.type === 'rect' || selected.type === 'line' || selected.type === 'draw') && <StrokeProperties shape={selected} />}
        {selected.type === 'graph' && <GraphProperties shape={selected} />}
        {selected.type === 'image' && (
          <Section title="Image">
            <p className="text-[12px] leading-relaxed text-muted-foreground">Drag a corner to resize; the aspect ratio is kept (hold Shift to stretch).</p>
          </Section>
        )}
        <GeometrySection shape={selected} />
      </>
    );

  const heading = count === 0 ? 'Worksheet' : selected?.type === 'math' ? 'Math region' : selected?.type === 'text' ? 'Text' : selected?.type === 'graph' ? 'Graph' : 'Properties';
  return (
    <aside aria-label="Properties" className="flex w-72 shrink-0 flex-col border-l border-border bg-card" data-testid="properties-panel">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="text-[13px] font-semibold">{heading}</h2>
        <button type="button" aria-label="Close properties panel" onClick={() => togglePanel(false)} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground">
          <X size={15} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </aside>
  );
}
