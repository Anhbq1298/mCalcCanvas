/** Built-in steel section library lookup for worksheets: sectionProp(sectionID, propertyIndex) → quantity. */
import { CalculationError } from './CalculationErrors';
import { requireScalar, type Value } from './Vector';
import { isDimensionless, math, siValue, type Quantity } from './UnitSystem';
import { propertyKeys, sectionById, sectionUnits } from '../engineering/steel/sections';

export const steelFunctionNames = ['sectionProp'] as const;
export type SteelFunctionName = (typeof steelFunctionNames)[number];

function plainNumber(v: Value, label: string): number {
  const q = requireScalar(v, label);
  if (!isDimensionless(q)) throw new CalculationError('unit-mismatch', `${label} must be dimensionless`);
  return siValue(q);
}

export function evalSteelFunction(_fn: SteelFunctionName, args: Value[]): Value {
  if (args.length !== 2) throw new CalculationError('domain', 'sectionProp(sectionID, propertyIndex) takes two arguments');
  const id = plainNumber(args[0], 'Section ID');
  const i = plainNumber(args[1], 'Property index');
  const key = Number.isInteger(i) ? propertyKeys[i] : undefined;
  if (!key) throw new CalculationError('domain', 'Unknown section property index');
  let section;
  try {
    section = sectionById(id);
  } catch (e) {
    throw new CalculationError('domain', (e as Error).message);
  }
  const unit = sectionUnits[key];
  return (unit ? math.unit(section.values[key], unit) : section.values[key]) as Quantity;
}
