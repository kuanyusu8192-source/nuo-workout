import { describe, expect, it } from 'vitest';
import { estimateDayBurn } from './dayburn';
import { buildHistoryExport, type HistoryExportInput, type HxSession } from './historyExport';

const NOW = new Date(2026, 9, 17, 21, 30, 0); // 本地 2026-10-17 21:30（週六）
const T = (date: string, h = 18, min = 0) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
};

const EX = [
  { id: 'bench', name: '槓鈴臥推', nameEn: 'Bench Press', category: '胸', equipment: '槓鈴', primaryMuscle: '胸肌', secondaryMuscles: ['三頭肌'], trackingType: 'strength' },
  { id: 'squat', name: '深蹲', nameEn: 'Squat', category: '腿', equipment: '槓鈴', primaryMuscle: '股四頭肌', secondaryMuscles: [], trackingType: 'strength' },
  { id: 'tread', name: '跑步機', nameEn: 'Treadmill', category: '有氧', equipment: '機械', primaryMuscle: '心肺', secondaryMuscles: [], trackingType: 'cardio' },
];

let n = 0;
const set = (sessionId: string, exerciseId: string, setIndex: number, kind: 'strength' | 'cardio' | 'stretch', extra: Record<string, unknown> = {}) => ({
  id: `set${++n}`, sessionId, exerciseId, setIndex, kind, createdAt: n, ...extra,
});
const session = (id: string, date: string, extra: Partial<HxSession> = {}): HxSession => ({
  id, date, startedAt: T(date), mode: 'normal', ...extra,
});

/** over 刻意寬鬆：測試要塞舊資料欄位（id、weightUnit…）驗證多餘欄位不外洩 */
function input(over: Record<string, unknown> = {}): HistoryExportInput {
  return {
    sessions: [], sets: [], exercises: EX, templates: [], bodyMetrics: [], meals: [], burnOverrides: [],
    profile: { sex: 'male', age: 30, heightCm: 175, weightKg: 70, pal: 1.55, goal: 'maintain', tdee: 2555, kcalTarget: 2556, macros: { proteinG: 224, carbG: 160, fatG: 114 } },
    settings: { weightUnit: 'kg', loadUnit: 'kg', metStrength: 5 },
    ...over,
  } as HistoryExportInput;
}
const opts = (o: Record<string, unknown> = {}) => ({ range: 'all' as const, now: NOW, ...o });

describe('buildHistoryExport：基本結構', () => {
  it('空資料也輸出合法結構', () => {
    const r = buildHistoryExport(input({ profile: null }), opts());
    expect(r.format).toBe('nuo-fit-history');
    expect(r.version).toBe(1);
    expect(r.units).toEqual({ weight: 'kg', distance: 'm', speed: 'km/h', energy: 'kcal' });
    expect(r.sessions).toEqual([]);
    expect(r.summary).toMatchObject({ sessionCount: 0, trainingDays: 0, totalVolumeKg: 0, totalCardioMinutes: 0, weeklyVolumeKg: [], personalRecords: [] });
    expect(r.range.to).toBe('2026-10-17');
    expect(r.aboutThisFile).toContain('Epley');
    expect(r.aboutThisFile).toContain('w×(1+reps/30)');
    expect(r.aboutThisFile).toContain('請根據這份紀錄');
    expect(r.profile).toBeUndefined();
  });

  it('generatedAt 為本地 ISO（含時區偏移，不是 UTC Z）', () => {
    const r = buildHistoryExport(input(), opts());
    expect(r.generatedAt).toMatch(/^2026-10-17T21:30:00[+-]\d{2}:\d{2}$/);
    expect(r.generatedAt.endsWith('Z')).toBe(false);
    const off = -NOW.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
    const mm = String(Math.abs(off) % 60).padStart(2, '0');
    expect(r.generatedAt.endsWith(`${sign}${hh}:${mm}`)).toBe(true);
  });

  it('40kg×10：e1RM 53.3、volume 400、重量四捨五入 0.1', () => {
    const r = buildHistoryExport(
      input({
        sessions: [session('s1', '2026-10-10', { endedAt: T('2026-10-10', 19, 0) })],
        sets: [set('s1', 'bench', 1, 'strength', { weightKg: 40, reps: 10 })],
      }),
      opts(),
    );
    const ex = r.sessions[0].exercises[0];
    expect(ex.bestSet).toEqual({ weightKg: 40, reps: 10, e1rmKg: 53.3 });
    expect(ex.totalVolumeKg).toBe(400);
    expect(ex.name).toBe('槓鈴臥推');
    expect(ex.sets[0]).toEqual({ set: 1, weightKg: 40, reps: 10 });
    expect(r.sessions[0].totals).toMatchObject({ sets: 1, volumeKg: 400 });
    expect(r.exercises.bench).toMatchObject({ name: '槓鈴臥推', nameEn: 'Bench Press', category: '胸', equipment: '槓鈴', primaryMuscle: '胸肌', secondaryMuscles: ['三頭肌'] });
    expect(r.exercises.squat).toBeUndefined(); // 只列用到的
  });

  it('session 欄位：weekday、durationMin、template、mode 舊值 gear/travel → normal', () => {
    const r = buildHistoryExport(
      input({
        sessions: [
          session('s1', '2026-10-10', { endedAt: T('2026-10-10', 19, 0), templateId: 't1', mode: 'gear' }),
          session('s2', '2026-10-11', { mode: 'travel' }),
          session('s3', '2026-10-12', { mode: 'backfill', endedAt: T('2026-10-12', 20, 0) }),
        ],
        templates: [{ id: 't1', name: '推日' }],
        sets: [
          set('s1', 'bench', 1, 'strength', { weightKg: 50, reps: 5 }),
          set('s2', 'bench', 1, 'strength', { weightKg: 50, reps: 5 }),
          set('s3', 'bench', 1, 'strength', { weightKg: 50, reps: 5 }),
        ],
      }),
      opts(),
    );
    const [a, b, c] = r.sessions;
    expect(a).toMatchObject({ date: '2026-10-10', weekday: '週六', durationMin: 60, template: '推日', mode: 'normal' });
    expect(a.startedAt).toMatch(/^2026-10-10T18:00:00[+-]\d{2}:\d{2}$/);
    expect(b).toMatchObject({ weekday: '週日', durationMin: null, template: null, mode: 'normal', endedAt: null });
    expect(c).toMatchObject({ mode: 'backfill', durationMin: null });
  });

  it('依日期升冪排序', () => {
    const r = buildHistoryExport(
      input({
        sessions: [session('b', '2026-10-12'), session('a', '2026-10-05')],
        sets: [set('a', 'bench', 1, 'strength', { weightKg: 10, reps: 1 }), set('b', 'bench', 1, 'strength', { weightKg: 10, reps: 1 })],
      }),
      opts(),
    );
    expect(r.sessions.map((s) => s.date)).toEqual(['2026-10-05', '2026-10-12']);
  });

  it('有氧組：欄位完整輸出，分鐘數與 estimatedKcal 與 estimateDayBurn 一致', () => {
    const s1 = session('s1', '2026-10-10', { endedAt: T('2026-10-10', 18, 40) });
    const sets = [
      set('s1', 'bench', 1, 'strength', { weightKg: 40, reps: 10 }),
      set('s1', 'tread', 1, 'cardio', { durationSec: 600, distanceM: 1500, speed: 9, incline: 1, watts: 120, floors: 3 }),
    ];
    const r = buildHistoryExport(input({ sessions: [s1], sets }), opts());
    const cardio = r.sessions[0].exercises.find((e) => e.exerciseId === 'tread')!;
    expect(cardio.sets[0]).toEqual({ set: 1, durationSec: 600, distanceM: 1500, speedKmh: 9, inclinePct: 1, watts: 120, floors: 3 });
    expect(cardio.bestSet).toBeNull();
    expect(cardio.isPersonalRecord).toBe(false);
    expect(r.sessions[0].totals.cardioMinutes).toBe(10);
    const expected = estimateDayBurn({
      sessions: [{ id: 's1', startedAt: s1.startedAt, endedAt: s1.endedAt, mode: 'normal' }],
      sets: [
        { sessionId: 's1', kind: 'strength' },
        { sessionId: 's1', kind: 'cardio', durationSec: 600, speed: 9, incline: 1, exerciseName: '跑步機' },
      ],
      weightKg: 70,
      metStrength: 5,
    }).kcal;
    expect(expected).not.toBeNull();
    expect(r.sessions[0].totals.estimatedKcal).toBe(expected);
  });

  it('沒有體重（無 profile、無體重紀錄）→ estimatedKcal null；有體重紀錄則採最新一筆', () => {
    const base = { sessions: [session('s1', '2026-10-10')], sets: [set('s1', 'bench', 1, 'strength', { weightKg: 40, reps: 10 })], profile: null };
    expect(buildHistoryExport(input(base), opts()).sessions[0].totals.estimatedKcal).toBeNull();
    const withBody = buildHistoryExport(input({ ...base, bodyMetrics: [{ id: 'b', date: '2026-10-01', weightKg: 80 }] }), opts());
    expect(withBody.sessions[0].totals.estimatedKcal).toBe(Math.round((5 * 80 * 3) / 60));
  });
});

describe('buildHistoryExport：範圍與 PR', () => {
  const sessions = [
    session('old', '2026-01-10'),
    session('edge-out', '2026-09-17'),
    session('edge-in', '2026-09-18'),
    session('today', '2026-10-17'),
  ];
  const sets = [
    set('old', 'bench', 1, 'strength', { weightKg: 100, reps: 5 }),
    set('edge-out', 'bench', 1, 'strength', { weightKg: 60, reps: 5 }),
    set('edge-in', 'bench', 1, 'strength', { weightKg: 60, reps: 5 }),
    set('today', 'bench', 1, 'strength', { weightKg: 110, reps: 5 }),
  ];

  it('last30 含今天往前 30 天：09-18 在內、09-17 不在', () => {
    const r = buildHistoryExport(input({ sessions, sets }), opts({ range: 'last30' }));
    expect(r.range).toEqual({ from: '2026-09-18', to: '2026-10-17' });
    expect(r.sessions.map((s) => s.date)).toEqual(['2026-09-18', '2026-10-17']);
    expect(r.summary.sessionCount).toBe(2);
  });

  it('last90：from = 今天往前 90 天（含今天）', () => {
    const r = buildHistoryExport(input({ sessions, sets }), opts({ range: 'last90' }));
    expect(r.range.from).toBe('2026-07-20');
    expect(r.sessions).toHaveLength(3);
  });

  it('all：全部', () => {
    const r = buildHistoryExport(input({ sessions, sets }), opts());
    expect(r.sessions).toHaveLength(4);
    expect(r.range.from).toBe('2026-01-10');
  });

  it('PR 判定使用範圍外的舊紀錄：09-18 的 60kg 不是 PR（舊有 100kg），10-17 的 110kg 是', () => {
    const r = buildHistoryExport(input({ sessions, sets }), opts({ range: 'last30' }));
    expect(r.sessions[0].exercises[0].isPersonalRecord).toBe(false);
    expect(r.sessions[1].exercises[0].isPersonalRecord).toBe(true);
  });

  it('summary.personalRecords：依 e1RM 由高到低，只列有力量紀錄的動作，最多 30 筆', () => {
    const r = buildHistoryExport(
      input({
        sessions: [session('a', '2026-10-01'), session('b', '2026-10-02')],
        sets: [
          set('a', 'bench', 1, 'strength', { weightKg: 60, reps: 5 }),
          set('a', 'squat', 1, 'strength', { weightKg: 100, reps: 5 }),
          set('b', 'tread', 1, 'cardio', { durationSec: 60 }),
        ],
      }),
      opts(),
    );
    expect(r.summary.personalRecords.map((p) => p.exerciseId)).toEqual(['squat', 'bench']);
    expect(r.summary.personalRecords[0]).toEqual({ exerciseId: 'squat', name: '深蹲', bestWeightKg: 100, bestE1rmKg: 116.7, achievedOn: '2026-10-01' });

    const many = Array.from({ length: 35 }, (_, i) => ({ ...EX[0], id: `e${i}`, name: `動作${i}` }));
    const r2 = buildHistoryExport(
      input({
        exercises: many,
        sessions: [session('a', '2026-10-01')],
        sets: many.map((e, i) => set('a', e.id, 1, 'strength', { weightKg: 10 + i, reps: 5 })),
      }),
      opts(),
    );
    expect(r2.summary.personalRecords).toHaveLength(30);
  });
});

describe('buildHistoryExport：summary', () => {
  it('總量、訓練日、週彙總（週一起）', () => {
    const r = buildHistoryExport(
      input({
        sessions: [session('a', '2026-10-05'), session('b', '2026-10-07'), session('c', '2026-10-12'), session('d', '2026-10-12', { startedAt: T('2026-10-12', 20) })],
        sets: [
          set('a', 'bench', 1, 'strength', { weightKg: 50, reps: 10 }),
          set('b', 'bench', 1, 'strength', { weightKg: 50, reps: 10 }),
          set('c', 'bench', 1, 'strength', { weightKg: 20, reps: 10 }),
          set('d', 'tread', 1, 'cardio', { durationSec: 1800 }),
        ],
      }),
      opts(),
    );
    expect(r.summary.sessionCount).toBe(4);
    expect(r.summary.trainingDays).toBe(3);
    expect(r.summary.totalVolumeKg).toBe(1200);
    expect(r.summary.totalCardioMinutes).toBe(30);
    expect(r.summary.weeklyVolumeKg).toEqual([
      { weekStart: '2026-10-05', volumeKg: 1000, sessions: 2 },
      { weekStart: '2026-10-12', volumeKg: 200, sessions: 2 },
    ]);
  });
});

describe('buildHistoryExport：身體、飲食、個人資料', () => {
  const body = [
    { id: '2', date: '2026-10-10', weightKg: 70.04 },
    { id: '1', date: '2026-01-01', weightKg: 75, bodyFatPct: 20.25 },
  ];
  const meals = [
    { id: 'm1', date: '2026-10-10', name: '雞胸', servings: 2, proteinG: 46.04, carbG: 0, fatG: 6, kcal: 260 },
    { id: 'm2', date: '2026-10-10', name: '白飯', servings: 1, proteinG: 4, carbG: 50, fatG: 0.5, kcal: 230 },
    { id: 'm3', date: '2026-01-02', name: '舊的', servings: 1, proteinG: 1, carbG: 1, fatG: 1, kcal: 17 },
  ];

  it('bodyMetrics 升冪、四捨五入；nutrition 依日期、含目標', () => {
    const r = buildHistoryExport(input({ bodyMetrics: body, meals }), opts());
    expect(r.bodyMetrics).toEqual([
      { date: '2026-01-01', weightKg: 75, bodyFatPct: 20.3 },
      { date: '2026-10-10', weightKg: 70, bodyFatPct: null },
    ]);
    expect(r.nutrition!.map((d) => d.date)).toEqual(['2026-01-02', '2026-10-10']);
    expect(r.nutrition![1]).toEqual({
      date: '2026-10-10', targetKcal: 2556, eatenKcal: 490, proteinG: 50, carbG: 50, fatG: 6.5,
      meals: [
        { name: '雞胸', servings: 2, kcal: 260, proteinG: 46, carbG: 0, fatG: 6 },
        { name: '白飯', servings: 1, kcal: 230, proteinG: 4, carbG: 50, fatG: 0.5 },
      ],
    });
  });

  it('沒有 profile → targetKcal null', () => {
    const r = buildHistoryExport(input({ meals, profile: null }), opts());
    expect(r.nutrition![0].targetKcal).toBeNull();
  });

  it('bodyMetrics／nutrition 與 sessions 同範圍', () => {
    const r = buildHistoryExport(input({ bodyMetrics: body, meals }), opts({ range: 'last30' }));
    expect(r.bodyMetrics!.map((b) => b.date)).toEqual(['2026-10-10']);
    expect(r.nutrition!.map((d) => d.date)).toEqual(['2026-10-10']);
  });

  it('includeX 開關：關掉就沒有該欄位；預設皆開', () => {
    const full = buildHistoryExport(input({ bodyMetrics: body, meals }), opts());
    expect(full.profile).toBeDefined();
    expect(full.bodyMetrics).toBeDefined();
    expect(full.nutrition).toBeDefined();
    const off = buildHistoryExport(input({ bodyMetrics: body, meals }), opts({ includeMeals: false, includeBody: false, includeProfile: false }));
    expect('profile' in off).toBe(false);
    expect('bodyMetrics' in off).toBe(false);
    expect('nutrition' in off).toBe(false);
  });

  it('profile 內容正確，且不含姓名／Email／識別資訊', () => {
    const dirty = { ...input().profile, name: 'Steven', email: 'a@b.com', id: 1 };
    const r = buildHistoryExport(input({ profile: dirty as never, sessions: [session('a', '2026-10-01')], sets: [set('a', 'bench', 1, 'strength', { weightKg: 1, reps: 1 })] }), opts());
    expect(r.profile).toEqual({
      sex: 'male', age: 30, heightCm: 175, weightKg: 70, pal: 1.55, goal: 'maintain',
      kcalTarget: 2556, macros: { proteinG: 224, carbG: 160, fatG: 114 },
    });
    expect(Object.keys(r.profile!)).not.toContain('name');
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/email/i);
    expect(text).not.toContain('Steven');
    expect(text).not.toContain('a@b.com');
  });
});

describe('buildHistoryExport：正確性', () => {
  it('lb 使用者的資料仍輸出 kg', () => {
    const r = buildHistoryExport(
      input({
        settings: { weightUnit: 'lb', loadUnit: 'lb', metStrength: 5 },
        sessions: [session('a', '2026-10-01')],
        sets: [set('a', 'bench', 1, 'strength', { weightKg: 45.36, reps: 10 })],
      }),
      opts(),
    );
    expect(r.units.weight).toBe('kg');
    expect(r.sessions[0].exercises[0].sets[0].weightKg).toBe(45.4);
  });

  it('NaN／負值不會出現，也不會產生 null 以外的壞值', () => {
    const r = buildHistoryExport(
      input({
        sessions: [session('a', '2026-10-01')],
        sets: [
          set('a', 'bench', 1, 'strength', { weightKg: Number.NaN, reps: -3 }),
          set('a', 'bench', 2, 'strength', { weightKg: 20, reps: 5 }),
          set('a', 'tread', 1, 'cardio', { durationSec: -10, speed: Number.POSITIVE_INFINITY }),
        ],
      }),
      opts(),
    );
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/NaN|Infinity/);
    const walk = (v: unknown): void => {
      if (typeof v === 'number') {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk({ ...r, generatedAt: undefined });
    expect(r.sessions[0].exercises[0].sets[0]).toEqual({ set: 1 });
    expect(r.sessions[0].exercises[0].totalVolumeKg).toBe(100);
  });

  it('同一份輸入重複呼叫結果相同，且 JSON 往返不變', () => {
    const i = input({
      sessions: [session('a', '2026-10-01', { endedAt: T('2026-10-01', 19) })],
      sets: [set('a', 'bench', 1, 'strength', { weightKg: 40, reps: 10 }), set('a', 'tread', 1, 'cardio', { durationSec: 300, speed: 8 })],
      bodyMetrics: [{ id: 'b', date: '2026-10-01', weightKg: 70 }],
      meals: [{ id: 'm', date: '2026-10-01', name: 'x', servings: 1, proteinG: 1, carbG: 1, fatG: 1, kcal: 17 }],
    });
    const a = buildHistoryExport(i, opts());
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(buildHistoryExport(i, opts())).toEqual(a);
  });

  it('不修改輸入', () => {
    const i = input({ sessions: [session('a', '2026-10-01')], sets: [set('a', 'bench', 1, 'strength', { weightKg: 40, reps: 10 })] });
    const snap = JSON.stringify(i);
    buildHistoryExport(i, opts());
    expect(JSON.stringify(i)).toBe(snap);
  });

  it('sets 依 setIndex 排序；動作依第一組建立順序', () => {
    const r = buildHistoryExport(
      input({
        sessions: [session('a', '2026-10-01')],
        sets: [
          set('a', 'bench', 1, 'strength', { weightKg: 30, reps: 5 }),
          set('a', 'squat', 2, 'strength', { weightKg: 60, reps: 5 }),
          set('a', 'squat', 1, 'strength', { weightKg: 50, reps: 5 }),
        ],
      }),
      opts(),
    );
    const ex = r.sessions[0].exercises;
    expect(ex.map((e) => e.exerciseId)).toEqual(['bench', 'squat']);
    expect(ex[1].sets.map((s) => s.set)).toEqual([1, 2]);
  });
});
