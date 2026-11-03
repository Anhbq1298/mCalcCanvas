import { AlignCenter, AlignLeft, AlignRight, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import {
  DefaultColorStyle,
  DefaultSizeStyle,
  DefaultTextAlignStyle,
  useValue,
  type Editor,
  type TLShape,
} from 'tldraw';
import { isMathShape } from '../../canvas/regionActions';
import { MATH_COLORS, MATH_SHAPE_TYPE, type MathDisplayMode, type MathShape } from '../../canvas/shapes/mathShapeTypes';
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

function GeometrySection({ editor, shape }: { editor: Editor; shape: TLShape }) {
  const bounds = useValue('bounds', () => editor.getShapePageBounds(shape.id), [editor, shape.id]);
  if (!bounds) return null;
  const move = (patch: { x?: number; y?: number }) => editor.updateShape({ id: shape.id, type: shape.type, ...patch });
  return (
    <Section title="Position & size">
      <div className="grid grid-cols-2 gap-2">
        <Field label="X">{(id) => <NumberInput id={id} value={shape.x} onCommit={(x) => move({ x })} />}</Field>
        <Field label="Y">{(id) => <NumberInput id={id} value={shape.y} onCommit={(y) => move({ y })} />}</Field>
        <Field label="Width">{(id) => <input id={id} className={inputCls + ' tabular-nums'} value={Math.round(bounds.w)} readOnly />}</Field>
        <Field label="Height">{(id) => <input id={id} className={inputCls + ' tabular-nums'} value={Math.round(bounds.h)} readOnly />}</Field>
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

function MathProperties({ editor, shape }: { editor: Editor; shape: MathShape }) {
  const result = useRegionResult(shape.id);
  const update = (props: Partial<MathShape['props']>) => editor.updateShape({ id: shape.id, type: MATH_SHAPE_TYPE, props });
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

const TEXT_COLORS = ['black', 'grey', 'blue', 'green', 'red', 'orange', 'violet'] as const;

function TextProperties({ editor, shape }: { editor: Editor; shape: TLShape }) {
  const props = shape.props as { color?: string; size?: string; textAlign?: string };
  const setStyle = <T extends string>(style: { id: string }, value: T) => {
    editor.markHistoryStoppingPoint('style');
    editor.setStyleForSelectedShapes(style as never, value as never);
  };
  return (
    <Section title="Text">
      <Field label="Size">
        {(id) => (
          <select id={id} className={inputCls + ' cursor-pointer'} value={props.size} onChange={(e) => setStyle(DefaultSizeStyle, e.target.value)}>
            <option value="s">Small</option>
            <option value="m">Medium</option>
            <option value="l">Large</option>
            <option value="xl">Extra large</option>
          </select>
        )}
      </Field>
      {props.textAlign !== undefined && (
        <div className="space-y-1">
          <span className="block text-[12px] font-medium text-muted-foreground">Alignment</span>
          <div className="flex gap-1" role="radiogroup" aria-label="Text alignment">
            {(
              [
                ['start', AlignLeft],
                ['middle', AlignCenter],
                ['end', AlignRight],
              ] as const
            ).map(([v, Icon]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={props.textAlign === v}
                aria-label={`Align ${v}`}
                onClick={() => setStyle(DefaultTextAlignStyle, v)}
                className={'flex h-8 w-8 cursor-pointer items-center justify-center rounded border transition-colors duration-150 ' + (props.textAlign === v ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted-foreground hover:bg-muted')}
              >
                <Icon size={15} aria-hidden />
              </button>
            ))}
          </div>
        </div>
      )}
      {props.color !== undefined && (
        <Field label="Color">
          {(id) => (
            <select id={id} className={inputCls + ' cursor-pointer capitalize'} value={props.color} onChange={(e) => setStyle(DefaultColorStyle, e.target.value)}>
              {TEXT_COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <p className="text-[11px] leading-relaxed text-muted-foreground">Double-click the text to edit. Bold, italic, lists and links are in the text toolbar while editing (Ctrl+B, Ctrl+I).</p>
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
  const editor = useAppStore((s) => s.editor);
  const togglePanel = useAppStore((s) => s.togglePanel);
  const selected = useValue('selected', () => editor?.getOnlySelectedShape() ?? null, [editor]);
  const count = useValue('count', () => editor?.getSelectedShapeIds().length ?? 0, [editor]);

  let body: ReactNode;
  if (!editor || count === 0) body = <DocumentProperties />;
  else if (!selected) body = <p className="px-4 py-4 text-[13px] text-muted-foreground">{count} objects selected.</p>;
  else
    body = (
      <>
        {isMathShape(selected) ? <MathProperties editor={editor} shape={selected} /> : selected.type === 'text' || 'textAlign' in selected.props ? <TextProperties editor={editor} shape={selected} /> : null}
        <GeometrySection editor={editor} shape={selected} />
      </>
    );

  return (
    <aside aria-label="Properties" className="flex w-72 shrink-0 flex-col border-l border-border bg-card" data-testid="properties-panel">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="text-[13px] font-semibold">{count === 0 ? 'Worksheet' : selected && isMathShape(selected) ? 'Math region' : 'Properties'}</h2>
        <button type="button" aria-label="Close properties panel" onClick={() => togglePanel(false)} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground">
          <X size={15} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </aside>
  );
}
