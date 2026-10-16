import { describe, it, expect } from 'vitest';
import { todayTemplateId, planForDate } from './plan';
import type { Plan } from './types';

const p1: Plan = { id: 'p1', name: 'A', days: { 0: null, 1: 'push', 3: 'pull', 5: 'legs' } };
const p2: Plan = { id: 'p2', name: 'B', days: { 1: 'x' } };

describe('plan', () => {
  it('todayTemplateId 依星期取課表', () => {
    expect(todayTemplateId(p1, '2026-10-19')).toBe('push'); // 週一
    expect(todayTemplateId(p1, '2026-10-21')).toBe('pull'); // 週三
  });
  it('休息日與未設定日回 null', () => {
    expect(todayTemplateId(p1, '2026-10-18')).toBeNull(); // 週日 null
    expect(todayTemplateId(p1, '2026-10-20')).toBeNull(); // 週二未設定
  });
  it('planForDate 找啟用中計畫', () => {
    expect(planForDate([p1, p2], 'p2', '2026-10-19')).toEqual({ plan: p2, templateId: 'x' });
    expect(planForDate([p1, p2], 'p1', '2026-10-20')).toEqual({ plan: p1, templateId: null });
  });
  it('找不到啟用中計畫回 null', () => {
    expect(planForDate([p1], 'zzz', '2026-10-19')).toBeNull();
    expect(planForDate([], 'p1', '2026-10-19')).toBeNull();
  });
});
