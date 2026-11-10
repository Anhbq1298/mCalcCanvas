/** Engineering sketches use separate axes, loads, restraints and diagrams.
 * Blue moment diagrams are drawn on the tension side; no arbitrary curve is shown for unknown cases.
 */
import { ltbCoefficientCases, type LtbCoefficientCase } from '../../engineering/steel/ltbCases';
const ink='#334155', blue='#2563eb';
const number=(n:number)=>Number.isFinite(n)?Number(n.toPrecision(4)).toString():'—';
function PinRoller({left=70,right=470,y=70}:{left?:number;right?:number;y?:number}) {
  return <g stroke={ink} fill="white" strokeWidth="1.5">
    <path d={`M${left} ${y}l-9 15h18Z M${left-15} ${y+20}h30`}/>
    <path d={`M${right} ${y}l-9 15h18Z`}/><circle cx={right-5} cy={y+18} r="2.5"/><circle cx={right+5} cy={y+18} r="2.5"/><path d={`M${right-15} ${y+23}h30`}/>
  </g>;
}
function Couple({x,y,clockwise=false,label}:{x:number;y:number;clockwise?:boolean;label:string}) {
  return <g transform={`translate(${x},${y})`} stroke={blue} fill="none" strokeWidth="1.6">
    <path d={clockwise?'M-12 11A17 17 0 1 1 12 11':'M12 11A17 17 0 1 0-12 11'}/>
    <path d={clockwise?'M12 11l1-9m-1 9l-9-2':'M-12 11l-1-9m1 9l9-2'}/>
    <text x="-22" y="-26" fill={ink} stroke="none" fontSize="10">{label}</text>
  </g>;
}
export function SectionProfile({h,b,tw,tf}:{h:number;b:number;tw:number;tf:number}) {
  const scale=118/Math.max(h,b),w=b*scale,d=h*scale,f=tf*scale,web=tw*scale,x=110-w/2,y=82-d/2;
  return <svg role="img" aria-label="Doubly symmetric I/H section profile" viewBox="0 0 240 170" width="240" height="170">
    <path d={`M${x} ${y}h${w}v${f}h${-(w-web)/2}v${d-2*f}h${(w-web)/2}v${f}h${-w}v${-f}h${(w-web)/2}v${-(d-2*f)}h${-(w-web)/2}Z`} fill="#eff6ff" stroke={ink} strokeWidth="1.5"/>
    <path d="M22 82H190M110 10V148" stroke="#94a3b8" strokeDasharray="4 3"/>
    <text x="190" y="77" fontSize="11">y</text><text x="116" y="13" fontSize="11">z</text>
    <path d={`M${x+w+14} ${y}v${d}m-4 0h8m-8-${d}h8 M${x} ${y+d+13}h${w}m0-4v8m-${w}-8v8`} stroke={ink} fill="none"/>
    <text x={x+w+23} y="87" fontSize="10">h={number(h)}</text>
    <text x="64" y="165" fontSize="10">b={number(b)} mm</text>
  </svg>;
}
export function LtbDiagram({loadCase=0,height=0,length=5000,k=1,kw=1,actions}:{loadCase?:number;height?:number;length?:number;k?:number;kw?:number;actions?:number[]}) {
  const names=['Uniform end moments','Full-span UDL','Central point load','End-moment gradient','Custom moment diagram','Combined loading'];
  const actual=actions&&loadCase===0&&actions[3]===0&&actions[4]===0;
  const [N=0,My=0,Mz=0,,,memberLength=length]=actions??[];
  const model=loadCase<=2;
  return <svg role="img" aria-label="LTB loading and moment diagram" data-load-case={loadCase} data-load-height={height} viewBox="0 0 626 268" width="606" height="260">
    <text x="15" y="14" fontSize="11" fill={ink}>{actual?'ULS model — equal end couples, constant N / My / Mz':`LTB segment model — ${names[loadCase]??'external analysis'}`}</text>
    <path d="M70 70H470" stroke={ink} strokeWidth="3"/><PinRoller/>
    {loadCase===0&&<><Couple x={70} y={52} label={actual?`${number(My)} kNm`:'M'} /><Couple x={470} y={52} clockwise label={actual?`${number(My)} kNm`:'M'} />
      {actual&&<g stroke={blue} strokeWidth="1.6"><path d="M20 70H57l-7-4m7 4l-7 4M520 70H483l7-4m-7 4l7 4"/><text x="226" y="47" fontSize="11" stroke="none" fill={ink}>N = {number(N)} kN</text></g>}
    </>}
    {(loadCase===1?[85,130,175,220,265,310,355,400,445]:loadCase===2?[270]:[]).map(x=><path key={x} d={`M${x} 31v32m-4-7l4 7 4-7`} fill="none" stroke={blue} strokeWidth="1.4"/>)}
    {loadCase===1&&<path d="M85 31H445" stroke={blue}/>}
    {loadCase===1||loadCase===2?<text x="230" y="26" fontSize="10">{loadCase===1?'q (coefficient model)':'P (coefficient model)'}</text>:null}
    {!model&&<text x="85" y="51" fontSize="11" fill="#b45309">Loading / reactions are defined by the referenced analysis.</text>}
    <path d="M70 106H470m-400-4v8m400-8v8" stroke={ink}/>
    <text x="200" y="120" fontSize="10">{actual?`Member L = ${number(memberLength)} mm`:`Segment Lb = ${number(length)} mm`}</text>
    <text x="15" y="144" fontSize="10">My diagram</text><path d="M105 139H470" stroke="#94a3b8" strokeDasharray="3 3"/>
    {model?<path d={loadCase===0?'M105 139V166H470V139Z':loadCase===1?'M105 139Q287.5 193 470 139Z':'M105 139L287.5 166L470 139Z'} fill="#dbeafe" stroke={blue} strokeWidth="1.4"/>:<text x="110" y="159" fontSize="10" fill="#b45309">No moment shape assumed — provide verified coefficients / external Mcr.</text>}
    {model&&<text x="240" y="181" fontSize="10">{actual?`${number(My)} kNm (constant)`:'Normalized shape; positive moment below baseline'}</text>}
    {actual?<><text x="15" y="199" fontSize="10">Mz diagram</text><path d="M105 194V212H470V194" fill="#e0e7ff" stroke={blue}/><text x="250" y="226" fontSize="10">{number(Mz)} kNm (constant); Vy = Vz = 0</text></>:<text x="15" y="203" fontSize="10">{actions?'Entered ULS actions are independent analysis results; this is only the LTB idealization.':'Fork ends: lateral displacement and twist restrained; warping free for k=kw=1.'}</text>}
    <text x="15" y="248" fontSize="10">Lb = {number(length)} mm; k = {number(k)}; kw = {number(kw)}; zg = {number(height)} mm</text>
    {loadCase===0?<text x="485" y="142" fontSize="9">End couples:</text>:<text x="490" y="142" fontSize="9">Load level</text>}
    <g transform="translate(545 184)">
      <path d="M-20-30H20v4H2v52h18v4h-40v-4h18v-52h-18Z" fill="#eff6ff" stroke={ink}/>
      <path d="M-30 0H30" stroke="#94a3b8" strokeDasharray="3 3"/>
      {loadCase!==0&&<><path d={`M0 ${-Math.max(-30,Math.min(30,height/6))-22}v20l-4-6m4 6l4-6`} stroke={blue} fill="none"/><circle cy={-Math.max(-30,Math.min(30,height/6))} r="2" fill={blue}/></>}
    </g>
    <text x="492" y="229" fontSize="9">{loadCase===0?'no transverse load':'zg signed; inset schematic'}</text>
    {!actual&&<text x="15" y="264" fontSize="9">Positive zg is destabilizing only for loading towards the shear centre. Reverse load: review its sign.</text>}
  </svg>;
}
function ltbPanelDiagram(c:LtbCoefficientCase) {
  const left=25,right=177,beamY=31,base=83;
  const fixed=c.diagram==='udl-fixed'||c.diagram==='point-fixed';
  const psi=c.psi??1;
  const momentPath=c.diagram==='end-moments'
    ? 'M'+left+' '+base+'L'+left+' '+(base+24)+'L'+right+' '+(base+24*psi)+'L'+right+' '+base+'Z'
    : c.diagram==='udl-simple'?'M25 83Q101 123 177 83Z'
    : c.diagram==='point-simple'?'M25 83L101 108L177 83Z'
    : c.diagram==='udl-fixed'?'M25 83L25 69C59 69 79 90 101 90C123 90 143 69 177 69L177 83Z'
    :'M25 83L25 69L101 98L177 69L177 83Z';
  return <g>
    {fixed?<g stroke={ink} fill="none"><path d="M20 20V44m-6-24 6 5 6-5m-12 8 12 0m-12 6 12 0m-12 6 12 0M182 20V44m-6-24 6 5 6-5m-12 8 12 0m-12 6 12 0m-12 6 12 0" strokeWidth="1"/></g>
      :<g stroke={ink} fill="white"><path d="M25 31l-8 12h16ZM177 31l-8 12h16Z"/><path d="M13 45h24m152 0h-24"/></g>}
    <path d={'M'+left+' '+beamY+'H'+right} stroke={ink} strokeWidth="2.5"/>
    {c.diagram==='end-moments'?<g stroke={blue} fill="none" strokeWidth="1.1">
      <path d="M31 29a7 7 0 1 1 10 1m-10-1 4-4m-4 4 5 1M171 29a7 7 0 1 0-10 1m10-1-4-4m4 4-5 1"/>
      <text x="25" y="18" fill={ink} stroke="none" fontSize="7">M</text><text x="165" y="18" fill={ink} stroke="none" fontSize="7">ψM</text>
    </g>:c.diagram==='udl-simple'||c.diagram==='udl-fixed'?<g stroke={blue} fill="none" strokeWidth="1">
      <path d="M31 13H171"/>{[40,62,84,106,128,150,170].map(x=><path key={x} d={'M'+x+' 14v12m-3-4 3 4 3-4'}/>)}
    </g>:<g stroke={blue} fill="none" strokeWidth="1.1"><path d="M101 10v17m-4-5 4 5 4-5"/><text x="95" y="9" fill={ink} stroke="none" fontSize="7">P</text></g>}
    <path d={'M25 '+base+'H177M25 '+(base-3)+'v6m152-6v6'} stroke="#94a3b8" strokeWidth=".8"/>
    <path d={momentPath} fill="#dbeafe" stroke={blue} strokeWidth="1.1"/>
  </g>;
}

/** One-page, numbered selection sheet for every discrete SN003b Table 3.1/3.2 case. */
export function LtbCoefficientCatalog({selectedCase=1}:{selectedCase?:number}) {
  const cols=3,cellW=208,cellH=142;
  return <svg role="img" aria-label="LTB coefficient cases 1 to 13" data-selected-case={Math.round(selectedCase)} viewBox="0 0 634 720" width="634" height="720">
    {ltbCoefficientCases.map((c,i)=>{
      const x=6+(i%cols)*cellW,y=6+Math.floor(i/cols)*cellH;
      const selected=c.id===Math.round(selectedCase);
      const title=c.id<=9?'End moments  ψ='+c.psi!.toFixed(2):c.name.replace('Simply supported, ','SS · ').replace('Fixed-ended, ','Fixed · ');
      return <g key={c.id} transform={'translate('+x+','+y+')'}>
        <rect width="202" height="134" rx="2" fill={selected?'#eff6ff':'white'} stroke={selected?blue:'#cbd5e1'} strokeWidth={selected?2:1}/>
        <text x="7" y="13" fontSize="9" fontWeight="600" fill={selected?'#1d4ed8':ink}>{c.id}. {title}</text>
        {ltbPanelDiagram(c)}
        <text x="12" y="126" fontSize="8.5" fill={ink}>C1 = {c.c1.toFixed(c.c1%1===0?2:3)}   C2 = {c.c2.toFixed(3)}</text>
      </g>;
    })}
  </svg>;
}
export function SlsDiagram({mode,q,P,length}:{mode:number;q:number;P:number;length:number}) {
  const external=mode===2;
  return <svg role="img" aria-label="Separate serviceability load case" viewBox="0 0 626 112" width="606" height="108">
    <text x="15" y="13" fontSize="10">{external?'External displacement supplied':`SLS: q = ${number(Math.abs(q))} kN/m; P = ${number(Math.abs(P))} kN; L = ${number(length)} mm`}</text>
    {!external&&<><path d="M70 66H530" stroke={ink} strokeWidth="3"/>
      {mode===0?<PinRoller left={70} right={530} y={66}/>:<g stroke={ink}><path d="M70 36V94" strokeWidth="3"/>{[40,50,60,70,80,90].map(y=><path key={y} d={`M70 ${y}l-9 7`}/>)}</g>}
      {q!==0&&[95,150,205,260,315,370,425,480,515].map(x=><path key={x} d={`M${x} 27v31m-4-6l4 6 4-6`} stroke={blue} fill="none"/>)}
      {P!==0&&<path d={`M${mode===0?300:530} 18v40m-5-7l5 7 5-7`} stroke="#b45309" fill="none"/>}
      <text x="226" y="106" fontSize="10">{mode===0?'Simply supported; P at midspan':'Cantilever; P at free end'}</text>
    </>}
    {external&&<text x="15" y="50" fontSize="11">No support or loading scheme is inferred from an external displacement result.</text>}
  </svg>;
}
export function BucklingReference() {
  const beta=4.493409457909064;
  const mode=(i:number,t:number)=>i===0?Math.sin(Math.PI*t):i===1?(1-Math.cos(2*Math.PI*t))/2:i===2?Math.sin(beta*t)-beta*t+beta*(1-Math.cos(beta*t)):i===3?1-Math.cos(Math.PI*t/2):(1-Math.cos(Math.PI*t))/2;
  return <svg role="img" aria-label="Idealized buckling end conditions" viewBox="0 0 630 184" width="606" height="177">
    {['Pin–pin','Fixed–fixed','Fixed–pin','Fixed–free','Fixed–guided'].map((name,i)=>{
      const samples=Array.from({length:61},(_,j)=>mode(i,j/60)),max=Math.max(...samples.map(Math.abs));
      const d=samples.map((u,j)=>`${j?'L':'M'}${52+30*u/max},${130-j*1.6}`).join('');
      return <g key={name} transform={`translate(${i*126},0)`}>
        <path d="M52 34V130" stroke={ink} strokeWidth="1.5"/><path d={d} fill="none" stroke={blue} strokeDasharray="4 3"/>
        {i===0?<path d="M52 130l-8 10h16Z" stroke={ink} fill="white"/>:<path d="M36 134h32m-32 5h32" stroke={ink}/>}
        {i===0||i===2?<path d="M52 34l-8-10h16Z" stroke={ink} fill="white"/>:i===1?<path d="M36 30h32m-32-5h32" stroke={ink}/>:i===4?<><path d="M36 30h32m-32-5h32" stroke={ink}/><text x="81" y="24" fontSize="16">↔</text></>:<circle cx="52" cy="34" r="2" fill={ink}/>}
        <text x="3" y="160" fontSize="11">{name}</text><text x="25" y="177" fontSize="11">K={['1.0','0.5','0.699','2.0','1.0'][i]}</text>
      </g>;
    })}
  </svg>;
}
