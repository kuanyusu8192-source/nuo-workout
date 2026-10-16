import type { Goal, Macros, Profile } from './types';

/** 活動量等級（PAL）。 */
export const PAL_LEVELS = [
  { value: 1.2, label: '久坐' },
  { value: 1.375, label: '輕度活動' },
  { value: 1.55, label: '中度活動' },
  { value: 1.725, label: '高度活動' },
  { value: 1.9, label: '極高活動' },
] as const;

/** Mifflin–St Jeor 基礎代謝率（kcal/日）。other 取男女平均。 */
export function bmr(p: Pick<Profile, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  if (p.sex === 'male') return base + 5;
  if (p.sex === 'female') return base - 161;
  return base + (5 - 161) / 2;
}

export function tdee(p: Profile): number {
  return bmr(p) * p.pal;
}

export function goalMultiplier(goal: Goal): number {
  return goal === 'cut' ? 0.8 : goal === 'bulk' ? 1.1 : 1.0;
}

export function kcalTarget(p: Profile): number {
  return Math.round(tdee(p) * goalMultiplier(p.goal));
}

/** 蛋白 35%／碳水 25%／脂肪 40%，每克 4／4／9 kcal，克數四捨五入。 */
export function macrosFromKcal(kcal: number): Macros {
  return {
    proteinG: Math.round((kcal * 0.35) / 4),
    carbG: Math.round((kcal * 0.25) / 4),
    fatG: Math.round((kcal * 0.4) / 9),
  };
}

export function kcalFromMacros(m: Macros): number {
  return m.proteinG * 4 + m.carbG * 4 + m.fatG * 9;
}

export function remainingKcal(a: { target: number; eaten: number; burn: number; countBurn: boolean }): number {
  return a.target - a.eaten + (a.countBurn ? a.burn : 0);
}
