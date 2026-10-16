import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** a11y 規則（jsdom 不載入樣式，直接解析 CSS 原始檔，做法同 components/ui.css.test.ts） */
describe('today.css 規則', () => {
  // 用變數組 URL：Vite 會把字面的 new URL('./x', import.meta.url) 當成資產改寫成 http 位址
  const rel = './today.css';
  const css = readFileSync(new URL(rel, import.meta.url), 'utf8');
  const rule = (selector: string): string => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm').exec(css);
    if (!m) throw new Error(`找不到規則 ${selector}`);
    return m[1];
  };

  it('復原按鈕觸控 >= 44px', () => {
    expect(rule('.today-undo__btn')).toMatch(/min-height:\s*(4[4-9]|[5-9]\d)px/);
    expect(rule('.today-undo__btn')).toMatch(/min-width:\s*(4[4-9]|[5-9]\d)px/);
  });
  it('不移除焦點外框', () => {
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });
  it('z-index 與色票都用 theme 變數', () => {
    expect(css).not.toMatch(/z-index:\s*\d/);
    expect(rule('.today-dock')).toContain('var(--z-nav)');
    expect(rule('.today-undo')).toContain('var(--z-toast)');
    expect(rule('.celebrate')).toContain('var(--z-modal)');
    expect(css).not.toMatch(/#(3498db|27ae60|f39c12|e74c3c)\b/i);
  });
  it('慶祝頁動畫只在 no-preference 啟用', () => {
    const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{[\s\S]*?\n\}/g, '');
    expect(outside).not.toMatch(/animation\s*:/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
  });
  it('字級不小於 16px', () => {
    for (const m of css.matchAll(/font-size:\s*(\d+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(16);
  });
});
