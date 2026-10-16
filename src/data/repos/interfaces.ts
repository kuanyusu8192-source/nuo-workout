import type { DateStr, SetRecord } from '../../domain/types';
import type {
  BodyMetric, DateRange, Exercise, ExerciseFilter, FavoriteMeal, Meal, PlanRow,
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
  update(id: string, patch: Partial<Omit<SetRow, 'id'>>): Promise<SetRow>;
  remove(id: string): Promise<void>;
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
  list(): Promise<Template[]>;
  update(id: string, patch: Partial<Omit<Template, 'id'>>): Promise<Template>;
  remove(id: string): Promise<void>;
  duplicate(id: string): Promise<Template>;
}

export interface PlanRepo {
  create(input: Omit<PlanRow, 'id' | 'isActive'> & { isActive?: boolean }): Promise<PlanRow>;
  get(id: string): Promise<PlanRow | undefined>;
  list(): Promise<PlanRow[]>;
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
}

export interface ProfileRepo {
  get(): Promise<ProfileRow | undefined>;
  save(profile: Omit<ProfileRow, 'id'>): Promise<ProfileRow>;
}

export interface MealRepo {
  add(input: Omit<Meal, 'id'>): Promise<Meal>;
  update(id: string, patch: Partial<Omit<Meal, 'id'>>): Promise<Meal>;
  remove(id: string): Promise<void>;
  listByDate(date: DateStr): Promise<Meal[]>;
  favorites(): Promise<FavoriteMeal[]>;
  addFavorite(input: Omit<FavoriteMeal, 'id'>): Promise<FavoriteMeal>;
  removeFavorite(id: string): Promise<void>;
}

export interface BurnOverrideRepo {
  set(date: DateStr, kcal: number): Promise<void>;
  get(date: DateStr): Promise<number | undefined>;
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

export function byCreatedAt(a: { createdAt: number }, b: { createdAt: number }): number {
  return a.createdAt - b.createdAt;
}
