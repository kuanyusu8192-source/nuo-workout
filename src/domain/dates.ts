import type { DateStr } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Date -> 本地 YYYY-MM-DD（不經 toISOString，避免時區位移） */
export function toDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM-DD -> 本地午夜 Date */
export function parseDateStr(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: DateStr, n: number): DateStr {
  const d = parseDateStr(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** 0=週日 … 6=週六 */
export function weekdayOf(s: DateStr): number {
  return parseDateStr(s).getDay();
}

/** 該日所在週的週一 */
export function weekStart(s: DateStr): DateStr {
  return addDays(s, -((weekdayOf(s) + 6) % 7));
}

export function isSameMonth(a: DateStr, b: DateStr): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}
