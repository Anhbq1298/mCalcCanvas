import { describe, expect, it } from 'vitest';
import { CalculationEngine } from '../../engine';
import { matrixFunctionNames } from '../../engine/matrixNames';
import { step } from '../step';
const mat = (data: number[][]) => `\\begin{bmatrix}${data.map((r) => r.join('&')).join('\\\\')}\\end{bmatrix}`;
const call = (fn: string, ...args: (string | number)[]) => `\\operatorname{${fn}}(${args.join(',')})`;
function setup(expressions: Record<string, string>) {
  const e = new CalculationEngine();
  e.batch(() => Object.entries(expressions).forEach(([id, latex]) => e.setRegion(id, { latex })));
  return e;
}
function val(e: CalculationEngine, id: string) {
  const r = e.getResult(id)!;
  expect(r.status, `${id}: ${r.error?.message}`).toBe('valid');
  return r.value!;
}
const close = (actual: readonly number[] | undefined, expected: readonly number[], precision = 9) => {
  expect(actual).toHaveLength(expected.length);
  actual!.forEach((x, i) => expect(x).toBeCloseTo(expected[i], precision));
};
const a = mat([[4, 1], [1, 3]]);

describe('complete matrix function gallery', () => {
  it('computes advanced functions and exposes usable factor arrays', () => {
    step('LU, pivoted QR, unpivoted QR and Cholesky reconstruct the original matrix', () => {
      const e = setup({
        a: `A\\coloneq${a}`, l: `D\\coloneq${call('LU', 'A')}`,
        lp: `${call('at','D',0)} A=`, lu: `${call('at','D',1)} ${call('at','D',2)}=`,
        q: `Q\\coloneq${call('QR','A')}`, qp: `A ${call('at','Q',0)}=`, qr: `${call('at','Q',1)} ${call('at','Q',2)}=`,
        q0: `R\\coloneq${call('QR','A',0)}`, qr0: `${call('at','R',0)} ${call('at','R',1)}=`,
        ch: `C\\coloneq${call('Cholesky','A')}`, cp: `${call('at','C',0)}^{T} A ${call('at','C',0)}=`, cc: `${call('at','C',1)} ${call('at','C',1)}^{T}=`,
        ch0: `H\\coloneq${call('Cholesky','A',0,1)}`, cc0: 'H^{T}H=',
        length: call('length','D')+'=', scalar: call('IsScalar','D')+'=',
      });
      close(val(e,'lp').items, val(e,'lu').items!);
      close(val(e,'qp').items, val(e,'qr').items!);
      close(val(e,'qr0').items,[4,1,1,3]);
      close(val(e,'cp').items, val(e,'cc').items!);
      close(val(e,'cc0').items,[4,1,1,3]);
      expect(val(e,'length').number).toBe(3);
      expect(val(e,'scalar').number).toBe(0);
      expect(val(e,'l').dimension).toBe('nested');
      for (const data of [[[0,2,1],[1,3,4],[2,1,0]], [[1,2],[2,4],[3,6]], [[1,2,3],[4,5,6]]]) {
        const x = setup({a:`A\\coloneq${mat(data)}`,l:`L\\coloneq${call('LU','A')}`,p:`${call('at','L',0)} A=`,r:`${call('at','L',1)} ${call('at','L',2)}=`,q:`Q\\coloneq${call('QR','A')}`,p0:`A ${call('at','Q',0)}=`,r0:`${call('at','Q',1)} ${call('at','Q',2)}=`});
        close(val(x,'p').items,val(x,'r').items!); close(val(x,'p0').items,val(x,'r0').items!);
      }
    });
    step('SVD and pseudo-inverse satisfy reconstruction and Moore–Penrose identities', () => {
      for (const data of [[[3,0],[0,4],[0,0]], [[1,2],[2,4],[3,6]], [[0,0],[0,0]], [[1,2,3],[4,5,6]]]) {
        const e = setup({a:`A\\coloneq${mat(data)}`,s:`S\\coloneq${call('svd','A')}`,rec:`${call('at','S',1)} ${call('diag',call('at','S',0))} ${call('at','S',2)}=`,p:`P\\coloneq${call('geninv','A')}`,apa:'A P A=',pap:'P A P=',uv:`${call('at','S',1)}^{T} ${call('at','S',1)}=`});
        close(val(e,'rec').items,data.flat());
        close(val(e,'apa').items,data.flat());
        close(val(e,'pap').items,val(e,'p').items!);
        const k = Math.min(data.length,data[0].length);
        close(val(e,'uv').items,Array.from({length:k*k},(_,i)=>Math.floor(i/k)===i%k?1:0));
      }
      close(val(setup({s:call('svds',mat([[3,0],[0,4],[0,0]]))+'='}),'s').items,[4,3]);
    });
    step('eigenpairs and generalized eigenpairs match independent diagonal and symmetric references', () => {
      const e=setup({a:`A\\coloneq${a}`,v:`V\\coloneq${call('eigenvecs','A')}`,s:`s\\coloneq${call('eigenvals','A')}`,av:'A V=',vl:`V ${call('diag','s')}=`,one:call('eigenvec',mat([[2,0],[0,5]]),5)+'=',b:`B\\coloneq${mat([[2,0],[0,1]])}`,g:`g\\coloneq${call('genvals','A','B')}`,gv:`G\\coloneq${call('genvecs','A','B')}`,ga:'A G=',gb:`B G ${call('diag','g')}=`,tr:call('tr','A')+'=',left:`W\\coloneq${call('eigenvecs','A','\\mathrm{L}')}`,la:'W^{T} A=',lb:`${call('diag','s')} W^{T}=`});
      close(val(e,'s').items,[(7+Math.sqrt(5))/2,(7-Math.sqrt(5))/2]);
      close(val(e,'av').items,val(e,'vl').items!);
      close(val(e,'one').items!.map(Math.abs),[0,1]);
      close(val(e,'g').items,[(5+Math.sqrt(3))/2,(5-Math.sqrt(3))/2]);
      close(val(e,'ga').items,val(e,'gb').items!);
      close(val(e,'la').items,val(e,'lb').items!);
      expect(val(e,'tr').number).toBe(7);
    });
    step('matrix norms and condition numbers use the selected norm', () => {
      const d=mat([[3,0],[0,4]]);
      const e=setup(Object.fromEntries(['norm1','norm2','norme','normi','cond1','cond2','conde','condi'].map((fn)=>[fn,call(fn,d)+'='])));
      for(const fn of ['norm1','norm2','normi']) expect(val(e,fn).number).toBeCloseTo(4);
      expect(val(e,'norme').number).toBeCloseTo(5);
      for(const fn of ['cond1','cond2','condi']) expect(val(e,fn).number).toBeCloseTo(4/3);
      expect(val(e,'conde').number).toBeCloseTo(25/12);
      expect(val(setup({x:call('norm1',call('ones',1000,1))+'='}),'x').number).toBe(1000);
    });
    step('type, length, ranking, spacing and Kronecker helpers compute real arrays', () => {
      const e=setup({v:`v\\coloneq${mat([[30],[10],[10],[20]])}`,rank:call('Rank','v')+'=',len:call('length','v')+'=',last:call('last','v')+'=',arr:call('IsArray','v')+'=',scalar:call('IsScalar',2)+'=',log:call('logspace',1,100,3)+'=',pts:call('logpts',-1,1,9)+'=',k:call('kronecker',mat([[1,2]]),mat([[3],[4]]))+'='});
      close(val(e,'rank').items,[4,1.5,1.5,3]);expect(val(e,'len').number).toBe(4);expect(val(e,'last').number).toBe(3);expect(val(e,'arr').number).toBe(1);expect(val(e,'scalar').number).toBe(1);
      close(val(e,'log').items,[1,10,100]);close(val(e,'pts').items,[.1,.2,.3,.4,.5,.6,.7,.8,.9]);close(val(e,'k').items,[3,6,4,8]);
    });
    step('lookup variants handle repeated matches, matrix coordinates and modifiers', () => {
      const table=mat([[0,10,20],[1,11,12],[2,21,22]]);
      const e=setup({t:`T\\coloneq${table}`,h:call('hlookup',20,'T',2)+'=',v:call('vlookup',2,'T',1)+'=',vh:call('vhlookup',2,20,'T')+'=',lookup:call('lookup',2,mat([[2,3],[2,2]]),mat([[10,20],[30,40]]))+'=',m:`M\\coloneq${call('match',2,mat([[2,3],[2,2]]))}`,coord:call('at','M',1)+'=',gt:call('lookup',1,mat([[1],[2],[3]]),mat([[10],[20],[30]]),'\\mathrm{gt}')+'=',near:call('hlookup',19,'T',2,'\\mathrm{near}')+'='});
      close(val(e,'h').items,[22]);close(val(e,'v').items,[21]);close(val(e,'vh').items,[22]);close(val(e,'lookup').items,[10,30,40]);close(val(e,'coord').items,[1,0]);close(val(e,'gt').items,[20,30]);close(val(e,'near').items,[22]);
    });
    step('convolution, correlation, boundary handling and deconvolution are usable in 1D and 2D', () => {
      const v=call('seq',1,3),k=call('ones',1,3);
      const e=setup({v:`v\\coloneq${v}`,k:`k\\coloneq${k}`,c:`c\\coloneq${call('convolve','v','k')}`,back:call('deconvolve','c','k')+'=',r:call('crosscorr','v',mat([[1,2,3]]))+'=',circular:call('convolve','v','k',1)+'=',reflection:call('convolve','v','k',2)+'=',continue:call('convolve','v','k',3)+'=',two:call('convolve',mat([[1,2],[3,4]]),mat([[1]]))+'='});
      close(val(e,'c').items,[3,6,5]);close(val(e,'back').items,[1,2,3]);close(val(e,'r').items,[8,14,8]);close(val(e,'circular').items,[6,6,6]);close(val(e,'reflection').items,[4,6,8]);close(val(e,'continue').items,[4,6,8]);close(val(e,'two').items,[1,2,3,4]);
    });
    step('callbacks generate matrix cells and select lookup matches', () => {
      const e=setup({f:'f(i,j)\\coloneq i+10j',m:call('matrix',2,3,'f')+'=',cmp:'g(a,b)\\coloneq\\mathrm{if}(b>a,1,0)',l:call('lookup',1,mat([[1],[2],[3]]),mat([[10],[20],[30]]),'g')+'=',numbered:'norm2('+a+')='});
      close(val(e,'m').items,[0,10,20,1,11,21]);
      close(val(e,'l').items,[20,30]);
      expect(val(e,'numbered').number).toBeCloseTo((7+Math.sqrt(5))/2);
      close(val(setup({s:call('svds',mat([[1,2],[3,4]]))+'='}),'s').items,[5.464985704219043,0.365966190626258]);
    });
    step('factor units, singular/complex domain errors and gallery coverage are explicit', () => {
      const e=setup({a:`A\\coloneq${a}\\mathrm{kN}/\\mathrm{m}`,s:call('svds','A')+'=',p:call('geninv','A')+'=',ev:call('eigenvals','A')+'='});
      expect(val(e,'s').dimension).toBe(val(e,'ev').dimension);
      expect(val(e,'p').dimension).not.toBe(val(e,'s').dimension);
      for(const expression of [call('Cholesky',mat([[1,2],[2,1]])),call('cond2',mat([[1,2],[2,4]])),call('eigenvals',mat([[0,-1],[1,0]])),call('lookup',99,mat([[1]]),mat([[2]])),call('at',call('LU',a),3)]) expect(setup({x:expression+'='}).getResult('x')!.status,expression).toBe('error');
      const newlySupported=['Cholesky','LU','QR','svd','svds','geninv','eigenvals','eigenvec','eigenvecs','genvals','genvecs','norm1','norm2','norme','normi','cond1','cond2','conde','condi','tr','IsArray','IsScalar','last','length','Rank','logpts','logspace','kronecker','lookup','hlookup','vlookup','vhlookup','match','convolve','crosscorr','deconvolve'];
      for(const fn of newlySupported) expect(matrixFunctionNames).toContain(fn);
    });
  });
});
