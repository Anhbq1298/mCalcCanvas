import { SteelArrayLabel, SteelControls, SteelSectionLabel } from '../../components/dialogs/SteelControls';
import { sectionArrayInfo } from '../../engineering/steel/sectionArray';
import { SECTION_DEF } from '../../engineering/steel/sections';
import { AlertCircle, AlertTriangle, CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { unitPatch } from '../inputUnits';
import { configureMathfield, MathfieldElement } from '../../math/mathliveSetup';
import { handleMathcadKey } from '../../math/mathcadKeys';
import { fractionUnitLatex, resultUnitText } from '../../math/resultUnit';

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
    const unit = result?.value?.unitLatex;
    const fractionalResult = unit && shape.props.displayUnit.includes('/') && !(result.kind === 'definition' && result.references.length === 0)
      ? { ...result, value: { ...result.value!, latex: result.value!.latex.replace(unit, fractionUnitLatex(unit)) } }
      : result;
    const parts = buildDisplay(latex, fractionalResult, displayMode);
    return shape.props.vectorExpanded && shape.props.vectorLayout === 'column' ? { ...parts, latex: flowColumnVectors(parts.latex) } : parts;
  }, [latex, result, displayMode, shape.props.displayUnit, shape.props.vectorExpanded, shape.props.vectorLayout]);
  const hasResult = !!result;
  const steelArray = useMemo(() => sectionArrayInfo(latex), [latex]);
  // Off-screen regions with a measured size are typeset when they come near the view.
  const seen = useSeen(contentRef, editing || isStatic || shape.props.baseline === undefined);

  // Auto-size: the box follows the rendered equation unless resized manually.
  useEffect(() => {
    // Editing chrome is transient; measure only the finished worksheet equation.
    if (isStatic || editing) return;
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
          <>
            <MathEditor latex={latex} onChange={onChange} onExit={onExit} onConvertToText={onConvertToText} ariaLabel="Math region editor" />
            {result?.value?.unitText && !(result.kind === 'definition' && result.references.length === 0) && (
              <InlineResultUnit shape={shape} numberText={numberPart(result.value.text, result.value.unitText)} unitLatex={result.value.unitLatex} />
            )}
          </>
        ) : empty ? (
          <span className="math-placeholder">Empty region</span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="math-baseline">
              {seen ? steelArray ? <SteelArrayLabel latex={latex} /> : latex.startsWith(SECTION_DEF) ? <SteelSectionLabel sectionId={result?.value?.number} /> : <MathRenderer latex={display.latex} /> : <span style={{ display: 'inline-block', width: Math.max(0, w - 2 * PAD_X), height: Math.max(0, h - 2 * PAD_Y) }} />}
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
        {!isStatic && <SteelControls id={shape.id} latex={latex}/>}
        {/* Status as compact symbols; the explanation appears on hover. */}
        {error && !empty && !(editing && result?.draftError) && <StatusIcon kind="error" message={errorMessage ?? error.message} />}
        {!isStatic && result?.warnings.map((w) => <StatusIcon key={w} kind="warning" message={w} />)}
        {editing && result?.draftError && <StatusIcon kind="draft" message="Incomplete – dependent regions use the last valid expression." />}
      </div>
    </div>
  );
}

function numberPart(text: string, unit: string): string {
  return text.endsWith(unit) ? text.slice(0, -unit.length).trimEnd() : text;
}

/** Result-unit editor shown beside the equation while it is being edited. */
function InlineResultUnit({ shape, numberText, unitLatex }: { shape: MathShape; numberText: string; unitLatex: string }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const currentShape = useRef(shape);
  useLayoutEffect(() => { currentShape.current = shape; });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const mf = new MathfieldElement();
    hostRef.current?.appendChild(mf);
    configureMathfield(mf);
    mf.setAttribute('aria-label', 'Result unit in equation');
    mf.setAttribute('data-testid', 'inline-result-unit');
    mf.className = 'inline-result-unit-input';
    mf.value = fractionUnitLatex(unitLatex);
    let committed = mf.value;
    const commit = () => {
      if (mf.value === committed) return;
      try {
        const next = resultUnitText(mf.value);
        void unitPatch(currentShape.current, next).then(patch => {
          if (patch) updateShape(shape.id, patch);
          committed = mf.value;
          setError(null);
        }, (reason: Error) => setError(reason.message));
      } catch (reason) { setError((reason as Error).message); }
    };
    const focus = () => mf.select();
    const key = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); commit(); }
      else if (event.key === 'Escape') { event.preventDefault(); mf.value = committed; mf.blur(); setError(null); }
      else if (handleMathcadKey(event, mf, () => setError(null))) event.preventDefault();
    };
    mf.addEventListener('focus', focus);
    mf.addEventListener('keydown', key, { capture: true });
    mf.addEventListener('blur', commit);
    return () => {
      mf.removeEventListener('focus', focus);
      mf.removeEventListener('keydown', key, { capture: true });
      mf.removeEventListener('blur', commit);
      mf.remove();
    };
  }, [shape.id, unitLatex]);
  return (
    <span className="inline-result-unit" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <span aria-hidden><MathRenderer latex={`= ${numberText}`} /></span>
      <span ref={hostRef} title={error ?? 'Select the result unit and type a replacement. Use / for a fraction.'} />
      {error && <span role="alert" className="text-destructive text-xs">{error}</span>}
    </span>
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
