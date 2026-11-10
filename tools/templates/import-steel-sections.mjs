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
if(new Set(records.map(s=>s.id)).size!==records.length)throw new Error('Duplicate section IDs');
fs.writeFileSync(`${directory}/catalogue.json`,JSON.stringify(records)+'\n');
console.log(`Normalized ${records.length} records`);
