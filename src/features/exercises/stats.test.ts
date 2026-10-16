import { describe, expect, it } from 'vitest';
import type { SetRecord } from '../../domain/types';
import { cardioSeries, personalRecords, strengthSeries } from './stats';

let n = 0;
const s = (date: string, weightKg: number, reps: number): SetRecord => ({
  id: `s${++n}`, exerciseId: 'x', date, kind: 'strength', weightKg, reps, createdAt: n,
});
const c = (date: string, durationSec: number, distanceM?: number, speed?: number): SetRecord => ({
  id: `c${++n}`, exerciseId: 'x', date, kind: 'cardio', durationSec, distanceM, speed, createdAt: n,
});

const sets = [
  s('2026-09-01', 60, 10), s('2026-09-01', 60, 8),
  s('2026-09-08', 70, 5),
  s('2026-09-15', 50, 12),
];

describe('strengthSeries', () => {
  it('每日 e1RM（Epley）、容量、最大次數、總次數', () => {
    const r = strengthSeries(sets, 'x');
    expect(r.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-08', '2026-09-15']);
    expect(r[0].e1rm).toBeCloseTo(80, 5); // 60 × (1 + 10/30)
    expect(r[0].volume).toBe(1080);
    expect(r[0].maxReps).toBe(10);
    expect(r[0].totalReps).toBe(18);
    expect(r[1].e1rm).toBeCloseTo(81.6667, 3);
    expect(r[1].volume).toBe(350);
    expect(r[2].e1rm).toBeCloseTo(70, 5);
  });

  it('PR：e1RM 超越先前紀錄才標示；首日不標', () => {
    const r = strengthSeries(sets, 'x');
    expect(r.map((p) => p.isPr)).toEqual([false, true, false]);
  });

  it('from 只裁切顯示，PR 仍以完整歷史判斷', () => {
    const r = strengthSeries(sets, 'x', '2026-09-10');
    expect(r.map((p) => p.date)).toEqual(['2026-09-15']);
    expect(r[0].isPr).toBe(false);
  });

  it('忽略其他動作與非力量組', () => {
    const r = strengthSeries([...sets, { ...s('2026-09-20', 200, 10), exerciseId: 'other' }, c('2026-09-21', 600)], 'x');
    expect(r).toHaveLength(3);
  });

  it('沒有資料回傳空陣列', () => {
    expect(strengthSeries([], 'x')).toEqual([]);
  });
});

describe('personalRecords', () => {
  it('最大次數、最大重量、最高單日容量', () => {
    expect(personalRecords(sets, 'x')).toEqual({ maxReps: 12, maxWeightKg: 70, maxVolumeKg: 1080 });
  });
  it('無資料為 null', () => {
    expect(personalRecords([], 'x')).toEqual({ maxReps: null, maxWeightKg: null, maxVolumeKg: null });
  });
});

describe('cardioSeries', () => {
  it('每日分鐘、公里、平均速度', () => {
    const r = cardioSeries([c('2026-09-01', 1800, 5000, 10), c('2026-09-01', 600, 1500, 9), c('2026-09-02', 1200)], 'x');
    expect(r).toHaveLength(2);
    expect(r[0].minutes).toBe(40);
    expect(r[0].km).toBe(6.5);
    expect(r[0].avgSpeed).toBeCloseTo(9.5, 5);
    expect(r[1].km).toBe(0);
    expect(r[1].avgSpeed).toBe(0);
  });
});
