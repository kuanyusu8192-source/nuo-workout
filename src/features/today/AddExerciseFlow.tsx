/**
 * 選好動作後的原版流程：小對話框「加入今日訓練／看教學」。
 * 「看教學」開 ExerciseDetail 的 Sheet，並在 Sheet 底部放「加入今日訓練」（用 Sheet 的 footer，不改 ExerciseDetail 本體）。
 * 取消（關閉對話框或教學）回到動作選擇，由呼叫端決定要不要關掉選擇器。
 */
import { useEffect, useState } from 'preact/hooks';
import { useRepoQuery } from '../../app/context';
import { Button, Modal, Sheet } from '../../components';
import { ExerciseDetail } from '../exercises/ExerciseDetail';

export interface AddExerciseFlowProps {
  /** 剛從選擇器選到的動作；null＝沒有進行中的流程 */
  exerciseId: string | null;
  onAdd(exerciseId: string): void;
  onCancel(): void;
}

export function AddExerciseFlow({ exerciseId, onAdd, onCancel }: AddExerciseFlowProps) {
  const [viewing, setViewing] = useState(false);
  const ex = useRepoQuery((r) => (exerciseId ? r.exercises.get(exerciseId) : Promise.resolve(undefined)), [exerciseId]);

  // 換一個動作（或結束流程）就回到對話框
  useEffect(() => setViewing(false), [exerciseId]);

  const name = ex.data?.name ?? '這個動作';
  const add = () => {
    if (exerciseId) onAdd(exerciseId);
  };
  const addButton = (
    <Button variant="primary" fullWidth onClick={add}>加入今日訓練</Button>
  );

  return (
    <>
      <Modal
        open={exerciseId !== null && !viewing}
        title={name}
        onClose={onCancel}
        actions={
          <>
            <Button variant="ghost" onClick={() => setViewing(true)}>看教學</Button>
            {addButton}
          </>
        }
      >
        <p>要把它加入今日訓練，還是先看教學？</p>
      </Modal>
      <Sheet open={exerciseId !== null && viewing} title={name} onClose={() => setViewing(false)} footer={addButton}>
        {exerciseId && viewing ? <ExerciseDetail exerciseId={exerciseId} initialTab="tutorial" onClose={() => setViewing(false)} /> : null}
      </Sheet>
    </>
  );
}
