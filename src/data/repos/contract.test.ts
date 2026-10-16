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

  describe('settings', () => {
    it('get 回傳預設值；patch 合併並持久', async () => {
      expect(await r.settings.get()).toEqual(DEFAULT_SETTINGS);
      const p = await r.settings.patch({ weightUnit: 'lb', restDefaultSec: 120 });
      expect(p).toMatchObject({ weightUnit: 'lb', restDefaultSec: 120, loadUnit: 'kg' });
      expect(await r.settings.get()).toEqual(p);
    });
  });
});
