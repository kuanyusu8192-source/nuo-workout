import { describe, it, expect } from 'vitest';
import { toDateStr, parseDateStr, addDays, weekStart, isSameMonth, weekdayOf } from './dates';

describe('dates', () => {
  it('toDateStr 用本地日期，不受時區位移', () => {
    expect(toDateStr(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
    expect(toDateStr(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
  it('parseDateStr 還原為本地午夜', () => {
    const d = parseDateStr('2026-03-09');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 9, 0]);
  });
  it('addDays 跨月、跨年、負數', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-01', 0)).toBe('2026-03-01');
  });
  it('weekdayOf：0=週日', () => {
    expect(weekdayOf('2026-10-18')).toBe(0);
    expect(weekdayOf('2026-10-19')).toBe(1);
    expect(weekdayOf('2026-10-17')).toBe(6);
  });
  it('weekStart 週一為起點，週日歸屬前一個週一', () => {
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
    expect(weekStart('2026-10-18')).toBe('2026-10-12');
    expect(weekStart('2026-10-14')).toBe('2026-10-12');
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });
  it('isSameMonth', () => {
    expect(isSameMonth('2026-10-01', '2026-10-31')).toBe(true);
    expect(isSameMonth('2026-10-31', '2026-11-01')).toBe(false);
    expect(isSameMonth('2025-10-01', '2026-10-01')).toBe(false);
  });
});
