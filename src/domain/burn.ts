/** 運動消耗：MET × 體重kg × 小時。 */

/** 重訓預設 MET。 */
export const STRENGTH_MET_DEFAULT = 5.0;

/**
 * 回傳整數 kcal；體重缺、<=0 或非有限回 null；met 非有限或負值回 null；
 * minutes 為 Infinity 回 null；minutes<=0 或 NaN 回 0。
 */
export function burnKcal(a: { met: number; weightKg?: number | null; minutes: number }): number | null {
  if (a.weightKg == null || !(a.weightKg > 0) || !Number.isFinite(a.weightKg)) return null;
  if (!Number.isFinite(a.met) || a.met < 0) return null;
  if (!(a.minutes > 0)) return 0;
  if (!Number.isFinite(a.minutes)) return null;
  const k = Math.round(a.met * a.weightKg * (a.minutes / 60));
  return Number.isFinite(k) ? k : null;
}

/** 重訓時間（分）：有計時器用計時器，否則每組 3 分鐘。 */
export function strengthMinutes(a: { timerSeconds?: number; setCount: number }): number {
  if (a.timerSeconds != null && Number.isFinite(a.timerSeconds) && a.timerSeconds > 0) return a.timerSeconds / 60;
  const n = Number.isFinite(a.setCount) ? Math.max(0, a.setCount) : 0;
  return n * 3;
}

/** 走路式適用上限 100 m/min（6 km/h）。 */
const WALK_MAX = 100;
/** 跑步式啟動點：8 km/h = 133.33 m/min，使 8 km/h 恰為純跑步式。 */
const RUN_MIN = 8000 / 60;

/**
 * ACSM 跑步／走路 MET。
 * speed <= 100 m/min（6 km/h）用走路式，>= 133.33 m/min（8 km/h）用跑步式，
 * 中間線性內插兩式結果，消除原本在 6 km/h 的斷崖。
 *
 * 注意：NUO 採 ACSM 公式，不保證與 VolumeX 的數字一致
 * （實測 VolumeX 兩個資料點反推出的體重不一致，代表其公式不同）。
 */
export function acsmWalkRunMet(a: { speedKmh: number; inclinePct: number }): number {
  const speed = (a.speedKmh * 1000) / 60;
  const grade = a.inclinePct / 100;
  const walk = 0.1 * speed + 1.8 * speed * grade + 3.5;
  const run = 0.2 * speed + 0.9 * speed * grade + 3.5;
  const t = Math.min(1, Math.max(0, (speed - WALK_MAX) / (RUN_MIN - WALK_MAX)));
  return (walk + (run - walk) * t) / 3.5;
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

/** override 為 null／undefined／NaN／負值 用自動；有效值（含 0）優先。 */
export function applyBurnOverride(auto: number | null, override?: number | null): number | null {
  if (override == null || !Number.isFinite(override) || override < 0) return auto;
  return override;
}
