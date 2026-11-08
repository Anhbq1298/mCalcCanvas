import { revealShape } from '../../canvas/canvasActions';
import { seriesSources, type SeriesSource as Source } from '../../canvas/graphData';
import { MathRenderer } from '../../math/MathRenderer';
import { useCalculationStore } from '../../store/calculationStore';

function Chip({ s, testId }: { s: Source; testId: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-region={s.regionId}
      title={s.input ? `Input – go to ${s.name} to edit it` : `Calculated – go to the definition of ${s.name}`}
      onClick={() => revealShape(s.regionId)}
      className={
        'inline-flex h-6 cursor-pointer items-center rounded-full border px-2 text-[13px] leading-none transition-colors ' +
        (s.input ? 'border-accent/50 bg-accent/10 text-foreground hover:bg-accent/20' : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted')
      }
    >
      <MathRenderer latex={s.latex} />
    </button>
  );
}

export function SeriesSources({ shapeId, seriesId, index }: { shapeId: string; seriesId: string; index: number }) {
  const results = useCalculationStore((st) => st.results);
  const { direct, inputs } = seriesSources(shapeId, seriesId, results);
  if (direct.length === 0) return null;
  const row = (label: string, list: Source[], kind: string) => (
    <div className="flex flex-wrap items-center gap-1">
      <span className="w-12 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      {list.map((s) => (
        <Chip key={s.regionId + s.name} s={s} testId={`series-${index}-${kind}-${s.name}`} />
      ))}
    </div>
  );
  return (
    <div className="space-y-1" data-testid={`series-${index}-sources`}>
      {row('Data from', direct, 'uses')}
      {inputs.length > 0 && row('Inputs', inputs, 'input')}
    </div>
  );
}
