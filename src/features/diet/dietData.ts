/** 飲食畫面的資料載入（只透過傳入的 Repos 介面）。 */
import type { Repos } from '../../data/repos/interfaces';
import type { Meal, ProfileRow, Settings } from '../../data/types';
import { applyBurnOverride } from '../../domain/burn';
import type { DateStr } from '../../domain/types';
import { estimateBurn, weekDates } from './dietLogic';

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

export async function loadBurn(repos: Repos, date: DateStr, profile?: ProfileRow | null): Promise<BurnInfo> {
  const [settings, override, sessions, prof, latest] = await Promise.all([
    repos.settings.get(),
    repos.burnOverrides.get(date),
    repos.sessions.getByDate(date),
    profile === undefined ? repos.profile.get() : Promise.resolve(profile ?? undefined),
    repos.bodyMetrics.latest(),
  ]);
  const withSets = await Promise.all(
    sessions.map(async (s) => ({ sets: await repos.sets.listBySession(s.id), startedAt: s.startedAt, endedAt: s.endedAt })),
  );
  const weightKg = prof?.weightKg ?? latest?.weightKg ?? null;
  const auto = estimateBurn({ weightKg, metStrength: settings.metStrength, sessions: withSets });
  return { date, auto, override, effective: applyBurnOverride(auto, override), settings };
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
