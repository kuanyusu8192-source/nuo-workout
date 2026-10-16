/** 今日訓練的本機狀態型別與載入邏輯（把 DB 內的 session / sets / 課表整理成「動作卡＋組列」）。 */
import type { Repos } from '../../data/repos/interfaces';
import type { Exercise, Session, Settings, Template } from '../../data/types';
import { EMPTY_VALUES, fieldsOfRow, valuesFromSet, type LoadUnit, type Values } from './model';

/** 一列組。setId 有值＝已寫入資料庫。 */
export interface RowState {
  key: string;
  setId?: string;
  v: Values;
}

export interface CardState {
  exerciseId: string;
  rows: RowState[];
  /** 該動作上一場的組數據（顯示單位），當灰色 placeholder／建議，不會自動填入 */
  hints: Values[];
  targetReps?: number;
}

export interface LoadedWorkout {
  exMap: Record<string, Exercise>;
  cards: CardState[];
  nextSetIndex: number;
  settings: Settings;
  template?: Template;
}

let seq = 0;
export const newRowKey = (): string => `row${++seq}`;
export const blankRow = (): RowState => ({ key: newRowKey(), v: { ...EMPTY_VALUES } });

/** 新加入一個動作時預設幾列：重訓＝課表組數或上次組數（都沒有 3 組）、有氧 1、伸展＝課表組數或 1 */
export function defaultRowCount(ex: Pick<Exercise, 'trackingType'>, targetSets: number | undefined, hints: readonly unknown[]): number {
  const t = targetSets && targetSets > 0 ? targetSets : 0;
  if (ex.trackingType === 'cardio') return 1;
  if (ex.trackingType === 'stretch') return t || 1;
  return t || hints.length || 3;
}

/** 第 index 列的建議值：同位置的上次組數據，超出就沿用上次最後一組 */
export function hintFor(card: Pick<CardState, 'hints'>, index: number): Values | undefined {
  const h = card.hints;
  return h.length === 0 ? undefined : h[Math.min(index, h.length - 1)];
}

/** 該動作最近一次（不含目前 session）的組數據，依 setIndex 排序 */
export async function loadHints(repos: Repos, exerciseId: string, currentSessionId: string, unit: LoadUnit): Promise<Values[]> {
  const all = await repos.sets.listByExercise(exerciseId); // 依 createdAt 排序
  const others = all.filter((s) => s.sessionId !== currentSessionId);
  if (others.length === 0) return [];
  const lastSessionId = others[others.length - 1].sessionId;
  return others
    .filter((s) => s.sessionId === lastSessionId)
    .sort((a, b) => a.setIndex - b.setIndex)
    .map((s) => valuesFromSet(fieldsOfRow(s), unit));
}

export async function makeCard(
  repos: Repos, ex: Exercise, session: Pick<Session, 'id'>, unit: LoadUnit, opts: { targetSets?: number; targetReps?: number; savedRows?: RowState[] } = {},
): Promise<CardState> {
  const hints = await loadHints(repos, ex.id, session.id, unit);
  const rows = [...(opts.savedRows ?? [])];
  const want = defaultRowCount(ex, opts.targetSets, hints);
  while (rows.length < want) rows.push(blankRow());
  return { exerciseId: ex.id, rows, hints, targetReps: opts.targetReps };
}

/**
 * 載入進行中訓練：動作順序＝課表動作 → 已有紀錄的其他動作 → 新加入的動作。
 * 注意：空白組（還沒填）不在資料庫裡，重新載入時只能由課表組數還原。
 */
export async function loadWorkout(repos: Repos, session: Session, extraExerciseIds: readonly string[] = []): Promise<LoadedWorkout> {
  const settings = await repos.settings.get();
  const unit = settings.loadUnit;
  const template = session.templateId ? await repos.templates.get(session.templateId) : undefined;
  const saved = await repos.sets.listBySession(session.id);

  const order: string[] = [];
  const push = (id: string) => {
    if (!order.includes(id)) order.push(id);
  };
  template?.exercises.forEach((e) => push(e.exerciseId));
  saved.forEach((s) => push(s.exerciseId));
  extraExerciseIds.forEach(push);

  const exMap: Record<string, Exercise> = {};
  const cards: CardState[] = [];
  for (const id of order) {
    const ex = await repos.exercises.get(id);
    if (!ex) continue; // 動作已被移除就略過
    exMap[id] = ex;
    const tpl = template?.exercises.find((e) => e.exerciseId === id);
    const savedRows: RowState[] = saved
      .filter((s) => s.exerciseId === id)
      .map((s) => ({ key: newRowKey(), setId: s.id, v: valuesFromSet(fieldsOfRow(s), unit) }));
    cards.push(await makeCard(repos, ex, session, unit, { targetSets: tpl?.targetSets, targetReps: tpl?.targetReps, savedRows }));
  }
  const nextSetIndex = saved.reduce((m, s) => Math.max(m, s.setIndex), -1) + 1;
  return { exMap, cards, nextSetIndex, settings, template };
}
