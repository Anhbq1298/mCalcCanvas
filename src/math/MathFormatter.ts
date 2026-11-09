import type { CalculationResult } from '../engine';
import type { MathDisplayMode } from '../canvas/model/types';

/** Remove a trailing "=" (and MathLive placeholder) the user typed to request a result. */
function stripTrailingEquals(latex: string): string {
  let s = latex.trim();
  s = s.replace(/\\placeholder(\[[^\]]*\])?\{[^}]*\}\s*$/, '').trim();
  if (s.endsWith('=') && !s.endsWith(':=') && !s.endsWith('\\le=')) s = s.slice(0, -1).trim();
  return s;
}

/**
 * Commands that could inject links or styling into rendered markup are
 * removed before static rendering. The calculation parser never accepts them.
 */
function sanitizeLatex(latex: string): string {
  return latex.replace(/\\(href|url|htmlData|htmlId|htmlStyle|class|cssId|style|includegraphics)\b/g, '');
}

interface DisplayParts {
  /** LaTeX of the region as it should appear on the worksheet. */
  latex: string;
  /** PASS / FAIL badge for check regions. */
  check?: { pass: boolean };
}

/** Expanded numeric column vectors flow into labelled continuation panels, with every entry retained. */
export function flowColumnVectors(latex: string, rowsPerPanel = 28): string {
  return latex.replace(/\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}/g, (matrix, body: string) => {
    if (body.includes('&') || body.includes('\\begin') || body.includes('\\vdots')) return matrix;
    const rows = body.split('\\\\');
    if (rows.length <= rowsPerPanel) return matrix;
    const panels: string[] = [];
    for (let start = 0; start < rows.length; start += rowsPerPanel) {
      const part = rows.slice(start, start + rowsPerPanel);
      panels.push(`\\begin{array}{c}\\scriptstyle\\mathrm{rows}\\ ${start + 1}:${start + part.length}\\\\\\begin{bmatrix}${part.join('\\\\')}\\end{bmatrix}\\end{array}`);
    }
    return panels.join('\\quad');
  });
}

function resolvedMode(mode: MathDisplayMode, result: CalculationResult): Exclude<MathDisplayMode, 'auto'> {
  if (mode !== 'auto') return mode;
  if (result.kind === 'definition') {
    // Literal inputs (L := 8.5 m) show the formula only; derived values show
    // formula and result like a hand calculation.
    return result.references.length > 0 ? 'formulaResult' : 'formula';
  }
  if (result.kind === 'expression') return 'formula';
  return 'formulaResult';
}

/**
 * Compose the display LaTeX for a region from its source and the engine result.
 * No values are invented here: every number comes from the result object.
 */
export function buildDisplay(sourceLatex: string, result: CalculationResult | undefined, mode: MathDisplayMode): DisplayParts {
  const src = sanitizeLatex(sourceLatex);
  if (!result || result.status !== 'valid') return { latex: src };

  if (result.kind === 'check' && result.check) {
    const c = result.check;
    return {
      latex: `${c.leftLatex}=${c.leftValue.latex}\\;${c.opLatex}\\;${c.rightLatex ? `${c.rightLatex}=` : ''}${c.rightValue.latex}`,
      check: { pass: c.pass },
    };
  }

  const value = result.value?.latex;
  if (!value) return { latex: src };
  const m = resolvedMode(mode, result);
  const formula = stripTrailingEquals(src);

  switch (result.kind) {
    case 'definition': {
      const name = result.definesLatex ?? '';
      if (m === 'formula') return { latex: formula };
      if (m === 'result') return { latex: `${name}=${value}` };
      const hasSubstitution = result.references.length > 0 && result.substitutionLatex;
      if (m === 'full' && hasSubstitution) {
        return {
          latex: `\\begin{aligned}${formula.replace(/\\coloneq|:=/, '&\\coloneq ')}\\\\&=${result.substitutionLatex}\\\\&=${value}\\end{aligned}`,
        };
      }
      return { latex: `${formula}=${value}` };
    }
    case 'evaluation': {
      if (m === 'full' && result.references.length > 0 && result.substitutionLatex) {
        return { latex: `${formula}=${result.substitutionLatex}=${value}` };
      }
      return { latex: `${formula}=${value}` };
    }
    case 'expression':
      return { latex: m === 'formula' ? formula : `${formula}=${value}` };
    default:
      return { latex: src };
  }
}
