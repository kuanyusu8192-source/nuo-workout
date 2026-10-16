/** 契約（簽名不可改）：動作詳情，四分頁 教學／紀錄／圖表／歷史。 */
import { Button } from '../../components/Button';
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder';
import type { ExerciseDetailTab } from '../shared';

export interface ExerciseDetailProps {
  exerciseId: string;
  initialTab?: ExerciseDetailTab;
  onClose(): void;
}

export function ExerciseDetail({ exerciseId, initialTab = 'tutorial', onClose }: ExerciseDetailProps) {
  return (
    <div>
      <ScreenPlaceholder name="動作詳情" hint={`動作 ${exerciseId}，分頁 ${initialTab}`} />
      <Button variant="ghost" onClick={onClose}>關閉</Button>
    </div>
  );
}
