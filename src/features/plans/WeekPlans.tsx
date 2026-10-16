import { useState } from 'preact/hooks';
import { useAppState, useRepoQuery, useRepos } from '../../app/context';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/Modal';
import { Sheet } from '../../components/Sheet';
import { Skeleton } from '../../components/Skeleton';
import type { PlanRow } from '../../data/types';
import { weekdayOf } from '../../domain/dates';
import { MODE_LABELS, WEEKDAY_LABELS, WEEK_ORDER } from '../shared';
import { NameDialog } from './NameDialog';
import { modeForPlan } from './planLogic';

type NameDlg = { kind: 'new' } | { kind: 'rename'; plan: PlanRow } | null;

/** 週計畫分頁：多套週計畫（器材版／出差版…）、一鍵切換啟用、星期 -> 課表。 */
export function WeekPlans() {
  const repos = useRepos();
  const { mode, setMode, setActivePlanId, today, invalidate } = useAppState();
  const plansQ = useRepoQuery((r) => r.plans.list(), []);
  const tplQ = useRepoQuery((r) => r.templates.list(), []);
  const [viewId, setViewId] = useState<string | null>(null);
  const [nameDlg, setNameDlg] = useState<NameDlg>(null);
  const [deleting, setDeleting] = useState<PlanRow | null>(null);
  const [blocked, setBlocked] = useState<PlanRow | null>(null);
  const [dayPicking, setDayPicking] = useState<number | null>(null);
  const [error, setError] = useState<string>();

  if (!plansQ.data || !tplQ.data) return <Skeleton lines={4} height={56} />;
  const plans = plansQ.data;
  const templates = tplQ.data;
  const tplName = new Map(templates.map((t) => [t.id, t.name]));
  const viewPlan = plans.find((p) => p.id === viewId) ?? plans.find((p) => p.isActive) ?? plans[0];
  const todayWd = weekdayOf(today);

  const guard = async (fn: () => Promise<void>) => {
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失敗，請再試一次');
    }
  };

  const activate = (plan: PlanRow) =>
    guard(async () => {
      await setActivePlanId(plan.id);
      // 切換週計畫即切換出差模式；補記模式不被覆蓋（補記是「記到過去的日期」，與器材／出差正交）
      if (mode !== 'backfill') setMode(modeForPlan(plan.name));
      setViewId(plan.id);
    });

  const setDay = (plan: PlanRow, wd: number, templateId: string | null) =>
    guard(async () => {
      await repos.plans.update(plan.id, { days: { ...plan.days, [wd]: templateId } });
      invalidate();
      setDayPicking(null);
    });

  const remove = (plan: PlanRow) =>
    guard(async () => {
      await repos.plans.remove(plan.id);
      if (viewId === plan.id) setViewId(null);
      invalidate();
      setDeleting(null);
    });

  const submitName = (name: string) =>
    guard(async () => {
      if (nameDlg?.kind === 'rename') {
        await repos.plans.update(nameDlg.plan.id, { name });
        // 啟用中的計畫改名後，模式要跟著名稱重新判斷
        if (nameDlg.plan.isActive && mode !== 'backfill') setMode(modeForPlan(name));
      } else {
        const first = plans.length === 0;
        const created = await repos.plans.create({ name, days: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null }, isActive: first });
        setViewId(created.id);
        // 第一套計畫自動啟用，模式也要跟上
        if (first) {
          await setActivePlanId(created.id);
          if (mode !== 'backfill') setMode(modeForPlan(created.name));
        }
      }
      invalidate();
      setNameDlg(null);
    });

  return (
    <div class="plans-weeks">
      <p class="plans-mode" role="status">{`目前模式：${MODE_LABELS[mode]}`}</p>
      {error ? <p class="plans-error" role="alert">{error}</p> : null}

      {plans.length === 0 ? (
        <EmptyState icon="calendar" title="還沒有週計畫" description="週計畫決定每週哪一天練哪個課表，可以建立器材版、出差版。" actionLabel="新增週計畫" onAction={() => setNameDlg({ kind: 'new' })} />
      ) : (
        <>
          <ul class="plans-list" aria-label="週計畫清單">
            {plans.map((p) => (
              <li key={p.id} class={`plans-plan${p.id === viewPlan?.id ? ' is-viewing' : ''}`}>
                <div class="plans-plan__head">
                  <button type="button" class="plans-plan__pick" aria-label={`查看 ${p.name}`} aria-pressed={p.id === viewPlan?.id} onClick={() => setViewId(p.id)}>
                    {p.name}
                  </button>
                  {p.isActive ? <span class="plans-badge">啟用中</span> : null}
                </div>
                <div class="plans-plan__actions">
                  {!p.isActive ? <Button variant="success" aria-label={`啟用 ${p.name}`} onClick={() => activate(p)}>啟用</Button> : null}
                  <Button variant="ghost" aria-label={`重新命名 ${p.name}`} onClick={() => setNameDlg({ kind: 'rename', plan: p })}>改名</Button>
                  <IconButton icon="trash-2" variant="danger" label={`刪除 ${p.name}`} onClick={() => (p.isActive ? setBlocked(p) : setDeleting(p))} />
                </div>
              </li>
            ))}
          </ul>
          <Button variant="ghost" fullWidth onClick={() => setNameDlg({ kind: 'new' })}>＋新增週計畫</Button>

          {viewPlan ? (
            <section class="plans-days" aria-label={`${viewPlan.name}的每週安排`}>
              <h2 class="plans-h">{`${viewPlan.name}的每週安排`}</h2>
              <ul class="plans-list">
                {WEEK_ORDER.map((wd) => {
                  const tid = viewPlan.days[wd] ?? null;
                  const label = tid ? (tplName.get(tid) ?? '（課表已刪除）') : '休息';
                  const isToday = wd === todayWd;
                  return (
                    <li key={wd} data-testid="day-row" class={`plans-day${isToday ? ' is-today' : ''}${tid ? '' : ' is-rest'}`}>
                      <button type="button" class="plans-day__btn" onClick={() => setDayPicking(wd)}>
                        <span class="plans-day__wd">{`週${WEEKDAY_LABELS[wd]}`}</span>
                        {isToday ? <span class="plans-today">今天</span> : null}
                        <span class="plans-day__tpl">{label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <Sheet open={dayPicking !== null && !!viewPlan} title={dayPicking !== null ? `選擇週${WEEKDAY_LABELS[dayPicking]}的課表` : ''} onClose={() => setDayPicking(null)}>
        {viewPlan && dayPicking !== null ? (
          <ul class="plans-options">
            <li>
              <button type="button" class="plans-option" aria-pressed={(viewPlan.days[dayPicking] ?? null) === null} onClick={() => setDay(viewPlan, dayPicking, null)}>
                休息
              </button>
            </li>
            {templates.map((t) => (
              <li key={t.id}>
                <button type="button" class="plans-option" aria-pressed={viewPlan.days[dayPicking] === t.id} onClick={() => setDay(viewPlan, dayPicking, t.id)}>
                  <span class="plans-swatch" style={{ background: t.color }} aria-hidden="true" />
                  {t.name}
                </button>
              </li>
            ))}
            {templates.length === 0 ? <li class="plans-hint">還沒有課表，先到「課表」分頁建立。</li> : null}
          </ul>
        ) : null}
      </Sheet>

      <NameDialog
        open={nameDlg !== null}
        title={nameDlg?.kind === 'rename' ? '重新命名週計畫' : '新增週計畫'}
        fieldLabel="計畫名稱"
        initialValue={nameDlg?.kind === 'rename' ? nameDlg.plan.name : ''}
        submitLabel="儲存"
        emptyMessage="請輸入計畫名稱，例如「器材版」「出差版」"
        onSubmit={submitName}
        onClose={() => setNameDlg(null)}
      />

      <Modal
        open={deleting !== null}
        role="alertdialog"
        title="刪除週計畫"
        onClose={() => setDeleting(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>取消</Button>
            <Button variant="danger" onClick={() => deleting && remove(deleting)}>確定刪除</Button>
          </>
        }
      >
        <p>{`確定要刪除「${deleting?.name ?? ''}」嗎？課表本身不會被刪除。`}</p>
      </Modal>

      <Modal
        open={blocked !== null}
        role="alertdialog"
        title="無法刪除啟用中的週計畫"
        onClose={() => setBlocked(null)}
        actions={<Button onClick={() => setBlocked(null)}>知道了</Button>}
      >
        <p>{`「${blocked?.name ?? ''}」目前啟用中。請先切換啟用其他週計畫，再回來刪除。`}</p>
      </Modal>
    </div>
  );
}
