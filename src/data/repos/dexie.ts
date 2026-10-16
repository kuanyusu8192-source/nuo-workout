/** Dexie（IndexedDB）版 repository：正式使用。 */
import type { EntityTable } from 'dexie';
import { newId, type NuoDB } from '../db';
import { DEFAULT_SETTINGS, type Exercise, type FavoriteMeal, type Meal, type PlanRow, type Session, type SetRow, type Template } from '../types';
import { applyPatch, byCreatedAt, byTemplateOrder, inRange, matchExercise, toSetRecord, type Repos } from './interfaces';

const missing = (what: string, id: string) => new Error(`${what} 不存在：${id}`);

export function createDexieRepos(db: NuoDB): Repos {
  /** 讀、合併、寫回；不存在則擲錯 */
  async function patchRow<T extends { id: string }>(
    table: EntityTable<T, 'id'>,
    what: string,
    id: string,
    patch: Partial<T>,
  ): Promise<T> {
    const row = (await table.get(id as never)) as T | undefined;
    if (!row) throw missing(what, id);
    const next = { ...applyPatch(row, patch), id };
    await table.put(next as T);
    return next as T;
  }

  return {
    exercises: {
      async bulkPut(items) {
        await db.exercises.bulkPut(items);
      },
      get: (id) => db.exercises.get(id),
      async list(filter) {
        const favs = new Set((await db.favoriteExercises.toArray()).map((f) => f.exerciseId));
        let coll = db.exercises.toCollection();
        if (filter?.category) coll = db.exercises.where('category').equals(filter.category);
        else if (filter?.equipment) coll = db.exercises.where('equipment').equals(filter.equipment);
        return (await coll.toArray()).filter((e) => matchExercise(e, filter, favs));
      },
      async toggleFavorite(id) {
        return db.transaction('rw', db.favoriteExercises, async () => {
          if (await db.favoriteExercises.get(id)) {
            await db.favoriteExercises.delete(id);
            return false;
          }
          await db.favoriteExercises.put({ exerciseId: id });
          return true;
        });
      },
      async addCustom(input) {
        const e: Exercise = { ...input, id: newId(), source: 'custom' };
        await db.exercises.add(e);
        return e;
      },
    },

    sessions: {
      async create(input) {
        const s: Session = { ...input, id: newId(), startedAt: input.startedAt ?? Date.now() };
        await db.sessions.add(s);
        return s;
      },
      get: (id) => db.sessions.get(id),
      async getByDate(date) {
        return (await db.sessions.where('date').equals(date).toArray()).sort((a, b) => a.startedAt - b.startedAt);
      },
      async listByRange(range) {
        const rows = await db.sessions.filter((s) => inRange(s.date, range)).toArray();
        return rows.sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt);
      },
      end: (id, endedAt) => patchRow<Session>(db.sessions, 'session', id, { endedAt: endedAt ?? Date.now() }),
      async remove(id) {
        await db.transaction('rw', db.sessions, db.sets, async () => {
          await db.sets.where('sessionId').equals(id).delete();
          await db.sessions.delete(id);
        });
      },
    },

    sets: {
      async add(input) {
        const row: SetRow = { ...input, id: newId(), createdAt: input.createdAt ?? Date.now() };
        await db.sets.add(row);
        return row;
      },
      update: (id, patch) => patchRow<SetRow>(db.sets, 'set', id, patch),
      async remove(id) {
        await db.sets.delete(id);
      },
      async listBySession(sessionId) {
        return (await db.sets.where('sessionId').equals(sessionId).toArray()).sort((a, b) => a.setIndex - b.setIndex);
      },
      async listByExercise(exerciseId) {
        return (await db.sets.where('exerciseId').equals(exerciseId).toArray()).sort(byCreatedAt);
      },
      async listAllAsSetRecords(range) {
        const [rows, sessions] = await Promise.all([db.sets.toArray(), db.sessions.toArray()]);
        const dateOf = new Map(sessions.map((s) => [s.id, s.date]));
        const out = [];
        for (const row of rows) {
          const date = dateOf.get(row.sessionId);
          if (date && inRange(date, range)) out.push(toSetRecord(row, date));
        }
        return out.sort(byCreatedAt);
      },
    },

    templates: {
      async create(input) {
        const t: Template = { ...input, id: newId(), createdAt: input.createdAt ?? Date.now() };
        await db.templates.add(t);
        return t;
      },
      get: (id) => db.templates.get(id),
      async list() {
        return (await db.templates.toArray()).sort(byTemplateOrder);
      },
      update: (id, patch) => patchRow<Template>(db.templates, 'template', id, patch),
      async reorder(ids) {
        await db.transaction('rw', db.templates, async () => {
          let i = 0;
          for (const id of ids) {
            if ((await db.templates.where('id').equals(id).modify({ order: i })) > 0) i++;
          }
        });
      },
      async remove(id) {
        await db.templates.delete(id);
      },
      async duplicate(id) {
        const t = await db.templates.get(id);
        if (!t) throw missing('template', id);
        const { order: _order, ...rest } = t;
        const d: Template = { ...rest, id: newId(), name: `${t.name} (複製)`, createdAt: Date.now() };
        await db.templates.add(d);
        return d;
      },
    },

    plans: {
      async create(input) {
        const p: PlanRow = { ...input, id: newId(), isActive: input.isActive ?? false };
        await db.transaction('rw', db.plans, async () => {
          if (p.isActive) await db.plans.toCollection().modify({ isActive: false });
          await db.plans.add(p);
        });
        return p;
      },
      get: (id) => db.plans.get(id),
      list: () => db.plans.toArray(),
      update: (id, patch) => patchRow<PlanRow>(db.plans, 'plan', id, patch),
      async remove(id) {
        await db.plans.delete(id);
      },
      async setActive(id) {
        await db.transaction('rw', db.plans, async () => {
          if (!(await db.plans.get(id))) throw missing('plan', id);
          await db.plans.toCollection().modify((p: PlanRow) => {
            p.isActive = p.id === id;
          });
        });
      },
      getActive: () => db.plans.filter((p) => p.isActive).first(),
    },

    bodyMetrics: {
      async add(input) {
        const m = { ...input, id: newId() };
        await db.bodyMetrics.add(m);
        return m;
      },
      async list(range) {
        const rows = await db.bodyMetrics.filter((m) => inRange(m.date, range)).toArray();
        return rows.sort((a, b) => a.date.localeCompare(b.date));
      },
      latest: () => db.bodyMetrics.orderBy('date').last(),
      async remove(id) {
        await db.bodyMetrics.delete(id);
      },
    },

    profile: {
      get: () => db.profile.get(1),
      async save(p) {
        const row = { ...p, id: 1 as const };
        await db.profile.put(row);
        return row;
      },
    },

    meals: {
      async add(input) {
        const m: Meal = { ...input, id: newId() };
        await db.meals.add(m);
        return m;
      },
      update: (id, patch) => patchRow<Meal>(db.meals, 'meal', id, patch),
      async remove(id) {
        await db.meals.delete(id);
      },
      listByDate: (date) => db.meals.where('date').equals(date).toArray(),
      async listByRange(range) {
        const lo = range.from ?? '';
        const hi = range.to ?? '\uffff';
        return db.meals.where('date').between(lo, hi, true, true).toArray();
      },
      favorites: () => db.favoriteMeals.toArray(),
      async addFavorite(input) {
        const f: FavoriteMeal = { ...input, id: newId() };
        await db.favoriteMeals.add(f);
        return f;
      },
      async removeFavorite(id) {
        await db.favoriteMeals.delete(id);
      },
    },

    burnOverrides: {
      async set(date, kcal) {
        await db.burnOverrides.put({ date, kcal });
      },
      async get(date) {
        return (await db.burnOverrides.get(date))?.kcal;
      },
      async clear(date) {
        await db.burnOverrides.delete(date);
      },
      async listByRange(range) {
        const lo = range.from ?? '';
        const hi = range.to ?? '\uffff';
        return db.burnOverrides.where('date').between(lo, hi, true, true).toArray();
      },
    },

    settings: {
      async get() {
        return { ...DEFAULT_SETTINGS, ...(await db.settings.get(1)), id: 1 };
      },
      async patch(patch) {
        return db.transaction('rw', db.settings, async () => {
          const next = { ...DEFAULT_SETTINGS, ...(await db.settings.get(1)), ...patch, id: 1 as const };
          await db.settings.put(next);
          return next;
        });
      },
    },
  };
}
