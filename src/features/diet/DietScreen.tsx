/**
 * 飲食分頁（P3 Task 3.9）：日期條、熱量與營養總覽、記錄飲食、當日餐點、運動消耗覆寫、飲食日曆。
 *
 * 日期狀態：本畫面自己持有（初始為今天），不使用 AppState.selectedDate——
 * 後者是「今日訓練」記錄用的日期，飲食瀏覽過去日子不應連動改到訓練的記錄日期。
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { useAppState, useRepoQuery, useRepos } from '../../app/context';
import { paths } from '../../app/paths';
import { navigate } from '../../app/router';
import { Button, Card, EmptyState, Icon, IconButton, ProgressBar, Skeleton } from '../../components';
import type { Meal } from '../../data/types';
import { addDays, weekdayOf } from '../../domain/dates';
import { remainingKcal } from '../../domain/nutrition';
import type { DateStr } from '../../domain/types';
import { WEEKDAY_LABELS } from '../shared';
import { BurnSheet } from './BurnSheet';
import { CalendarSheet } from './CalendarSheet';
import { loadDay } from './dietData';
import { formatNum, md, mealToFavorite, scaleMealServings, sumMeals, weekDates } from './dietLogic';
import { MealSheet } from './MealSheet';
import './diet.css';

type SheetState = { kind: 'none' } | { kind: 'meal'; editing?: Meal } | { kind: 'burn' } | { kind: 'calendar' };

interface Snack {
  text: string;
  undo?: () => Promise<void>;
}

const SERVING_STEP = 0.5;
const SERVING_MIN = 0.5;
const SERVING_MAX = 20;
const UNDO_MS = 5000;
const NOTICE_MS = 3000;

export function DietScreen() {
  const repos = useRepos();
  const { today, invalidate } = useAppState();
  const [date, setDate] = useState<DateStr>(today);
  const [sheet, setSheet] = useState<SheetState>({ kind: 'none' });
  const [snack, setSnack] = useState<Snack | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = useRepoQuery((r) => loadDay(r, date), [date]);
  const day = q.data;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function notify(text: string, undo?: () => Promise<void>) {
    if (timer.current) clearTimeout(timer.current);
    setSnack({ text, undo });
    timer.current = setTimeout(() => setSnack(null), undo ? UNDO_MS : NOTICE_MS);
  }

  /** 立即刪除，並提供 5 秒內復原（復原＝以原內容重新新增）。 */
  async function removeMeal(m: Meal) {
    const { id: _id, ...rest } = m;
    await repos.meals.remove(m.id);
    invalidate();
    notify(`已刪除「${m.name}」`, async () => {
      await repos.meals.add(rest);
      invalidate();
    });
  }

  async function changeServings(m: Meal, delta: number) {
    const next = Math.min(SERVING_MAX, Math.max(SERVING_MIN, m.servings + delta));
    if (next === m.servings) return;
    await repos.meals.update(m.id, scaleMealServings(m, next));
    invalidate();
  }

  async function addFavorite(m: Meal) {
    const favs = await repos.meals.favorites();
    if (favs.some((f) => f.name === m.name)) {
      notify(`「${m.name}」已在我的最愛`);
      return;
    }
    await repos.meals.addFavorite(mealToFavorite(m));
    invalidate();
    notify(`已將「${m.name}」加入我的最愛`);
  }

  if (q.error && !day) {
    return <EmptyState icon="utensils" title="讀取飲食資料失敗" description={q.error.message} actionLabel="重試" onAction={q.reload} />;
  }
  if (!day) return <Skeleton lines={4} height={72} label="載入飲食資料" />;

  const week = weekDates(date);
  const { m: dm, d: dd } = md(date);
  const totals = sumMeals(day.meals);
  const profile = day.profile;
  const burn = day.burn.effective;
  const countBurn = day.burn.settings.countBurnToBudget;
  const remaining = profile ? remainingKcal({ target: profile.kcalTarget, eaten: totals.kcal, burn, countBurn }) : null;

  return (
    <div class="diet">
      {/* ---------- 日期條 ---------- */}
      <Card>
        <div class="diet-strip" role="group" aria-label="本週日期">
          {week.map((d) => {
            const { m, d: dn } = md(d);
            const marked = day.markedWeek.has(d);
            const wd = WEEKDAY_LABELS[weekdayOf(d)];
            return (
              <button
                key={d}
                type="button"
                class={`diet-day${d === date ? ' is-selected' : ''}${d === today ? ' is-today' : ''}`}
                aria-pressed={d === date}
                aria-label={`${m}月${dn}日 週${wd}${d === today ? '（今天）' : ''}${marked ? '，有飲食紀錄' : ''}`}
                onClick={() => setDate(d)}
              >
                <span class="diet-day__wd" aria-hidden="true">{wd}</span>
                <span class="diet-day__num num" aria-hidden="true">{dn}</span>
                <span class="diet-mark" aria-hidden="true">{marked ? '●' : ' '}</span>
              </button>
            );
          })}
        </div>
        <div class="diet-datebar">
          <IconButton icon="chevron-left" label="上一週" onClick={() => setDate(addDays(date, -7))} />
          <div class="diet-datebar__mid">
            <strong class="diet-datebar__label">{date.slice(0, 4)}年{dm}月{dd}日（週{WEEKDAY_LABELS[weekdayOf(date)]}）</strong>
            {date !== today ? (
              <button type="button" class="nuo-linkbtn" onClick={() => setDate(today)}>回到今天</button>
            ) : null}
          </div>
          <IconButton icon="chevron-right" label="下一週" onClick={() => setDate(addDays(date, 7))} />
          <IconButton icon="calendar" label="飲食日曆" onClick={() => setSheet({ kind: 'calendar' })} />
        </div>
      </Card>

      {/* ---------- 熱量與營養總覽 ---------- */}
      <Card title="熱量與營養">
        {profile ? (
          <>
            <div class="diet-kcal">
              <div class="diet-kcal__item">
                <span class="diet-kcal__k">每日目標</span>
                <span class="diet-kcal__v num" data-testid="target">{formatNum(profile.kcalTarget)} kcal</span>
              </div>
              <div class="diet-kcal__item">
                <span class="diet-kcal__k">已攝取</span>
                <span class="diet-kcal__v num" data-testid="eaten">{formatNum(totals.kcal)} kcal</span>
              </div>
            </div>
            <p class={`diet-remaining${remaining! < 0 ? ' is-over' : ''}`} data-testid="remaining">
              {remaining! < 0 ? (
                <>已超過 <strong class="num">{formatNum(-remaining!)}</strong> kcal</>
              ) : (
                <>剩餘可攝取 <strong class="num">{formatNum(remaining!)}</strong> kcal</>
              )}
            </p>
            <p class="diet-burnline" data-testid="burn">
              運動消耗 {burn == null ? '—（缺少體重，無法估算）' : <><span class="num">{formatNum(burn)}</span> kcal{countBurn ? '（已計入可攝取）' : '（僅記錄，未計入）'}</>}
            </p>
            <ProgressBar
              label="熱量"
              value={totals.kcal}
              max={profile.kcalTarget}
              valueText={`${formatNum(totals.kcal)} / ${formatNum(profile.kcalTarget)} kcal`}
              over={totals.kcal > profile.kcalTarget}
            />
            <ProgressBar
              label="蛋白質"
              value={totals.proteinG}
              max={profile.macros.proteinG}
              valueText={`${formatNum(totals.proteinG)} / ${formatNum(profile.macros.proteinG)} g`}
              over={totals.proteinG > profile.macros.proteinG}
            />
            <ProgressBar
              label="碳水"
              value={totals.carbG}
              max={profile.macros.carbG}
              valueText={`${formatNum(totals.carbG)} / ${formatNum(profile.macros.carbG)} g`}
              over={totals.carbG > profile.macros.carbG}
            />
            <ProgressBar
              label="脂肪"
              value={totals.fatG}
              max={profile.macros.fatG}
              valueText={`${formatNum(totals.fatG)} / ${formatNum(profile.macros.fatG)} g`}
              over={totals.fatG > profile.macros.fatG}
            />
            <Button variant="ghost" onClick={() => navigate(paths.settings)}>重新計算</Button>
          </>
        ) : (
          <>
            <p class="diet-guide">完成首次設定以計算目標</p>
            <Button variant="primary" onClick={() => navigate(paths.onboarding)}>前往首次設定</Button>
            <div class="diet-kcal">
              <div class="diet-kcal__item">
                <span class="diet-kcal__k">已攝取</span>
                <span class="diet-kcal__v num" data-testid="eaten">{formatNum(totals.kcal)} kcal</span>
              </div>
            </div>
            <ul class="diet-plainmacros">
              <li>蛋白質 <span class="num">{formatNum(totals.proteinG)}</span> g</li>
              <li>碳水 <span class="num">{formatNum(totals.carbG)}</span> g</li>
              <li>脂肪 <span class="num">{formatNum(totals.fatG)}</span> g</li>
            </ul>
            <p class="diet-burnline" data-testid="burn">
              運動消耗 {burn == null ? '—（缺少體重，無法估算）' : <><span class="num">{formatNum(burn)}</span> kcal</>}
            </p>
          </>
        )}
      </Card>

      {/* ---------- 動作 ---------- */}
      <div class="diet-actions">
        <Button variant="primary" onClick={() => setSheet({ kind: 'meal' })}>＋記錄飲食</Button>
        <Button variant="ghost" onClick={() => setSheet({ kind: 'burn' })}>記錄運動消耗</Button>
      </div>

      {/* ---------- 當日餐點 ---------- */}
      <Card title={`${dm}/${dd} 餐點`}>
        {day.meals.length === 0 ? (
          <EmptyState icon="utensils" title="這天還沒有記錄飲食" description="按上方「＋記錄飲食」開始。" />
        ) : (
          <ul class="diet-meals">
            {day.meals.map((m) => (
              <li key={m.id} class="diet-meal">
                <div class="diet-meal__info">
                  <span class="diet-meal__name">{m.name}</span>
                  <span class="diet-meal__kcal num">
                    {formatNum(m.kcal)} kcal{m.servings !== 1 ? `・${formatNum(m.servings)} 份` : ''}
                  </span>
                  <span class="diet-meal__macros num">
                    蛋白質 {formatNum(m.proteinG)} g・碳水 {formatNum(m.carbG)} g・脂肪 {formatNum(m.fatG)} g
                  </span>
                </div>
                <div class="diet-meal__tools">
                  <IconButton
                    icon="minus"
                    label={`${m.name} 減少份數`}
                    disabled={m.servings <= SERVING_MIN}
                    onClick={() => changeServings(m, -SERVING_STEP)}
                  />
                  <IconButton
                    icon="plus"
                    label={`${m.name} 增加份數`}
                    disabled={m.servings >= SERVING_MAX}
                    onClick={() => changeServings(m, SERVING_STEP)}
                  />
                  <button type="button" class="nuo-linkbtn" aria-label={`編輯 ${m.name}`} onClick={() => setSheet({ kind: 'meal', editing: m })}>
                    編輯
                  </button>
                  <IconButton icon="star" label={`${m.name} 加入最愛`} onClick={() => addFavorite(m)} />
                  <IconButton icon="trash-2" variant="danger" label={`刪除 ${m.name}`} onClick={() => removeMeal(m)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------- 面板 ---------- */}
      {sheet.kind === 'meal' ? (
        <MealSheet
          key={sheet.editing?.id ?? 'new'}
          date={date}
          editing={sheet.editing}
          onClose={() => setSheet({ kind: 'none' })}
          onSaved={({ name, date: savedDate, edited }) => {
            setSheet({ kind: 'none' });
            setDate(savedDate);
            notify(edited ? `已更新「${name}」` : `已記錄「${name}」`);
          }}
        />
      ) : null}
      {sheet.kind === 'burn' ? (
        <BurnSheet
          date={date}
          onClose={() => setSheet({ kind: 'none' })}
          onSaved={({ date: savedDate, cleared }) => {
            setSheet({ kind: 'none' });
            setDate(savedDate);
            notify(cleared ? '已恢復自動計算運動消耗' : '已儲存運動消耗');
          }}
        />
      ) : null}
      {sheet.kind === 'calendar' ? (
        <CalendarSheet
          date={date}
          today={today}
          onClose={() => setSheet({ kind: 'none' })}
          onPick={(d) => {
            setDate(d);
            setSheet({ kind: 'none' });
          }}
        />
      ) : null}

      {snack ? (
        <div class="diet-snack" role="status">
          <span class="diet-snack__text">{snack.text}</span>
          {snack.undo ? (
            <button
              type="button"
              class="diet-snack__btn"
              onClick={async () => {
                const undo = snack.undo!;
                setSnack(null);
                if (timer.current) clearTimeout(timer.current);
                await undo();
              }}
            >
              復原
            </button>
          ) : null}
          <button type="button" class="diet-snack__close" aria-label="關閉提示" onClick={() => setSnack(null)}>
            <Icon name="x" size={20} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
