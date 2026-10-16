import { describe, expect, it } from 'vitest';
import type { Meal, SetRow } from '../../data/types';
import {
  autoKcal, convertPer100g, estimateBurn, formatNum, monthCells, scaleMealServings, sumMeals, totalsFor, weekDates,
} from './dietLogic';

const meal = (over: Partial<Meal> = {}): Meal => ({
  id: 'm1', date: '2026-10-16', name: '便當', servings: 1, proteinG: 30, carbG: 50, fatG: 10, kcal: 410, ...over,
});

describe('熱量與換算', () => {
  it('autoKcal = 蛋白×4 + 碳水×4 + 脂肪×9', () => {
    expect(autoKcal({ proteinG: 30, carbG: 50, fatG: 10 })).toBe(410);
    expect(autoKcal({ proteinG: 0, carbG: 0, fatG: 0 })).toBe(0);
  });
  it('每 100g 依實際克數換算（四捨五入到 0.1）', () => {
    expect(convertPer100g({ proteinG: 20, carbG: 10, fatG: 5 }, 150)).toEqual({ proteinG: 30, carbG: 15, fatG: 7.5 });
    expect(convertPer100g({ proteinG: 3.3, carbG: 0, fatG: 0 }, 100)).toEqual({ proteinG: 3.3, carbG: 0, fatG: 0 });
  });
  it('totalsFor：份數乘上每份，kcal 自動或覆寫（每份）', () => {
    expect(totalsFor({ proteinG: 20, carbG: 10, fatG: 5 }, 2)).toEqual({ proteinG: 40, carbG: 20, fatG: 10, kcal: 330 });
    expect(totalsFor({ proteinG: 20, carbG: 10, fatG: 5 }, 2, 200)).toEqual({ proteinG: 40, carbG: 20, fatG: 10, kcal: 400 });
  });
  it('scaleMealServings：無 per100g 時依比例縮放', () => {
    const p = scaleMealServings(meal(), 2);
    expect(p).toEqual({ servings: 2, proteinG: 60, carbG: 100, fatG: 20, kcal: 820 });
    expect(scaleMealServings(meal({ servings: 2, proteinG: 60, carbG: 100, fatG: 20, kcal: 820 }), 1)).toEqual({
      servings: 1, proteinG: 30, carbG: 50, fatG: 10, kcal: 410,
    });
  });
  it('scaleMealServings：有 per100g 與 grams 時由 per100g 精確重算', () => {
    const m = meal({ grams: 150, servings: 1, per100g: { proteinG: 20, carbG: 10, fatG: 5, kcal: 165 }, proteinG: 30, carbG: 15, fatG: 7.5, kcal: 248 });
    expect(scaleMealServings(m, 2)).toMatchObject({ servings: 2, proteinG: 60, carbG: 30, fatG: 15, kcal: 496 });
  });
  it('sumMeals 加總', () => {
    expect(sumMeals([meal(), meal({ id: 'm2', proteinG: 20, carbG: 10, fatG: 5, kcal: 165 })])).toEqual({
      proteinG: 50, carbG: 60, fatG: 15, kcal: 575,
    });
    expect(sumMeals([])).toEqual({ proteinG: 0, carbG: 0, fatG: 0, kcal: 0 });
  });
  it('formatNum：整數不帶小數，其餘最多一位', () => {
    expect(formatNum(12)).toBe('12');
    expect(formatNum(7.5)).toBe('7.5');
    expect(formatNum(7.46)).toBe('7.5');
  });
});

describe('日期', () => {
  it('weekDates 週一起七天', () => {
    expect(weekDates('2026-10-16')).toEqual([
      '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18',
    ]);
    expect(weekDates('2026-10-18')[0]).toBe('2026-10-12');
  });
  it('monthCells：週一起，前置空格與日數', () => {
    const cells = monthCells('2026-10');
    // 2026-10-01 是週四 → 前面 3 個空格
    expect(cells.slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
    expect(cells.filter(Boolean)).toHaveLength(31);
    expect(cells.filter(Boolean).pop()).toBe('2026-10-31');
    expect(cells.length % 7).toBe(0);
  });
});

describe('estimateBurn', () => {
  const set = (over: Partial<SetRow>): SetRow => ({
    id: 's', sessionId: 'x', exerciseId: 'e', setIndex: 0, kind: 'strength', weightKg: 50, reps: 10, createdAt: 1, ...over,
  });
  it('缺體重回 null', () => {
    expect(estimateBurn({ weightKg: null, metStrength: 5, sessions: [{ sets: [set({})] }] })).toBeNull();
  });
  it('重訓無計時：每組 3 分鐘 × MET × 體重', () => {
    const sets = [0, 1, 2, 3].map((i) => set({ id: `s${i}`, setIndex: i }));
    expect(estimateBurn({ weightKg: 70, metStrength: 5, sessions: [{ sets }] })).toBe(70);
  });
  it('重訓有結束時間：用整場計時', () => {
    const sets = [set({})];
    // 60 分鐘 × 5 × 60kg / 60 = 300
    expect(estimateBurn({ weightKg: 60, metStrength: 5, sessions: [{ sets, startedAt: 0, endedAt: 3600_000 }] })).toBe(300);
  });
  it('沒有任何訓練為 0', () => {
    expect(estimateBurn({ weightKg: 70, metStrength: 5, sessions: [] })).toBe(0);
  });
  it('有氧用 durationSec 與速度（ACSM）', () => {
    const sets = [set({ kind: 'cardio', durationSec: 1800, speed: 10, incline: 0, weightKg: undefined, reps: undefined })];
    const k = estimateBurn({ weightKg: 70, metStrength: 5, sessions: [{ sets }] });
    // 10km/h 跑步 ≈ 10.3 MET，30 分鐘、70kg ≈ 360
    expect(k).toBeGreaterThan(300);
    expect(k).toBeLessThan(420);
  });
});
