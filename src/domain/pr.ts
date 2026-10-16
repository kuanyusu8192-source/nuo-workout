import type { SetRecord } from './types';
import { num, peakE1rm, setVolume, totalVolume } from './strength';

export type PrKind = 'weight' | 'e1rm' | 'volume';

export const volumeMilestones = [10000, 25000, 50000, 100000, 250000, 500000, 1000000];

const maxWeight = (sets: SetRecord[]): number =>
  sets.reduce((m, s) => Math.max(m, num(s.weightKg)), 0);

/**
 * 嚴格大於比較：兩邊先四捨五入到 0.01 再比。
 * 理由：e1RM 為浮點運算，數學上相等的值（如 20x14 與 27.5x2）可能差 1e-15，
 * 直接用 > 會誤報新高；0.01 kg 以下的差異對使用者無意義。
 */
const r2 = (n: number): number => Math.round(n * 100) / 100;
const gt = (a: number, b: number): boolean => r2(a) > r2(b);

/** 歷史上單日最大總容量。 */
function maxDailyVolume(sets: SetRecord[]): number {
  const byDate = new Map<string, number>();
  for (const s of sets) byDate.set(s.date, (byDate.get(s.date) ?? 0) + setVolume(s));
  return Math.max(0, ...byDate.values());
}

/**
 * 判斷 current 相對 history 是否創下 PR。
 * - current 視為「單日」：若其中的組跨多個 date，只取 date 最大（最新）那天，其餘忽略。
 * - history 中 id 與 current 重複的組會先被排除，呼叫端把剛存的組一併放進 history 也不會漏報。
 * - 比較採 0.01 精度的嚴格大於（見 gt）。
 */
export function detectPr(
  history: SetRecord[],
  current: SetRecord[],
  exerciseId: string,
): { isPr: boolean; kinds: PrKind[] } {
  const pick = (xs: SetRecord[]) => xs.filter((s) => s.kind === 'strength' && s.exerciseId === exerciseId);
  const curIds = new Set(current.map((s) => s.id));
  const hist = pick(history.filter((s) => !curIds.has(s.id)));
  const curAll = pick(current);
  const latest = curAll.reduce((m, s) => (s.date > m ? s.date : m), '');
  const cur = curAll.filter((s) => s.date === latest);
  if (totalVolume(cur) <= 0) return { isPr: false, kinds: [] };
  if (hist.length === 0) return { isPr: true, kinds: ['weight', 'e1rm', 'volume'] };

  const kinds: PrKind[] = [];
  if (gt(maxWeight(cur), maxWeight(hist))) kinds.push('weight');
  if (gt(peakE1rm(cur), peakE1rm(hist))) kinds.push('e1rm');
  if (gt(totalVolume(cur), maxDailyVolume(hist))) kinds.push('volume');
  return { isPr: kinds.length > 0, kinds };
}

export function nextMilestone(totalKg: number): { prev: number; next: number | null; progress: number } {
  if (totalKg === Infinity) return { prev: volumeMilestones[volumeMilestones.length - 1], next: null, progress: 1 };
  const t = num(totalKg);
  let prev = 0;
  for (const m of volumeMilestones) {
    if (t < m) return { prev, next: m, progress: (t - prev) / (m - prev) };
    prev = m;
  }
  return { prev, next: null, progress: 1 };
}
