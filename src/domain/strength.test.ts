import { describe, expect, it } from 'vitest';
import type { SetRecord } from './types';
import { e1rm, peakE1rm, setVolume, totalVolume } from './strength';

const mk = (p: Partial<SetRecord>): SetRecord => ({
  id: 'x', exerciseId: 'e', date: '2026-01-01', kind: 'strength', createdAt: 0, ...p,
});

describe('e1rm', () => {
  it('Epley 40x10 約 53.33', () => expect(e1rm(40, 10)).toBeCloseTo(53.33, 2));
  it('reps=1 回傳重量', () => expect(e1rm(100, 1)).toBe(100));
  it('重量 0 回傳 0', () => expect(e1rm(0, 10)).toBe(0));
  it('負重量回傳 0', () => expect(e1rm(-5, 10)).toBe(0));
  it('reps<1 回傳 0', () => {
    expect(e1rm(100, 0)).toBe(0);
    expect(e1rm(100, -3)).toBe(0);
  });
  it('NaN 不外洩', () => {
    expect(e1rm(NaN, 5)).toBe(0);
    expect(e1rm(50, NaN)).toBe(0);
  });
});

describe('setVolume / totalVolume', () => {
  it('40x10 = 400', () => expect(setVolume({ weightKg: 40, reps: 10 })).toBe(400));
  it('缺值視為 0', () => {
    expect(setVolume({})).toBe(0);
    expect(setVolume({ weightKg: 40 })).toBe(0);
    expect(setVolume({ reps: 10 })).toBe(0);
  });
  it('NaN 視為 0', () => expect(setVolume({ weightKg: NaN, reps: 5 })).toBe(0));
  it('totalVolume 加總與空陣列', () => {
    expect(totalVolume([])).toBe(0);
    expect(totalVolume([{ weightKg: 40, reps: 10 }, { weightKg: 20, reps: 5 }, {}])).toBe(500);
  });
});

describe('peakE1rm', () => {
  it('空陣列為 0', () => expect(peakE1rm([])).toBe(0));
  it('取最大並忽略非力量組', () => {
    const sets = [
      mk({ weightKg: 40, reps: 10 }),
      mk({ weightKg: 100, reps: 1 }),
      mk({ kind: 'cardio', weightKg: 500, reps: 10 }),
      mk({}),
    ];
    expect(peakE1rm(sets)).toBe(100);
  });
  it('只有非力量組為 0', () => expect(peakE1rm([mk({ kind: 'stretch', weightKg: 9, reps: 9 })])).toBe(0));
});
