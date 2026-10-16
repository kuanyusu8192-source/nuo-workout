import { useMemo } from 'preact/hooks';
import { useRepoQuery } from '../../app/context';

/** 動作 id -> 名稱。尚未載入時是空 Map（畫面先以 id 或空白顯示）。 */
export function useExerciseNames(): Map<string, string> {
  const q = useRepoQuery((r) => r.exercises.list(), []);
  return useMemo(() => new Map((q.data ?? []).map((e) => [e.id, e.name])), [q.data]);
}
