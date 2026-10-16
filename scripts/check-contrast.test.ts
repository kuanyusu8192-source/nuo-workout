import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error mjs 無型別宣告
import { checkPairs, contrastRatio, parseVars } from './check-contrast.mjs';

describe('contrast', () => {
  it('黑白為 21，相同色為 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('已知值：白字 on #2471a3 約 5.30', () => {
    expect(contrastRatio('#ffffff', '#2471a3')).toBeCloseTo(5.3, 1);
  });

  it('低對比配對會被標為不通過', () => {
    const r = checkPairs([{ name: 't', fg: '#ffffff', bg: '--a' }], { '--a': '#f39c12' });
    expect(r[0].ok).toBe(false);
  });

  it('theme.css 內所有宣告的配對皆 >= 4.5', () => {
    const root = path.resolve(__dirname, '..');
    const css = fs.readFileSync(path.join(root, 'src/theme.css'), 'utf8');
    const pairs = JSON.parse(fs.readFileSync(path.join(__dirname, 'contrast-pairs.json'), 'utf8'));
    const results = checkPairs(pairs, parseVars(css));
    expect(results.length).toBe(12);
    for (const r of results) expect(r.ratio, r.name).toBeGreaterThanOrEqual(4.5);
  });
});
