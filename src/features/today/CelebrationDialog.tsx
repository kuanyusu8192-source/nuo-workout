/**
 * 契約（簽名不可改）：PR 慶祝頁。PR 判定與容量里程碑由呼叫端（TodayWorkout）算好後傳入。
 * 點任意處／Escape／Android 返回鍵都等於「繼續」；prefers-reduced-motion 時沒有動畫（today.css）。
 */
import { useEffect, useId, useRef } from 'preact/hooks';
import { useBackHandler } from '../../app/back';
import { ProgressBar } from '../../components';
import { nextMilestone, type PrKind } from '../../domain/pr';
import { PR_KIND_LABELS } from '../shared';
import { fmtNum } from './model';
import './today.css';

export interface CelebrationProps {
  exerciseName: string;
  kinds: PrKind[];
  newBestLabel: string;
  totalVolumeBefore: number;
  totalVolumeAfter: number;
  onContinue(): void;
}

export function CelebrationDialog({
  exerciseName, kinds, newBestLabel, totalVolumeBefore, totalVolumeAfter, onContinue,
}: CelebrationProps) {
  useBackHandler(onContinue, true);
  const titleId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    btnRef.current?.focus();
    return () => prev?.focus?.();
  }, []);

  const m = nextMilestone(totalVolumeAfter);
  const headline = m.next
    ? `容量提升！ ${fmtNum(totalVolumeBefore)} → ${fmtNum(totalVolumeAfter)} / ${fmtNum(m.next)} kg`
    : `容量提升！ ${fmtNum(totalVolumeBefore)} → ${fmtNum(totalVolumeAfter)} kg`;

  return (
    <div
      class="celebrate"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onContinue}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onContinue();
        }
      }}
    >
      <div class="celebrate__card">
        <h2 id={titleId} class="celebrate__banner">恭喜打破 PR！</h2>
        <p class="celebrate__text">{`${exerciseName} 新高：${newBestLabel}`}</p>
        <div class="celebrate__badge" aria-hidden="true">🏅</div>
        {kinds.length > 0 ? (
          <ul class="celebrate__kinds" aria-label="打破的紀錄">
            {kinds.map((k) => (
              <li key={k} class="celebrate__kind">{PR_KIND_LABELS[k]}</li>
            ))}
          </ul>
        ) : null}
        <div class="celebrate__progress">
          <p class="celebrate__headline">{headline}</p>
          {m.next ? (
            <ProgressBar label="累積總容量" value={totalVolumeAfter} max={m.next} valueText={`${fmtNum(totalVolumeAfter)} / ${fmtNum(m.next)} kg`} color="var(--success-600)" />
          ) : (
            <ProgressBar label="累積總容量" value={1} max={1} valueText={`${fmtNum(totalVolumeAfter)} kg（已達最高里程碑）`} color="var(--success-600)" />
          )}
        </div>
        <p class="celebrate__hint">點擊任意處繼續</p>
        <button ref={btnRef} type="button" class="nuo-btn nuo-btn--success celebrate__go">繼續</button>
      </div>
    </div>
  );
}
