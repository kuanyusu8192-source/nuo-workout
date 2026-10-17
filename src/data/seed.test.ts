import { describe, it, expect, beforeEach } from 'vitest';
import { NuoDB } from './db';
import { createDexieRepos } from './repos/dexie';
import { createMemoryRepos } from './repos/memory';
import type { Repos } from './repos/interfaces';
import type { Exercise } from './types';
import { seedExercises } from './seed';
import { loadBundledExercises } from './exercise-source';

const ex = (id: string, over: Partial<Exercise> = {}): Exercise => ({
  id, name: `動作${id}`, nameEn: `move ${id}`, category: '胸', equipment: '槓鈴',
  primaryMuscle: '胸肌', secondaryMuscles: [], trackingType: 'strength', steps: [], tips: '',
  gifFile: '', source: 'volumex', ...over,
});

let seq = 0;
describe.each([
  ['memory', () => createMemoryRepos()],
  ['dexie', () => createDexieRepos(new NuoDB(`seed-${Date.now()}-${seq++}`))],
] as [string, () => Repos][])('seedExercises：%s', (_l, make) => {
  let r: Repos;
  beforeEach(() => { r = make(); });

  it('首次灌入並記錄版本；同版本不重複灌', async () => {
    expect(await seedExercises(r, [ex('a'), ex('b')], 1)).toEqual({ seeded: true, count: 2 });
    expect((await r.settings.get()).exerciseSeedVersion).toBe(1);
    await r.exercises.bulkPut([ex('a', { name: '被使用者改過' })]);
    expect(await seedExercises(r, [ex('a'), ex('b')], 1)).toEqual({ seeded: false, count: 0 });
    expect((await r.exercises.get('a'))?.name).toBe('被使用者改過');
  });

  it('版本提高時更新與新增，保留自訂動作與最愛', async () => {
    await seedExercises(r, [ex('a')], 1);
    const custom = await r.exercises.addCustom({ ...ex('x'), name: '我的自訂' });
    await r.exercises.toggleFavorite('a');
    await r.exercises.toggleFavorite(custom.id);
    expect(await seedExercises(r, [ex('a', { name: '新名' }), ex('c')], 2)).toEqual({ seeded: true, count: 2 });
    expect((await r.exercises.get('a'))?.name).toBe('新名');
    expect(await r.exercises.get('c')).toBeDefined();
    expect((await r.exercises.get(custom.id))?.name).toBe('我的自訂');
    expect((await r.exercises.list({ favoriteOnly: true })).map((e) => e.id).sort()).toEqual(['a', custom.id].sort());
    expect((await r.settings.get()).exerciseSeedVersion).toBe(2);
  });

  it('版本降低不動作；來源為 custom 的輸入被忽略', async () => {
    await seedExercises(r, [ex('a')], 3);
    expect((await seedExercises(r, [ex('b')], 2)).seeded).toBe(false);
    expect(await r.exercises.get('b')).toBeUndefined();
    expect(await seedExercises(r, [ex('c', { source: 'custom' }), ex('d')], 4)).toEqual({ seeded: true, count: 1 });
    expect(await r.exercises.get('c')).toBeUndefined();
  });

  it('addCustom 後可被搜尋', async () => {
    await seedExercises(r, [ex('a', { name: '槓鈴臥推', nameEn: 'Barbell Bench Press' })], 1);
    await r.exercises.addCustom({ ...ex('z'), name: '壺鈴風車', nameEn: 'Kettlebell Windmill', equipment: '壺鈴' });
    expect((await r.exercises.list({ query: '風車' })).map((e) => e.source)).toEqual(['custom']);
    expect((await r.exercises.list({ query: 'bench press' })).map((e) => e.id)).toEqual(['a']);
    expect((await r.exercises.list({ query: '臥推' })).map((e) => e.id)).toEqual(['a']);
    expect((await r.exercises.list({ equipment: '槓鈴' })).map((e) => e.id)).toEqual(['a']);
    expect((await r.exercises.list({ category: '胸' }))).toHaveLength(2);
    expect(await r.exercises.list({ favoriteOnly: true })).toEqual([]);
  });
});

describe('內建動作庫（真實 exercises.json）', () => {
  it('筆數、搜尋、分類', async () => {
    const all = await loadBundledExercises();
    expect(all).toHaveLength(1362);
    const r = createDexieRepos(new NuoDB(`seed-real-${Date.now()}`));
    expect(await seedExercises(r, all, 1)).toEqual({ seeded: true, count: 1362 });
    expect((await r.exercises.list()).length).toBe(1362);
    expect((await r.exercises.list({ query: '臥推' })).length).toBeGreaterThanOrEqual(1);
    expect((await r.exercises.list({ query: 'bench press' })).length).toBeGreaterThanOrEqual(1);
    expect((await r.exercises.list({ equipment: '槓鈴' })).length).toBeGreaterThan(0);
    const cats = new Set(all.map((e) => e.category));
    expect([...cats].sort()).toEqual(['伸展', '背', '胸', '臀腿', '肩', '核心', '手臂', '有氧'].sort());
  });

  it('缺必要欄位時拒絕', async () => {
    const { validateExercises } = await import('./exercise-source');
    expect(() => validateExercises([{ id: 'x', name: 'n', category: '胸' }])).toThrow(/trackingType/);
    expect(() => validateExercises({})).toThrow();
  });
});
