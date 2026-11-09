/**
 * Help tab → Formats: every snapshot is computed live by the
 * real engine and rendered with the same formatter as the worksheet, so the
 * guide always matches what the user will see.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { CalculationEngine, type RegionInput, type UnitSystemName } from '../../engine';
import type { MathDisplayMode } from '../../canvas/model/types';
import { buildDisplay } from '../../math/MathFormatter';
import { MathRenderer } from '../../math/MathRenderer';
import { Modal } from './Dialogs';

const BASE: Record<string, string> = {
  L: 'L\\coloneq8.5\\,\\mathrm{m}',
  w: 'w\\coloneq28.5\\,\\frac{\\mathrm{kN}}{\\mathrm{m}}',
  M: 'M_{Ed}\\coloneq\\frac{wL^2}{8}',
  R: 'M_{Rd}\\coloneq300\\,\\mathrm{kN}\\cdot\\mathrm{m}',
  eta: '\\eta_{M}\\coloneq\\frac{M_{Ed}}{M_{Rd}}',
  chk: '\\eta_{M}\\le1',
};
const ORDER = ['L', 'w', 'M', 'R', 'eta', 'chk'];

/** Run the example worksheet (plus extra regions) and return a renderer for one region. */
function useExample(extra: Record<string, RegionInput> = {}, unitSystem: UnitSystemName = 'SI') {
  return useMemo(() => {
    const e = new CalculationEngine({ unitSystem, precision: 2 });
    e.batch(() => {
      ORDER.forEach((id, i) => e.setRegion(id, { latex: BASE[id], order: i }));
      Object.entries(extra).forEach(([id, input], i) => e.setRegion(id, { order: 100 + i, ...input }));
    });
    return (id: string, mode: MathDisplayMode = 'auto') => {
      const src = extra[id]?.latex ?? BASE[id];
      return buildDisplay(src, e.getResult(id), mode);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitSystem]);
}

function Snapshot({ latex, check }: { latex: string; check?: { pass: boolean } }) {
  return (
    <div className="flex min-h-[44px] items-center gap-2 overflow-x-auto rounded border border-[#dadce0] bg-white px-3 py-2 text-[17px] text-[#1f1f1f] [background-image:linear-gradient(#eef3fb_1px,transparent_1px),linear-gradient(90deg,#eef3fb_1px,transparent_1px)] [background-size:10px_10px]">
      <MathRenderer latex={latex} />
      {check && (
        <span className={'rounded-sm px-1.5 py-px text-[11px] font-semibold text-white ' + (check.pass ? 'bg-success' : 'bg-destructive')}>{check.pass ? 'PASS' : 'FAIL'}</span>
      )}
    </div>
  );
}

function Card({ title, tag, children, how }: { title: string; tag?: string; children: ReactNode; how: ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-3" data-testid="guide-card">
      <div className="mb-1 flex items-baseline gap-2">
        <h3 className="text-[13.5px] font-semibold">{title}</h3>
        {tag && <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">{tag}</span>}
      </div>
      {children}
      <p className="mt-1.5 text-[12px] text-muted-foreground">{how}</p>
    </section>
  );
}

const K = ({ children }: { children: ReactNode }) => <kbd className="rounded border border-border bg-muted px-1 py-px font-sans text-[11.5px] text-foreground">{children}</kbd>;

function FormatsTab() {
  const show = useExample();
  const modes: { mode: MathDisplayMode; title: string; use: string }[] = [
    { mode: 'auto', title: 'Automatic', use: 'Default. Inputs show the formula only; derived values show formula = result.' },
    { mode: 'formula', title: 'Formula only', use: 'Show how a value is defined without numbers, e.g. in a method statement.' },
    { mode: 'result', title: 'Result only', use: 'Compact summary: just the name and the value.' },
    { mode: 'formulaResult', title: 'Formula = result', use: 'Typical hand calculation on one line.' },
    { mode: 'full', title: 'Full calculation', use: 'Formula, the numbers substituted with units, then the result – for checkable reports.' },
  ];
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">
        Each equation region has its own display format. Select one or more regions, then choose a format in the toolbar box <b className="text-foreground">Auto display</b> or in{' '}
        <b className="text-foreground">Math Formatting → Display</b>. The format only changes what is shown (and printed); the calculation is the same.
      </p>
      {modes.map((m) => (
        <Card key={m.mode} title={m.title} how={m.use}>
          <div className="space-y-1.5">
            {m.mode === 'auto' && <Snapshot latex={show('L').latex} />}
            <Snapshot latex={show('M', m.mode).latex} />
          </div>
        </Card>
      ))}
      <Card title="Checks" tag="η ≤ 1" how={<>A comparison shows the value, the limit and a PASS/FAIL badge. Insert one with the toolbar ☑ button, or type <K>Ctrl</K>+<K>9</K> for ≤.</>}>
        <Snapshot {...show('chk')} />
      </Card>
    </div>
  );
}

function UnitsTab() {
  const show = useExample({
    A: { latex: 'A\\coloneq300\\,\\mathrm{mm}\\cdot500\\,\\mathrm{mm}' },
    Mmm: { latex: 'M_{Ed}=', displayUnit: 'kN·mm' },
    M0: { latex: 'M_{Ed}=', precision: 0 },
    t: { latex: 't\\coloneq2\\,\\mathrm{m}+150\\,\\mathrm{mm}' },
  });
  const us = useExample({ Mus: { latex: 'M_{Ed}=' }, wus: { latex: 'w=' } }, 'Imperial');
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">Type a unit right after a number. Values carry their units through every formula, so results always come out with the right unit and wrong unit sums are reported as errors.</p>
      <Card title="Number with a unit" how={<>Type <K>L</K> <K>:</K> <K>8.5</K> <K>m</K>. A space between the number and the unit is optional.</>}>
        <Snapshot latex={show('L').latex} />
      </Card>
      <Card title="Compound units" how={<>Type <K>/</K> for “per”: <K>28.5 kN/m</K>. Use <K>*</K> for a product: <K>300 kN*m</K>.</>}>
        <div className="space-y-1.5">
          <Snapshot latex={show('w').latex} />
          <Snapshot latex={show('R').latex} />
        </div>
      </Card>
      <Card title="Mixed units are converted for you" how="Lengths in m and mm can be added or multiplied directly; the result uses a sensible engineering unit (areas in mm² or m², moments in kN·m…).">
        <div className="space-y-1.5">
          <Snapshot latex={show('t', 'formulaResult').latex} />
          <Snapshot latex={show('A', 'formulaResult').latex} />
        </div>
      </Card>
      <Card title="Choose the unit of a result" how={<>Select the region → open the properties panel (toolbar, far right) → <b>Result unit</b>, e.g. <K>kN·mm</K>. Only the display changes.</>}>
        <div className="space-y-1.5">
          <Snapshot latex={show('M', 'result').latex} />
          <Snapshot latex={show('Mmm').latex} />
        </div>
      </Card>
      <Card title="Decimal places" how={<>For the whole worksheet: <b>Calculation → Decimals</b>. For one region: properties panel → <b>Decimal places</b>.</>}>
        <Snapshot latex={show('M0').latex} />
      </Card>
      <Card title="Unit system" tag="SI · USCS" how={<><b>Calculation → Unit system</b> switches automatic result units between SI (kN, m, kPa) and USCS (kip, ft, ksi). Inputs keep the units you typed.</>}>
        <div className="space-y-1.5">
          <Snapshot latex={us('wus').latex} />
          <Snapshot latex={us('Mus').latex} />
        </div>
      </Card>
    </div>
  );
}

export function FormatGuideDialog({ onClose }: { onClose(): void }) {
  const [tab, setTab] = useState<'formats' | 'units'>('formats');
  const tabBtn = (id: typeof tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={'h-8 cursor-pointer border-b-2 px-3 text-[13px] font-medium transition-colors duration-150 ' + (tab === id ? 'border-[#0b57d0] text-[#0b57d0]' : 'border-transparent text-muted-foreground hover:text-foreground')}
    >
      {label}
    </button>
  );
  return (
    <Modal title="Display formats & units" onClose={onClose} wide>
      <div role="tablist" className="-mt-2 mb-3 flex gap-1 border-b border-border">
        {tabBtn('formats', 'Display formats')}
        {tabBtn('units', 'Units')}
      </div>
      {tab === 'formats' ? <FormatsTab /> : <UnitsTab />}
    </Modal>
  );
}
