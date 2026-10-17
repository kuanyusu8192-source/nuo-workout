import { render } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { VirtualList } from './VirtualList';

/**
 * 迴歸：Preact 11 不會替數字樣式自動補 px。
 * 若 top／height 以無單位數字寫入，瀏覽器會忽略這些值，所有列疊在最上面、清單高度為 0（手機實測 bug）。
 * jsdom 沒有排版，所以直接檢查 inline style 是否為有效的 px 值。
 */
describe('VirtualList 排版樣式', () => {
  const items = Array.from({ length: 47 }, (_, i) => ({ id: `e${i}`, name: `動作 ${i}` }));

  function mount() {
    return render(
      <VirtualList
        items={items}
        rowHeight={72}
        keyOf={(x) => x.id}
        label="動作清單"
        renderRow={(x) => <span>{x.name}</span>}
      />,
    );
  }

  it('內層高度是總列高（有效的 px 值）', () => {
    const { container } = mount();
    const inner = container.querySelector('.exp-list__inner') as HTMLElement;
    expect(inner.style.height).toBe(`${47 * 72}px`);
  });

  it('每一列的 top 與 height 都是有效的 px 值，且彼此不重疊', () => {
    const { container } = mount();
    const rows = [...container.querySelectorAll('[role="listitem"]')] as HTMLElement[];
    expect(rows.length).toBeGreaterThan(1);
    const tops = rows.map((r) => r.style.top);
    tops.forEach((t) => expect(t).toMatch(/^\d+(\.\d+)?px$/));
    rows.forEach((r) => expect(r.style.height).toBe('72px'));
    // 第 i 列的 top 必須是 i × 列高
    rows.forEach((r, i) => expect(r.style.top).toBe(`${i * 72}px`));
    expect(new Set(tops).size).toBe(tops.length);
  });
});
