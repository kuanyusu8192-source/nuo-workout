/** 路由路徑建構器：畫面之間導覽一律用這裡，不要手寫字串。 */
import type { ExerciseDetailTab, PickerMode } from '../features/shared';

export const paths = {
  today: '/today',
  history: '/history',
  plans: '/plans',
  diet: '/diet',
  settings: '/settings',
  onboarding: '/onboarding',
  exercise: (id: string, tab?: ExerciseDetailTab) =>
    `/exercise/${encodeURIComponent(id)}${tab ? `?tab=${tab}` : ''}`,
  picker: (mode: PickerMode = 'single') => `/picker?mode=${mode}`,
} as const;
