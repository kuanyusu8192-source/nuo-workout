import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { backStackSize, dispatchBackEvent, installBackHandling } from '../../app/back';
import { CelebrationDialog } from './CelebrationDialog';

const base = {
  exerciseName: '槓鈴臥推',
  kinds: ['weight' as const],
  newBestLabel: '最大重量 40 kg',
  totalVolumeBefore: 9_800,
  totalVolumeAfter: 10_200,
};

describe('CelebrationDialog', () => {
  it('顯示 PR 橫幅、動作新高、容量進度與繼續提示', () => {
    render(<CelebrationDialog {...base} onContinue={() => {}} />);
    expect(screen.getByText('恭喜打破 PR！')).toBeTruthy();
    expect(screen.getByText('槓鈴臥推 新高：最大重量 40 kg')).toBeTruthy();
    // 10,200 已跨過 10,000 → 下一個里程碑 25,000
    expect(screen.getByText('容量提升！ 9,800 → 10,200 / 25,000 kg')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: '累積總容量' });
    expect(bar.getAttribute('aria-valuemax')).toBe('25000');
    expect(bar.getAttribute('aria-valuenow')).toBe('10200');
    expect(screen.getByText('點擊任意處繼續')).toBeTruthy();
    // PR 種類同時以文字呈現
    expect(screen.getByText('最大重量')).toBeTruthy();
  });

  it('點任意處、Escape、返回鍵都會繼續', () => {
    const onContinue = vi.fn();
    const off = installBackHandling({ isRoot: () => true, goBack: () => {}, exit: () => {} });
    render(<CelebrationDialog {...base} onContinue={onContinue} />);
    expect(backStackSize()).toBe(1);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    dispatchBackEvent();
    expect(onContinue).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onContinue).toHaveBeenCalledTimes(3);
    off();
  });

  it('已超過最高里程碑時不再有下一階', () => {
    render(<CelebrationDialog {...base} totalVolumeBefore={1_200_000} totalVolumeAfter={1_300_000} onContinue={() => {}} />);
    expect(screen.getByText(/已達最高里程碑/)).toBeTruthy();
  });
});
