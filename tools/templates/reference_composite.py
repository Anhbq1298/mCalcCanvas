"""Independent reference in N, mm, MPa; no canvas/engine imports.
Run: python tools/templates/reference_composite.py > docs/composite-design/reference.json
Geometry/properties are explicit published inputs. The steel PNA is found by numerical
integration of the rolled width (circular root fillets), not by the worksheet's branch formulas.
"""
import json
from math import ceil, pi, sqrt


# Default section: library UB 406x178x60 (BS 4-1 dimensions, geometry-derived properties, catalogue ID 3148)
H, B, TF, TW, RR = 406.4, 177.9, 12.8, 7.9, 10.0
A_LIB, I_LIB, IZ_LIB, WPL_LIB, IT_LIB, IW_LIB, M_LIB = 7648.4, 215841000., 12030400., 1198820., 333949., 465197000000., 60.0399


def width(y):
    """Rolled I-section width at depth y below the top (root fillets as circular arcs)."""
    yy = min(y, H - y)
    if yy < TF:
        return B
    s = yy - TF
    if s < RR:
        return TW + 2 * (RR - sqrt(RR * RR - (RR - s) ** 2))
    return TW


def plastic(nc, a=A_LIB, fy=355., hc=150., be=2000., n=20000):
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
    L, A, fy, E, I = 8000., A_LIB, 355., 210000., I_LIB
    h, hc, be, b, tf = 406.4, 150., 2000., 177.9, 12.8
    g = M_LIB * 9.81 / 1000 + 25 * .15 * 3
    w1 = 1.35 * (g + .5 * 3) + 1.5 * .75 * 3
    w2 = 1.35 * (g + 1.5 * 3) + 1.5 * 3 * 3
    p = min(.8 * 450 * pi * 19**2 / 4 / 1.25,
            .29 * 19**2 * sqrt(30 * 33000) / 1.25)
    nc, na = 24 * p, A * fy
    eta = nc / na
    xf, xc = na / (17 * be), nc / (17 * be)
    ma = WPL_LIB * fy
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
    ncr = pi**2 * E * IZ_LIB / L**2
    mcr = 1.127 * ncr * (sqrt(IW_LIB / IZ_LIB + 81000 * IT_LIB / ncr
                             + (.454 * h / 2)**2) - .454 * h / 2)
    lam = sqrt(ma / mcr)
    phi = .5 * (1 + .34 * (lam - .2) + lam**2)
    chi = min(1, 1 / (phi + sqrt(phi**2 - lam**2)))
    vrd = (A - 2*b*tf + (TW+2*RR)*tf)*fy/sqrt(3)
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
    k_p = 0 if aac_p <= 0 else 1 if aac_p <= b*tf else 2 if aac_p < b*tf + TW*RR + (2 - pi/2)*RR**2 else 3
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
    # propped construction (c_prop = 1, k_LT = 0.5): construction span and LTB length L/2;
    # g0 then acts on the long-term composite section and the slip factor is 0.5
    l1 = .5*L
    ncr1 = pi**2 * E * IZ_LIB / l1**2
    mcr1 = 1.127 * ncr1 * (sqrt(IW_LIB / IZ_LIB + 81000 * IT_LIB / ncr1
                               + (.454 * h / 2)**2) - .454 * h / 2)
    lam1 = sqrt(ma / mcr1)
    phi1 = .5 * (1 + .34 * (lam1 - .2) + lam1**2)
    chi1 = min(1, 1 / (phi1 + sqrt(phi1**2 - lam1**2)))
    dg_p = 5*g*L**4/(384*E*trans['L'][2])
    dslip_p = .5*(1-eta)*(mid_deflection(gu+qu, [(a, gp+qp)], E*I)-dl-dt)
    propped = dict(M1_Ed_kNm=w1*l1**2/8/1e6, UR_LTB=w1*l1**2/(8*chi1*ma),
                   delta_construction_mm=5*(g+3.75)*l1**4/(384*E*I),
                   delta_locked_mm=dg_p, delta_slip_mm=dslip_p,
                   delta_total_mm=dg_p+dl+dt+dslip_p+dsh)
    # SCI P364 Example 8 (533x165x75 UKB S275, L = 12 m, b_eff = 3.0 m, slab 130 mm, C25/30)
    na8, fcd8, h8 = 9520*275., 25/1.5, 529.1
    x8 = na8/(.85*fcd8*3000)
    mpl8 = na8*(130 + h8/2 - x8/2)
    ma8 = 1810e3*275
    nc8 = 2080e3
    aac8 = (9520 - nc8/275)/2
    xc8 = nc8/(.85*fcd8*3080)
    mdir8 = 275*9520*(130 + h8/2) - 2*275*aac8*(130 + aac8/165.9/2) - nc8*xc8/2
    sci = dict(P_c_Rd_kN=.29*19**2*sqrt(25*31000)/1.25/1000, eta_min=1-(355/275)*(.75-.03*12),
               x_c_mm=x8, M_pl_Rd_kNm=mpl8/1e6,
               M_Rd_linear_kNm=(ma8 + 1252/2618*(mpl8 - ma8))/1e6,
               x_pl_mm=aac8/165.9, M_direct_kNm=mdir8/1e6,
               published=dict(P_Rd=73.7, eta_min=.50, x_c=61.5, M_pl_Rd=952.4, M_Rd=715.7, x_pl=5.90, M_direct=903.9))
    # Steel Buildings in Europe, multi-storey Part 4, worked example A.4 (primary beam, IPE 400 S355,
    # L = 9 m, two point loads at 3 m and 6 m, b_eff 2.25 m, slab 140 mm, C25/30)
    ga4 = 66.3*9.81/1000
    f4 = 1.35*62.78e3 + 1.5*45e3
    _, _, m4, x4 = beam(1.35*ga4, [(3000., f4), (6000., f4)], L=9000.)
    v4 = 1.35*ga4*9000/2 + f4
    a4, na4 = 8446., 8446*355.
    nc4 = 1403e3
    aac4 = (a4 - nc4/355)/2
    ya4 = aac4/180
    xc4 = nc4/(.85*25/1.5*2250)
    mdir4 = 355*a4*(140 + 200) - 2*355*aac4*(140 + ya4/2) - nc4*xc4/2
    sbe = dict(M_Ed_kNm=m4(x4)/1e6, V_Ed_kN=v4/1000, M_a_Rd_kNm=1307e3*355/1e6,
               V_pl_Rd_kN=(a4 - 2*180*13.5 + (8.6 + 2*21)*13.5)*355/sqrt(3)/1000,
               eta_min=1-(.75-.03*9), b_eff_mm=2250., P_c_Rd_kN=.29*19**2*sqrt(25*31000)/1.25/1000,
               steel_PNA_mm=ya4, M_direct_kNm=mdir4/1e6,
               published=dict(M_Ed=465.6, V_Ed=156.20, M_a_Rd=463.98, V_pl_Rd=874.97, eta_min=.520,
                              b_eff=2250, P_c_Rd=73.73, steel_PNA=400-388, M_Rd=738.))
    # Solid-slab example (HK lecture notes, CompB-I): UB 457x152x52 S355, L = 12 m, b = 2.8 m, hc = 125 mm,
    # C30/37 (fcd = 20), full connection, PNA in the slab. Section: BS 4-1 table (A 66.6 cm2, Wpl 1096 cm3).
    na5 = 6660*355.; xc5 = na5/(.85*20*2800)
    hk = dict(b_eff_mm=2800., N_a_kN=na5/1000, x_pl_mm=xc5, lever_mm=449.8/2+125-xc5/2,
              M_pl_Rd_kNm=na5*(449.8/2+125-xc5/2)/1e6, M_a_Rd_kNm=1096e3*355/1e6,
              published=dict(b_eff=2800, N_a=2364, lever=325.1, M_pl_Rd=768.5, M_a_Rd=389.0))
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
                propped=propped, sci_p364_example_8=sci, sbe_part4_example_a4=sbe, hk_solid_slab_ub457=hk,
                **{f'I_{k}_mm4':v[2] for k,v in trans.items()})


if __name__ == '__main__':
    print(json.dumps(reference(), indent=2))
