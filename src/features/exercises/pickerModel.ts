/** 動作選擇的篩選邏輯（純函式，方便測試）。 */
import type { Exercise } from '../../data/types';
import { MUSCLES_BY_CATEGORY, type ExerciseCategory } from '../shared';

export const ALL_EQUIPMENT = '全部器材';

/** 器材晶片 → 實際資料中的 equipment 值（資料有 30 種，歸併成使用者看得懂的 8 組） */
export const EQUIPMENT_GROUPS: ReadonlyArray<{ label: string; values: readonly string[] }> = [
  { label: '自重', values: ['自重'] },
  { label: '啞鈴', values: ['啞鈴'] },
  { label: '槓鈴', values: ['槓鈴', '六角槓', '奧林匹克槓鈴', 'EZ 槓'] },
  { label: '壺鈴', values: ['壺鈴'] },
  { label: '彈力帶', values: ['彈力帶', '阻力帶'] },
  { label: '繩索', values: ['繩索', '滑輪'] },
  {
    label: '器械',
    values: ['槓桿式器械', '史密斯機', '鎚式', '輔助式', '雪橇機', '階梯機', '橢圓機', '划船機', '滑雪機', '固定式單車', '上肢功率計'],
  },
  { label: '健身球', values: ['穩定球', 'BOSU 球', '藥球'] },
];

export function matchesEquipment(e: Exercise, group: string | null): boolean {
  if (!group) return true;
  const g = EQUIPMENT_GROUPS.find((x) => x.label === group);
  return !!g && g.values.includes(e.equipment);
}

/** 細分晶片至少要有這麼多動作才顯示（避免 1–2 筆的零星肌群擠滿晶片列） */
export const MIN_MUSCLE_COUNT = 5;

/** 某大類實際可用的細分肌群（依 shared 的順序，只留資料中真的有、且數量足夠的） */
export function musclesFor(category: ExerciseCategory, inCategory: Exercise[]): string[] {
  const counts = new Map<string, number>();
  for (const e of inCategory) if (e.primaryMuscle) counts.set(e.primaryMuscle, (counts.get(e.primaryMuscle) ?? 0) + 1);
  return MUSCLES_BY_CATEGORY[category].filter((m) => (counts.get(m) ?? 0) >= MIN_MUSCLE_COUNT);
}

export const PICKER_CATEGORIES: readonly ExerciseCategory[] = ['胸', '背', '臀腿', '肩', '手臂', '核心', '有氧', '伸展'];
