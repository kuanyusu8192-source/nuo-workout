/**
 * 訓練紀錄匯出（給人與 AI 閱讀分析）。純函式：不依賴 DOM／資料庫，也不讀系統時間（now 由呼叫端注入）。
 * 與「匯出備份」不同：備份是 App 還原用的內部格式；這份是整理過、自我說明的格式，資料一律以 kg 輸出。
 * 輸入型別用結構型別（相容 data 層的列），domain 不 import data。
 */
import { estimateDayBurn, type DayBurnSession, type DayBurnSet } from './dayburn';
import { addDays, toDateStr, weekStart, weekdayOf } from './dates';
import { detectPr } from './pr';
import { e1rm, num } from './strength';
import type { DateStr, SetRecord } from './types';

export type HistoryRange = 'all' | 'last90' | 'last30';

export interface HistoryExportOptions {
  range: HistoryRange;
  /** 預設 true */
  includeMeals?: boolean;
  /** 預設 true（體重體脂） */
  includeBody?: boolean;
  /** 預設 true */
  includeProfile?: boolean;
  /** 現在時間（注入；函式內不呼叫 new Date()） */
  now: Date;
}

export interface HxExercise {
  id: string;
  name: string;
  nameEn?: string;
  category?: string;
  equipment?: string;
  primaryMuscle?: string;
  secondaryMuscles?: string[];
}
export interface HxSession {
  id: string;
  date: DateStr;
  startedAt: number;
  endedAt?: number;
  templateId?: string;
  /** 舊資料可能是 gear／travel */
  mode: string;
}
export interface HxSet {
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  kind: 'strength' | 'cardio' | 'stretch';
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
export interface HistoryExportInput {
  sessions: ReadonlyArray<HxSession>;
  sets: ReadonlyArray<HxSet>;
  exercises: ReadonlyArray<HxExercise>;
  templates: ReadonlyArray<{ id: string; name: string }>;
  bodyMetrics: ReadonlyArray<{ date: DateStr; weightKg?: number; bodyFatPct?: number }>;
  meals: ReadonlyArray<{ date: DateStr; name: string; servings: number; kcal: number; proteinG: number; carbG: number; fatG: number }>;
  profile?: {
    sex: string; age: number; heightCm: number; weightKg: number; pal: number; goal: string;
    kcalTarget: number; macros: { proteinG: number; carbG: number; fatG: number };
  } | null;
  settings: { metStrength: number };
  burnOverrides: ReadonlyArray<{ date: DateStr; kcal: number }>;
}

export interface HxSetOut {
  set: number;
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  distanceM?: number;
  speedKmh?: number;
  inclinePct?: number;
  watts?: number;
  floors?: number;
}
export interface HxExerciseOut {
  exerciseId: string;
  name: string;
  category: string;
  sets: HxSetOut[];
  totalVolumeKg: number;
  bestSet: { weightKg: number; reps: number; e1rmKg: number } | null;
  isPersonalRecord: boolean;
}
export interface HxSessionOut {
  date: DateStr;
  weekday: string;
  startedAt: string;
  endedAt: string | null;
  durationMin: number | null;
  template: string | null;
  mode: 'normal' | 'backfill';
  exercises: HxExerciseOut[];
  totals: { sets: number; volumeKg: number; cardioMinutes: number; estimatedKcal: number | null };
}

export interface HistoryExport {
  format: 'nuo-fit-history';
  version: 1;
  generatedAt: string;
  range: { from: DateStr | null; to: DateStr };
  units: { weight: 'kg'; distance: 'm'; speed: 'km/h'; energy: 'kcal' };
  aboutThisFile: string;
  profile?: {
    sex: string; age: number; heightCm: number; weightKg: number; pal: number; goal: string;
    kcalTarget: number; macros: { proteinG: number; carbG: number; fatG: number };
  };
  exercises: Record<string, {
    name: string; nameEn: string; category: string; equipment: string; primaryMuscle: string; secondaryMuscles: string[];
  }>;
  sessions: HxSessionOut[];
  bodyMetrics?: Array<{ date: DateStr; weightKg: number | null; bodyFatPct: number | null }>;
  nutrition?: Array<{
    date: DateStr; targetKcal: number | null; eatenKcal: number; proteinG: number; carbG: number; fatG: number;
    meals: Array<{ name: string; servings: number; kcal: number; proteinG: number; carbG: number; fatG: number }>;
  }>;
  summary: {
    sessionCount: number;
    trainingDays: number;
    totalVolumeKg: number;
    totalCardioMinutes: number;
    weeklyVolumeKg: Array<{ weekStart: DateStr; volumeKg: number; sessions: number }>;
    personalRecords: Array<{ exerciseId: string; name: string; bestWeightKg: number; bestE1rmKg: number; achievedOn: DateStr }>;
  };
}

const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const MAX_PR_ROWS = 30;
const MAX_SESSION_MIN = 12 * 60;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const pos1 = (v: number | undefined | null): number => round1(num(v));
const pad = (n: number) => String(n).padStart(2, '0');

/** 本地 ISO（含時區偏移），不經 toISOString。 */
function localIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`
  );
}

const ABOUT =
  '這是 NUO Fit 匯出的個人健身紀錄（JSON），供人閱讀或貼給 AI 分析。' +
  '重量一律為公斤（kg），距離為公尺，速度為 km/h，能量為 kcal；日期為本地日期（YYYY-MM-DD），時間為本地時間含時區偏移。' +
  'sessions 為每一場訓練，依日期由舊到新；exercises 是動作字典（以 exerciseId 對照）。' +
  'sets 中缺少的欄位代表當時沒有記錄。volume（容量）＝重量×次數的加總；' +
  'e1RM（預估 1RM）用 Epley 公式 w×(1+reps/30)，次數為 1 時等於重量；bestSet 是該動作 e1RM 最高的一組。' +
  'isPersonalRecord 表示該場相對於此前所有歷史（含匯出範圍之外更早的紀錄）創下重量、e1RM 或單日容量新高，該動作第一次紀錄也算。' +
  'estimatedKcal 與 totals 的 kcal 為依體重與 MET 估算的運動消耗，並非精確量測。' +
  'summary.personalRecords 為匯出範圍內各動作的最佳紀錄。' +
  '建議使用方式：請根據這份紀錄分析進步趨勢、疲勞與恢復，並給出下週訓練建議。';

function rangeFrom(range: HistoryRange, today: DateStr): DateStr | null {
  if (range === 'last30') return addDays(today, -29);
  if (range === 'last90') return addDays(today, -89);
  return null;
}

export function buildHistoryExport(input: HistoryExportInput, options: HistoryExportOptions): HistoryExport {
  const includeMeals = options.includeMeals ?? true;
  const includeBody = options.includeBody ?? true;
  const includeProfile = options.includeProfile ?? true;
  const today = toDateStr(options.now);
  const limitFrom = rangeFrom(options.range, today);
  const inRange = (d: DateStr): boolean => (limitFrom === null || d >= limitFrom) && (options.range === 'all' || d <= today);

  const exById = new Map(input.exercises.map((e) => [e.id, e]));
  const templateName = new Map(input.templates.map((t) => [t.id, t.name]));
  const overrideByDate = new Map(input.burnOverrides.map((o) => [o.date, o.kcal]));

  // 體重：與畫面一致，先用個人資料，沒有就用最新一筆體重紀錄
  const latestBody = [...input.bodyMetrics]
    .filter((b) => b.weightKg != null && b.weightKg > 0)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
  const burnWeight = input.profile?.weightKg ?? latestBody?.weightKg ?? null;

  // 全部歷史依時間排序（供 PR 判定用，含範圍外）
  const chrono = [...input.sessions].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.startedAt - b.startedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rank = new Map(chrono.map((s, i) => [s.id, i]));
  const dateOf = new Map(input.sessions.map((s) => [s.id, s.date]));
  const strengthByEx = new Map<string, Array<{ rec: SetRecord; rank: number; sessionId: string }>>();
  input.sets.forEach((s, i) => {
    const date = dateOf.get(s.sessionId);
    if (date === undefined || s.kind !== 'strength') return;
    const rec: SetRecord = {
      id: `h${i}`, exerciseId: s.exerciseId, date, kind: 'strength', weightKg: s.weightKg, reps: s.reps, createdAt: s.createdAt,
    };
    const arr = strengthByEx.get(s.exerciseId) ?? [];
    arr.push({ rec, rank: rank.get(s.sessionId) ?? 0, sessionId: s.sessionId });
    strengthByEx.set(s.exerciseId, arr);
  });

  const setsBySession = new Map<string, HxSet[]>();
  for (const s of input.sets) {
    const arr = setsBySession.get(s.sessionId) ?? [];
    arr.push(s);
    setsBySession.set(s.sessionId, arr);
  }
  const sessionsPerDate = new Map<DateStr, number>();
  for (const s of input.sessions) sessionsPerDate.set(s.date, (sessionsPerDate.get(s.date) ?? 0) + 1);

  const usedExercises = new Set<string>();
  const outSessions: HxSessionOut[] = [];

  for (const ses of chrono.filter((s) => inRange(s.date))) {
    const mode: 'normal' | 'backfill' = ses.mode === 'backfill' ? 'backfill' : 'normal';
    const rows = [...(setsBySession.get(ses.id) ?? [])].sort((a, b) => a.createdAt - b.createdAt || a.setIndex - b.setIndex);

    const order: string[] = [];
    const byEx = new Map<string, HxSet[]>();
    for (const r of rows) {
      if (!byEx.has(r.exerciseId)) {
        byEx.set(r.exerciseId, []);
        order.push(r.exerciseId);
      }
      byEx.get(r.exerciseId)!.push(r);
    }

    let volume = 0;
    let cardioSec = 0;
    const exercises: HxExerciseOut[] = order.map((exId) => {
      usedExercises.add(exId);
      const exRows = byEx.get(exId)!.sort((a, b) => a.setIndex - b.setIndex || a.createdAt - b.createdAt);
      let exVolume = 0;
      let best: { weightKg: number; reps: number; e: number } | null = null;
      const sets: HxSetOut[] = exRows.map((r) => {
        const o: HxSetOut = { set: r.setIndex };
        const w = num(r.weightKg), reps = num(r.reps), dur = num(r.durationSec);
        if (w > 0) o.weightKg = round1(w);
        if (reps > 0) o.reps = reps;
        if (dur > 0) o.durationSec = round1(dur);
        if (num(r.distanceM) > 0) o.distanceM = round1(num(r.distanceM));
        if (num(r.speed) > 0) o.speedKmh = round1(num(r.speed));
        if (num(r.incline) > 0) o.inclinePct = round1(num(r.incline));
        if (num(r.watts) > 0) o.watts = round1(num(r.watts));
        if (num(r.floors) > 0) o.floors = round1(num(r.floors));
        if (r.kind === 'strength') {
          exVolume += w * reps;
          const e = e1rm(w, reps);
          if (e > 0 && (best === null || e > best.e)) best = { weightKg: w, reps, e };
        }
        if (r.kind === 'cardio') cardioSec += dur;
        return o;
      });
      volume += exVolume;

      let isPr = false;
      const hist = strengthByEx.get(exId);
      if (hist && best !== null) {
        const my = rank.get(ses.id) ?? 0;
        isPr = detectPr(
          hist.filter((h) => h.rank < my).map((h) => h.rec),
          hist.filter((h) => h.sessionId === ses.id).map((h) => h.rec),
          exId,
        ).isPr;
      }
      const b = best as { weightKg: number; reps: number; e: number } | null;
      const ex = exById.get(exId);
      return {
        exerciseId: exId,
        name: ex?.name ?? exId,
        category: ex?.category ?? '',
        sets,
        totalVolumeKg: round1(exVolume),
        bestSet: b ? { weightKg: round1(b.weightKg), reps: b.reps, e1rmKg: round1(b.e) } : null,
        isPersonalRecord: isPr,
      };
    });

    const dayBurnSession: DayBurnSession = { id: ses.id, startedAt: ses.startedAt, endedAt: ses.endedAt, mode };
    const burnSets: DayBurnSet[] = rows.map((r) => ({
      sessionId: r.sessionId, kind: r.kind, durationSec: r.durationSec, speed: r.speed, incline: r.incline, exerciseName: exById.get(r.exerciseId)?.name,
    }));
    // 手動覆寫是「整天」的值：該日只有這一場時才套用，避免多場重複計入
    const override = sessionsPerDate.get(ses.date) === 1 ? overrideByDate.get(ses.date) : undefined;
    const kcal = estimateDayBurn({
      sessions: [dayBurnSession], sets: burnSets, weightKg: burnWeight, metStrength: input.settings.metStrength, override,
    }).kcal;

    const durMin = ses.endedAt != null && mode !== 'backfill' ? (ses.endedAt - ses.startedAt) / 60000 : 0;
    outSessions.push({
      date: ses.date,
      weekday: WEEKDAYS[weekdayOf(ses.date)],
      startedAt: localIso(new Date(ses.startedAt)),
      endedAt: ses.endedAt != null ? localIso(new Date(ses.endedAt)) : null,
      durationMin: durMin > 0 && durMin <= MAX_SESSION_MIN ? round1(durMin) : null,
      template: ses.templateId ? (templateName.get(ses.templateId) ?? null) : null,
      mode,
      exercises,
      totals: {
        sets: rows.length,
        volumeKg: round1(volume),
        cardioMinutes: round1(cardioSec / 60),
        estimatedKcal: kcal == null || !Number.isFinite(kcal) ? null : Math.max(0, kcal),
      },
    });
  }

  // summary
  const weekly = new Map<DateStr, { volume: number; sessions: number }>();
  const prMap = new Map<string, { bestW: number; bestE: number; on: DateStr }>();
  for (const s of outSessions) {
    const w = weekStart(s.date);
    const cur = weekly.get(w) ?? { volume: 0, sessions: 0 };
    cur.volume += s.totals.volumeKg;
    cur.sessions += 1;
    weekly.set(w, cur);
    for (const e of s.exercises) {
      for (const st of e.sets) {
        const ev = e1rm(st.weightKg ?? 0, st.reps ?? 0);
        if (ev <= 0) continue;
        const p = prMap.get(e.exerciseId);
        if (!p) prMap.set(e.exerciseId, { bestW: st.weightKg ?? 0, bestE: ev, on: s.date });
        else {
          p.bestW = Math.max(p.bestW, st.weightKg ?? 0);
          if (Math.round(ev * 100) > Math.round(p.bestE * 100)) {
            p.bestE = ev;
            p.on = s.date;
          }
        }
      }
    }
  }
  const personalRecords = [...prMap.entries()]
    .map(([id, p]) => ({
      exerciseId: id, name: exById.get(id)?.name ?? id, bestWeightKg: round1(p.bestW), bestE1rmKg: round1(p.bestE), achievedOn: p.on,
    }))
    .sort((a, b) => b.bestE1rmKg - a.bestE1rmKg || (a.exerciseId < b.exerciseId ? -1 : 1))
    .slice(0, MAX_PR_ROWS);

  const exerciseDict: HistoryExport['exercises'] = {};
  for (const id of [...usedExercises].sort()) {
    const e = exById.get(id);
    exerciseDict[id] = {
      name: e?.name ?? id,
      nameEn: e?.nameEn ?? '',
      category: e?.category ?? '',
      equipment: e?.equipment ?? '',
      primaryMuscle: e?.primaryMuscle ?? '',
      secondaryMuscles: [...(e?.secondaryMuscles ?? [])],
    };
  }

  const firstDate = outSessions.length ? outSessions[0].date : null;
  const out: HistoryExport = {
    format: 'nuo-fit-history',
    version: 1,
    generatedAt: localIso(options.now),
    range: { from: limitFrom ?? firstDate, to: today },
    units: { weight: 'kg', distance: 'm', speed: 'km/h', energy: 'kcal' },
    aboutThisFile: ABOUT,
    exercises: exerciseDict,
    sessions: outSessions,
    summary: {
      sessionCount: outSessions.length,
      trainingDays: new Set(outSessions.map((s) => s.date)).size,
      totalVolumeKg: round1(outSessions.reduce((a, s) => a + s.totals.volumeKg, 0)),
      totalCardioMinutes: round1(outSessions.reduce((a, s) => a + s.totals.cardioMinutes, 0)),
      weeklyVolumeKg: [...weekly.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([w, v]) => ({ weekStart: w, volumeKg: round1(v.volume), sessions: v.sessions })),
      personalRecords,
    },
  };

  if (includeProfile && input.profile) {
    const p = input.profile;
    // 只挑固定欄位，絕不展開物件（避免夾帶姓名／Email 等識別資訊）
    out.profile = {
      sex: p.sex, age: p.age, heightCm: pos1(p.heightCm), weightKg: pos1(p.weightKg), pal: p.pal, goal: p.goal,
      kcalTarget: Math.round(num(p.kcalTarget)),
      macros: { proteinG: Math.round(num(p.macros.proteinG)), carbG: Math.round(num(p.macros.carbG)), fatG: Math.round(num(p.macros.fatG)) },
    };
  }

  if (includeBody) {
    out.bodyMetrics = input.bodyMetrics
      .filter((b) => inRange(b.date))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((b) => ({
        date: b.date,
        weightKg: num(b.weightKg) > 0 ? round1(num(b.weightKg)) : null,
        bodyFatPct: num(b.bodyFatPct) > 0 ? round1(num(b.bodyFatPct)) : null,
      }));
  }

  if (includeMeals) {
    const byDate = new Map<DateStr, HxMealRows>();
    for (const m of input.meals) {
      if (!inRange(m.date)) continue;
      const arr = byDate.get(m.date) ?? [];
      arr.push(m);
      byDate.set(m.date, arr);
    }
    const target = input.profile ? Math.round(num(input.profile.kcalTarget)) : null;
    out.nutrition = [...byDate.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, ms]) => ({
        date,
        targetKcal: target !== null && target > 0 ? target : null,
        eatenKcal: Math.round(ms.reduce((a, m) => a + num(m.kcal), 0)),
        proteinG: round1(ms.reduce((a, m) => a + num(m.proteinG), 0)),
        carbG: round1(ms.reduce((a, m) => a + num(m.carbG), 0)),
        fatG: round1(ms.reduce((a, m) => a + num(m.fatG), 0)),
        meals: ms.map((m) => ({
          name: m.name, servings: round1(num(m.servings)), kcal: Math.round(num(m.kcal)),
          proteinG: round1(num(m.proteinG)), carbG: round1(num(m.carbG)), fatG: round1(num(m.fatG)),
        })),
      }));
  }

  return out;
}

type HxMealRows = HistoryExportInput['meals'][number][];
