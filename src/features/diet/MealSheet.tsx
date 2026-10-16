/** 「記錄飲食」面板：選單（手動輸入／我的最愛）→ 表單；編輯既有餐點時直接進表單。 */
import { useRef, useState } from 'preact/hooks';
import { useAppState, useRepoQuery, useRepos } from '../../app/context';
import { Button, EmptyState, FieldFrame, Field, Icon, IconButton, NumberField, Sheet, Skeleton } from '../../components';
import type { FavoriteMeal, Meal } from '../../data/types';
import type { DateStr } from '../../domain/types';
import { autoKcal, convertPer100g, formatNum, round1, totalsFor } from './dietLogic';
import { Switch } from './Switch';

type Step = 'menu' | 'form' | 'favorites';

interface Draft {
  name: string;
  per100: boolean;
  p: number | null;
  c: number | null;
  f: number | null;
  p100: number | null;
  c100: number | null;
  f100: number | null;
  grams: number | null;
  kcalManual: boolean;
  kcal: number | null;
  servings: number;
  date: DateStr;
}

const SERVING_STEP = 0.5;
const SERVING_MIN = 0.5;
const SERVING_MAX = 20;

const blankDraft = (date: DateStr): Draft => ({
  name: '', per100: false, p: null, c: null, f: null, p100: null, c100: null, f100: null, grams: null,
  kcalManual: false, kcal: null, servings: 1, date,
});

function draftFromMeal(m: Meal): Draft {
  const s = m.servings || 1;
  const base = blankDraft(m.date);
  base.name = m.name;
  base.servings = s;
  if (m.per100g && m.grams && m.grams > 0) {
    base.per100 = true;
    base.p100 = m.per100g.proteinG;
    base.c100 = m.per100g.carbG;
    base.f100 = m.per100g.fatG;
    base.grams = m.grams;
    const per = convertPer100g(m.per100g, m.grams);
    base.p = per.proteinG;
    base.c = per.carbG;
    base.f = per.fatG;
  } else {
    base.p = round1(m.proteinG / s);
    base.c = round1(m.carbG / s);
    base.f = round1(m.fatG / s);
  }
  const perKcal = m.kcal / s;
  const auto = autoKcal({ proteinG: base.p ?? 0, carbG: base.c ?? 0, fatG: base.f ?? 0 });
  if (Math.abs(perKcal - auto) > 0.5) {
    base.kcalManual = true;
    base.kcal = Math.round(perKcal);
  }
  return base;
}

function draftFromFavorite(fav: FavoriteMeal, date: DateStr): Draft {
  const d = blankDraft(date);
  d.name = fav.name;
  d.p = fav.proteinG;
  d.c = fav.carbG;
  d.f = fav.fatG;
  if (Math.abs(fav.kcal - autoKcal({ proteinG: fav.proteinG, carbG: fav.carbG, fatG: fav.fatG })) > 0.5) {
    d.kcalManual = true;
    d.kcal = fav.kcal;
  }
  return d;
}

export interface MealSheetProps {
  /** 預設記錄日期（目前瀏覽的日期） */
  date: DateStr;
  /** 有值＝編輯既有餐點 */
  editing?: Meal;
  onClose: () => void;
  /** 儲存成功後（date = 實際記錄日期） */
  onSaved: (info: { name: string; date: DateStr; edited: boolean }) => void;
}

export function MealSheet({ date, editing, onClose, onSaved }: MealSheetProps) {
  const repos = useRepos();
  const { invalidate } = useAppState();
  const [step, setStep] = useState<Step>(editing ? 'form' : 'menu');
  const [draft, setDraft] = useState<Draft>(() => (editing ? draftFromMeal(editing) : blankDraft(date)));
  const [formError, setFormError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  // ---- 計算 ----
  const n = (v: number | null) => v ?? 0;
  const per = draft.per100
    ? convertPer100g({ proteinG: n(draft.p100), carbG: n(draft.c100), fatG: n(draft.f100) }, n(draft.grams))
    : { proteinG: n(draft.p), carbG: n(draft.c), fatG: n(draft.f) };
  const macroFields = draft.per100 ? [draft.p100, draft.c100, draft.f100, draft.grams] : [draft.p, draft.c, draft.f];
  const anyEntered = macroFields.some((v) => v !== null);
  const auto = autoKcal(per);
  const kcalValue = draft.kcalManual ? draft.kcal : anyEntered ? auto : null;

  async function save() {
    setSubmitted(true);
    const problems: string[] = [];
    if (!draft.name.trim()) problems.push('食物名稱');
    if (macroFields.some((v) => v === null)) problems.push(draft.per100 ? '每 100g 營養與食用克數（沒有請填 0）' : '蛋白質、碳水、脂肪（沒有請填 0）');
    if (draft.per100 && draft.grams !== null && !(draft.grams > 0)) problems.push('實際食用克數');
    if (kcalValue === null) problems.push('熱量');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) problems.push('日期');
    const invalid = bodyRef.current?.querySelector('[aria-invalid="true"]');
    if (invalid) problems.push('格式不正確的欄位');
    if (problems.length > 0) {
      setFormError(`請修正：${problems.join('、')}`);
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      const totals = totalsFor(per, draft.servings, draft.kcalManual ? (draft.kcal as number) : auto);
      const base = {
        date: draft.date,
        name: draft.name.trim(),
        servings: draft.servings,
        ...totals,
        grams: draft.per100 ? (draft.grams as number) : undefined,
        per100g: draft.per100
          ? {
              proteinG: draft.p100 as number,
              carbG: draft.c100 as number,
              fatG: draft.f100 as number,
              kcal: autoKcal({ proteinG: draft.p100 as number, carbG: draft.c100 as number, fatG: draft.f100 as number }),
            }
          : undefined,
      };
      if (editing) await repos.meals.update(editing.id, base);
      else await repos.meals.add(base);
      invalidate();
      onSaved({ name: base.name, date: base.date, edited: !!editing });
    } catch {
      setFormError('儲存失敗，請再試一次');
    } finally {
      setSaving(false);
    }
  }

  // ---- 畫面 ----
  const title = step === 'menu' ? '記錄飲食' : step === 'favorites' ? '我的最愛' : editing ? '編輯餐點' : '手動輸入';

  const footer =
    step === 'form' ? (
      <>
        {!editing ? <Button variant="ghost" onClick={() => setStep('menu')}>返回</Button> : null}
        <Button variant="primary" loading={saving} onClick={save}>儲存</Button>
      </>
    ) : step === 'favorites' ? (
      <Button variant="ghost" onClick={() => setStep('menu')}>返回</Button>
    ) : undefined;

  return (
    <Sheet open title={title} onClose={onClose} footer={footer}>
      <div ref={bodyRef} class="diet-sheetbody">
        {step === 'menu' ? (
          <div class="diet-menu">
            <button type="button" class="diet-menu__item" onClick={() => { setDraft(blankDraft(date)); setStep('form'); }}>
              <Icon name="plus" />
              <span>手動輸入</span>
            </button>
            <button type="button" class="diet-menu__item" onClick={() => setStep('favorites')}>
              <Icon name="star" />
              <span>我的最愛</span>
            </button>
          </div>
        ) : null}

        {step === 'favorites' ? (
          <FavoritesList
            onPick={(fav) => { setDraft(draftFromFavorite(fav, date)); setSubmitted(false); setFormError(''); setStep('form'); }}
          />
        ) : null}

        {step === 'form' ? (
          <div class="diet-form">
            {formError ? <p class="diet-form__error" role="alert">{formError}</p> : null}
            <Field
              label="食物名稱"
              value={draft.name}
              onChange={(v) => patch({ name: v })}
              error={submitted && !draft.name.trim() ? '請輸入食物名稱' : undefined}
              maxLength={60}
              autoComplete="off"
            />
            <Switch label="以每 100g 標示" checked={draft.per100} onChange={(v) => patch({ per100: v })} />

            {draft.per100 ? (
              <>
                <NumberField label="蛋白質" unit="每 100g" value={draft.p100} onChange={(v) => patch({ p100: v })} min={0} max={100} required />
                <NumberField label="碳水" unit="每 100g" value={draft.c100} onChange={(v) => patch({ c100: v })} min={0} max={100} required />
                <NumberField label="脂肪" unit="每 100g" value={draft.f100} onChange={(v) => patch({ f100: v })} min={0} max={100} required />
                <NumberField label="實際食用克數" unit="g" value={draft.grams} onChange={(v) => patch({ grams: v })} min={1} max={10000} required />
                <p class="diet-form__converted" data-testid="converted">
                  換算後（每份）：蛋白質 {formatNum(per.proteinG)} g、碳水 {formatNum(per.carbG)} g、脂肪 {formatNum(per.fatG)} g
                </p>
              </>
            ) : (
              <>
                <NumberField label="蛋白質" unit="g" value={draft.p} onChange={(v) => patch({ p: v })} min={0} max={5000} required />
                <NumberField label="碳水" unit="g" value={draft.c} onChange={(v) => patch({ c: v })} min={0} max={5000} required />
                <NumberField label="脂肪" unit="g" value={draft.f} onChange={(v) => patch({ f: v })} min={0} max={5000} required />
              </>
            )}

            <NumberField
              label="熱量"
              unit="kcal"
              value={kcalValue}
              onChange={(v) => patch({ kcalManual: true, kcal: v })}
              min={0}
              max={50000}
              required
              hint={draft.kcalManual ? undefined : '自動 = 蛋白質×4 + 碳水×4 + 脂肪×9，可直接修改'}
            />
            {draft.kcalManual ? (
              <div class="diet-form__manual">
                <span class="diet-form__manual-tag">已手動修改</span>
                <button type="button" class="nuo-linkbtn" onClick={() => patch({ kcalManual: false, kcal: null })}>恢復自動</button>
              </div>
            ) : null}

            <FieldFrame label="份數" inputId="diet-servings">
              <div class="diet-stepper" id="diet-servings" role="group" aria-label="份數">
                <IconButton
                  icon="minus"
                  label="減少份數"
                  disabled={draft.servings <= SERVING_MIN}
                  onClick={() => patch({ servings: Math.max(SERVING_MIN, draft.servings - SERVING_STEP) })}
                />
                <output class="diet-stepper__value num" aria-live="polite">{formatNum(draft.servings)} 份</output>
                <IconButton
                  icon="plus"
                  label="增加份數"
                  disabled={draft.servings >= SERVING_MAX}
                  onClick={() => patch({ servings: Math.min(SERVING_MAX, draft.servings + SERVING_STEP) })}
                />
              </div>
            </FieldFrame>

            <FieldFrame label="日期" inputId="diet-date">
              <input
                id="diet-date"
                class="nuo-input"
                type="date"
                value={draft.date}
                onInput={(e) => patch({ date: (e.currentTarget as HTMLInputElement).value })}
              />
            </FieldFrame>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

function FavoritesList({ onPick }: { onPick: (fav: FavoriteMeal) => void }) {
  const repos = useRepos();
  const { invalidate } = useAppState();
  const q = useRepoQuery((r) => r.meals.favorites(), []);
  const [managing, setManaging] = useState(false);

  if (q.loading && !q.data) return <Skeleton lines={3} height={48} />;
  const favs = q.data ?? [];
  if (favs.length === 0) {
    return <EmptyState icon="star" title="還沒有最愛" description="在已記錄的餐點上按星號，就能加入我的最愛。" />;
  }
  return (
    <div>
      <div class="diet-favs__bar">
        <span>點選餐點帶入表單</span>
        <button type="button" class="nuo-linkbtn" onClick={() => setManaging((m) => !m)}>{managing ? '完成' : '管理'}</button>
      </div>
      <ul class="diet-favs">
        {favs.map((f) => (
          <li key={f.id} class="diet-fav">
            <button type="button" class="diet-fav__main" aria-label={`${f.name} 帶入`} onClick={() => onPick(f)}>
              <span class="diet-fav__name">{f.name}</span>
              <span class="diet-fav__meta num">
                {formatNum(f.kcal)} kcal・蛋白質 {formatNum(f.proteinG)} g・碳水 {formatNum(f.carbG)} g・脂肪 {formatNum(f.fatG)} g
              </span>
            </button>
            {managing ? (
              <IconButton
                icon="trash-2"
                variant="danger"
                label={`刪除最愛 ${f.name}`}
                onClick={async () => {
                  await repos.meals.removeFavorite(f.id);
                  invalidate();
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
