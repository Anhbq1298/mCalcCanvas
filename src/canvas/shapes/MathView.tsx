import { AlertCircle, AlertTriangle, CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { buildDisplay } from '../../math/MathFormatter';
import { MathEditor } from '../../math/MathEditor';
import { MathRenderer } from '../../math/MathRenderer';
import { useRegionResult } from '../../store/calculationStore';
import { select, stopEditing, updateShape, useCanvasStore } from '../model/canvasStore';
import type { MathShape } from '../model/types';
import { majorLineAtOrBelow } from '../pageConstraint';
import { separateRegion } from '../canvasActions';
import { useSeparateAfterEditing } from './useSeparate';
import { annexInfo, annexNumber, pageNumberOf } from '../annex';
import { useAppStore } from '../../store/appStore';

const PAD_X = 6;
const PAD_Y = 4;

/** A math region: MathLive editor while editing, rendered equation + result otherwise. */
export function MathView({ shape, editing, isStatic }: { shape: MathShape; editing: boolean; isStatic: boolean }) {
  const result = useRegionResult(shape.id);
  const contentRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
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
      const patch: { w?: number; h?: number; baseline?: number } = {};
      if (Math.abs(nw - shape.props.w) > 1 || Math.abs(nh - shape.props.h) > 1) Object.assign(patch, { w: nw, h: nh });
      // Baseline of the rendered equation (not while typing, so the region doesn't jump):
      // it is placed on a major grid line, like writing on ruled paper.
      const probe = probeRef.current;
      if (probe && !editing) {
        const r = el.getBoundingClientRect();
        const scale = el.offsetHeight ? r.height / el.offsetHeight : 1;
        const b = Math.round((probe.getBoundingClientRect().bottom - r.top) / (scale || 1));
        if (b > 0 && b !== shape.props.baseline) patch.baseline = b;
      }
      if (Object.keys(patch).length) {
        updateShape(shape.id, { props: patch }, { history: false });
        // Grew or moved to its baseline: don't sit on top of the next region.
        if (!editing && !useCanvasStore.getState().dragging) separateRegion(shape.id);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shape.id, shape.props.w, shape.props.h, shape.props.baseline, autoSize, isStatic, editing, display.latex]);

  useSeparateAfterEditing(shape.id, editing, isStatic);

  const onChange = useCallback((next: string) => updateShape(shape.id, { props: { latex: next } }, { history: false }), [shape.id]);
  const onExit = useCallback(
    (reason: 'enter' | 'escape') => {
      stopEditing();
      if (reason === 'enter') {
        // Mathcad: Enter leaves the region and puts the red cross below it.
        const s = useCanvasStore.getState().shapes[shape.id];
        const bottom = s ? s.y + (s.type === 'math' ? s.props.h : 0) : 0;
        select([]);
        // Next major line with room for a one-line equation above it.
        if (s) useCanvasStore.setState({ crosshair: { x: s.x, y: majorLineAtOrBelow(bottom + 26) } });
      }
    },
    [shape.id],
  );

  const annexHint = useAnnexHint(shape.id);
  const error = result?.error;
  const empty = latex.trim() === '';
  const errorMessage = error && annexHint && /defined (below|above) this equation/.test(error.message) ? `${error.message} ${annexHint}` : error?.message;

  return (
    <div
      ref={contentRef}
      className="math-region"
      data-testid="math-region"
      data-shape-id={shape.id}
      data-status={result?.status ?? 'empty'}
      data-latex={latex}
      data-result={result?.value?.text ?? ''}
      data-error={errorMessage ?? ''}
      data-redefines={result?.redefines ? result.redefines.name : undefined}
      title={
        result?.redefines
          ? `Redefines ${result.redefines.name}: regions below this one use this value; regions above keep the earlier one.`
          : undefined
      }
      style={
        {
          '--math-size': `${fontSize}px`,
          '--math-color': color,
          width: autoSize ? 'max-content' : w,
          minHeight: autoSize ? undefined : h,
          padding: `${PAD_Y}px ${PAD_X}px`,
          // Green outline: this region redefines a variable defined earlier.
          ...(result?.redefines && !isStatic ? { outline: '1.5px solid var(--color-redefine)', outlineOffset: -1, borderRadius: 3 } : {}),
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
            <span className="math-baseline">
              <MathRenderer latex={display.latex} />
              <span ref={probeRef} className="baseline-probe" aria-hidden />
            </span>
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
        {error && !empty && !(editing && result?.draftError) && <StatusIcon kind="error" message={errorMessage ?? error.message} />}
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

/** For a region in a linked annex block: where the block is calculated. */
function useAnnexHint(id: string): string | null {
  const orientation = useAppStore((s) => s.settings.pageOrientation);
  return useCanvasStore((st) => {
    const info = annexInfo(st.shapes);
    const link = info.anchorOf.get(id);
    if (!link) return null;
    const block = info.links.get(link)?.block;
    const at = st.shapes[link];
    if (!block || !at) return null;
    return `${annexNumber(block.number)} is calculated at its link on page ${pageNumberOf(at, orientation)}: it can only use names defined above that link.`;
  });
}
