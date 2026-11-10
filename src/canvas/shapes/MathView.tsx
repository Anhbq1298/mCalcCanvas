import { SteelControls, SteelSectionLabel } from '../../components/dialogs/SteelControls';
import { SECTION_DEF } from '../../engineering/steel/sections';
import { AlertCircle, AlertTriangle, CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { ReportShapes } from '../../store/reportResults';
import { buildDisplay, flowColumnVectors } from '../../math/MathFormatter';
import { MathEditor } from '../../math/MathEditor';
import { MathRenderer } from '../../math/MathRenderer';
import { useRegionResult } from '../../store/calculationStore';
import { select, stopEditing, updateShape, useCanvasStore } from '../model/canvasStore';
import { fontStack, type MathShape } from '../model/types';
import { majorLineAtOrBelow } from '../pageConstraint';
import { convertMathRegionToText, separateRegion } from '../canvasActions';
import { useSeparateAfterEditing } from './useSeparate';
import { useSeen } from './useSeen';
import { annexInfo, annexNumber, pageNumberOf } from '../annex';
import { useAppStore } from '../../store/appStore';

const PAD_X = 4;
const PAD_Y = 2;

/** A math region: MathLive editor while editing, rendered equation + result otherwise. */
export function MathView({ shape, editing, isStatic }: { shape: MathShape; editing: boolean; isStatic: boolean }) {
  const result = useRegionResult(shape.id);
  const contentRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const measurementFrame = useRef(0);
  const { latex, displayMode, fontSize, color, textFont, equationFont, fontStyle, w, h } = shape.props;
  const display = useMemo(() => {
    const parts = buildDisplay(latex, result, displayMode);
    return shape.props.vectorExpanded && shape.props.vectorLayout === 'column' ? { ...parts, latex: flowColumnVectors(parts.latex) } : parts;
  }, [latex, result, displayMode, shape.props.vectorExpanded, shape.props.vectorLayout]);
  const hasResult = !!result;
  // Off-screen regions with a measured size are typeset when they come near the view.
  const seen = useSeen(contentRef, editing || isStatic || shape.props.baseline === undefined);

  // Auto-size: the box follows the rendered equation unless resized manually.
  useEffect(() => {
    if (isStatic) return;
    const el = contentRef.current;
    if (!el) return;
    // A loaded region with a measured size waits for its first result: measuring the bare
    // formula would move it (and the regions below) and back again when the result arrives.
    if ((!hasResult || !seen) && shape.props.baseline !== undefined && !editing) return;
    const fit = () => {
      // Browser print media hides the editable canvas. Its zero dimensions
      // are not equation measurements and must never enter the document.
      if (!el.isConnected || el.getClientRects().length === 0) return;
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
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(measurementFrame.current);
      measurementFrame.current = requestAnimationFrame(fit);
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(measurementFrame.current); };
  }, [shape.id, shape.props.w, shape.props.h, shape.props.baseline, isStatic, editing, display.latex, textFont, equationFont, fontStyle, hasResult, seen]);

  useSeparateAfterEditing(shape.id, editing, isStatic);

  const onChange = useCallback((next: string) => updateShape(shape.id, { props: { latex: next } }, { history: false }), [shape.id]);
  const onConvertToText = useCallback((text: string, caretOffset: number) => convertMathRegionToText(shape.id, text, caretOffset), [shape.id]);
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
  // Inputs (a definition from literals only, e.g. fck := 35 MPa): light-yellow highlight, blue text.
  const labels = useAppStore((s) => s.settings.labelStyles);
  const INPUT_COLOR = labels?.inputColor ?? DEFAULT_INPUT_COLOR;
  const INPUT_BACKGROUND = labels?.inputBackground ?? DEFAULT_INPUT_BACKGROUND;
  const isInput = !shape.props.constant && !!result && result.status === 'valid' && result.kind === 'definition' && result.references.length === 0 && !!result.value;
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
      data-input={isInput || undefined}
      data-font-style={fontStyle ?? 'normal'}
      data-equation-font={equationFont ?? 'Math'}
      title={
        result?.redefines
          ? `Redefines ${result.redefines.name}: regions below this one use this value; regions above keep the earlier one.`
          : undefined
      }
      style={
        {
          '--math-size': `${fontSize}px`,
          '--math-color': isInput ? INPUT_COLOR : color,
          '--text-font-family': fontStack(textFont ?? 'Inter'),
          '--equation-font-family': fontStack(equationFont && equationFont !== 'Math' ? equationFont : 'Inter'),
          width: 'max-content',
          padding: `${PAD_Y}px ${PAD_X}px`,
          // Green outline: this region redefines a variable defined earlier.
          ...(shape.props.highlight && !editing ? { background: shape.props.highlight, borderRadius: 3 } : {}),
          ...(isInput && !editing ? { background: INPUT_BACKGROUND, borderRadius: 3 } : {}),
          ...(result?.redefines && !isStatic ? { outline: '1.5px solid var(--color-redefine)', outlineOffset: -1, borderRadius: 3 } : {}),
        } as React.CSSProperties
      }
    >
      <div className="flex items-center gap-1.5">
        {editing ? (
          <MathEditor latex={latex} onChange={onChange} onExit={onExit} onConvertToText={onConvertToText} ariaLabel="Math region editor" />
        ) : empty ? (
          <span className="math-placeholder">Empty region</span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="math-baseline">
              {seen ? <MathRenderer latex={display.latex} /> : <span style={{ display: 'inline-block', width: Math.max(0, w - 2 * PAD_X), height: Math.max(0, h - 2 * PAD_Y) }} />}
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
        {latex.startsWith(SECTION_DEF) && <SteelSectionLabel sectionId={result?.value?.number}/>}
        {!isStatic && <SteelControls id={shape.id} latex={latex}/>}
        {/* Status as compact symbols; the explanation appears on hover. */}
        {error && !empty && !(editing && result?.draftError) && <StatusIcon kind="error" message={errorMessage ?? error.message} />}
        {!isStatic && result?.warnings.map((w) => <StatusIcon key={w} kind="warning" message={w} />)}
        {editing && result?.draftError && <StatusIcon kind="draft" message="Incomplete – dependent regions use the last valid expression." />}
      </div>
    </div>
  );
}

/** Input regions: light yellow highlight and blue text (also in the PDF). */
const DEFAULT_INPUT_BACKGROUND = '#fff6bf';
const DEFAULT_INPUT_COLOR = '#1d4ed8';

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
  const printShapes = useContext(ReportShapes);
  const orientation = useAppStore((s) => s.settings.pageOrientation);
  return useCanvasStore((st) => {
    const info = annexInfo(st.shapes);
    const link = info.anchorOf.get(id);
    if (!link) return null;
    const block = info.links.get(link)?.block;
    const at = (printShapes ?? st.shapes)[link];
    if (!block || !at) return null;
    return `${annexNumber(block.number)} is calculated at its link on page ${pageNumberOf(at, orientation)}: it can only use names defined above that link.`;
  });
}
