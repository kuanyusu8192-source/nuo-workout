import type { DateStr, SetRecord } from './types';
import { addDays, weekStart } from './dates';

export type Metric = 'volume' | 'cardioMinutes';
export interface Bar {
  date: string;
  label: string;
  value: number;
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const round1 = (n: number) => Math.round(n * 10) / 10;

/** 每日容量（僅 strength：重量 × 次數） */
export function dailyVolume(sets: SetRecord[]): Record<DateStr, number> {
  const out: Record<DateStr, number> = {};
  for (const s of sets) {
    if (s.kind !== 'strength') continue;
    out[s.date] = (out[s.date] ?? 0) + (s.weightKg ?? 0) * (s.reps ?? 0);
  }
  return out;
}

/** 每日有氧分鐘（四捨五入到 0.1） */
export function dailyCardioMinutes(sets: SetRecord[]): Record<DateStr, number> {
  const sec: Record<DateStr, number> = {};
  for (const s of sets) {
    if (s.kind !== 'cardio') continue;
    sec[s.date] = (sec[s.date] ?? 0) + (s.durationSec ?? 0);
  }
  const out: Record<DateStr, number> = {};
  for (const d of Object.keys(sec)) out[d] = round1(sec[d] / 60);
  return out;
}

const dailyOf = (sets: SetRecord[], metric: Metric) =>
  metric === 'volume' ? dailyVolume(sets) : dailyCardioMinutes(sets);

/** 一週七筆（週一到週日） */
export function weekBars(sets: SetRecord[], anyDateInWeek: DateStr, metric: Metric = 'volume'): Bar[] {
  const daily = dailyOf(sets, metric);
  const start = weekStart(anyDateInWeek);
  return WEEK_LABELS.map((label, i) => {
    const date = addDays(start, i);
    return { date, label, value: daily[date] ?? 0 };
  });
}

/** 當月每日 */
export function monthBars(sets: SetRecord[], anyDateInMonth: DateStr, metric: Metric = 'volume'): Bar[] {
  const daily = dailyOf(sets, metric);
  const [y, m] = anyDateInMonth.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const prefix = anyDateInMonth.slice(0, 7);
  return Array.from({ length: days }, (_, i) => {
    const date = `${prefix}-${String(i + 1).padStart(2, '0')}`;
    return { date, label: String(i + 1), value: daily[date] ?? 0 };
  });
}

/** 一年 12 個月加總 */
export function yearBars(sets: SetRecord[], year: number, metric: Metric = 'volume'): Bar[] {
  const daily = dailyOf(sets, metric);
  const sums = new Array<number>(12).fill(0);
  for (const [date, v] of Object.entries(daily)) {
    const [y, m] = date.split('-').map(Number);
    if (y === year) sums[m - 1] += v;
  }
  return sums.map((v, i) => ({
    date: `${year}-${String(i + 1).padStart(2, '0')}`,
    label: `${i + 1}月`,
    value: round1(v),
  }));
}

/** 當月有任何紀錄的不重複日期數 */
export function trainingDays(sets: SetRecord[], anyDateInMonth: DateStr): number {
  const prefix = anyDateInMonth.slice(0, 7);
  return new Set(sets.filter((s) => s.date.startsWith(prefix)).map((s) => s.date)).size;
}

/** 從本週往回連續有紀錄的週數；本週尚無則從上週起算 */
export function streakWeeks(sets: SetRecord[], today: DateStr): number {
  const weeks = new Set(sets.map((s) => weekStart(s.date)));
  let w = weekStart(today);
  if (!weeks.has(w)) w = addDays(w, -7);
  let n = 0;
  while (weeks.has(w)) {
    n++;
    w = addDays(w, -7);
  }
  return n;
}

export function daySummary(
  sets: SetRecord[],
  date: DateStr,
): { sets: number; volume: number; cardioMinutes: number; exerciseCount: number } {
  const day = sets.filter((s) => s.date === date);
  return {
    sets: day.length,
    volume: dailyVolume(day)[date] ?? 0,
    cardioMinutes: dailyCardioMinutes(day)[date] ?? 0,
    exerciseCount: new Set(day.map((s) => s.exerciseId)).size,
  };
}
