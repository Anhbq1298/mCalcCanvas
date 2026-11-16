"""
Independent check of the natural-frequency block (4.10) of Composite_Beam_EC4.mCCV.

1. The method (transformed section with the SCI P354 dynamic modulus 38 GPa, f = 18 / sqrt(delta)) is first
   run on the published SCI P354 worked example (secondary beam UB 406x178x67, 7.5 m, b_eff 1875 mm), as written
   up at https://structville.com/2020/07/vibration-serviceability-of-composite-slabs.html
   (I = 81 745 cm4, delta = 3.629 mm, f = 9.282 Hz).
2. The same method, with section properties integrated numerically from the library geometry and exact
   closed-form midspan deflections, gives the reference values for the worksheet's own cases.
Writes docs/composite-design/reference_vibration.json.
"""
import json, math

Ea, Ed, g = 210e3, 38e3, 9.81  # N/mm2, N/mm2, m/s2

def section(h, b, tw, tf, r, n=40000):
    """Area (mm2) and second moment about the centroidal axis (mm4), fillets included, by integration."""
    dy = h / n; A = 0.0; I = 0.0; yc = h / 2 - tf - r
    for i in range(n):
        y = -h / 2 + (i + 0.5) * dy; ay = abs(y)
        if ay > h / 2 - tf: w = b
        else:
            w = tw
            if ay >= yc: w += 2 * (r - math.sqrt(max(0.0, r * r - (ay - yc) ** 2)))
        A += w * dy; I += w * y * y * dy
    return A, I

def composite_I(A_a, I_a, d, beff, hc, n_mod, gap=0.0):
    """Transformed section, slab of thickness hc on top; gap = depth between slab top and steel top beyond hc."""
    Ac = beff * hc / n_mod; yb = hc + gap + d / 2
    y = (A_a * yb + Ac * hc / 2) / (A_a + Ac)
    return I_a + A_a * (yb - y) ** 2 + beff * hc ** 3 / (12 * n_mod) + Ac * (y - hc / 2) ** 2

def delta_mid(L, EI, w=0.0, points=()):
    """Midspan deflection (mm): UDL w (N/mm) and point loads (a mm from the left support, P N)."""
    d = 5 * w * L ** 4 / (384 * EI)
    for a, P in points:
        a = min(a, L - a); d += P * a * (3 * L * L - 4 * a * a) / (48 * EI)
    return d

out = {}
# 1. published example
n = Ea / Ed
I = composite_I(85.5e2, 24300e4, 409.4, 1875, 70, n, gap=60)
d2 = 5 * 15.123 * 7500 ** 4 / (384 * Ea * I)
out['published_P354_example'] = {'I_cm4': I / 1e4, 'I_published_cm4': 81745.204, 'delta_mm': d2, 'delta_published_mm': 3.629, 'f_Hz': 18 / math.sqrt(3.760), 'f_published_Hz': 9.282}

# 2. worksheet cases (solid slab, rho_c 25 kN/m3, studs / bars irrelevant; psi_vib 0.1)
def case(name, sec, mass, L_m, sb_m, hc, G_kpa, Q_kpa, pointsG, pointsQ, psi=0.1):
    A_a, I_a = section(**sec)
    L = L_m * 1e3; beff = 2 * min(L / 8, sb_m * 1e3 / 2)  # EN 1994-1-1 5.4.1.2, b0 = 0
    g0 = mass * g / 1e3 + 25 * hc / 1e3 * sb_m                # kN/m
    w = (g0 + G_kpa * sb_m + psi * Q_kpa * sb_m)             # kN/m = N/mm
    pts = [(a * 1e3, P * 1e3) for a, P in pointsG] + [(a * 1e3, psi * P * 1e3) for a, P in pointsQ]
    I_dyn = composite_I(A_a, I_a, sec['h'], beff, hc, n)
    dc = delta_mid(L, Ea * I_dyn, w, pts); dn = delta_mid(L, Ea * I_a, w, pts)
    return {'f1_Hz': 18 / math.sqrt(dc), 'f1_nc_Hz': 18 / math.sqrt(dn), 'delta_dyn_mm': dc, 'delta_dyn_nc_mm': dn,
            'I_dyn_cm4': I_dyn / 1e4, 'I_a_cm4': I_a / 1e4, 'A_a_cm2': A_a / 1e2, 'b_eff_mm': beff, 'w_kN_m': w}

out['default_UB406x178x60_L8'] = case('default', dict(h=406.4, b=177.9, tw=7.9, tf=12.8, r=10.0), 60.1, 8, 3, 150, 1.5, 3, [(3, 30)], [(3, 45)])
out['UB406x140x46_L5_P30'] = case('L5', dict(h=403.2, b=142.2, tw=6.8, tf=11.2, r=10.0), 46.0, 5, 2.5, 200, 5, 3, [(0.8, 30)], [])
json.dump(out, open('docs/composite-design/reference_vibration.json', 'w'), indent=2)
print(json.dumps(out, indent=2))
