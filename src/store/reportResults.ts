/**
 * Results for static rendering of one Input & Results case (reports): inside
 * this context, regions show the case's results instead of the worksheet's.
 */
import { createContext } from 'react';
import type { CalculationResult } from '../engine/CalculationEngine';
import type { Shape } from '../canvas/model/types';

export const ReportResults = createContext<Record<string, CalculationResult> | null>(null);
/** The planned print geometry, used for annex numbers and destination-page references. */
export const ReportShapes = createContext<Record<string, Shape> | null>(null);
