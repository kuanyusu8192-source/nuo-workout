/** 啟動流程：建立 repos、灌入內建動作庫、依網址參數灌假資料。 */
import { getDb } from '../data/db';
import { loadBundledExercises } from '../data/exercise-source';
import type { Repos } from '../data/repos/interfaces';
import { seedExercises } from '../data/seed';
import { createDbBackupService, type BackupService } from '../features/settings/backupService';
import { createRepos, resolveDbKind, type DbKind } from './createRepos';

/**
 * 內建動作庫版本。src/assets/exercises.json 的內容有變動（新增／修正動作、換 GIF 檔名）時，
 * 把這個數字加 1：已安裝的 App 下次啟動會重新 bulkPut 一次（只依 id 覆蓋內建動作，不動自訂動作與最愛）。
 * 版本沒變就不會重灌。
 */
export const EXERCISE_SEED_VERSION = 1;

export interface Booted {
  repos: Repos;
  kind: DbKind;
  /** 僅 Dexie 模式提供；記憶體模式不給，設定畫面使用預設實作 */
  backup?: BackupService;
}

export async function bootstrap(search: string = window.location.search): Promise<Booted> {
  const kind = resolveDbKind(search);
  const repos = createRepos(kind);
  // 假資料只灌記憶體版；Dexie 是持久的，重複灌會污染真實資料
  const fake = new URLSearchParams(search).get('fake') === '1' && kind === 'memory';
  if (fake) {
    // 動態載入，正式 bundle 不含假資料
    const { seedFakeData } = await import('../dev/fakeData');
    await seedFakeData(repos);
  } else {
    await seedExercises(repos, await loadBundledExercises(), EXERCISE_SEED_VERSION);
  }
  return { repos, kind, backup: kind === 'dexie' ? createDbBackupService(getDb()) : undefined };
}
