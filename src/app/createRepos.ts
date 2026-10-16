/**
 * 集中切換資料層實作的工廠。畫面不得直接呼叫 createMemoryRepos / createDexieRepos。
 *
 * 選擇順序：
 * 1. 網址 `?db=memory|dexie`（明確指定）
 * 2. 網址 `?fake=1`（假資料開發，只能用記憶體版，不污染 Dexie）
 * 3. 環境變數 `VITE_DB=memory|dexie`
 * 4. 預設：測試環境（vitest，MODE=test）用記憶體版；其餘（正式、dev server）用 Dexie 版
 */
import { getDb } from '../data/db';
import { createDexieRepos, createMemoryRepos } from '../data/repos';
import type { Repos } from '../data/repos/interfaces';

export type DbKind = 'memory' | 'dexie';

const isKind = (v: string | null | undefined): v is DbKind => v === 'memory' || v === 'dexie';

export function resolveDbKind(
  search: string = window.location.search,
  envDb: string | undefined = import.meta.env?.VITE_DB,
  isTest: boolean = import.meta.env?.MODE === 'test',
): DbKind {
  const params = new URLSearchParams(search);
  const q = params.get('db');
  if (isKind(q)) return q;
  if (params.get('fake') === '1') return 'memory';
  if (isKind(envDb)) return envDb;
  return isTest ? 'memory' : 'dexie';
}

export function createRepos(kind: DbKind = resolveDbKind()): Repos {
  return kind === 'dexie' ? createDexieRepos(getDb()) : createMemoryRepos();
}
