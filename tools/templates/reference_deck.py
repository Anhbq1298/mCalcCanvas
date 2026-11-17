"""
Independent check of the profiled-steel-deck mode of Composite_Beam_EC4.mCCV (EN 1994-1-1 §6.6.4, §6.2.1, §6.6.6.4).
Closed-form hand calculation, section properties integrated from the library geometry (fillets included).
Case: UB 406x140x46 S355, L 8 m, s_b 3 m, slab 130 mm overall on a 60 mm deck (b_0 150, pitch 300, t 1.0 mm),
ribs transverse, 2 studs 19 x 100 per rib in every rib, C30/37, default load tables (G 1.5 kPa + 30 kN at 3 m,
Q 3 kPa + 45 kN at 3 m), deck counted as transverse reinforcement. A second case has the ribs parallel.
Writes docs/composite-design/reference_deck.json.
"""
import json, math

def section(h, b, tw, tf, r, n=40000):
    """Area (mm2) and second moment (mm4) about the centroidal axis, fillets included, by integration."""
    dy = h / n; A = 0.0; I = 0.0; yc = h / 2 - tf - r
    for i in range(n):
        y = -h / 2 + (i + 0.5) * dy; ay = abs(y)
        w = b if ay > h / 2 - tf else tw + (2 * (r - math.sqrt(max(0.0, r * r - (ay - yc) ** 2))) if ay >= yc else 0.0)
        A += w * dy; I += w * y * y * dy
    return A, I

fy, fck, Ecm, Ea, fu, gV, gC = 355.0, 30.0, 33e3, 210e3, 450.0, 1.25, 1.5
L, sb, hc, hp, br, er, tp = 8000.0, 3000.0, 130.0, 60.0, 150.0, 300.0, 1.0
d, hsc = 19.0, 100.0
geo = dict(h=403.2, b=142.2, tw=6.8, tf=11.2, r=10.0); mass = 46.0

def wpl(h, b, tw, tf, r, n=40000):
    dy = h / n; s = 0.0; yc = h / 2 - tf - r
    for i in range(n):
        y = -h / 2 + (i + 0.5) * dy; ay = abs(y)
        w = b if ay > h / 2 - tf else tw + (2 * (r - math.sqrt(max(0.0, r * r - (ay - yc) ** 2))) if ay >= yc else 0.0)
        s += w * ay * dy
    return s

A, Ia = section(**geo); W = wpl(**geo); ha = geo['h']
ht = hc - hp
beff = 2 * min(L / 8, sb / 2)
Ps = 0.8 * fu * math.pi * d * d / 4 / gV / 1e3
Pc = 0.29 * min(1, 0.2 * (hsc / d + 1)) * d * d * math.sqrt(fck * Ecm) / gV / 1e3

def case(par, nr):
    if par:
        k = min(1.0, 0.6 * br / hp * (min(hsc, hp + 75) / hp - 1)); n_pos, sA, sB = 1, 125.0, 200.0
    else:
        kmax = (0.85 if tp <= 1 else 1.0) if nr == 1 else (0.7 if tp <= 1 else 0.8)
        k = min(kmax, 0.7 / math.sqrt(nr) * br / hp * (hsc / hp - 1)); n_pos, sA, sB = nr, er, er
    PRd = k * min(Ps, Pc)
    gc = 25e-6 * sb * (hc - hp * (1 - br / er)) + 0.13e-3 * sb   # N/mm
    g0 = mass * 9.81 / 1e3 + gc                                   # kN/m = N/mm
    w = 1.35 * g0 + (1.35 * 1.5 + 1.5 * 3.0) * sb / 1e3           # N/mm
    P = (1.35 * 30 + 1.5 * 45) * 1e3; a = 3000.0
    M = lambda x: w * x * (L - x) / 2 + (P * (L - a) / L * x if x <= a else P * a / L * (L - x))
    xs = [i * L / 200 for i in range(201)]; xM = max(xs, key=M); MEd = M(xM) / 1e6
    nA = n_pos * math.floor(xM / sA + 0.5); nB = n_pos * math.floor((L - xM) / sB + 0.5); nh = min(nA, nB)
    fcd, fyd = fck / gC, fy
    NcRd = 0.85 * fcd * beff * ht / 1e3; NaRd = A * fyd / 1e3; Ncf = min(NcRd, NaRd)
    eta = min(1.0, nh * PRd / Ncf)
    xf = Ncf * 1e3 / (0.85 * fcd * beff)
    Mpl = Ncf * (hc + ha / 2 - xf / 2) / 1e3; Ma = W * fyd / 1e6
    def I(n):
        Ac = beff * ht / n; yb = hc + ha / 2; y = (A * yb + Ac * ht / 2) / (A + Ac)
        return (Ia + A * (yb - y) ** 2 + beff * ht ** 3 / (12 * n) + Ac * (y - ht / 2) ** 2) / 1e4
    vf = n_pos * PRd / min(sA, sB) * 1e3                          # kN/m
    return {'k_d': k, 'P_Rd_kN': PRd, 'g_0_kN_m': g0, 'x_M_m': xM / 1e3, 'M_Ed_kNm': MEd, 'n_h': nh, 'N_cRd_kN': NcRd, 'N_cf_kN': Ncf,
            'eta': eta, 'M_plRd_kNm': Mpl, 'M_aRd_kNm': Ma, 'M_Rd_kNm': Ma + eta * (Mpl - Ma), 'I_0_cm4': I(Ea / Ecm), 'I_dyn_cm4': I(Ea / 38e3),
            'v_f_kN_m': vf, 'v_LEd_MPa': vf / (2 * ht), 'l_b_mm': 2 * hsc + 32, 'l_c_mm': 2 * math.hypot(hsc - hp, max(0.0, (br - 32) / 2)) + 32}

out = {'transverse_2_per_rib': case(False, 2), 'parallel': case(True, 1)}
json.dump(out, open('docs/composite-design/reference_deck.json', 'w'), indent=2)
print(json.dumps(out, indent=2))
