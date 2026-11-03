import {
  DEFAULT_SETTINGS,
  DOCUMENT_VERSION,
  type CalculationDocument,
  type DocumentSettings,
} from './DocumentTypes';

/**
 * Document-level migrations: each entry upgrades from version N to N+1.
 * (tldraw migrates its own shape records inside `shapes` on load.)
 */
const MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {
  // 0 → 1: early prototypes stored settings without page orientation.
  0: (doc) => ({
    ...doc,
    version: 1,
    settings: { ...DEFAULT_SETTINGS, ...((doc.settings as Partial<DocumentSettings>) ?? {}) },
  }),
};

export class DocumentFormatError extends Error {}

/** Validate and migrate untrusted JSON (imported file or IndexedDB record). */
export function parseDocument(input: unknown): CalculationDocument {
  if (!input || typeof input !== 'object') throw new DocumentFormatError('Not a CalcCanvas document.');
  let doc = input as Record<string, unknown>;
  if (doc.format !== undefined && doc.format !== 'calccanvas') {
    throw new DocumentFormatError('Not a CalcCanvas document.');
  }
  let version = typeof doc.version === 'number' ? doc.version : 0;
  if (version > DOCUMENT_VERSION) {
    throw new DocumentFormatError(`This document was created by a newer version (v${version}).`);
  }
  while (version < DOCUMENT_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new DocumentFormatError(`Cannot migrate document version ${version}.`);
    doc = migrate(doc);
    version = doc.version as number;
  }
  if (typeof doc.id !== 'string' || !doc.id) throw new DocumentFormatError('Document is missing an id.');
  if (!doc.shapes || typeof doc.shapes !== 'object') throw new DocumentFormatError('Document has no canvas data.');
  const now = new Date().toISOString();
  const settings = { ...DEFAULT_SETTINGS, ...((doc.settings as Partial<DocumentSettings>) ?? {}) };
  if (settings.unitSystem !== 'SI' && settings.unitSystem !== 'Imperial') settings.unitSystem = 'SI';
  settings.precision = clampInt(settings.precision, 0, 8, DEFAULT_SETTINGS.precision);
  return {
    id: doc.id,
    version: DOCUMENT_VERSION,
    title: typeof doc.title === 'string' && doc.title ? doc.title : 'Untitled calculation',
    metadata: sanitizeMetadata(doc.metadata),
    settings,
    shapes: doc.shapes,
    createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : now,
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : now,
  };
}

/** JSON export envelope. */
export function serializeDocument(doc: CalculationDocument): string {
  return JSON.stringify({ format: 'calccanvas', ...doc }, null, 2);
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
}

function sanitizeMetadata(m: unknown): CalculationDocument['metadata'] {
  const src = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
  const out: CalculationDocument['metadata'] = {};
  for (const k of ['project', 'calculationReference', 'preparedBy', 'checkedBy', 'revision'] as const) {
    if (typeof src[k] === 'string') out[k] = (src[k] as string).slice(0, 200);
  }
  return out;
}
