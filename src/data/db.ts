import Dexie, { type EntityTable } from 'dexie';
import type {
  BodyMetric, BurnOverride, Exercise, FavoriteExercise, FavoriteMeal, Meal,
  PlanRow, ProfileRow, Session, SetRow, Settings, Template,
} from './types';

export const DEFAULT_DB_NAME = 'nuo-workout';

export class NuoDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  sets!: EntityTable<SetRow, 'id'>;
  templates!: EntityTable<Template, 'id'>;
  plans!: EntityTable<PlanRow, 'id'>;
  bodyMetrics!: EntityTable<BodyMetric, 'id'>;
  profile!: EntityTable<ProfileRow, 'id'>;
  meals!: EntityTable<Meal, 'id'>;
  favoriteMeals!: EntityTable<FavoriteMeal, 'id'>;
  favoriteExercises!: EntityTable<FavoriteExercise, 'exerciseId'>;
  burnOverrides!: EntityTable<BurnOverride, 'date'>;
  settings!: EntityTable<Settings, 'id'>;

  constructor(name: string = DEFAULT_DB_NAME) {
    super(name);
    this.version(1).stores({
      exercises: 'id, category, equipment, source',
      sessions: 'id, date',
      sets: 'id, sessionId, exerciseId, createdAt',
      templates: 'id',
      plans: 'id',
      bodyMetrics: 'id, date',
      profile: 'id',
      meals: 'id, date',
      favoriteMeals: 'id',
      favoriteExercises: 'exerciseId',
      burnOverrides: 'date',
      settings: 'id',
    });
  }
}

let shared: NuoDB | undefined;
/** 應用程式共用的單一資料庫實例 */
export function getDb(): NuoDB {
  return (shared ??= new NuoDB());
}

/** 產生 id；無 crypto.randomUUID 時用備援 */
export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}
