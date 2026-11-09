/**
 * Reactive, position-independent calculation engine.
 *
 * Regions are registered by id with their LaTeX and a reading-order key.
 * The engine parses them, resolves every referenced name to the exact
 * defining region before it (Mathcad order), and incrementally re-evaluates
 * only the regions that use a changed value. Results are plain JSON objects
 * (LaTeX strings, numbers) so UI layers can store them without holding
 * mathjs objects.
 *
 * The engine has no knowledge of React, the canvas or canvas coordinates.
 */
import { CalculationError, isCalculationError, type CalculationErrorCode } from './CalculationErrors';
import { DependencyGraph } from './DependencyGraph';
import {
  BUILTIN_CONSTANTS,
  candidateNames,
  collectReferences,
  compareQuantities,
  definedLaterMessage,
  evaluateExpr,
  undefinedMessage,
  UndefinedNamesError,
  type EvalContext,
  type UserFunction,
} from './ExpressionEvaluator';
import { statementExprs, statementLocals, type Relation, type Statement } from './ExpressionTypes';
import { exprToLatex, nameToLatex, RELATION_LATEX } from './LatexFormatter';
import { parseLatex } from './LatexParser';
import { formatVector, isVector, requireScalar, type Value } from './Vector';
import {
  formatQuantity,
  formatUnitString,
  isUnit,
  isUnitSymbol,
  parseDisplayUnit,
  siValue,
  type FormattedQuantity,
  type Quantity,
  type UnitSystemName,
} from './UnitSystem';

export { compareOrderKeys, orderKeysEqual, type OrderKey } from './orderKey';
import { compareOrderKeys, orderKeysEqual, type OrderKey } from './orderKey';

export interface RegionInput {
  latex: string;
  /** Optional display unit, e.g. "kN·mm". */
  displayUnit?: string | null;
  /** Decimal places; falls back to the worksheet precision. */
  precision?: number | null;
  /** Vector results: compact row (default) or a column with every entry. */
  vectorLayout?: 'row' | 'column';
  /** Show every entry of a long vector (the user expanded it). */
  vectorExpanded?: boolean;
  /**
   * While the user is typing: if the new LaTeX does not parse, keep the
   * last valid statement so dependents do not flicker into errors.
   */
  draft?: boolean;
  /**
   * Reading-order position on the worksheet (Mathcad order). A region can
   * only use definitions that come before it, and uses the nearest such
   * definition when a name is defined more than once. Either a key compared
   * lexicographically (see OrderKey) or a plain number. Defaults to creation
   * order.
   */
  order?: number | OrderKey;
}

export interface EngineSettings {
  unitSystem: UnitSystemName;
  precision: number;
  /** Arrays longer than this are shown shortened (first half … last half); 0 = show all. */
  vectorLimit?: number;
}

export type ResultStatus = 'valid' | 'error' | 'empty';

export interface CheckOutcome {
  pass: boolean;
  op: Relation;
  opLatex: string;
  leftLatex: string;
  leftValue: FormattedQuantity;
  /** The limit as written, when it is computed from variables (shown as "N_Rd = 29159 kN"). */
  rightLatex?: string;
  rightValue: FormattedQuantity;
}

export interface CalculationResult {
  status: ResultStatus;
  kind: Statement['kind'] | 'invalid';
  defines?: string;
  /** This definition redefines a name already defined above it. */
  redefines?: { name: string; count: number };
  definesLatex?: string;
  references: string[];
  /** Name → id of the region whose definition this region uses (for "go to definition"). */
  sources?: Record<string, string>;
  value?: FormattedQuantity;
  check?: CheckOutcome;
  /** Expression with variable values substituted (full-calculation mode). */
  substitutionLatex?: string;
  /** Expression re-printed from the tree (result-only mode label). */
  expressionLatex?: string;
  error?: { code: CalculationErrorCode; message: string };
  warnings: string[];
  /** Parse problem in the text being edited; result reflects the last valid input. */
  draftError?: string;
}

interface RegionState {
  input: RegionInput;
  key: OrderKey;
  statement: Statement | null;
  parseError: CalculationError | null;
  draftError: string | null;
  /** Summary of how this region's names resolved last time (see resolve()). */
  fingerprint: string;
}

class CycleSignal {
  readonly path: string[];
  constructor(path: string[]) {
    this.path = path;
  }
}

type Listener = (changedIds: string[]) => void;

/** Decimal places accepted for display (toFixed allows 0–100; more is meaningless). */
const MAX_DECIMALS = 12;

export class CalculationEngine {
  private settings: EngineSettings;
  private regions = new Map<string, RegionState>();
  private graph = new DependencyGraph();
  private values = new Map<string, Value>();
  private readonly functions = new Map<string, UserFunction>();
  private results = new Map<string, CalculationResult>();
  private listeners = new Set<Listener>();
  private batchDepth = 0;
  /** Regions whose value may have changed: they and their dependents are recalculated. */
  private pendingValue = new Set<string>();
  /** Regions whose display only may have changed (units, precision, redefinition flag). */
  private pendingFormat = new Set<string>();
  /** Regions whose identifier resolution must be redone. */
  private pendingResolve = new Set<string>();
  /** Names whose set of definitions (or their order) changed. */
  private touchedNames = new Set<string>();
  private removedIds = new Set<string>();
  private createdCounter = 0;

  constructor(settings: Partial<EngineSettings> = {}) {
    this.settings = { unitSystem: 'SI', precision: 2, ...settings };
  }

  // -- public API -----------------------------------------------------------

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getResult(id: string): CalculationResult | undefined {
    return this.results.get(id);
  }

  /**
   * An input (a definition from literals only, e.g. f_ck := 35 MPa) rewritten in
   * another unit with the same value: "35 MPa" in ksi → "5.07632… ksi".
   * Returns the new LaTeX, null when the region is not a scalar input with a unit,
   * or throws when the unit is unknown or of another dimension.
   */
  inputInUnit(id: string, unitText: string): string | null {
    const region = this.regions.get(id);
    const result = this.results.get(id);
    const value = this.values.get(id);
    if (!region || !result || region.statement?.kind !== 'definition' || region.statement.params) return null;
    if (result.status !== 'valid' || result.references.length > 0 || value === undefined || isVector(value) || !isUnit(value)) return null;
    const latex = region.input.latex;
    const at = latex.search(/\\(coloneq|coloneqq|Coloneqq|Coloneq|colonequals|definedas)|:=/);
    if (at < 0) return null;
    const head = latex.slice(0, at);
    const op = latex.slice(at).match(/^(\\[A-Za-z]+|:=)/)![0];
    const unit = parseDisplayUnit(unitText);
    const f = formatQuantity(value, { decimals: 12, system: this.settings.unitSystem, targetUnit: unit });
    // Shortest decimal that gives back the value (≤ 12 significant digits): no rounding of the input.
    let num = '';
    for (let p = 1; p <= 12; p++) {
      num = String(Number(f.number.toPrecision(p)));
      if (Math.abs(Number(num) - f.number) <= 1e-12 * Math.abs(f.number)) break;
    }
    return `${head}${op}${num}\\,${formatUnitString(unit).latex}`;
  }

  getSettings(): EngineSettings {
    return { ...this.settings };
  }

  regionIds(): string[] {
    return [...this.regions.keys()];
  }

  /** Group several updates into a single recalculation (e.g. on document load). */
  batch(fn: () => void): void {
    this.batchDepth++;
    try {
      fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0) this.flush();
    }
  }

  setSettings(settings: Partial<EngineSettings>): void {
    this.settings = { ...this.settings, ...settings };
    // Unit system and precision only change how values are displayed.
    for (const id of this.regions.keys()) this.pendingFormat.add(id);
    if (this.batchDepth === 0) this.flush();
  }

  private keyOf(id: string): OrderKey {
    return this.regions.get(id)?.key ?? [];
  }

  /**
   * The definition of `name` that a region at reading position `at` uses:
   * the nearest one before it (Mathcad top-to-bottom, left-to-right).
   */
  private definerBefore(name: string, at: OrderKey): string | undefined {
    let best: string | undefined;
    let bestKey: OrderKey | undefined;
    for (const id of this.graph.definers(name)) {
      const k = this.keyOf(id);
      if (compareOrderKeys(k, at) < 0 && (bestKey === undefined || compareOrderKeys(k, bestKey) > 0)) {
        best = id;
        bestKey = k;
      }
    }
    return best;
  }

  setRegion(id: string, input: RegionInput): void {
    const prev = this.regions.get(id);
    const key = normalizeKey(input.order, prev?.key ?? [this.createdCounter++]);
    const moved = !!prev && !orderKeysEqual(prev.key, key);

    if (
      prev &&
      prev.input.latex === input.latex &&
      prev.input.displayUnit === input.displayUnit &&
      prev.input.precision === input.precision &&
      (prev.input.vectorLayout ?? 'row') === (input.vectorLayout ?? 'row') &&
      !!prev.input.vectorExpanded === !!input.vectorExpanded &&
      !!prev.input.draft === !!input.draft
    ) {
      if (moved) {
        prev.input = input;
        prev.key = key;
        this.noteMoved(id);
        if (this.batchDepth === 0) this.flush();
      }
      return;
    }

    let statement: Statement | null = null;
    let parseError: CalculationError | null = null;
    let draftError: string | null = null;
    try {
      statement = parseLatex(input.latex);
    } catch (e) {
      parseError = isCalculationError(e) ? e : new CalculationError('syntax', 'Invalid expression.');
    }

    if (parseError && input.draft && prev?.statement) {
      // Keep the last valid statement while the user is mid-edit.
      statement = prev.statement;
      draftError = parseError.message;
      parseError = null;
    }

    // Same text and same parse outcome: only the display (unit, precision) changed.
    const formattingOnly =
      !!prev &&
      prev.input.latex === input.latex &&
      prev.parseError === null &&
      parseError === null &&
      (prev.draftError === null) === (draftError === null);
    if (formattingOnly) statement = prev.statement;

    this.regions.set(id, { input, key, statement, parseError, draftError, fingerprint: prev?.fingerprint ?? '' });

    if (formattingOnly) {
      this.pendingFormat.add(id);
      if (moved) this.noteMoved(id);
    } else {
      const oldName = this.graph.definesOf(id);
      const newName = statement?.kind === 'definition' ? statement.name : undefined;
      this.graph.setDefinition(id, newName);
      if (oldName !== newName || moved) {
        if (oldName) this.touchedNames.add(oldName);
        if (newName) this.touchedNames.add(newName);
      }
      this.pendingResolve.add(id);
      this.pendingValue.add(id);
    }
    if (this.batchDepth === 0) this.flush();
  }

  /** A region moved: it and everything that resolves its name must be re-resolved. */
  private noteMoved(id: string): void {
    this.pendingResolve.add(id);
    const name = this.graph.definesOf(id);
    if (name) this.touchedNames.add(name);
  }

  removeRegion(id: string): void {
    if (!this.regions.has(id)) return;
    const name = this.graph.definesOf(id);
    for (const d of this.graph.dependents(id)) this.pendingResolve.add(d);
    this.regions.delete(id);
    this.graph.removeNode(id);
    this.results.delete(id);
    this.values.delete(id);
    this.functions.delete(id);
    this.pendingValue.delete(id);
    this.pendingFormat.delete(id);
    this.pendingResolve.delete(id);
    if (name) this.touchedNames.add(name);
    this.removedIds.add(id);
    if (this.batchDepth === 0) this.flush();
  }

  clear(): void {
    const ids = [...this.regions.keys()];
    this.regions.clear();
    this.graph = new DependencyGraph();
    this.values.clear();
    this.functions.clear();
    this.results.clear();
    this.pendingValue.clear();
    this.pendingFormat.clear();
    this.pendingResolve.clear();
    this.touchedNames.clear();
    this.removedIds.clear();
    this.emit(ids);
  }

  // -- recalculation ----------------------------------------------------------

  /**
   * Resolve a region's identifiers against the definitions before it and
   * store the edges (name → defining region). Returns true if anything that
   * affects its value or error message changed.
   */
  private resolve(id: string): boolean {
    const region = this.regions.get(id);
    if (!region) return false;
    const exprs = region.statement && !region.parseError ? statementExprs(region.statement) : [];
    const at = region.key;
    const candidates = candidateNames(exprs);
    const locals = region.statement && !region.parseError ? statementLocals(region.statement) : new Set<string>();
    const refs = collectReferences(exprs, { isDefined: (n) => this.definerBefore(n, at) !== undefined }, locals);
    const deps = new Map<string, string>();
    for (const n of refs) deps.set(n, this.definerBefore(n, at)!);
    this.graph.setResolution(id, deps, candidates);
    // Everything resolution depends on: which definer each candidate name
    // uses, and whether a name exists only further down (error message).
    const parts: string[] = [];
    for (const n of [...candidates].sort()) {
      parts.push(`${n}\u0000${this.definerBefore(n, at) ?? ''}\u0000${this.graph.isDefined(n) ? 1 : 0}`);
    }
    const fingerprint = parts.join('\u0001');
    if (fingerprint === region.fingerprint) return false;
    region.fingerprint = fingerprint;
    return true;
  }

  private flush(): void {
    if (
      this.pendingValue.size === 0 &&
      this.pendingFormat.size === 0 &&
      this.pendingResolve.size === 0 &&
      this.touchedNames.size === 0 &&
      this.removedIds.size === 0
    ) {
      return;
    }
    // 1. Definitions of these names appeared, disappeared or moved: every
    //    region that could resolve one of them is re-resolved, and every
    //    definer of them re-checks its "redefines" flag.
    for (const name of this.touchedNames) {
      for (const w of this.graph.watchers(name)) this.pendingResolve.add(w);
      for (const d of this.graph.definers(name)) this.pendingFormat.add(d);
    }
    this.touchedNames.clear();

    // 2. Re-resolve; a region whose resolution changed must be recalculated.
    for (const id of this.pendingResolve) if (this.resolve(id)) this.pendingValue.add(id);
    this.pendingResolve.clear();

    // 3. Recalculate the changed regions and everything that uses their values.
    const dirty = this.graph.affected([...this.pendingValue].filter((id) => this.regions.has(id)));
    for (const id of this.pendingFormat) if (this.regions.has(id)) dirty.add(id);
    this.pendingValue.clear();
    this.pendingFormat.clear();
    const removed = [...this.removedIds];
    this.removedIds.clear();

    const pass = new Map<string, CalculationResult>();
    for (const id of dirty) {
      this.values.delete(id);
      this.functions.delete(id);
    }
    for (const id of dirty) {
      try {
        this.evaluateRegion(id, [], dirty, pass);
      } catch (e) {
        if (e instanceof CycleSignal) continue;
        // Never let an unexpected failure break recalculation of the rest.
        pass.set(id, {
          status: 'error',
          kind: this.regions.get(id)?.statement?.kind ?? 'invalid',
          references: [...this.graph.refsOf(id)],
          warnings: [],
          error: { code: 'evaluation', message: `Calculation failed: ${e instanceof Error ? e.message : String(e)}` },
        });
      }
    }
    for (const [id, r] of pass) this.results.set(id, r);
    this.emit([...new Set([...pass.keys(), ...removed])]);
  }

  private emit(ids: string[]): void {
    if (ids.length === 0) return;
    for (const fn of this.listeners) fn(ids);
  }

  /**
   * Evaluate one region (memoised per pass). Cycles are reported through a
   * CycleSignal that unwinds the stack until the node that closes the loop.
   * (With strict reading order a region only uses definitions before it, so
   * cycles cannot normally form; this is a safety net.)
   */
  private evaluateRegion(
    id: string,
    stack: string[],
    dirty: Set<string>,
    pass: Map<string, CalculationResult>,
  ): CalculationResult {
    const memo = pass.get(id);
    if (memo) return memo;
    if (!dirty.has(id)) {
      const cached = this.results.get(id);
      if (cached) return cached;
    }
    if (stack.includes(id)) throw new CycleSignal([...stack.slice(stack.indexOf(id)), id]);

    const region = this.regions.get(id)!;
    const statement = region.statement;
    const defines = this.graph.definesOf(id);
    const base: CalculationResult = {
      status: 'valid',
      kind: statement?.kind ?? 'invalid',
      references: [...this.graph.refsOf(id)],
      sources: Object.fromEntries(this.graph.depsOf(id)),
      warnings: [],
      draftError: region.draftError ?? undefined,
      ...(defines ? { defines, definesLatex: nameToLatex(defines) } : {}),
    };

    let result: CalculationResult;
    try {
      result = this.computeRegion(id, region, base, [...stack, id], dirty, pass);
    } catch (e) {
      if (e instanceof CycleSignal) {
        const names = e.path.map((rid) => this.graph.definesOf(rid) ?? '?');
        result = {
          ...base,
          status: 'error',
          error: { code: 'circular-dependency', message: `Circular dependency detected: ${names.join(' → ')}` },
        };
        pass.set(id, result);
        if (e.path[0] !== id) throw e;
        return result;
      }
      throw e;
    }
    pass.set(id, result);
    return result;
  }

  private computeRegion(
    id: string,
    region: RegionState,
    base: CalculationResult,
    stack: string[],
    dirty: Set<string>,
    pass: Map<string, CalculationResult>,
  ): CalculationResult {
    const { statement } = region;
    if (region.parseError) {
      return { ...base, status: 'error', error: { code: region.parseError.code, message: region.parseError.message } };
    }
    if (!statement || statement.kind === 'empty') return { ...base, status: 'empty' };

    const fail = (code: CalculationErrorCode, message: string): CalculationResult => ({
      ...base,
      status: 'error',
      error: { code, message },
    });

    const myKey = region.key;
    // Definition-level checks.
    if (statement.kind === 'definition') {
      const definers = this.graph.definers(statement.name);
      if (definers.length > 1 && this.definerBefore(statement.name, myKey) !== undefined) {
        base.redefines = { name: statement.name, count: definers.length };
      }
      if (statement.name in BUILTIN_CONSTANTS) {
        base.warnings.push(`"${statement.name}" redefines the built-in constant (${BUILTIN_CONSTANTS[statement.name].description}) in this worksheet.`);
      }
      if (isUnitSymbol(statement.name)) {
        base.warnings.push(
          `"${statement.name}" shadows the unit ${statement.name}. Write the unit as \\mathrm{${statement.name}} or rename the variable.`,
        );
      }
    }

    // Evaluate the exact definitions this region uses first (may throw CycleSignal).
    const uses = this.graph.depsOf(id);
    for (const [name, definer] of uses) {
      const dep = this.evaluateRegion(definer, stack, dirty, pass);
      if (dep.status !== 'valid') {
        return fail('dependency-error', `"${name}" cannot be evaluated: ${dep.error?.message ?? 'it has no value.'}`);
      }
    }

    const ctx: EvalContext = {
      isDefined: (n) => uses.has(n) || this.definerBefore(n, myKey) !== undefined,
      getValue: (n) => {
        const definer = uses.get(n) ?? this.definerBefore(n, myKey) ?? '';
        const v = this.values.get(definer);
        if (v === undefined) {
          if (this.functions.has(definer)) throw new CalculationError('syntax', `${n} is a function: call it with arguments, e.g. ${n}(x).`);
          throw new CalculationError('undefined-variable', undefinedMessage([n]));
        }
        return v;
      },
      getFunction: (n) => this.functions.get(uses.get(n) ?? this.definerBefore(n, myKey) ?? ''),
    };

    if (statement.kind === 'definition' && statement.params) {
      // A function: store the body; it is evaluated by each call.
      this.functions.set(id, { name: statement.name, params: statement.params, body: statement.expr, env: ctx });
      const scope = { isDefined: (n: string) => statement.params!.includes(n) || ctx.isDefined(n) };
      return { ...base, expressionLatex: exprToLatex(statement.expr, { ctx: scope }) };
    }

    const decimals = clampDecimals(region.input.precision ?? this.settings.precision);
    let targetUnit: string | null = null;
    if (region.input.displayUnit) {
      try {
        targetUnit = parseDisplayUnit(region.input.displayUnit);
      } catch (e) {
        return fail('display-unit', (e as Error).message);
      }
    }
    const fmt = (q: Quantity, unit: string | null = null) =>
      formatQuantity(q, { decimals, system: this.settings.unitSystem, targetUnit: unit });
    const fmtValue = (v: Value, unit: string | null = null): FormattedQuantity =>
      isVector(v) ? formatVector(v, { decimals, system: this.settings.unitSystem, targetUnit: unit, layout: region.input.vectorLayout, limit: this.settings.vectorLimit, expanded: region.input.vectorExpanded }) : fmt(v, unit);

    try {
      if (statement.kind === 'check') {
        const left = requireScalar(evaluateExpr(statement.left, ctx), 'A check');
        const right = requireScalar(evaluateExpr(statement.right, ctx), 'The limit of a check');
        const pass_ = compareQuantities(left, right, statement.op);
        const leftValue = fmt(left, targetUnit);
        // Show the limit in the same unit as the value so they are comparable.
        const rightUnit = targetUnit ?? (isUnit(left) && isUnit(right) ? preferredUnitOf(leftValue) : null);
        const rightValue = fmt(right, rightUnit);
        return {
          ...base,
          check: {
            pass: pass_,
            op: statement.op,
            opLatex: RELATION_LATEX[statement.op],
            leftLatex: exprToLatex(statement.left, { ctx }),
            leftValue,
            ...(collectReferences([statement.right], ctx).size ? { rightLatex: exprToLatex(statement.right, { ctx }) } : {}),
            rightValue,
          },
        };
      }

      const value = evaluateExpr(statement.expr, ctx);
      if (statement.kind === 'definition') this.values.set(id, value);

      let formatted: FormattedQuantity;
      try {
        formatted = fmtValue(value, targetUnit);
      } catch (e) {
        return { ...fail('display-unit', (e as Error).message) };
      }

      const substitutionLatex = exprToLatex(statement.expr, {
        ctx,
        substitute: (name) => {
          const v = this.values.get(uses.get(name) ?? '');
          // A vector is shown by name in the substituted line.
          if (v === undefined || isVector(v)) return null;
          const f = fmt(v);
          return { latex: f.latex, hasUnit: !!f.unitText, negative: siValue(v) < 0 };
        },
      });
      return {
        ...base,
        value: formatted,
        substitutionLatex,
        expressionLatex: exprToLatex(statement.expr, { ctx }),
      };
    } catch (e) {
      if (isCalculationError(e)) {
        // A name that exists only below this region: say so (Mathcad order).
        if (e.code === 'undefined-variable') {
          const names = e instanceof UndefinedNamesError ? e.names : [];
          // also look inside letter runs ("wL" → w, L)
          const below = names.flatMap((n) => [n, ...n.split('')]).find((n) => this.graph.isDefined(n));
          if (below) {
            const onlySelf = this.graph.definers(below).every((d) => d === id);
            return fail(
              'defined-later',
              onlySelf ? `Variable "${below}" is used in its own definition but has no value above this equation.` : definedLaterMessage(below),
            );
          }
        }
        return fail(e.code, e.message);
      }
      if (e instanceof CycleSignal) throw e;
      return fail('evaluation', e instanceof Error ? e.message : 'Calculation failed.');
    }
  }
}

function normalizeKey(order: number | OrderKey | undefined, fallback: OrderKey): OrderKey {
  const clean = (v: number | string) => (typeof v === 'number' && !Number.isFinite(v) ? 0 : v);
  if (Array.isArray(order)) return (order as (number | string)[]).map(clean);
  if (typeof order === 'number') return [clean(order)];
  return fallback;
}

function clampDecimals(d: number): number {
  return Number.isFinite(d) ? Math.min(MAX_DECIMALS, Math.max(0, Math.round(d))) : 2;
}

function preferredUnitOf(f: FormattedQuantity): string | null {
  // Re-derive the mathjs unit string from the formatted unit text.
  if (!f.unitText) return null;
  try {
    return parseDisplayUnit(f.unitText);
  } catch {
    return null;
  }
}
