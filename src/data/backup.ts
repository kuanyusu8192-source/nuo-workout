/** 匯出／匯入備份（JSON）。匯入前先完整驗證，驗證通過才在單一 Dexie 交易內寫入。 */
import type { NuoDB } from './db';
import type {
  BodyMetric, BurnOverride, Exercise, FavoriteExercise, FavoriteMeal, Meal, PlanRow,
  ProfileRow, Session, SetRow, Settings, Template,
} from './types';

export const BACKUP_APP = 'nuo-fit';
export const BACKUP_VERSION = 1;

export interface BackupData {
  /** 僅自訂動作；內建（volumex/nuo）動作由動作庫重灌 */
  exercises: Exercise[];
  favoriteExercises: FavoriteExercise[];
  sessions: Session[];
  sets: SetRow[];
  templates: Template[];
  plans: PlanRow[];
  bodyMetrics: BodyMetric[];
  profile: ProfileRow[];
  meals: Meal[];
  favoriteMeals: FavoriteMeal[];
  burnOverrides: BurnOverride[];
  settings: Settings[];
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  data: BackupData;
}

export type BackupCounts = Record<keyof BackupData, number>;

// 欄位型別規格；結尾 ? 表示可省略
type Spec = Record<string, string>;
const SCHEMA: Record<keyof BackupData, Spec> = {
  exercises: { id: 'string', name: 'string', nameEn: 'string', category: 'string', equipment: 'string', primaryMuscle: 'string', secondaryMuscles: 'array', trackingType: 'string', steps: 'array', tips: 'string', gifFile: 'string', source: 'string' },
  favoriteExercises: { exerciseId: 'string' },
  sessions: { id: 'string', date: 'string', startedAt: 'number', endedAt: 'number?', templateId: 'string?', planId: 'string?', mode: 'string', note: 'string?' },
  sets: { id: 'string', sessionId: 'string', exerciseId: 'string', setIndex: 'number', kind: 'string', weightKg: 'number?', reps: 'number?', durationSec: 'number?', distanceM: 'number?', speed: 'number?', incline: 'number?', watts: 'number?', floors: 'number?', createdAt: 'number' },
  templates: { id: 'string', name: 'string', color: 'string', exercises: 'array', cooldownText: 'string?', createdAt: 'number' },
  plans: { id: 'string', name: 'string', days: 'object', isActive: 'boolean' },
  bodyMetrics: { id: 'string', date: 'string', weightKg: 'number?', bodyFatPct: 'number?' },
  profile: { id: 'number', tdee: 'number', kcalTarget: 'number', macros: 'object' },
  meals: { id: 'string', date: 'string', name: 'string', grams: 'number?', servings: 'number', proteinG: 'number', carbG: 'number', fatG: 'number', kcal: 'number', per100g: 'object?' },
  favoriteMeals: { id: 'string', name: 'string', proteinG: 'number', carbG: 'number', fatG: 'number', kcal: 'number' },
  burnOverrides: { date: 'string', kcal: 'number' },
  settings: { id: 'number', weightUnit: 'string', loadUnit: 'string', restDefaultSec: 'number', countBurnToBudget: 'boolean', healthConnect: 'boolean', metStrength: 'number', exerciseSeedVersion: 'number?' },
};
const TABLES = Object.keys(SCHEMA) as (keyof BackupData)[];

const ENUMS: Partial<Record<keyof BackupData, Record<string, string[]>>> = {
  exercises: { source: ['custom'], trackingType: ['strength', 'cardio', 'stretch'] },
  settings: { weightUnit: ['kg', 'lb'], loadUnit: ['kg', 'lb'] },
  sessions: { mode: ['gear', 'travel', 'backfill'] },
};

function typeOk(v: unknown, t: string): boolean {
  switch (t) {
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'array': return Array.isArray(v);
    case 'object': return typeof v === 'object' && v !== null && !Array.isArray(v);
    default: return typeof v === t;
  }
}

function validate(file: unknown): BackupFile {
  if (typeof file !== 'object' || file === null || Array.isArray(file)) throw new Error('備份檔格式錯誤：不是物件');
  const f = file as Record<string, unknown>;
  if (f.app !== BACKUP_APP) throw new Error(`備份檔 app 不符：${String(f.app)}`);
  if (typeof f.version !== 'number' || !Number.isInteger(f.version) || f.version < 1) throw new Error('備份檔版本無效');
  if (f.version > BACKUP_VERSION) throw new Error(`備份檔版本過新（${f.version}），請更新 App`);
  if (typeof f.exportedAt !== 'string') throw new Error('備份檔缺少 exportedAt');
  if (typeof f.data !== 'object' || f.data === null || Array.isArray(f.data)) throw new Error('備份檔缺少 data');
  const data = f.data as Record<string, unknown>;
  for (const table of TABLES) {
    const rows = data[table];
    if (!Array.isArray(rows)) throw new Error(`備份檔缺少資料表 ${table}`);
    rows.forEach((row, i) => {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) throw new Error(`${table}[${i}] 不是物件`);
      const r = row as Record<string, unknown>;
      for (const [k, spec] of Object.entries(SCHEMA[table])) {
        const optional = spec.endsWith('?');
        const t = optional ? spec.slice(0, -1) : spec;
        if (r[k] === undefined) {
          if (!optional) throw new Error(`${table}[${i}] 缺少欄位 ${k}`);
        } else if (!typeOk(r[k], t)) {
          throw new Error(`${table}[${i}].${k} 型別錯誤（應為 ${t}）`);
        }
      }
      for (const [k, allowed] of Object.entries(ENUMS[table] ?? {})) {
        if (!allowed.includes(r[k] as string)) throw new Error(`${table}[${i}].${k} 值無效：${String(r[k])}`);
      }
    });
  }
  return file as BackupFile;
}

export async function exportBackup(db: NuoDB): Promise<BackupFile> {
  const data = await db.transaction('r', db.tables, async () => ({
    exercises: await db.exercises.where('source').equals('custom').toArray(),
    favoriteExercises: await db.favoriteExercises.toArray(),
    sessions: await db.sessions.toArray(),
    sets: await db.sets.toArray(),
    templates: await db.templates.toArray(),
    plans: await db.plans.toArray(),
    bodyMetrics: await db.bodyMetrics.toArray(),
    profile: await db.profile.toArray(),
    meals: await db.meals.toArray(),
    favoriteMeals: await db.favoriteMeals.toArray(),
    burnOverrides: await db.burnOverrides.toArray(),
    settings: await db.settings.toArray(),
  }));
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

/** 取代式匯入：全部成功或全部回滾。內建動作不動，只取代自訂動作。 */
export async function importBackup(db: NuoDB, file: unknown, mode: 'replace'): Promise<BackupCounts> {
  if (mode !== 'replace') throw new Error(`不支援的匯入模式：${String(mode)}`);
  const { data } = validate(file);
  await db.transaction('rw', db.tables, async () => {
    await db.exercises.where('source').equals('custom').delete();
    for (const t of TABLES) {
      if (t === 'exercises') continue;
      await db.table(t).clear();
    }
    for (const t of TABLES) {
      // 用 bulkAdd：重複主鍵視為壞檔並使整個交易回滾
      if (data[t].length) await db.table(t).bulkAdd(data[t]);
    }
  });
  return Object.fromEntries(TABLES.map((t) => [t, data[t].length])) as BackupCounts;
}

export function backupFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `nuo-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}
