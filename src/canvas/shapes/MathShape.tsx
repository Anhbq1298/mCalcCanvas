import { AlertCircle, AlertTriangle, CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { HTMLContainer, useEditor, useIsEditing, useSvgExportContext } from 'tldraw';
import { buildDisplay } from '../../math/MathFormatter';
import { MathEditor } from '../../math/MathEditor';
import { MathRenderer } from '../../math/MathRenderer';
import { useRegionResult } from '../../store/calculationStore';
import { MATH_SHAPE_TYPE, type MathShape as MathShapeRecord } from './mathShapeTypes';

const PAD_X = 6;
const PAD_Y = 4;

/** Rendered body of a math region (view + edit modes). */
export function MathShape({ shape }: { shape: MathShapeRecord }) {
  const editor = useEditor();
  const isEditing = useIsEditing(shape.id);
  const isExport = useSvgExportContext() !== null;
  const result = useRegionResult(shape.id);
  const contentRef = useRef<HTMLDivElement>(null);
  const { latex, displayMode, autoSize, fontSize, color, w, h } = shape.props;

  const display = useMemo(() => buildDisplay(latex, result, displayMode), [latex, result, displayMode]);

  // Auto-size: the box follows the rendered equation unless resized manually.
  useEffect(() => {
    if (isExport || !autoSize) return;
    const el = contentRef.current;
    if (!el) return;
    const fit = () => {
      const nw = Math.ceil(el.offsetWidth);
      const nh = Math.ceil(el.offsetHeight);
      const current = editor.getShape<MathShapeRecord>(shape.id);
      if (!current || !current.props.autoSize) return;
      if (Math.abs(nw - current.props.w) > 1 || Math.abs(nh - current.props.h) > 1) {
        editor.run(
          () => editor.updateShape({ id: shape.id, type: MATH_SHAPE_TYPE, props: { w: Math.max(nw, 24), h: Math.max(nh, 20) } }),
          { history: 'ignore' },
        );
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor, shape.id, autoSize, isExport]);

  const onChange = useCallback(
    (next: string) => {
      editor.updateShape({ id: shape.id, type: MATH_SHAPE_TYPE, props: { latex: next } });
    },
    [editor, shape.id],
  );
  const onExit = useCallback(() => {
    editor.setEditingShape(null);
    editor.setCurrentTool('select');
    if (editor.getShape(shape.id)) editor.select(shape.id);
  }, [editor, shape.id]);

  const status = result?.status ?? 'empty';
  const error = result?.error;
  const empty = latex.trim() === '';

  return (
    <HTMLContainer
      style={{ width: w, height: h, overflow: 'visible', pointerEvents: isEditing ? 'all' : 'none' }}
      onPointerDown={isEditing ? (e) => editor.markEventAsHandled(e) : undefined}
    >
      <div
        ref={contentRef}
        className="math-region"
        data-testid="math-region"
        data-shape-id={shape.id}
        data-status={status}
        data-latex={latex}
        data-result={result?.value?.text ?? ''}
        data-error={error?.message ?? ''}
        style={
          {
            '--math-size': `${fontSize}px`,
            '--math-color': color,
            width: 'max-content',
            minWidth: autoSize ? undefined : w,
            padding: `${PAD_Y}px ${PAD_X}px`,
          } as React.CSSProperties
        }
      >
        {isEditing ? (
          <MathEditor latex={latex} onChange={onChange} onExit={onExit} ariaLabel="Math region editor" />
        ) : empty ? (
          <span className="math-placeholder">Empty region</span>
        ) : (
          <div className="flex items-center gap-2">
            <MathRenderer latex={display.latex} />
            {display.check && (
              <span
                data-testid="check-badge"
                className={
                  'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-sans text-[11px] font-semibold tracking-wide ' +
                  (display.check.pass ? 'bg-success text-white' : 'bg-destructive text-white')
                }
              >
                {display.check.pass ? <CheckCircle2 size={12} aria-hidden /> : <XCircle size={12} aria-hidden />}
                {display.check.pass ? 'PASS' : 'FAIL'}
              </span>
            )}
          </div>
        )}

        {error && !empty && (
          <div role="status" className="mt-0.5 flex max-w-[420px] items-start gap-1 font-sans text-[11px] leading-snug text-destructive">
            <AlertCircle size={12} className="mt-px shrink-0" aria-hidden />
            <span className="whitespace-pre-wrap">{error.message}</span>
          </div>
        )}
        {!isExport && result?.warnings.map((wmsg) => (
          <div key={wmsg} className="mt-0.5 flex max-w-[420px] items-start gap-1 font-sans text-[11px] leading-snug text-warning">
            <AlertTriangle size={12} className="mt-px shrink-0" aria-hidden />
            <span>{wmsg}</span>
          </div>
        ))}
        {isEditing && result?.draftError && (
          <div className="mt-0.5 flex items-center gap-1 font-sans text-[11px] text-muted-foreground">
            <CircleDashed size={12} aria-hidden />
            <span>Incomplete – dependents use the last valid expression</span>
          </div>
        )}
      </div>
    </HTMLContainer>
  );
}
