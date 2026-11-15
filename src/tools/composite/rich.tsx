/**
 * Text with engineering subscripts: "M_Ed(x)", "η_min", "b_eff = 2,000", "L_LT = k_LT L", "f_{ck}" are
 * drawn with real subscripts, never as underscores (HTML <sub> and SVG <tspan>).
 */
import { Fragment } from 'react';
import { subParts } from './format';

/** HTML text with subscripts. */
export function Rich({ text }: { text: string }) {
  return <>{subParts(text).map((p, i) => (p.sub ? <sub key={i}>{p.t}</sub> : <Fragment key={i}>{p.t}</Fragment>))}</>;
}

/** SVG tspans with subscripts, for use inside a <text>. */
export function SvgRich({ text, size = 11 }: { text: string; size?: number }) {
  const parts = subParts(text);
  const spans = parts.map((p, i) => {
    const prevSub = i > 0 && !!parts[i - 1].sub;
    const dy = p.sub ? (prevSub ? 0 : 3) : prevSub ? -3 : 0;
    return <tspan key={i} dy={dy || undefined} fontSize={p.sub ? size * 0.72 : undefined}>{p.t}</tspan>;
  });
  return <>{spans}</>;
}
