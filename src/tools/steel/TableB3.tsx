/**
 * EN 1993-1-1 Table B.3 redrawn for the C_m form: the three moment diagrams, the ranges and the
 * expressions per load type, with the rows in use highlighted (C_my / C_mz / C_mLT tags).
 */
import type { ReactNode } from 'react';

type Hit = { row: string; col?: 'u' | 'c'; tag: string };

const S = ({ children }: { children: ReactNode }) => <sub>{children}</sub>;

/** M at the left end, linear to ψM */
function Linear() {
  return (
    <svg viewBox="0 0 170 70" className="b3-svg" aria-hidden="true"><g transform="translate(10 0)">
      <line x1="20" y1="45" x2="130" y2="45" className="b3-axis" />
      <polygon points="20,45 20,12 130,30 130,45" className="b3-fill" />
      <text x="6" y="20">M</text><text x="134" y="36">ψM</text>
    </g></svg>
  );
}
type P = [number, number];
/** parabola through three points (the moment diagram), sampled as a polyline */
function parabola([x0, y0]: P, [x1, y1]: P, [x2, y2]: P): string {
  const L = (x: number) => y0 * ((x - x1) * (x - x2)) / ((x0 - x1) * (x0 - x2)) + y1 * ((x - x0) * (x - x2)) / ((x1 - x0) * (x1 - x2)) + y2 * ((x - x0) * (x - x1)) / ((x2 - x0) * (x2 - x1));
  const pts: string[] = [];
  for (let i = 0; i <= 40; i++) { const x = x0 + ((x2 - x0) * i) / 40; pts.push(`${x.toFixed(1)},${L(x).toFixed(1)}`); }
  return pts.join(' ');
}
/** diagram: axis at y = ax, end ordinates h (M_h) and e (ψM_h), extreme span ordinate s at x = xs; dashed lines join the points */
function Diagram({ ax, h, s, e, xs, sLabel, def }: { ax: number; h: number; s: number; e: number; xs: number; sLabel: [number, number]; def: ReactNode }) {
  const A: P = [20, h], S: P = [xs, s], E: P = [130, e];
  return (
    <svg viewBox="0 0 170 88" className="b3-svg" aria-hidden="true"><g transform="translate(10 0)">
      <polygon points={`20,${ax} ${parabola(A, S, E)} 130,${ax}`} className="b3-fill" />
      <line x1="20" y1={ax} x2="130" y2={ax} className="b3-axis" />
      <polyline points={`${A.join(',')} ${S.join(',')} ${E.join(',')}`} className="b3-dash" />
      <line x1={xs} y1={ax} x2={xs} y2={s} className="b3-arrow" />
      <circle cx={A[0]} cy={A[1]} r="1.8" className="b3-pt" /><circle cx={S[0]} cy={S[1]} r="1.8" className="b3-pt" /><circle cx={E[0]} cy={E[1]} r="1.8" className="b3-pt" />
      <text x="-6" y={h + 4}>M<tspan dy="3" fontSize="8">h</tspan></text>
      <text x={sLabel[0]} y={sLabel[1]}>M<tspan dy="3" fontSize="8">s</tspan></text>
      <text x="133" y={e + 4}>ψM<tspan dy="3" fontSize="8">h</tspan></text>
      <text x="44" y="82" className="b3-def">{def}</text>
    </g></svg>
  );
}
const ratio = (a: string, b: string) => <>α<tspan dy="3" fontSize="8">{a === 'Ms' ? 's' : 'h'}</tspan><tspan dy="-3"> = M</tspan><tspan dy="3" fontSize="8">{a === 'Ms' ? 's' : 'h'}</tspan><tspan dy="-3">/M</tspan><tspan dy="3" fontSize="8">{b === 'Ms' ? 's' : 'h'}</tspan></>;
/** end moment M_h governs (hogging at the ends, sagging in the span) */
const EndGoverns = () => <Diagram ax={36} h={6} s={52} e={24} xs={80} sLabel={[83, 64]} def={ratio('Ms', 'Mh')} />;
/** span moment M_s governs */
const SpanGoverns = () => <Diagram ax={12} h={28} s={62} e={22} xs={72} sLabel={[57, 42]} def={ratio('Mh', 'Ms')} />;

export function TableB3({ hits }: { hits: Hit[] }) {
  const on = (row: string, col?: 'u' | 'c') => hits.filter((h) => h.row === row && (!col || !h.col || h.col === col));
  const cell = (row: string, col: 'u' | 'c' | undefined, body: ReactNode, span?: number) => {
    const h = on(row, col);
    return <td colSpan={span} className={`b3-f ${h.length ? 'on' : ''}`} data-testid={`b3-${row}${col ?? ''}`}>{body}{h.length > 0 && <span className="b3-tag">{h.map((x, i) => <span key={x.tag}>{i ? ', ' : ''}C<sub>m{x.tag}</sub></span>)}</span>}</td>;
  };
  const a = (x: string) => <>α<S>{x}</S></>;
  return (
    <figure className="b3" aria-label="EN 1993-1-1 Table B.3">
      <figcaption>EN 1993-1-1 Table B.3: equivalent uniform moment factors C<S>m</S></figcaption>
      <table>
        <thead>
          <tr><th rowSpan={2}>Moment diagram</th><th rowSpan={2} colSpan={2}>Range</th><th colSpan={2}>C<S>my</S>, C<S>mz</S>, C<S>mLT</S></th></tr>
          <tr><th>uniform load</th><th>concentrated load</th></tr>
        </thead>
        <tbody>
          <tr><td className="b3-d"><Linear /></td><td colSpan={2}>−1 ≤ ψ ≤ 1</td>{cell('lin', undefined, <>0.6 + 0.4ψ ≥ 0.4</>, 2)}</tr>
          <tr><td rowSpan={3} className="b3-d"><EndGoverns /></td><td>0 ≤ {a('s')} ≤ 1</td><td>−1 ≤ ψ ≤ 1</td>{cell('s1', 'u', <>0.2 + 0.8{a('s')} ≥ 0.4</>)}{cell('s1', 'c', <>0.2 + 0.8{a('s')} ≥ 0.4</>)}</tr>
          <tr><td rowSpan={2}>−1 ≤ {a('s')} &lt; 0</td><td>0 ≤ ψ ≤ 1</td>{cell('s2', 'u', <>0.1 − 0.8{a('s')} ≥ 0.4</>)}{cell('s2', 'c', <>−0.8{a('s')} ≥ 0.4</>)}</tr>
          <tr><td>−1 ≤ ψ &lt; 0</td>{cell('s3', 'u', <>0.1(1 − ψ) − 0.8{a('s')} ≥ 0.4</>)}{cell('s3', 'c', <>0.2(−ψ) − 0.8{a('s')} ≥ 0.4</>)}</tr>
          <tr><td rowSpan={3} className="b3-d"><SpanGoverns /></td><td>0 ≤ {a('h')} ≤ 1</td><td>−1 ≤ ψ ≤ 1</td>{cell('h1', 'u', <>0.95 + 0.05{a('h')}</>)}{cell('h1', 'c', <>0.90 + 0.10{a('h')}</>)}</tr>
          <tr><td rowSpan={2}>−1 ≤ {a('h')} &lt; 0</td><td>0 ≤ ψ ≤ 1</td>{cell('h2', 'u', <>0.95 + 0.05{a('h')}</>)}{cell('h2', 'c', <>0.90 + 0.10{a('h')}</>)}</tr>
          <tr><td>−1 ≤ ψ &lt; 0</td>{cell('h3', 'u', <>0.95 + 0.05{a('h')}(1 + 2ψ)</>)}{cell('h3', 'c', <>0.90 + 0.10{a('h')}(1 + 2ψ)<sup>*</sup></>)}</tr>
          <tr><td colSpan={5} className="b3-note">Sway buckling mode: C<S>my</S> = 0.9 or C<S>mz</S> = 0.9 respectively.</td></tr>
          <tr><td colSpan={5} className="b3-note">
            Each factor uses the moment diagram between the relevant braced points:
            <span className="b3-brace"><b>C<S>my</S></b> bending y-y, points braced in z-z · <b>C<S>mz</S></b> bending z-z, braced in y-y · <b>C<S>mLT</S></b> bending y-y, braced in y-y (lateral restraints)</span>
          </td></tr>
        </tbody>
      </table>
      <p className="hint">ψ = the smaller end moment / the larger end moment M<S>h</S>, signs kept. <sup>*</sup> As EN 1993-1-1:2022 (Table 8.9); some printings of EN 1993-1-1:2005 show 0.90 − 0.10α<S>h</S>(1 + 2ψ), which is discontinuous with the row above at ψ = 0.</p>
    </figure>
  );
}
