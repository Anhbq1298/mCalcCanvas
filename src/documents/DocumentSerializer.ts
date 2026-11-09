import { DEFAULT_GRAPH_STYLE, DEFAULT_MATH_PROPS, DEFAULT_TEXT_PROPS, TEXT_FONTS, type AnnexRole, type GraphSeriesStyle, defaultTableProps, type Shape } from '../canvas/model/types';
import { escapeHtml, sanitizeHtml } from '../canvas/sanitize';
import {
  DEFAULT_LABEL_STYLES,
  DEFAULT_SETTINGS,
  DOCUMENT_VERSION,
  EMPTY_INPUT_RESULT_CONFIG,
  type CalculationDocument,
  type InputResultConfig,
  type DocumentSettings,
  type LabelStyles,
  type PageMargins,
} from './DocumentTypes';

type Raw = Record<string, unknown>;

/** Plain text from a tldraw rich-text (ProseMirror) document. */
function richTextToHtml(rt: unknown): string {
  const lines: string[] = [];
  const walk = (node: Raw, marks: string[] = []): string => {
    if (node.type === 'text') {
      let t = escapeHtml(String(node.text ?? ''));
      const m = ((node.marks as Raw[] | undefined) ?? []).map((x) => x.type);
      if (m.includes('bold') || marks.includes('bold')) t = `<b>${t}</b>`;
      if (m.includes('italic')) t = `<i>${t}</i>`;
      return t;
    }
    return ((node.content as Raw[] | undefined) ?? []).map((c) => walk(c, marks)).join('');
  };
  for (const block of ((rt as Raw)?.content as Raw[] | undefined) ?? []) lines.push(`<div>${walk(block) || '<br>'}</div>`);
  return lines.join('');
}

/**
 * Document-level migrations: each entry upgrades from version N to N+1.
 */
const MIGRATIONS: Record<number, (doc: Raw) => Raw> = {
  // 0 → 1: early prototypes stored settings without page orientation.
  0: (doc) => ({ ...doc, version: 1, settings: { ...DEFAULT_SETTINGS, ...((doc.settings as Partial<DocumentSettings>) ?? {}) } }),
  // 1 → 2: tldraw store snapshot → CalcCanvas shape list (math, text, images, rectangles).
  1: (doc) => {
    const store = ((doc.shapes as Raw | undefined)?.store ?? {}) as Record<string, Raw>;
    const records = Object.values(store);
    const assets = new Map(records.filter((r) => r.typeName === 'asset').map((r) => [r.id, (r.props as Raw)?.src]));
    const shapes: Shape[] = [];
    for (const r of records.filter((x) => x.typeName === 'shape').sort((a, b) => String(a.index).localeCompare(String(b.index)))) {
      const p = (r.props ?? {}) as Raw;
      const base = { id: String(r.id).replace(/^shape:/, 's_'), x: Number(r.x) || 0, y: Number(r.y) || 0 };
      if (r.type === 'math') shapes.push({ ...base, type: 'math', props: { ...DEFAULT_MATH_PROPS, ...(p as object) } } as Shape);
      else if (r.type === 'text') shapes.push({ ...base, type: 'text', props: { ...DEFAULT_TEXT_PROPS, w: Number(p.w) || 320, html: richTextToHtml(p.richText) } });
      else if (r.type === 'image' && typeof assets.get(p.assetId) === 'string') shapes.push({ ...base, type: 'image', props: { w: Number(p.w) || 200, h: Number(p.h) || 150, src: String(assets.get(p.assetId)) } });
      else if (r.type === 'geo') shapes.push({ ...base, type: 'rect', props: { w: Number(p.w) || 100, h: Number(p.h) || 60, stroke: '#1e3a5f', strokeWidth: 1.5 } });
    }
    return { ...doc, version: 2, shapes };
  },
  // 2 → 3: Input & Results table definition and batch rows.
  2: (doc) => ({ ...doc, version: 3, inputResult: EMPTY_INPUT_RESULT_CONFIG }),
};

export class DocumentFormatError extends Error {}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/** Finite number clamped to [min, max]. */
const bounded = (v: unknown, d: number, min: number, max: number) => Math.min(max, Math.max(min, num(v, d)));
/** Canvas coordinates beyond this are treated as corrupt and clamped. */
const COORD_LIMIT = 1e7;
const SIZE_LIMIT = 1e5;
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const color = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : d);

/** Validate one shape from untrusted JSON; returns null if unusable. */
export function sanitizeShape(raw: unknown): Shape | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Raw;
  const p = (r.props && typeof r.props === 'object' ? r.props : {}) as Raw;
  const id = str(r.id).slice(0, 100) || newImportId();
  const base = {
    id,
    x: bounded(r.x, 0, -COORD_LIMIT, COORD_LIMIT),
    y: bounded(r.y, 0, -COORD_LIMIT, COORD_LIMIT),
    ...(typeof r.groupId === 'string' ? { groupId: r.groupId.slice(0, 100) } : {}),
  };
  switch (r.type) {
    case 'math': {
      const modes = ['auto', 'formula', 'result', 'formulaResult', 'full'];
      return {
        ...base,
        type: 'math',
        props: {
          w: bounded(p.w, 60, 1, SIZE_LIMIT),
          h: bounded(p.h, 32, 1, SIZE_LIMIT),
          latex: str(p.latex).slice(0, 4000),
          displayMode: (modes.includes(p.displayMode as string) ? p.displayMode : 'auto') as never,
          displayUnit: str(p.displayUnit).slice(0, 60),
          precision: Math.round(bounded(p.precision, -1, -1, 8)),
          ...(p.vectorLayout === 'column' ? { vectorLayout: 'column' as const } : {}),
          ...(p.vectorExpanded === true ? { vectorExpanded: true } : {}),
          ...(p.constant === true ? { constant: true } : {}),
          ...(['general', 'decimal', 'scientific', 'engineering'].includes(p.resultFormat as string) ? { resultFormat: p.resultFormat as never } : {}),
          ...(typeof p.trailingZeros === 'boolean' ? { trailingZeros: p.trailingZeros } : {}),
          ...(typeof p.highlight === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.highlight) ? { highlight: p.highlight } : {}),
          textFont: TEXT_FONTS[str(p.textFont)] ? str(p.textFont) : 'Inter',
          autoSize: p.autoSize !== false,
          fontSize: Math.min(64, Math.max(8, num(p.fontSize, 18))),
          color: color(p.color, '#0f172a'),
          ...(typeof p.baseline === 'number' && Number.isFinite(p.baseline) ? { baseline: bounded(p.baseline, 20, 1, 2000) } : {}),
        },
      };
    }
    case 'text':
      return {
        ...base,
        type: 'text',
        props: {
          w: bounded(p.w, 320, 20, SIZE_LIMIT),
          h: bounded(p.h, 24, 1, SIZE_LIMIT),
          html: sanitizeHtml(str(p.html)),
          fontFamily: TEXT_FONTS[str(p.fontFamily)] ? str(p.fontFamily) : 'Inter',
          fontSize: Math.min(72, Math.max(8, num(p.fontSize, 15))),
          color: color(p.color, '#0f172a'),
          align: (['left', 'center', 'right', 'justify'].includes(p.align as string) ? p.align : 'left') as never,
          ...([1, 2, 3].includes(p.heading as number) ? { heading: p.heading as 1 | 2 | 3 } : {}),
          ...(p.textStyle === 'title' || p.textStyle === 'subtitle' ? { textStyle: p.textStyle } : {}),
          ...annexRole(p.annex),
        },
      };
    case 'image': {
      const src = str(p.src);
      if (!/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/.test(src)) return null;
      return { ...base, type: 'image', props: { w: bounded(p.w, 200, 1, SIZE_LIMIT), h: bounded(p.h, 150, 1, SIZE_LIMIT), src } };
    }
    case 'rect':
      return { ...base, type: 'rect', props: { w: bounded(p.w, 100, 1, SIZE_LIMIT), h: bounded(p.h, 60, 1, SIZE_LIMIT), stroke: color(p.stroke, '#1e3a5f'), strokeWidth: bounded(p.strokeWidth, 1.5, 0.25, 20) } };
    case 'line':
      return { ...base, type: 'line', props: { x2: bounded(p.x2, 0, -SIZE_LIMIT, SIZE_LIMIT), y2: bounded(p.y2, 0, -SIZE_LIMIT, SIZE_LIMIT), stroke: color(p.stroke, '#1e3a5f'), strokeWidth: bounded(p.strokeWidth, 1.5, 0.25, 20), arrow: p.arrow === true } };
    case 'draw': {
      const pts = Array.isArray(p.points)
        ? (p.points as unknown[])
            .filter((q): q is [number, number] => Array.isArray(q) && q.length === 2 && q.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= SIZE_LIMIT))
            .map(([a, b]) => [a, b] as [number, number])
        : [];
      if (!pts.length) return null;
      return { ...base, type: 'draw', props: { points: pts.slice(0, 20000), stroke: color(p.stroke, '#1e3a5f'), strokeWidth: bounded(p.strokeWidth, 2, 0.25, 20) } };
    }
    case 'table': {
      const rows = Math.round(bounded(p.rows, 3, 1, 100)); const columns = Math.round(bounded(p.columns, 3, 1, 50));
      const defaults = defaultTableProps(rows, columns); const rawCells = Array.isArray(p.cells) ? p.cells : [];
      const cells = Array.from({ length: rows }, (_, rIndex) => { const row = Array.isArray(rawCells[rIndex]) ? rawCells[rIndex] as unknown[] : []; return Array.from({ length: columns }, (_, cIndex) => { const cell = row[cIndex]; return { value: (cell && typeof cell === 'object' ? str((cell as Raw).value) : str(cell)).slice(0, 1000) }; }); });
      const rawWidths = Array.isArray(p.columnWidths) ? p.columnWidths : []; const columnWidths = Array.from({ length: columns }, (_, index) => bounded(rawWidths[index], 112, 48, 600));
      return { ...base, type: 'table', props: { ...defaults, w: bounded(p.w, columnWidths.reduce((sum, width) => sum + width, 0), 48, SIZE_LIMIT), h: bounded(p.h, rows * 32, 24, SIZE_LIMIT), cells, columnWidths, headerRow: p.headerRow !== false } };
    }
    case 'graph': {
      const styles = ['line', 'marker', 'circle', 'segments'];
      const latex = (v: unknown) => str(v).slice(0, 2000);
      const series = (Array.isArray(p.series) ? (p.series as unknown[]) : [])
        .filter((q): q is Record<string, unknown> => !!q && typeof q === 'object')
        .slice(0, MAX_GRAPH_SERIES)
        .map((q, i) => ({
          id: str(q.id).slice(0, 40) || `s${i}`,
          label: str(q.label).slice(0, 80),
          x: latex(q.x),
          y: latex(q.y),
          style: (styles.includes(q.style as string) ? q.style : 'line') as GraphSeriesStyle,
          r: latex(q.r),
          color: color(q.color, '#1e3a5f'),
          width: bounded(q.width, 1.5, 0.25, 20),
          show: latex(q.show),
        }));
      return {
        ...base,
        type: 'graph',
        props: {
          w: bounded(p.w, 360, 40, SIZE_LIMIT),
          h: bounded(p.h, 280, 40, SIZE_LIMIT),
          title: str(p.title).slice(0, 120),
          xLabel: str(p.xLabel).slice(0, 80),
          yLabel: str(p.yLabel).slice(0, 80),
          xUnit: str(p.xUnit).slice(0, 40),
          yUnit: str(p.yUnit).slice(0, 40),
          equalAxes: p.equalAxes === true,
          grid: typeof p.grid === 'boolean' ? p.grid : DEFAULT_GRAPH_STYLE.grid,
          axesAtOrigin: typeof p.axesAtOrigin === 'boolean' ? p.axesAtOrigin : DEFAULT_GRAPH_STYLE.axesAtOrigin,
          font: typeof p.font === 'string' && p.font in TEXT_FONTS ? p.font : DEFAULT_GRAPH_STYLE.font,
          background: color(p.background, DEFAULT_GRAPH_STYLE.background),
          series,
        },
      };
    }
    default:
      return null;
  }
}

/** Upper bound on series per graph (each series is evaluated by the engine). */
export const MAX_GRAPH_SERIES = 20;

const MAX_SHAPES = 20_000;

let importCounter = 0;
function newImportId(): string {
  return `s_${Date.now().toString(36)}_${(importCounter++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Give every shape a unique id. A duplicate keeps its content under a new
 * id (dropping it would silently lose part of the worksheet).
 */
export function dedupeIds(shapes: Shape[]): Shape[] {
  const seen = new Set<string>();
  return shapes.map((s) => {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      return s;
    }
    let id = newImportId();
    while (seen.has(id)) id = newImportId();
    seen.add(id);
    return { ...s, id };
  });
}

/** Validate and migrate untrusted JSON (imported file or IndexedDB record). */
export function parseDocument(input: unknown): CalculationDocument {
  if (!input || typeof input !== 'object') throw new DocumentFormatError('Not a CalcCanvas document.');
  let doc = input as Raw;
  if (doc.format !== undefined && doc.format !== 'calccanvas') throw new DocumentFormatError('Not a CalcCanvas document.');
  let version = typeof doc.version === 'number' ? doc.version : 0;
  if (version > DOCUMENT_VERSION) throw new DocumentFormatError(`This document was created by a newer version (v${version}).`);
  while (version < DOCUMENT_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new DocumentFormatError(`Cannot migrate document version ${version}.`);
    doc = migrate(doc);
    version = doc.version as number;
  }
  if (typeof doc.id !== 'string' || !doc.id) throw new DocumentFormatError('Document is missing an id.');
  if (!Array.isArray(doc.shapes)) throw new DocumentFormatError('Document has no canvas data.');
  const shapes = dedupeIds((doc.shapes as unknown[]).slice(0, MAX_SHAPES).map(sanitizeShape).filter((s): s is Shape => !!s));
  const now = new Date().toISOString();
  const settings = { ...DEFAULT_SETTINGS, ...((doc.settings as Partial<DocumentSettings>) ?? {}) };
  if (settings.unitSystem !== 'SI' && settings.unitSystem !== 'Imperial') settings.unitSystem = 'SI';
  if (settings.canvasMode !== 'free' && settings.canvasMode !== 'page') settings.canvasMode = 'page';
  if (settings.pageOrientation !== 'portrait' && settings.pageOrientation !== 'landscape') settings.pageOrientation = 'portrait';
  settings.showHeaderFooter = settings.showHeaderFooter !== false;
  if (!TEXT_FONTS[settings.textFont]) settings.textFont = 'Inter';
  settings.baselineSnap = settings.baselineSnap === 'minor' ? 'minor' : 'major';
  settings.pages = Math.min(200, Math.max(1, Math.round(num(settings.pages, 1))));
  settings.showMatrixIndices = settings.showMatrixIndices === true;
  settings.collapseNestedMatrices = settings.collapseNestedMatrices === true;
  // Page setup (absent in older worksheets: A4 and the original 20/16 mm margins).
  if (settings.paper !== 'A3') delete settings.paper;
  const m = settings.margins as Partial<PageMargins> | undefined;
  const mm = (v: unknown, d: number) => Math.min(200, Math.max(0, num(v, d)));
  if (m && typeof m === 'object') settings.margins = { top: mm(m.top, 16), bottom: mm(m.bottom, 16), left: mm(m.left, 20), right: mm(m.right, 20) };
  else delete settings.margins;
  if (!['general', 'decimal', 'scientific', 'engineering'].includes(settings.resultFormat as string)) delete settings.resultFormat;
  if (typeof settings.trailingZeros !== 'boolean') delete settings.trailingZeros;
  const ls = settings.labelStyles as Partial<LabelStyles> | undefined;
  const hex = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
  if (ls && typeof ls === 'object')
    settings.labelStyles = { unitColor: hex(ls.unitColor, DEFAULT_LABEL_STYLES.unitColor), inputColor: hex(ls.inputColor, DEFAULT_LABEL_STYLES.inputColor), inputBackground: hex(ls.inputBackground, DEFAULT_LABEL_STYLES.inputBackground) };
  else delete settings.labelStyles;
  settings.vectorLimit = Math.min(1000, Math.max(0, Math.round(num(settings.vectorLimit, 10))));
  if (settings.vectorLimit === 1) settings.vectorLimit = 2;
  settings.precision = Math.min(8, Math.max(0, Math.round(num(settings.precision, DEFAULT_SETTINGS.precision))));
  return {
    id: doc.id,
    version: DOCUMENT_VERSION,
    title: typeof doc.title === 'string' && doc.title ? doc.title.slice(0, 200) : 'Untitled calculation',
    metadata: sanitizeMetadata(doc.metadata),
    settings,
    inputResult: sanitizeInputResult(doc.inputResult, new Set(shapes.filter((s) => s.type === 'math').map((s) => s.id))),
    shapes,
    createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : now,
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : now,
  };
}

function sanitizeInputResult(value: unknown, mathRegionIds: Set<string>): InputResultConfig {
  const src = value && typeof value === 'object' ? (value as Raw) : {};
  const columns = (raw: unknown) => {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw.slice(0, 200).flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const r = item as Raw;
      const id = str(r.id).slice(0, 100);
      const regionId = str(r.regionId).slice(0, 100);
      if (!id || seen.has(id) || !mathRegionIds.has(regionId)) return [];
      seen.add(id);
      return [{ id, regionId, label: (str(r.label).trim() || id).slice(0, 120) }];
    });
  };
  const inputs = columns(src.inputs);
  const outputs = columns(src.outputs);
  const inputIds = new Set(inputs.map((c) => c.id));
  const rowIds = new Set<string>();
  const rows = (Array.isArray(src.rows) ? src.rows : []).slice(0, 5000).flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const r = item as Raw;
    let id = str(r.id).slice(0, 100) || `case-${index + 1}`;
    while (rowIds.has(id)) id = `${id}-${index + 1}`;
    rowIds.add(id);
    const rawValues = r.values && typeof r.values === 'object' ? (r.values as Raw) : {};
    const values: Record<string, number | null> = {};
    for (const inputId of inputIds) {
      const v = rawValues[inputId];
      values[inputId] = typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    return [{ id, name: (str(r.name).trim() || `Case ${index + 1}`).slice(0, 120), values }];
  });
  return {
    title: (str(src.title).trim() || EMPTY_INPUT_RESULT_CONFIG.title).slice(0, 160),
    inputs,
    outputs,
    rows,
  };
}

/** JSON export envelope. */
export function serializeDocument(doc: CalculationDocument): string {
  return JSON.stringify({ format: 'calccanvas', ...doc }, null, 2);
}

function sanitizeMetadata(m: unknown): CalculationDocument['metadata'] {
  const src = (m && typeof m === 'object' ? m : {}) as Raw;
  const out: CalculationDocument['metadata'] = {};
  for (const k of ['project', 'calculationReference', 'preparedBy', 'checkedBy', 'revision'] as const) {
    if (typeof src[k] === 'string') out[k] = (src[k] as string).slice(0, 200);
  }
  return out;
}

/** Annex role of a text region; anything malformed is dropped (the text stays). */
function annexRole(v: unknown): { annex?: AnnexRole } {
  if (!v || typeof v !== 'object') return {};
  const r = v as Record<string, unknown>;
  const id = (x: unknown) => (typeof x === 'string' && /^[\w-]{1,40}$/.test(x) ? x : null);
  if (r.kind === 'start') return { annex: { kind: 'start' } };
  if (r.kind === 'heading' && id(r.id)) return { annex: { kind: 'heading', id: id(r.id)! } };
  if (r.kind === 'link' && id(r.target)) return { annex: { kind: 'link', target: id(r.target)! } };
  return {};
}
