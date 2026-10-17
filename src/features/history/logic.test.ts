import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../data/types';
import type { SetRecord } from '../../domain/types';
import { e1rmSeries, muscleGroups, strengthExerciseIds, weightOn } from './logic';

let n = 0;
const s = (date: string, w: number, r: number, ex = 'bench'): SetRecord => ({
  id: `s${n++}`, exerciseId: ex, date, kind: 'strength', weightKg: w, reps: r, createdAt: n,
});
const c = (date: string, sec: number, extra: Partial<SetRecord> = {}): SetRecord => ({
  id: `c${n++}`, exerciseId: 'run', date, kind: 'cardio', durationSec: sec, createdAt: n, ...extra,
});
const ex = (id: string, category: string, trackingType: Exercise['trackingType']): Exercise => ({
  id, name: id, nameEn: id, category, equipment: '', primaryMuscle: '', secondaryMuscles: [],
  trackingType, steps: [], tips: '', gifFile: '', source: 'nuo',
});
const exMap = new Map([
  ['bench', ex('bench', '胸', 'strength')],
  ['squat', ex('squat', '臀腿', 'strength')],
  ['run', ex('run', '有氧', 'cardio')],
  ['row', ex('row', '有氧', 'cardio')],
]);

describe('strengthExerciseIds', () => {
  it('只列有有效力量紀錄的動作（無重量、有氧、伸展都不算）', () => {
    const sets = [s('2026-10-01', 40, 10), s('2026-10-02', 0, 10, 'pushup'), c('2026-10-02', 600)];
    expect(strengthExerciseIds(sets)).toEqual(['bench']);
  });
});

describe('e1rmSeries', () => {
  it('每日取最高 e1RM；40×10 = 53.3', () => {
    const p = e1rmSeries([s('2026-10-01', 40, 10)], 'bench');
    expect(p).toHaveLength(1);
    expect(p[0].e1rm).toBeCloseTo(53.33, 2);
    expect(p[0].bestSet).toEqual({ weightKg: 40, reps: 10 });
  });
  it('新高判定：首筆為新高，未超越者不是，超越者是；同值不算', () => {
    const p = e1rmSeries(
      [s('2026-10-01', 40, 10), s('2026-10-03', 30, 10), s('2026-10-05', 50, 10), s('2026-10-07', 50, 10)],
      'bench',
    );
    expect(p.map((x) => x.isPr)).toEqual([true, false, true, false]);
    expect(p.map((x) => x.date)).toEqual(['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07']);
  });
  it('同一天多組取 e1RM 最高的那組', () => {
    const p = e1rmSeries([s('2026-10-01', 40, 10), s('2026-10-01', 60, 3)], 'bench');
    expect(p[0].bestSet).toEqual({ weightKg: 60, reps: 3 });
  });
});

describe('muscleGroups / weightOn', () => {
  it('由動作 category 彙整、去重、保留出現順序', () => {
    const sets = [s('d', 1, 1, 'bench'), s('d', 1, 1, 'squat'), s('d', 1, 1, 'bench'), c('d', 60)];
    expect(muscleGroups(sets, exMap)).toEqual(['胸', '臀腿', '有氧']);
  });
  it('weightOn：取該日（含）以前最新一筆體重，其次 fallback，皆無 null', () => {
    const m = [
      { id: '1', date: '2026-10-01', weightKg: 75 },
      { id: '2', date: '2026-10-10', bodyFatPct: 18 },
      { id: '3', date: '2026-10-20', weightKg: 73 },
    ];
    expect(weightOn(m, '2026-10-15', 80)).toBe(75);
    expect(weightOn(m, '2026-09-01', 80)).toBe(80);
    expect(weightOn(m, '2026-09-01', undefined)).toBeNull();
  });
});
