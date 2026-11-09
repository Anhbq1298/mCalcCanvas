/**
 * Math Formatting and Text Formatting tabs.
 */
import {
  Eraser,
  IndentDecrease,
  IndentIncrease,
  Link2,
  Unlink,
  RotateCcw,
  Bold,
  List,
  ListOrdered,
  Subscript,
  Superscript,
  Italic,
  Underline,
  type LucideIcon,
} from 'lucide-react';
import { setTextStyle } from '../../canvas/headings';
import { unitPatch } from '../../canvas/inputUnits';
import { useState } from 'react';
import { updateShapes, useCanvasStore, type ShapePatch } from '../../canvas/model/canvasStore';
import { fontStack, PARAGRAPH_STYLES, TEXT_FONTS, TEXT_STYLES, type HeadingLevel, type MathFontStyle, type Shape, type TextStyleId } from '../../canvas/model/types';
import { formatEditingText, hasTextSelection } from '../../canvas/textFormatting';
import { useAppStore } from '../../store/appStore';
import { DEFAULT_LABEL_STYLES, type ResultFormat } from '../../documents/DocumentTypes';
import { safeHref } from '../../canvas/sanitize';
import { parseDisplayUnit } from '../../engine/light';
import { AlignControls, BigButton, Check, Col, ColorButton, DisplayModeSelect, Field, Group, Row, SizeControl, SmallButton, SwatchPicker, TB, TBSelect } from './parts';
import { MOD, patchSelected, useSelectedShapes } from './ribbonState';

/** Text Formatting tab: Text Font, Paragraph, Styles, Links (Mathcad Prime layout). */
export function TextFormattingTab() {
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
export function MathFormattingTab() {
  const selected = useSelectedShapes();
  const settings = useAppStore((s) => s.settings);
  const math = selected.filter((s): s is Extract<Shape, { type: 'math' }> => s.type === 'math');
  const first = math[0];
  const currentFontStyle = first?.props.fontStyle ?? 'normal';
  const currentEquationFont = first?.props.equationFont ?? 'Math';
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
    patchSelected((sh) => (sh.type === 'math' ? { props: { textFont: 'Inter', equationFont: 'Math', fontStyle: 'normal', fontSize: 16, color: '#0f172a', highlight: undefined } } : null));
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
          <Row>
            <Field label="Equation">
              <TBSelect
                label="Equation font family of the selected math regions"
                testId="math-equation-font"
                disabled={!first}
                value={currentEquationFont}
                width={112}
                style={currentEquationFont === 'Math' ? undefined : { fontFamily: fontStack(currentEquationFont) }}
                onChange={(v) => patchSelected((sh) => (sh.type === 'math' ? { props: { equationFont: v } } : null))}
                options={[
                  ['Math', 'Math default'],
                  ...Object.keys(TEXT_FONTS).map((f) => [f, f] as [string, string]),
                ]}
              />
            </Field>
            <Field label="Text">
              <TBSelect
                label="Font for text embedded in the selected equations"
                testId="math-text-font"
                disabled={!first}
                value={first?.props.textFont ?? 'Inter'}
                width={112}
                style={{ fontFamily: fontStack(first?.props.textFont ?? 'Inter') }}
                onChange={(v) => patchSelected((sh) => (sh.type === 'math' ? { props: { textFont: v } } : null))}
                options={Object.keys(TEXT_FONTS).map((f) => [f, f])}
              />
            </Field>
          </Row>
          <Row>
            <Field label="Style">
              <TBSelect
                label="Font style of the selected equations"
                testId="math-font-style"
                disabled={!first}
                value={currentFontStyle}
                width={112}
                onChange={(v) => patchSelected((sh) => (sh.type === 'math' ? { props: { fontStyle: v as MathFontStyle } } : null))}
                options={[
                  ['normal', 'Regular'],
                  ['bold', 'Bold'],
                  ['italic', 'Italic'],
                  ['bold-italic', 'Bold Italic'],
                ]}
              />
            </Field>
            <div className="rb-field">
              <SizeControl kinds={['math']} label="Equation size" />
            </div>
          </Row>
          <Row>
            <ColorButton testId="math-color" title="Equation color" kinds={['math']} />
            <SwatchPicker testId="math-highlight" title="Highlight the selected equations" value={first?.props.highlight ?? null} allowNone onPick={(c) => patchSelected((sh) => (sh.type === 'math' ? { props: { highlight: c ?? undefined } } : null))} />
            <SmallButton icon={Eraser} label="Clear format" title="Reset equation font, text font, style, size, colour and highlight" disabled={!first} onClick={resetFormatting} testId="math-reset-format" />
          </Row>
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

