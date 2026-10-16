/**
 * 集中切換資料層實作的工廠。P3 預設記憶體版；P4 用 `?db=dexie`（或環境變數 VITE_DB=dexie）換成 Dexie 版。
 * 畫面不得直接呼叫 createMemoryRepos / createDexieRepos。
 */
import { getDb } from '../data/db';
import { createDexieRepos, createMemoryRepos } from '../data/repos';
import type { Repos } from '../data/repos/interfaces';

export type DbKind = 'memory' | 'dexie';

export function resolveDbKind(search: string = window.location.search, envDb: string | undefined = import.meta.env?.VITE_DB): DbKind {
  const q = new URLSearchParams(search).get('db');
  const v = q ?? envDb;
  return v === 'dexie' ? 'dexie' : 'memory';
}

export function createRepos(kind: DbKind = resolveDbKind()): Repos {
  return kind === 'dexie' ? createDexieRepos(getDb()) : createMemoryRepos();
}
