/**
 * 備份服務：設定畫面取得 NuoDB 的唯一途徑。畫面不直接碰 Dexie；測試時注入假的 BackupService。
 * P4 接線：在 main.tsx 的 <ReposProvider> 內用 <BackupServiceProvider service={createDbBackupService(db)}> 包住 <App />；
 * 未包時使用預設實作（getDb()，僅在 Dexie 模式下有意義）。
 */
import { createContext, type ComponentChildren } from 'preact';
import { useContext, useMemo } from 'preact/hooks';
import { backupFileName, exportBackup, importBackup } from '../../data/backup';
import { getDb, type NuoDB } from '../../data/db';

/** 各資料表匯入筆數 */
export type Counts = Record<string, number>;

export interface BackupService {
  /** 匯出整份備份，回傳 JSON 字串 */
  export(): Promise<string>;
  /** 以取代模式匯入 JSON 字串；失敗必須拋錯且資料不變 */
  import(json: string): Promise<Counts>;
}

/** 以 NuoDB 為對象的實作（預設 getDb()）。 */
export function createDbBackupService(db: NuoDB = getDb()): BackupService {
  return {
    async export() {
      return JSON.stringify(await exportBackup(db));
    },
    async import(json) {
      return { ...(await importBackup(db, JSON.parse(json), 'replace')) };
    },
  };
}

const BackupServiceContext = createContext<BackupService | null>(null);

export function BackupServiceProvider({ service, children }: { service: BackupService; children?: ComponentChildren }) {
  return <BackupServiceContext.Provider value={service}>{children}</BackupServiceContext.Provider>;
}

export function useBackupService(): BackupService {
  const injected = useContext(BackupServiceContext);
  // 沒注入時才建立預設實作（getDb() 本身是惰性單例，不會在此時開啟資料庫）
  return useMemo(() => injected ?? createDbBackupService(), [injected]);
}

export { backupFileName };

/** 備份內容預覽（匯入確認用）：從 JSON 文字取出備份時間與各表筆數。無法辨識時拋錯。 */
export interface BackupPreview {
  exportedAt: string | null;
  counts: Array<{ key: string; label: string; count: number }>;
}

export const TABLE_LABELS: ReadonlyArray<[string, string]> = [
  ['sessions', '訓練場次'],
  ['sets', '訓練組數'],
  ['exercises', '自訂動作'],
  ['favoriteExercises', '最愛動作'],
  ['templates', '課表'],
  ['plans', '週計畫'],
  ['bodyMetrics', '體重紀錄'],
  ['meals', '飲食紀錄'],
  ['favoriteMeals', '最愛飲食'],
  ['burnOverrides', '消耗覆寫'],
  ['profile', '個人資料'],
  ['settings', '設定'],
];

export function previewBackup(json: string): BackupPreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('檔案不是有效的 JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('檔案內容不是備份格式');
  const f = parsed as { exportedAt?: unknown; data?: unknown };
  if (typeof f.data !== 'object' || f.data === null) throw new Error('檔案內容不是備份格式（缺少 data）');
  const data = f.data as Record<string, unknown>;
  const counts = TABLE_LABELS.map(([key, label]) => ({
    key,
    label,
    count: Array.isArray(data[key]) ? (data[key] as unknown[]).length : 0,
  }));
  return { exportedAt: typeof f.exportedAt === 'string' ? f.exportedAt : null, counts };
}
