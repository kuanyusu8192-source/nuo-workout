import { describe, expect, it } from 'vitest';
import exercises from '../assets/exercises.json';
import { EQUIPMENT_ALL, EXERCISE_CATEGORIES, MODE_COLOR_VAR, MODE_LABELS, MUSCLES_BY_CATEGORY, equipmentLabel } from './shared';

describe('共用常數與動作庫一致', () => {
  const list = exercises as Array<{ category: string; equipment: string; primaryMuscle: string }>;

  it('所有 category 都在清單內', () => {
    const cats = new Set(list.map((e) => e.category));
    for (const c of cats) expect(EXERCISE_CATEGORIES as readonly string[]).toContain(c);
  });
  it('所有 (category, primaryMuscle) 都收錄在細分肌群表', () => {
    for (const e of list) {
      if (!e.primaryMuscle) continue;
      expect(MUSCLES_BY_CATEGORY[e.category as keyof typeof MUSCLES_BY_CATEGORY]).toContain(e.primaryMuscle);
    }
  });
  it('所有器材值都在 EQUIPMENT_ALL', () => {
    for (const e of list) expect(EQUIPMENT_ALL as readonly string[]).toContain(e.equipment);
    expect(equipmentLabel('')).toBe('無器材');
  });
  it('兩種模式都有標籤與色彩變數，沒有 gear／travel 殘留', () => {
    expect(Object.keys(MODE_LABELS).sort()).toEqual(['backfill', 'normal']);
    expect(Object.keys(MODE_COLOR_VAR).sort()).toEqual(['backfill', 'normal']);
    for (const m of ['normal', 'backfill'] as const) {
      expect(MODE_LABELS[m]).toBeTruthy();
      expect(MODE_COLOR_VAR[m]).toMatch(/^var\(--/);
    }
  });
});
