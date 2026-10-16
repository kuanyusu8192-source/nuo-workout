/** 進行中訓練的動作卡：縮圖、名稱、教學／歷史／更多、組列、加減組。 */
import { useState } from 'preact/hooks';
import { Button, Icon, IconButton } from '../../components';
import type { Exercise } from '../../data/types';
import { MoreButton } from './MoreButton';
import type { LoadUnit, Values } from './model';
import { RowInputs, rowHeaders } from './RowInputs';
import { hintFor, type CardState } from './workout';

export interface ExerciseCardProps {
  ex: Exercise;
  card: CardState;
  unit: LoadUnit;
  onChange(rowKey: string, patch: Partial<Values>): void;
  onAddRow(): void;
  onRemoveLastRow(): void;
  onTutorial(): void;
  onHistory(): void;
  onMore(): void;
}

function Thumb({ gifFile }: { gifFile?: string | null }) {
  const [broken, setBroken] = useState(false);
  if (!gifFile || broken) {
    return (
      <span class="today-thumb today-thumb--empty" aria-hidden="true">
        <Icon name="dumbbell" size={28} />
      </span>
    );
  }
  // 動作 GIF 由建置腳本複製到 gifs/；缺圖時退回占位圖示
  return <img class="today-thumb" src={`gifs/${gifFile}`} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />;
}

export function ExerciseCard({ ex, card, unit, onChange, onAddRow, onRemoveLastRow, onTutorial, onHistory, onMore }: ExerciseCardProps) {
  const headers = rowHeaders(ex.trackingType, unit);
  return (
    <article class="nuo-card today-card" aria-label={ex.name}>
      <header class="today-card__head">
        <Thumb gifFile={ex.gifFile} />
        <h3 class="today-card__name">{ex.name}</h3>
        <IconButton icon="play" label={`動作教學：${ex.name}`} onClick={onTutorial} />
        <IconButton icon="history" label={`歷史紀錄：${ex.name}`} onClick={onHistory} />
        <MoreButton label={`更多選項：${ex.name}`} onClick={onMore} />
      </header>

      {card.rows.length > 0 ? (
        <div class="today-sets" role="group" aria-label={`${ex.name} 的組數`}>
          <div class={`today-row today-row--head today-row--${ex.trackingType}`} aria-hidden="true">
            <span class="today-row__no">組</span>
            <div class={`today-row__fields today-row__fields--${ex.trackingType}`}>
              {headers.map((h) => (
                <span key={h} class="today-row__col">{h}</span>
              ))}
            </div>
            <span class="today-row__state" />
          </div>
          {card.rows.map((row, i) => (
            <div key={row.key} class={`today-row today-row--${ex.trackingType}${row.setId ? ' is-saved' : ''}`}>
              <span class="today-row__no num" aria-hidden="true">{i + 1}</span>
              <RowInputs ex={ex} unit={unit} no={i + 1} values={row.v} hint={hintFor(card, i)} targetReps={card.targetReps} onChange={(p) => onChange(row.key, p)} />
              <span class="today-row__state">{row.setId ? <Icon name="check" size={22} label="已儲存" /> : null}</span>
            </div>
          ))}
        </div>
      ) : (
        <p class="today-card__none">目前沒有組數，按「加一組」開始記錄。</p>
      )}

      <div class="today-card__actions">
        <Button variant="ghost" onClick={onRemoveLastRow} disabled={card.rows.length === 0}>
          <Icon name="minus" size={20} />
          減一組
        </Button>
        <Button variant="ghost" onClick={onAddRow}>
          <Icon name="plus" size={20} />
          加一組
        </Button>
      </div>
    </article>
  );
}
