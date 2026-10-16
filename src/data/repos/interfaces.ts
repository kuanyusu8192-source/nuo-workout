import type { DateStr, SetRecord } from '../../domain/types';
import type {
  BodyMetric, BurnOverride, DateRange, Exercise, ExerciseFilter, FavoriteMeal, Meal, PlanRow,
  ProfileRow, Session, SessionMode, SetRow, Settings, Template,
} from '../types';

export interface ExerciseRepo {
  bulkPut(items: Exercise[]): Promise<void>;
  get(id: string): Promise<Exercise | undefined>;
  list(filter?: ExerciseFilter): Promise<Exercise[]>;
  /** 回傳切換後是否為最愛 */
  toggleFavorite(exerciseId: string): Promise<boolean>;
  addCustom(input: Omit<Exercise, 'id' | 'source'>): Promise<Exercise>;
}

export interface NewSession {
  date: DateStr;
  mode: SessionMode;
  startedAt?: number;
  templateId?: string;
  planId?: string;
  note?: string;
}

export interface SessionRepo {
  create(input: NewSession): Promise<Session>;
  get(id: string): Promise<Session | undefined>;
  getByDate(date: DateStr): Promise<Session[]>;
  listByRange(range: DateRange): Promise<Session[]>;
  end(id: string, endedAt?: number): Promise<Session>;
  /** 連帶刪除該 session 的所有 sets */
  remove(id: string): Promise<void>;
}

export type NewSet = Omit<SetRow, 'id' | 'createdAt'> & { createdAt?: number };

export interface SetRepo {
  add(input: NewSet): Promise<SetRow>;
  remove(id: string): Promise<void>;
  /** patch 中值為 undefined 的欄位會被移除 */
  update(id: string, patch: Partial<Omit<SetRow, 'id'>>): Promise<SetRow>;
  /** 依 setIndex 排序 */
  listBySession(sessionId: string): Promise<SetRow[]>;
  /** 依 createdAt 排序 */
  listByExercise(exerciseId: string): Promise<SetRow[]>;
  /** 供統計使用：date 取自所屬 session，依 createdAt 排序；孤兒 set（無 session）略過 */
  listAllAsSetRecords(range?: DateRange): Promise<SetRecord[]>;
}

export type NewTemplate = Omit<Template, 'id' | 'createdAt'> & { createdAt?: number };

export interface TemplateRepo {
  create(input: NewTemplate): Promise<Template>;
  get(id: string): Promise<Template | undefined>;
  /** 依 order 升冪（缺值在後），再依 createdAt */
  list(): Promise<Template[]>;
  /** patch 中值為 undefined 的欄位會被移除 */
  update(id: string, patch: Partial<Omit<Template, 'id'>>): Promise<Template>;
  /** 依給定 id 順序寫入 order = 0,1,2…；未知 id 忽略，未列入者保持原 order／缺值 */
  reorder(ids: string[]): Promise<void>;
  remove(id: string): Promise<void>;
  duplicate(id: string): Promise<Template>;
}

export interface PlanRepo {
  create(input: Omit<PlanRow, 'id' | 'isActive'> & { isActive?: boolean }): Promise<PlanRow>;
  get(id: string): Promise<PlanRow | undefined>;
  list(): Promise<PlanRow[]>;
  /** patch 中值為 undefined 的欄位會被移除 */
  update(id: string, patch: Partial<Omit<PlanRow, 'id'>>): Promise<PlanRow>;
  remove(id: string): Promise<void>;
  /** 啟用指定計畫，其餘全部停用 */
  setActive(id: string): Promise<void>;
  getActive(): Promise<PlanRow | undefined>;
}

export interface BodyMetricRepo {
  add(input: Omit<BodyMetric, 'id'>): Promise<BodyMetric>;
  /** 依日期由舊到新 */
  list(range?: DateRange): Promise<BodyMetric[]>;
  /** 日期最新的一筆 */
  latest(): Promise<BodyMetric | undefined>;
  /** 找不到靜默忽略 */
  remove(id: string): Promise<void>;
}

export interface ProfileRepo {
  get(): Promise<ProfileRow | undefined>;
  save(profile: Omit<ProfileRow, 'id'>): Promise<ProfileRow>;
}

export interface MealRepo {
  add(input: Omit<Meal, 'id'>): Promise<Meal>;
  /** patch 中值為 undefined 的欄位會被移除 */
  update(id: string, patch: Partial<Omit<Meal, 'id'>>): Promise<Meal>;
  remove(id: string): Promise<void>;
  listByDate(date: DateStr): Promise<Meal[]>;
  /** 閉區間，依日期排序（同日保持寫入順序） */
  listByRange(range: DateRange): Promise<Meal[]>;
  favorites(): Promise<FavoriteMeal[]>;
  addFavorite(input: Omit<FavoriteMeal, 'id'>): Promise<FavoriteMeal>;
  removeFavorite(id: string): Promise<void>;
}

export interface BurnOverrideRepo {
  set(date: DateStr, kcal: number): Promise<void>;
  get(date: DateStr): Promise<number | undefined>;
  /** 範圍內全部覆寫，依日期排序 */
  listByRange(range: DateRange): Promise<BurnOverride[]>;
  clear(date: DateStr): Promise<void>;
}

export interface SettingsRepo {
  /** 永遠回傳完整設定（缺值以預設補上） */
  get(): Promise<Settings>;
  patch(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings>;
}

export interface Repos {
  exercises: ExerciseRepo;
  sessions: SessionRepo;
  sets: SetRepo;
  templates: TemplateRepo;
  plans: PlanRepo;
  bodyMetrics: BodyMetricRepo;
  profile: ProfileRepo;
  meals: MealRepo;
  burnOverrides: BurnOverrideRepo;
  settings: SettingsRepo;
}

// ---- 兩種實作共用的純函式 ----

export function inRange(date: DateStr, range?: DateRange): boolean {
  return (!range?.from || date >= range.from) && (!range?.to || date <= range.to);
}

export function matchExercise(e: Exercise, f: ExerciseFilter | undefined, favs: Set<string>): boolean {
  if (!f) return true;
  if (f.category && e.category !== f.category) return false;
  if (f.equipment && e.equipment !== f.equipment) return false;
  if (f.favoriteOnly && !favs.has(e.id)) return false;
  if (f.query) {
    const q = f.query.trim().toLowerCase();
    if (q && !e.name.toLowerCase().includes(q) && !e.nameEn.toLowerCase().includes(q)) return false;
  }
  return true;
}

export function toSetRecord(s: SetRow, date: DateStr): SetRecord {
  const { sessionId: _sid, setIndex: _idx, ...rest } = s;
  return { ...rest, date };
}

/**
 * 套用 patch：值為 undefined 的欄位會被移除（兩種實作共用此語意）。
 * 回傳新物件，不修改 row。
 */
export function applyPatch<T extends object>(row: T, patch: Partial<T>): T {
  const next: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return next as T;
}

/** 課表排序：order 升冪（缺值在後），再依 createdAt */
export function byTemplateOrder(a: Template, b: Template): number {
  const ao = a.order ?? Infinity;
  const bo = b.order ?? Infinity;
  if (ao !== bo) return ao < bo ? -1 : 1;
  return a.createdAt - b.createdAt;
}

export function byCreatedAt(a: { createdAt: number }, b: { createdAt: number }): number {
  return a.createdAt - b.createdAt;
}
