import type { Repos } from './repos/interfaces';
import type { Exercise } from './types';
import bundledAliases from '../assets/exercise-aliases.json';

/**
 * 灌入內建動作庫。以 settings.exerciseSeedVersion 判斷：版本未提高則不動作。
 * 版本提高時於單一交易內：依 aliases 把舊內建動作 id（被去重掉的 NUO 動作）改寫為新 id
 * （sets／最愛／課表引用），刪除不再存在且未被引用的內建動作，再 bulkPut 新清單。
 * 自訂動作（source: custom）絕不刪除；輸入中 source 為 custom 者一律忽略。
 */
export async function seedExercises(
  repos: Repos,
  exercises: Exercise[],
  version: number,
  aliases: Record<string, string> = bundledAliases,
): Promise<{ seeded: boolean; count: number }> {
  const current = (await repos.settings.get()).exerciseSeedVersion;
  if (current >= version) return { seeded: false, count: 0 };
  const items = exercises.filter((e) => e.source !== 'custom');
  await repos.exercises.applySeed(items, aliases);
  await repos.settings.patch({ exerciseSeedVersion: version });
  return { seeded: true, count: items.length };
}
