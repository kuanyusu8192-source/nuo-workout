import { describe, it, expect } from 'vitest';
import { isValidPal, bmr, tdee, goalMultiplier, kcalTarget, macrosFromKcal, kcalFromMacros, remainingKcal, PAL_LEVELS } from './nutrition';
import type { Profile } from './types';

// 樣本：30 歲、175 cm、70 kg
// 基底 = 10×70 + 6.25×175 − 5×30 = 700 + 1093.75 − 150 = 1643.75
// 男 +5 = 1648.75；女 −161 = 1482.75；other = 平均 = 1565.75
const base = { age: 30, heightCm: 175, weightKg: 70 };
const mk = (sex: Profile['sex'], pal: number, goal: Profile['goal']): Profile => ({ ...base, sex, pal, goal });

describe('bmr', () => {
  it('男', () => expect(bmr({ ...base, sex: 'male' })).toBeCloseTo(1648.75, 5));
  it('女', () => expect(bmr({ ...base, sex: 'female' })).toBeCloseTo(1482.75, 5));
  it('other 取平均', () => expect(bmr({ ...base, sex: 'other' })).toBeCloseTo(1565.75, 5));
});

describe('tdee / kcalTarget', () => {
  it('男 PAL1.55：1648.75×1.55 = 2555.5625', () => expect(tdee(mk('male', 1.55, 'maintain'))).toBeCloseTo(2555.5625, 5));
  it('男減脂：2555.5625×0.8 = 2044.45 → 2044', () => expect(kcalTarget(mk('male', 1.55, 'cut'))).toBe(2044));
  it('女維持 PAL1.375：1482.75×1.375 = 2038.78 → 2039', () => expect(kcalTarget(mk('female', 1.375, 'maintain'))).toBe(2039));
  it('other 增肌 PAL1.2：1565.75×1.2×1.1 = 2066.79 → 2067', () => expect(kcalTarget(mk('other', 1.2, 'bulk'))).toBe(2067));
});

describe('goalMultiplier', () => {
  it('倍率', () => {
    expect(goalMultiplier('cut')).toBe(0.8);
    expect(goalMultiplier('maintain')).toBe(1.0);
    expect(goalMultiplier('bulk')).toBe(1.1);
  });
});

describe('macros', () => {
  it('1870 kcal → 164/117/83（實測）', () => {
    expect(macrosFromKcal(1870)).toEqual({ proteinG: 164, carbG: 117, fatG: 83 });
  });
  it('(164,117,83) → 1871（實測）', () => {
    expect(kcalFromMacros({ proteinG: 164, carbG: 117, fatG: 83 })).toBe(1871);
  });
});

describe('remainingKcal', () => {
  it('不計運動', () => expect(remainingKcal({ target: 2000, eaten: 500, burn: 300, countBurn: false })).toBe(1500));
  it('計入運動', () => expect(remainingKcal({ target: 2000, eaten: 500, burn: 300, countBurn: true })).toBe(1800));
});

describe('PAL_LEVELS', () => {
  it('五級係數與名稱', () => {
    expect(PAL_LEVELS.map((l) => l.value)).toEqual([1.2, 1.375, 1.55, 1.725, 1.9]);
    expect(PAL_LEVELS[0].label).toContain('久坐');
  });
});

describe('防護', () => {
  const p: Profile = { sex: 'female', age: 30, heightCm: 160, weightKg: 50, pal: 1.55, goal: 'maintain' };
  it('體重 0、身高 0 的女性 BMR 為負 → 0', () => {
    expect(bmr({ sex: 'female', age: 30, heightCm: 0, weightKg: 0 })).toBe(0);
  });
  it('女性小體型高齡負 BMR → 0，下游全為 0', () => {
    const small: Profile = { ...p, age: 80, heightCm: 50, weightKg: 10 };
    expect(bmr(small)).toBe(0);
    expect(tdee(small)).toBe(0);
    expect(kcalTarget(small)).toBe(0);
  });
  it('NaN／Infinity 輸入 → 0', () => {
    expect(bmr({ sex: 'male', age: NaN, heightCm: 170, weightKg: 70 })).toBe(0);
    expect(tdee({ ...p, pal: NaN })).toBe(0);
    expect(kcalTarget({ ...p, weightKg: Infinity })).toBe(0);
  });
  it('年齡負值不產生 NaN／負數', () => {
    const v = bmr({ sex: 'male', age: -10, heightCm: 170, weightKg: 70 });
    expect(Number.isFinite(v) && v >= 0).toBe(true);
  });
  it('macrosFromKcal 非有限或負 → 0', () => {
    for (const k of [NaN, -100, Infinity]) expect(macrosFromKcal(k)).toEqual({ proteinG: 0, carbG: 0, fatG: 0 });
  });
  it('remainingKcal：burn null／NaN 視為 0', () => {
    expect(remainingKcal({ target: 2000, eaten: 500, burn: null, countBurn: true })).toBe(1500);
    expect(remainingKcal({ target: 2000, eaten: 500, burn: NaN, countBurn: true })).toBe(1500);
  });
  it('isValidPal', () => {
    for (const l of PAL_LEVELS) expect(isValidPal(l.value)).toBe(true);
    for (const v of [0, -1, NaN, Infinity, 5]) expect(isValidPal(v)).toBe(false);
  });
});
