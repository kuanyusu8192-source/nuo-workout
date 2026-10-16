import type { Goal, Macros, Profile } from './types';

/** 活動量等級（PAL）。 */
export const PAL_LEVELS = [
  { value: 1.2, label: '久坐' },
  { value: 1.375, label: '輕度活動' },
  { value: 1.55, label: '中度活動' },
  { value: 1.725, label: '高度活動' },
  { value: 1.9, label: '極高活動' },
] as const;

/** 非有限或負值一律視為 0。 */
const safe = (n: number): number => (Number.isFinite(n) ? Math.max(0, n) : 0);

/** PAL 是否為合理值（有限且介於 1.0–2.5）。供 UI 驗證用。 */
export function isValidPal(p: number): boolean {
  return Number.isFinite(p) && p >= 1 && p <= 2.5;
}

/** Mifflin–St Jeor 基礎代謝率（kcal/日）。other 取男女平均。 */
export function bmr(p: Pick<Profile, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  if (p.sex === 'male') return safe(base + 5);
  if (p.sex === 'female') return safe(base - 161);
  return safe(base + (5 - 161) / 2);
}

export function tdee(p: Profile): number {
  return safe(bmr(p) * p.pal);
}

export function goalMultiplier(goal: Goal): number {
  return goal === 'cut' ? 0.8 : goal === 'bulk' ? 1.1 : 1.0;
}

export function kcalTarget(p: Profile): number {
  return safe(Math.round(tdee(p) * goalMultiplier(p.goal)));
}

/** 蛋白 35%／碳水 25%／脂肪 40%，每克 4／4／9 kcal，克數四捨五入。 */
export function macrosFromKcal(kcal: number): Macros {
  kcal = safe(kcal);
  return {
    proteinG: Math.round((kcal * 0.35) / 4),
    carbG: Math.round((kcal * 0.25) / 4),
    fatG: Math.round((kcal * 0.4) / 9),
  };
}

export function kcalFromMacros(m: Macros): number {
  return m.proteinG * 4 + m.carbG * 4 + m.fatG * 9;
}

/** burn 為 null／NaN 視為 0。 */
export function remainingKcal(a: { target: number; eaten: number; burn: number | null; countBurn: boolean }): number {
  const burn = a.burn != null && Number.isFinite(a.burn) ? a.burn : 0;
  return a.target - a.eaten + (a.countBurn ? burn : 0);
}
