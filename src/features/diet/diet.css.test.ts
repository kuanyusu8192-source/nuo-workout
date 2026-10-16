/** jsdom 不載入樣式，直接解析 diet.css 檢查規範：字級 >= 16px、可點元素 >= 44px、不寫死色碼以外的 z-index。 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 用變數避免 Vite 把 new URL(字面值, import.meta.url) 當資產轉換
const rel = './diet.css';
const css = readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rules(): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) for (const sel of m[1].split(',')) out.push({ selector: sel.trim(), body: m[2] });
  return out;
}
const px = (body: string, prop: string) => {
  const m = new RegExp(String.raw`(?:^|[;\s])${prop}\s*:\s*(\d+)px`).exec(body);
  return m ? Number(m[1]) : null;
};

describe('diet.css 規範', () => {
  it('所有 font-size >= 16px', () => {
    for (const r of rules()) {
      const v = px(r.body, 'font-size');
      if (v !== null) expect(v, r.selector).toBeGreaterThanOrEqual(16);
    }
  });
  it.each([
    '.diet-day', '.diet-menu__item', '.diet-switch', '.diet-fav__main', '.diet-cal__day', '.diet-snack__btn',
  ])('%s 的 min-height >= 44', (sel) => {
    const r = rules().find((x) => x.selector === sel)!;
    expect(px(r.body, 'min-height')).toBeGreaterThanOrEqual(44);
  });
  it('有 prefers-reduced-motion 區塊，z-index 用變數', () => {
    expect(css).toContain('prefers-reduced-motion');
    expect(css).not.toMatch(/z-index:\s*\d/);
  });
});
