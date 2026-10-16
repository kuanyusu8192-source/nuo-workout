/** 動作詳情用的純函式：把某動作的所有組整理成「每日」序列與個人紀錄。 */
import { detectPr } from '../../domain/pr';
import { num, peakE1rm, setVolume } from '../../domain/strength';
import type { DateStr, SetRecord } from '../../domain/types';

export interface StrengthDay {
  date: DateStr;
  /** 當日最高預估 1RM（Epley） */
  e1rm: number;
  /** 當日總容量（kg） */
  volume: number;
  /** 當日單組最大次數 */
  maxReps: number;
  /** 當日總次數 */
  totalReps: number;
  /** 當日 e1RM 超越先前所有紀錄（第一天不標） */
  isPr: boolean;
}

export interface CardioDay {
  date: DateStr;
  minutes: number;
  km: number;
  /** 有速度的組之平均（km/h），沒有則 0 */
  avgSpeed: number;
}

export interface PersonalRecords {
  maxReps: number | null;
  maxWeightKg: number | null;
  maxVolumeKg: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function groupByDate(sets: SetRecord[]): Array<[DateStr, SetRecord[]]> {
  const m = new Map<DateStr, SetRecord[]>();
  for (const s of sets) {
    const list = m.get(s.date);
    if (list) list.push(s);
    else m.set(s.date, [s]);
  }
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * 力量動作的每日序列。from 只裁切輸出，PR 一律以完整歷史判斷（期間切換不會改變哪天是 PR）。
 */
export function strengthSeries(sets: SetRecord[], exerciseId: string, from?: DateStr): StrengthDay[] {
  const mine = sets.filter((s) => s.exerciseId === exerciseId && s.kind === 'strength');
  const days = groupByDate(mine);
  const out: StrengthDay[] = [];
  days.forEach(([date, list], i) => {
    if (from && date < from) return;
    const history = i === 0 ? [] : days.slice(0, i).flatMap(([, l]) => l);
    out.push({
      date,
      e1rm: peakE1rm(list),
      volume: list.reduce((t, s) => t + setVolume(s), 0),
      maxReps: list.reduce((m, s) => Math.max(m, num(s.reps)), 0),
      totalReps: list.reduce((t, s) => t + num(s.reps), 0),
      isPr: i > 0 && detectPr(history, list, exerciseId).kinds.includes('e1rm'),
    });
  });
  return out;
}

/** 有氧／伸展動作的每日序列（時間、距離、速度） */
export function cardioSeries(sets: SetRecord[], exerciseId: string, from?: DateStr): CardioDay[] {
  const mine = sets.filter((s) => s.exerciseId === exerciseId && s.kind !== 'strength');
  return groupByDate(mine)
    .filter(([date]) => !from || date >= from)
    .map(([date, list]) => {
      const speeds = list.map((s) => num(s.speed)).filter((v) => v > 0);
      return {
        date,
        minutes: round1(list.reduce((t, s) => t + num(s.durationSec), 0) / 60),
        km: round1(list.reduce((t, s) => t + num(s.distanceM), 0) / 1000),
        avgSpeed: speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0,
      };
    });
}

/** 個人紀錄：最大次數、最大重量、最高單日總容量；沒有資料為 null */
export function personalRecords(sets: SetRecord[], exerciseId: string): PersonalRecords {
  const mine = sets.filter((s) => s.exerciseId === exerciseId && s.kind === 'strength');
  const maxReps = mine.reduce((m, s) => Math.max(m, num(s.reps)), 0);
  const maxWeight = mine.reduce((m, s) => Math.max(m, num(s.weightKg)), 0);
  const maxVolume = groupByDate(mine).reduce((m, [, l]) => Math.max(m, l.reduce((t, s) => t + setVolume(s), 0)), 0);
  return {
    maxReps: maxReps > 0 ? maxReps : null,
    maxWeightKg: maxWeight > 0 ? maxWeight : null,
    maxVolumeKg: maxVolume > 0 ? maxVolume : null,
  };
}

