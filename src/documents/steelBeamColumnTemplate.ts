/** EN 1993-1-1:2005 steel beam-column WORKING DRAFT. All modifiers remain designer inputs. */
import { newShapeId } from '../canvas/model/canvasStore';
import { DEFAULT_MATH_PROPS, DEFAULT_TEXT_PROPS, PARAGRAPH_STYLES, type Shape } from '../canvas/model/types';
import { escapeHtml } from '../canvas/sanitize';
import { A4, PAGE_GAP } from '../export/pageGeometry';

export function steelBeamColumnShapes(): Shape[] {
  const shapes: Shape[] = [];
  const y = (p: number, r: number) => (p - 1) * (A4.h + PAGE_GAP) + 60 + 40 * r;
  const T = (p: number, r: number, value: string, heading: 0|1|2 = 0) => {
    const st = PARAGRAPH_STYLES[heading];
    shapes.push({ id: newShapeId(), type: 'text', x: 76, y: y(p,r),
      props: { ...DEFAULT_TEXT_PROPS, w: 650, html: escapeHtml(value), fontSize: heading ? st.fontSize : 13,
        color: heading ? st.color : '#475569', ...(heading ? {heading} : {}) } });
  };
  const M = (p: number, r: number, latex: string, x = 96) => {
    shapes.push({ id: newShapeId(), type: 'math', x, y: y(p,r),
      props: { ...DEFAULT_MATH_PROPS, latex, fontSize: 16, displayMode: 'formulaResult' } });
  };
  T(1,0,'STEEL BEAM-COLUMN | EN 1993-1-1:2005',1);
  T(1,1,'WORKING DRAFT. Compression NEd is positive. Use simultaneous design actions.');
  T(1,2,'Scope: doubly symmetric I/H sections, Class 1-2 ONLY; plastic moduli assumed.');
  T(1,3,'1. MATERIAL AND USER-DEFINED SECTION PROPERTIES',2);
  M(1,4,'f_{y}\\coloneq355\\,\\mathrm{MPa}');
  M(1,4,'E\\coloneq210\\,\\mathrm{GPa}',390);
  M(1,5,'\\gamma_{M0}\\coloneq1');
  M(1,5,'\\gamma_{M1}\\coloneq1',390);
  M(1,6,'A\\coloneq7640\\,\\mathrm{mm}^2');
  M(1,6,'I_{y}\\coloneq110000000\\,\\mathrm{mm}^4',390);
  M(1,7,'I_{z}\\coloneq8600000\\,\\mathrm{mm}^4');
  M(1,7,'W_{pl.y}\\coloneq820000\\,\\mathrm{mm}^3',390);
  M(1,8,'W_{pl.z}\\coloneq175000\\,\\mathrm{mm}^3');
  T(1,9,'2. GEOMETRY / FLEXURAL BUCKLING FACTORS',2);
  M(1,10,'L\\coloneq5\\,\\mathrm{m}');
  M(1,10,'K_{y}\\coloneq1',390);
  M(1,11,'K_{z}\\coloneq1');
  M(1,11,'\\alpha_{y}\\coloneq0.21',390);
  M(1,12,'\\alpha_{z}\\coloneq0.34');
  T(1,13,'Ky, Kz and buckling curves must be independently justified; Annex K is reference only.');
  T(1,14,'3. DESIGN ACTIONS FROM ONE COMBINATION',2);
  M(1,15,'N_{Ed}\\coloneq200\\,\\mathrm{kN}');
  M(1,15,'M_{y.Ed}\\coloneq120\\,\\mathrm{kN}\\cdot\\mathrm{m}',390);
  M(1,16,'M_{z.Ed}\\coloneq10\\,\\mathrm{kN}\\cdot\\mathrm{m}');
  M(1,16,'V_{Ed}\\coloneq40\\,\\mathrm{kN}',390);
  T(1,17,'4. LTB / INTERACTION: USER-VERIFIED COEFFICIENTS',2);
  M(1,18,'M_{cr}\\coloneq400\\,\\mathrm{kN}\\cdot\\mathrm{m}');
  M(1,18,'\\alpha_{LT}\\coloneq0.34',390);
  T(1,19,'Mcr must represent actual loading, lateral restraints, warping and load height.');
  M(1,20,'k_{yy}\\coloneq1');
  M(1,20,'k_{yz}\\coloneq0.6',390);
  M(1,21,'k_{zy}\\coloneq0.8');
  M(1,21,'k_{zz}\\coloneq1',390);
  T(1,22,'kij above are placeholders, not computed Annex A/B coefficients.');
  T(2,0,'5. CROSS-SECTION RESISTANCE — §6.2',2);
  M(2,1,'N_{c.Rd}\\coloneq\\frac{Af_{y}}{\\gamma_{M0}}');
  M(2,2,'M_{y.Rd}\\coloneq\\frac{W_{pl.y}f_{y}}{\\gamma_{M0}}');
  M(2,3,'M_{z.Rd}\\coloneq\\frac{W_{pl.z}f_{y}}{\\gamma_{M0}}');
  M(2,4,'\\mathrm{UR}_{N.section}\\coloneq\\frac{N_{Ed}}{N_{c.Rd}}');
  M(2,5,'\\mathrm{UR}_{M.y}\\coloneq\\frac{M_{y.Ed}}{M_{y.Rd}}');
  M(2,6,'\\mathrm{UR}_{M.z}\\coloneq\\frac{M_{z.Ed}}{M_{z.Rd}}');
  T(2,7,'6. COMPRESSION BUCKLING — §6.3.1',2);
  M(2,8,'L_{cr.y}\\coloneq K_{y}L');
  M(2,8,'L_{cr.z}\\coloneq K_{z}L',390);
  M(2,9,'N_{cr.y}\\coloneq\\frac{\\pi^2EI_{y}}{L_{cr.y}^2}');
  M(2,10,'N_{cr.z}\\coloneq\\frac{\\pi^2EI_{z}}{L_{cr.z}^2}');
  M(2,11,'\\bar{\\lambda}_{y}\\coloneq\\sqrt{\\frac{Af_{y}}{N_{cr.y}}}');
  M(2,12,'\\bar{\\lambda}_{z}\\coloneq\\sqrt{\\frac{Af_{y}}{N_{cr.z}}}');
  M(2,13,'\\Phi_{y}\\coloneq0.5(1+\\alpha_{y}(\\bar{\\lambda}_{y}-0.2)+\\bar{\\lambda}_{y}^2)');
  M(2,14,'\\Phi_{z}\\coloneq0.5(1+\\alpha_{z}(\\bar{\\lambda}_{z}-0.2)+\\bar{\\lambda}_{z}^2)');
  M(2,15,'\\chi_{y}\\coloneq\\min(1,\\frac{1}{\\Phi_{y}+\\sqrt{\\Phi_{y}^2-\\bar{\\lambda}_{y}^2}})');
  M(2,16,'\\chi_{z}\\coloneq\\min(1,\\frac{1}{\\Phi_{z}+\\sqrt{\\Phi_{z}^2-\\bar{\\lambda}_{z}^2}})');
  M(2,17,'N_{b.y.Rd}\\coloneq\\frac{\\chi_{y}Af_{y}}{\\gamma_{M1}}');
  M(2,18,'N_{b.z.Rd}\\coloneq\\frac{\\chi_{z}Af_{y}}{\\gamma_{M1}}');
  M(2,19,'\\mathrm{UR}_{N.buckling}\\coloneq\\max(\\frac{N_{Ed}}{N_{b.y.Rd}},\\frac{N_{Ed}}{N_{b.z.Rd}})');
  T(2,20,'7. LATERAL-TORSIONAL BUCKLING — §6.3.2',2);
  M(2,21,'\\bar{\\lambda}_{LT}\\coloneq\\sqrt{\\frac{W_{pl.y}f_{y}}{M_{cr}}}');
  M(2,22,'\\Phi_{LT}\\coloneq0.5(1+\\alpha_{LT}(\\bar{\\lambda}_{LT}-0.2)+\\bar{\\lambda}_{LT}^2)');
  M(2,23,'\\chi_{LT}\\coloneq\\min(1,\\frac{1}{\\Phi_{LT}+\\sqrt{\\Phi_{LT}^2-\\bar{\\lambda}_{LT}^2}})');
  M(2,24,'M_{b.Rd}\\coloneq\\frac{\\chi_{LT}W_{pl.y}f_{y}}{\\gamma_{M1}}');
  T(3,0,'8. COMBINED COMPRESSION AND BIAXIAL BENDING — §6.3.3',2);
  T(3,1,'Obtain kij from Annex A/B for actual moment diagram and torsional susceptibility.');
  M(3,2,'N_{Rk}\\coloneq Af_{y}');
  M(3,3,'M_{y.Rk}\\coloneq W_{pl.y}f_{y}');
  M(3,4,'M_{z.Rk}\\coloneq W_{pl.z}f_{y}');
  M(3,5,'\\mathrm{UR}_{6.61}\\coloneq\\frac{N_{Ed}}{\\chi_{y}N_{Rk}/\\gamma_{M1}}+k_{yy}\\frac{M_{y.Ed}}{\\chi_{LT}M_{y.Rk}/\\gamma_{M1}}+k_{yz}\\frac{M_{z.Ed}}{M_{z.Rk}/\\gamma_{M1}}');
  M(3,8,'\\mathrm{UR}_{6.62}\\coloneq\\frac{N_{Ed}}{\\chi_{z}N_{Rk}/\\gamma_{M1}}+k_{zy}\\frac{M_{y.Ed}}{\\chi_{LT}M_{y.Rk}/\\gamma_{M1}}+k_{zz}\\frac{M_{z.Ed}}{M_{z.Rk}/\\gamma_{M1}}');
  T(3,11,'9. PRELIMINARY UTILISATION — NOT DESIGN CERTIFICATION',2);
  M(3,12,'\\mathrm{UR}_{member}\\coloneq\\max(\\mathrm{UR}_{6.61},\\mathrm{UR}_{6.62})');
  T(3,13,'DO NOT ISSUE AS PASS: confirm section class, N-M, shear/M interaction,');
  T(3,14,'shear buckling, torsional buckling, correct kij, Mcr and SLS limits.');
  T(3,16,'ANNEX K — REFERENCE END CONDITIONS ONLY',2);
  T(3,17,'Pinned-pinned K=1.0; fixed-fixed K=0.5; fixed-pinned K≈0.7.');
  T(3,18,'Fixed-free K=2.0; fixed-guided K=1.0. Ideal elastic members only.');
  T(3,19,'Actual frame sway, connection stiffness, intermediate restraints affect K.');
  T(3,20,'These reference values DO NOT update Ky or Kz on the main sheet.');
  T(3,21,'LTB boundary factors and warping restraints are separate from Ky and Kz.');
  T(3,23,'Reference: EN 1993-1-1:2005 §§6.2/6.3, Annex A/B, applicable National Annex.');
  return shapes;
}
