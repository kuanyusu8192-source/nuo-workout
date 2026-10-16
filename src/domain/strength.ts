import type { SetRecord } from './types';

/** 共用數值清洗：有限且 >= 0 才保留，其餘（NaN、負值、±Infinity、undefined）一律視為 0。 */
export const num = (v: number | undefined | null): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;

/** Epley 預估 1RM：w × (1 + reps/30)；reps = 1 取 w；無效輸入回傳 0。 */
export function e1rm(weightKg: number, reps: number): number {
  const w = num(weightKg);
  const r = num(reps);
  if (w <= 0 || r < 1) return 0;
  if (r === 1) return w;
  return w * (1 + r / 30);
}

/** 單組容量 = 重量 × 次數（缺值視為 0）。 */
export function setVolume(s: { weightKg?: number; reps?: number }): number {
  return num(s.weightKg) * num(s.reps);
}

export function totalVolume(sets: Array<{ weightKg?: number; reps?: number }>): number {
  return sets.reduce((sum, s) => sum + setVolume(s), 0);
}

/** 力量組中最高的 e1RM。 */
export function peakE1rm(sets: SetRecord[]): number {
  let best = 0;
  for (const s of sets) {
    if (s.kind !== 'strength') continue;
    best = Math.max(best, e1rm(num(s.weightKg), num(s.reps)));
  }
  return best;
}
