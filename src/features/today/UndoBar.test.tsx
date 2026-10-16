import { act, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNDO_MS, UndoBar } from './UndoBar';

describe('UndoBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('5 秒後自動消失；按復原會執行還原並關閉', () => {
    const onDismiss = vi.fn();
    const restore = vi.fn();
    const item = { id: 1, label: '已刪除 槓鈴臥推 第1組', restore };
    const { unmount } = render(<UndoBar item={item} onDismiss={onDismiss} />);
    expect(screen.getByText('已刪除 槓鈴臥推 第1組')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(UNDO_MS - 1);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    unmount();

    render(<UndoBar item={item} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: '復原' }));
    expect(restore).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('沒有項目時不渲染', () => {
    const { container } = render(<UndoBar item={null} onDismiss={() => {}} />);
    expect(container.textContent).toBe('');
  });
});

