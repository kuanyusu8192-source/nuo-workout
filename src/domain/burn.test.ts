import { describe, it, expect } from 'vitest';
import { burnKcal, STRENGTH_MET_DEFAULT, strengthMinutes, acsmWalkRunMet, CARDIO_MET_TABLE, applyBurnOverride } from './burn';

describe('burnKcal', () => {
  it('5 MET × 70 kg × 1 h = 350', () => expect(burnKcal({ met: 5, weightKg: 70, minutes: 60 })).toBe(350));
  it('四捨五入：5×70×(20/60)=116.67 → 117', () => expect(burnKcal({ met: 5, weightKg: 70, minutes: 20 })).toBe(117));
  it('體重缺或 <=0 → null', () => {
    expect(burnKcal({ met: 5, weightKg: undefined, minutes: 60 })).toBeNull();
    expect(burnKcal({ met: 5, weightKg: 0, minutes: 60 })).toBeNull();
  });
  it('minutes<=0 → 0', () => expect(burnKcal({ met: 5, weightKg: 70, minutes: 0 })).toBe(0));
});

describe('strength', () => {
  it('預設 MET', () => expect(STRENGTH_MET_DEFAULT).toBe(5.0));
  it('有計時器用計時器', () => expect(strengthMinutes({ timerSeconds: 1800, setCount: 10 })).toBe(30));
  it('無計時器每組 3 分鐘', () => expect(strengthMinutes({ setCount: 4 })).toBe(12));
});

describe('acsmWalkRunMet', () => {
  // 8 km/h = 133.333 m/min；跑步 VO2 = 0.2×133.333 + 0.9×133.333×0.01 + 3.5 = 26.667+1.2+3.5 = 31.367；MET = 8.962
  it('跑 8 km/h 坡度 1%', () => expect(acsmWalkRunMet({ speedKmh: 8, inclinePct: 1 })).toBeCloseTo(8.962, 2));
  // 6 km/h = 100 m/min（走路）；VO2 = 10 + 0 + 3.5 = 13.5；MET = 3.857
  it('走 6 km/h 平地', () => expect(acsmWalkRunMet({ speedKmh: 6, inclinePct: 0 })).toBeCloseTo(3.857, 2));
  // 5 km/h = 83.333 m/min；坡度 5%：VO2 = 8.333 + 1.8×83.333×0.05 + 3.5 = 8.333+7.5+3.5 = 19.333；MET = 5.524
  it('走 5 km/h 坡度 5%', () => expect(acsmWalkRunMet({ speedKmh: 5, inclinePct: 5 })).toBeCloseTo(5.524, 2));
});

describe('acsmWalkRunMet 連續性（100–133.33 m/min 線性內插）', () => {
  const f = (v: number) => acsmWalkRunMet({ speedKmh: v, inclinePct: 0 });
  it('邊界相鄰值差距 < 0.6 MET', () => {
    for (const v of [6, 7, 8]) expect(Math.abs(f(v + 0.01) - f(v))).toBeLessThan(0.6);
    expect(Math.abs(f(6.01) - f(6))).toBeLessThan(0.6);
    expect(Math.abs(f(8.01) - f(8))).toBeLessThan(0.6);
  });
  it('3–12 km/h 以 0.01 掃描無斷崖且單調不減', () => {
    let prev = f(3);
    for (let v = 3.01; v <= 12; v += 0.01) {
      const cur = f(v);
      expect(cur - prev).toBeGreaterThanOrEqual(0);
      expect(cur - prev).toBeLessThan(0.6);
      prev = cur;
    }
  });
  it('8 km/h 為純跑步式、6 km/h 為純走路式', () => {
    expect(f(8)).toBeCloseTo((0.2 * (8000 / 60) + 3.5) / 3.5, 6);
    expect(f(6)).toBeCloseTo(13.5 / 3.5, 6);
  });
  it('7 km/h 介於兩式之間', () => {
    expect(f(7)).toBeGreaterThan(f(6));
    expect(f(7)).toBeLessThan(f(8));
  });
});

describe('防護', () => {
  it('burnKcal：met 非有限或負值 → null；Infinity 輸入 → null', () => {
    for (const met of [NaN, -1, Infinity]) expect(burnKcal({ met, weightKg: 70, minutes: 60 })).toBeNull();
    expect(burnKcal({ met: 5, weightKg: Infinity, minutes: 60 })).toBeNull();
    expect(burnKcal({ met: 5, weightKg: 70, minutes: Infinity })).toBeNull();
    expect(burnKcal({ met: 5, weightKg: 70, minutes: NaN })).toBe(0);
  });
  it('applyBurnOverride：NaN／負值／Infinity 退回自動', () => {
    for (const o of [NaN, -5, Infinity]) expect(applyBurnOverride(100, o)).toBe(100);
    expect(applyBurnOverride(null, NaN)).toBeNull();
  });
  it('strengthMinutes：setCount 負值／NaN 視為 0', () => {
    expect(strengthMinutes({ setCount: -4 })).toBe(0);
    expect(strengthMinutes({ setCount: NaN })).toBe(0);
    expect(strengthMinutes({ timerSeconds: NaN, setCount: 2 })).toBe(6);
    expect(strengthMinutes({ timerSeconds: Infinity, setCount: 2 })).toBe(6);
  });
});

describe('CARDIO_MET_TABLE', () => {
  it('含常用項目', () => {
    const m = Object.fromEntries(CARDIO_MET_TABLE.map((e) => [e.id, e.met]));
    expect(m.elliptical).toBe(5.0);
    expect(m.rowing).toBe(7.0);
    expect(m.stationary_bike).toBe(6.8);
    expect(m.stair_climber).toBe(9.0);
    expect(m.jump_rope).toBe(11.0);
    expect(m.burpee).toBe(8.0);
    expect(CARDIO_MET_TABLE.every((e) => e.name.length > 0)).toBe(true);
  });
});

describe('applyBurnOverride', () => {
  it('無覆寫用自動', () => {
    expect(applyBurnOverride(100)).toBe(100);
    expect(applyBurnOverride(100, null)).toBe(100);
    expect(applyBurnOverride(null, undefined)).toBeNull();
  });
  it('有值優先，0 有效', () => {
    expect(applyBurnOverride(100, 250)).toBe(250);
    expect(applyBurnOverride(100, 0)).toBe(0);
    expect(applyBurnOverride(null, 80)).toBe(80);
  });
});
