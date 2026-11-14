// Editable native line / rect / draw / text diagrams for the EC4 composite worksheet; no raster images.
// Geometry is drawn to scale from the example inputs (compositeExample.mjs) unless a caption says "schematic".
// Conventions: stress diagrams plot compression (+) to the right of the zero axis and tension (−) to the left;
// force resultants are drawn separately, as the forces on the right-hand cut face of the left beam segment
// (compression pushes ←, tension pulls →), with arrow length proportional to force.
import { plasticState } from './compositeExample.mjs';

const W = 636; // usable figure width (px), page text column 76 … 712
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (v, d = 1) => v.toFixed(d);

export function compositeFigures(l, ex) {
  const res = ex.results;
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
      const tw = (t, size) => Math.ceil(t.length * size * 0.6) + 10;
      /** Text with its vertical centre at y; align 'l' (x = left), 'c' (x = centre) or 'r' (x = right edge). */
      const text = (x, y, t, o = {}) => {
        const size = o.size ?? 12, w = o.w ?? Math.ceil(tw(t, size) * (o.bold ? 1.15 : 1));
        const left = o.a === 'c' ? x - w / 2 : o.a === 'r' ? x - w : x;
        if (left < 0 || left + w > W + 4) throw new Error(`${code}: text outside figure: ${t}`);
        add('text', left, y - size * 0.75, { w, h: Math.ceil(size * 1.45), html: o.bold ? `<b>${esc(t)}</b>` : esc(t), fontFamily: 'Roboto', fontSize: size, color: o.c ?? ink, align: o.a === 'c' ? 'center' : o.a === 'r' ? 'right' : 'left' });
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
          text(o.lx ?? m, yd + (off > 0 ? 11 : -11), label, { a: o.la ?? 'c', size: 11 });
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
      /** Rolled I-section to scale s (px/mm), top centre at (cx, top); fillets drawn as arcs. */
      const ibeam = (cx, top, s) => {
        const b = ex.ba * s, h = ex.ha * s, tf = ex.tf * s, t = ex.tw * s, r = ex.r * s;
        rect(cx - b / 2, top, b, tf); rect(cx - b / 2, top + h - tf, b, tf);
        line(cx - t / 2, top + tf + r, cx - t / 2, top + h - tf - r); line(cx + t / 2, top + tf + r, cx + t / 2, top + h - tf - r);
        for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
          const ox = cx + sx * (t / 2 + r), oy = sy > 0 ? top + tf + r : top + h - tf - r;
          const pts = [];
          for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; pts.push([ox - sx * r * Math.cos(a), oy - sy * r * Math.sin(a)]); }
          poly(pts, { w: 1 });
        }
        return { b, h, tf, t, top, bottom: top + h };
      };
      /** Slab strip shown truncated (break lines) because b_eff is not drawn to the steel scale. */
      const slab = (x, top, w, s) => {
        const hc = ex.hc * s;
        line(x, top, x + w, top); line(x, top + hc, x + w, top + hc);
        for (const xb of [x, x + w]) poly([[xb, top - 4], [xb + 4, top + hc * 0.35], [xb - 4, top + hc * 0.65], [xb, top + hc + 4]], { w: 1 });
        return hc;
      };
      const support = (x, y, roller) => {
        poly([[x, y], [x - 10, y + 16], [x + 10, y + 16], [x, y]], { w: 1.1 });
        if (roller) line(x - 14, y + 22, x + 14, y + 22); else line(x - 14, y + 18, x + 14, y + 18);
      };

      /** Section | stress | forces for one rigid-plastic state. */
      const stressFigure = (state, note) => {
        const s = 0.40, top = 34, cx = 120, X0 = 300, ac = 40, as = 70, XR = 500, fs = 0.05; // px/mm; px/kN
        text(cx, 8, 'SECTION (to scale)', { a: 'c', bold: true, size: 11 });
        text(X0, 8, 'STRESS', { a: 'c', bold: true, size: 11 });
        text(560, 8, 'FORCES', { a: 'c', bold: true, size: 11 });
        const hc = slab(cx - 90, top, 180, s);
        const I = ibeam(cx, top + hc, s);
        const yb = I.bottom, ys = top + hc, yc = top + state.xc * s, yPNA = ys + (state.branch === 'none' ? 0 : state.ya * s);
        // neutral axes first so the blocks and labels sit on top
        dashed(0, yc, X0 + ac, yc, { c: blue });
        if (state.branch !== 'none') dashed(0, yPNA, X0 + as, yPNA, { c: red });
        // stress diagram: concrete 0.85 f_cd and steel ±f_yd on separate amplitude scales
        line(X0, top - 6, X0, yb + 6, { w: 0.9 });
        rect(X0, top, ac, yc - top); hatch(X0, top, ac, yc - top);
        text(X0 + ac + 4, (top + yc) / 2, `0.85 f_cd = ${fmt(0.85 * state.fcd)} MPa`, { size: 11 });
        dim(X0, top, X0, yc, `x_c = ${fmt(state.xc)}`, { off: 12, at: X0 });
        if (state.branch !== 'none') {
          const hcmp = Math.max(1.5, yPNA - ys);
          rect(X0, ys, as, hcmp); hatch(X0, ys, as, hcmp, { s: 4 });
          text(X0 + as + 4, ys + Math.max(10, hcmp / 2), `+f_yd = ${fmt(state.fyd, 0)} MPa`, { size: 11 });
          text(0, yPNA + 12, `y_a = ${fmt(state.ya, 2)} mm`, { size: 11, c: red });
        } else text(X0 + 4, ys + 10, 'no steel compression', { size: 11, c: grey });
        rect(X0 - as, yPNA, as, yb - yPNA); hatch(X0 - as, yPNA, as, yb - yPNA, { s: 9 });
        text(X0 - as - 4, (yPNA + yb) / 2, `−f_yd = ${fmt(state.fyd, 0)} MPa`, { a: 'r', size: 11 });
        text(X0, yb + 18, 'T (−)  |  C (+)', { a: 'c', size: 11, c: grey });
        // force resultants at their area-weighted centroids
        line(XR, top - 6, XR, yb + 6, { w: 0.6, c: grey });
        const arrow = (y, kN, push, label) => {
          const len = Math.max(16, kN * fs);
          if (push) line(XR + len, y, XR, y, { arrow: true, w: 1.6 }); else line(XR, y, XR + len, y, { arrow: true, w: 1.6 });
          text(XR + 4, y - 11, label, { size: 11 });
        };
        arrow(top + (state.xc * s) / 2, state.Nc / 1000, true, `N_c = ${fmt(state.Nc / 1000)} kN`);
        if (state.Ca > 0) arrow(top + state.zCa * s, state.Ca / 1000, true, `C_a = ${fmt(state.Ca / 1000)} kN`);
        arrow(top + state.zT * s, state.Ta / 1000, false, `T_a = ${fmt(state.Ta / 1000)} kN`);
        text(560, yb + 18, 'N_c + C_a = T_a', { a: 'c', size: 11, c: grey });
        let y = yb + 42;
        for (const t of [...note, 'Blue dashed: concrete depth x_c. Red dashed: steel PNA. Forces on the right cut face; arrow length ∝ force.']) { text(0, y, t, { size: 11, w: W }); y += 18; }
      };

      if (mode === 'beam') {
        const xa = 40, xb = 590, yb = 92;
        line(xa, yb, xb, yb, { w: 2 });
        line(xa, 38, xb, 38, { w: 0.9 });
        for (let i = 0; i <= 11; i++) { const x = xa + (i * (xb - xa)) / 11; line(x, 38, x, yb - 3, { arrow: true, w: 0.9 }); }
        text(315, 22, 'w = UDL of the stage considered (construction w1, final w)', { a: 'c' });
        support(xa, yb, false); support(xb, yb, true);
        line(xa, 160, xa, 124, { arrow: true }); line(xb, 160, xb, 124, { arrow: true });
        text(xa + 8, 150, 'R_A = wL/2'); text(xb - 8, 150, 'R_B = wL/2', { a: 'r' });
        dim(xa, 118, xb, 118, 'L = 8000 mm', { off: 58, at: 118 });
        text(315, 222, 'Simply supported: M = w x (L − x)/2, V = w (L/2 − x); one UDL per stage.', { a: 'c', size: 11, c: grey });
      } else if (mode === 'section' || mode === 'construction') {
        const s = 0.42, top = 40, cx = 230;
        const steelTop = mode === 'section' ? top + ex.hc * s : top + 20;
        if (mode === 'section') {
          slab(cx - 150, top, 300, s);
          dim(cx + 150, top, cx + 150, steelTop, 'h_c = 150', { off: -26, at: cx + 150 });
          text(cx, top - 14, 'Solid RC slab, b_eff = 2000 mm (truncated)', { a: 'c', size: 11 });
          // stud on the flange centreline
          rect(cx - 2, steelTop - ex.hsc * s, 4, ex.hsc * s - 1, { w: 0.8 }); rect(cx - 6, steelTop - ex.hsc * s - 3, 12, 3, { w: 0.8 });
          text(cx + 12, steelTop - 30, 'stud 19 × 100', { size: 10, c: grey });
        } else {
          for (const x of [cx - 30, cx, cx + 30]) line(x, top - 14, x, steelTop - 3, { arrow: true, w: 1 });
          text(cx, top - 26, 'wet concrete + construction load (vertical only)', { a: 'c', size: 11 });
          text(350, top - 8, 'No lateral restraint credited', { size: 11 });
          text(350, top + 10, 'from wet slab or formwork (fork ends only)', { size: 11 });
        }
        const I = ibeam(cx, steelTop, s);
        dim(cx - I.b / 2, I.top, cx - I.b / 2, I.bottom, 'h_a = 406.4', { off: 34, at: cx - I.b / 2 });
        dim(cx - I.b / 2, I.bottom, cx + I.b / 2, I.bottom, 'b_a = 177.9', { off: 22, at: I.bottom });
        const lx = 400;
        line(cx + I.b / 2 - 6, I.top + I.tf / 2, lx - 4, I.top + 20, { w: 0.7 }); text(lx, I.top + 20, 't_f = 12.8 mm', { size: 11 });
        line(cx + I.t / 2, I.top + I.h * 0.45, lx - 4, I.top + I.h * 0.45, { w: 0.7 }); text(lx, I.top + I.h * 0.45, 't_w = 7.9 mm', { size: 11 });
        line(cx + I.t / 2 + 3, I.bottom - I.tf - 3, lx - 4, I.bottom - 34, { w: 0.7 }); text(lx, I.bottom - 34, 'root fillet r = 10.2 mm', { size: 11 });
        text(lx, I.bottom - 8, 'UB 406 × 178 × 60, S355; to scale', { size: 11, c: grey });
      } else if (mode === 'width') {
        // transverse section through the floor at midspan (schematic thickness)
        const xa = 40, xm = 318, xb = 596, s = (xm - xa) / 3000, top = 70;
        rect(xa, top, xb - xa, 26);
        for (const x of [xa, xm, xb]) { dashed(x, top - 30, x, top + 62, { c: grey }); rect(x - 7, top + 26, 14, 3, { w: 0.9 }); line(x, top + 29, x, top + 56); text(x === xb ? x - 5 : x + 5, top + 84, 'beam CL', { a: x === xb ? 'r' : 'l', size: 11 }); }
        const e1 = xm - 1000 * s, e2 = xm + 1000 * s;
        line(e1, top - 1, e2, top - 1, { w: 3, c: blue });
        dim(e1, top, xm, top, 'b_e1 = 1000', { off: -26, at: top });
        dim(xm, top, e2, top, 'b_e2 = 1000', { off: -26, at: top });
        dim(e1, top, e2, top, 'b_eff = 2000 mm (L/8 each side)', { off: -52, at: top });
        dim(xa, top + 60, xm, top + 60, 's_b = 3000 (load width)', { off: 50, at: top + 60 });
        dim(xm, top + 60, xb, top + 60, 's_b = 3000', { off: 50, at: top + 60 });
        text(318, 230, 'TRANSVERSE SECTION at midspan; single stud row so b_0 = 0; widths in mm.', { a: 'c', size: 11, c: grey });
      } else if (mode === 'studs') {
        // PLAN to scale along the span (48 studs at 166.7 mm), then a transverse section through one stud
        const xa = 16, xb = 386, s = (xb - xa) / ex.L, yc = 70;
        text(201, 14, 'PLAN on top flange — 48 studs, single row', { a: 'c', bold: true, size: 11 });
        rect(xa, yc - 10, xb - xa, 20, { w: 0.9 });
        const pitch = ex.L / (2 * ex.nh);
        for (let i = 0; i < 2 * ex.nh; i++) { const x = xa + (pitch / 2 + i * pitch) * s; rect(x - 1.6, yc - 1.6, 3.2, 3.2, { w: 0.9 }); }
        dashed((xa + xb) / 2, yc - 30, (xa + xb) / 2, yc + 30, { c: red });
        text((xa + xb) / 2, yc - 38, 'midspan (max M)', { a: 'c', size: 10, c: red });
        dim(xa, yc + 10, (xa + xb) / 2, yc + 10, 'n_h = 24 over L/2 = 4000 mm', { off: 26, at: yc + 10 });
        dim((xa + xb) / 2, yc + 10, xb, yc + 10, '24 studs', { off: 26, at: yc + 10 });
        text(16, yc + 64, 'pitch 166.7 mm; first stud 83.3 mm from support', { size: 11 });
        // transverse section through one stud
        const st = 0.9, base = 190, cx = 550;
        text(cx, 14, 'SECTION through a stud', { a: 'c', bold: true, size: 11 });
        rect(cx - 70, base - ex.hc * st, 140, ex.hc * st, { w: 0.9 });
        rect(cx - 55, base, 110, 6, { w: 1 });
        rect(cx - (ex.dsc * st) / 2, base - ex.hsc * st, ex.dsc * st, ex.hsc * st - 0.5, { w: 0.9 });
        rect(cx - 16 * st, base - ex.hsc * st - 9, 32 * st, 9, { w: 0.9 });
        dim(cx - 10, base, cx - 10, base - ex.hsc * st, 'h_sc = 100', { off: 72, at: cx - 10 });
        dim(cx - 10, base - ex.hsc * st, cx - 10, base - ex.hc * st, 'cover 50', { off: 72, at: cx - 10 });
        text(cx, base + 22, 'd = 19 mm on flange CL', { a: 'c', size: 11 });
      } else if (mode === 'shear') {
        const s = 0.9, top = 40, xa = 20, xb = 616, cx = 318, hc = ex.hc * s;
        text(cx, 12, 'TRANSVERSE SECTION — longitudinal shear surfaces (EC4 Figure 6.15 types)', { a: 'c', bold: true, size: 11 });
        rect(xa, top, xb - xa, hc);
        rect(cx - 80, top + hc, 160, 8, { w: 1.1 });
        rect(cx - 9, top + hc - ex.hsc * s, 18, ex.hsc * s - 0.5, { w: 0.9 }); rect(cx - 15, top + hc - ex.hsc * s - 8, 30, 8, { w: 0.9 });
        const yb = top + 30;
        line(xa + 14, yb, xb - 14, yb, { w: 2.2, c: blue });
        text(xa + 16, yb - 14, 'H10 @ 150 transverse bars (schematic)', { size: 11, c: blue });
        for (const x of [cx - 40, cx + 40]) { line(x, top - 10, x, top + hc + 12, { w: 1.4, c: red }); text(x, top + hc + 24, 'a-a', { a: 'c', size: 11, c: red }); }
        const bb = [[cx - 26, top + hc], [cx - 26, top + hc - ex.hsc * s - 14], [cx + 26, top + hc - ex.hsc * s - 14], [cx + 26, top + hc]];
        for (let i = 0; i < 3; i++) dashed(bb[i][0], bb[i][1], bb[i + 1][0], bb[i + 1][1], { c: grey });
        text(cx + 70, top + hc + 24, 'dashed b-b around the stud: not checked', { size: 10, c: grey });
        line(cx - 60, top + hc / 2 + 18, cx - 150, top + hc / 2 + 18, { arrow: true }); line(cx + 60, top + hc / 2 + 18, cx + 150, top + hc / 2 + 18, { arrow: true });
        text(cx - 158, top + hc / 2 + 18, 'half to left outstand', { a: 'r', size: 11 });
        text(cx + 158, top + hc / 2 + 18, 'half to right outstand', { size: 11 });
        text(cx, top + hc + 50, 'Anchorage beyond each plane and splitting at the studs are review gates, not verified details.', { a: 'c', size: 11, c: grey });
      } else if (mode === 'deflection') {
        const xa = 30, xb = 600, top = 40, dg = ex.results.dg, dt = ex.results.dtot, k = 130 / dt;
        line(xa, top, xb, top, { w: 0.9, c: grey });
        const curve = (amp, w, c) => { const pts = []; for (let i = 0; i <= 24; i++) { const x = i / 24; pts.push([xa + x * (xb - xa), top + 4 * amp * x * (1 - x)]); } poly(pts, { w, c }); };
        curve(dg * k, 1.2, grey); curve(dt * k, 1.8, ink);
        support(xa, top, false); support(xb, top, true);
        text(315, top - 12, 'original chord (no camber)', { a: 'c', size: 11, c: grey });
        text(315, top + dg * k + 16, `steel-only locked-in deflection δ_g = ${fmt(dg)} mm`, { a: 'c', size: 11 });
        text(315, top + dt * k + 18, `final total δ_tot = ${fmt(dt)} mm (adds creep, imposed, slip, shrinkage)`, { a: 'c', size: 11 });
        text(315, top + dt * k + 40, 'Ordinates proportional to the calculated midspan values; span not to the same scale.', { a: 'c', size: 11, c: grey });
      } else if (mode === 'governing') {
        const p = res.partial;
        stressFigure(p, [
          `Branch: η = ${fmt(res.eta, 3)} > η_f = ${fmt(res.etaF, 3)}; A_ac = ${fmt(p.Aac, 0)} ≤ b_a t_f = ${fmt(p.Af, 0)} mm²: steel PNA in the top flange.`,
          `Direct rigid-plastic field at N_c = η N_c,f, EC4 6.2.1.3(3): M = ${fmt(p.M / 1e6)} kNm. Drawn for the example inputs.`,
          'The design M_Rd uses the linear interaction (6.3), a lower bound; this figure is not its stress field.',
        ]);
      } else if (mode === 'full') {
        const p = res.full;
        stressFigure(p, [
          'Reference only: full connection (η = 1) gives M_pl,Rd for the linear interaction (6.3).',
          `N_a,Rd = ${fmt(p.Ta / 1000)} kN ≤ N_c,Rd: plastic neutral axis in the slab, all steel in tension.`,
        ]);
      } else if (mode === 'web') {
        const p = plasticState(ex, 0.30 * res.Ncf);
        stressFigure(p, [
          'Illustration only: hypothetical η = 0.30 (below η_min, inadmissible for this beam).',
          'Steel PNA below the root-fillet toe: y_a = t_f + r + (A_ac − A_fr)/t_w, fillet areas included.',
        ]);
      } else if (mode === 'rejected') {
        const s = 0.40, top = 34;
        const hc = slab(10, top, 200, s);
        const I = ibeam(110, top + hc, s);
        dashed(0, I.top + I.h / 2, 230, I.top + I.h / 2, { c: grey }); text(236, I.top + I.h / 2, 'steel mid-depth: A_ac = A_a/2 at N_c = 0', { size: 11, c: grey });
        dashed(0, I.bottom - I.tf / 2, 230, I.bottom - I.tf / 2, { c: red }); text(236, I.bottom - I.tf / 2, 'hypothetical lower-flange PNA — rejected', { size: 11, c: red });
        text(250, top + 4, 'Sagging, symmetric steel, no axial force, N_c ≥ 0:', { size: 11 });
        text(250, top + 24, 'A_ac = (A_a − N_c/f_yd)/2 ≤ A_a/2', { size: 11, bold: true });
        text(250, top + 44, 'so the steel PNA cannot lie below mid-depth.', { size: 11 });
      }
      l.gap(rows);
    });
  };
}
