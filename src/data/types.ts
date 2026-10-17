/** 資料層型別（儲存列與篩選條件）。共用 domain 型別請見 src/domain/types.ts。 */
import type { DateStr, Macros, Plan, Profile, SetKind } from '../domain/types';

export type TrackingType = 'strength' | 'cardio' | 'stretch';
export type ExerciseSource = 'volumex' | 'custom' | 'nuo';

export interface Exercise {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  equipment: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  trackingType: TrackingType;
  steps: string[];
  tips: string;
  gifFile: string;
  source: ExerciseSource;
}

export interface ExerciseFilter {
  category?: string;
  equipment?: string;
  /** 名稱（中文或英文）包含，不分大小寫 */
  query?: string;
  favoriteOnly?: boolean;
}

/** 'gear'／'travel' 是舊資料（器材／出差模式已移除），讀取時用 normalizeSessionMode 視為 'normal' */
export type SessionMode = 'normal' | 'gear' | 'travel' | 'backfill';

export const normalizeSessionMode = (m: SessionMode): 'normal' | 'backfill' => (m === 'backfill' ? 'backfill' : 'normal');

export interface Session {
  id: string;
  date: DateStr;
  startedAt: number;
  endedAt?: number;
  templateId?: string;
  planId?: string;
  mode: SessionMode;
  note?: string;
}

export interface SetRow {
  id: string;
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  kind: SetKind;
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  distanceM?: number;
  speed?: number;
  incline?: number;
  watts?: number;
  floors?: number;
  createdAt: number;
}

export interface TemplateExercise {
  exerciseId: string;
  targetSets: number;
  targetReps?: number;
}

export interface Template {
  id: string;
  name: string;
  color: string;
  exercises: TemplateExercise[];
  cooldownText?: string;
  createdAt: number;
  /** 課表排序（小者在前）；缺值排在有值者之後，再依 createdAt */
  order?: number;
}

export interface PlanRow extends Plan {
  isActive: boolean;
  /** 出差版標記；缺值視為 false */
  isTravel?: boolean;
}

export interface BodyMetric {
  id: string;
  date: DateStr;
  weightKg?: number;
  bodyFatPct?: number;
}

export interface ProfileRow extends Profile {
  /** 固定 1 */
  id: 1;
  tdee: number;
  kcalTarget: number;
  macros: Macros;
}

export interface Meal {
  id: string;
  date: DateStr;
  name: string;
  grams?: number;
  servings: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  kcal: number;
  per100g?: { proteinG: number; carbG: number; fatG: number; kcal: number };
}

export interface FavoriteMeal {
  id: string;
  name: string;
  proteinG: number;
  carbG: number;
  fatG: number;
  kcal: number;
}

export interface FavoriteExercise {
  exerciseId: string;
}

export interface BurnOverride {
  date: DateStr;
  kcal: number;
}

export interface Settings {
  /** 固定 1 */
  id: 1;
  weightUnit: 'kg' | 'lb';
  loadUnit: 'kg' | 'lb';
  restDefaultSec: number;
  countBurnToBudget: boolean;
  healthConnect: boolean;
  /** 重訓 MET 值 */
  metStrength: number;
  /** 已灌入的內建動作庫版本（0 = 尚未灌入） */
  exerciseSeedVersion: number;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  weightUnit: 'kg',
  loadUnit: 'kg',
  restDefaultSec: 60,
  countBurnToBudget: true,
  healthConnect: false,
  metStrength: 5,
  exerciseSeedVersion: 0,
};

/** 閉區間日期範圍，任一端省略即不設限 */
export interface DateRange {
  from?: DateStr;
  to?: DateStr;
}
