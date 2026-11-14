"""Independent reference in N, mm, MPa; no canvas/engine imports.
Run: python tools/templates/reference_composite.py > docs/composite-design/reference.json
Geometry/properties are explicit published inputs. The steel PNA is found by numerical
integration of the rolled width (circular root fillets), not by the worksheet's branch formulas.
"""
import json
from math import pi, sqrt


H, B, TF, TW, RR = 406.4, 177.9, 12.8, 7.9, 10.2


def width(y):
    """Rolled I-section width at depth y below the top (root fillets as circular arcs)."""
    yy = min(y, H - y)
    if yy < TF:
        return B
    s = yy - TF
    if s < RR:
        return TW + 2 * (RR - sqrt(RR * RR - (RR - s) ** 2))
    return TW


def plastic(nc, a=7650., fy=355., hc=150., be=2000., n=20000):
    """Rigid-plastic sagging state at slab force nc: (xc, ya, M) in mm, mm, N mm.
    Midpoint integration on each piece between the width breakpoints (flange, fillet, web)."""
    aac = (a - nc / fy) / 2
    acc, q, ya = 0.0, 0.0, None
    for y_lo, y_hi in ((0, TF), (TF, TF + RR), (TF + RR, H / 2)):
        dy = (y_hi - y_lo) / n
        for i in range(n):
            y0 = y_lo + i * dy
            w = width(y0 + dy / 2)
            if acc + w * dy >= aac:
                ya = y0 + (aac - acc) / w
                q += (aac - acc) * (hc + (y0 + ya) / 2)
                break
            acc += w * dy
            q += w * dy * (hc + y0 + dy / 2)
        if ya is not None:
            break
    xc = nc / (17 * be)
    return xc, ya, fy * a * (hc + H / 2) - 2 * fy * q - nc * xc / 2


def reference():
    L, A, fy, E, I = 8000., 7650., 355., 210000., 216000000.
    h, hc, be, b, tf = 406.4, 150., 2000., 177.9, 12.8
    g = 60.1 * 9.81 / 1000 + 25 * .15 * 3
    w1 = 1.35 * (g + .5 * 3) + 1.5 * .75 * 3
    w2 = 1.35 * (g + 1.5 * 3) + 1.5 * 3 * 3
    p = min(.8 * 450 * pi * 19**2 / 4 / 1.25,
            .29 * 19**2 * sqrt(30 * 33000) / 1.25)
    nc, na = 24 * p, A * fy
    eta = nc / na
    xf, xc = na / (17 * be), nc / (17 * be)
    ma = 1.2e6 * fy
    mf = na * (hc + h / 2 - xf / 2)
    mr = ma + eta * (mf - ma)
    _, ya, direct = plastic(nc)
    assert 0 < ya <= tf, 'Example steel PNA expected in the top flange'
    assert ma < mr < direct < mf
    branches = {}
    for studs in (14, 8):
        _, y_b, m_b = plastic(min(1, studs * p / na) * na)
        branches[f'n_h_{studs}'] = dict(eta=studs * p / na, steel_PNA_mm=y_b,
                                         M_direct_kNm=m_b / 1e6)
    ncr = pi**2 * E * 12e6 / L**2
    mcr = 1.127 * ncr * (sqrt(466e9 / 12e6 + 81000 * 333000 / ncr
                             + (.454 * h / 2)**2) - .454 * h / 2)
    lam = sqrt(ma / mcr)
    phi = .5 * (1 + .34 * (lam - .2) + lam**2)
    chi = min(1, 1 / (phi + sqrt(phi**2 - lam**2)))
    vrd = (A - 2*b*tf + (7.9+2*10.2)*tf)*fy/sqrt(3)
    trans = {}
    for key, n in [('0', E/33000), ('L', E/33000*(1+1.1*2)),
                   ('s', E/33000*(1+.55*2))]:
        ac = be*hc/n
        y = (A*(hc+h/2)+ac*hc/2)/(A+ac)
        ic = I+A*(hc+h/2-y)**2+be*hc**3/(12*n)+ac*(y-hc/2)**2
        trans[key] = (n,y,ic)
    def delta(w, ic):
        return 5*w*L**4/(384*E*ic)
    dg = delta(g,I)
    dl = delta((1.5+.3*3)*3,trans['L'][2])
    dt = delta(.7*3*3,trans['0'][2])
    dslip = .3*(1-eta)*(delta((1.5+3)*3,I)-dl-dt)
    ns,ys,is_ = trans['s']
    dsh = (E/ns*be*hc*.0003)*(ys-hc/2)/(E*is_)*L**2/8
    vl = p/(2*(L/48)*hc)
    as_req = vl*hc/((500/1.15)*2)
    as_prov = pi*10**2/(4*150)
    return dict(P_Rd_kN=p/1000, eta=eta, eta_min=.49,
                M1_Ed_kNm=w1*L**2/8/1e6, M2_Ed_kNm=w2*L**2/8/1e6,
                M_full_kNm=mf/1e6, M_partial_linear_kNm=mr/1e6,
                M_partial_direct_kNm=direct/1e6, steel_PNA_mm=ya,
                x_c_mm=xc, x_full_mm=xf, eta_flange_boundary=1-2*b*tf/A,
                branches=branches,
                M_cr_kNm=mcr/1e6, M_b_Rd_kNm=chi*ma/1e6,
                UR_LTB=w1*L**2/(8*chi*ma), UR_M2=w2*L**2/(8*mr),
                UR_V2=w2*L/(2*vrd), delta_construction_mm=delta(g+3.75,I),
                delta_locked_mm=dg, delta_long_mm=dl, delta_transient_mm=dt,
                delta_slip_mm=dslip, delta_shrinkage_mm=dsh,
                delta_total_mm=dg+dl+dt+dslip+dsh,
                transverse_required_mm2_m=as_req*1000,
                transverse_provided_mm2_m=as_prov*1000,
                UR_transverse=as_req/as_prov,
                **{f'I_{k}_mm4':v[2] for k,v in trans.items()})


if __name__ == '__main__':
    print(json.dumps(reference(), indent=2))
