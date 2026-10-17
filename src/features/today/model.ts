/** 今日訓練的純邏輯：欄位驗證、單位換算、消耗估算、PR 文案。不依賴 DOM 與資料庫。 */
import type { Exercise, SetRow, TrackingType } from '../../data/types';
import type { PrKind } from '../../domain/pr';
import { num, peakE1rm, totalVolume } from '../../domain/strength';
import type { SetKind, SetRecord } from '../../domain/types';

export type LoadUnit = 'kg' | 'lb';

/** 一列輸入框的內容（重量為「顯示單位」，儲存時才換成 kg）。null = 空白或不合法。 */
export interface Values {
  weight: number | null;
  reps: number | null;
  minutes: number | null;
  speed: number | null;
  incline: number | null;
  seconds: number | null;
}

export const EMPTY_VALUES: Values = { weight: null, reps: null, minutes: null, speed: null, incline: null, seconds: null };

/** 寫入 SetRepo 的欄位（沒用到的明確給 undefined，更新時才會清掉舊值） */
export interface SetFields {
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  distanceM?: number;
  speed?: number;
  incline?: number;
}

const KG_PER_LB = 1 / 2.2046226218;
const round = (n: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export const kgToDisplay = (kg: number, unit: LoadUnit): number => (unit === 'lb' ? round(kg / KG_PER_LB, 1) : kg);
export const displayToKg = (v: number, unit: LoadUnit): number => (unit === 'lb' ? round(v * KG_PER_LB, 3) : v);

/** 12345 → "12,345"；最多 1 位小數 */
export const fmtNum = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { maximumFractionDigits: 1 });

/** 自重動作（伏地挺身、棒式…）重量可以留空 */
export const isBodyweight = (ex: Pick<Exercise, 'equipment' | 'trackingType'>): boolean =>
  ex.trackingType === 'strength' && ex.equipment === '自重';

export const kindOf = (t: TrackingType): SetKind => t;

/** 這一列是否「填完」：填完才會存檔。 */
export function isComplete(tracking: TrackingType, v: Values, bodyweight: boolean): boolean {
  switch (tracking) {
    case 'strength':
      return v.reps !== null && v.reps >= 1 && (v.weight !== null || bodyweight);
    case 'cardio':
      return v.minutes !== null && v.minutes > 0;
    case 'stretch':
      return v.seconds !== null && v.seconds > 0;
  }
}

export function toSetFields(kind: SetKind, v: Values, unit: LoadUnit): SetFields {
  const f: SetFields = { weightKg: undefined, reps: undefined, durationSec: undefined, distanceM: undefined, speed: undefined, incline: undefined };
  if (kind === 'strength') {
    f.weightKg = v.weight === null ? undefined : displayToKg(v.weight, unit);
    f.reps = v.reps ?? undefined;
  } else if (kind === 'cardio') {
    const minutes = v.minutes ?? 0;
    f.durationSec = Math.round(minutes * 60);
    f.speed = v.speed ?? undefined;
    f.incline = v.incline ?? undefined;
    if (v.speed && v.speed > 0 && minutes > 0) f.distanceM = Math.round((v.speed * minutes * 1000) / 60);
  } else {
    f.durationSec = Math.round(v.seconds ?? 0);
  }
  return f;
}

export function valuesFromSet(s: SetFields, unit: LoadUnit): Values {
  return {
    weight: s.weightKg === undefined ? null : kgToDisplay(s.weightKg, unit),
    reps: s.reps ?? null,
    minutes: s.durationSec === undefined ? null : round(s.durationSec / 60, 2),
    speed: s.speed ?? null,
    incline: s.incline ?? null,
    seconds: s.durationSec ?? null,
  };
}

/** 資料列 → 欄位（排除 id 等中繼欄位） */
export const fieldsOfRow = (r: SetRow): SetFields => ({
  weightKg: r.weightKg, reps: r.reps, durationSec: r.durationSec, distanceM: r.distanceM, speed: r.speed, incline: r.incline,
});

// ---------- PR 文案 ----------

/** 依優先序（最大重量 > 預估 1RM > 單日容量）產生慶祝頁的「新高」文字，數值用顯示單位。 */
export function buildPrLabel(kinds: PrKind[], current: SetRecord[], unit: LoadUnit): string {
  const strength = current.filter((s) => s.kind === 'strength');
  if (kinds.includes('weight')) {
    const best = strength.reduce((m, s) => Math.max(m, num(s.weightKg)), 0);
    return `最大重量 ${fmtNum(kgToDisplay(best, unit))} ${unit}`;
  }
  if (kinds.includes('e1rm')) {
    return `預估 1RM ${fmtNum(kgToDisplay(peakE1rm(strength), unit))} ${unit}`;
  }
  return `單日容量 ${fmtNum(kgToDisplay(totalVolume(strength), unit))} ${unit}`;
}
