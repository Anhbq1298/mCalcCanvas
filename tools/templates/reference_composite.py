"""Independent reference in N, mm, MPa; no canvas/engine imports.
Run: python tools/templates/reference_composite.py > docs/composite-design/reference.json
Geometry/properties are explicit published inputs. The steel PNA is found by numerical
integration of the rolled width (circular root fillets), not by the worksheet's branch formulas.
"""
import json
from math import ceil, pi, sqrt


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


def beam(w, loads, L=8000.):
    """Simply supported beam, full-span UDL w (N/mm) + point loads [(a, P)]: closed form."""
    ra = w * L / 2 + sum(P * (L - a) / L for a, P in loads)
    rb = w * L + sum(P for _, P in loads) - ra

    def m(x):
        return ra * x - w * x * x / 2 - sum(P * max(0., x - a) for a, P in loads)
    # maximum: at a point load or where the shear changes sign inside a load-free stretch
    cuts = sorted([0., L] + [a for a, _ in loads])
    cand = list(cuts)
    for x0, x1 in zip(cuts, cuts[1:]):
        v0 = ra - sum(P for a, P in loads if a <= x0)
        if w > 0 and x0 < v0 / w < x1:
            cand.append(v0 / w)
    xm = max(cand, key=m)
    return ra, rb, m, xm


def mid_deflection(w, loads, ei, L=8000.):
    """Midspan deflection: 5wL^4/384EI plus P a (3L^2 - 4a^2)/48EI per point load (a <= L/2)."""
    d = 5 * w * L**4 / 384
    for a, P in loads:
        b = min(a, L - a)
        d += P * b * (3 * L * L - 4 * b * b) / 48
    return d / ei


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
    # composite-stage tables: UDL row (g, q) = (4.5, 9) N/mm full span; point load a = 3 m, G 30 kN, Q 45 kN
    gu, qu, a, gp, qp = 4.5, 9., 3000., 30e3, 45e3
    w2 = 1.35*(g+gu) + 1.5*qu
    f2 = 1.35*gp + 1.5*qp
    ra, rb, mom, xm = beam(w2, [(a, f2)])
    m2, v2, ma_p = mom(xm), max(ra, rb), mom(a)
    eta_req = max(.49, (m2 - ma)/(mf - ma))
    n_req = ceil(eta_req*na/p)
    nreq_p = ceil(max(0., (ma_p - ma)/(mf - ma))*na/p)
    # spacing inputs per shear span (support to max moment), first stud at s/2
    sa, sb = 125., 200.
    n_a, n_b = int(xm/sa + .5), int((L - xm)/sb + .5)
    vf = p/min(sa, sb)
    ur_x = 0.
    for i in range(201):
        x = L*i/200
        n = int(x/sa + .5) if x <= xm else int((L - x)/sb + .5)
        ur_x = max(ur_x, mom(x)/(ma + min(1., n*p/na)*(mf - ma)))
    n_p = int(a/sa + .5) if a <= xm else int((L - a)/sb + .5)
    aac_p = (A - min(na, n_p*p)/fy)/2
    k_p = 0 if aac_p <= 0 else 1 if aac_p <= b*tf else 2 if aac_p < b*tf + 7.9*10.2 + (2 - pi/2)*10.2**2 else 3
    dg = delta(g, I)
    dl = mid_deflection(gu + .3*qu, [(a, gp + .3*qp)], E*trans['L'][2])
    dt = mid_deflection(.7*qu, [(a, .7*qp)], E*trans['0'][2])
    dslip = .3*(1-eta)*(mid_deflection(gu+qu, [(a, gp+qp)], E*I)-dl-dt)
    ns,ys,is_ = trans['s']
    dsh = (E/ns*be*hc*.0003)*(ys-hc/2)/(E*is_)*L**2/8
    _, _, mqp, xq = beam(gu + .3*qu, [(a, gp + .3*qp)])
    nl, yl, il = trans['L']
    sig = mqp(xq)*(yl - hc)/(nl*il)
    vl = vf/(2*hc)
    as_req = vl*hc/((500/1.15)*2)
    as_prov = pi*10**2/(4*150)
    return dict(P_Rd_kN=p/1000, eta=eta, eta_min=.49,
                M1_Ed_kNm=w1*L**2/8/1e6, M2_Ed_kNm=m2/1e6, x_M_m=xm/1000,
                V2_Ed_kN=v2/1000, M_at_point_load_kNm=ma_p/1e6,
                eta_req=eta_req, n_req=n_req, n_req_point_load=nreq_p,
                connector_flow_kN_m=vf, studs_A=n_a, studs_B=n_b, UR_M_along_span=ur_x,
                studs_to_point_load=n_p, PNA_case_point_load=k_p, sigma_c_bot_MPa=sig,
                M_full_kNm=mf/1e6, M_partial_linear_kNm=mr/1e6,
                M_partial_direct_kNm=direct/1e6, steel_PNA_mm=ya,
                x_c_mm=xc, x_full_mm=xf, eta_flange_boundary=1-2*b*tf/A,
                branches=branches,
                M_cr_kNm=mcr/1e6, M_b_Rd_kNm=chi*ma/1e6,
                UR_LTB=w1*L**2/(8*chi*ma), UR_M2=m2/mr,
                UR_V2=v2/vrd, delta_construction_mm=delta(g+3.75,I),
                delta_locked_mm=dg, delta_long_mm=dl, delta_transient_mm=dt,
                delta_slip_mm=dslip, delta_shrinkage_mm=dsh,
                delta_total_mm=dg+dl+dt+dslip+dsh,
                transverse_required_mm2_m=as_req*1000,
                transverse_provided_mm2_m=as_prov*1000,
                UR_transverse=as_req/as_prov,
                **{f'I_{k}_mm4':v[2] for k,v in trans.items()})


if __name__ == '__main__':
    print(json.dumps(reference(), indent=2))
