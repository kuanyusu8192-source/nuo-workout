/** 飲食畫面的資料載入（只透過傳入的 Repos 介面）。 */
import type { Repos } from '../../data/repos/interfaces';
import { normalizeSessionMode, type Meal, type ProfileRow, type Settings } from '../../data/types';
import { estimateDayBurn, type DayBurnSession, type DayBurnSet } from '../../domain/dayburn';
import type { DateStr } from '../../domain/types';
import { weekDates } from './dietLogic';

export interface BurnInfo {
  date: DateStr;
  /** 自動估算 kcal；缺體重為 null */
  auto: number | null;
  /** 手動覆寫（無為 undefined） */
  override: number | undefined;
  /** 實際採用：覆寫優先，否則自動 */
  effective: number | null;
  settings: Settings;
}

/** 某日運動消耗所需的原始資料（今日紀錄彈窗、歷史日曆、飲食頁共用的載入路徑）。 */
export interface DayBurnInputs {
  sessions: DayBurnSession[];
  /** 該日所有場次的組（帶 sessionId 與動作名稱） */
  sets: DayBurnSet[];
  weightKg: number | null;
  override: number | undefined;
  settings: Settings;
}

export async function loadDayBurnInputs(repos: Repos, date: DateStr, profile?: ProfileRow | null): Promise<DayBurnInputs> {
  const [settings, override, sessions, prof, latest] = await Promise.all([
    repos.settings.get(),
    repos.burnOverrides.get(date),
    repos.sessions.getByDate(date),
    profile === undefined ? repos.profile.get() : Promise.resolve(profile ?? undefined),
    repos.bodyMetrics.latest(),
  ]);
  const rows = (await Promise.all(sessions.map((s) => repos.sets.listBySession(s.id)))).flat();
  const names = new Map<string, string>();
  await Promise.all(
    [...new Set(rows.filter((r) => r.kind === 'cardio').map((r) => r.exerciseId))].map(async (id) => {
      const ex = await repos.exercises.get(id);
      if (ex) names.set(id, ex.name);
    }),
  );
  return {
    sessions: sessions.map((s) => ({ id: s.id, startedAt: s.startedAt, endedAt: s.endedAt, mode: normalizeSessionMode(s.mode) })),
    sets: rows.map((r) => ({
      sessionId: r.sessionId, kind: r.kind, durationSec: r.durationSec, speed: r.speed, incline: r.incline, exerciseName: names.get(r.exerciseId),
    })),
    weightKg: prof?.weightKg ?? latest?.weightKg ?? null,
    override,
    settings,
  };
}

export async function loadBurn(repos: Repos, date: DateStr, profile?: ProfileRow | null): Promise<BurnInfo> {
  const inputs = await loadDayBurnInputs(repos, date, profile);
  const metStrength = inputs.settings.metStrength;
  const auto = estimateDayBurn({ ...inputs, metStrength }).kcal;
  const effective = estimateDayBurn({ ...inputs, metStrength, override: inputs.override }).kcal;
  return { date, auto, override: inputs.override, effective, settings: inputs.settings };
}

export interface DayData {
  date: DateStr;
  meals: Meal[];
  profile: ProfileRow | undefined;
  burn: BurnInfo;
  /** 該週有飲食紀錄的日期 */
  markedWeek: Set<DateStr>;
}

export async function loadDay(repos: Repos, date: DateStr): Promise<DayData> {
  const week = weekDates(date);
  const [profile, weekMeals] = await Promise.all([repos.profile.get(), Promise.all(week.map((d) => repos.meals.listByDate(d)))]);
  const burn = await loadBurn(repos, date, profile ?? null);
  const markedWeek = new Set<DateStr>();
  week.forEach((d, i) => {
    if (weekMeals[i].length > 0) markedWeek.add(d);
  });
  return { date, meals: weekMeals[week.indexOf(date)], profile, burn, markedWeek };
}
