/** 跨功能共用的小型型別與常數。新增共用常數請加在這裡，不要在各畫面各寫一份。 */

/** 應用模式：normal=一般（預設）、backfill=補記（橘棕） */
export type AppMode = 'normal' | 'backfill';

export const MODE_LABELS: Record<AppMode, string> = {
  normal: '一般',
  backfill: '補記模式',
};

/** 標頭背景用的 CSS 變數（theme.css） */
export const MODE_COLOR_VAR: Record<AppMode, string> = {
  normal: 'var(--ink)',
  backfill: 'var(--backfill)',
};

/** 動作庫大類（exercises.json 的 category），顯示順序 */
export const EXERCISE_CATEGORIES = ['胸', '背', '肩', '手臂', '核心', '臀腿', '有氧', '伸展'] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

/** 大類底下的細分肌群（exercises.json 的 primaryMuscle），供動作選擇「肌群分頁含細分」 */
export const MUSCLES_BY_CATEGORY: Record<ExerciseCategory, readonly string[]> = {
  胸: ['胸肌', '前鋸肌'],
  背: ['背闊肌', '上背', '脊椎', '斜方肌'],
  肩: ['三角肌', '前三角肌', '中三角肌', '後三角肌', '提肩胛肌'],
  手臂: ['二頭肌', '三頭肌', '前臂', '肱橈肌', '肱肌', '腕伸肌', '腕屈肌'],
  核心: ['腹肌'],
  臀腿: ['臀大肌', '股四頭肌', '膕繩肌', '小腿肌', '小腿', '內收肌', '外展肌'],
  有氧: ['心肺', '心血管'],
  伸展: [],
};

/** 常用器材（篩選列的快捷鈕）；完整清單用 EQUIPMENT_ALL */
export const EQUIPMENT_COMMON = ['槓鈴', '啞鈴', '自重', '滑輪', '槓桿式器械', '史密斯機', '壺鈴', '彈力帶'] as const;

/** exercises.json 內出現過的全部器材值（空字串＝無／自訂，顯示為「無器材」） */
export const EQUIPMENT_ALL = [
  '槓鈴', '啞鈴', '自重', '壺鈴', '六角槓', '槓桿式器械', '雪橇機', '負重', '滑輪', '奧林匹克槓鈴',
  'EZ 槓', '穩定球', '史密斯機', '彈力帶', '阻力帶', '滑雪機', '划船機', '藥球', '輔助式', '滾筒',
  '繩索', 'BOSU 球', '上肢功率計', '固定式單車', '階梯機', '鎚式', '橢圓機', '滾輪', '輪胎', '',
] as const;

export const equipmentLabel = (e: string): string => (e === '' ? '無器材' : e);

export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const;
/** 週計畫顯示順序（週一起排）對應 plan.days 的 key（0=週日） */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const TRACKING_LABELS = { strength: '重訓', cardio: '有氧', stretch: '伸展' } as const;

export const PR_KIND_LABELS = { weight: '最大重量', e1rm: '預估 1RM', volume: '單日容量' } as const;

/** 動作詳情分頁 */
export type ExerciseDetailTab = 'tutorial' | 'record' | 'chart' | 'history';
export const EXERCISE_DETAIL_TABS: ReadonlyArray<{ id: ExerciseDetailTab; label: string }> = [
  { id: 'tutorial', label: '教學' },
  { id: 'record', label: '紀錄' },
  { id: 'chart', label: '圖表' },
  { id: 'history', label: '歷史' },
];

export type PickerMode = 'single' | 'multi';
