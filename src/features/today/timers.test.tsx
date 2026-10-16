/** 計時器：純狀態函式＋ hook（假時鐘，不依賴真實時間）。 */
import { act, renderHook } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatClock, restAdjust, restPause, restRemainingMs, restResume, restStart, restTick, restToggle,
  useElapsed, useRestTimer, type RestState,
} from './timers';

const idle: RestState = { phase: 'idle', adjustSec: 0 };

describe('休息計時（純函式）', () => {
  it('idle 顯示預設秒數；加減 30 秒只調整待機值', () => {
    expect(restRemainingMs(idle, 0, 90)).toBe(90_000);
    const plus = restAdjust(idle, 0, 30, 90);
    expect(plus).toEqual({ phase: 'idle', adjustSec: 30 });
    expect(restRemainingMs(plus, 0, 90)).toBe(120_000);
    // 不會低於 0
    expect(restRemainingMs(restAdjust(idle, 0, -30, 20), 0, 20)).toBe(0);
  });

  it('start → running，剩餘時間隨時鐘遞減，到點變 done', () => {
    const s = restStart(idle, 1_000, 60);
    expect(s.phase).toBe('running');
    expect(restRemainingMs(s, 31_000, 60)).toBe(30_000);
    expect(restTick(s, 30_000).phase).toBe('running');
    expect(restTick(s, 61_000).phase).toBe('done');
    expect(restRemainingMs(restTick(s, 61_000), 61_000, 60)).toBe(0);
  });

  it('暫停保留剩餘，繼續時重新計算結束點', () => {
    const run = restStart(idle, 0, 60);
    const paused = restPause(run, 20_000);
    expect(paused).toMatchObject({ phase: 'paused', remainingMs: 40_000 });
    // 暫停期間時鐘走了很久，剩餘不變
    expect(restRemainingMs(paused, 500_000, 60)).toBe(40_000);
    const resumed = restResume(paused, 500_000);
    expect(resumed).toMatchObject({ phase: 'running', endAt: 540_000 });
  });

  it('執行中 ±30 秒調整結束點；減到沒有就結束', () => {
    const run = restStart(idle, 0, 60);
    expect(restAdjust(run, 10_000, 30, 60)).toMatchObject({ phase: 'running', endAt: 90_000 });
    expect(restAdjust(run, 40_000, -30, 60).phase).toBe('done');
  });

  it('toggle：idle/done 開始、running 暫停、paused 繼續', () => {
    const run = restToggle(idle, 0, 60);
    expect(run.phase).toBe('running');
    const paused = restToggle(run, 5_000, 60);
    expect(paused.phase).toBe('paused');
    expect(restToggle(paused, 6_000, 60).phase).toBe('running');
    const done = restTick(run, 70_000);
    expect(restToggle(done, 70_000, 60)).toMatchObject({ phase: 'running', endAt: 130_000 });
  });

  it('formatClock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(90)).toBe('1:30');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('hooks（假時鐘）', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('useRestTimer：倒數結束只觸發一次 onDone', () => {
    let clock = 0;
    const onDone = vi.fn();
    const { result } = renderHook(() => useRestTimer({ defaultSec: 3, now: () => clock, onDone, tickMs: 100 }));
    expect(result.current.remainingSec).toBe(3);
    act(() => result.current.start());
    expect(result.current.state.phase).toBe('running');

    act(() => {
      clock = 1_000;
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.remainingSec).toBe(2);
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      clock = 3_500;
      vi.advanceTimersByTime(2_500);
    });
    expect(result.current.state.phase).toBe('done');
    expect(result.current.remainingSec).toBe(0);
    expect(onDone).toHaveBeenCalledTimes(1);

    act(() => {
      clock = 10_000;
      vi.advanceTimersByTime(6_500);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('useRestTimer：預設秒數改變時待機顯示跟著改', () => {
    let def = 60;
    const { result, rerender } = renderHook(() => useRestTimer({ defaultSec: def, now: () => 0 }));
    expect(result.current.remainingSec).toBe(60);
    def = 90;
    rerender();
    expect(result.current.remainingSec).toBe(90);
  });

  it('useElapsed：進行中隨時鐘增加，endedAt 設定後凍結', () => {
    let clock = 10_000;
    const { result, rerender } = renderHook((p: { endedAt?: number }) => useElapsed({ startedAt: 0, endedAt: p.endedAt, now: () => clock, tickMs: 500 }), {
      initialProps: {} as { endedAt?: number },
    });
    expect(result.current).toBe(10);
    act(() => {
      clock = 25_000;
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe(25);
    rerender({ endedAt: 30_000 });
    expect(result.current).toBe(30);
    act(() => {
      clock = 99_000;
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe(30);
  });
});
