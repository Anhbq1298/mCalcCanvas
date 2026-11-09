import { parseLatex } from '../engine/light';

/**
 * Return plain text only when the parser proves the whole math region is one
 * unstructured word. Definitions, operators, fractions, matrices, calls and
 * single-letter variables remain mathematical regions.
 */
export function convertibleMathWord(latex: string): string | null {
  try {
    const statement = parseLatex(latex);
    if (statement.kind !== 'expression' || statement.expr.type !== 'ident') return null;
    const { name, roman, splittable } = statement.expr;
    if (roman || !splittable || name.length < 2) return null;
    for (const char of name) {
      const code = char.charCodeAt(0);
      if (!((code >= 65 && code <= 90) || (code >= 97 && code <= 122))) return null;
    }
    return name;
  } catch {
    return null;
  }
}
