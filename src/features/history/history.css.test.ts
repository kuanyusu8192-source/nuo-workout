import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** jsdom 不載入樣式，直接解析 CSS 原始檔（做法同 today.css.test.ts） */
describe('history.css 規則', () => {
  const rel = './history.css';
  const css = readFileSync(new URL(rel, import.meta.url), 'utf8');
  const rule = (selector: string): string => {
    const start = css.indexOf(`${selector} {`);
    if (start < 0) throw new Error(`找不到規則 ${selector}`);
    return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  };

  it('分段按鈕文字不換行（375px 寬時「有氧(分鐘)」曾斷成兩行）', () => {
    expect(rule('.hist-row .nuo-seg__item')).toMatch(/white-space:\s*nowrap/);
  });
  it('分段按鈕列在窄螢幕可換到下一行，不橫向溢出', () => {
    expect(rule('.hist-row')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.hist-row .nuo-seg')).toMatch(/max-width:\s*100%/);
  });
});
