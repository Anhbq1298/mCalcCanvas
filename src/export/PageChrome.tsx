import { useAppStore } from '../store/appStore';

/**
 * Title block shown at the top and bottom of every A4 page — on the canvas
 * (Page Layout mode) and in the PDF, so what you see is what prints.
 */
export function PageChrome({ index, total }: { index: number; total: number }) {
  const title = useAppStore((s) => s.title);
  const metadata = useAppStore((s) => s.metadata);
  const show = useAppStore((s) => s.settings.showHeaderFooter);
  if (!show) return null;
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
      <header className="print-header" data-testid="page-header" data-page-chrome>
        <div>
          <strong>{title}</strong>
        </div>
        <div>{right}</div>
      </header>
      <footer className="print-footer" data-testid="page-footer" data-page-chrome>
        <div>{people}</div>
        <div>
          Page {index + 1} of {total}
        </div>
      </footer>
    </>
  );
}
