import { parseLatex, UNITS } from '../engine/light';
import type { Expr } from '../engine/ExpressionTypes';

/** Render slash units as stacked fractions, including their existing powers. */
export function fractionUnitLatex(latex: string): string {
  if (!latex.includes('/')) return latex;
  let statement: ReturnType<typeof parseLatex>;
  try { statement = parseLatex(latex); }
  catch { return latex; } // A partially formatted fallback unit must not crash the worksheet.
  if (statement.kind !== 'expression') return latex;
  const render = (node: Expr): string => {
    switch (node.type) {
      case 'ident': return `\\mathrm{${node.name}}`;
      case 'num': return node.raw;
      case 'group': return `\\left(${render(node.body)}\\right)`;
      case 'unary': return `${node.op}${render(node.arg)}`;
      case 'binary':
        if (node.op === '/') return `\\frac{${render(node.left)}}{${render(node.right)}}`;
        if (node.op === '*') return `${render(node.left)}\\cdot ${render(node.right)}`;
        if (node.op === '^') return `${render(node.left)}^{${render(node.right)}}`;
        return latex;
      default: return latex;
    }
  };
  return render(statement.expr);
}

/** Translate only unit products, fractions and integer powers; never evaluate text. */
export function resultUnitText(latex: string): string {
  if (!latex.trim()) return '';
  const statement = parseLatex(latex);
  if (statement.kind !== 'expression') throw new Error('Enter a unit, not an equation.');
  const numerator: string[] = [];
  const denominator: string[] = [];
  let scale = 1;
  const collect = (node: Expr, power = 1): void => {
    if (node.type === 'ident' && UNITS.has(node.name)) {
      const term = node.name + (Math.abs(power) === 1 ? '' : `^${Math.abs(power)}`);
      if (power !== 0) (power > 0 ? numerator : denominator).push(term);
      return;
    }
    if (node.type === 'group') return collect(node.body, power);
    if (node.type === 'num' && node.value > 0) {
      scale *= node.value ** power;
      if (!Number.isFinite(scale) || scale <= 0) throw new Error('Use a finite, positive unit multiplier.');
      return;
    }
    if (node.type === 'binary' && (node.op === '*' || node.op === '/')) {
      collect(node.left, power);
      collect(node.right, node.op === '/' ? -power : power);
      return;
    }
    if (node.type === 'binary' && node.op === '^') {
      let exponent = node.right;
      while (exponent.type === 'group') exponent = exponent.body;
      const sign = exponent.type === 'unary' && exponent.op === '-' ? -1 : 1;
      const value = exponent.type === 'unary' ? exponent.arg : exponent;
      if (value.type === 'num' && Number.isSafeInteger(value.value * power)) {
        collect(node.left, power * sign * value.value);
        return;
      }
    }
    throw new Error('Use positive numbers and known units with products, fractions or integer powers.');
  };
  collect(statement.expr);
  const units = (numerator.join(' ') || '1') + denominator.map(term => '/' + term).join('');
  return scale === 1 ? units : `${scale} ${units}`;
}
