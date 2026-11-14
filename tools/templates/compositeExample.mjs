// Example inputs of the EC4 composite worksheet and the plastic stress state used to DRAW the figures.
// The worksheet regions are the calculation; these numbers only place and label the native drawings
// (generated for the example inputs). Units: N, mm, MPa.
export const EX = {
  L: 8000, hc: 150, sb: 3000,
  fy: 355, fck: 30, Ecm: 33000,
  gC: 1.5, gV: 1.25, gM0: 1,
  // UB 406 x 178 x 60, SCI P363 rounded values
  ha: 406.4, ba: 177.9, tf: 12.8, tw: 7.9, r: 10.2, Aa: 7650,
  dsc: 19, hsc: 100, fu: 450, nh: 24,
  ds: 10, sf: 150,
};

/** Rigid-plastic sagging state for connection force Nc (EC4 6.2.1.3(3)); y measured down from the steel top. */
export function plasticState(e, Nc) {
  const fyd = e.fy / e.gM0, fcd = e.fck / e.gC;
  const beff = Math.min(e.L / 8, e.sb / 2) * 2;
  const Af = e.ba * e.tf;
  const Afr = Af + e.tw * e.r + (2 - Math.PI / 2) * e.r ** 2;
  const xc = Nc / (0.85 * fcd * beff);
  const Aac = (e.Aa - Nc / fyd) / 2;
  let branch, ya, Q;
  if (Aac <= 0) { branch = 'none'; ya = 0; Q = 0; }
  else if (Aac <= Af) { branch = 'flange'; ya = Aac / e.ba; Q = Aac * (e.hc + ya / 2); }
  else if (Aac < Afr) { branch = 'fillet'; ya = NaN; Q = NaN; }
  else {
    branch = 'web';
    ya = e.tf + e.r + (Aac - Afr) / e.tw;
    const Qfr = Af * (e.hc + e.tf / 2) + e.tw * e.r * (e.hc + e.tf + e.r / 2) + (2 - Math.PI / 2) * e.r ** 2 * (e.hc + e.tf + 0.22337 * e.r);
    Q = Qfr + e.tw * (ya - e.tf - e.r) * (e.hc + (ya + e.tf + e.r) / 2);
  }
  const Ca = Aac > 0 ? Aac * fyd : 0, Ta = (e.Aa - Math.max(Aac, 0)) * fyd;
  const zT = (e.Aa * (e.hc + e.ha / 2) - Q) / (e.Aa - Math.max(Aac, 0));
  const M = fyd * e.Aa * (e.hc + e.ha / 2) - 2 * fyd * Q - Nc * xc / 2;
  return { fyd, fcd, beff, Af, Afr, xc, Aac, branch, ya, Q, Ca, Ta, Nc, zT, zCa: Aac > 0 ? Q / Aac : null, M };
}

export function exampleResults(e = EX) {
  const fyd = e.fy / e.gM0, fcd = e.fck / e.gC;
  const beff = Math.min(e.L / 8, e.sb / 2) * 2;
  const PRd = Math.min(0.8 * e.fu * Math.PI * e.dsc ** 2 / 4 / e.gV, 0.29 * e.dsc ** 2 * Math.sqrt(e.fck * e.Ecm) / e.gV);
  const Ncf = Math.min(0.85 * fcd * beff * e.hc, e.Aa * fyd);
  const eta = Math.min(1, e.nh * PRd / Ncf);
  return { PRd, Ncf, eta, etaF: 1 - 2 * e.ba * e.tf / e.Aa, partial: plasticState(e, eta * Ncf), full: plasticState(e, Ncf) };
}
