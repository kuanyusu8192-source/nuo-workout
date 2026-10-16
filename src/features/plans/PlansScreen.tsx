import { useState } from 'preact/hooks';
import { EmptyState } from '../../components/EmptyState';
import { Tabs } from '../../components/Tabs';
import { TemplateDetail, type TemplateDetailTarget } from './TemplateDetail';
import { TemplateList } from './TemplateList';
import { WeekPlans } from './WeekPlans';
import './plans.css';

type PlansTab = 'weeks' | 'templates' | 'rookie';
const TABS = [
  { id: 'weeks', label: '週計畫' },
  { id: 'templates', label: '課表' },
  { id: 'rookie', label: '新人計畫' },
] as const;

/** 計畫分頁（P3 Task 3.8）：週計畫／課表／新人計畫。課表詳情是分頁內的全螢幕子視圖，返回鍵先回到清單。 */
export function PlansScreen() {
  const [tab, setTab] = useState<PlansTab>('weeks');
  const [detail, setDetail] = useState<TemplateDetailTarget | null>(null);
  // 詳情頁自己攔截返回（有未儲存變更時要詢問），所以這裡不註冊 handler
  if (detail) {
    return <TemplateDetail key={detail.key} target={detail} onBack={() => setDetail(null)} />;
  }
  return (
    <div class="plans">
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="計畫類型">
        {tab === 'weeks' ? <WeekPlans /> : null}
        {tab === 'templates' ? <TemplateList onOpen={setDetail} /> : null}
        {tab === 'rookie' ? (
          <EmptyState icon="list-checks" title="新人計畫即將推出" description="依每週訓練日數自動配對分化與動作，之後版本會加入。" />
        ) : null}
      </Tabs>
    </div>
  );
}

