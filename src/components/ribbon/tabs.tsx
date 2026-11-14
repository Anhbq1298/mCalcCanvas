/**
 * Ribbon tabs: Math, Insert, Matrices/Tables, Calculation, Plots, Document, Help.
 */
import {
  BookOpen,
  Eraser,
  FileText,
  Highlighter,
  Info,
  Keyboard,
  Link2,
  Maximize,
  MoveHorizontal,
  RectangleHorizontal,
  RectangleVertical,
  Ruler,
  ScissorsLineDashed,
  SquareDashed,
  ArrowUpRight,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Table2,
  Trash2,
  BoxSelect,
  Group as Group_,
  Heading2,
  Ungroup,
  ClipboardPaste,
  Copy,
  CopyPlus,
  FileMinus2,
  Heading,
  Scale,
  Scissors,
  Search,
  Calculator,
  CheckSquare,
  Grid3x3,
  Hand,
  FilePlus2,
  ImagePlus,
  ListOrdered,
  LineChart,
  Crosshair,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Sigma,
  Square,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { addHeading } from '../../canvas/headings';
import { SteelSectionDialog } from '../dialogs/SteelControls';
import { insertAnnexLink, sortAnnexByLinkOrder } from '../../canvas/annexActions';
import { useState } from 'react';
import { commands, type ToolId } from '../../app/commands';
import { newGraphSeries, viewport, zoomAt } from '../../canvas/canvasActions';
import { updateShapes, useCanvasStore, type ShapePatch } from '../../canvas/model/canvasStore';
import { type GraphShape } from '../../canvas/model/types';
import { useAppStore } from '../../store/appStore';
import { DEFAULT_MARGINS } from '../../documents/DocumentTypes';
import { MARGIN_PRESETS, presetOf } from '../../export/marginPresets';
import { withShortcut } from '../../app/shortcuts';
import { parseDisplayUnit } from '../../engine/light';
import { CONSTANTS, OPERATORS, SYMBOLS, UNITS_PALETTE } from './palettes';
import { Popover, PalettePopover } from './Popover';
import { CharacterMap } from './CharacterMap';
import { ShapeGallery } from './ShapeGallery';
import { DimensionPicker, FunctionsMenu, OperatorsMenu } from './MatrixMenus';
import { applyGridCommand, type GridCommand } from '../../canvas/matrixTableCommands';
import { BigButton, Check, Col, Field, Group, SmallButton, TB, TBSelect } from './parts';
import { MOD, useSelectedShapes } from './ribbonState';

/** Math tab: clipboard, regions, operators and symbols, selection. */
export function MathTab() {
  const tool = useCanvasStore((s) => s.tool);
  return (
    <>
      <Group label="Clipboard">
        <BigButton icon={ClipboardPaste} label="Paste" title={`Paste (${MOD}V)`} onClick={() => void commands.paste()} />
        <Col>
          <SmallButton icon={Scissors} label="Cut" title={`Cut (${MOD}X)`} onClick={commands.cut} />
          <SmallButton icon={Copy} label="Copy" title={`Copy (${MOD}C)`} onClick={commands.copy} />
          <SmallButton icon={CopyPlus} label="Duplicate" title={`Duplicate (${MOD}D)`} onClick={commands.duplicate} />
        </Col>
      </Group>
      <Group label="Regions">
        <BigButton icon={Sigma} label="Math" title="Math region (or just type on the page)" active={tool === 'math'} onClick={() => commands.setTool('math')} testId="tool-math" />
        <BigButton icon={Type} label="Text" title="Text region (or type &quot;)" active={tool === 'text'} onClick={() => commands.setTool('text')} testId="tool-text" />
        <Col>
          <SmallButton icon={CheckSquare} label="Check" title="Insert check (≤ 1)" onClick={() => commands.insertCheck()} testId="insert-check" />
          <SmallButton icon={Heading} label="Heading" title="Section heading (shown in the outline)" onClick={() => addHeading(1)} />
          <SmallButton icon={Heading2} label="Sub-heading" title="Sub-section heading (shown in the outline)" onClick={() => addHeading(2)} />
        </Col>
        <Col>
          <SmallButton icon={Link2} label="Annex link" title="Link to a new annex block on the ANNEX page" onClick={() => insertAnnexLink()} testId="insert-annex" />
        </Col>
      </Group>
      <Group label="Operators and Symbols">
        <PalettePopover big label="Operators" glyph="√" sections={OPERATORS} testId="palette-operators" columns={5} />
        <PalettePopover big label="Symbols" glyph="β" sections={SYMBOLS} testId="palette-symbols" />
        <PalettePopover big label="Constants" glyph="π" sections={CONSTANTS} testId="palette-constants" />
        <PalettePopover big label="Units" glyph="m" sections={UNITS_PALETTE} testId="palette-units" />
      </Group>
      <Group label="Selection">
        <Col>
          <SmallButton icon={BoxSelect} label="Select all" title={`Select all (${MOD}A)`} onClick={commands.selectAll} />
          <SmallButton icon={Group_} label="Group" title={`Group (${MOD}G)`} onClick={commands.group} />
          <SmallButton icon={Ungroup} label="Ungroup" title={`Ungroup (${MOD}⇧G)`} onClick={commands.ungroup} />
        </Col>
      </Group>
    </>
  );
}

/** Insert tab: free drawing tools, ready-made shapes, images and special characters. */
export function InsertTab() {
  const tool = useCanvasStore((s) => s.tool);
  const [sectionOpen, setSectionOpen] = useState(false);
  const t = (id: ToolId, icon: LucideIcon, label: string) => <SmallButton icon={icon} label={label} active={tool === id} onClick={() => commands.setTool(id)} testId={`tool-${id}`} />;
  return (
    <>
      <Group label="Engineering">
        <BigButton icon={RectangleVertical} label="Steel Section" title="Choose a steel section and insert its property array" onClick={() => setSectionOpen(true)} testId="insert-steel-section" />
        {sectionOpen && <SteelSectionDialog close={() => setSectionOpen(false)} />}
      </Group>
      <Group label="Free Shapes">
        <Col>
          {t('select', MousePointer2, 'Select')}
          {t('hand', Hand, 'Pan')}
          {t('draw', Pencil, 'Freehand')}
        </Col>
        <Col>
          {t('line', Minus, 'Line')}
          {t('arrow', ArrowUpRight, 'Arrow')}
          {t('rect', Square, 'Rectangle')}
        </Col>
      </Group>
      <Group label="Shapes">
        <ShapeGallery />
      </Group>
      <Group label="Image">
        <BigButton icon={ImagePlus} label="Image" title="Insert an image (PNG, JPG, SVG…)" onClick={() => void commands.insertImage()} testId="insert-image" />
      </Group>
      <Group label="Symbols">
        <CharacterMap />
      </Group>
    </>
  );
}

/** Matrices/Tables tab (Mathcad Prime): insert a matrix or table, operators, functions, rows and columns, result display. */
export function MatricesTab() {
  const gridSelected = useCanvasStore((s) => {
    if (s.selection.length !== 1) return false;
    const shape = s.shapes[s.selection[0]];
    return shape?.type === 'table' || (shape?.type === 'math' && /\\begin\{bmatrix\}/.test(shape.props.latex));
  });
  const settings = useAppStore((s) => s.settings);
  const toggle = (key: 'showMatrixIndices' | 'collapseNestedMatrices') => useAppStore.getState().updateSettings({ [key]: !settings[key] });
  const cmd = (icon: LucideIcon, label: string, c: GridCommand, testId: string) => <SmallButton icon={icon} label={label} disabled={!gridSelected} onClick={() => applyGridCommand(c)} testId={testId} />;
  return (
    <>
      <Group label="Matrices and Tables">
        <Popover title="Insert matrix" testId="insert-matrix" big="Matrix" width={248} trigger={<Grid3x3 size={24} strokeWidth={1.6} aria-hidden />}>
          {(close) => <DimensionPicker kind="matrix" close={close} />}
        </Popover>
        <Popover title="Insert table" testId="insert-table" big="Table" width={248} trigger={<Table2 size={24} strokeWidth={1.6} aria-hidden />}>
          {(close) => <DimensionPicker kind="table" close={close} />}
        </Popover>
      </Group>
      <Group label="Operators and Functions">
        <Popover title="Vector/matrix operators" testId="matrix-operators" big="Operators" width={310} trigger={<span className="font-math text-[22px] italic leading-none">Aᵀ</span>}>
          {() => <OperatorsMenu />}
        </Popover>
        <Popover title="Vector/matrix functions" testId="matrix-functions" big="Functions" width={520} trigger={<span className="font-math text-[20px] italic leading-none">f(M)</span>}>
          {() => <FunctionsMenu />}
        </Popover>
      </Group>
      <Group label="Rows and Columns">
        <Col>
          {cmd(ArrowUpToLine, 'Insert above', 'above', 'grid-insert-above')}
          {cmd(ArrowDownToLine, 'Insert below', 'below', 'grid-insert-below')}
          {cmd(Trash2, 'Delete row', 'delete-row', 'grid-delete-row')}
        </Col>
        <Col>
          {cmd(ArrowLeftToLine, 'Insert left', 'left', 'grid-insert-left')}
          {cmd(ArrowRightToLine, 'Insert right', 'right', 'grid-insert-right')}
          {cmd(Trash2, 'Delete column', 'delete-column', 'grid-delete-column')}
        </Col>
        <Col>
          {cmd(Eraser, 'Clear cell', 'clear', 'grid-clear')}
        </Col>
      </Group>
      <Group label="Result Format">
        <Col>
          <Check label="Show indices" testId="matrix-indices" checked={!!settings.showMatrixIndices} onChange={() => toggle('showMatrixIndices')} />
          <Check label="Collapse nested" testId="matrix-collapse" checked={!!settings.collapseNestedMatrices} onChange={() => toggle('collapseNestedMatrices')} />
        </Col>
      </Group>
    </>
  );
}

/** Calculation tab: calculate, worksheet units and precision. */
export function CalculationTab() {
  const settings = useAppStore((s) => s.settings);
  const { updateSettings } = useAppStore.getState();
  return (
    <>
      <Group label="Worksheet Calculation">
        <BigButton icon={Calculator} label="Calculate" title={withShortcut('Calculate all', 'calculate')} onClick={commands.calculateAll} testId="rb-calculate" />
      </Group>
      <Group label="Worksheet Settings">
        <Col>
          <Field label="Unit system">
            <TBSelect
              label="Unit system for results (whole worksheet)"
              testId="worksheet-units"
              value={settings.unitSystem}
              width={96}
              onChange={(v) => updateSettings({ unitSystem: v as 'SI' | 'Imperial' })}
              options={[['SI', 'SI'], ['Imperial', 'USCS']]}
            />
          </Field>
          <Field label="Decimals">
            <TBSelect
              label="Default decimal places (whole worksheet)"
              testId="worksheet-decimals"
              value={settings.precision}
              width={96}
              onChange={(v) => updateSettings({ precision: Number(v) })}
              options={[0, 1, 2, 3, 4, 5, 6].map((d) => [d, `${d}`])}
            />
          </Field>
          <Field label="Snap">
            <TBSelect
              label="Equations and text snap their baseline to worksheet lines (40 px) or to every grid square (20 px)"
              testId="baseline-snap"
              value={settings.baselineSnap ?? 'major'}
              width={96}
              onChange={(v) => updateSettings({ baselineSnap: v as 'major' | 'minor' })}
              options={[['major', 'Lines'], ['minor', 'Squares']]}
            />
          </Field>
        </Col>
      </Group>
      <Group label="Annex">
        <Col>
          <SmallButton icon={ListOrdered} label="Sort annex" title="Sort annex blocks by link order" onClick={() => sortAnnexByLinkOrder()} />
        </Col>
      </Group>
    </>
  );
}

/** Plots tab: insert an X-Y plot; axes, options and series of the selected plot. */
export function PlotsTab() {
  const selected = useSelectedShapes();
  const graph = selected.find((s): s is GraphShape => s.type === 'graph');
  const [draft, setDraft] = useState<{ field: 'xUnit' | 'yUnit' | 'title'; value: string } | null>(null);
  const [unitError, setUnitError] = useState<string | null>(null);
  const patch = (props: Partial<GraphShape['props']>) => graph && updateShapes({ [graph.id]: { props } as ShapePatch });
  const field = (f: 'xUnit' | 'yUnit' | 'title', label: string, placeholder: string) => (
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
      className={'rb-input w-[120px] ' + (unitError && f !== 'title' ? 'border-destructive' : '')}
    />
  );
  return (
    <>
      <Group label="Insert">
        <BigButton icon={LineChart} label="X-Y Plot" title="Insert X-Y plot" onClick={() => commands.insertGraph()} testId="graph-insert" />
      </Group>
      <Group label="Axes">
        <Col>
          <Field label="Title">{field('title', 'Graph title', 'Title')}</Field>
          <Field label="X unit">{field('xUnit', 'X axis unit', 'automatic')}</Field>
          <Field label="Y unit">{field('yUnit', 'Y axis unit', 'automatic')}</Field>
        </Col>
      </Group>
      <Group label="Options">
        <Col>
          <SmallButton icon={Scale} label="Equal axes" title="Equal axes (same scale on X and Y, for sections and plans)" disabled={!graph} active={!!graph?.props.equalAxes} onClick={() => patch({ equalAxes: !graph!.props.equalAxes })} testId="graph-equal" />
          <SmallButton icon={Grid3x3} label="Grid lines" disabled={!graph} active={!!graph?.props.grid} onClick={() => patch({ grid: !graph!.props.grid })} testId="graph-grid" />
          <SmallButton icon={Crosshair} label="Axes at origin" title="Axes through origin (values on bottom/left)" disabled={!graph} active={!!graph?.props.axesAtOrigin} onClick={() => patch({ axesAtOrigin: !graph!.props.axesAtOrigin })} testId="graph-origin" />
        </Col>
      </Group>
      <Group label="Series">
        <BigButton
          icon={Plus}
          label="Add series"
          title="Add a series (edit x, y and style in the Properties panel)"
          disabled={!graph}
          onClick={() => {
            patch({ series: [...graph!.props.series, newGraphSeries(graph!.props.series)] });
            useAppStore.getState().togglePanel(true);
          }}
          testId="graph-add-series"
        />
        <span className="self-center px-1 text-[12px] text-docs-muted">{graph ? `${graph.props.series.length} series` : 'Select a plot'}</span>
      </Group>
    </>
  );
}

/** Document tab: page setup, show, zoom and page spacing. */
export function DocumentTab() {
  const settings = useAppStore((s) => s.settings);
  const view = useAppStore((s) => s.view);
  const isGrid = useCanvasStore((s) => s.isGrid);
  const isSnap = useCanvasStore((s) => s.isSnap);
  const zoom = useCanvasStore((s) => s.camera.z);
  const { updateSettings, setView, openDialog } = useAppStore.getState();
  const paged = settings.canvasMode === 'page';
  const margins = settings.margins ?? DEFAULT_MARGINS;
  const preset = presetOf(margins);
  const zoomPct = Math.round(zoom * 100);
  const steps = [50, 75, 90, 100, 125, 150, 200];
  return (
    <>
      <Group label="Page Setup" testId="group-page-setup">
        <Col>
          <Field label="Size">
            <TBSelect label="Paper size" testId="doc-paper" value={settings.paper ?? 'A4'} width={112} onChange={(v) => updateSettings({ paper: v as 'A4' | 'A3' })} options={[['A4', 'A4'], ['A3', 'A3']]} />
          </Field>
          <Field label="Orientation">
            <TB icon={RectangleVertical} label="Portrait" active={settings.pageOrientation === 'portrait'} onClick={() => updateSettings({ pageOrientation: 'portrait' })} testId="doc-portrait" />
            <TB icon={RectangleHorizontal} label="Landscape" active={settings.pageOrientation === 'landscape'} onClick={() => updateSettings({ pageOrientation: 'landscape' })} testId="doc-landscape" />
          </Field>
          <Field label="Margins">
            <TBSelect
              label="Margins"
              testId="doc-margins"
              value={preset}
              width={112}
              onChange={(v) => (v === 'custom' ? openDialog('page-setup') : updateSettings({ margins: MARGIN_PRESETS.find((p) => p.id === v)!.margins }))}
              options={[...MARGIN_PRESETS.map((p) => [p.id, p.label.split(' (')[0]] as [string, string]), ['custom', preset === 'custom' ? `Custom (${margins.left}/${margins.top})` : 'Custom…']]}
            />
          </Field>
        </Col>
        <BigButton icon={FileText} label="Page Setup" title="Page setup… (paper, orientation, margins, preview)" onClick={() => openDialog('page-setup')} testId="doc-page-setup" />
      </Group>
      <Group label="Show">
        <Col>
          <Check label="Page boundaries" testId="doc-boundaries" checked={view.boundaries} disabled={!paged} onChange={(v) => setView({ boundaries: v })} title="Show the paper edge and the printable area (dashed) of every page" />
          <Check label="Grid" testId="toggle-grid" checked={isGrid} onChange={() => commands.toggleGrid()} />
          <Check label="Ruler" testId="doc-ruler" checked={view.ruler} onChange={(v) => setView({ ruler: v })} title="Millimetre rulers along the top and left (follow zoom and scrolling)" />
        </Col>
        <Col>
          <Check label="Header & footer" testId="toggle-chrome" checked={settings.showHeaderFooter} onChange={(v) => updateSettings({ showHeaderFooter: v })} />
          <Check label="Pages" testId="doc-pages" checked={paged} onChange={(v) => updateSettings({ canvasMode: v ? 'page' : 'free' })} title="Page layout (checked) or a free canvas without pages" />
        </Col>
      </Group>
      <Group label="Snapping">
        <Col>
          <Check label="Snap to grid" testId="doc-snap" checked={isSnap} onChange={() => commands.toggleSnap()} />
          <TBSelect
            label="Snap spacing for equations and text"
            testId="doc-snap-spacing"
            disabled={!isSnap}
            value={settings.baselineSnap ?? 'major'}
            width={144}
            onChange={(v) => updateSettings({ baselineSnap: v as 'major' | 'minor' })}
            options={[['minor', 'Small squares'], ['major', 'Worksheet lines']]}
          />
        </Col>
      </Group>
      <Group label="Zoom">
        <Col>
          <TBSelect
            label="Zoom"
            value={steps.includes(zoomPct) ? zoomPct : 'cur'}
            width={96}
            onChange={(v) => {
              if (v === 'fit') commands.zoomToFit();
              else if (v !== 'cur') zoomAt({ x: viewport.w / 2, y: viewport.h / 2 }, Number(v) / 100 / useCanvasStore.getState().camera.z);
            }}
            options={[...(!steps.includes(zoomPct) ? [['cur', `${zoomPct}%`] as [string, string]] : []), ...steps.map((z) => [z, `${z}%`] as [number, string]), ['fit', 'Fit content']]}
          />
          <SmallButton icon={Search} label="100 %" title="Actual size (100 %)" onClick={commands.zoomActualSize} testId="doc-zoom-100" />
        </Col>
        <Col>
          <SmallButton icon={Maximize} label="Fit page" onClick={commands.zoomFitPage} testId="doc-fit-page" disabled={!paged} />
          <SmallButton icon={MoveHorizontal} label="Fit width" onClick={commands.zoomFitWidth} testId="doc-fit-width" disabled={!paged} />
        </Col>
      </Group>
      <Group label="Pages">
        <BigButton icon={ScissorsLineDashed} label="Page Break" title={withShortcut('Page break at the + cross', 'page-break')} onClick={commands.pageBreak} testId="doc-page-break" disabled={!paged} />
        <Col>
          <SmallButton icon={FilePlus2} label="Blank page" title={withShortcut('Insert blank page', 'blank-page')} onClick={commands.insertBlankPage} testId="insert-page" disabled={!paged} />
          <SmallButton icon={FileMinus2} label="Delete empty page" onClick={commands.deletePage} disabled={!paged} testId="doc-delete-page" />
          <Check label="Optimize print layout" testId="doc-optimize-print" checked={!!settings.optimizePrintLayout} onChange={(value) => updateSettings({ optimizePrintLayout: value })} title="Reflow a copy for printing, preserving the worksheet arrangement" />
        </Col>
      </Group>
    </>
  );
}

/** Help tab: help center, shortcuts and guides. */
export function HelpTab() {
  const { openHelp, openDialog } = useAppStore.getState();
  return (
    <>
      <Group label="Help">
        <BigButton icon={BookOpen} label="Help Center" onClick={() => openHelp('getting-started')} testId="help-open" title={withShortcut('Help center', 'help')} />
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

