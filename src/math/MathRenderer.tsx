import { convertLatexToMarkup } from 'mathlive';
import { memo, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { UNIT_COLOR, styleUnits } from './unitStyle';

/**
 * Static, memoised LaTeX rendering (MathLive markup + KaTeX fonts).
 * Re-renders only when the LaTeX string changes. Units are shown in light
 * blue with a dot before them (see unitStyle.ts).
 */
export const MathRenderer = memo(function MathRenderer({ latex, className }: { latex: string; className?: string }) {
  // Label style: unit colour of the document (Math Formatting → Label styles).
  const unitColor = useAppStore((s) => s.settings.labelStyles?.unitColor ?? UNIT_COLOR);
  const html = useMemo(() => {
    try {
      // \unit{…} is the editor's atomic unit macro; it renders upright.
      return convertLatexToMarkup(styleUnits(latex, unitColor).replace(/\\unit\{/g, '\\mathrm{'), { defaultMode: 'math' } as never);
    } catch {
      return null;
    }
  }, [latex, unitColor]);
  if (html === null) return <span className={className}>{latex}</span>;
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
});
