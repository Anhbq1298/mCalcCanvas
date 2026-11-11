// Original vector schematics and editable worksheet cells for SCI NCCI SN003b Tables 3.1/3.2.
// Source: https://www.steelconstruction.info/images/0/0f/SN003b.pdf (pages 5 and 6).
import { R } from './layout.mjs';

const endCases = [
  [1, 1, '1.00'], [2, 0.75, '1.14'], [3, 0.5, '1.31'], [4, 0.25, '1.52'],
  [5, 0, '1.77'], [6, -0.25, '2.05'], [7, -0.5, '2.33'], [8, -0.75, '2.57'], [9, -1, '2.55'],
];
const cases = [
  ...endCases.map(([id, psi, c1]) => ({ id, psi, kind: 'end', c1, c2: '0', label: `End moments; ψ = ${psi > 0 ? '+' : ''}${psi.toFixed(2)}` })),
  { id: 10, kind: 'udl-simple', c1: '1.127', c2: '0.454', label: 'Simply supported; UDL' },
  { id: 11, kind: 'udl-fixed', c1: '2.578', c2: '1.554', label: 'Fixed in bending; UDL' },
  { id: 12, kind: 'point-simple', c1: '1.348', c2: '0.630', label: 'Simply supported; mid-point load' },
  { id: 13, kind: 'point-fixed', c1: '1.683', c2: '1.645', label: 'Fixed in bending; mid-point load' },
];
const WIDTH = 640, HEADER = 40, HEIGHT = 100;
const text = (x, y, value, extra = '') => `<text x="${x}" y="${y}" ${extra}>${value}</text>`;
const line = (x1, y1, x2, y2, extra = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${extra}/>`;
const arrow = (x, top, bottom) => line(x, top, x, bottom, 'stroke="#2563eb" stroke-width="1.4"') + `<path d="M${x - 3},${bottom - 5}L${x},${bottom}L${x + 3},${bottom - 5}" fill="none" stroke="#2563eb" stroke-width="1.4"/>`;
function endMoment(x, y, clockwise) {
  const end = x + (clockwise ? -11 : 11);
  return `<path d="M${x},${y - 11}A11,11 0 1 ${clockwise ? 1 : 0} ${end},${y}" fill="none" stroke="#2563eb" stroke-width="1.4"/>` +
    `<path d="M${end - 3},${y + 5}L${end},${y}L${end + 3},${y + 5}" fill="none" stroke="#2563eb" stroke-width="1.4"/>`;
}

function supports(fixed, y) {
  if (fixed) return [88, 254].map(x => `<path d="M${x},${y - 12}V${y + 12}" stroke="#334155" stroke-width="3"/>` + Array.from({ length: 5 }, (_, i) => line(x - 5, y - 8 + i * 4, x, y - 12 + i * 4, 'stroke="#64748b"'))).join('');
  return [88, 254].map((x, i) => `<path d="M${x},${y + 2}l-6,10h12z" fill="white" stroke="#334155"/>` + (i ? line(x - 8, y + 15, x + 8, y + 15, 'stroke="#64748b"') : '')).join('');
}

function loading(c, y) {
  const beam = line(88, y + 42, 254, y + 42, 'stroke="#334155" stroke-width="3"');
  let load = '';
  if (c.kind === 'end') {
    // Positive internal end moments have opposite external rotations at the two ends.
    load = endMoment(88, y + 26, true) + text(103, y + 22, 'M');
    if (c.psi !== 0) {
      load += endMoment(254, y + 26, c.psi < 0);
      load += text(220, y + 22, `${c.psi < 0 ? '−' : ''}${Math.abs(c.psi).toFixed(2)}M`, 'text-anchor="end"');
    }
  } else if (c.kind.startsWith('udl')) {
    load = line(88, y + 12, 254, y + 12, 'stroke="#2563eb"') + Array.from({ length: 12 }, (_, i) => arrow(88 + i * 166 / 11, y + 12, y + 34)).join('') + text(171, y + 9, 'q', 'text-anchor="middle"');
  } else load = arrow(171, y + 8, y + 34) + text(179, y + 18, 'F');
  return beam + supports(c.kind.endsWith('fixed'), y + 42) + load + text(171, y + 85, c.label, 'text-anchor="middle" font-size="10"');
}

function ordinate(c, x) {
  if (c.kind === 'end') return 1 + (c.psi - 1) * x;
  if (c.kind === 'udl-simple') return 4 * x * (1 - x);
  if (c.kind === 'udl-fixed') return -1 + 6 * x * (1 - x);
  if (c.kind === 'point-simple') return 2 * Math.min(x, 1 - x);
  return -1 + 4 * Math.min(x, 1 - x);
}

function momentDiagram(c, y) {
  const points = Array.from({ length: 41 }, (_, i) => {
    const x = i / 40;
    // Sagging is drawn below the zero line, hogging above; ordinates use max |M| = 1.
    return `${(294 + 172 * x).toFixed(2)},${(y + 47 + 25 * ordinate(c, x)).toFixed(2)}`;
  });
  return line(294, y + 47, 466, y + 47, 'stroke="#64748b" stroke-dasharray="3 2"') +
    `<path d="M294,${y + 47}L${points.join('L')}L466,${y + 47}Z" fill="#dbeafe" stroke="#1e3a5f" stroke-width="1.2"/>` +
    text(380, y + 87, 'M / max |M|', 'text-anchor="middle" font-size="10" fill="#64748b"');
}

function panelSvg(rows) {
  const height = HEADER + HEIGHT * rows.length;
  const horizontal = Array.from({ length: rows.length }, (_, i) => line(0, HEADER + HEIGHT * i, WIDTH, HEADER + HEIGHT * i)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
    <title>LTB cases ${rows[0].id} to ${rows.at(-1).id}; SCI NCCI SN003b Tables 3.1 and 3.2</title>
    <rect x="0.5" y="0.5" width="639" height="${height - 1}" fill="white" stroke="#94a3b8"/>
    <rect x="1" y="1" width="638" height="39" fill="#eff6ff"/>
    <g stroke="#cbd5e1" stroke-width="1">${horizontal}${[60, 280, 480, 560].map(x => line(x, 0, x, height)).join('')}</g>
    <g font-family="Arial,sans-serif" font-size="12" fill="#1e3a5f">
      <g font-weight="bold" text-anchor="middle">${text(30, 25, 'Case')}${text(170, 25, 'Loading and supports')}${text(380, 25, 'Bending moment diagram')}${text(520, 25, 'C1')}${text(600, 25, 'C2')}</g>
      ${rows.map((c, i) => { const y = HEADER + i * HEIGHT; return `<g id="ltb-case-${c.id}">${text(30, y + 57, String(c.id), 'text-anchor="middle" font-weight="bold" font-size="14"')}${loading(c, y)}${momentDiagram(c, y)}</g>`; }).join('')}
    </g>
  </svg>`;
}

/** Background diagrams/grid + live math coefficient cells. Each panel prints as one intact group. */
export function ltbCaseTable(layout) {
  const { st, out, id, ln, need, KEEP, ROW, P, T, M, fo } = layout;
  T('SN003b Tables 3.1 / 3.2; k = kw = 1 and κ = 0 (conservative C1). No interpolation of cases.');
  T('Support symbols show bending restraints; lateral movement and twist are restrained at both ends.');
  T('Double-click a C1/C2 cell to edit. Lookup uses these cells; use case 0 for other arrangements.');
  for (const rows of [cases.slice(0, 7), cases.slice(7)]) {
    const height = HEADER + HEIGHT * rows.length;
    need(height / 40);
    KEEP(() => {
      out.push({ id: id(), type: 'image', x: 76, y: ln(st.page, st.row), props: { w: WIDTH, h: height, src: `data:image/svg+xml;base64,${Buffer.from(panelSvg(rows)).toString('base64')}` } });
      st.row += HEADER / 40;
      for (const c of rows) {
        st.row += 1;
        const options = { displayMode: 'value', precision: 3, resultFormat: 'decimal', trailingZeros: true, fontSize: 14, constant: true };
        ROW([[576, R`C_{1.${c.id}}\coloneq ${c.c1}`, options], [656, R`C_{2.${c.id}}\coloneq ${c.c2}`, options]], 1.5);
      }
    });
  }
  const column = n => R`\mathrm{stack}\left(` + cases.map(c => R`C_{${n}.${c.id}}`).join(',') + R`\right)`;
  P('Lookup row indices', R`n_{t}\coloneq\mathrm{seq}\left(1,13\right)`, M({ fontSize: 12 }, fo));
  P('C1 column from the table cells', R`C_{1.t}\coloneq${column(1)}`, M({ fontSize: 12 }, fo));
  P('C2 column from the table cells', R`C_{2.t}\coloneq${column(2)}`, M({ fontSize: 12 }, fo));
}
