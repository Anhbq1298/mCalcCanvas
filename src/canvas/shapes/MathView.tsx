import { AlertCircle, AlertTriangle, CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { buildDisplay } from '../../math/MathFormatter';
import { MathEditor } from '../../math/MathEditor';
import { MathRenderer } from '../../math/MathRenderer';
import { useRegionResult } from '../../store/calculationStore';
import { select, stopEditing, updateShape, useCanvasStore } from '../model/canvasStore';
import type { MathShape } from '../model/types';

const PAD_X = 6;
const PAD_Y = 4;

/** A math region: MathLive editor while editing, rendered equation + result otherwise. */
export function MathView({ shape, editing, isStatic }: { shape: MathShape; editing: boolean; isStatic: boolean }) {
  const result = useRegionResult(shape.id);
  const contentRef = useRef<HTMLDivElement>(null);
  const { latex, displayMode, autoSize, fontSize, color, w, h } = shape.props;
  const display = useMemo(() => buildDisplay(latex, result, displayMode), [latex, result, displayMode]);

  // Auto-size: the box follows the rendered equation unless resized manually.
  useEffect(() => {
    if (isStatic || !autoSize) return;
    const el = contentRef.current;
    if (!el) return;
    const fit = () => {
      const nw = Math.max(24, Math.ceil(el.offsetWidth));
      const nh = Math.max(20, Math.ceil(el.offsetHeight));
      if (Math.abs(nw - shape.props.w) > 1 || Math.abs(nh - shape.props.h) > 1) {
        updateShape(shape.id, { props: { w: nw, h: nh } }, { history: false });
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shape.id, shape.props.w, shape.props.h, autoSize, isStatic]);

  const onChange = useCallback((next: string) => updateShape(shape.id, { props: { latex: next } }, { history: false }), [shape.id]);
  const onExit = useCallback(
    (reason: 'enter' | 'escape') => {
      stopEditing();
      if (reason === 'enter') {
        // Mathcad: Enter leaves the region and puts the red cross below it.
        const s = useCanvasStore.getState().shapes[shape.id];
        const bottom = s ? s.y + (s.type === 'math' ? s.props.h : 0) : 0;
        select([]);
        if (s) useCanvasStore.setState({ crosshair: { x: s.x, y: bottom + 30 } });
      }
    },
    [shape.id],
  );

  const error = result?.error;
  const empty = latex.trim() === '';

  return (
    <div
      ref={contentRef}
      className="math-region"
      data-testid="math-region"
      data-shape-id={shape.id}
      data-status={result?.status ?? 'empty'}
      data-latex={latex}
      data-result={result?.value?.text ?? ''}
      data-error={error?.message ?? ''}
      style={
        {
          '--math-size': `${fontSize}px`,
          '--math-color': color,
          width: autoSize ? 'max-content' : w,
          minHeight: autoSize ? undefined : h,
          padding: `${PAD_Y}px ${PAD_X}px`,
        } as React.CSSProperties
      }
    >
      <div className="flex items-center gap-1.5">
        {editing ? (
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
                  'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-sans text-[11px] font-semibold tracking-wide text-white ' +
                  (display.check.pass ? 'bg-success' : 'bg-destructive')
                }
              >
                {display.check.pass ? <CheckCircle2 size={12} aria-hidden /> : <XCircle size={12} aria-hidden />}
                {display.check.pass ? 'PASS' : 'FAIL'}
              </span>
            )}
          </div>
        )}
        {/* Status as compact symbols; the explanation appears on hover. */}
        {error && !empty && !(editing && result?.draftError) && <StatusIcon kind="error" message={error.message} />}
        {!isStatic && result?.warnings.map((w) => <StatusIcon key={w} kind="warning" message={w} />)}
        {editing && result?.draftError && <StatusIcon kind="draft" message="Incomplete – dependent regions use the last valid expression." />}
      </div>
    </div>
  );
}

const ICONS = { error: AlertCircle, warning: AlertTriangle, draft: CircleDashed };
const TONE = { error: 'text-destructive', warning: 'text-warning', draft: 'text-muted-foreground' };

/** Small status symbol; hovering (or focusing) it shows the full message. */
function StatusIcon({ kind, message }: { kind: 'error' | 'warning' | 'draft'; message: string }) {
  const Icon = ICONS[kind];
  return (
    <span
      className={'status-icon relative inline-flex shrink-0 cursor-help ' + TONE[kind]}
      data-testid={`status-${kind}`}
      role="img"
      aria-label={message}
      tabIndex={-1}
    >
      <Icon size={14} strokeWidth={2.2} aria-hidden />
      <span role="tooltip" className="status-tip">
        {message}
      </span>
    </span>
  );
}
