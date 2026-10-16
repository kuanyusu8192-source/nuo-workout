import { describe, expect, it } from 'vitest';
import { acsmWalkRunMet } from '../../domain/burn';
import type { SetRecord } from '../../domain/types';
import {
  EMPTY_VALUES, buildPrLabel, displayToKg, estimateBurn, fmtNum, isComplete, kgToDisplay, toSetFields, valuesFromSet,
} from './model';

const v = (p: Partial<typeof EMPTY_VALUES>) => ({ ...EMPTY_VALUES, ...p });

describe('isComplete：每組填完才存', () => {
  it('重訓需重量與次數皆有效；徒手動作只需次數', () => {
    expect(isComplete('strength', v({ weight: 60, reps: 10 }), false)).toBe(true);
    expect(isComplete('strength', v({ weight: 60 }), false)).toBe(false);
    expect(isComplete('strength', v({ reps: 10 }), false)).toBe(false);
    expect(isComplete('strength', v({ reps: 10 }), true)).toBe(true);
    expect(isComplete('strength', v({ weight: 0, reps: 10 }), false)).toBe(true); // 0 是有效重量
    expect(isComplete('strength', v({ weight: 60, reps: 0 }), false)).toBe(false); // 0 次無效
  });
  it('有氧需時間；伸展需秒數', () => {
    expect(isComplete('cardio', v({ minutes: 20 }), false)).toBe(true);
    expect(isComplete('cardio', v({ speed: 8 }), false)).toBe(false);
    expect(isComplete('stretch', v({ seconds: 30 }), false)).toBe(true);
    expect(isComplete('stretch', v({}), false)).toBe(false);
  });
});

describe('欄位與資料列互轉', () => {
  it('重訓：kg 直存', () => {
    const f = toSetFields('strength', v({ weight: 62.5, reps: 8 }), 'kg');
    expect(f).toMatchObject({ weightKg: 62.5, reps: 8 });
    expect(valuesFromSet(f, 'kg')).toMatchObject({ weight: 62.5, reps: 8 });
  });
  it('lb 顯示：內部存 kg，來回不漂移', () => {
    expect(displayToKg(135, 'lb')).toBeCloseTo(61.235, 3);
    expect(kgToDisplay(displayToKg(135, 'lb'), 'lb')).toBe(135);
    const f = toSetFields('strength', v({ weight: 135, reps: 5 }), 'lb');
    expect(valuesFromSet(f, 'lb').weight).toBe(135);
  });
  it('有氧：分鐘轉秒；有速度時推算距離', () => {
    const f = toSetFields('cardio', v({ minutes: 20, speed: 8, incline: 1 }), 'kg');
    expect(f).toMatchObject({ durationSec: 1200, speed: 8, incline: 1, distanceM: 2667 });
    expect(valuesFromSet(f, 'kg')).toMatchObject({ minutes: 20, speed: 8, incline: 1 });
    expect(toSetFields('cardio', v({ minutes: 10 }), 'kg').distanceM).toBeUndefined();
  });
  it('伸展：秒數', () => {
    expect(toSetFields('stretch', v({ seconds: 45 }), 'kg')).toMatchObject({ durationSec: 45 });
  });
  it('fmtNum 去掉多餘小數', () => {
    expect(fmtNum(60)).toBe('60');
    expect(fmtNum(53.3333)).toBe('53.3');
    expect(fmtNum(12345)).toBe('12,345');
  });
});

describe('estimateBurn', () => {
  it('重訓無計時：每組 3 分鐘 × MET × 體重', () => {
    const sets = Array.from({ length: 5 }, () => ({ kind: 'strength' as const, exerciseName: '槓鈴臥推' }));
    expect(estimateBurn({ sets, weightKg: 70, metStrength: 5 })).toBe(88); // 5 × 70 × 0.25h = 87.5
  });
  it('有計時用計時（扣掉有氧時間）；有氧用 ACSM', () => {
    const sets = [
      { kind: 'strength' as const, exerciseName: '槓鈴臥推' },
      { kind: 'cardio' as const, exerciseName: '跑步', durationSec: 1800, speed: 8, incline: 0 },
    ];
    const run = Math.round(acsmWalkRunMet({ speedKmh: 8, inclinePct: 0 }) * 70 * 0.5);
    const lift = Math.round(5 * 70 * (1800 / 3600)); // 計時 3600 秒 − 有氧 1800 秒 = 30 分
    expect(estimateBurn({ sets, weightKg: 70, metStrength: 5, timerSeconds: 3600 })).toBe(run + lift);
  });
  it('沒速度的有氧查 MET 表（橢圓機 5.0）', () => {
    const sets = [{ kind: 'cardio' as const, exerciseName: '橢圓機', durationSec: 1200 }];
    expect(estimateBurn({ sets, weightKg: 60, metStrength: 5 })).toBe(Math.round(5 * 60 * (1 / 3)));
  });
  it('沒有體重回 null', () => {
    expect(estimateBurn({ sets: [{ kind: 'strength', exerciseName: 'x' }], weightKg: undefined, metStrength: 5 })).toBeNull();
  });
});

describe('buildPrLabel', () => {
  const rec = (weightKg: number, reps: number): SetRecord => ({
    id: String(Math.random()), exerciseId: 'e', date: '2026-10-16', kind: 'strength', weightKg, reps, createdAt: 1,
  });
  it('依優先序：最大重量 > 預估 1RM > 單日容量', () => {
    const cur = [rec(40, 10)];
    expect(buildPrLabel(['weight', 'e1rm', 'volume'], cur, 'kg')).toBe('最大重量 40 kg');
    expect(buildPrLabel(['e1rm', 'volume'], cur, 'kg')).toBe('預估 1RM 53.3 kg');
    expect(buildPrLabel(['volume'], cur, 'kg')).toBe('單日容量 400 kg');
  });
  it('lb 單位換算顯示', () => {
    expect(buildPrLabel(['weight'], [rec(100, 5)], 'lb')).toBe('最大重量 220.5 lb');
  });
});
