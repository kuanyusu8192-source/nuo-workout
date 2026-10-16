import type { SetRecord } from './types';
import { peakE1rm, setVolume, totalVolume } from './strength';

export type PrKind = 'weight' | 'e1rm' | 'volume';

export const volumeMilestones = [10000, 25000, 50000, 100000, 250000, 500000, 1000000];

const maxWeight = (sets: SetRecord[]): number =>
  sets.reduce((m, s) => Math.max(m, Number.isFinite(s.weightKg) ? (s.weightKg as number) : 0), 0);

/** 歷史上單日最大總容量。 */
function maxDailyVolume(sets: SetRecord[]): number {
  const byDate = new Map<string, number>();
  for (const s of sets) byDate.set(s.date, (byDate.get(s.date) ?? 0) + setVolume(s));
  return Math.max(0, ...byDate.values());
}

export function detectPr(
  history: SetRecord[],
  current: SetRecord[],
  exerciseId: string,
): { isPr: boolean; kinds: PrKind[] } {
  const pick = (xs: SetRecord[]) => xs.filter((s) => s.kind === 'strength' && s.exerciseId === exerciseId);
  const hist = pick(history);
  const cur = pick(current);
  if (totalVolume(cur) <= 0) return { isPr: false, kinds: [] };
  if (hist.length === 0) return { isPr: true, kinds: ['weight', 'e1rm', 'volume'] };

  const kinds: PrKind[] = [];
  if (maxWeight(cur) > maxWeight(hist)) kinds.push('weight');
  if (peakE1rm(cur) > peakE1rm(hist)) kinds.push('e1rm');
  if (totalVolume(cur) > maxDailyVolume(hist)) kinds.push('volume');
  return { isPr: kinds.length > 0, kinds };
}

export function nextMilestone(totalKg: number): { prev: number; next: number | null; progress: number } {
  const t = Number.isFinite(totalKg) && totalKg > 0 ? totalKg : 0;
  let prev = 0;
  for (const m of volumeMilestones) {
    if (t < m) return { prev, next: m, progress: (t - prev) / (m - prev) };
    prev = m;
  }
  return { prev, next: null, progress: 1 };
}
