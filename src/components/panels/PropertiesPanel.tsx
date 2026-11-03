import { AlignCenter, AlignLeft, AlignRight, Bold, Heading2, Italic, List, ListOrdered, Pilcrow, Underline, X, type LucideIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { updateShape, useCanvasStore } from '../../canvas/model/canvasStore';
import { shapeBounds } from '../../canvas/model/geometry';
import { MATH_COLORS, type DrawShape, type LineShape, type MathDisplayMode, type MathShape, type RectShape, type Shape, type TextShape } from '../../canvas/model/types';
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
  const unitError = result?.error?.code === 'display-unit' ? result.error.message : null;

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
        <Field
          label="Result unit"
          hint={
            unitError ? (
              <p className="text-[11px] text-destructive" role="alert">
                {unitError}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">e.g. kN·mm, MPa, kN/m². Empty = automatic.</p>
            )
          }
        >
          {(id) => (
            <UnitInput
              key={`${shape.id}:${shape.props.displayUnit}`}
              id={id}
              value={shape.props.displayUnit}
              onCommit={(displayUnit) => update({ displayUnit })}
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
        <div className="space-y-1">
          <span className="block text-[12px] font-medium text-muted-foreground">Color</span>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Equation color">
            {MATH_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={shape.props.color === c}
                aria-label={`Color ${c}`}
                onClick={() => update({ color: c })}
                className={'h-6 w-6 cursor-pointer rounded-full border-2 transition-transform duration-150 hover:scale-110 ' + (shape.props.color === c ? 'border-accent' : 'border-transparent')}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
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
  return (
    <div className="space-y-1">
      <span className="block text-[12px] font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {INK_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={`Color ${c}`}
            onClick={() => onChange(c)}
            className={'h-6 w-6 cursor-pointer rounded-full border-2 transition-transform duration-150 hover:scale-110 ' + (value === c ? 'border-accent' : 'border-transparent')}
            style={{ background: c }}
          />
        ))}
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
        document.execCommand(command, false, value);
        const el = document.activeElement as HTMLElement | null;
        el?.dispatchEvent(new Event('input', { bubbles: true }));
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
      <ColorSwatches label="Color" value={shape.props.color} onChange={(color) => update({ color })} />
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
        <Field label="Title">{(id) => <input id={id} className={inputCls} value={title} onChange={(e) => updateTitle(e.target.value)} />}</Field>
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
        {selected.type === 'image' && (
          <Section title="Image">
            <p className="text-[12px] leading-relaxed text-muted-foreground">Drag a corner to resize; the aspect ratio is kept (hold Shift to stretch).</p>
          </Section>
        )}
        <GeometrySection shape={selected} />
      </>
    );

  const heading = count === 0 ? 'Worksheet' : selected?.type === 'math' ? 'Math region' : selected?.type === 'text' ? 'Text' : 'Properties';
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
