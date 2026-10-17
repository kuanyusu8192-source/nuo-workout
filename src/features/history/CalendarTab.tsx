import { useMemo, useState } from 'preact/hooks';
import { useAppState, useRepoQuery } from '../../app/context';
import { Button, Icon, IconButton } from '../../components';
import { weekdayOf } from '../../domain/dates';
import { daySummary, streakWeeks, trainingDays } from '../../domain/stats';
import type { DateStr, SetRecord } from '../../domain/types';
import type { Exercise } from '../../data/types';
import { gate } from './common';
import { loadBurn } from '../diet/dietData';
import { fmt1, fmtInt, muscleGroups } from './logic';

const HEADS = ['一', '二', '三', '四', '五', '六', '日'];
const pad = (n: number) => String(n).padStart(2, '0');

function groupByDate(sets: SetRecord[]): Map<DateStr, SetRecord[]> {
  const m = new Map<DateStr, SetRecord[]>();
  for (const s of sets) {
    const list = m.get(s.date);
    if (list) list.push(s);
    else m.set(s.date, [s]);
  }
  return m;
}

/** YYYY-MM 加減月 */
function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function CalendarTab() {
  const { today } = useAppState();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<DateStr>();
  const q = useRepoQuery(async (r) => {
    const [sets, exList] = await Promise.all([r.sets.listAllAsSetRecords(), r.exercises.list()]);
    // 本月每個訓練日的消耗：與飲食頁、今日紀錄同一條算法（loadBurn → estimateDayBurn，含手動覆寫）
    const thisMonth = today.slice(0, 7);
    const burns = new Map<DateStr, number | null>();
    await Promise.all(
      [...new Set(sets.filter((s) => s.date.startsWith(thisMonth)).map((s) => s.date))].map(async (d) => {
        burns.set(d, (await loadBurn(r, d)).effective);
      }),
    );
    return { sets, exercises: new Map<string, Exercise>(exList.map((e) => [e.id, e])), burns };
  }, [today]);

  const days = useMemo(() => (q.data ? groupByDate(q.data.sets) : new Map<DateStr, SetRecord[]>()), [q.data]);
  const g = gate(q);
  if (g) return g;
  const { sets, exercises, burns: burnByDay } = q.data!;

  // 本月總消耗：各訓練日加總；全部缺體重（且無覆寫）才顯示「—」
  const burns = [...burnByDay.values()].filter((v): v is number => v !== null);
  const monthKcal = burnByDay.size === 0 ? '0' : burns.length === 0 ? '—' : fmtInt(burns.reduce((a, b) => a + b, 0));

  const [y, m] = month.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  const lead = (weekdayOf(`${month}-01`) + 6) % 7;
  const cells: Array<DateStr | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: dim }, (_, i) => `${month}-${pad(i + 1)}`),
  ];
  const rows = Array.from({ length: Math.ceil(cells.length / 7) }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  return (
    <div class="hist">
      <div class="hist-metrics">
        <Metric label="連續訓練週數" value={String(streakWeeks(sets, today))} unit="週" icon />
        <Metric label="本月訓練天數" value={String(trainingDays(sets, today))} unit="天" />
        <Metric label="本月總消耗" value={monthKcal} unit="kcal" />
      </div>

      <section class="nuo-card" aria-label="訓練日曆">
        <div class="hist-cal__nav">
          <IconButton icon="chevron-left" label="上個月" onClick={() => setMonth(shiftMonth(month, -1))} />
          <h2 class="hist-cal__title">{y} 年 {m} 月</h2>
          <IconButton icon="chevron-right" label="下個月" onClick={() => setMonth(shiftMonth(month, 1))} />
        </div>
        <div role="grid" aria-label={`${y} 年 ${m} 月`}>
          <div role="row" class="hist-cal__row">
            {HEADS.map((h) => <div key={h} role="columnheader" class="hist-cal__head">{h}</div>)}
          </div>
          {rows.map((row, ri) => (
            <div role="row" class="hist-cal__row" key={ri}>
              {row.map((d, ci) => {
                if (!d) return <div key={`b${ci}`} role="gridcell" class="hist-day hist-day--blank" aria-hidden="true" />;
                const has = days.has(d);
                const isToday = d === today;
                const dn = Number(d.slice(8));
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    class={`hist-day${isToday ? ' hist-day--today' : ''}`}
                    aria-label={`${y} 年 ${m} 月 ${dn} 日${isToday ? '，今天' : ''}${has ? '，有訓練' : ''}`}
                    aria-current={isToday ? 'date' : undefined}
                    aria-selected={selected === d}
                    onClick={() => setSelected(d)}
                  >
                    <span class="num">{dn}</span>
                    {has ? <span class="hist-dot" aria-hidden="true" /> : <span class="hist-dot-gap" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p class="hist-note">實心點 = 當天有訓練；外框 = 今天</p>
      </section>

      {selected ? <DayCard key={selected} date={selected} sets={days.get(selected) ?? []} exercises={exercises} /> : null}
    </div>
  );
}

function Metric({ label, value, unit, icon }: { label: string; value: string; unit: string; icon?: boolean }) {
  return (
    <div role="group" aria-label={label} class="hist-metric">
      <span>
        {icon ? <Icon name="flame" size={20} /> : null}
        <span class="num hist-big" data-testid="metric-value">{value}</span>
        <span class="hist-unit">{unit}</span>
      </span>
      <span class="hist-metric__label" aria-hidden="true">{label}</span>
    </div>
  );
}

function DayCard({ date, sets, exercises }: { date: DateStr; sets: SetRecord[]; exercises: Map<string, Exercise> }) {
  const [open, setOpen] = useState(false);
  const extra = useRepoQuery(async (r) => ({ sessions: await r.sessions.getByDate(date), burn: await loadBurn(r, date) }), [date]);
  const title = `${date}（週${HEADS[(weekdayOf(date) + 6) % 7]}）`;
  if (sets.length === 0) {
    return (
      <section class="nuo-card hist-summary" aria-label={`${date} 摘要`}>
        <h3>{title}</h3>
        <p class="hist-note">這天沒有訓練紀錄</p>
      </section>
    );
  }
  const sum = daySummary(sets, date);
  const kcal = extra.data?.burn.effective ?? null;
  const sessionMin = (extra.data?.sessions ?? []).reduce((a, s) => a + (s.endedAt ? (s.endedAt - s.startedAt) / 60000 : 0), 0);
  const estimated = sessionMin < 5; // 與 estimateDayBurn 同門檻：不到 5 分鐘視為沒有真實時長
  const minutes = estimated ? sum.strengthSets * 3 + sum.cardioMinutes : sessionMin;
  const groups = muscleGroups(sets, exercises);
  const perExercise = [...new Set(sets.map((s) => s.exerciseId))].map((id) => ({
    id,
    name: exercises.get(id)?.name ?? id,
    sets: sets.filter((s) => s.exerciseId === id),
  }));
  return (
    <section class="nuo-card hist-summary" aria-label={`${date} 摘要`}>
      <h3>{title}</h3>
      <p>肌群：{groups.length ? groups.join('、') : '—'}</p>
      <p>
        {sum.exerciseCount} 個動作 · {sum.sets} 組 · <span class="num">{fmtInt(sum.volume)}</span> kg
        {sum.cardioMinutes > 0 ? <> · 有氧 {fmt1(sum.cardioMinutes)} 分鐘</> : null}
      </p>
      <p>時長：{estimated ? '約 ' : ''}{Math.round(minutes)} 分鐘</p>
      <p>消耗：{!extra.data ? '計算中…' : kcal === null ? '—（缺體重）' : <><span class="num">{fmtInt(kcal)}</span> kcal</>}</p>
      <Button variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? '收合詳情' : '查看詳情'}</Button>
      {open ? (
        <div>
          {perExercise.map((e) => (
            <div key={e.id} class="hist-detail">
              <h4>{e.name}</h4>
              <ul class="hist-detail">
                {e.sets.map((s, i) => (
                  <li key={s.id}>
                    <span>第 {i + 1} 組</span>
                    <span class="num">{describeSet(s)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function describeSet(s: SetRecord): string {
  if (s.kind === 'strength') return s.weightKg ? `${fmt1(s.weightKg)} kg × ${s.reps ?? 0}` : `${s.reps ?? 0} 下（徒手）`;
  if (s.kind === 'cardio') return `${fmt1((s.durationSec ?? 0) / 60)} 分鐘${s.speed ? ` · ${fmt1(s.speed)} km/h` : ''}`;
  return `${Math.round(s.durationSec ?? 0)} 秒`;
}
