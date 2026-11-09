/**
 * Results for static rendering of one Input & Results case (reports): inside
 * this context, regions show the case's results instead of the worksheet's.
 */
import { createContext } from 'react';
import type { CalculationResult } from '../engine/CalculationEngine';

export const ReportResults = createContext<Record<string, CalculationResult> | null>(null);
