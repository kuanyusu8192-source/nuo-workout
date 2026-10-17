/**
 * 單日運動消耗的唯一算法：今日紀錄彈窗、歷史日曆、飲食頁都呼叫這裡，不要各自再算一份。
 *
 * 規則：
 * - 重訓時間：該場有結束時間且時長 >= 5 分鐘 → 用整場時長扣掉該場有氧分鐘；
 *   否則（太短、未結束、補記、找不到所屬場次）→ 每個重訓組 3 分鐘。
 *   （對照 VolumeX 實測：1 組 → 17 kcal ≈ 5.0 MET × 70kg × 3/60h = 17.5；NUO 四捨五入得 18。）
 * - 有氧：有速度用 ACSM，否則依動作名稱查 CARDIO_MET_TABLE，查不到 6.0。
 * - 伸展不計。沒有體重 → kcal null。override（手動覆寫）優先。
 */
import { CARDIO_MET_TABLE, acsmWalkRunMet, applyBurnOverride } from './burn';

export const MIN_TIMED_SESSION_MIN = 5;
export const MINUTES_PER_STRENGTH_SET = 3;
export const CARDIO_MET_FALLBACK = 6;

export interface DayBurnSession {
  id?: string;
  startedAt: number;
  endedAt?: number;
  /** backfill＝補記：start~end 只是補登的時間，不是真實訓練時長 */
  mode?: string;
}

export interface DayBurnSet {
  /** 所屬場次；缺或找不到對應場次的組一律每組 3 分鐘 */
  sessionId?: string;
  kind: 'strength' | 'cardio' | 'stretch';
  durationSec?: number;
  speed?: number;
  incline?: number;
  /** 有氧無速度時用名稱查 MET 表 */
  exerciseName?: string;
}

export interface DayBurn {
  kcal: number | null;
  strengthMinutes: number;
  cardioMinutes: number;
}

function cardioMet(s: DayBurnSet): number {
  if (s.speed && s.speed > 0) return acsmWalkRunMet({ speedKmh: s.speed, inclinePct: s.incline ?? 0 });
  const name = s.exerciseName ?? '';
  const hit = name ? CARDIO_MET_TABLE.find((m) => name.includes(m.name.split('（')[0])) : undefined;
  return hit?.met ?? CARDIO_MET_FALLBACK;
}

const sec = (s: DayBurnSet): number => (s.durationSec && s.durationSec > 0 && Number.isFinite(s.durationSec) ? s.durationSec : 0);

export function estimateDayBurn(a: {
  sessions: ReadonlyArray<DayBurnSession>;
  sets: ReadonlyArray<DayBurnSet>;
  weightKg: number | null | undefined;
  metStrength: number;
  override?: number | null;
}): DayBurn {
  const cardio = a.sets.filter((s) => s.kind === 'cardio');
  const cardioMinutes = cardio.reduce((m, s) => m + sec(s) / 60, 0);

  const ids = new Set(a.sessions.flatMap((s) => (s.id ? [s.id] : [])));
  let strengthMinutes = 0;
  for (const s of a.sessions) {
    const mine = a.sets.filter((x) => s.id !== undefined && x.sessionId === s.id);
    const count = mine.filter((x) => x.kind === 'strength').length;
    if (count === 0) continue;
    const durMin = s.endedAt != null && s.mode !== 'backfill' ? (s.endedAt - s.startedAt) / 60000 : 0;
    if (durMin >= MIN_TIMED_SESSION_MIN) {
      const cardioMin = mine.filter((x) => x.kind === 'cardio').reduce((m, x) => m + sec(x) / 60, 0);
      strengthMinutes += Math.max(0, durMin - cardioMin);
    } else {
      strengthMinutes += count * MINUTES_PER_STRENGTH_SET;
    }
  }
  const orphans = a.sets.filter((x) => x.kind === 'strength' && !(x.sessionId && ids.has(x.sessionId))).length;
  strengthMinutes += orphans * MINUTES_PER_STRENGTH_SET;

  let auto: number | null = null;
  const w = a.weightKg;
  if (w != null && w > 0 && Number.isFinite(w) && Number.isFinite(a.metStrength) && a.metStrength >= 0) {
    let total = (a.metStrength * w * strengthMinutes) / 60;
    for (const s of cardio) total += (cardioMet(s) * w * (sec(s) / 60)) / 60;
    auto = Math.round(total);
  }
  return { kcal: applyBurnOverride(auto, a.override), strengthMinutes, cardioMinutes };
}
