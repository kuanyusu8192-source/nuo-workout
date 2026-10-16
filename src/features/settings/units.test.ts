import { describe, expect, it } from 'vitest';
import { KG_PER_LB, formatWeight, fromDisplayWeight, kgToLb, lbToKg, toDisplayWeight } from './units';

describe('kg ↔ lb 換算', () => {
  it('常數為國際磅 0.45359237', () => {
    expect(KG_PER_LB).toBe(0.45359237);
  });
  it('kgToLb：100 kg ≈ 220.462 lb、0 → 0', () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 3);
    expect(kgToLb(0)).toBe(0);
  });
  it('lbToKg：220.462 lb ≈ 100 kg、135 lb ≈ 61.235 kg', () => {
    expect(lbToKg(220.462)).toBeCloseTo(100, 2);
    expect(lbToKg(135)).toBeCloseTo(61.235, 3);
  });
  it('往返誤差極小', () => {
    for (const kg of [0.5, 20, 62.5, 70, 123.45, 300]) {
      expect(lbToKg(kgToLb(kg))).toBeCloseTo(kg, 9);
    }
  });
  it('非有限值回傳 NaN 以外的安全值：NaN 輸入得 NaN（由呼叫端驗證）', () => {
    expect(Number.isNaN(kgToLb(Number.NaN))).toBe(true);
  });
});

describe('顯示用 helper', () => {
  it('toDisplayWeight：kg 原樣、lb 換算，皆四捨五入到 1 位小數', () => {
    expect(toDisplayWeight(70, 'kg')).toBe(70);
    expect(toDisplayWeight(70.04, 'kg')).toBe(70);
    expect(toDisplayWeight(70, 'lb')).toBe(154.3);
    expect(toDisplayWeight(100, 'lb')).toBe(220.5);
  });
  it('fromDisplayWeight：回存 kg，保留 2 位小數', () => {
    expect(fromDisplayWeight(70, 'kg')).toBe(70);
    expect(fromDisplayWeight(154.3, 'lb')).toBe(69.99);
    expect(fromDisplayWeight(220.5, 'lb')).toBe(100.02);
  });
  it('formatWeight：附單位字串；整數不帶小數點', () => {
    expect(formatWeight(70, 'kg')).toBe('70 kg');
    expect(formatWeight(72.5, 'kg')).toBe('72.5 kg');
    expect(formatWeight(70, 'lb')).toBe('154.3 lb');
  });
});
