import { DEFAULT_MARGINS } from '../documents/DocumentTypes';
import { useAppStore } from '../store/appStore';

/**
 * Title block shown in the top and bottom margins of every page — on the canvas
 * (Page Layout mode) and in the PDF, so what you see is what prints.
 */
export function PageChrome({ index, total, caseLabel }: { index: number; total: number; caseLabel?: string }) {
  const title = useAppStore((s) => s.title);
  const metadata = useAppStore((s) => s.metadata);
  const show = useAppStore((s) => s.settings.showHeaderFooter);
  const m = useAppStore((s) => s.settings.margins) ?? DEFAULT_MARGINS;
  if (!show) return null;
  // Inside the margins: aligned with the text block, half-way into the top/bottom margin.
  const side = { left: `${m.left}mm`, right: `${m.right}mm` };
  const right = [metadata.project, metadata.calculationReference].filter(Boolean).join('  ·  ');
  const people = [
    metadata.preparedBy && `Prepared: ${metadata.preparedBy}`,
    metadata.checkedBy && `Checked: ${metadata.checkedBy}`,
    metadata.revision && `Rev ${metadata.revision}`,
  ]
    .filter(Boolean)
    .join('   ');
  return (
    <>
      <header className="print-header" data-testid="page-header" data-page-chrome style={{ ...side, top: `${Math.max(2, m.top - 8)}mm` }}>
        <div>
          <strong>{title}</strong>
          {caseLabel && <span className="print-case"> · {caseLabel}</span>}
        </div>
        <div>{right}</div>
      </header>
      <footer className="print-footer" data-testid="page-footer" data-page-chrome style={{ ...side, bottom: `${Math.max(2, m.bottom - 8)}mm` }}>
        <div>{people}</div>
        <div>
          Page {index + 1} of {total}
        </div>
      </footer>
    </>
  );
}
