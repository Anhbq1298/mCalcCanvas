/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** The committed column templates must be exactly what tools/templates generates (see AGENTS.md §4). */
describe('column templates are up to date with their generators', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'tpl-'));
  for (const [gen, file] of [
    ['gen_rect.mjs', 'RC_Rectangular_Column_Check.mCalcCanvas'],
    ['gen_col.mjs', 'RC_Circular_Column_Check.mCalcCanvas'],
  ]) {
    it(`${file} = node tools/templates/${gen}`, () => {
      execFileSync(process.execPath, [path.resolve('tools/templates', gen)], { env: { ...process.env, TEMPLATE_OUT: out }, stdio: 'pipe' });
      const fresh = readFileSync(path.join(out, file), 'utf8');
      const committed = readFileSync(path.resolve('templates', file), 'utf8');
      expect(fresh === committed, `templates/${file} is stale: run npm run build && npm run templates:columns`).toBe(true);
    });
  }
});
