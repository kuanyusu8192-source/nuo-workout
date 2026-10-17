import { act, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Delayed, SKELETON_DELAY_MS } from './useDelayed';
import { Skeleton } from './Skeleton';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Delayed / Skeleton 延遲顯示', () => {
  it('預設延遲約 150ms', () => {
    expect(SKELETON_DELAY_MS).toBe(150);
  });

  it('Delayed：延遲前不渲染，到時間才顯示', () => {
    render(<Delayed><p>載入中</p></Delayed>);
    expect(screen.queryByText('載入中')).toBeNull();
    act(() => { vi.advanceTimersByTime(149); });
    expect(screen.queryByText('載入中')).toBeNull();
    act(() => { vi.advanceTimersByTime(2); });
    expect(screen.getByText('載入中')).toBeTruthy();
  });

  it('Delayed：在延遲內卸載就永遠不顯示（資料很快載好）', () => {
    const { unmount } = render(<Delayed><p>載入中</p></Delayed>);
    act(() => { vi.advanceTimersByTime(100); });
    unmount();
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.queryByText('載入中')).toBeNull();
  });

  it('Delayed：delay=0 立即顯示', () => {
    render(<Delayed delay={0}><p>馬上</p></Delayed>);
    expect(screen.getByText('馬上')).toBeTruthy();
  });

  it('Skeleton 預設延遲顯示，delay={0} 立即顯示', () => {
    const { unmount } = render(<Skeleton label="讀取" />);
    expect(screen.queryByRole('status', { name: '讀取' })).toBeNull();
    act(() => { vi.advanceTimersByTime(160); });
    expect(screen.getByRole('status', { name: '讀取' })).toBeTruthy();
    unmount();
    render(<Skeleton label="立即" delay={0} />);
    expect(screen.getByRole('status', { name: '立即' })).toBeTruthy();
  });
});
