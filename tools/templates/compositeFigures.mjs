// Static, editable native figures (line / rect / draw / text) for the EC4 composite worksheet.
// Figures are symbolic: labels use drawing-style symbols with subscripts (h_c → h<sub>c</sub>) and
// dimensions are indicative only. All values are in the worksheet regions, which follow the inputs.
// Stress diagrams: compression (+) right of the zero axis, tension (−) left; forces are drawn
// separately as the forces on the right cut face (compression pushes ←, tension pulls →).

const W = 636; // usable figure width (px), page text column 76 … 712
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Drawing-style symbol markup: a_b → italic a with upright subscript b (b may contain letters, digits, ',', '.'). */
const sym = (t) => esc(t).replace(/([A-Za-zα-ωΑ-Ω])_([A-Za-z0-9]+(?:[,.][A-Za-z0-9]+)*)/g, '<i>$1</i><sub>$2</sub>');
const plain = (t) => t.replace(/_([A-Za-z0-9]+(?:[,.][A-Za-z0-9]+)*)/g, '$1');

export function compositeFigures(l) {
  return (code, caption, mode, rows = 8) => {
    l.need(rows + 1.5);
    l.KEEP(() => {
      l.H(3, `${code} — ${caption}`);
      const y0 = l.ln(l.st.page, l.st.row);
      const add = (type, x, y, props) => l.out.push({ id: l.id(), type, x: Math.round(76 + x), y: Math.round(y0 + y), props });
      const ink = '#111111', grey = '#64748b', red = '#b91c1c', blue = '#1d4ed8';
      const seg = (x, y, x2, y2, o, arrow) => add('line', x, y, { x2: x2 - x, y2: y2 - y, stroke: o.c ?? ink, strokeWidth: o.w ?? 1.2, arrow });
      /** Arrowheads are drawn by the app at 40 % of the line length (max 14 px): a short final segment keeps them small. */
      const line = (x, y, x2, y2, o = {}) => {
        if (!o.arrow) return seg(x, y, x2, y2, o, false);
        const len = Math.hypot(x2 - x, y2 - y), hl = Math.min(len, o.head ?? ((o.w ?? 1.2) < 1 ? 14 : 18));
        const bx = x2 - ((x2 - x) * hl) / len, by = y2 - ((y2 - y) * hl) / len;
        if (len - hl > 0.5) seg(x, y, bx, by, o, false);
        seg(bx, by, x2, y2, o, true);
      };
      const rect = (x, y, w, h, o = {}) => add('rect', x, y, { w, h, stroke: o.c ?? ink, strokeWidth: o.w ?? 1.2 });
      const poly = (pts, o = {}) => add('draw', pts[0][0], pts[0][1], { points: pts.map(([x, y]) => [x - pts[0][0], y - pts[0][1]]), stroke: o.c ?? ink, strokeWidth: o.w ?? 1.2 });
      const tw = (t, size) => Math.ceil(plain(t).length * size * 0.6) + 10;
      /** Text with its vertical centre at y; align 'l' (x = left), 'c' (x = centre) or 'r' (x = right edge). */
      const text = (x, y, t, o = {}) => {
        const size = o.size ?? 12, w = o.w ?? Math.ceil(tw(t, size) * (o.bold ? 1.15 : 1));
        const left = o.a === 'c' ? x - w / 2 : o.a === 'r' ? x - w : x;
        if (left < 0 || left + w > W + 4) throw new Error(`${code}: text outside figure: ${t}`);
        add('text', left, y - size * 0.75, { w, h: Math.ceil(size * 1.45), html: o.bold ? `<b>${sym(t)}</b>` : o.it ? `<i>${sym(t)}</i>` : sym(t), fontFamily: 'Roboto', fontSize: size, color: o.c ?? ink, align: o.a === 'c' ? 'center' : o.a === 'r' ? 'right' : 'left' });
      };
      const dashed = (x, y, x2, y2, o = {}) => {
        const len = Math.hypot(x2 - x, y2 - y), n = Math.max(1, Math.floor(len / 9));
        for (let i = 0; i < n; i++) {
          const a = i / n, b = Math.min(1, a + 0.55 / n);
          line(x + (x2 - x) * a, y + (y2 - y) * a, x + (x2 - x) * b, y + (y2 - y) * b, { w: 1, ...o });
        }
      };
      /** 45° hatch inside a rectangle (stress block shading). */
      const hatch = (x, y, w, h, o = {}) => {
        const s = o.s ?? 7;
        for (let k = s; k < w + h; k += s) {
          const ax = x + Math.max(0, k - h), ay = y + Math.min(h, k), bx = x + Math.min(w, k), by = y + Math.max(0, k - w);
          if (Math.hypot(bx - ax, by - ay) > 2) line(ax, ay, bx, by, { w: 0.6, c: o.c ?? grey });
        }
      };
      /** Dimension: extension lines from the measured points, a dimension line with two arrowheads, label clear of it. */
      const dim = (x1, y1, x2, y2, label, o = {}) => {
        const horiz = Math.abs(y2 - y1) < Math.abs(x2 - x1);
        const off = o.off ?? 18;
        if (horiz) {
          const yd = (o.at ?? Math.max(y1, y2)) + off;
          line(x1, y1 + Math.sign(off) * 3, x1, yd + Math.sign(off) * 4, { w: 0.7 });
          line(x2, y2 + Math.sign(off) * 3, x2, yd + Math.sign(off) * 4, { w: 0.7 });
          const span = Math.abs(x2 - x1), m = (x1 + x2) / 2;
          if (span >= 36) { line(m, yd, x1, yd, { w: 0.8, arrow: true }); line(m, yd, x2, yd, { w: 0.8, arrow: true }); }
          else { line(Math.min(x1, x2) - 16, yd, Math.min(x1, x2), yd, { w: 0.8, arrow: true }); line(Math.max(x1, x2) + 16, yd, Math.max(x1, x2), yd, { w: 0.8, arrow: true }); }
          text(o.lx ?? m, yd + (off > 0 ? 11 : -11), label, { a: o.la ?? 'c', size: 11, it: o.it });
        } else {
          const xd = (o.at ?? Math.min(x1, x2)) - off;
          line(x1 - Math.sign(off) * 3, y1, xd - Math.sign(off) * 4, y1, { w: 0.7 });
          line(x2 - Math.sign(off) * 3, y2, xd - Math.sign(off) * 4, y2, { w: 0.7 });
          const span = Math.abs(y2 - y1), m = (y1 + y2) / 2;
          if (span >= 22) { line(xd, m, xd, y1, { w: 0.8, arrow: true }); line(xd, m, xd, y2, { w: 0.8, arrow: true }); }
          else { line(xd, Math.min(y1, y2) - 14, xd, Math.min(y1, y2), { w: 0.8, arrow: true }); line(xd, Math.max(y1, y2) + 14, xd, Math.max(y1, y2), { w: 0.8, arrow: true }); }
          text(off > 0 ? xd - 5 : xd + 5, o.ly ?? (span >= 22 ? m : Math.min(y1, y2) - 12), label, { a: off > 0 ? 'r' : 'l', size: 11 });
        }
      };
      const support = (x, y, roller) => {
        poly([[x, y], [x - 10, y + 16], [x + 10, y + 16], [x, y]], { w: 1.1 });
        if (roller) line(x - 14, y + 22, x + 14, y + 22); else line(x - 14, y + 18, x + 14, y + 18);
      };


      if (mode === 'section') {
        // Transverse section, schematic proportions
        const top = 30, hc = 56, ha = 150, b = 76, tf = 7, tw = 4, cx = 230;
        line(cx - 170, top, cx + 170, top); line(cx - 170, top + hc, cx + 170, top + hc);
        for (const xb of [cx - 170, cx + 170]) poly([[xb, top - 4], [xb + 4, top + hc * 0.35], [xb - 4, top + hc * 0.65], [xb, top + hc + 4]], { w: 1 });
        const st = top + hc;
        rect(cx - b / 2, st, b, tf); rect(cx - b / 2, st + ha - tf, b, tf);
        line(cx - tw / 2, st + tf, cx - tw / 2, st + ha - tf); line(cx + tw / 2, st + tf, cx + tw / 2, st + ha - tf);
        rect(cx - 2, st - 34, 4, 33, { w: 0.8 }); rect(cx - 6, st - 37, 12, 3, { w: 0.8 });
        dim(cx - 170, top, cx + 170, top, 'b_eff', { off: -16, at: top });
        dim(cx + 170, top, cx + 170, st, 'h_c', { off: -14, at: cx + 170 });
        dim(cx - b / 2, st, cx - b / 2, st + ha, 'h_a', { off: 30, at: cx - b / 2 });
        dim(cx - b / 2, st + ha, cx + b / 2, st + ha, 'b_a', { off: 16, at: st + ha });
        dim(cx + 6, st, cx + 6, st - 37, 'h_sc', { off: -40, at: cx + 6 });
        const lx = 440;
        line(cx + b / 2 - 4, st + tf / 2, lx - 4, st + 16, { w: 0.7 }); text(lx, st + 16, 't_f  flange thickness', { size: 11 });
        line(cx + tw / 2, st + ha * 0.5, lx - 4, st + ha * 0.5, { w: 0.7 }); text(lx, st + ha * 0.5, 't_w  web thickness', { size: 11 });
        line(cx + tw / 2 + 2, st + ha - tf - 2, lx - 4, st + ha - 26, { w: 0.7 }); text(lx, st + ha - 26, 'r  root radius', { size: 11 });
        text(0, st + ha + 52, 'Schematic, not to scale; dimensions indicative. Values: section 1 (inputs).', { size: 11, c: grey, w: W });
      } else if (mode === 'loads') {
        // Loading of the composite stage: rows of the load tables (schematic)
        const xa = 40, xb = 590, yb = 80;
        line(xa, yb, xb, yb, { w: 2 });
        support(xa, yb, false); support(xb, yb, true);
        line(xa, 56, xb, 56, { w: 0.9 });
        for (let i = 0; i <= 10; i++) { const x = xa + (i * (xb - xa)) / 10; line(x, 56, x, yb - 3, { arrow: true, w: 0.8, head: 9 }); }
        text(xa + 4, 46, 'area loads: p_k,i × s_b  (x_1,i to x_2,i)', { size: 11 });
        for (const x of [300, 520]) line(x, 2, x, yb - 3, { arrow: true, w: 1.8 });
        text(306, 8, 'P_1 (G_k,1 , Q_k,1)', { size: 11 });
        text(514, 24, 'P_j = F_k,j', { size: 11, a: 'r' });
        dim(xa, yb, 300, yb, 'a_1', { off: 24, at: yb + 8 });
        dim(xa, yb, 520, yb, 'a_j', { off: 40, at: yb + 8 });
        dim(xa, yb, xb, yb, 'L', { off: 56, at: yb + 8, it: true });
        text(xa + 8, yb + 22, 'R_A', { size: 11 }); text(xb - 8, yb + 22, 'R_B', { size: 11, a: 'r' });
      } else if (mode === 'pna') {
        // Symbolic plastic stress block for partial connection; PNA position from section 9.2
        const top = 34, hc = 60, ha = 170, b = 76, tf = 7, tw = 4, cx = 120, X0 = 320, XR = 500;
        text(cx, 8, 'SECTION', { a: 'c', bold: true, size: 11 }); text(X0, 8, 'STRESS', { a: 'c', bold: true, size: 11 }); text(560, 8, 'FORCES', { a: 'c', bold: true, size: 11 });
        line(cx - 90, top, cx + 90, top); line(cx - 90, top + hc, cx + 90, top + hc);
        for (const xb of [cx - 90, cx + 90]) poly([[xb, top - 4], [xb + 4, top + hc * 0.35], [xb - 4, top + hc * 0.65], [xb, top + hc + 4]], { w: 1 });
        const st = top + hc, yb = st + ha;
        rect(cx - b / 2, st, b, tf); rect(cx - b / 2, yb - tf, b, tf);
        line(cx - tw / 2, st + tf, cx - tw / 2, yb - tf); line(cx + tw / 2, st + tf, cx + tw / 2, yb - tf);
        const yc = top + 34, yp = st + 18; // indicative depths
        dashed(0, yc, X0 + 44, yc, { c: blue }); dashed(0, yp, X0 + 74, yp, { c: red });
        line(X0, top - 6, X0, yb + 6, { w: 0.9 });
        rect(X0, top, 40, yc - top); hatch(X0, top, 40, yc - top);
        rect(X0, st, 70, yp - st); hatch(X0, st, 70, yp - st, { s: 5 });
        rect(X0 - 70, yp, 70, yb - yp); hatch(X0 - 70, yp, 70, yb - yp, { s: 9 });
        text(X0 + 44, (top + yc) / 2, '0.85 f_cd', { size: 11 }); text(X0 + 74, (st + yp) / 2, '+f_yd', { size: 11 }); text(X0 - 74, (yp + yb) / 2, '−f_yd', { a: 'r', size: 11 });
        dim(X0, top, X0, yc, 'x_c', { off: 12, at: X0 });
        dim(cx + b / 2 + 4, st, cx + b / 2 + 4, yp, 'y_a', { off: -14, at: cx + b / 2 + 4 });
        line(XR, top - 6, XR, yb + 6, { w: 0.6, c: grey });
        line(XR + 80, (top + yc) / 2, XR, (top + yc) / 2, { arrow: true, w: 1.6 }); text(XR + 84, (top + yc) / 2, 'N_c', { size: 12 });
        line(XR + 30, (st + yp) / 2, XR, (st + yp) / 2, { arrow: true, w: 1.6 }); text(XR + 34, (st + yp) / 2, 'C_a', { size: 12 });
        line(XR, st + 110, XR + 110, st + 110, { arrow: true, w: 1.6 }); text(XR + 112, st + 96, 'T_a', { size: 12 });
        text(X0, yb + 18, 'T (−)  |  C (+)', { a: 'c', size: 11, c: grey }); text(560, yb + 18, 'N_c + C_a = T_a', { a: 'c', size: 11, c: grey });
        text(0, yb + 42, 'Symbolic. Blue: concrete depth x_c; red: steel PNA y_a, a separate axis (flange or web branch).', { size: 11, c: grey, w: W });
        text(0, yb + 60, 'The branch and all values are calculated in section 9.2; the design M_Rd uses EC4 (6.3).', { size: 11, c: grey, w: W });
      } else if (mode === 'shear3d') {
        // Two oblique views of a slab segment on the beam, one shear surface each (EC4 Figure 6.15):
        // a-a = vertical planes through h_c at the flange edges; b-b = the trough around the studs. No hidden lines.
        const teal = '#0f766e', hc = 64, B = 220, Lz = 150, zx = 0.55, zy = 0.32;
        const panel = (ox, which) => {
          const col = which === 'a' ? red : teal;
          const P = (X, Y, Z) => [ox + 10 + B / 2 + X + zx * Z, 150 - Y - zy * Z];
          const L3 = (p, q, o = {}) => line(p[0], p[1], q[0], q[1], o);
          const h = B / 2;
          // slab: cut face, top face, right face
          rect(P(-h, hc, 0)[0], P(-h, hc, 0)[1], B, hc);
          L3(P(-h, hc, 0), P(-h, hc, Lz)); L3(P(h, hc, 0), P(h, hc, Lz)); L3(P(-h, hc, Lz), P(h, hc, Lz));
          L3(P(h, 0, 0), P(h, 0, Lz)); L3(P(h, 0, Lz), P(h, hc, Lz));
          // steel flange and web stub, front stud
          rect(P(-34, 0, 0)[0], 150, 68, 6); rect(P(-2, 0, 0)[0], 156, 4, 22);
          rect(P(-3, 0, 0)[0], 150 - 38, 6, 38, { w: 0.9 }); rect(P(-8, 0, 0)[0], 150 - 43, 16, 5, { w: 0.9 });
          // transverse bars on the cut face
          L3(P(-h + 6, hc - 14, 0), P(h - 6, hc - 14, 0), { w: 2 }); L3(P(-h + 6, 14, 0), P(h - 6, 14, 0), { w: 2 });
          // the surface: trace on the cut face (bold), far end, and its long edges
          if (which === 'a') {
            for (const X of [-34, 34]) {
              L3(P(X, 0, 0), P(X, hc, 0), { c: col, w: 2 }); L3(P(X, 0, Lz), P(X, hc, Lz), { c: col, w: 1.2 });
              L3(P(X, hc, 0), P(X, hc, Lz), { c: col, w: 1.2 }); L3(P(X, 0, 0), P(X, 0, Lz), { c: col, w: 1.2 });
              for (const Y of [hc - 14, 14]) rect(P(X, Y, 0)[0] - 3, P(X, Y, 0)[1] - 3, 6, 6, { c: col, w: 2 });
              text(P(X, hc, Lz)[0], P(X, hc, Lz)[1] - 9, 'a', { a: 'c', size: 12, c: col, bold: true });
            }
          } else {
            const U = [[-10, 0], [-10, 46], [10, 46], [10, 0]];
            for (let i = 0; i < 3; i++) { L3(P(...U[i], 0), P(...U[i + 1], 0), { c: col, w: 2 }); L3(P(...U[i], Lz), P(...U[i + 1], Lz), { c: col, w: 1.2 }); }
            for (const [X, Y] of U) L3(P(X, Y, 0), P(X, Y, Lz), { c: col, w: 1.2 });
            for (const X of [-10, 10]) rect(P(X, 14, 0)[0] - 3, P(X, 14, 0)[1] - 3, 6, 6, { c: col, w: 2 });
            text(P(0, hc, Lz)[0], P(0, hc, Lz)[1] - 9, 'b', { a: 'c', size: 12, c: col, bold: true });
          }
          // longitudinal shear on the slab outstand, along the span
          L3(P(-h + 22, hc, 20), P(-h + 22, hc, 120), { c: blue, w: 1.6, arrow: true });
          text(P(-h + 22, hc, 20)[0] - 4, P(-h + 22, hc, 20)[1] - 10, 'v_f', { size: 11, c: blue, bold: true });
        };
        panel(0, 'a'); panel(322, 'b');
        text(0, 196, 'a-a: vertical planes through h_c beside the studs;', { size: 11, c: red, w: 310 });
        text(0, 212, 'v_f / 2 on each; crossed by top + bottom bars, A_t + A_b', { size: 11, w: 310 });
        text(322, 196, 'b-b: around the studs, length 2h_sc + d_head + b_0;', { size: 11, c: teal, w: 310 });
        text(322, 212, 'the whole v_f; crossed by the bottom bars twice, 2A_b', { size: 11, w: 310 });
        text(0, 236, 'Both surfaces run the whole length of the beam; the front face is the cross-section (schematic).', { size: 11, c: grey, w: W });
      }
      l.gap(rows);
    });
  };
}
