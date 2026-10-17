import { describe, it, expect, beforeEach } from 'vitest';
import { NuoDB } from './db';
import { createDexieRepos } from './repos/dexie';
import { createMemoryRepos } from './repos/memory';
import type { Repos } from './repos/interfaces';
import { DEFAULT_SETTINGS, type Exercise } from './types';
import { seedExercises } from './seed';
import { loadBundledExercises } from './exercise-source';
import aliasesJson from '../assets/exercise-aliases.json';

const ex = (id: string, over: Partial<Exercise> = {}): Exercise => ({
  id, name: `動作${id}`, nameEn: id, category: '胸', equipment: '啞鈴',
  primaryMuscle: '', secondaryMuscles: [], trackingType: 'strength', steps: [], tips: '',
  gifFile: '', source: 'volumex', ...over,
});

const ALIASES = { 'nuo-old': 'vx-new' };
const OLD = ex('nuo-old', { source: 'nuo' });
const NEW = ex('vx-new');
const OTHER = ex('vx-other');

let seq = 0;
describe.each([
  ['memory', () => createMemoryRepos()],
  ['dexie', () => createDexieRepos(new NuoDB(`mig-${Date.now()}-${seq++}`))],
] as [string, () => Repos][])('別名遷移：%s', (_l, make) => {
  let r: Repos;
  beforeEach(async () => {
    r = make();
    await seedExercises(r, [OLD, OTHER], 1, {});
  });

  async function addSet(exerciseId: string, i = 0) {
    const s = await r.sessions.create({ date: '2026-10-01', mode: 'gear' });
    return r.sets.add({ sessionId: s.id, exerciseId, setIndex: i, kind: 'strength', weightKg: 20, reps: 10 });
  }

  it('舊 id 的紀錄、最愛、課表引用遷移到新 id，統計歸到新 id', async () => {
    await addSet('nuo-old');
    await addSet('vx-other');
    await r.exercises.toggleFavorite('nuo-old');
    await r.templates.create({
      name: 'T', color: '#000', exercises: [{ exerciseId: 'nuo-old', targetSets: 3 }, { exerciseId: 'vx-other', targetSets: 2 }],
    });
    expect(await seedExercises(r, [NEW, OTHER], 2, ALIASES)).toEqual({ seeded: true, count: 2 });
    expect(await r.sets.listByExercise('nuo-old')).toEqual([]);
    expect(await r.sets.listByExercise('vx-new')).toHaveLength(1);
    expect((await r.sets.listAllAsSetRecords()).filter((s) => s.exerciseId === 'vx-new')).toHaveLength(1);
    expect((await r.exercises.list({ favoriteOnly: true })).map((e) => e.id)).toEqual(['vx-new']);
    expect((await r.templates.list())[0].exercises.map((e) => e.exerciseId)).toEqual(['vx-new', 'vx-other']);
    expect(await r.exercises.get('nuo-old')).toBeUndefined();
    expect(await r.exercises.get('vx-new')).toBeDefined();
  });

  it('舊、新 id 都被標為最愛時合併成一筆', async () => {
    await r.exercises.bulkPut([NEW]);
    await r.exercises.toggleFavorite('nuo-old');
    await r.exercises.toggleFavorite('vx-new');
    await seedExercises(r, [NEW, OTHER], 2, ALIASES);
    expect((await r.exercises.list({ favoriteOnly: true })).map((e) => e.id)).toEqual(['vx-new']);
  });

  it('自訂動作與其紀錄、最愛、課表不受影響（絕不刪 custom）', async () => {
    const custom = await r.exercises.addCustom({ ...ex('x'), name: '我的自訂' });
    await addSet(custom.id);
    await r.exercises.toggleFavorite(custom.id);
    await seedExercises(r, [NEW, OTHER], 2, ALIASES);
    expect((await r.exercises.get(custom.id))?.name).toBe('我的自訂');
    expect(await r.sets.listByExercise(custom.id)).toHaveLength(1);
    expect((await r.exercises.list({ favoriteOnly: true })).map((e) => e.id)).toEqual([custom.id]);
  });

  it('重跑（同版本／再次提高版本）不重複遷移', async () => {
    await addSet('nuo-old');
    await seedExercises(r, [NEW, OTHER], 2, ALIASES);
    expect((await seedExercises(r, [NEW, OTHER], 2, ALIASES)).seeded).toBe(false);
    await seedExercises(r, [NEW, OTHER], 3, ALIASES);
    expect(await r.sets.listByExercise('vx-new')).toHaveLength(1);
    expect((await r.exercises.list()).map((e) => e.id).sort()).toEqual(['vx-new', 'vx-other']);
  });

  it('不在新清單、也不在別名中但仍被引用的內建動作不刪（避免孤兒組）', async () => {
    await addSet('vx-other');
    await seedExercises(r, [NEW], 2, ALIASES);
    expect(await r.exercises.get('vx-other')).toBeDefined();
    const unused = ex('vx-unused');
    await r.exercises.bulkPut([unused]);
    await seedExercises(r, [NEW], 3, ALIASES);
    expect(await r.exercises.get('vx-unused')).toBeUndefined();
    expect(await r.exercises.get('vx-other')).toBeDefined();
  });

  it('別名目標不在新清單時略過該別名（不產生孤兒）', async () => {
    await addSet('nuo-old');
    await seedExercises(r, [OTHER], 2, ALIASES);
    expect(await r.sets.listByExercise('nuo-old')).toHaveLength(1);
    expect(await r.exercises.get('nuo-old')).toBeDefined();
  });

  it('交易失敗不留半套：紀錄、最愛、課表、動作列都維持原狀', async () => {
    await addSet('nuo-old');
    await r.exercises.toggleFavorite('nuo-old');
    await r.templates.create({ name: 'T', color: '#000', exercises: [{ exerciseId: 'nuo-old', targetSets: 3 }] });
    const bad = { ...NEW, id: undefined } as unknown as Exercise;
    await expect(seedExercises(r, [NEW, bad], 2, ALIASES)).rejects.toThrow();
    expect(await r.sets.listByExercise('nuo-old')).toHaveLength(1);
    expect(await r.sets.listByExercise('vx-new')).toHaveLength(0);
    expect((await r.exercises.list({ favoriteOnly: true })).map((e) => e.id)).toEqual(['nuo-old']);
    expect((await r.templates.list())[0].exercises[0].exerciseId).toBe('nuo-old');
    expect(await r.exercises.get('nuo-old')).toBeDefined();
    expect(await r.exercises.get('vx-new')).toBeUndefined();
    expect((await r.settings.get()).exerciseSeedVersion).toBe(1);
  });
});

describe('真實動作庫遷移：無孤兒組', () => {
  it('以舊 NUO id 記錄的訓練，遷移後每個 set 的 exerciseId 都存在於動作庫', async () => {
    const all = await loadBundledExercises();
    const aliases = aliasesJson as Record<string, string>;
    const r = createDexieRepos(new NuoDB(`mig-real-${Date.now()}`));
    // 模擬舊版動作庫：新清單 + 被去重丟掉的 NUO 動作
    const legacyNuo = Object.keys(aliases).map((id) => ex(id, { source: 'nuo' }));
    await seedExercises(r, [...all, ...legacyNuo], 1, {});
    const custom = await r.exercises.addCustom({ ...ex('c'), name: '自訂' });
    const s = await r.sessions.create({ date: '2026-10-01', mode: 'gear' });
    let i = 0;
    for (const id of [...Object.keys(aliases), ...Object.values(aliases), custom.id, all[0].id]) {
      await r.sets.add({ sessionId: s.id, exerciseId: id, setIndex: i++, kind: 'strength', weightKg: 10, reps: 5 });
    }
    await seedExercises(r, all, 2, aliases);
    const ids = new Set((await r.exercises.list()).map((e) => e.id));
    const sets = await r.sets.listBySession(s.id);
    expect(sets).toHaveLength(i);
    expect(sets.filter((x) => !ids.has(x.exerciseId))).toEqual([]);
    for (const old of Object.keys(aliases)) expect(ids.has(old)).toBe(false);
    expect(ids.size).toBe(all.length + 1);
  }, 90000);
});

describe('DEFAULT_SETTINGS', () => {
  it('組間休息預設 60 秒', () => {
    expect(DEFAULT_SETTINGS.restDefaultSec).toBe(60);
  });
  it('既有已儲存設定不受預設值變更影響', async () => {
    const r = createMemoryRepos();
    await r.settings.patch({ restDefaultSec: 90 });
    expect((await r.settings.get()).restDefaultSec).toBe(90);
    const d = createDexieRepos(new NuoDB(`def-${Date.now()}`));
    expect((await d.settings.get()).restDefaultSec).toBe(60);
    await d.settings.patch({ restDefaultSec: 120 });
    expect((await d.settings.get()).restDefaultSec).toBe(120);
  });
});
