import { describe, expect, it } from 'vitest';
import { createMemoryRepos } from '../data/repos';
import { loadBundledExercises } from '../data/exercise-source';
import { addDays, weekStart } from '../domain/dates';
import { daySummary, monthBars, streakWeeks, trainingDays, weekBars, yearBars } from '../domain/stats';
import { peakE1rm, totalVolume } from '../domain/strength';
import { createRng, seedEmptyData, seedFakeData } from './fakeData';

const TODAY = '2026-10-16';

async function seeded() {
  const repos = createMemoryRepos();
  const exercises = await loadBundledExercises();
  const summary = await seedFakeData(repos, { today: TODAY, exercises });
  return { repos, summary, exercises };
}

describe('seedFakeData', () => {
  it('灌入真實動作庫與完整資料', async () => {
    const { repos, summary, exercises } = await seeded();
    expect((await repos.exercises.list()).length).toBe(exercises.length);
    expect(exercises.length).toBeGreaterThan(1000);
    const templates = await repos.templates.list();
    expect(templates.length).toBe(3);
    expect(templates.every((t) => t.exercises.length > 0 && !!t.cooldownText)).toBe(true);
    const plans = await repos.plans.list();
    expect(plans.map((p) => p.name).sort()).toEqual(['出差版', '器材版']);
    expect((await repos.plans.getActive())?.name).toBe('器材版');
    expect((await repos.bodyMetrics.list()).length).toBe(8);
    expect((await repos.profile.get())?.kcalTarget).toBeGreaterThan(1000);
    expect((await repos.meals.listByDate(TODAY)).length).toBeGreaterThanOrEqual(3);
    expect(summary.sessionCount).toBeGreaterThan(20);
  });

  it('範本與週計畫引用的動作都存在於動作庫', async () => {
    const { repos } = await seeded();
    for (const t of await repos.templates.list()) {
      for (const e of t.exercises) expect(await repos.exercises.get(e.exerciseId)).toBeTruthy();
    }
    const gear = (await repos.plans.getActive())!;
    const templateIds = new Set((await repos.templates.list()).map((t) => t.id));
    for (const id of Object.values(gear.days)) if (id) expect(templateIds.has(id)).toBe(true);
  });

  it('每週 3–4 天器材訓練，涵蓋重訓與有氧，今天沒有 session', async () => {
    const { repos } = await seeded();
    const sessions = await repos.sessions.listByRange({});
    expect(sessions.every((s) => s.date < TODAY)).toBe(true);
    expect(await repos.sessions.getByDate(TODAY)).toEqual([]);
    const gearDays = new Map<string, Set<string>>();
    for (const s of sessions.filter((x) => x.mode === 'gear')) {
      const w = weekStart(s.date);
      if (!gearDays.has(w)) gearDays.set(w, new Set());
      gearDays.get(w)!.add(s.date);
    }
    for (const [ws, days] of gearDays) {
      if (ws < weekStart(TODAY)) expect(days.size === 3 || days.size === 4).toBe(true); // 完整週
      else expect(days.size).toBeLessThanOrEqual(4);
    }
    expect(gearDays.size).toBeGreaterThanOrEqual(8);
    const sets = await repos.sets.listAllAsSetRecords();
    expect(sets.some((s) => s.kind === 'strength')).toBe(true);
    expect(sets.some((s) => s.kind === 'cardio')).toBe(true);
    expect(sessions.some((s) => s.mode === 'travel')).toBe(true);
  });

  it('重量有緩慢進步趨勢（臥推後期高於前期）', async () => {
    const { repos } = await seeded();
    const bench = (await repos.sets.listAllAsSetRecords()).filter((s) => s.exerciseId === 'vx-0025');
    const first = bench.slice(0, 3);
    const last = bench.slice(-3);
    expect(Math.max(...last.map((s) => s.weightKg ?? 0))).toBeGreaterThan(Math.max(...first.map((s) => s.weightKg ?? 0)));
    expect(peakE1rm(last)).toBeGreaterThan(peakE1rm(first));
  });

  it('固定種子：結果可重現', async () => {
    const a = await seeded();
    const b = await seeded();
    type R = Awaited<ReturnType<typeof a.repos.sets.listAllAsSetRecords>>;
    const strip = (rs: R) =>
      rs.map(({ id: _id, ...r }) => r).sort((x, y) => x.createdAt - y.createdAt || x.exerciseId.localeCompare(y.exerciseId));
    expect(strip(await a.repos.sets.listAllAsSetRecords())).toEqual(strip(await b.repos.sets.listAllAsSetRecords()));
    expect(a.summary.setCount).toBe(b.summary.setCount);
    const r1 = createRng(1);
    const r2 = createRng(1);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });

  it('統計函式餵這份資料不會 NaN', async () => {
    const { repos } = await seeded();
    const sets = await repos.sets.listAllAsSetRecords();
    const nums: number[] = [];
    for (const metric of ['volume', 'cardioMinutes'] as const) {
      for (const bars of [
        weekBars(sets, TODAY, metric),
        weekBars(sets, addDays(TODAY, -14), metric),
        monthBars(sets, TODAY, metric),
        monthBars(sets, '2026-09-15', metric),
        yearBars(sets, 2026, metric),
      ]) {
        expect(bars.length).toBeGreaterThan(0);
        nums.push(...bars.map((b) => b.value));
      }
    }
    nums.push(trainingDays(sets, TODAY), trainingDays(sets, '2026-09-10'), streakWeeks(sets, TODAY), totalVolume(sets), peakE1rm(sets));
    const sum = daySummary(sets, addDays(TODAY, -1));
    nums.push(sum.sets, sum.strengthSets, sum.volume, sum.cardioMinutes, sum.exerciseCount);
    for (const n of nums) expect(Number.isFinite(n)).toBe(true);
    expect(streakWeeks(sets, TODAY)).toBeGreaterThanOrEqual(8);
    expect(nums.some((n) => n > 0)).toBe(true);
    expect(sets.every((s) => Number.isFinite(s.weightKg ?? 0) && Number.isFinite(s.reps ?? 0) && Number.isFinite(s.durationSec ?? 0))).toBe(true);
  });
});

describe('seedEmptyData', () => {
  it('只有動作庫與 profile', async () => {
    const repos = createMemoryRepos();
    await seedEmptyData(repos, { exercises: await loadBundledExercises() });
    expect((await repos.exercises.list()).length).toBeGreaterThan(1000);
    expect(await repos.profile.get()).toBeTruthy();
    expect(await repos.sessions.listByRange({})).toEqual([]);
    expect(await repos.templates.list()).toEqual([]);
    expect(await repos.plans.list()).toEqual([]);
  });
});
