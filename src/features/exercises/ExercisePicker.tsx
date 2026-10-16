/**
 * 契約（簽名不可改）：動作選擇。
 * - mode 'single'：點一個動作即呼叫 onSelect(id)。
 * - mode 'multi'：可複選，按「完成」呼叫 onDone(ids)。
 * - onClose：使用者取消／返回。
 * 呼叫端通常把它放在 <Sheet> 或全螢幕容器內；路由 `#/picker?mode=multi` 也會直接渲染它。
 */
import { Button } from '../../components/Button';
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder';
import type { PickerMode } from '../shared';

export interface ExercisePickerProps {
  mode: PickerMode;
  initialSelectedIds?: string[];
  onSelect?(id: string): void;
  onDone?(ids: string[]): void;
  onClose(): void;
}

export function ExercisePicker({ mode, initialSelectedIds, onDone, onClose }: ExercisePickerProps) {
  return (
    <div>
      <ScreenPlaceholder name={`動作選擇（${mode}）`} hint={`已選 ${initialSelectedIds?.length ?? 0} 個`} />
      {mode === 'multi' ? <Button variant="success" onClick={() => onDone?.(initialSelectedIds ?? [])}>完成</Button> : null}
      <Button variant="ghost" onClick={onClose}>關閉</Button>
    </div>
  );
}
