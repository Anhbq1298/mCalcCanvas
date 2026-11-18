import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { ltbCriticalFactor } = await server.ssrLoadModule('/src/engineering/fem/ltb.ts');
  const { ritzMcrFactor } = await server.ssrLoadModule('/src/tests/unit/fem/ritz.ts');
  const E = 210000, G = 81000, Iz = 538e4, It = 19e4, Iw = 207e9, h = 403.2, L = 6000, tf = 11.2, tw = 6.8;
  const rows = [];
  for (const taper of [false, true]) {
    const hx = (x) => taper ? 300 + (h - 300) * x / L : h;
    const props = (x) => ({ EIz: E * (Iz + tw ** 3 * (hx(x) - h) / 12), GIt: G * (It + tw ** 3 * (hx(x) - h) / 3), EIw: E * Iw * ((hx(x) - tf) / (h - tf)) ** 2 });
    for (const kind of ['unbraced', 'fork-mid', 'top-mid', 'top-multiple']) {
      const flangeRestraints = (kind === 'top-mid' ? [0.5] : kind === 'top-multiple' ? [0.2, 0.55, 0.8] : []).map((t) => ({ x: t * L, z: hx(t * L) / 2 }));
      const input = { L, props, M: (x) => x * (L - x) / 2, qzg: (x) => hx(x) / 2, flangeRestraints, restraints: kind === 'fork-mid' ? [L / 2] : [] };
      const values = [12, 24, 48].map((elements) => ltbCriticalFactor({ ...input, elements }) * L ** 2 / 8e6);
      const ritz = kind === 'fork-mid' ? null : ritzMcrFactor({ ...input, terms: 45 }) * L ** 2 / 8e6;
      rows.push({ section: taper ? '300-403.2' : '403.2', kind, Mcr12: values[0], Mcr24: values[1], Mcr48: values[2], ritz45: ritz });
    }
  }
  console.table(rows);
} finally { await server.close(); }
