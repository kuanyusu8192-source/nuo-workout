/**
 * 開發／測試用假資料。固定亂數種子，同一個 today 與 seed 永遠產生相同結果。
 *
 * 內容：真實動作庫、約 8 週訓練（每週 3–4 天，重訓＋有氧，重量緩慢進步）、3 個課表範本（含收操建議）、
 * 「器材版」（啟用）與「出差版」週計畫、8 筆體重、1 份 profile、今天與昨天的飲食。
 * 注意：訓練只到「昨天」，所以今天沒有 session，可以直接測「開始訓練」。
 */
import { loadBundledExercises } from '../data/exercise-source';
import type { Repos } from '../data/repos/interfaces';
import { seedExercises } from '../data/seed';
import type { Exercise, Meal } from '../data/types';
import { addDays, parseDateStr, toDateStr, weekdayOf, weekStart } from '../domain/dates';
import { kcalFromMacros, kcalTarget, macrosFromKcal, tdee } from '../domain/nutrition';
import type { DateStr, Profile } from '../domain/types';

export const FAKE_SEED = 20261016;
export const FAKE_EXERCISE_SEED_VERSION = 1;

export interface FakeOptions {
  /** 「今天」，預設系統日期 */
  today?: DateStr;
  seed?: number;
  /** 注入動作庫（測試可避免重讀 JSON） */
  exercises?: Exercise[];
}

export interface FakeSummary {
  today: DateStr;
  sessionCount: number;
  setCount: number;
  templateIds: { pushPull: string; legs: string; travel: string };
  planIds: { gear: string; travel: string };
}

/** mulberry32：小而夠用的可重現亂數 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export const FAKE_PROFILE: Profile = {
  sex: 'male',
  age: 32,
  heightCm: 175,
  weightKg: 74,
  pal: 1.55,
  goal: 'cut',
};

/** id → 起始重量（kg；undefined = 徒手） */
const STRENGTH: Record<string, number | undefined> = {
  'vx-0025': 60, // 槓鈴臥推
  'nuo-db-incline': 18, // 上斜臥推
  'vx-0334': 8, // 啞鈴側平舉
  'nuo-db-tri-ext': 14, // 三頭屈伸
  'vx-0027': 50, // 槓鈴彎腰划船
  'nuo-db-row-one': 22, // 單臂划船
  'nuo-db-curl': 10, // 站姿彎舉
  'vx-0032': 80, // 槓鈴硬舉
  'nuo-db-goblet': 20, // 高腳杯深蹲
  'nuo-db-lunge': 12, // 弓步蹲
};
const PUSH_PULL = ['vx-0025', 'nuo-db-incline', 'vx-0027', 'nuo-db-row-one', 'vx-0334', 'nuo-db-curl'];
const LEGS = ['vx-0032', 'nuo-db-goblet', 'nuo-db-lunge'];
const CARDIO = ['vx-0685', 'vx-overlay_rowing_machine']; // 跑步、划船機
const TRAVEL = ['nuo-bw-pushup', 'nuo-bw-squat', 'nuo-bw-glute-bridge', 'nuo-bw-plank'];

async function ensureExercises(repos: Repos, opts: FakeOptions): Promise<Exercise[]> {
  const list = opts.exercises ?? (await loadBundledExercises());
  await seedExercises(repos, list, FAKE_EXERCISE_SEED_VERSION);
  return list;
}

/** 只有動作庫與 profile（首次使用後、尚未訓練的狀態） */
export async function seedEmptyData(repos: Repos, opts: FakeOptions = {}): Promise<void> {
  await ensureExercises(repos, opts);
  await repos.profile.save(buildProfileRow());
}

function buildProfileRow() {
  return {
    ...FAKE_PROFILE,
    tdee: Math.round(tdee(FAKE_PROFILE)),
    kcalTarget: kcalTarget(FAKE_PROFILE),
    macros: macrosFromKcal(kcalTarget(FAKE_PROFILE)),
  };
}

export async function seedFakeData(repos: Repos, opts: FakeOptions = {}): Promise<FakeSummary> {
  const today = opts.today ?? toDateStr(new Date());
  const rnd = createRng(opts.seed ?? FAKE_SEED);
  const all = await ensureExercises(repos, opts);
  const have = new Set(all.map((e) => e.id));
  const only = (ids: string[]) => ids.filter((id) => have.has(id));

  // ---- 課表範本 ----
  const tpl = (name: string, color: string, ids: string[], cooldownText: string, targetReps = 10, targetSets = 3) =>
    repos.templates.create({
      name,
      color,
      exercises: only(ids).map((exerciseId) => ({ exerciseId, targetSets, targetReps })),
      cooldownText,
    });
  const pushPull = await tpl('推拉日', '#3498db', PUSH_PULL, '胸肌門框伸展 30 秒 × 2、背闊肌側拉 30 秒 × 2、肩膀十字扣伸展各 30 秒');
  const legs = await tpl('腿與有氧', '#27ae60', [...LEGS, ...CARDIO.slice(0, 1)], '股四頭拉伸、坐姿體前彎、鴿式各 30 秒；有氧後慢走 3 分鐘', 8, 4);
  const travel = await tpl('出差徒手', '#9b59b6', TRAVEL, '貓牛式 10 次、嬰兒式 30 秒、站姿轉體各 10 次', 15);

  // ---- 週計畫（0=週日） ----
  const gear = await repos.plans.create({
    name: '器材版',
    days: { 0: null, 1: pushPull.id, 2: legs.id, 3: null, 4: pushPull.id, 5: legs.id, 6: pushPull.id },
    isActive: true,
  });
  const travelPlan = await repos.plans.create({
    name: '出差版',
    days: { 0: null, 1: travel.id, 2: null, 3: travel.id, 4: null, 5: travel.id, 6: null },
    isActive: false,
  });

  // ---- 8 週訓練（到昨天為止） ----
  // 以週一起算的日曆週：前 8 個完整週 + 本週（只到昨天）
  const thisWeek = weekStart(today);
  const startDate = addDays(thisWeek, -56);
  const trainDates: DateStr[] = [];
  for (let w = -8; w <= 0; w++) {
    const ws = addDays(thisWeek, w * 7);
    const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => d < today);
    // 每週 3–4 天，從週一二四五六中抽（避免連續排太滿）
    const want = rnd() < 0.5 ? 3 : 4;
    const pool = days.filter((d) => [1, 2, 4, 5, 6].includes(weekdayOf(d)));
    for (let n = 0; n < want && pool.length; n++) {
      trainDates.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    }
  }
  trainDates.sort();

  let sessionCount = 0;
  let setCount = 0;
  for (const date of trainDates) {
    const daysFromStart = Math.round((parseDateStr(date).getTime() - parseDateStr(startDate).getTime()) / 86400000);
    const progress = 1 + 0.012 * (daysFromStart / 7); // 8 週約 +9% 的緩慢進步
    const isLegDay = [2, 5].includes(weekdayOf(date));
    const template = isLegDay ? legs : pushPull;
    const base = parseDateStr(date).getTime() + 18 * 3600_000;
    const session = await repos.sessions.create({
      date,
      mode: 'gear',
      startedAt: base,
      templateId: template.id,
      planId: gear.id,
    });
    sessionCount++;
    let clock = base;
    let setIndex = 0;
    for (const exId of template.exercises.map((e) => e.exerciseId)) {
      const ex = all.find((e) => e.id === exId)!;
      if (ex.trackingType === 'cardio') {
        const minutes = Math.round(18 + rnd() * 12);
        const speed = ex.id === 'vx-0685' ? roundTo(9 + rnd() * 1.5, 0.5) : undefined;
        await repos.sets.add({
          sessionId: session.id,
          exerciseId: exId,
          setIndex: setIndex++,
          kind: 'cardio',
          durationSec: minutes * 60,
          distanceM: speed ? Math.round((speed * minutes * 1000) / 60) : undefined,
          speed,
          createdAt: (clock += 90_000),
        });
        setCount++;
        continue;
      }
      const startW = STRENGTH[exId];
      for (let s = 0; s < template.exercises.find((e) => e.exerciseId === exId)!.targetSets; s++) {
        const w = startW === undefined ? undefined : Math.max(2.5, roundTo(startW * progress, 2.5));
        await repos.sets.add({
          sessionId: session.id,
          exerciseId: exId,
          setIndex: setIndex++,
          kind: 'strength',
          weightKg: w,
          reps: 8 + Math.floor(rnd() * 5) - (s === 2 ? 1 : 0),
          createdAt: (clock += 120_000),
        });
        setCount++;
      }
    }
    await repos.sessions.end(session.id, clock + 60_000);
  }

  // 出差模式一場（讓出差版也有歷史）
  const travelDay = addDays(today, -3);
  const ts = await repos.sessions.create({ date: travelDay, mode: 'travel', startedAt: parseDateStr(travelDay).getTime() + 7 * 3600_000, templateId: travel.id, planId: travelPlan.id });
  sessionCount++;
  for (const [i, exId] of only(TRAVEL).entries()) {
    const isPlank = exId === 'nuo-bw-plank';
    await repos.sets.add({
      sessionId: ts.id,
      exerciseId: exId,
      setIndex: i,
      kind: 'strength',
      reps: isPlank ? 1 : 15 + Math.floor(rnd() * 6),
      createdAt: parseDateStr(travelDay).getTime() + 7 * 3600_000 + (i + 1) * 90_000,
    });
    setCount++;
  }
  await repos.sessions.end(ts.id);

  // ---- 體重（每週一筆，共 8 筆，緩慢下降） ----
  for (let i = 0; i < 8; i++) {
    await repos.bodyMetrics.add({
      date: addDays(today, -49 + i * 7),
      weightKg: Math.round((75.6 - i * 0.3 + (rnd() - 0.5) * 0.4) * 10) / 10,
      bodyFatPct: Math.round((18.5 - i * 0.2 + (rnd() - 0.5) * 0.3) * 10) / 10,
    });
  }

  // ---- profile、最愛、飲食 ----
  await repos.profile.save(buildProfileRow());
  await repos.exercises.toggleFavorite('vx-0025');
  await repos.exercises.toggleFavorite('vx-0032');

  const meal = (date: DateStr, name: string, p: number, c: number, f: number, grams?: number): Omit<Meal, 'id'> => ({
    date,
    name,
    grams,
    servings: 1,
    proteinG: p,
    carbG: c,
    fatG: f,
    kcal: kcalFromMacros({ proteinG: p, carbG: c, fatG: f }),
  });
  for (const date of [today, addDays(today, -1)]) {
    await repos.meals.add(meal(date, '燕麥牛奶蛋白', 32, 55, 12));
    await repos.meals.add(meal(date, '雞胸便當', 45, 70, 15, 450));
    await repos.meals.add(meal(date, '希臘優格', 18, 12, 4, 200));
  }
  await repos.meals.addFavorite({ name: '雞胸便當', proteinG: 45, carbG: 70, fatG: 15, kcal: kcalFromMacros({ proteinG: 45, carbG: 70, fatG: 15 }) });

  return {
    today,
    sessionCount,
    setCount,
    templateIds: { pushPull: pushPull.id, legs: legs.id, travel: travel.id },
    planIds: { gear: gear.id, travel: travelPlan.id },
  };
}
