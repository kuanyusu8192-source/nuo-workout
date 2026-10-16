/** 單位換算（僅供顯示與輸入使用）。資料庫一律以 kg 儲存，切換單位只改設定值，不改既有資料。 */

export type WeightUnit = 'kg' | 'lb';

/** 1 磅 = 0.45359237 公斤（國際磅） */
export const KG_PER_LB = 0.45359237;

export const kgToLb = (kg: number): number => kg / KG_PER_LB;
export const lbToKg = (lb: number): number => lb * KG_PER_LB;

const round = (n: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** 儲存值（kg）→ 顯示值（指定單位，1 位小數） */
export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  return round(unit === 'lb' ? kgToLb(kg) : kg, 1);
}

/** 輸入值（指定單位）→ 儲存值（kg，2 位小數） */
export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  return round(unit === 'lb' ? lbToKg(value) : value, 2);
}

/** 例：`70 kg`、`154.3 lb` */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${toDisplayWeight(kg, unit)} ${unit}`;
}
