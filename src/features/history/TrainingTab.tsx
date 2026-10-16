import { useId, useState } from 'preact/hooks';
import { useAppState, useRepoQuery } from '../../app/context';
import { BarChart, ChartWithTable, EmptyState, Icon, LineChart, SegmentedControl } from '../../components';
import { monthBars, weekBars, yearBars, type Bar, type Metric } from '../../domain/stats';
import type { SetRecord } from '../../domain/types';
import { gate } from './common';
import { e1rmSeries, fmt1, strengthExerciseIds } from './logic';

type Period = 'week' | 'month' | 'year';
const PERIODS = [
  { value: 'week', label: '週' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
] as const;
const METRICS = [
  { value: 'volume', label: '重訓 (kg)' },
  { value: 'cardioMinutes', label: '有氧 (分鐘)' },
] as const;
const PERIOD_NAME: Record<Period, string> = { week: '本週', month: '本月', year: '今年' };

export function TrainingTab() {
  const { today } = useAppState();
  const q = useRepoQuery(async (r) => ({ sets: await r.sets.listAllAsSetRecords(), exercises: await r.exercises.list() }), []);
  const g = gate(q);
  if (g) return g;
  const { sets, exercises } = q.data!;
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  return (
    <div class="hist">
      <VolumeCard sets={sets} today={today} />
      <StrengthCard sets={sets} names={names} />
    </div>
  );
}

function VolumeCard({ sets, today }: { sets: SetRecord[]; today: string }) {
  const [period, setPeriod] = useState<Period>('week');
  const [metric, setMetric] = useState<Metric>('volume');
  const bars: Bar[] =
    period === 'week' ? weekBars(sets, today, metric) : period === 'month' ? monthBars(sets, today, metric) : yearBars(sets, Number(today.slice(0, 4)), metric);
  const isToday = (b: Bar) => (period === 'year' ? b.date === today.slice(0, 7) : b.date === today);
  const unit = metric === 'volume' ? 'kg' : '分鐘';
  const title = `${PERIOD_NAME[period]}${metric === 'volume' ? '重訓容量' : '有氧分鐘'} (${unit})`;
  const total = bars.reduce((s, b) => s + b.value, 0);
  const fmt = (v: number) => (metric === 'volume' ? String(Math.round(v)) : fmt1(v));
  return (
    <section class="nuo-card" aria-label="訓練量">
      <div class="hist-row">
        <SegmentedControl label="期間" options={PERIODS} value={period} onChange={setPeriod} />
        <SegmentedControl label="指標" options={METRICS} value={metric} onChange={setMetric} />
      </div>
      <p class="hist-total">
        <span class="num hist-big">{fmt(total)}</span>
        <span class="hist-unit">{unit}</span>
      </p>
      <ChartWithTable title={title} headers={['日期', `${metric === 'volume' ? '容量' : '分鐘'} (${unit})`]} rows={bars.map((b) => [b.date, fmt(b.value)])}>
        <BarChart data={bars.map((b) => ({ label: b.label, value: b.value, highlight: isToday(b) }))} formatter={fmt} ariaLabel={title} />
      </ChartWithTable>
    </section>
  );
}

function StrengthCard({ sets, names }: { sets: SetRecord[]; names: Map<string, string> }) {
  const [picked, setPicked] = useState<string>();
  const titleId = useId();
  const selectId = useId();
  const ids = strengthExerciseIds(sets);
  if (ids.length === 0) {
    return (
      <section class="nuo-card" aria-labelledby={titleId}>
        <h2 class="nuo-card__title" id={titleId}>力量突破</h2>
        <EmptyState icon="dumbbell" title="尚無力量紀錄" description="完成一組有重量的訓練後，這裡會顯示預估 1RM 與趨勢" />
      </section>
    );
  }
  const exId = picked && ids.includes(picked) ? picked : ids[0];
  const series = e1rmSeries(sets, exId);
  const peak = Math.max(...series.map((p) => p.e1rm));
  const name = names.get(exId) ?? exId;
  const recent = series.slice(-5).reverse();
  return (
    <section class="nuo-card" aria-labelledby={titleId}>
      <h2 class="nuo-card__title" id={titleId}>力量突破</h2>
      <div class="nuo-field">
        <label class="nuo-field__label" for={selectId}>動作</label>
        <select id={selectId} class="nuo-input hist-select" value={exId} onChange={(e) => setPicked((e.target as HTMLSelectElement).value)}>
          {ids.map((id) => (
            <option key={id} value={id}>{names.get(id) ?? id}</option>
          ))}
        </select>
      </div>
      <p class="hist-total">
        <span class="hist-label">預估 1RM（歷史最佳）</span>
        <span class="num hist-big" data-testid="e1rm-value">{fmt1(peak)}</span>
        <span class="hist-unit">kg</span>
      </p>
      {series.length >= 2 ? (
        <ChartWithTable
          title={`${name} e1RM 趨勢 (kg)`}
          headers={['日期', 'e1RM (kg)', '最佳組']}
          rows={series.map((p) => [p.date, fmt1(p.e1rm), `${fmt1(p.bestSet.weightKg)} kg × ${p.bestSet.reps}${p.isPr ? '（新高）' : ''}`])}
        >
          <LineChart
            data={series.map((p) => ({ label: p.date.slice(5).replace('-', '/'), value: p.e1rm, isPr: p.isPr }))}
            formatter={fmt1}
            area
            ariaLabel={`${name} e1RM 趨勢`}
          />
        </ChartWithTable>
      ) : (
        <p class="hist-note">再記錄一次即可顯示趨勢</p>
      )}
      <h3 class="nuo-card__title">最佳訓練組數紀錄</h3>
      <ul class="hist-records">
        {recent.map((p) => (
          <li key={p.date}>
            <span class="hist-date num">{p.date}</span>
            <span>{fmt1(p.bestSet.weightKg)} kg × {p.bestSet.reps}</span>
            <span class="hist-date">e1RM <span class="num">{fmt1(p.e1rm)}</span></span>
            {p.isPr ? (
              <span class="hist-badge"><Icon name="star" size={16} />新高</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
