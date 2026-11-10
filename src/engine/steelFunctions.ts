/** Adapter into the existing quantity engine. This file runs identically in every worker. */
import { CalculationError } from './CalculationErrors';
import { isVector, QVector, requireScalar, type Value } from './Vector';
import { isDimensionless, isUnit, math, type Quantity } from './UnitSystem';
import { propertyKeys, sectionById, sectionUnits } from '../engineering/steel/sections';
import { designSteel, type SectionGeometry, type SteelInput } from '../engineering/steel/ec3';
import { inputFields, outputFields, stateNumber } from '../engineering/steel/contract';
export const steelFunctionNames = ['sectionProp','steelDesign','entry'] as const;
export type SteelFunctionName = typeof steelFunctionNames[number];
function number(v: Value, unit: string, label: string): number {
  const q = requireScalar(v,label);
  if (!unit) {
    if (!isDimensionless(q)) throw new CalculationError('unit-mismatch',`${label} must be dimensionless`);
    return typeof q === 'number' ? q : q.value!;
  }
  if (!isUnit(q)) throw new CalculationError('unit-mismatch',`${label} requires explicit ${unit}`);
  try { return q.toNumber(unit); } catch { throw new CalculationError('unit-mismatch',`${label} requires ${unit}`); }
}
function qty(n: number, unit: string): Quantity { return unit ? math.unit(n,unit) : n; }
export function evalSteelFunction(fn: SteelFunctionName, args: Value[]): Value {
  try {
    if (fn === 'entry') {
      if (args.length !== 2 || !isVector(args[0])) throw new Error('entry(vector, index): vector required');
      const index = number(args[1],'','Entry index');
      if (!Number.isInteger(index) || index < 0 || index >= args[0].length) throw new Error('Entry index is outside vector (zero based)');
      return args[0].items[index];
    }
    if (fn === 'sectionProp') {
      if (args.length !== 2) throw new Error('sectionProp(sectionID, propertyID) requires two arguments');
      const s=sectionById(number(args[0],'','Section ID')), i=number(args[1],'','Property ID');
      const key=propertyKeys[i];
      if (!key || !Number.isInteger(i)) throw new Error('Unknown section property ID');
      return qty(s.values[key],sectionUnits[key]);
    }
    if (args.length !== 2 || !isVector(args[0]) || !isVector(args[1])) throw new Error('steelDesign(section, inputs) requires quantity vectors');
    const [sv,av]=args;
    if (sv.length !== 16 || av.length !== inputFields.length) throw new Error('Invalid steelDesign contract v1 vector length');
    const s=Object.fromEntries(propertyKeys.slice(0,16).map((k,i)=>[k,number(sv.items[i],sectionUnits[k],k)])) as unknown as SectionGeometry;
    const a=Object.fromEntries(inputFields.map(([k,u],i)=>[k,number(av.items[i],u,k)])) as unknown as SteelInput;
    const r=designSteel(s,a);
    const vals: Record<string,number> = {...r.values, sectionClass:r.sectionClass, flangeClass:r.flangeClass, webClass:r.webClass, governingUr:r.governingUr,state:stateNumber[r.state],governing:r.checks.findIndex(c=>c.name===r.governing)};
    return new QVector([
      ...outputFields.map(([k,u])=>qty(vals[k],u)),
      ...r.checks.flatMap(c=>[c.ur??-1,stateNumber[c.state]]),
    ]);
  } catch (e) {
    if (e instanceof CalculationError) throw e;
    throw new CalculationError('domain',e instanceof Error ? e.message : 'Steel calculation failed');
  }
}
