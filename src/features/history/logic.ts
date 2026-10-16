/** 歷史畫面用的純函式：全部由 SetRecord 即時計算，不存快取。 */
import type { BodyMetric, Exercise } from '../../data/types';
import { acsmWalkRunMet, burnKcal, CARDIO_MET_TABLE, strengthMinutes } from '../../domain/burn';
import { e1rm, num } from '../../domain/strength';
import type { DateStr, SetRecord } from '../../domain/types';

/** 有氧動作不在 MET 表、也沒有速度時使用的預設 MET。 */
export const CARDIO_MET_DEFAULT = 6;

const r2 = (n: number) => Math.round(n * 100) / 100;

const strengthE1rm = (s: SetRecord) => (s.kind === 'strength' ? e1rm(num(s.weightKg), num(s.reps)) : 0);

/** 有有效力量紀錄（e1RM > 0）的動作 id，依最近一次紀錄日期新到舊。 */
export function strengthExerciseIds(sets: SetRecord[]): string[] {
  const latest = new Map<string, DateStr>();
  for (const s of sets) {
    if (strengthE1rm(s) <= 0) continue;
    if ((latest.get(s.exerciseId) ?? '') < s.date) latest.set(s.exerciseId, s.date);
  }
  return [...latest.entries()].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0)).map(([id]) => id);
}

export interface E1rmPoint {
  date: DateStr;
  e1rm: number;
  bestSet: { weightKg: number; reps: number };
  /** 該日 e1RM 嚴格高於之前所有紀錄（首筆視為新高，與 domain/pr 一致） */
  isPr: boolean;
}

/** 單一動作的每日最佳 e1RM（日期由舊到新）。 */
export function e1rmSeries(sets: SetRecord[], exerciseId: string): E1rmPoint[] {
  const byDate = new Map<DateStr, E1rmPoint>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId) continue;
    const v = strengthE1rm(s);
    if (v <= 0) continue;
    const cur = byDate.get(s.date);
    if (!cur || v > cur.e1rm) {
      byDate.set(s.date, { date: s.date, e1rm: v, bestSet: { weightKg: num(s.weightKg), reps: num(s.reps) }, isPr: false });
    }
  }
  const out = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  let best = -1;
  for (const p of out) {
    p.isPr = r2(p.e1rm) > r2(best);
    best = Math.max(best, p.e1rm);
  }
  return out;
}

/** 某日消耗（kcal，整數）。體重缺回 null；只有伸展或無紀錄回 0。 */
export function dayBurnKcal(a: {
  sets: SetRecord[];
  exercises: Map<string, Exercise>;
  weightKg: number | null | undefined;
  metStrength: number;
}): number | null {
  const strengthCount = a.sets.filter((s) => s.kind === 'strength').length;
  const cardio = a.sets.filter((s) => s.kind === 'cardio');
  if (strengthCount === 0 && cardio.length === 0) return 0;
  if (a.weightKg == null || !(a.weightKg > 0)) return null;
  let total = 0;
  if (strengthCount > 0) {
    total += burnKcal({ met: a.metStrength, weightKg: a.weightKg, minutes: strengthMinutes({ setCount: strengthCount }) }) ?? 0;
  }
  for (const s of cardio) {
    const minutes = num(s.durationSec) / 60;
    const met =
      num(s.speed) > 0
        ? acsmWalkRunMet({ speedKmh: num(s.speed), inclinePct: num(s.incline) })
        : CARDIO_MET_TABLE.find((t) => s.exerciseId.includes(t.id))?.met ?? CARDIO_MET_DEFAULT;
    total += burnKcal({ met, weightKg: a.weightKg, minutes }) ?? 0;
  }
  return total;
}

/** 由動作 category 彙整肌群（去重、保留出現順序）。 */
export function muscleGroups(sets: SetRecord[], exercises: Map<string, Exercise>): string[] {
  const out: string[] = [];
  for (const s of sets) {
    const c = exercises.get(s.exerciseId)?.category;
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/** 該日（含）以前最新一筆有體重的紀錄；沒有則用 fallback；都沒有 null。 */
export function weightOn(metrics: BodyMetric[], date: DateStr, fallback?: number): number | null {
  let best: BodyMetric | undefined;
  for (const m of metrics) {
    if (m.date > date || !(num(m.weightKg) > 0)) continue;
    if (!best || m.date >= best.date) best = m;
  }
  return best?.weightKg ?? (fallback && fallback > 0 ? fallback : null);
}

export const fmt1 = (n: number) => String(Math.round(n * 10) / 10);
export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
