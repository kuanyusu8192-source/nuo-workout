import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { Modal } from './Modal';
import { Sheet } from './Sheet';

describe('對話框自動聚焦輸入框', () => {
  it('Sheet 內有文字輸入框：聚焦第一個輸入框（略過按鈕、checkbox、hidden、disabled、date）', () => {
    render(
      <Sheet open title="新增" onClose={() => {}}>
        <input type="checkbox" aria-label="勾" />
        <input type="hidden" />
        <input type="date" aria-label="日期" />
        <input aria-label="停用" disabled />
        <input aria-label="名稱" />
        <input aria-label="備註" />
      </Sheet>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText('名稱'));
  });

  it('Modal 內有輸入框也會聚焦', () => {
    render(<Modal open title="改名" onClose={() => {}}><input type="number" aria-label="重量" /></Modal>);
    expect(document.activeElement).toBe(screen.getByLabelText('重量'));
  });

  it('輸入框標示 data-autofocus="false" 時不自動聚焦，維持第一個可聚焦元素', () => {
    render(
      <Sheet open title="動作" onClose={() => {}}>
        <input aria-label="搜尋" data-autofocus="false" />
        <button>項目</button>
      </Sheet>,
    );
    // 第一個可聚焦元素是 Sheet 標題列的關閉鈕
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '關閉' }));
  });

  it('沒有輸入框：維持現行（第一個可聚焦元素）', () => {
    render(<Sheet open title="x" onClose={() => {}}><button>甲</button></Sheet>);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '關閉' }));
  });
});
