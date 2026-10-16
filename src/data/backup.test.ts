import { describe, it, expect, beforeEach } from 'vitest';
import { NuoDB } from './db';
import { createDexieRepos } from './repos/dexie';
import type { Repos } from './repos/interfaces';
import { exportBackup, importBackup, backupFileName, type BackupFile } from './backup';
import { seedExercises } from './seed';
import type { Exercise } from './types';

const ex = (id: string): Exercise => ({
  id, name: `動作${id}`, nameEn: id, category: '胸', equipment: '槓鈴', primaryMuscle: '胸肌',
  secondaryMuscles: [], trackingType: 'strength', steps: [], tips: '', gifFile: '', source: 'volumex',
});

let seq = 0;
let db: NuoDB;
let r: Repos;

async function populate(rr: Repos) {
  await seedExercises(rr, [ex('v1'), ex('v2')], 1);
  const custom = await rr.exercises.addCustom({ ...ex('c'), name: '自訂' });
  await rr.exercises.toggleFavorite('v1');
  const s = await rr.sessions.create({ date: '2026-10-01', mode: 'gear', startedAt: 1000 });
  await rr.sets.add({ sessionId: s.id, exerciseId: 'v1', setIndex: 0, kind: 'strength', weightKg: 60, reps: 8, createdAt: 1 });
  await rr.sets.add({ sessionId: s.id, exerciseId: custom.id, setIndex: 1, kind: 'strength', weightKg: 20, reps: 10, createdAt: 2 });
  await rr.templates.create({ name: 'T', color: '#fff', exercises: [{ exerciseId: 'v1', targetSets: 3 }] });
  await rr.plans.create({ name: 'P', days: { 0: null } } as never);
  await rr.bodyMetrics.add({ date: '2026-10-01', weightKg: 70 });
  await rr.profile.save({ sex: 'male', age: 30, heightCm: 175, weightKg: 70, pal: 1.5, goal: 'maintain', tdee: 2500, kcalTarget: 2500, macros: { proteinG: 150, carbG: 300, fatG: 70 } } as never);
  await rr.meals.add({ date: '2026-10-01', name: '飯', servings: 1, proteinG: 1, carbG: 2, fatG: 3, kcal: 40 });
  await rr.meals.addFavorite({ name: '蛋', proteinG: 6, carbG: 1, fatG: 5, kcal: 70 });
  await rr.burnOverrides.set('2026-10-01', 300);
  await rr.settings.patch({ weightUnit: 'lb', restDefaultSec: 120 });
}

async function snapshot(d: NuoDB) {
  const out: Record<string, unknown[]> = {};
  for (const t of d.tables) out[t.name] = await t.toArray();
  return out;
}

beforeEach(async () => {
  db = new NuoDB(`backup-${Date.now()}-${seq++}`);
  r = createDexieRepos(db);
  await populate(r);
});

describe('exportBackup', () => {
  it('格式與內容：不含 volumex/nuo 動作，含自訂動作與最愛', async () => {
    const f = await exportBackup(db);
    expect(f.app).toBe('nuo-fit');
    expect(f.version).toBe(1);
    expect(new Date(f.exportedAt).toISOString()).toBe(f.exportedAt);
    expect(f.data.exercises.map((e) => e.source)).toEqual(['custom']);
    expect(f.data.favoriteExercises).toEqual([{ exerciseId: 'v1' }]);
    expect(f.data.sets).toHaveLength(2);
    expect(f.data.settings[0].weightUnit).toBe('lb');
    expect(JSON.parse(JSON.stringify(f))).toEqual(f);
  });
});

describe('importBackup', () => {
  it('匯出再匯入到新庫與原資料逐筆相等，統計輸入一致', async () => {
    const f = await exportBackup(db);
    const before = await r.sets.listAllAsSetRecords();
    const db2 = new NuoDB(`backup-${Date.now()}-${seq++}`);
    await seedExercises(createDexieRepos(db2), [ex('v1'), ex('v2')], 1);
    const counts = await importBackup(db2, JSON.parse(JSON.stringify(f)), 'replace');
    expect(counts.sets).toBe(2);
    expect(counts.exercises).toBe(1);
    expect(await exportBackup(db2)).toEqual({ ...f, exportedAt: expect.any(String) });
    expect(await createDexieRepos(db2).sets.listAllAsSetRecords()).toEqual(before);
    // 內建動作未被清掉
    expect(await db2.exercises.count()).toBe(3);
  });

  it('replace 會清掉現有的非備份資料', async () => {
    const f = await exportBackup(db);
    await r.meals.add({ date: '2026-10-02', name: '多的', servings: 1, proteinG: 0, carbG: 0, fatG: 0, kcal: 1 });
    await r.exercises.addCustom({ ...ex('q'), name: '多的自訂' });
    await importBackup(db, f, 'replace');
    expect(await db.meals.count()).toBe(1);
    expect((await db.exercises.where('source').equals('custom').toArray()).map((e) => e.name)).toEqual(['自訂']);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bad = async (mutate: (f: Record<string, any>) => unknown, msg?: RegExp) => {
    const before = await snapshot(db);
    const f = JSON.parse(JSON.stringify(await exportBackup(db)));
    const input = mutate(f);
    await expect(importBackup(db, input as BackupFile, 'replace')).rejects.toThrow(msg);
    expect(await snapshot(db)).toEqual(before);
  };

  it('壞檔一律拒絕且現有資料不變', async () => {
    await bad(() => 'not json object', /格式/);
    await bad(() => null);
    await bad(() => [], /格式/);
    await bad((f) => ({ ...f, app: 'other' }), /app/);
    await bad((f) => ({ ...f, version: 2 }), /版本/);
    await bad((f) => ({ ...f, version: 'x' }), /版本/);
    await bad((f) => ({ ...f, exportedAt: 123 }), /exportedAt/);
    await bad((f) => ({ ...f, data: undefined }), /data/);
    await bad((f) => { delete f.data.sessions; return f; }, /sessions/);
    await bad((f) => { f.data.sets[1].reps = '十'; return f; }, /sets/);
    await bad((f) => { f.data.meals[0].name = 5; return f; }, /meals/);
    await bad((f) => { f.data.settings[0].weightUnit = 'oz'; return f; }, /settings/);
    await bad((f) => { f.data.exercises[0].source = 'volumex'; return f; }, /exercises/);
    await bad((f) => { f.data.sessions.push(null); return f; }, /sessions/);
  });

  it('交易中途失敗（重複主鍵）整批回滾', async () => {
    const before = await snapshot(db);
    const f = JSON.parse(JSON.stringify(await exportBackup(db)));
    f.data.meals.push({ ...f.data.meals[0] }); // 通過格式驗證，但寫入時主鍵衝突
    f.data.sessions = []; // 若沒回滾，sessions 會被清空
    await expect(importBackup(db, f, 'replace')).rejects.toThrow();
    expect(await snapshot(db)).toEqual(before);
  });

  it('未知模式拒絕', async () => {
    const f = await exportBackup(db);
    await expect(importBackup(db, f, 'merge' as never)).rejects.toThrow(/模式/);
  });
});

describe('backupFileName', () => {
  it('使用本地時間 YYYYMMDD-HHmm', () => {
    expect(backupFileName(new Date(2026, 9, 5, 7, 3))).toBe('nuo-backup-20261005-0703.json');
    expect(backupFileName(new Date(2026, 11, 31, 23, 59))).toBe('nuo-backup-20261231-2359.json');
  });
});
