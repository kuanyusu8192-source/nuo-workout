/** 飲食日曆：顯示一個月，有飲食紀錄的日子以「●」＋文字標記，點日期跳轉。 */
import { useState } from 'preact/hooks';
import { useRepoQuery } from '../../app/context';
import { IconButton, Sheet } from '../../components';
import type { DateStr } from '../../domain/types';
import { md, monthCells, monthOf, shiftMonth } from './dietLogic';

export interface CalendarSheetProps {
  /** 目前選取日（決定初始顯示的月份） */
  date: DateStr;
  today: DateStr;
  onPick: (d: DateStr) => void;
  onClose: () => void;
}

const HEAD = ['一', '二', '三', '四', '五', '六', '日'] as const;

export function CalendarSheet({ date, today, onPick, onClose }: CalendarSheetProps) {
  const [ym, setYm] = useState(monthOf(date));
  const cells = monthCells(ym);
  const q = useRepoQuery(async (r) => {
    const days = cells.filter((c): c is DateStr => c !== null);
    const lists = await Promise.all(days.map((d) => r.meals.listByDate(d)));
    return new Set(days.filter((_, i) => lists[i].length > 0));
  }, [ym]);
  const marked = q.data;
  const [y, m] = ym.split('-').map(Number);

  return (
    <Sheet open title="飲食日曆" onClose={onClose}>
      <div class="diet-cal">
        <div class="diet-cal__nav">
          <IconButton icon="chevron-left" label="上個月" onClick={() => setYm(shiftMonth(ym, -1))} />
          <span class="diet-cal__title">{y}年{m}月</span>
          <IconButton icon="chevron-right" label="下個月" onClick={() => setYm(shiftMonth(ym, 1))} />
        </div>
        <div class="diet-cal__grid" role="group" aria-label={`${y}年${m}月`}>
          {HEAD.map((h) => (
            <span key={h} class="diet-cal__head" aria-hidden="true">{h}</span>
          ))}
          {cells.map((c, i) => {
            if (!c) return <span key={`e${i}`} class="diet-cal__empty" />;
            const { m: mm, d } = md(c);
            const has = marked?.has(c) ?? false;
            return (
              <button
                key={c}
                type="button"
                class={`diet-cal__day${c === date ? ' is-selected' : ''}${c === today ? ' is-today' : ''}`}
                aria-label={`${mm}月${d}日${c === today ? '（今天）' : ''}${has ? '，有飲食紀錄' : ''}`}
                aria-pressed={c === date}
                onClick={() => onPick(c)}
              >
                <span class="num">{d}</span>
                {has ? <span class="diet-mark" aria-hidden="true">●</span> : null}
              </button>
            );
          })}
        </div>
        <p class="diet-cal__legend"><span class="diet-mark" aria-hidden="true">●</span> 表示該日有飲食紀錄</p>
      </div>
    </Sheet>
  );
}
