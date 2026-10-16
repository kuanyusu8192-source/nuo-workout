import { useState } from 'preact/hooks';
import { useAppState, useRepoQuery } from '../../app/context';
import { BarChart, ChartWithTable, LineChart, SegmentedControl } from '../../components';
import { addDays, weekStart } from '../../domain/dates';
import type { BodyMetric, Meal } from '../../data/types';
import { gate } from './common';
import { fmt1 } from './logic';

type Nutrient = 'kcal' | 'protein' | 'carb' | 'fat';
const OPTIONS = [
  { value: 'kcal', label: '熱量' },
  { value: 'protein', label: '蛋白質' },
  { value: 'carb', label: '碳水' },
  { value: 'fat', label: '脂肪' },
] as const;
const INFO: Record<Nutrient, { name: string; unit: string; of: (m: Meal) => number }> = {
  kcal: { name: '熱量', unit: 'kcal', of: (m) => m.kcal },
  protein: { name: '蛋白質', unit: 'g', of: (m) => m.proteinG },
  carb: { name: '碳水', unit: 'g', of: (m) => m.carbG },
  fat: { name: '脂肪', unit: 'g', of: (m) => m.fatG },
};
const WEEK = ['一', '二', '三', '四', '五', '六', '日'];

export function DietWeightTab() {
  const { today } = useAppState();
  const [nutrient, setNutrient] = useState<Nutrient>('kcal');
  const q = useRepoQuery(async (r) => {
    const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart(today), i));
    const [profile, metrics, perDay] = await Promise.all([
      r.profile.get(),
      r.bodyMetrics.list(),
      Promise.all(dates.map((d) => r.meals.listByDate(d))),
    ]);
    return { dates, profile, metrics, perDay };
  }, [today]);
  const g = gate(q);
  if (g) return g;
  const { dates, profile, metrics, perDay } = q.data!;

  const info = INFO[nutrient];
  const values = perDay.map((meals) => Math.round(meals.reduce((s, m) => s + info.of(m), 0) * 10) / 10);
  const target = profile
    ? nutrient === 'kcal' ? profile.kcalTarget : nutrient === 'protein' ? profile.macros.proteinG : nutrient === 'carb' ? profile.macros.carbG : profile.macros.fatG
    : undefined;
  const hasTarget = target !== undefined && target > 0;
  const over = (v: number) => hasTarget && v > target;
  const overDays = values.flatMap((v, i) => (over(v) ? [`週${WEEK[i]}`] : []));
  const title = `本週${info.name}攝取 (${info.unit})`;

  return (
    <div class="hist">
      <section class="nuo-card" aria-label="本週飲食趨勢">
        <div class="hist-row">
          <SegmentedControl label="營養指標" options={OPTIONS} value={nutrient} onChange={setNutrient} />
        </div>
        {overDays.length ? <p class="hist-over">超標：{overDays.join('、')}</p> : <p class="hist-note">本週沒有超標的日子</p>}
        <ChartWithTable
          title={title}
          headers={['日期', `${info.name} (${info.unit})`, '狀態']}
          rows={dates.map((d, i) => [d, fmt1(values[i]), over(values[i]) ? '超標' : '正常'])}
        >
          <BarChart
            data={dates.map((d, i) => ({
              label: WEEK[i],
              value: values[i],
              highlight: d === today,
              color: over(values[i]) ? 'var(--danger-600)' : undefined,
            }))}
            target={hasTarget ? target : undefined}
            targetLabel={hasTarget ? `目標 ${target}` : undefined}
            formatter={fmt1}
            ariaLabel={title}
          />
        </ChartWithTable>
      </section>
      <WeightSection metrics={metrics} />
    </div>
  );
}

function WeightSection({ metrics }: { metrics: BodyMetric[] }) {
  const weights = metrics.filter((m) => (m.weightKg ?? 0) > 0);
  const fats = metrics.filter((m) => (m.bodyFatPct ?? 0) > 0);
  const curW = weights.at(-1)?.weightKg;
  const curF = fats.at(-1)?.bodyFatPct;
  const change = weights.length >= 2 ? curW! - weights[0].weightKg! : undefined;
  return (
    <>
      <div class="hist-cards2">
        <section class="nuo-card" aria-label="目前體重">
          <span class="hist-label">目前體重</span>
          <span data-testid="current-weight">
            <span class="num hist-big">{curW === undefined ? '—' : fmt1(curW)}</span>
            <span class="hist-unit">kg</span>
          </span>
        </section>
        <section class="nuo-card" aria-label="目前體脂">
          <span class="hist-label">目前體脂</span>
          <span data-testid="current-bodyfat">
            <span class="num hist-big">{curF === undefined ? '—' : fmt1(curF)}</span>
            <span class="hist-unit">%</span>
          </span>
        </section>
      </div>
      <section class="nuo-card" aria-label="體重歷史">
        {weights.length === 0 ? (
          <p class="hist-note">暫無體重紀錄，請先記錄您的第一次體重</p>
        ) : (
          <>
            {change !== undefined ? (
              <p class="hist-note">
                較首筆 {change === 0 ? "持平" : change < 0 ? "減少" : "增加"} {fmt1(Math.abs(change))} kg
              </p>
            ) : null}
            <ChartWithTable
              title="體重歷史 (kg)"
              headers={['日期', '體重 (kg)', '體脂 (%)']}
              rows={weights.map((m) => [m.date, fmt1(m.weightKg!), m.bodyFatPct ? fmt1(m.bodyFatPct) : '—'])}
            >
              <LineChart
                data={weights.map((m) => ({ label: m.date.slice(5).replace('-', '/'), value: m.weightKg! }))}
                area
                formatter={fmt1}
                ariaLabel="體重歷史"
              />
            </ChartWithTable>
          </>
        )}
      </section>
    </>
  );
}
