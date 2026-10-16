import { useState } from 'preact/hooks';
import { Tabs } from '../../components';
import { CalendarTab } from './CalendarTab';
import { DietWeightTab } from './DietWeightTab';
import { TrainingTab } from './TrainingTab';
import './history.css';

type TabId = 'training' | 'calendar' | 'diet';
const TABS = [
  { id: 'training', label: '訓練' },
  { id: 'calendar', label: '日曆' },
  { id: 'diet', label: '飲食與體重' },
] as const;

/** 歷史分頁（P3 Task 3.7）：訓練（容量與力量）／日曆／飲食與體重。所有數字由 repo 即時計算。 */
export function HistoryScreen() {
  const [tab, setTab] = useState<TabId>('training');
  return (
    <Tabs tabs={TABS} value={tab} onChange={setTab} label="歷史分頁">
      {tab === 'training' ? <TrainingTab /> : tab === 'calendar' ? <CalendarTab /> : <DietWeightTab />}
    </Tabs>
  );
}
