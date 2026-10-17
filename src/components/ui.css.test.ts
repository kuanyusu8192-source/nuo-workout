/**
 * a11y 規則檢查（jsdom 不載入樣式，所以直接解析 CSS 原始檔）：
 * 可互動元件 >= 44px、焦點樣式、*-600 深階色、reduced-motion。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// vitest 預設不處理 CSS（?raw 也會得到空字串），所以直接讀檔
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const ui = read('./ui.css');
const theme = read('../theme.css');
const appCss = read('../app/app.css');

/** 取得某選擇器（完全相同）第一個規則的宣告字串 */
function rule(css: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  if (!m) throw new Error(`找不到規則 ${selector}`);
  return m[1];
}
const px = (decl: string, prop: string): number => {
  const m = new RegExp(`${prop}\\s*:\\s*(\\d+)px`).exec(decl);
  return m ? Number(m[1]) : 0;
};

describe('觸控尺寸 >= 44px', () => {
  const interactive = [
    '.nuo-btn', '.nuo-iconbtn', '.nuo-linkbtn', '.nuo-tab', '.nuo-seg__item', '.nuo-toast__close', '.nuo-card--pressable',
  ];
  it.each(interactive)('%s 的 min-height >= 44', (sel) => {
    expect(px(rule(ui, sel), 'min-height')).toBeGreaterThanOrEqual(44);
  });
  it.each(['.nuo-btn', '.nuo-iconbtn', '.nuo-linkbtn', '.nuo-tab', '.nuo-seg__item', '.nuo-toast__close'])('%s 的 min-width >= 44', (sel) => {
    expect(px(rule(ui, sel), 'min-width')).toBeGreaterThanOrEqual(44);
  });
  it('輸入框高度 >= 48', () => {
    expect(px(rule(ui, '.nuo-input'), 'min-height')).toBeGreaterThanOrEqual(48);
  });
  it('底部分頁列 56px，每個分頁 >= 44', () => {
    expect(rule(appCss, '.app-nav')).toMatch(/height:\s*calc\(56px \+ env\(safe-area-inset-bottom\)\)/);
    expect(px(rule(appCss, '.app-nav__item'), 'min-height')).toBeGreaterThanOrEqual(44);
    expect(px(rule(appCss, '.app-nav__item'), 'min-width')).toBeGreaterThanOrEqual(44);
  });
});

describe('色彩與焦點', () => {
  it('按鈕底色使用 *-600 深階色，不用淺階原色', () => {
    expect(rule(ui, '.nuo-btn--primary')).toContain('var(--primary-600)');
    expect(rule(ui, '.nuo-btn--success')).toContain('var(--success-600)');
    expect(rule(ui, '.nuo-btn--danger')).toContain('var(--danger-600)');
    for (const v of ['primary', 'success', 'danger']) {
      expect(rule(ui, `.nuo-btn--${v}`)).not.toMatch(new RegExp(`var\\(--${v}\\)`));
    }
  });
  it('全域 :focus-visible 有可見外框', () => {
    expect(theme).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid/);
  });
  it('只有「程式聚焦的對話框容器」可以 outline: none，其餘元件不可移除焦點外框', () => {
    const all = (ui + appCss).match(/outline:\s*(none|0)\b/g) ?? [];
    expect(all.length).toBe(1);
    expect(rule(ui, '.nuo-sheet,\n.nuo-modal')).toContain('outline: none');
  });
  it('z-index 階層使用 theme 變數', () => {
    expect(rule(ui, '.nuo-layer--sheet')).toContain('var(--z-sheet)');
    expect(rule(ui, '.nuo-layer--modal')).toContain('var(--z-modal)');
    expect(rule(ui, '.nuo-toasts')).toContain('var(--z-toast)');
    expect(rule(appCss, '.app-nav')).toContain('var(--z-nav)');
  });
});

describe('動態', () => {
  it('進場動畫只在 no-preference 時啟用，且 theme 有全域 reduce 規則', () => {
    expect(ui).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{[^@]*nuo-chart--animate/);
    expect(theme).toMatch(/prefers-reduced-motion: reduce/);
  });
});

describe('頁面切換動畫（app.css）', () => {
  it('淡入／滑入只用 opacity／transform，且僅在 no-preference 動畫下啟用', () => {
    expect(appCss).toMatch(/@keyframes nuo-route-fade/);
    expect(appCss).toMatch(/@keyframes nuo-route-slide/);
    const block = appCss.match(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(block).toContain('.route-view--fade');
    expect(block).toContain('.route-view--slide');
    const frames = appCss.match(/@keyframes nuo-route-(?:fade|slide)[^\n]*/g)?.join('') ?? '';
    expect(frames).not.toMatch(/(width|height|margin|top|left)\s*:/);
  });
});
