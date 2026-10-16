/** 記憶體版 repository：供 P3 畫面假資料與測試使用。行為須與 Dexie 版一致。 */
import { newId } from '../db';
import { DEFAULT_SETTINGS, type BodyMetric, type Exercise, type FavoriteMeal, type Meal, type PlanRow, type ProfileRow, type Session, type SetRow, type Settings, type Template } from '../types';
import { byCreatedAt, inRange, matchExercise, toSetRecord, type Repos } from './interfaces';

const clone = <T>(v: T): T => structuredClone(v);
const missing = (what: string, id: string) => new Error(`${what} 不存在：${id}`);

export function createMemoryRepos(): Repos {
  const exercises = new Map<string, Exercise>();
  const favExercises = new Set<string>();
  const sessions = new Map<string, Session>();
  const sets = new Map<string, SetRow>();
  const templates = new Map<string, Template>();
  const plans = new Map<string, PlanRow>();
  const bodyMetrics = new Map<string, BodyMetric>();
  let profile: ProfileRow | undefined;
  const meals = new Map<string, Meal>();
  const favMeals = new Map<string, FavoriteMeal>();
  const burn = new Map<string, number>();
  let settings: Settings = { ...DEFAULT_SETTINGS };

  const all = <T>(m: Map<string, T>): T[] => [...m.values()].map(clone);

  return {
    exercises: {
      async bulkPut(items) {
        for (const e of items) exercises.set(e.id, clone(e));
      },
      async get(id) {
        const e = exercises.get(id);
        return e && clone(e);
      },
      async list(filter) {
        return all(exercises).filter((e) => matchExercise(e, filter, favExercises));
      },
      async toggleFavorite(id) {
        if (favExercises.delete(id)) return false;
        favExercises.add(id);
        return true;
      },
      async addCustom(input) {
        const e: Exercise = { ...clone(input), id: newId(), source: 'custom' };
        exercises.set(e.id, e);
        return clone(e);
      },
    },

    sessions: {
      async create(input) {
        const s: Session = { ...input, id: newId(), startedAt: input.startedAt ?? Date.now() };
        sessions.set(s.id, s);
        return clone(s);
      },
      async get(id) {
        const s = sessions.get(id);
        return s && clone(s);
      },
      async getByDate(date) {
        return all(sessions).filter((s) => s.date === date).sort((a, b) => a.startedAt - b.startedAt);
      },
      async listByRange(range) {
        return all(sessions).filter((s) => inRange(s.date, range)).sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt);
      },
      async end(id, endedAt) {
        const s = sessions.get(id);
        if (!s) throw missing('session', id);
        s.endedAt = endedAt ?? Date.now();
        return clone(s);
      },
      async remove(id) {
        sessions.delete(id);
        for (const [sid, row] of sets) if (row.sessionId === id) sets.delete(sid);
      },
    },

    sets: {
      async add(input) {
        const row: SetRow = { ...input, id: newId(), createdAt: input.createdAt ?? Date.now() };
        sets.set(row.id, row);
        return clone(row);
      },
      async update(id, patch) {
        const row = sets.get(id);
        if (!row) throw missing('set', id);
        Object.assign(row, clone(patch));
        return clone(row);
      },
      async remove(id) {
        sets.delete(id);
      },
      async listBySession(sessionId) {
        return all(sets).filter((s) => s.sessionId === sessionId).sort((a, b) => a.setIndex - b.setIndex);
      },
      async listByExercise(exerciseId) {
        return all(sets).filter((s) => s.exerciseId === exerciseId).sort(byCreatedAt);
      },
      async listAllAsSetRecords(range) {
        const out = [];
        for (const row of sets.values()) {
          const date = sessions.get(row.sessionId)?.date;
          if (date && inRange(date, range)) out.push(toSetRecord(clone(row), date));
        }
        return out.sort(byCreatedAt);
      },
    },

    templates: {
      async create(input) {
        const t: Template = { ...clone(input), id: newId(), createdAt: input.createdAt ?? Date.now() };
        templates.set(t.id, t);
        return clone(t);
      },
      async get(id) {
        const t = templates.get(id);
        return t && clone(t);
      },
      async list() {
        return all(templates).sort(byCreatedAt);
      },
      async update(id, patch) {
        const t = templates.get(id);
        if (!t) throw missing('template', id);
        Object.assign(t, clone(patch));
        return clone(t);
      },
      async remove(id) {
        templates.delete(id);
      },
      async duplicate(id) {
        const t = templates.get(id);
        if (!t) throw missing('template', id);
        const d: Template = { ...clone(t), id: newId(), name: `${t.name} (複製)`, createdAt: Date.now() };
        templates.set(d.id, d);
        return clone(d);
      },
    },

    plans: {
      async create(input) {
        const p: PlanRow = { ...clone(input), id: newId(), isActive: input.isActive ?? false };
        if (p.isActive) for (const o of plans.values()) o.isActive = false;
        plans.set(p.id, p);
        return clone(p);
      },
      async get(id) {
        const p = plans.get(id);
        return p && clone(p);
      },
      async list() {
        return all(plans);
      },
      async update(id, patch) {
        const p = plans.get(id);
        if (!p) throw missing('plan', id);
        Object.assign(p, clone(patch));
        return clone(p);
      },
      async remove(id) {
        plans.delete(id);
      },
      async setActive(id) {
        if (!plans.has(id)) throw missing('plan', id);
        for (const [pid, p] of plans) p.isActive = pid === id;
      },
      async getActive() {
        const p = [...plans.values()].find((x) => x.isActive);
        return p && clone(p);
      },
    },

    bodyMetrics: {
      async add(input) {
        const m: BodyMetric = { ...input, id: newId() };
        bodyMetrics.set(m.id, m);
        return clone(m);
      },
      async list(range) {
        return all(bodyMetrics).filter((m) => inRange(m.date, range)).sort((a, b) => a.date.localeCompare(b.date));
      },
      async latest() {
        const sorted = all(bodyMetrics).sort((a, b) => a.date.localeCompare(b.date));
        return sorted[sorted.length - 1];
      },
    },

    profile: {
      async get() {
        return profile && clone(profile);
      },
      async save(p) {
        profile = { ...clone(p), id: 1 };
        return clone(profile);
      },
    },

    meals: {
      async add(input) {
        const m: Meal = { ...clone(input), id: newId() };
        meals.set(m.id, m);
        return clone(m);
      },
      async update(id, patch) {
        const m = meals.get(id);
        if (!m) throw missing('meal', id);
        Object.assign(m, clone(patch));
        return clone(m);
      },
      async remove(id) {
        meals.delete(id);
      },
      async listByDate(date) {
        return all(meals).filter((m) => m.date === date);
      },
      async favorites() {
        return all(favMeals);
      },
      async addFavorite(input) {
        const f: FavoriteMeal = { ...input, id: newId() };
        favMeals.set(f.id, f);
        return clone(f);
      },
      async removeFavorite(id) {
        favMeals.delete(id);
      },
    },

    burnOverrides: {
      async set(date, kcal) {
        burn.set(date, kcal);
      },
      async get(date) {
        return burn.get(date);
      },
      async clear(date) {
        burn.delete(date);
      },
    },

    settings: {
      async get() {
        return { ...settings };
      },
      async patch(patch) {
        settings = { ...settings, ...patch, id: 1 };
        return { ...settings };
      },
    },
  };
}
