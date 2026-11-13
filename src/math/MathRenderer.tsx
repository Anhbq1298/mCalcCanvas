import { convertLatexToMarkup } from 'mathlive';
import { memo, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { UNIT_COLOR, styleUnits } from './unitStyle';

/**
 * Static, memoised LaTeX rendering (MathLive markup + KaTeX fonts).
 * Re-renders only when the LaTeX string changes. Units are shown in light
 * blue with a dot before them (see unitStyle.ts).
 */
export const MathRenderer = memo(function MathRenderer({ latex, className, resultUnit }: { latex: string; className?: string; resultUnit?: string }) {
  // Label style: unit colour of the document (Math Formatting → Label styles).
  const unitColor = useAppStore((s) => s.settings.labelStyles?.unitColor ?? UNIT_COLOR);
  const html = useMemo(() => {
    try {
      // \unit{…} is the editor's atomic unit macro; it renders upright.
      const at = resultUnit ? latex.lastIndexOf(resultUnit) : -1;
      const marked = at >= 0 ? `${latex.slice(0, at)}\\htmlData{result-unit=true}{${resultUnit}}${latex.slice(at + resultUnit!.length)}` : latex;
      return convertLatexToMarkup(styleUnits(marked, unitColor).replace(/\\unit\{/g, '\\mathrm{'), { defaultMode: 'math' } as never);
    } catch {
      return null;
    }
  }, [latex, unitColor, resultUnit]);
  if (html === null) return <span className={className}>{latex}</span>;
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
});
