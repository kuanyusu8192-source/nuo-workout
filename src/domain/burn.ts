/** 運動消耗：MET × 體重kg × 小時。 */

/** 重訓預設 MET。 */
export const STRENGTH_MET_DEFAULT = 5.0;

/** 回傳整數 kcal；體重缺或 <=0 回 null；minutes<=0 回 0。 */
export function burnKcal(a: { met: number; weightKg?: number | null; minutes: number }): number | null {
  if (a.weightKg == null || !(a.weightKg > 0)) return null;
  if (!(a.minutes > 0)) return 0;
  return Math.round(a.met * a.weightKg * (a.minutes / 60));
}

/** 重訓時間（分）：有計時器用計時器，否則每組 3 分鐘。 */
export function strengthMinutes(a: { timerSeconds?: number; setCount: number }): number {
  if (a.timerSeconds != null && a.timerSeconds > 0) return a.timerSeconds / 60;
  return a.setCount * 3;
}

/** ACSM 跑步／走路 MET。speed<=100 m/min（約 6 km/h）視為走路，否則跑步。 */
export function acsmWalkRunMet(a: { speedKmh: number; inclinePct: number }): number {
  const speed = (a.speedKmh * 1000) / 60;
  const grade = a.inclinePct / 100;
  const vo2 =
    speed <= 100
      ? 0.1 * speed + 1.8 * speed * grade + 3.5
      : 0.2 * speed + 0.9 * speed * grade + 3.5;
  return vo2 / 3.5;
}

/**
 * 其他有氧常用 MET，為 Compendium of Physical Activities 的近似值，
 * 供使用者自行調整。
 */
export const CARDIO_MET_TABLE: ReadonlyArray<{ id: string; name: string; met: number }> = [
  { id: 'elliptical', name: '橢圓機', met: 5.0 },
  { id: 'rowing', name: '划船機', met: 7.0 },
  { id: 'stationary_bike', name: '固定自行車（中等強度）', met: 6.8 },
  { id: 'stair_climber', name: '爬樓梯機', met: 9.0 },
  { id: 'jump_rope', name: '跳繩', met: 11.0 },
  { id: 'burpee', name: '波比跳', met: 8.0 },
];

/** override 為 null／undefined 用自動；有值（含 0）優先。 */
export function applyBurnOverride(auto: number | null, override?: number | null): number | null {
  return override == null ? auto : override;
}
