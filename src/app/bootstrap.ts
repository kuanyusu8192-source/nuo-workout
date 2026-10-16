/** 啟動流程：建立 repos、灌入內建動作庫、依網址參數灌假資料。 */
import { loadBundledExercises } from '../data/exercise-source';
import type { Repos } from '../data/repos/interfaces';
import { seedExercises } from '../data/seed';
import { createRepos, resolveDbKind } from './createRepos';

/** 內建動作庫版本；exercises.json 變動時提高 */
export const EXERCISE_SEED_VERSION = 1;

export async function bootstrap(search: string = window.location.search): Promise<Repos> {
  const repos = createRepos(resolveDbKind(search));
  // 假資料只灌記憶體版；Dexie 是持久的，重複灌會污染真實資料
  const fake = new URLSearchParams(search).get('fake') === '1' && resolveDbKind(search) === 'memory';
  if (fake) {
    // 動態載入，正式 bundle 不含假資料
    const { seedFakeData } = await import('../dev/fakeData');
    await seedFakeData(repos);
  } else {
    await seedExercises(repos, await loadBundledExercises(), EXERCISE_SEED_VERSION);
  }
  return repos;
}
