import { useRepoQuery } from '../../app/context';
import { Skeleton } from '../../components/Skeleton';
import { BodySection } from './BodySection';
import { Card } from '../../components/Card';
import { DataSection } from './DataSection';
import { NutritionSection } from './NutritionSection';
import { PreferencesSection } from './PreferencesSection';
import './settings.css';

/** 設定分頁（P3 Task 3.10）。單機版沒有帳戶區。 */
export function SettingsScreen() {
  const q = useRepoQuery(async (r) => ({ settings: await r.settings.get(), profile: await r.profile.get() }), []);

  if (!q.data) {
    return q.error ? (
      <p class="set-error" role="alert">讀取設定失敗：{q.error.message}</p>
    ) : (
      <Skeleton lines={6} height={56} label="載入設定" />
    );
  }
  const { settings, profile } = q.data;

  return (
    <div class="set">
      <PreferencesSection settings={settings} />
      <NutritionSection profile={profile} />
      <BodySection unit={settings.weightUnit} />
      <DataSection />
      <Card title="關於">
        <p class="set-about">NUO Fit</p>
        <p class="set-note">所有資料只存放在這支手機上，沒有雲端同步。</p>
      </Card>
    </div>
  );
}
