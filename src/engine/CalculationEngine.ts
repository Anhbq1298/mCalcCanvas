/**
 * Reactive, position-independent calculation engine.
 *
 * Regions are registered by id with their LaTeX. The engine parses them,
 * maintains a name-based dependency graph and incrementally re-evaluates
 * only the regions affected by a change. Results are plain JSON objects
 * (LaTeX strings, numbers) so UI layers can store them without holding
 * mathjs objects.
 *
 * The engine has no knowledge of React, the canvas or canvas coordinates.
 */
import { CalculationError, isCalculationError, type CalculationErrorCode } from './CalculationErrors';
import { DependencyGraph } from './DependencyGraph';
import { BUILTIN_CONSTANTS, collectReferences, compareQuantities, evaluateExpr, type EvalContext } from './ExpressionEvaluator';
import { statementExprs, type Expr, type Relation, type Statement } from './ExpressionTypes';
import { exprToLatex, nameToLatex, RELATION_LATEX } from './LatexFormatter';
import { parseLatex } from './LatexParser';
import {
  formatQuantity,
  isUnit,
  isUnitSymbol,
  parseDisplayUnit,
  siValue,
  type FormattedQuantity,
  type Quantity,
  type UnitSystemName,
} from './UnitSystem';

export interface RegionInput {
  latex: string;
  /** Optional display unit, e.g. "kN·mm". */
  displayUnit?: string | null;
  /** Decimal places; falls back to the worksheet precision. */
  precision?: number | null;
  /**
   * While the user is typing: if the new LaTeX does not parse, keep the
   * last valid statement so dependents do not flicker into errors.
   */
  draft?: boolean;
  /**
   * Reading-order rank on the worksheet (page, then top-to-bottom,
   * left-to-right). As in Mathcad, a region can only use definitions that
   * come before it, and uses the nearest such definition when a name is
   * defined more than once. Defaults to creation order.
   */
  order?: number;
}

export interface EngineSettings {
  unitSystem: UnitSystemName;
  precision: number;
}

export type ResultStatus = 'valid' | 'error' | 'empty';

export interface CheckOutcome {
  pass: boolean;
  op: Relation;
  opLatex: string;
  leftLatex: string;
  leftValue: FormattedQuantity;
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
  statement: Statement | null;
  parseError: CalculationError | null;
  draftError: string | null;
}

class CycleSignal {
  readonly path: string[];
  constructor(path: string[]) {
    this.path = path;
  }
}

type Listener = (changedIds: string[]) => void;

export class CalculationEngine {
  private settings: EngineSettings;
  private regions = new Map<string, RegionState>();
  private graph = new DependencyGraph();
  private values = new Map<string, Quantity>();
  private results = new Map<string, CalculationResult>();
  private listeners = new Set<Listener>();
  private batchDepth = 0;
  private pendingIds = new Set<string>();
  private pendingNames = new Set<string>();
  private lastDefinedNames = new Set<string>();
  /** A region moved: name resolution (what is "above") must be redone. */
  private ordersChanged = false;
  private created = new Map<string, number>();
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
    for (const id of this.regions.keys()) this.pendingIds.add(id);
    if (this.batchDepth === 0) this.flush();
  }

  /** Effective reading-order rank of a region. */
  private rank(id: string): number {
    return this.regions.get(id)?.input.order ?? this.created.get(id) ?? 0;
  }

  /** Variable names a region references, resolved against definitions above it. */
  private refsFor(id: string, exprs: Expr[]): Set<string> {
    const at = this.rank(id);
    return collectReferences(exprs, { isDefined: (n) => this.definerBefore(n, at) !== undefined });
  }

  /**
   * The definition of `name` that a region at reading rank `at` uses: the
   * nearest one before it (Mathcad top-to-bottom, left-to-right).
   */
  private definerBefore(name: string, at: number): string | undefined {
    let best: string | undefined;
    for (const id of this.graph.definers(name)) {
      const r = this.rank(id);
      if (r < at && (best === undefined || r > this.rank(best))) best = id;
    }
    return best;
  }

  setRegion(id: string, input: RegionInput): void {
    const prev = this.regions.get(id);
    if (!this.created.has(id)) this.created.set(id, this.createdCounter++);
    if (
      prev &&
      prev.input.latex === input.latex &&
      prev.input.displayUnit === input.displayUnit &&
      prev.input.precision === input.precision &&
      !!prev.input.draft === !!input.draft
    ) {
      if (prev.input.order !== input.order) {
        // Moved: what it can see, and who can see it, may have changed.
        prev.input = input;
        this.ordersChanged = true;
        const name = this.graph.definesOf(id);
        if (name) this.pendingNames.add(name);
        this.pendingIds.add(id);
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

    const formattingOnly =
      prev && prev.input.latex === input.latex && !!prev.statement === !!statement && prev.parseError === null && parseError === null;

    this.regions.set(id, { input, statement, parseError, draftError });

    const oldName = this.graph.definesOf(id);
    const newName = statement?.kind === 'definition' ? statement.name : undefined;
    if (!formattingOnly || oldName !== newName) {
      const exprs = statement ? statementExprs(statement) : [];
      // Refs are resolved against the definition set *after* this change.
      this.graph.setNode(id, newName, new Set());
      this.graph.setRefs(id, this.refsFor(id, exprs));
      if (oldName) this.pendingNames.add(oldName);
      if (newName) this.pendingNames.add(newName);
      // A definition appeared/disappeared: what other regions "see above" may change.
      if (oldName !== newName || !prev) this.ordersChanged = true;
    }
    this.pendingIds.add(id);
    if (this.batchDepth === 0) this.flush();
  }

  removeRegion(id: string): void {
    if (!this.regions.has(id)) return;
    const name = this.graph.definesOf(id);
    this.regions.delete(id);
    this.graph.removeNode(id);
    this.results.delete(id);
    this.values.delete(id);
    this.created.delete(id);
    if (name) {
      this.pendingNames.add(name);
      this.ordersChanged = true;
    }
    this.pendingIds.add(id);
    if (this.batchDepth === 0) this.flush();
  }

  clear(): void {
    const ids = [...this.regions.keys()];
    this.regions.clear();
    this.graph = new DependencyGraph();
    this.values.clear();
    this.results.clear();
    this.lastDefinedNames = new Set();
    this.created = new Map();
    this.emit(ids);
  }

  // -- recalculation ----------------------------------------------------------

  private flush(): void {
    if (this.pendingIds.size === 0 && this.pendingNames.size === 0) return;
    const seeds = new Set(this.pendingIds);
    const names = new Set(this.pendingNames);
    this.pendingIds.clear();
    this.pendingNames.clear();

    // If the set of defined names changed, identifier resolution may change
    // anywhere (e.g. "wL" splits differently once "wL" is defined).
    const defined = this.graph.definedNames();
    if (!sameSet(defined, this.lastDefinedNames) || this.ordersChanged) {
      this.ordersChanged = false;
      for (const id of this.graph.ids()) {
        const st = this.regions.get(id)?.statement;
        const refs = st ? this.refsFor(id, statementExprs(st)) : new Set<string>();
        // Unresolved names may now resolve, or now be "defined below": re-check.
        const code = this.results.get(id)?.error?.code;
        if (code === 'undefined-variable' || code === 'defined-later') seeds.add(id);
        if (!sameSet(refs, this.graph.refsOf(id))) {
          this.graph.setRefs(id, refs);
          seeds.add(id);
        }
      }
      this.lastDefinedNames = defined;
    }

    const dirty = this.graph.affected(
      [...seeds].filter((id) => this.regions.has(id)),
      names,
    );

    const pass = new Map<string, CalculationResult>();
    for (const id of dirty) this.values.delete(id);
    for (const id of dirty) {
      try {
        this.evaluateRegion(id, [], dirty, pass);
      } catch (e) {
        if (!(e instanceof CycleSignal)) throw e;
      }
    }
    for (const [id, r] of pass) this.results.set(id, r);
    const removed = [...seeds].filter((id) => !this.regions.has(id));
    this.emit([...new Set([...pass.keys(), ...removed])]);
  }

  private emit(ids: string[]): void {
    if (ids.length === 0) return;
    for (const fn of this.listeners) fn(ids);
  }

  /**
   * Evaluate one region (memoised per pass). Cycles are reported through a
   * CycleSignal that unwinds the stack until the node that closes the loop.
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

    // Definition-level checks.
    if (statement.kind === 'definition') {
      const definers = this.graph.definers(statement.name);
      if (definers.length > 1 && this.definerBefore(statement.name, this.rank(id)) !== undefined) {
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

    // Resolve dependencies first (may throw CycleSignal).
    const myRank = this.rank(id);
    const uses = new Map<string, string>();
    for (const name of this.graph.refsOf(id)) {
      const definer = this.definerBefore(name, myRank);
      if (!definer) {
        if (this.graph.definers(name).length) {
          return fail('defined-later', `${name} is defined below this region. Move its definition above (calculations run top to bottom, left to right).`);
        }
        return fail('undefined-variable', `Undefined variable: ${name}`);
      }
      uses.set(name, definer);
      const dep = this.evaluateRegion(definer, stack, dirty, pass);
      if (dep.status !== 'valid') {
        return fail('dependency-error', `${name} cannot be evaluated (${dep.error?.message ?? 'no value'}).`);
      }
    }

    const ctx: EvalContext = {
      isDefined: (n) => this.definerBefore(n, myRank) !== undefined,
      getValue: (n) => {
        const v = this.values.get(uses.get(n) ?? this.definerBefore(n, myRank) ?? '');
        if (v === undefined) throw new CalculationError('undefined-variable', `Undefined variable: ${n}`);
        return v;
      },
    };

    const decimals = region.input.precision ?? this.settings.precision;
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

    try {
      if (statement.kind === 'check') {
        const left = evaluateExpr(statement.left, ctx);
        const right = evaluateExpr(statement.right, ctx);
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
            rightValue,
          },
        };
      }

      const value = evaluateExpr(statement.expr, ctx);
      if (statement.kind === 'definition') this.values.set(id, value);

      let formatted: FormattedQuantity;
      try {
        formatted = fmt(value, targetUnit);
      } catch (e) {
        return { ...fail('display-unit', (e as Error).message) };
      }

      const substitutionLatex = exprToLatex(statement.expr, {
        ctx,
        substitute: (name) => {
          const v = this.values.get(uses.get(name) ?? '');
          if (v === undefined) return null;
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
          const names = e.message.replace(/^Undefined variables?:\s*/, '').split(/,\s*/);
          // also look inside letter runs ("wL" → w, L)
          const below = names.flatMap((n) => [n, ...n.split('')]).find((n) => this.graph.definers(n).length > 0);
          if (below) return fail('defined-later', `${below} is defined below this region. Move its definition above (calculations run top to bottom, left to right).`);
        }
        return fail(e.code, e.message);
      }
      if (e instanceof CycleSignal) throw e;
      return fail('evaluation', e instanceof Error ? e.message : 'Calculation failed.');
    }
  }
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

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
