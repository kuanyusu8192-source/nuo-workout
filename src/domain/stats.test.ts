import { describe, it, expect } from 'vitest';
import {
  dailyVolume, dailyCardioMinutes, weekBars, monthBars, yearBars,
  trainingDays, streakWeeks, daySummary,
} from './stats';
import type { SetRecord } from './types';

let n = 0;
const s = (date: string, w: number, r: number, ex = 'e1'): SetRecord => ({
  id: `s${n++}`, exerciseId: ex, date, kind: 'strength', weightKg: w, reps: r, createdAt: n,
});
const c = (date: string, sec: number, ex = 'run'): SetRecord => ({
  id: `c${n++}`, exerciseId: ex, date, kind: 'cardio', durationSec: sec, createdAt: n,
});
const st = (date: string): SetRecord => ({
  id: `t${n++}`, exerciseId: 'str', date, kind: 'stretch', durationSec: 30, createdAt: n,
});

describe('空陣列迴歸（刪光紀錄不得殘留）', () => {
  it('全部歸零', () => {
    expect(dailyVolume([])).toEqual({});
    expect(dailyCardioMinutes([])).toEqual({});
    expect(trainingDays([], '2026-10-16')).toBe(0);
    expect(streakWeeks([], '2026-10-16')).toBe(0);
    expect(daySummary([], '2026-10-16')).toEqual({ sets: 0, volume: 0, cardioMinutes: 0, exerciseCount: 0 });
    expect(weekBars([], '2026-10-16').every((b) => b.value === 0)).toBe(true);
    expect(monthBars([], '2026-10-16').every((b) => b.value === 0)).toBe(true);
    expect(yearBars([], 2026).every((b) => b.value === 0)).toBe(true);
  });
});

describe('dailyVolume / dailyCardioMinutes', () => {
  it('只算 strength，同日加總', () => {
    const r = dailyVolume([s('2026-10-16', 50, 10), s('2026-10-16', 60, 5), c('2026-10-16', 600), st('2026-10-17')]);
    expect(r).toEqual({ '2026-10-16': 800 });
  });
  it('缺重量或次數視為 0', () => {
    const bad: SetRecord = { id: 'x', exerciseId: 'e', date: '2026-10-16', kind: 'strength', createdAt: 1 };
    expect(dailyVolume([bad])['2026-10-16'] ?? 0).toBe(0);
  });
  it('有氧分鐘四捨五入到 0.1', () => {
    const r = dailyCardioMinutes([c('2026-10-16', 100), c('2026-10-16', 100), s('2026-10-16', 50, 10)]);
    expect(r).toEqual({ '2026-10-16': 3.3 }); // 200s = 3.333
  });
});

describe('weekBars', () => {
  it('七筆，週一到週日，標籤正確', () => {
    const bars = weekBars([s('2026-10-12', 10, 10), s('2026-10-18', 20, 10)], '2026-10-15');
    expect(bars.map((b) => b.label)).toEqual(['一', '二', '三', '四', '五', '六', '日']);
    expect(bars[0]).toEqual({ date: '2026-10-12', label: '一', value: 100 });
    expect(bars[6]).toEqual({ date: '2026-10-18', label: '日', value: 200 });
  });
  it('跨週界線：週日與下週一分屬不同週', () => {
    const sets = [s('2026-10-18', 10, 10), s('2026-10-19', 20, 10)];
    const w1 = weekBars(sets, '2026-10-18');
    expect(w1[6].value).toBe(100);
    expect(w1.reduce((a, b) => a + b.value, 0)).toBe(100);
    const w2 = weekBars(sets, '2026-10-19');
    expect(w2[0].value).toBe(200);
    expect(w2.reduce((a, b) => a + b.value, 0)).toBe(200);
  });
  it('cardioMinutes 版本', () => {
    const bars = weekBars([c('2026-10-14', 1800), s('2026-10-14', 50, 10)], '2026-10-14', 'cardioMinutes');
    expect(bars[2].value).toBe(30);
  });
});

describe('monthBars', () => {
  it('當月每日一筆（跨月不混入）', () => {
    const bars = monthBars([s('2026-02-28', 10, 10), s('2026-03-01', 10, 10)], '2026-02-10');
    expect(bars).toHaveLength(28);
    expect(bars[27]).toEqual({ date: '2026-02-28', label: '28', value: 100 });
    expect(bars.reduce((a, b) => a + b.value, 0)).toBe(100);
  });
  it('閏年 2 月 29 天；cardio', () => {
    expect(monthBars([], '2028-02-01')).toHaveLength(29);
    expect(monthBars([c('2026-10-01', 600)], '2026-10-20', 'cardioMinutes')[0].value).toBe(10);
  });
});

describe('yearBars', () => {
  it('12 個月加總，跨年底分開', () => {
    const bars = yearBars([s('2026-12-31', 10, 10), s('2027-01-01', 20, 10), s('2026-01-05', 5, 10), s('2026-01-06', 5, 10)], 2026);
    expect(bars).toHaveLength(12);
    expect(bars[0].value).toBe(100);
    expect(bars[11].value).toBe(100);
    expect(bars[0].date).toBe('2026-01');
    expect(bars[11].label).toBe('12月');
  });
  it('cardio 版本', () => {
    expect(yearBars([c('2026-06-01', 600), c('2026-06-30', 300)], 2026, 'cardioMinutes')[5].value).toBe(15);
  });
});

describe('trainingDays', () => {
  it('當月不重複日期；任何 kind 都算；跨月不算', () => {
    const sets = [s('2026-10-01', 1, 1), s('2026-10-01', 1, 1), c('2026-10-05', 60), st('2026-10-31'), s('2026-11-01', 1, 1), s('2025-10-02', 1, 1)];
    expect(trainingDays(sets, '2026-10-16')).toBe(3);
  });
});

describe('streakWeeks', () => {
  // 2026-10-16 為週五；本週 10-12~10-18
  it('本週有紀錄，往回連續計算', () => {
    const sets = [s('2026-10-13', 1, 1), s('2026-10-06', 1, 1), s('2026-09-29', 1, 1)];
    expect(streakWeeks(sets, '2026-10-16')).toBe(3);
  });
  it('中間斷一週就停止', () => {
    const sets = [s('2026-10-13', 1, 1), s('2026-09-29', 1, 1)];
    expect(streakWeeks(sets, '2026-10-16')).toBe(1);
  });
  it('本週尚無、上週有：從上週起算', () => {
    const sets = [s('2026-10-08', 1, 1), s('2026-10-01', 1, 1)];
    expect(streakWeeks(sets, '2026-10-16')).toBe(2);
  });
  it('本週無且上週無：0', () => {
    expect(streakWeeks([s('2026-10-01', 1, 1)], '2026-10-16')).toBe(0);
  });
  it('跨週界線：週日屬前一週、週一屬新週', () => {
    expect(streakWeeks([s('2026-10-18', 1, 1)], '2026-10-19')).toBe(1);
    expect(streakWeeks([s('2026-10-18', 1, 1), s('2026-10-19', 1, 1)], '2026-10-19')).toBe(2);
  });
  it('跨年底', () => {
    const sets = [s('2027-01-04', 1, 1), s('2026-12-30', 1, 1), s('2026-12-23', 1, 1)];
    expect(streakWeeks(sets, '2027-01-05')).toBe(3);
  });
  it('未來日期紀錄不影響', () => {
    expect(streakWeeks([s('2026-12-01', 1, 1)], '2026-10-16')).toBe(0);
  });
});

describe('daySummary', () => {
  it('組數、容量、有氧分鐘、不重複動作數', () => {
    const r = daySummary(
      [s('2026-10-16', 50, 10, 'a'), s('2026-10-16', 50, 10, 'a'), s('2026-10-16', 20, 5, 'b'), c('2026-10-16', 90, 'run'), s('2026-10-17', 99, 9, 'z')],
      '2026-10-16',
    );
    expect(r).toEqual({ sets: 4, volume: 1100, cardioMinutes: 1.5, exerciseCount: 3 });
  });
});
