/**
 * 今日分頁（路由 `#/today`）：標頭資訊（日期、模式、今日課表）→ 開始訓練 → 進行中訓練（WorkoutBody）。
 * 統一成「今日訓練」一種流程：每組填完就存、可隨時加動作、可由課表一鍵帶入。
 * 補記模式：操作寫入 AppState.selectedDate 那天的 session。
 */
import { useEffect, useState } from 'preact/hooks';
import { useAppState, useAsync, useRepoQuery, useRepos } from '../../app/context';
import { Button, Card, Icon, Sheet, Skeleton, useToast } from '../../components';
import type { Session } from '../../data/types';
import { weekdayOf } from '../../domain/dates';
import { planForDate } from '../../domain/plan';
import { ExercisePicker } from '../exercises/ExercisePicker';
import { MODE_COLOR_VAR, MODE_LABELS, WEEKDAY_LABELS } from '../shared';
import { AddExerciseFlow } from './AddExerciseFlow';
import { WorkoutBody } from './WorkoutBody';
import { loadWorkout } from './workout';
import './today.css';

/** 目前頁面上的 session：ghost＝空訓練完成後已從資料庫刪除（只留畫面上的「已完成」狀態） */
interface LocalSession {
  session: Session;
  ghost: boolean;
}

function pickSession(list: Session[] | undefined, skip: readonly string[]): Session | undefined {
  const xs = (list ?? []).filter((s) => !skip.includes(s.id));
  return [...xs].reverse().find((s) => s.endedAt === undefined) ?? xs[xs.length - 1];
}

export function TodayWorkout() {
  const repos = useRepos();
  const app = useAppState();
  const toast = useToast();
  const { selectedDate: date, mode, today } = app;

  const sessionsQ = useRepoQuery((r) => r.sessions.getByDate(date), [date]);
  const planQ = useRepoQuery(
    async (r) => {
      if (!app.activePlanId) return null;
      const hit = planForDate(await r.plans.list(), app.activePlanId, date);
      if (!hit) return null;
      const template = hit.templateId ? await r.templates.get(hit.templateId) : undefined;
      return { planName: hit.plan.name, template };
    },
    [app.activePlanId, date],
  );

  const [local, setLocal] = useState<LocalSession | null>(null);
  const [skip, setSkip] = useState<string[]>([]);
  const [extras, setExtras] = useState<{ sessionId: string; ids: string[] } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // 換日期就丟掉上一天畫面上的暫存狀態
  useEffect(() => {
    setLocal(null);
    setSkip([]);
  }, [date]);

  const dbSession = pickSession(sessionsQ.data, skip);
  const current: LocalSession | undefined =
    local && local.session.date === date ? local : dbSession ? { session: dbSession, ghost: false } : undefined;

  async function start(templateId?: string, firstExerciseId?: string) {
    setPickerOpen(false);
    setChosenId(null);
    setStarting(true);
    try {
      const s = await repos.sessions.create({
        date,
        mode,
        startedAt: Date.now(),
        templateId,
        planId: app.activePlanId ?? undefined,
      });
      if (firstExerciseId) setExtras({ sessionId: s.id, ids: [firstExerciseId] });
      setLocal({ session: s, ghost: false });
      app.invalidate();
    } catch (e) {
      toast.show(`無法開始訓練：${e instanceof Error ? e.message : String(e)}`, { kind: 'error' });
    } finally {
      setStarting(false);
    }
  }

  async function finish(empty: boolean) {
    if (!current) return;
    const s = current.session;
    if (empty) {
      await repos.sessions.remove(s.id); // 空訓練不留紀錄
      setLocal({ session: { ...s, endedAt: Date.now() }, ghost: true });
    } else {
      setLocal({ session: await repos.sessions.end(s.id), ghost: false });
    }
    app.invalidate();
  }

  const another = () => {
    if (current) setSkip((xs) => [...xs, current.session.id]);
    setLocal(null);
  };

  const loading = (sessionsQ.loading && sessionsQ.data === undefined) || (planQ.loading && planQ.data === undefined);
  const plan = planQ.data;
  const template = plan?.template;
  const planText =
    plan === undefined
      ? ''
      : plan === null
        ? '尚未啟用週計畫'
        : template
          ? `課表：${template.name}（${plan.planName}）`
          : `${plan.planName}：這天沒有排課表`;

  return (
    <div class="today" data-mode={mode}>
      <section class="today-head" style={{ borderLeftColor: MODE_COLOR_VAR[mode] }} aria-label="今日資訊">
        <div class="today-head__row">
          <h2 class="today-head__date">{`${date}（${WEEKDAY_LABELS[weekdayOf(date)]}）`}</h2>
          <span class="today-head__mode" style={{ borderColor: MODE_COLOR_VAR[mode] }}>{MODE_LABELS[mode]}</span>
        </div>
        <p class="today-head__plan">{planText}</p>
        {mode === 'backfill' ? (
          <div class="today-head__pick">
            <label for="today-backfill-date">補記日期</label>
            <input
              id="today-backfill-date"
              class="nuo-input"
              type="date"
              value={date}
              max={today}
              onInput={(e) => {
                const v = (e.currentTarget as HTMLInputElement).value;
                if (v) app.setSelectedDate(v);
              }}
            />
          </div>
        ) : null}
      </section>

      {loading ? (
        <Skeleton height={56} lines={3} label="今日訓練載入中" />
      ) : current ? (
        <WorkoutLoader
          key={current.session.id}
          session={current.session}
          ghost={current.ghost}
          extraIds={extras?.sessionId === current.session.id ? extras.ids : undefined}
          onFinish={finish}
          onAnother={another}
        />
      ) : (
        <Card>
          <div class="today-start">
            {template ? (
              <>
                <p class="today-start__hint">{`今天排的課表有 ${template.exercises.length} 個動作。`}</p>
                <Button variant="primary" fullWidth loading={starting} onClick={() => void start(template.id)}>
                  {`開始訓練（${template.name}）`}
                </Button>
              </>
            ) : (
              <p class="today-start__hint">今天還沒有訓練。可以自由訓練，或先挑一個動作開始。</p>
            )}
            <Button variant={template ? 'ghost' : 'primary'} fullWidth disabled={starting} onClick={() => void start()}>
              自由訓練
            </Button>
            <Button variant="ghost" fullWidth disabled={starting} onClick={() => setPickerOpen(true)}>
              <Icon name="plus" size={20} />
              新增動作
            </Button>
          </div>
        </Card>
      )}

      <Sheet open={pickerOpen} title="新增動作" onClose={() => setPickerOpen(false)}>
        <ExercisePicker mode="single" onSelect={setChosenId} onClose={() => setPickerOpen(false)} />
      </Sheet>
      {/* 選好動作 → 「加入今日訓練／看教學」（原版流程） */}
      <AddExerciseFlow exerciseId={chosenId} onAdd={(id) => void start(undefined, id)} onCancel={() => setChosenId(null)} />
    </div>
  );
}

/** 載入 session 的課表、已存的組與各動作上次紀錄，備妥後才掛上 WorkoutBody（之後以本機狀態為準，不再重載）。 */
function WorkoutLoader(props: {
  session: Session;
  ghost: boolean;
  extraIds?: string[];
  onFinish(empty: boolean): Promise<void>;
  onAnother(): void;
}) {
  const repos = useRepos();
  const q = useAsync(() => loadWorkout(repos, props.session, props.extraIds), [repos, props.session.id]);
  if (q.error) {
    return (
      <Card>
        <p role="alert">{`載入失敗：${q.error.message}`}</p>
        <Button onClick={q.reload}>重試</Button>
      </Card>
    );
  }
  if (!q.data) return <Skeleton height={56} lines={3} label="訓練內容載入中" />;
  return <WorkoutBody session={props.session} loaded={q.data} ghost={props.ghost} onFinish={props.onFinish} onAnother={props.onAnother} />;
}
