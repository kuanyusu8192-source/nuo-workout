import type { DateStr, Plan } from './types';
import { weekdayOf } from './dates';

/** 該日對應的課表範本 id；休息或未設定回 null */
export function todayTemplateId(plan: Plan, date: DateStr): string | null {
  return plan.days[weekdayOf(date)] ?? null;
}

/** 啟用中計畫與該日課表；找不到啟用中計畫回 null */
export function planForDate(
  plans: Plan[],
  activePlanId: string,
  date: DateStr,
): { plan: Plan; templateId: string | null } | null {
  const plan = plans.find((p) => p.id === activePlanId);
  if (!plan) return null;
  return { plan, templateId: todayTemplateId(plan, date) };
}
