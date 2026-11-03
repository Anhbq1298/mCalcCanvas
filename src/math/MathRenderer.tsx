import { convertLatexToMarkup } from 'mathlive';
import { memo, useMemo } from 'react';

/**
 * Static, memoised LaTeX rendering (MathLive markup + KaTeX fonts).
 * Re-renders only when the LaTeX string changes.
 */
export const MathRenderer = memo(function MathRenderer({ latex, className }: { latex: string; className?: string }) {
  const html = useMemo(() => {
    try {
      // \unit{…} is the editor's atomic unit macro; it renders upright.
      return convertLatexToMarkup(latex.replace(/\\unit\{/g, '\\mathrm{'), { defaultMode: 'math' } as never);
    } catch {
      return null;
    }
  }, [latex]);
  if (html === null) return <span className={className}>{latex}</span>;
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
});
