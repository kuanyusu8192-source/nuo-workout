/** domain 層共用型別。純資料，不依賴 DOM 或資料庫。重量一律以 kg 儲存。 */

/** 本地日期字串 YYYY-MM-DD */
export type DateStr = string;

export type SetKind = 'strength' | 'cardio' | 'stretch';

/** 一組紀錄（已帶上所屬訓練日期，供統計使用）。 */
export interface SetRecord {
  id: string;
  exerciseId: string;
  date: DateStr;
  kind: SetKind;
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  distanceM?: number;
  /** 速度，單位 km/h */
  speed?: number;
  /** 坡度，百分比 */
  incline?: number;
  watts?: number;
  floors?: number;
  /** 毫秒時間戳（建立順序） */
  createdAt: number;
}

export type Sex = 'male' | 'female' | 'other';
export type Goal = 'cut' | 'maintain' | 'bulk';

export interface Profile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  /** PAL 係數：1.2 | 1.375 | 1.55 | 1.725 | 1.9 */
  pal: number;
  goal: Goal;
}

export interface Macros {
  proteinG: number;
  carbG: number;
  fatG: number;
}

/** 週計畫：星期（0=週日…6=週六）→ 課表範本 id（null = 休息） */
export interface Plan {
  id: string;
  name: string;
  days: Record<number, string | null>;
}
