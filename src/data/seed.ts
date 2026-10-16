import type { Repos } from './repos/interfaces';
import type { Exercise } from './types';

/**
 * 灌入內建動作庫。以 settings.exerciseSeedVersion 判斷：版本未提高則不動作。
 * 只 bulkPut（依 id 覆蓋內建動作），不刪除任何資料，故自訂動作與最愛不受影響；
 * 輸入中 source 為 custom 者一律忽略。
 */
export async function seedExercises(
  repos: Repos,
  exercises: Exercise[],
  version: number,
): Promise<{ seeded: boolean; count: number }> {
  const current = (await repos.settings.get()).exerciseSeedVersion;
  if (current >= version) return { seeded: false, count: 0 };
  const items = exercises.filter((e) => e.source !== 'custom');
  await repos.exercises.bulkPut(items);
  await repos.settings.patch({ exerciseSeedVersion: version });
  return { seeded: true, count: items.length };
}
