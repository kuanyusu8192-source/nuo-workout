/** 今日紀錄摘要彈窗：總容量、消耗 kcal、每個動作的每組（可編輯／刪除）。資料來自畫面上的本機狀態，編輯與刪除走同一條存檔路徑。 */
import { useState } from 'preact/hooks';
import { useAsync, useRepos } from '../../app/context';
import { Button, EmptyState, IconButton, Sheet } from '../../components';
import { normalizeSessionMode, type Exercise, type Session, type Settings } from '../../data/types';
import { estimateDayBurn, type DayBurnSet } from '../../domain/dayburn';
import { totalVolume } from '../../domain/strength';
import type { DateStr } from '../../domain/types';
import { loadDayBurnInputs } from '../diet/dietData';
import { fmtNum, isBodyweight, isComplete, kgToDisplay, toSetFields, type LoadUnit, type Values } from './model';
import { RowInputs } from './RowInputs';
import { hintFor, type CardState } from './workout';

export interface SummarySheetProps {
  open: boolean;
  onClose(): void;
  date: DateStr;
  session: Session;
  settings: Settings;
  cards: CardState[];
  exMap: Record<string, Exercise>;
  unit: LoadUnit;
  onChangeRow(exerciseId: string, rowKey: string, patch: Partial<Values>): void;
  onRemoveRow(exerciseId: string, rowKey: string): void;
}

function setLine(ex: Exercise, v: Values, unit: LoadUnit): string {
  if (ex.trackingType === 'strength') return `${v.weight === null ? '徒手' : `${fmtNum(v.weight)} ${unit}`} × ${v.reps ?? 0} 次`;
  if (ex.trackingType === 'cardio') {
    const extra = [v.speed ? `${v.speed} km/h` : '', v.incline ? `斜度 ${v.incline}%` : ''].filter(Boolean).join('、');
    return `${fmtNum(v.minutes ?? 0)} 分鐘${extra ? `（${extra}）` : ''}`;
  }
  return `${v.seconds ?? 0} 秒`;
}

export function SummarySheet({ open, onClose, date, session, settings, cards, exMap, unit, onChangeRow, onRemoveRow }: SummarySheetProps) {
  const repos = useRepos();
  const [editing, setEditing] = useState<string | null>(null);
  const body = useAsync(async () => {
    if (!open) return undefined;
    // 體重、覆寫、當天其他場次與設定都走和歷史／飲食頁同一條載入路徑
    return loadDayBurnInputs(repos, date);
  }, [open, repos, date]);

  // 只算「填完」的組
  const done = cards
    .map((c) => ({ card: c, ex: exMap[c.exerciseId] }))
    .filter((x): x is { card: CardState; ex: Exercise } => !!x.ex)
    .map(({ card, ex }) => ({
      card,
      ex,
      // 編輯中的那一列即使暫時不完整也要留著，輸入框才不會在打字中消失
      rows: card.rows
        .map((row, i) => ({ row, no: i + 1 }))
        .filter(({ row }) => row.key === editing || isComplete(ex.trackingType, row.v, isBodyweight(ex))),
    }));

  // toSetFields 的 unit 參數是「輸入值的單位」：畫面上的值是顯示單位，轉成 kg 再算容量
  const flatKg = done.flatMap(({ ex, rows }) =>
    rows.filter(({ row }) => isComplete(ex.trackingType, row.v, isBodyweight(ex))).map(({ row }) => ({ ex, f: toSetFields(ex.trackingType, row.v, unit) })),
  );
  const volumeKg = totalVolume(flatKg.filter((x) => x.ex.trackingType === 'strength').map((x) => x.f));

  // 本場用畫面上的組（含尚未存檔的編輯），同一天的其他場次用資料庫內容；演算法與歷史／飲食頁共用 estimateDayBurn
  const burnSets: DayBurnSet[] = flatKg.map(({ ex, f }) => ({
    sessionId: session.id,
    kind: ex.trackingType,
    exerciseName: ex.name,
    durationSec: f.durationSec,
    speed: f.speed,
    incline: f.incline,
  }));
  const kcal = body.data
    ? estimateDayBurn({
        sessions: [
          ...body.data.sessions.filter((s) => s.id !== session.id),
          { id: session.id, startedAt: session.startedAt, endedAt: session.endedAt, mode: normalizeSessionMode(session.mode) },
        ],
        sets: [...body.data.sets.filter((x) => x.sessionId !== session.id), ...burnSets],
        weightKg: body.data.weightKg,
        metStrength: settings.metStrength,
        override: body.data.override,
      }).kcal
    : null;
  const hasAny = done.some(({ rows }) => rows.length > 0);

  return (
    <Sheet open={open} title="今日訓練紀錄" onClose={onClose} footer={<Button variant="ghost" onClick={onClose}>關閉</Button>}>
      {!hasAny ? (
        <EmptyState title="今日尚未有訓練紀錄" description="每組填好重量與次數就會自動存檔。" />
      ) : (
        <>
          <dl class="today-sum">
            <div class="today-sum__item">
              <dt>總容量</dt>
              <dd class="num">{`${fmtNum(kgToDisplay(volumeKg, unit))} ${unit}`}</dd>
            </div>
            <div class="today-sum__item">
              <dt>消耗</dt>
              <dd class="num">{!body.data ? '計算中…' : kcal === null ? '—' : `約 ${fmtNum(kcal)} kcal`}</dd>
            </div>
          </dl>
          {done
            .filter(({ rows }) => rows.length > 0)
            .map(({ card, ex, rows }) => (
              <section key={ex.id} class="today-sum__ex" aria-label={`${ex.name} 的紀錄`}>
                <h3 class="today-sum__name">{ex.name}</h3>
                <ul class="today-sum__list">
                  {rows.map(({ row, no }) => {
                    const isEditing = editing === row.key;
                    return (
                      <li key={row.key} class="today-sum__row">
                        {isEditing ? (
                          <div class="today-sum__edit">
                            <RowInputs ex={ex} unit={unit} no={no} values={row.v} hint={hintFor(card, no - 1)} targetReps={card.targetReps} onChange={(p) => onChangeRow(ex.id, row.key, p)} />
                            <Button variant="success" onClick={() => setEditing(null)}>完成編輯</Button>
                          </div>
                        ) : (
                          <>
                            <span class="today-sum__line">
                              <span class="today-sum__no">第 {no} 組</span> {setLine(ex, row.v, unit)}
                            </span>
                            <Button variant="ghost" aria-label={`編輯 ${ex.name} 第${no}組`} onClick={() => setEditing(row.key)}>編輯</Button>
                            <IconButton icon="trash-2" variant="danger" label={`刪除 ${ex.name} 第${no}組`} onClick={() => onRemoveRow(ex.id, row.key)} />
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
        </>
      )}
    </Sheet>
  );
}
