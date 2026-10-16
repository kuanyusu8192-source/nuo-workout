import { describe, it, expect } from 'vitest';
import { NuoDB, newId } from './db';

const TABLES = [
  'exercises', 'sessions', 'sets', 'templates', 'plans', 'bodyMetrics',
  'profile', 'meals', 'favoriteMeals', 'favoriteExercises', 'burnOverrides', 'settings',
];

describe('NuoDB schema', () => {
  it('建庫後包含所有資料表', async () => {
    const db = new NuoDB('db-test-tables');
    await db.open();
    expect(db.tables.map((t) => t.name).sort()).toEqual([...TABLES].sort());
    db.close();
  });

  it('關鍵索引存在', async () => {
    const db = new NuoDB('db-test-indexes');
    await db.open();
    const idx = (t: string) => db.table(t).schema.indexes.map((i) => i.name).sort();
    expect(idx('sets')).toEqual(['createdAt', 'exerciseId', 'sessionId']);
    expect(idx('sessions')).toEqual(['date']);
    expect(idx('exercises')).toEqual(['category', 'equipment', 'source']);
    expect(db.table('burnOverrides').schema.primKey.name).toBe('date');
    expect(db.table('favoriteExercises').schema.primKey.name).toBe('exerciseId');
    db.close();
  });

  it('重新開啟既有資料庫（版本升級空轉）資料保留', async () => {
    const name = 'db-test-reopen';
    const a = new NuoDB(name);
    await a.sessions.add({ id: 's1', date: '2026-10-01', startedAt: 1, mode: 'gear' });
    a.close();
    const b = new NuoDB(name);
    expect(await b.sessions.get('s1')).toBeTruthy();
    b.close();
  });

  it('newId 產生不重複的非空字串', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId()));
    expect(ids.size).toBe(50);
    expect([...ids][0].length).toBeGreaterThan(8);
  });
});
