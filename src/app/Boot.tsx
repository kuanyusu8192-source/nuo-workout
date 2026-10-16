import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { BackupServiceProvider } from '../features/settings/backupService';
import { App, type AppProps } from './App';
import { bootstrap, type Booted } from './bootstrap';
import { ReposProvider, useAsync } from './context';

export interface BootProps extends AppProps {
  /** 測試可注入；預設走真正的 bootstrap() */
  boot?: () => Promise<Booted>;
}

/** 啟動外殼：載入中顯示 Skeleton，失敗顯示可重試的錯誤畫面，成功後掛上 Provider 與 App。 */
export function Boot({ boot = () => bootstrap(), onExit }: BootProps) {
  const q = useAsync(boot, []);
  if (q.error) {
    return (
      <main class="app-boot">
        <EmptyState
          icon="x"
          title="啟動失敗"
          description={q.error.message}
          actionLabel="重試"
          onAction={q.reload}
        />
      </main>
    );
  }
  if (!q.data) {
    return (
      <main class="app-boot">
        <Skeleton height={48} lines={4} label="資料庫載入中" />
      </main>
    );
  }
  const app = <App onExit={onExit} />;
  return (
    <ReposProvider repos={q.data.repos}>
      {q.data.backup ? <BackupServiceProvider service={q.data.backup}>{app}</BackupServiceProvider> : app}
    </ReposProvider>
  );
}
