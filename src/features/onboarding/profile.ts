import type { ProfileRow } from '../../data/types';
import { goalMultiplier, kcalTarget, macrosFromKcal, tdee } from '../../domain/nutrition';
import type { Goal, Macros, Profile, Sex } from '../../domain/types';

export const SEX_OPTIONS: ReadonlyArray<{ value: Sex; label: string }> = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'other', label: '其他' },
];

/** PAL 各級的說明文字（標籤本身來自 domain 的 PAL_LEVELS）。說明不得出現其他等級／目標的名稱。 */
export const PAL_DESCRIPTIONS: Record<number, string> = {
  1.2: '幾乎不運動，工作與生活多半坐著',
  1.375: '每週運動 1–3 天，或日常會走動',
  1.55: '每週運動 3–5 天',
  1.725: '每週運動 6–7 天，強度偏高',
  1.9: '每天高強度訓練，或從事重體力工作',
};

export const GOAL_OPTIONS: ReadonlyArray<{ value: Goal; label: string; desc: string }> = [
  { value: 'cut', label: '減脂', desc: '熱量比 TDEE 少 20%' },
  { value: 'maintain', label: '維持', desc: '熱量等於 TDEE' },
  { value: 'bulk', label: '增肌', desc: '熱量比 TDEE 多 10%' },
];

/** 驗證範圍（問卷步驟 1） */
export const RANGES = {
  age: { min: 10, max: 100 },
  heightCm: { min: 100, max: 230 },
  weightKg: { min: 30, max: 300 },
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ProfileCalc {
  tdee: number;
  kcalTarget: number;
  macros: Macros;
  /** 目標與 TDEE 的倍率（供預覽顯示） */
  multiplier: number;
}

/** 由問卷輸入算出 TDEE（2 位小數）、目標熱量與三大營養素（35/25/40）。 */
export function calcProfile(p: Profile): ProfileCalc {
  const target = kcalTarget(p);
  return {
    tdee: round2(tdee(p)),
    kcalTarget: target,
    macros: macrosFromKcal(target),
    multiplier: goalMultiplier(p.goal),
  };
}

export function buildProfileRow(p: Profile): Omit<ProfileRow, 'id'> {
  const c = calcProfile(p);
  return { ...p, tdee: c.tdee, kcalTarget: c.kcalTarget, macros: c.macros };
}
