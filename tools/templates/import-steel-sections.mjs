// Offline reproducible normalization. Original units and notices remain in data/.
// IDs depend on pinned source row order: do not replace these files or renumber old records.
import fs from 'node:fs';
const directory='src/engineering/steel/data';
const records=[];
for(const [n,family] of ['IPE','HEA','HEB','HEM'].entries()) {
 const source=JSON.parse(fs.readFileSync(`${directory}/${family}.source.json`,'utf8'));
 for(const [i,p] of source.profiles.entries()) {
  const v={...p.geometry};
  for(const k of ['A','Iy','Iz','Wel_y','Wel_z','Wpl_y','Wpl_z','It','Iw'])v[k]=p.properties[k];
  Object.assign(v,{Avz:p.properties.Avz,Avy:2*v.b*v.tf,mass:p.properties.mass_per_length,iy:p.properties.i_y,iz:p.properties.i_z});
  records.push({id:1000+n*100+i,name:p.designation,family,standard:source.standard,manufacturing:'rolled',source:'Steel_Section_Database (MIT); geometry-derived properties',version:'524172a3',values:v});
 }
}
const [header,...rows]=fs.readFileSync(`${directory}/W.source.csv`,'utf8').trim().split(/\r?\n/).map(l=>l.split(','));
for(const [i,row] of rows.entries()) {
 const a=Object.fromEntries(header.map((k,j)=>[k,row[j]])),v={};
 const map=[['h','d',1],['b','bf',1],['tw','tw',1],['tf','tf',1],['A','area',2],['Iy','Ix',4],['Iz','Iy',4],['Wel_y','Sx',3],['Wel_z','Sy',3],['Wpl_y','Zx',3],['Wpl_z','Zy',3],['It','J',4],['Iw','Cw',6],['iy','rx',1],['iz','ry',1]];
 for(const[k,key,power]of map)v[k]=Number(a[key])*25.4**power;
 Object.assign(v,{r:0,Avy:2*v.b*v.tf,Avz:(v.h-2*v.tf)*v.tw,mass:Number(a.weight)*0.45359237/0.3048});
 records.push({id:2000+i,name:a.shape,family:'W',standard:'AISC shapes (source edition not declared)',manufacturing:'rolled',source:'steelpy (Apache-2.0); AISC properties; r=0 conservative/no fillet credit',version:'060dcd91',values:v});
}
// UB / UC: BS 4-1 dimensions from structuralcodes (Apache-2.0); properties derived from the geometry with
// the same methods as the IPE/HE records (exact contour with four quarter-circle root fillets, It by
// IT_ROLLED_I_FILLET_V1, Iw = tf b³ (h − tf)² / 24, Avz by EN 1993-1-1 §6.2.6(3) with η = 1).
function rolledI({h,b,tw,tf,r}) {
 const hw=h-2*tf, Ar=(1-Math.PI/4)*r*r, ec=r*(10-3*Math.PI)/(12-3*Math.PI);
 const Ic=r**4*(1-5*Math.PI/16)-Ar*ec*ec; // spandrel about its centroid, axis parallel to a straight face
 const A=2*b*tf+hw*tw+4*Ar;
 const Iy=2*(b*tf**3/12+b*tf*((h-tf)/2)**2)+tw*hw**3/12+4*(Ic+Ar*(hw/2-ec)**2);
 const Iz=2*tf*b**3/12+hw*tw**3/12+4*(Ic+Ar*(tw/2+ec)**2);
 const D=((r+tw/2)**2+(r+tf)**2-r*r)/(2*r+tf);
 const It=2/3*(b-0.63*tf)*tf**3+1/3*hw*tw**3+2*(tw/tf)*(0.145+0.1*r/tf)*D**4;
 const round=x=>Number(x.toPrecision(6));
 const v={h,b,tw,tf,r,A,Iy,Iz,Wel_y:2*Iy/h,Wel_z:2*Iz/b,Wpl_y:2*(b*tf*(h-tf)/2+tw*hw*hw/8+2*Ar*(hw/2-ec)),
  Wpl_z:tf*b*b/2+hw*tw*tw/4+4*Ar*(tw/2+ec),It,Iw:tf*b**3*(h-tf)**2/24,Avz:Math.max(A-2*b*tf+(tw+2*r)*tf,hw*tw),Avy:2*b*tf,
  mass:A*7850e-6,iy:Math.sqrt(Iy/A),iz:Math.sqrt(Iz/A)};
 for(const k of Object.keys(v))if(!['h','b','tw','tf','r'].includes(k))v[k]=round(v[k]);
 return v;
}
// BS 4-1 dimensions printed in published examples replace rounded source rows; new rows are appended (IDs stay).
const fix=JSON.parse(fs.readFileSync(`${directory}/BS4-corrections.json`,'utf8'));
for(const [n,family] of ['UB','UC'].entries()) {
 const source=JSON.parse(fs.readFileSync(`${directory}/${family}.source.json`,'utf8'));
 const profiles=[...source.profiles,...(fix.append[family]??[])].map(p=>fix.replace[p.designation]?{...p,geometry:fix.replace[p.designation],fixed:true}:fix.append[family]?.includes(p)?{...p,fixed:true}:p);
 for(const [i,p] of profiles.entries())
  records.push({id:3000+n*500+i,name:p.designation,family,standard:source.standard,manufacturing:'rolled',source:p.fixed?`BS 4-1 dimensions (${fix.source}); geometry-derived properties`:'structuralcodes (Apache-2.0) dimensions; geometry-derived properties',version:'0.7.3',values:rolledI(p.geometry)});
}
if(new Set(records.map(s=>s.id)).size!==records.length)throw new Error('Duplicate section IDs');
fs.writeFileSync(`${directory}/catalogue.json`,JSON.stringify(records)+'\n');
console.log(`Normalized ${records.length} records`);
