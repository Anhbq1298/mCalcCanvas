import { AlertCircle, CheckCircle2, FileWarning } from 'lucide-react';
import { useMemo } from 'react';
import { isGraphRegionId } from '../../canvas/graphData';
import { select, useCanvasStore } from '../../canvas/model/canvasStore';
import { shapesOutsidePrintArea } from '../../export/pageGeometry';
import { useAppStore } from '../../store/appStore';
import { useCalculationStore } from '../../store/calculationStore';

export function StatusBar() {
  const settings = useAppStore((s) => s.settings);
  const results = useCalculationStore((s) => s.results);
  const shapes = useCanvasStore((s) => s.shapes);
  const outside = useMemo(
    () => shapesOutsidePrintArea(Object.values(shapes), settings.pageOrientation).map((s) => s.id),
    [shapes, settings.pageOrientation],
  );

  // Graph series fields are hidden regions; the graph shows their errors itself.
  const all = Object.entries(results)
    .filter(([id, r]) => r && r.status !== 'empty' && !isGraphRegionId(id))
    .map(([, r]) => r);
  const errors = all.filter((r) => r?.status === 'error').length;
  const failedChecks = all.filter((r) => r?.check && !r.check.pass).length;

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-card px-3 text-[12px] text-muted-foreground" data-testid="status-bar">
      <span className="flex items-center gap-1.5">
        {errors === 0 ? <CheckCircle2 size={13} className="text-success" aria-hidden /> : <AlertCircle size={13} className="text-destructive" aria-hidden />}
        <span data-testid="calc-status">
          {all.length} region{all.length === 1 ? '' : 's'} · {errors === 0 ? 'all calculated' : `${errors} with errors`}
          {failedChecks > 0 && ` · ${failedChecks} check${failedChecks > 1 ? 's' : ''} failed`}
        </span>
      </span>
      {outside.length > 0 && (
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1.5 text-destructive hover:underline"
          onClick={() => select(outside)}
          title="Select objects that will be cut off in the PDF"
        >
          <FileWarning size={13} aria-hidden />
          {outside.length} object{outside.length > 1 ? 's' : ''} outside print area
        </button>
      )}
      <span className="ml-auto">
        {settings.unitSystem} · {settings.precision} dp · {settings.canvasMode === 'page' ? `A4 ${settings.pageOrientation}` : 'Free canvas'}
      </span>
    </footer>
  );
}
