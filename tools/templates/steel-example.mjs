// Generate the portable example from the same production template; never hand-edit the JSON.
import {createServer} from 'vite';
import fs from 'node:fs';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const {steelBeamColumnTemplate}=await server.ssrLoadModule('/src/documents/steelBeamColumnTemplate.ts');
  const {DEFAULT_SETTINGS,DOCUMENT_VERSION}=await server.ssrLoadModule('/src/documents/DocumentTypes.ts');
  const {serializeDocument}=await server.ssrLoadModule('/src/documents/DocumentSerializer.ts');
  const doc=steelBeamColumnTemplate(), ids=new Map(doc.shapes.map((s,i)=>[s.id,`ec3_${i}`]));
  doc.shapes.forEach(s=>s.id=ids.get(s.id));
  for(const col of [...doc.inputResult.inputs,...doc.inputResult.outputs])col.regionId=ids.get(col.regionId);
  const time='2026-11-10T00:00:00.000Z';
  fs.writeFileSync('templates/Steel_Beam_Column_EC3.mCCV',serializeDocument({format:'calccanvas',id:'ec3-steel-beam-column-example',version:DOCUMENT_VERSION,title:'Steel Beam-Column Design',metadata:{project:'EC3 validation example',calculationReference:'EC3-001',revision:'A'},settings:{...DEFAULT_SETTINGS,optimizePrintLayout:true},...doc,createdAt:time,updatedAt:time}));
  console.log('Generated templates/Steel_Beam_Column_EC3.mCCV');
}finally{await server.close();}
