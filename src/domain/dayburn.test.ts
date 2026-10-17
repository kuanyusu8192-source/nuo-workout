import { describe, expect, it } from 'vitest';
import { estimateDayBurn } from './dayburn';

const MIN = 60_000;
const strengthSet = (sessionId = 's1') => ({ sessionId, kind: 'strength' as const });
const base = { weightKg: 70, metStrength: 5.0 };

describe('estimateDayBurn：重訓時間', () => {
  it('1 組、補記／未結束 → 3 分鐘：5.0 MET × 70kg × 3/60h = 17.5，四捨五入為 18（VolumeX 顯示 17，差 1 為取整方式）', () => {
    const r = estimateDayBurn({ ...base, sessions: [{ id: 's1', startedAt: 0 }], sets: [strengthSet()] });
    expect(r).toEqual({ kcal: 18, strengthMinutes: 3, cardioMinutes: 0 });
  });
  it('已結束但不到 5 分鐘（誤觸開始又結束）→ 仍每組 3 分鐘，不用那 1 分鐘', () => {
    const r = estimateDayBurn({ ...base, sessions: [{ id: 's1', startedAt: 0, endedAt: 1 * MIN }], sets: [strengthSet()] });
    expect(r.kcal).toBe(18);
    expect(r.strengthMinutes).toBe(3);
  });
  it('已結束且 >= 5 分鐘 → 用整場時長：30 分鐘 → 175 kcal', () => {
    const r = estimateDayBurn({ ...base, sessions: [{ id: 's1', startedAt: 0, endedAt: 30 * MIN }], sets: [strengthSet(), strengthSet()] });
    expect(r).toEqual({ kcal: 175, strengthMinutes: 30, cardioMinutes: 0 });
  });
  it('剛好 5 分鐘算有計時', () => {
    const r = estimateDayBurn({ ...base, sessions: [{ id: 's1', startedAt: 0, endedAt: 5 * MIN }], sets: [strengthSet()] });
    expect(r.strengthMinutes).toBe(5);
  });
  it('整場時長扣掉有氧分鐘', () => {
    const r = estimateDayBurn({
      ...base,
      sessions: [{ id: 's1', startedAt: 0, endedAt: 40 * MIN }],
      sets: [strengthSet(), { sessionId: 's1', kind: 'cardio', durationSec: 600, exerciseName: '橢圓機' }],
    });
    expect(r.strengthMinutes).toBe(30);
    expect(r.cardioMinutes).toBe(10);
    expect(r.kcal).toBe(Math.round((5 * 70 * 30) / 60 + (5.0 * 70 * 10) / 60)); // 橢圓機 5.0 MET
  });
  it('沒有 session 資料時（孤兒組）每組 3 分鐘', () => {
    const r = estimateDayBurn({ ...base, sessions: [], sets: [{ kind: 'strength' }, { kind: 'strength' }] });
    expect(r.strengthMinutes).toBe(6);
  });
  it('補記場次（mode=backfill）即使有 >= 5 分鐘的 start~end 也不採用，每組 3 分鐘', () => {
    const r = estimateDayBurn({ ...base, sessions: [{ id: 's1', mode: 'backfill', startedAt: 0, endedAt: 30 * MIN }], sets: [strengthSet()] });
    expect(r.strengthMinutes).toBe(3);
    expect(r.kcal).toBe(18);
  });
  it('兩場：一場有計時、一場補記，分別計算再相加', () => {
    const r = estimateDayBurn({
      ...base,
      sessions: [{ id: 'a', startedAt: 0, endedAt: 20 * MIN }, { id: 'b', startedAt: 0 }],
      sets: [strengthSet('a'), strengthSet('b'), strengthSet('b')],
    });
    expect(r.strengthMinutes).toBe(26);
  });
});

describe('estimateDayBurn：有氧、伸展、體重、覆寫', () => {
  it('有氧有速度用 ACSM；無速度查表（用動作名稱）；查不到 6.0', () => {
    const one = (s: object) => estimateDayBurn({ ...base, sessions: [{ id: 's1', startedAt: 0 }], sets: [{ sessionId: 's1', kind: 'cardio', durationSec: 3600, ...s }] });
    expect(one({ exerciseName: '跑步機', speed: 6, incline: 0 }).kcal).toBe(Math.round((13.5 / 3.5) * 70));
    expect(one({ exerciseName: '橢圓機' }).kcal).toBe(350);
    expect(one({ exerciseName: '不明有氧' }).kcal).toBe(420);
    expect(one({}).kcal).toBe(420);
    expect(one({ exerciseName: '橢圓機' }).cardioMinutes).toBe(60);
  });
  it('伸展不計', () => {
    const r = estimateDayBurn({ ...base, sessions: [{ id: 's1', startedAt: 0 }], sets: [{ sessionId: 's1', kind: 'stretch', durationSec: 600 }] });
    expect(r).toEqual({ kcal: 0, strengthMinutes: 0, cardioMinutes: 0 });
  });
  it('沒有體重 → kcal null', () => {
    for (const weightKg of [null, undefined, 0]) {
      expect(estimateDayBurn({ ...base, weightKg, sessions: [], sets: [{ kind: 'strength' }] }).kcal).toBeNull();
    }
  });
  it('override 優先（含 0；沒體重也採用）；無效 override 忽略', () => {
    const args = { ...base, sessions: [], sets: [{ kind: 'strength' as const }] };
    expect(estimateDayBurn({ ...args, override: 321 }).kcal).toBe(321);
    expect(estimateDayBurn({ ...args, override: 0 }).kcal).toBe(0);
    expect(estimateDayBurn({ ...args, weightKg: null, override: 99 }).kcal).toBe(99);
    expect(estimateDayBurn({ ...args, override: null }).kcal).toBe(18);
    expect(estimateDayBurn({ ...args, override: -5 }).kcal).toBe(18);
  });
});
