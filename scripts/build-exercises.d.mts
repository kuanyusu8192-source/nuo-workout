export type Category = '胸' | '背' | '臀腿' | '肩' | '手臂' | '核心' | '有氧' | '伸展';
export interface BuiltExercise {
  id: string;
  name: string;
  nameEn: string;
  category: Category;
  equipment: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  trackingType: 'strength' | 'cardio' | 'stretch';
  steps: string[];
  tips: string;
  gifFile: string | null;
  source: 'volumex' | 'nuo';
}
export function mapCategory(raw: string): Category;
export function trackingTypeOf(category: Category): BuiltExercise['trackingType'];
export function gifFileOf(path: string | null | undefined): string | null;
export function convertVolumex(raw: Record<string, any>): BuiltExercise;
export function convertNuo(raw: Record<string, any>): BuiltExercise;
export function assertUniqueIds(list: { id: string }[]): void;
export function buildAll(volumex: Record<string, any>[], nuo: Record<string, any>[]): BuiltExercise[];
export function normalizeName(name: string): string;
export function findAliases(volumex: BuiltExercise[], nuo: BuiltExercise[]): Record<string, string>;
export function buildAllWithAliases(
  volumex: Record<string, any>[],
  nuo: Record<string, any>[],
): { exercises: BuiltExercise[]; aliases: Record<string, string> };
export function checkExercises(list: Record<string, any>[], gifFiles?: Set<string>): string[];
