/** 內建動作庫（src/assets/exercises.json）讀取與驗證。 */
import type { Exercise, TrackingType } from './types';

const TRACKING: TrackingType[] = ['strength', 'cardio', 'stretch'];

export function validateExercises(raw: unknown): Exercise[] {
  if (!Array.isArray(raw)) throw new Error('動作庫格式錯誤：應為陣列');
  raw.forEach((e, i) => {
    const o = e as Record<string, unknown> | null;
    if (!o || typeof o !== 'object') throw new Error(`動作庫第 ${i} 筆不是物件`);
    for (const k of ['id', 'name', 'category'] as const) {
      if (typeof o[k] !== 'string' || !o[k]) throw new Error(`動作庫第 ${i} 筆缺少欄位 ${k}`);
    }
    if (!TRACKING.includes(o.trackingType as TrackingType)) {
      throw new Error(`動作庫第 ${i} 筆 trackingType 無效`);
    }
  });
  return raw as Exercise[];
}

/** 動態載入，避免大 JSON 進入主 bundle */
export async function loadBundledExercises(): Promise<Exercise[]> {
  const mod = await import('../assets/exercises.json');
  return validateExercises(mod.default);
}
