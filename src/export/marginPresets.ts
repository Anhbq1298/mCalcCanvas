import { DEFAULT_MARGINS, type PageMargins } from '../documents/DocumentTypes';

/** Margin presets of the Document tab and Page setup (mm). */
export const MARGIN_PRESETS: { id: string; label: string; margins: PageMargins }[] = [
  { id: 'standard', label: 'Standard (20 / 16 mm)', margins: DEFAULT_MARGINS },
  { id: 'normal', label: 'Normal (25 mm)', margins: { top: 25, bottom: 25, left: 25, right: 25 } },
  { id: 'narrow', label: 'Narrow (12.7 mm)', margins: { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 } },
  { id: 'wide', label: 'Wide (30 mm)', margins: { top: 30, bottom: 30, left: 30, right: 30 } },
];

export function presetOf(m: PageMargins): string {
  return MARGIN_PRESETS.find((p) => (['top', 'bottom', 'left', 'right'] as const).every((k) => p.margins[k] === m[k]))?.id ?? 'custom';
}

