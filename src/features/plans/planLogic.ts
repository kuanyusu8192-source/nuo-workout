/** 計畫畫面的純函式（無 UI 依賴，方便測試）。 */
import type { Template, TemplateExercise } from '../../data/types';
import { toDateStr } from '../../domain/dates';
import type { AppMode } from '../shared';

/**
 * plans 沒有 mode 欄位，暫以名稱是否含「出差」判斷該週計畫屬於出差版。
 * （P4 若在資料模型加 mode，改這裡一處即可）
 */
export const isTravelPlan = (name: string): boolean => name.includes('出差');
export const modeForPlan = (name: string): AppMode => (isTravelPlan(name) ? 'travel' : 'gear');

/** 課表色票（色相沿用 NUO 色票，加幾個輔助色） */
export const TEMPLATE_COLORS: ReadonlyArray<{ value: string; name: string }> = [
  { value: '#3498db', name: '藍' },
  { value: '#27ae60', name: '綠' },
  { value: '#9b59b6', name: '紫' },
  { value: '#e74c3c', name: '紅' },
  { value: '#f39c12', name: '橘' },
  { value: '#16a085', name: '青' },
  { value: '#2c3e50', name: '深灰' },
  { value: '#d35400', name: '棕' },
];

export const DEFAULT_TARGET_SETS = 3;
export const DEFAULT_TARGET_REPS = 10;
export const MAX_TARGET_SETS = 20;

/** 搬移陣列元素（越界或原地回傳新陣列副本，不改原陣列） */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = [...list];
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length || from === to) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/**
 * 重新指派 createdAt 以表達新順序：把原本的時間戳由小到大重新分配給新順序，
 * 並確保嚴格遞增（避免同毫秒建立的課表排序不穩）。回傳需要更新的 {id, createdAt}。
 */
export function reorderStamps(oldOrder: readonly Template[], newOrder: readonly Template[]): Array<{ id: string; createdAt: number }> {
  const stamps = oldOrder.map((t) => t.createdAt).sort((a, b) => a - b);
  let prev = -Infinity;
  const result: Array<{ id: string; createdAt: number }> = [];
  newOrder.forEach((t, i) => {
    const at = Math.max(stamps[i], prev + 1);
    prev = at;
    if (at !== t.createdAt) result.push({ id: t.id, createdAt: at });
  });
  return result;
}

export const formatCreated = (ts: number): string => toDateStr(new Date(ts));

export function sameExercises(a: TemplateExercise[], b: TemplateExercise[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
