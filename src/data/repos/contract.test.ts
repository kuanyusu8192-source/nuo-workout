import { describe, it, expect, beforeEach } from 'vitest';
import { NuoDB } from '../db';
import { DEFAULT_SETTINGS, type Exercise } from '../types';
import type { Repos } from './interfaces';
import { createMemoryRepos } from './memory';
import { createDexieRepos } from './dexie';

let dbSeq = 0;
const factories: [string, () => Repos][] = [
  ['memory', () => createMemoryRepos()],
  ['dexie', () => createDexieRepos(new NuoDB(`contract-${Date.now()}-${dbSeq++}`))],
];

const ex = (id: string, over: Partial<Exercise> = {}): Exercise => ({
  id,
  name: `動作${id}`,
  nameEn: `move ${id}`,
  category: '胸',
  equipment: '槓鈴',
  primaryMuscle: '胸肌',
  secondaryMuscles: ['三頭肌'],
  trackingType: 'strength',
  steps: ['一', '二'],
  tips: 'tip',
  gifFile: `${id}.gif`,
  source: 'volumex',
  ...over,
});

describe.each(factories)('repository 合約：%s', (_label, make) => {
  let r: Repos;
  beforeEach(() => {
    r = make();
  });

  describe('exercises', () => {
    beforeEach(async () => {
      await r.exercises.bulkPut([
        ex('a', { name: '槓鈴臥推', nameEn: 'Barbell Bench Press' }),
        ex('b', { name: '啞鈴彎舉', nameEn: 'Dumbbell Curl', category: '手臂', equipment: '啞鈴' }),
        ex('c', { name: '深蹲', nameEn: 'Squat', category: '腿', equipment: '槓鈴' }),
      ]);
    });

    it('bulkPut 後可 get，重複 bulkPut 為覆蓋不重複', async () => {
      expect((await r.exercises.get('a'))?.name).toBe('槓鈴臥推');
      await r.exercises.bulkPut([ex('a', { name: '改名' })]);
      expect(await r.exercises.list()).toHaveLength(3);
      expect((await r.exercises.get('a'))?.name).toBe('改名');
      expect(await r.exercises.get('zzz')).toBeUndefined();
    });

    it('list 篩選：類別、器材、查詢（中英、不分大小寫）', async () => {
      expect((await r.exercises.list({ category: '腿' })).map((e) => e.id)).toEqual(['c']);
      expect((await r.exercises.list({ equipment: '槓鈴' })).map((e) => e.id).sort()).toEqual(['a', 'c']);
      expect((await r.exercises.list({ query: '臥推' })).map((e) => e.id)).toEqual(['a']);
      expect((await r.exercises.list({ query: 'CURL' })).map((e) => e.id)).toEqual(['b']);
      expect(await r.exercises.list({ query: '不存在' })).toEqual([]);
      expect((await r.exercises.list({ equipment: '槓鈴', query: 'squat' })).map((e) => e.id)).toEqual(['c']);
    });

    it('toggleFavorite 切換並可用 favoriteOnly 篩出', async () => {
      expect(await r.exercises.toggleFavorite('b')).toBe(true);
      expect((await r.exercises.list({ favoriteOnly: true })).map((e) => e.id)).toEqual(['b']);
      expect(await r.exercises.toggleFavorite('b')).toBe(false);
      expect(await r.exercises.list({ favoriteOnly: true })).toEqual([]);
    });

    it('addCustom 產生 id 與 source=custom', async () => {
      const { id: _i, source: _s, ...input } = ex('x');
      const created = await r.exercises.addCustom(input);
      expect(created.id).toBeTruthy();
      expect(created.source).toBe('custom');
      expect((await r.exercises.get(created.id))?.name).toBe(input.name);
    });
  });

  describe('sessions', () => {
    it('create / get / getByDate / listByRange', async () => {
      const s1 = await r.sessions.create({ date: '2026-10-01', mode: 'gear', startedAt: 100 });
      const s2 = await r.sessions.create({ date: '2026-10-01', mode: 'travel', startedAt: 200 });
      const s3 = await r.sessions.create({ date: '2026-10-05', mode: 'backfill', note: 'n' });
      expect(s1.id).not.toBe(s2.id);
      expect(await r.sessions.get(s1.id)).toEqual(s1);
      expect(s3.startedAt).toBeGreaterThan(0);
      expect((await r.sessions.getByDate('2026-10-01')).map((s) => s.id)).toEqual([s1.id, s2.id]);
      expect(await r.sessions.getByDate('2026-10-02')).toEqual([]);
      expect((await r.sessions.listByRange({ from: '2026-10-02', to: '2026-10-31' })).map((s) => s.id)).toEqual([s3.id]);
      expect((await r.sessions.listByRange({ from: '2026-10-01', to: '2026-10-01' })).length).toBe(2);
      expect((await r.sessions.listByRange({})).length).toBe(3);
    });

    it('end 寫入 endedAt', async () => {
      const s = await r.sessions.create({ date: '2026-10-01', mode: 'gear' });
      const ended = await r.sessions.end(s.id, 999);
      expect(ended.endedAt).toBe(999);
      expect((await r.sessions.get(s.id))?.endedAt).toBe(999);
      await expect(r.sessions.end('nope')).rejects.toThrow();
    });

    it('remove 連帶刪除其 sets，不影響其他 session', async () => {
      const s1 = await r.sessions.create({ date: '2026-10-01', mode: 'gear' });
      const s2 = await r.sessions.create({ date: '2026-10-02', mode: 'gear' });
      await r.sets.add({ sessionId: s1.id, exerciseId: 'a', setIndex: 0, kind: 'strength', weightKg: 50, reps: 5 });
      await r.sets.add({ sessionId: s2.id, exerciseId: 'a', setIndex: 0, kind: 'strength', weightKg: 60, reps: 5 });
      await r.sessions.remove(s1.id);
      expect(await r.sessions.get(s1.id)).toBeUndefined();
      expect(await r.sets.listBySession(s1.id)).toEqual([]);
      expect(await r.sets.listBySession(s2.id)).toHaveLength(1);
      expect((await r.sets.listAllAsSetRecords()).map((x) => x.date)).toEqual(['2026-10-02']);
    });
  });

  describe('sets', () => {
    it('add / update / remove / 依 session 與 exercise 查詢', async () => {
      const s = await r.sessions.create({ date: '2026-10-01', mode: 'gear' });
      const b = await r.sets.add({ sessionId: s.id, exerciseId: 'a', setIndex: 1, kind: 'strength', weightKg: 50, reps: 5, createdAt: 20 });
      const a = await r.sets.add({ sessionId: s.id, exerciseId: 'a', setIndex: 0, kind: 'strength', weightKg: 40, reps: 8, createdAt: 10 });
      await r.sets.add({ sessionId: s.id, exerciseId: 'c', setIndex: 2, kind: 'cardio', durationSec: 600, speed: 8, createdAt: 30 });
      expect(a.id).toBeTruthy();
      expect((await r.sets.listBySession(s.id)).map((x) => x.setIndex)).toEqual([0, 1, 2]);
      expect((await r.sets.listByExercise('a')).map((x) => x.id)).toEqual([a.id, b.id]);

      const upd = await r.sets.update(b.id, { weightKg: 55 });
      expect(upd.weightKg).toBe(55);
      expect(upd.reps).toBe(5);
      expect((await r.sets.listByExercise('a'))[1].weightKg).toBe(55);
      await expect(r.sets.update('nope', { reps: 1 })).rejects.toThrow();

      await r.sets.remove(b.id);
      expect((await r.sets.listByExercise('a')).map((x) => x.id)).toEqual([a.id]);
    });

    it('add 未給 createdAt 時自動填入', async () => {
      const s = await r.sessions.create({ date: '2026-10-01', mode: 'gear' });
      const x = await r.sets.add({ sessionId: s.id, exerciseId: 'a', setIndex: 0, kind: 'strength', reps: 1 });
      expect(x.createdAt).toBeGreaterThan(0);
    });

    it('listAllAsSetRecords：date 取自 session、可依日期範圍篩選、依 createdAt 排序', async () => {
      const s1 = await r.sessions.create({ date: '2026-10-01', mode: 'gear' });
      const s2 = await r.sessions.create({ date: '2026-10-09', mode: 'gear' });
      const x2 = await r.sets.add({ sessionId: s2.id, exerciseId: 'a', setIndex: 0, kind: 'strength', weightKg: 60, reps: 5, createdAt: 2 });
      const x1 = await r.sets.add({ sessionId: s1.id, exerciseId: 'a', setIndex: 0, kind: 'strength', weightKg: 50, reps: 5, createdAt: 1 });
      const all = await r.sets.listAllAsSetRecords();
      expect(all.map((x) => x.id)).toEqual([x1.id, x2.id]);
      expect(all[0]).toMatchObject({ exerciseId: 'a', date: '2026-10-01', kind: 'strength', weightKg: 50, reps: 5, createdAt: 1 });
      expect('sessionId' in all[0]).toBe(false);
      expect((await r.sets.listAllAsSetRecords({ from: '2026-10-05' })).map((x) => x.id)).toEqual([x2.id]);
      expect((await r.sets.listAllAsSetRecords({ to: '2026-10-05' })).map((x) => x.id)).toEqual([x1.id]);
    });

    it('刪除某日最後一組後，統計資料不再包含該日', async () => {
      const s = await r.sessions.create({ date: '2026-10-03', mode: 'gear' });
      const only = await r.sets.add({ sessionId: s.id, exerciseId: 'a', setIndex: 0, kind: 'strength', weightKg: 50, reps: 5 });
      expect((await r.sets.listAllAsSetRecords()).map((x) => x.date)).toEqual(['2026-10-03']);
      await r.sets.remove(only.id);
      expect(await r.sets.listAllAsSetRecords()).toEqual([]);
    });
  });

  describe('templates', () => {
    const input = {
      name: '推日',
      color: '#ff0000',
      exercises: [{ exerciseId: 'a', targetSets: 3, targetReps: 8 }],
      cooldownText: '伸展',
    };
    it('CRUD', async () => {
      const t = await r.templates.create(input);
      expect(t.id).toBeTruthy();
      expect(t.createdAt).toBeGreaterThan(0);
      expect(await r.templates.get(t.id)).toEqual(t);
      const u = await r.templates.update(t.id, { name: '拉日' });
      expect(u.name).toBe('拉日');
      expect(u.exercises).toEqual(input.exercises);
      expect(await r.templates.list()).toHaveLength(1);
      await r.templates.remove(t.id);
      expect(await r.templates.get(t.id)).toBeUndefined();
      await expect(r.templates.update('nope', { name: 'x' })).rejects.toThrow();
    });
    it('duplicate 產生新 id、內容相同且與原件獨立', async () => {
      const t = await r.templates.create(input);
      const d = await r.templates.duplicate(t.id);
      expect(d.id).not.toBe(t.id);
      expect(d.name).toContain('推日');
      expect(d.exercises).toEqual(t.exercises);
      await r.templates.update(d.id, { exercises: [] });
      expect((await r.templates.get(t.id))?.exercises).toHaveLength(1);
      expect(await r.templates.list()).toHaveLength(2);
    });
  });

  describe('templates：order / reorder', () => {
    const mk = (name: string, createdAt: number, order?: number) =>
      r.templates.create({ name, color: '#000', exercises: [], createdAt, ...(order === undefined ? {} : { order }) });
    const names = async () => (await r.templates.list()).map((t) => t.name);

    it('list 依 order 升冪，缺值排後面，再依 createdAt', async () => {
      await mk('無序舊', 1);
      await mk('B', 5, 1);
      await mk('無序新', 9);
      await mk('A', 8, 0);
      expect(await names()).toEqual(['A', 'B', '無序舊', '無序新']);
    });
    it('reorder 依給定順序重寫 order，未列入者排在後面；未知 id 忽略', async () => {
      const a = await mk('A', 1);
      const b = await mk('B', 2);
      const c = await mk('C', 3);
      await r.templates.reorder([c.id, 'nope', a.id]);
      expect(await names()).toEqual(['C', 'A', 'B']);
      expect((await r.templates.get(c.id))?.order).toBe(0);
      expect((await r.templates.get(a.id))?.order).toBe(1);
      await r.templates.reorder([b.id, c.id, a.id]);
      expect(await names()).toEqual(['B', 'C', 'A']);
    });
    it('duplicate 不沿用 order（排到最後）', async () => {
      const a = await mk('A', 1, 0);
      await mk('B', 2, 1);
      const d = await r.templates.duplicate(a.id);
      expect('order' in d).toBe(false);
      expect((await names())[2]).toContain('複製');
    });
  });

  describe('plans', () => {
    const days = { 0: null, 1: 't1', 2: null, 3: 't2', 4: null, 5: null, 6: null };
    it('CRUD 與 setActive 互斥', async () => {
      const p1 = await r.plans.create({ name: '器材版', days });
      const p2 = await r.plans.create({ name: '出差版', days });
      expect(p1.isActive).toBe(false);
      expect(await r.plans.getActive()).toBeUndefined();
      await r.plans.setActive(p1.id);
      expect((await r.plans.getActive())?.id).toBe(p1.id);
      await r.plans.setActive(p2.id);
      expect((await r.plans.getActive())?.id).toBe(p2.id);
      expect((await r.plans.get(p1.id))?.isActive).toBe(false);
      const u = await r.plans.update(p1.id, { name: '新名' });
      expect(u.name).toBe('新名');
      expect(await r.plans.list()).toHaveLength(2);
      await r.plans.remove(p2.id);
      expect(await r.plans.getActive()).toBeUndefined();
      await expect(r.plans.setActive('nope')).rejects.toThrow();
    });
    it('isTravel 可於 create／update 寫入；缺欄位視為未設定', async () => {
      const a = await r.plans.create({ name: '一般', days });
      expect(a.isTravel).toBeUndefined();
      expect(Boolean((await r.plans.get(a.id))?.isTravel)).toBe(false);
      const t = await r.plans.create({ name: '出差', days, isTravel: true });
      expect((await r.plans.get(t.id))?.isTravel).toBe(true);
      expect((await r.plans.update(a.id, { isTravel: true })).isTravel).toBe(true);
      expect((await r.plans.update(a.id, { isTravel: false })).isTravel).toBe(false);
      const cleared = await r.plans.update(a.id, { isTravel: undefined });
      expect('isTravel' in cleared).toBe(false);
    });
  });

  describe('bodyMetrics', () => {
    it('add / list（由舊到新、可篩範圍）/ latest', async () => {
      expect(await r.bodyMetrics.latest()).toBeUndefined();
      await r.bodyMetrics.add({ date: '2026-10-05', weightKg: 70 });
      await r.bodyMetrics.add({ date: '2026-10-01', weightKg: 71, bodyFatPct: 20 });
      await r.bodyMetrics.add({ date: '2026-10-09', weightKg: 69.5 });
      expect((await r.bodyMetrics.list()).map((m) => m.date)).toEqual(['2026-10-01', '2026-10-05', '2026-10-09']);
      expect((await r.bodyMetrics.list({ from: '2026-10-02', to: '2026-10-06' })).map((m) => m.date)).toEqual(['2026-10-05']);
      expect((await r.bodyMetrics.latest())?.weightKg).toBe(69.5);
    });
    it('remove 刪除指定一筆；找不到靜默忽略', async () => {
      const a = await r.bodyMetrics.add({ date: '2026-10-01', weightKg: 70 });
      const b = await r.bodyMetrics.add({ date: '2026-10-02', weightKg: 71 });
      await r.bodyMetrics.remove(b.id);
      expect((await r.bodyMetrics.list()).map((m) => m.id)).toEqual([a.id]);
      expect((await r.bodyMetrics.latest())?.id).toBe(a.id);
      await expect(r.bodyMetrics.remove('nope')).resolves.toBeUndefined();
    });
  });

  describe('profile', () => {
    it('get 預設為 undefined；save 後可讀回，再次 save 覆蓋', async () => {
      expect(await r.profile.get()).toBeUndefined();
      const base = {
        sex: 'male' as const, age: 30, heightCm: 175, weightKg: 70, pal: 1.55, goal: 'cut' as const,
        tdee: 2500, kcalTarget: 2000, macros: { proteinG: 150, carbG: 200, fatG: 60 },
      };
      const saved = await r.profile.save(base);
      expect(saved.id).toBe(1);
      expect(await r.profile.get()).toEqual({ ...base, id: 1 });
      await r.profile.save({ ...base, age: 31 });
      expect((await r.profile.get())?.age).toBe(31);
    });
  });

  describe('meals', () => {
    const meal = { date: '2026-10-01', name: '雞胸', grams: 150, servings: 1, proteinG: 35, carbG: 0, fatG: 3, kcal: 165 };
    it('add / update / remove / listByDate', async () => {
      const m = await r.meals.add(meal);
      await r.meals.add({ ...meal, date: '2026-10-02' });
      expect((await r.meals.listByDate('2026-10-01')).map((x) => x.id)).toEqual([m.id]);
      const u = await r.meals.update(m.id, { servings: 2 });
      expect(u.servings).toBe(2);
      expect(u.name).toBe('雞胸');
      await r.meals.remove(m.id);
      expect(await r.meals.listByDate('2026-10-01')).toEqual([]);
      await expect(r.meals.update('nope', { servings: 1 })).rejects.toThrow();
    });
    it('listByRange：閉區間、可省略端點', async () => {
      await r.meals.add({ ...meal, date: '2026-09-30' });
      await r.meals.add({ ...meal, date: '2026-10-01' });
      await r.meals.add({ ...meal, date: '2026-10-31' });
      await r.meals.add({ ...meal, date: '2026-11-01' });
      const d = async (range: { from?: string; to?: string }) => (await r.meals.listByRange(range)).map((m) => m.date);
      expect(await d({ from: '2026-10-01', to: '2026-10-31' })).toEqual(['2026-10-01', '2026-10-31']);
      expect(await d({ to: '2026-10-01' })).toEqual(['2026-09-30', '2026-10-01']);
      expect(await d({ from: '2026-10-31' })).toEqual(['2026-10-31', '2026-11-01']);
      expect(await d({})).toHaveLength(4);
    });
    it('favorites 新增與移除', async () => {
      expect(await r.meals.favorites()).toEqual([]);
      const f = await r.meals.addFavorite({ name: '常吃', proteinG: 1, carbG: 2, fatG: 3, kcal: 40 });
      expect((await r.meals.favorites()).map((x) => x.id)).toEqual([f.id]);
      await r.meals.removeFavorite(f.id);
      expect(await r.meals.favorites()).toEqual([]);
    });
  });

  describe('burnOverrides', () => {
    it('set / get / clear，重複 set 為覆蓋', async () => {
      expect(await r.burnOverrides.get('2026-10-01')).toBeUndefined();
      await r.burnOverrides.set('2026-10-01', 300);
      await r.burnOverrides.set('2026-10-01', 350);
      expect(await r.burnOverrides.get('2026-10-01')).toBe(350);
      await r.burnOverrides.clear('2026-10-01');
      expect(await r.burnOverrides.get('2026-10-01')).toBeUndefined();
    });
  });

  describe('burnOverrides.listByRange', () => {
    it('回傳範圍內全部覆寫（依日期排序），一次查詢取代逐日 get', async () => {
      await r.burnOverrides.set('2026-10-20', 200);
      await r.burnOverrides.set('2026-09-30', 100);
      await r.burnOverrides.set('2026-10-01', 300);
      await r.burnOverrides.set('2026-11-01', 400);
      expect(await r.burnOverrides.listByRange({ from: '2026-10-01', to: '2026-10-31' })).toEqual([
        { date: '2026-10-01', kcal: 300 },
        { date: '2026-10-20', kcal: 200 },
      ]);
      expect(await r.burnOverrides.listByRange({})).toHaveLength(4);
      expect(await r.burnOverrides.listByRange({ from: '2027-01-01' })).toEqual([]);
    });
  });

  describe('patch 語意：值為 undefined 的欄位會被移除', () => {
    it('sets.update 清空 weightKg／reps，其餘欄位保留，且持久', async () => {
      const s = await r.sessions.create({ date: '2026-10-01', mode: 'gear' });
      const x = await r.sets.add({ sessionId: s.id, exerciseId: 'a', setIndex: 0, kind: 'strength', weightKg: 50, reps: 5, createdAt: 7 });
      const u = await r.sets.update(x.id, { weightKg: undefined, reps: undefined });
      expect('weightKg' in u).toBe(false);
      expect('reps' in u).toBe(false);
      expect(u.exerciseId).toBe('a');
      const got = (await r.sets.listBySession(s.id))[0];
      expect(Object.keys(got).sort()).toEqual(['createdAt', 'exerciseId', 'id', 'kind', 'sessionId', 'setIndex']);
    });
    it('meals.update 清除 grams／per100g', async () => {
      const m = await r.meals.add({ date: '2026-10-01', name: '飯', grams: 100, servings: 1, proteinG: 1, carbG: 2, fatG: 3, kcal: 40, per100g: { proteinG: 1, carbG: 2, fatG: 3, kcal: 40 } });
      const u = await r.meals.update(m.id, { grams: undefined, per100g: undefined, servings: 2 });
      expect('grams' in u).toBe(false);
      expect('per100g' in u).toBe(false);
      expect(u.servings).toBe(2);
      const got = (await r.meals.listByDate('2026-10-01'))[0];
      expect('grams' in got).toBe(false);
      expect('per100g' in got).toBe(false);
    });
    it('templates.update 清除 cooldownText', async () => {
      const t = await r.templates.create({ name: 'T', color: '#000', exercises: [], cooldownText: '伸展' });
      const u = await r.templates.update(t.id, { cooldownText: undefined });
      expect('cooldownText' in u).toBe(false);
      expect('cooldownText' in (await r.templates.get(t.id))!).toBe(false);
    });
    it('templates.update 清除 order 後回到未排序', async () => {
      const t = await r.templates.create({ name: 'T', color: '#000', exercises: [], order: 3 });
      const u = await r.templates.update(t.id, { order: undefined });
      expect('order' in u).toBe(false);
    });
    it('plans.update 只改有提到的欄位', async () => {
      const p = await r.plans.create({ name: 'P', days: { 0: null } });
      const u = await r.plans.update(p.id, { name: 'Q' });
      expect(u.days).toEqual({ 0: null });
    });
    it('sessions.end 保留其他欄位', async () => {
      const s = await r.sessions.create({ date: '2026-10-01', mode: 'gear', note: 'n' });
      const e = await r.sessions.end(s.id, 5);
      expect(e).toMatchObject({ endedAt: 5, note: 'n' });
    });
  });

  describe('settings', () => {
    it('get 回傳預設值；patch 合併並持久', async () => {
      expect(await r.settings.get()).toEqual(DEFAULT_SETTINGS);
      const p = await r.settings.patch({ weightUnit: 'lb', restDefaultSec: 120 });
      expect(p).toMatchObject({ weightUnit: 'lb', restDefaultSec: 120, loadUnit: 'kg' });
      expect(await r.settings.get()).toEqual(p);
    });
  });
});
