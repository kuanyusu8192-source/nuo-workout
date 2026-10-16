/** 契約（簽名不可改）：PR 慶祝頁。PR 判定與容量里程碑由呼叫端（TodayWorkout）算好後傳入。 */
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import type { PrKind } from '../../domain/pr';

export interface CelebrationProps {
  exerciseName: string;
  kinds: PrKind[];
  newBestLabel: string;
  totalVolumeBefore: number;
  totalVolumeAfter: number;
  onContinue(): void;
}

export function CelebrationDialog({ exerciseName, newBestLabel, onContinue }: CelebrationProps) {
  return (
    <Modal open title="新紀錄" onClose={onContinue} closable={false} actions={<Button variant="success" onClick={onContinue}>繼續</Button>}>
      <p>{exerciseName}：{newBestLabel}</p>
    </Modal>
  );
}
