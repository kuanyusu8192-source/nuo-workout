/** 契約（簽名不可改）：動作詳情，四分頁 教學／紀錄／圖表／歷史。 */
import { useMemo, useState } from 'preact/hooks';
import { useAppState, useRepoQuery } from '../../app/context';
import { paths } from '../../app/paths';
import { href } from '../../app/router';
import {
  BarChart, ChartWithTable, EmptyState, IconButton, LineChart, SegmentedControl, Skeleton, Tabs,
} from '../../components';
import type { Exercise } from '../../data/types';
import { addDays } from '../../domain/dates';
import type { DateStr, SetRecord } from '../../domain/types';
import { equipmentLabel, EXERCISE_DETAIL_TABS, type ExerciseDetailTab } from '../shared';
import { Gif } from './Gif';
import { cardioSeries, personalRecords, strengthSeries } from './stats';
import './exercises.css';

export interface ExerciseDetailProps {
  exerciseId: string;
  initialTab?: ExerciseDetailTab;
  onClose(): void;
}

const num1 = (n: number) => String(Math.round(n * 10) / 10);
const thousands = (n: number) => Math.round(n).toLocaleString('en-US');
const mmdd = (d: DateStr) => d.slice(5);

function formatSet(s: SetRecord): string {
  if (s.kind === 'strength') {
    const w = s.weightKg ? `${num1(s.weightKg)} kg` : '徒手';
    return `${w} × ${s.reps ?? 0}`;
  }
  const parts: string[] = [];
  if (s.durationSec) parts.push(s.durationSec >= 60 ? `${num1(s.durationSec / 60)} 分鐘` : `${s.durationSec} 秒`);
  if (s.distanceM) parts.push(`${num1(s.distanceM / 1000)} km`);
  if (s.speed) parts.push(`${num1(s.speed)} km/h`);
  return parts.join('・') || '已完成';
}

export function ExerciseDetail({ exerciseId, initialTab = 'tutorial', onClose }: ExerciseDetailProps) {
  const [tab, setTab] = useState<ExerciseDetailTab>(initialTab);
  const ex = useRepoQuery((r) => r.exercises.get(exerciseId), [exerciseId]);
  const records = useRepoQuery(async (r): Promise<SetRecord[]> => {
    const [sets, sessions] = await Promise.all([r.sets.listByExercise(exerciseId), r.sessions.listByRange({})]);
    const dateOf = new Map(sessions.map((s) => [s.id, s.date]));
    const out: SetRecord[] = [];
    for (const s of sets) {
      const date = dateOf.get(s.sessionId);
      if (!date) continue; // 孤兒組略過
      const { sessionId: _sid, setIndex: _i, ...rest } = s;
      out.push({ ...rest, date });
    }
    return out;
  }, [exerciseId]);

  const exercise = ex.data;
  const loading = (ex.loading && !exercise) || (records.loading && !records.data);

  let body;
  if (loading) body = <Skeleton height={64} lines={4} />;
  else if (!exercise) body = <EmptyState title="找不到這個動作" description="它可能已被刪除。" />;
  else if (tab === 'tutorial') body = <TutorialTab ex={exercise} />;
  else if (tab === 'record') body = <RecordTab sets={records.data ?? []} />;
  else if (tab === 'chart') body = <ChartTab ex={exercise} sets={records.data ?? []} />;
  else body = <HistoryTab ex={exercise} sets={records.data ?? []} />;

  return (
    <div class="exp-detail">
      <header class="exp-head">
        <IconButton icon="chevron-left" label="返回" onClick={onClose} />
        <h1 class="exp-head__title">{exercise?.name ?? '動作詳情'}</h1>
      </header>
      <Tabs label="動作詳情分頁" tabs={EXERCISE_DETAIL_TABS} value={tab} onChange={setTab}>
        {body}
      </Tabs>
    </div>
  );
}

// ---------- 教學 ----------

function TutorialTab({ ex }: { ex: Exercise }) {
  return (
    <div class="exp-tutorial">
      <Gif file={ex.gifFile} alt={ex.name} size="full" />
      <div class="exp-meta">
        <p class="exp-meta__row">{`主要肌群：${ex.primaryMuscle || '—'}`}</p>
        <p class="exp-meta__row">{`次要肌群：${ex.secondaryMuscles.length ? ex.secondaryMuscles.join('、') : '—'}`}</p>
        <p class="exp-meta__row">{`器材：${equipmentLabel(ex.equipment)}`}</p>
      </div>
      {ex.steps.length ? (
        <section>
          <h2 class="exp-h2">詳細訓練要點</h2>
          <ol class="exp-steps">
            {ex.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </section>
      ) : (
        <p class="exp-muted">這個動作還沒有教學步驟。</p>
      )}
      {ex.tips ? (
        <section class="exp-tips">
          <h2 class="exp-h2">教練提示</h2>
          <p>{ex.tips}</p>
        </section>
      ) : null}
    </div>
  );
}

// ---------- 紀錄 ----------

function groupByDateDesc(sets: SetRecord[]): Array<[DateStr, SetRecord[]]> {
  const m = new Map<DateStr, SetRecord[]>();
  for (const s of [...sets].sort((a, b) => a.createdAt - b.createdAt)) {
    const l = m.get(s.date);
    if (l) l.push(s);
    else m.set(s.date, [s]);
  }
  return [...m.entries()].sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));
}

function RecordTab({ sets }: { sets: SetRecord[] }) {
  const latest = useMemo(() => groupByDateDesc(sets)[0], [sets]);
  return (
    <div class="exp-record">
      {latest ? (
        <section class="exp-log__day">
          <h2 class="exp-h2">最近一次紀錄</h2>
          <h3 class="exp-log__date">{latest[0]}</h3>
          <ul class="exp-log__sets">
            {latest[1].map((s, i) => (
              <li key={s.id}>{`第 ${i + 1} 組　${formatSet(s)}`}</li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState title="還沒有此動作的紀錄" description="到今日訓練加入這個動作並完成一組，就會出現在這裡。" />
      )}
      {/* 記錄統一在「今日訓練」，這裡只導引；「從詳情直接加入今日」的接線由 P4 決定 */}
      <a class="nuo-btn nuo-btn--primary exp-linkbtn" href={href(paths.today)}>前往今日訓練</a>
    </div>
  );
}

// ---------- 圖表 ----------

type Period = '3m' | '1y' | 'all';
const PERIODS = [
  { value: '3m', label: '3 個月' },
  { value: '1y', label: '1 年' },
  { value: 'all', label: '全部' },
] as const;
const NO_DATA = '暫無此動作之訓練數據，完成一次訓練即可顯示趨勢';

function ChartTab({ ex, sets }: { ex: Exercise; sets: SetRecord[] }) {
  const { today } = useAppState();
  const [period, setPeriod] = useState<Period>('3m');
  const from = period === 'all' ? undefined : addDays(today, period === '3m' ? -92 : -365);
  const isStrength = ex.trackingType === 'strength';

  const strength = useMemo(() => (isStrength ? strengthSeries(sets, ex.id, from) : []), [sets, ex.id, from, isStrength]);
  const cardio = useMemo(() => (isStrength ? [] : cardioSeries(sets, ex.id, from)), [sets, ex.id, from, isStrength]);
  const empty = isStrength ? strength.length === 0 : cardio.length === 0;

  return (
    <div class="exp-charts">
      <SegmentedControl label="圖表期間" options={PERIODS} value={period} onChange={setPeriod} />
      {empty ? (
        <EmptyState title={NO_DATA} icon="history" />
      ) : isStrength ? (
        <>
          <ChartWithTable
            title="力量突破（預估 1RM，kg）"
            headers={['日期', 'e1RM (kg)']}
            rows={strength.map((d) => [d.date, num1(d.e1rm)])}
          >
            <LineChart
              ariaLabel="預估 1RM 趨勢折線圖"
              area
              data={strength.map((d) => ({ label: mmdd(d.date), value: d.e1rm, isPr: d.isPr }))}
            />
          </ChartWithTable>
          <ChartWithTable title="總訓練容量（kg）" headers={['日期', '容量 (kg)']} rows={strength.map((d) => [d.date, num1(d.volume)])}>
            <BarChart ariaLabel="每日總訓練容量長條圖" data={strength.map((d) => ({ label: mmdd(d.date), value: d.volume }))} formatter={(v) => thousands(v)} />
          </ChartWithTable>
          <ChartWithTable title="最大次數" headers={['日期', '次數']} rows={strength.map((d) => [d.date, d.maxReps])}>
            <LineChart ariaLabel="單組最大次數折線圖" data={strength.map((d) => ({ label: mmdd(d.date), value: d.maxReps }))} />
          </ChartWithTable>
          <ChartWithTable title="總訓練次數" headers={['日期', '次數']} rows={strength.map((d) => [d.date, d.totalReps])}>
            <BarChart ariaLabel="每日總訓練次數長條圖" data={strength.map((d) => ({ label: mmdd(d.date), value: d.totalReps }))} />
          </ChartWithTable>
        </>
      ) : (
        <>
          <ChartWithTable title="時間（分鐘）" headers={['日期', '分鐘']} rows={cardio.map((d) => [d.date, num1(d.minutes)])}>
            <BarChart ariaLabel="每日訓練時間長條圖" data={cardio.map((d) => ({ label: mmdd(d.date), value: d.minutes }))} />
          </ChartWithTable>
          {cardio.some((d) => d.km > 0) ? (
            <ChartWithTable title="距離（公里）" headers={['日期', '公里']} rows={cardio.map((d) => [d.date, num1(d.km)])}>
              <BarChart ariaLabel="每日距離長條圖" data={cardio.map((d) => ({ label: mmdd(d.date), value: d.km }))} />
            </ChartWithTable>
          ) : null}
          {cardio.some((d) => d.avgSpeed > 0) ? (
            <ChartWithTable
              title="平均速度（km/h）"
              headers={['日期', 'km/h']}
              rows={cardio.filter((d) => d.avgSpeed > 0).map((d) => [d.date, num1(d.avgSpeed)])}
            >
              <LineChart ariaLabel="平均速度折線圖" data={cardio.filter((d) => d.avgSpeed > 0).map((d) => ({ label: mmdd(d.date), value: d.avgSpeed }))} />
            </ChartWithTable>
          ) : null}
        </>
      )}
    </div>
  );
}

// ---------- 歷史 ----------

function PrItem({ label, value }: { label: string; value: string }) {
  return (
    <div class="exp-pr">
      <span class="exp-pr__label">{label}</span>
      <span class="exp-pr__value num">{value}</span>
    </div>
  );
}

function HistoryTab({ ex, sets }: { ex: Exercise; sets: SetRecord[] }) {
  const days = useMemo(() => groupByDateDesc(sets), [sets]);
  const isStrength = ex.trackingType === 'strength';
  const pr = useMemo(() => personalRecords(sets, ex.id), [sets, ex.id]);
  const cardioPr = useMemo(() => {
    const max = (f: (s: SetRecord) => number | undefined) => sets.reduce((m, s) => Math.max(m, f(s) ?? 0), 0);
    return { sec: max((s) => s.durationSec), m: max((s) => s.distanceM), speed: max((s) => s.speed) };
  }, [sets]);
  const dash = '—';

  return (
    <div class="exp-history">
      <section>
        <h2 class="exp-h2">個人紀錄</h2>
        <div class="exp-prs">
          {isStrength ? (
            <>
              <PrItem label="最大次數" value={pr.maxReps === null ? dash : `${pr.maxReps} 次`} />
              <PrItem label="最大重量" value={pr.maxWeightKg === null ? dash : `${num1(pr.maxWeightKg)} kg`} />
              <PrItem label="最高總容量" value={pr.maxVolumeKg === null ? dash : `${thousands(pr.maxVolumeKg)} kg`} />
            </>
          ) : (
            <>
              <PrItem label="最長時間" value={cardioPr.sec ? `${num1(cardioPr.sec / 60)} 分鐘` : dash} />
              <PrItem label="最遠距離" value={cardioPr.m ? `${num1(cardioPr.m / 1000)} km` : dash} />
              <PrItem label="最高速度" value={cardioPr.speed ? `${num1(cardioPr.speed)} km/h` : dash} />
            </>
          )}
        </div>
      </section>
      <section>
        <h2 class="exp-h2">紀錄歷程</h2>
        {days.length === 0 ? (
          <EmptyState title="還沒有訓練紀錄" />
        ) : (
          days.map(([date, list]) => (
            <div key={date} class="exp-log__day">
              <h3 class="exp-log__date">{date}</h3>
              <ul class="exp-log__sets">
                {list.map((s, i) => (
                  <li key={s.id}>{`第 ${i + 1} 組　${formatSet(s)}`}</li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
