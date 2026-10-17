/**
 * 飲食畫面用的純函式（不碰 DOM、不碰 Repos）。
 *
 * Meal 的儲存約定：proteinG／carbG／fatG／kcal 是「該筆餐點的總量」（已乘上份數），
 * servings 只是份數；grams 是「每份」實際食用克數；per100g 是每 100g 營養。
 * 這樣其他地方只要加總 meal.kcal 就是當天攝取量，不必再乘份數。
 */
import type { FavoriteMeal, Meal } from '../../data/types';
import { addDays, parseDateStr, toDateStr, weekStart } from '../../domain/dates';
import { kcalFromMacros } from '../../domain/nutrition';
import type { DateStr, Macros } from '../../domain/types';

export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 整數不帶小數，其餘最多一位。 */
export function formatNum(n: number): string {
  const r = round1(Number.isFinite(n) ? n : 0);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** 蛋白×4 + 碳水×4 + 脂肪×9（整數 kcal）。 */
export function autoKcal(m: Macros): number {
  return Math.round(kcalFromMacros(m));
}

/** 每 100g 營養 × 實際克數 ÷ 100，各項四捨五入到 0.1。 */
export function convertPer100g(per100: Macros, grams: number): Macros {
  const f = grams / 100;
  return {
    proteinG: round1(per100.proteinG * f),
    carbG: round1(per100.carbG * f),
    fatG: round1(per100.fatG * f),
  };
}

export interface MealTotals extends Macros {
  kcal: number;
}

/** 每份營養 × 份數 = 餐點總量。kcalPerServing 省略時用自動算式。 */
export function totalsFor(perServing: Macros, servings: number, kcalPerServing?: number): MealTotals {
  const kcal = kcalPerServing ?? autoKcal(perServing);
  return {
    proteinG: round1(perServing.proteinG * servings),
    carbG: round1(perServing.carbG * servings),
    fatG: round1(perServing.fatG * servings),
    kcal: Math.round(kcal * servings),
  };
}

/** 改份數時要寫回的欄位。有 per100g＋grams 由來源精確重算營養；熱量依原每份熱量比例（保留手動覆寫）。 */
export function scaleMealServings(meal: Meal, servings: number): Pick<Meal, 'servings' | 'proteinG' | 'carbG' | 'fatG' | 'kcal'> {
  const kcalPerServing = meal.kcal / (meal.servings || 1);
  const kcal = Math.round(kcalPerServing * servings);
  if (meal.per100g && meal.grams && meal.grams > 0) {
    const per = convertPer100g(meal.per100g, meal.grams);
    return {
      servings,
      proteinG: round1(per.proteinG * servings),
      carbG: round1(per.carbG * servings),
      fatG: round1(per.fatG * servings),
      kcal,
    };
  }
  const r = servings / (meal.servings || 1);
  return {
    servings,
    proteinG: round1(meal.proteinG * r),
    carbG: round1(meal.carbG * r),
    fatG: round1(meal.fatG * r),
    kcal,
  };
}

export function sumMeals(meals: ReadonlyArray<Pick<Meal, 'proteinG' | 'carbG' | 'fatG' | 'kcal'>>): MealTotals {
  const t = meals.reduce(
    (a, m) => ({ proteinG: a.proteinG + m.proteinG, carbG: a.carbG + m.carbG, fatG: a.fatG + m.fatG, kcal: a.kcal + m.kcal }),
    { proteinG: 0, carbG: 0, fatG: 0, kcal: 0 },
  );
  return { proteinG: round1(t.proteinG), carbG: round1(t.carbG), fatG: round1(t.fatG), kcal: Math.round(t.kcal) };
}

/** 餐點轉成每份的最愛資料。 */
export function mealToFavorite(m: Meal): Omit<FavoriteMeal, 'id'> {
  const s = m.servings || 1;
  return {
    name: m.name,
    proteinG: round1(m.proteinG / s),
    carbG: round1(m.carbG / s),
    fatG: round1(m.fatG / s),
    kcal: Math.round(m.kcal / s),
  };
}

// ---------- 日期 ----------

/** 該日所在週，週一起七天。 */
export function weekDates(date: DateStr): DateStr[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 'YYYY-MM' 的月曆格（週一起）；前置空格為 null，尾端補滿到整週。 */
export function monthCells(ym: string): Array<DateStr | null> {
  const first = `${ym}-01`;
  const lead = (parseDateStr(first).getDay() + 6) % 7;
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const cells: Array<DateStr | null> = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export const monthOf = (date: DateStr): string => date.slice(0, 7);

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  return toDateStr(new Date(y, m - 1 + delta, 1)).slice(0, 7);
}

/** '2026-10-16' -> { m: 10, d: 16 } */
export function md(date: DateStr): { m: number; d: number } {
  const [, m, d] = date.split('-').map(Number);
  return { m, d };
}
