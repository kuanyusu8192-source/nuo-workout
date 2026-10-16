import { describe, expect, it } from 'vitest';
import type { SetRecord } from './types';
import { detectPr, nextMilestone, volumeMilestones } from './pr';

let n = 0;
const mk = (date: string, weightKg?: number, reps?: number, p: Partial<SetRecord> = {}): SetRecord => ({
  id: String(n++), exerciseId: 'bench', date, kind: 'strength', weightKg, reps, createdAt: n, ...p,
});

describe('detectPr', () => {
  it('首次紀錄必為 PR，含三種', () => {
    const r = detectPr([], [mk('2026-02-01', 40, 10)], 'bench');
    expect(r.isPr).toBe(true);
    expect(r.kinds).toEqual(['weight', 'e1rm', 'volume']);
  });
  it('history 只有其他動作也算首次', () => {
    const h = [mk('2026-01-01', 100, 5, { exerciseId: 'squat' })];
    expect(detectPr(h, [mk('2026-02-01', 40, 10)], 'bench').kinds).toHaveLength(3);
  });
  it('較輕且較少不是 PR', () => {
    const h = [mk('2026-01-01', 60, 10)];
    expect(detectPr(h, [mk('2026-02-01', 40, 5)], 'bench')).toEqual({ isPr: false, kinds: [] });
  });
  it('重量較低次數多 含 e1rm 不含 weight', () => {
    const h = [mk('2026-01-01', 60, 5)];
    const r = detectPr(h, [mk('2026-02-01', 50, 15)], 'bench');
    expect(r.kinds).toContain('e1rm');
    expect(r.kinds).not.toContain('weight');
  });
  it('容量較高含 volume', () => {
    const h = [mk('2026-01-01', 60, 5)];
    const r = detectPr(h, [mk('2026-02-01', 40, 5), mk('2026-02-01', 40, 5), mk('2026-02-01', 40, 5)], 'bench');
    expect(r.kinds).toEqual(['volume']);
  });
  it('單日容量跨日比較歷史最大單日', () => {
    const h = [mk('2026-01-01', 50, 10), mk('2026-01-02', 10, 10)];
    expect(detectPr(h, [mk('2026-02-01', 40, 10)], 'bench').kinds).not.toContain('volume');
  });
  it('重量新高', () => {
    const h = [mk('2026-01-01', 60, 10)];
    expect(detectPr(h, [mk('2026-02-01', 70, 1)], 'bench').kinds).toEqual(['weight']);
  });
  it('current 全為 0 容量不是 PR（即使首次）', () => {
    expect(detectPr([], [mk('2026-02-01'), mk('2026-02-01', 0, 10)], 'bench')).toEqual({ isPr: false, kinds: [] });
    expect(detectPr([], [], 'bench').isPr).toBe(false);
  });
  it('忽略非力量與其他動作的 current', () => {
    const cur = [mk('2026-02-01', 40, 10, { kind: 'cardio' }), mk('2026-02-01', 99, 9, { exerciseId: 'x' })];
    expect(detectPr([], cur, 'bench').isPr).toBe(false);
  });
  it('持平不算新高', () => {
    const h = [mk('2026-01-01', 40, 10)];
    expect(detectPr(h, [mk('2026-02-01', 40, 10)], 'bench').isPr).toBe(false);
  });
});

describe('nextMilestone', () => {
  it('常數', () => expect(volumeMilestones).toEqual([10000, 25000, 50000, 100000, 250000, 500000, 1000000]));
  it('400 -> next 10000', () => {
    const m = nextMilestone(400);
    expect(m.prev).toBe(0);
    expect(m.next).toBe(10000);
    expect(m.progress).toBeCloseTo(0.04, 5);
  });
  it('剛好等於階梯進入下一階', () => {
    expect(nextMilestone(10000)).toEqual({ prev: 10000, next: 25000, progress: 0 });
  });
  it('中間階', () => {
    expect(nextMilestone(37500)).toEqual({ prev: 25000, next: 50000, progress: 0.5 });
  });
  it('超過最後一階', () => {
    expect(nextMilestone(1000000)).toEqual({ prev: 1000000, next: null, progress: 1 });
    expect(nextMilestone(5e6).next).toBeNull();
  });
  it('0、負數、NaN 皆為 0 進度', () => {
    for (const v of [0, -5, NaN]) expect(nextMilestone(v)).toEqual({ prev: 0, next: 10000, progress: 0 });
  });
});
