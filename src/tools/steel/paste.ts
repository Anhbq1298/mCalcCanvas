import type { Combo } from './model';

const NUMBER = /^\s*-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;

/** Rows pasted from Excel or an ETABS table (tab, comma or semicolon separated). */
export function parseCombos(text: string, format: 'page' | 'etabs'): Combo[] {
  const out: Combo[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/\t|;|,(?=\s*[-\d.])/).map((c) => c.trim()).filter((c) => c !== '');
    const nums = cells.filter((c) => NUMBER.test(c)).map(Number), words = cells.filter((c) => !NUMBER.test(c));
    if (format === 'etabs') {
      if (nums.length < 6) continue;
      const [P, V2, V3, , M2, M3] = nums.slice(-6); // P V2 V3 T M2 M3, P tension positive
      out.push({ name: words.join(' ') || `Row ${out.length + 1}`, N: -P, Vz: V2, Vy: V3, My: M3, Mz: M2 });
    } else {
      if (nums.length < 1) continue;
      const [N = 0, My = 0, Mz = 0, Vz = 0, Vy = 0] = nums;
      out.push({ name: words.join(' ') || `Comb ${out.length + 1}`, N, My, Mz, Vz, Vy });
    }
  }
  return out;
}
