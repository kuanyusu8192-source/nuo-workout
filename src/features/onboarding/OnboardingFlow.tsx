import { useState } from 'preact/hooks';
import { useBackHandler } from '../../app/back';
import { useAppState, useAsync, useRepos } from '../../app/context';
import { navigate } from '../../app/router';
import { paths } from '../../app/paths';
import { Button } from '../../components/Button';
import { NumberField } from '../../components/Field';
import { Skeleton } from '../../components/Skeleton';
import type { ProfileRow } from '../../data/types';
import { PAL_LEVELS, isValidPal } from '../../domain/nutrition';
import type { Goal, Profile, Sex } from '../../domain/types';
import { ChoiceGroup } from './ChoiceGroup';
import { GOAL_OPTIONS, PAL_DESCRIPTIONS, RANGES, SEX_OPTIONS, buildProfileRow, calcProfile } from './profile';
import './onboarding.css';

/** 首次問卷三步（P3 Task 3.2）。路由 `#/onboarding`；完成後呼叫 onDone（預設導向今日）。 */
export interface OnboardingFlowProps {
  onDone?(): void;
}

const STEP_TITLES = ['身體數據', '活動量', '目標'] as const;
const PAL_OPTIONS = PAL_LEVELS.map((l) => ({ value: l.value as number, label: l.label, desc: PAL_DESCRIPTIONS[l.value] }));

interface Initial {
  profile?: ProfileRow;
  latestWeightKg?: number;
}

export function OnboardingFlow({ onDone }: OnboardingFlowProps = {}) {
  const repos = useRepos();
  // 只在掛載時讀一次，供預填；之後的 invalidate 不應重置使用者正在填的內容
  const init = useAsync<Initial>(async () => {
    const [profile, latest] = await Promise.all([repos.profile.get(), repos.bodyMetrics.latest()]);
    return { profile, latestWeightKg: latest?.weightKg };
  }, [repos]);

  if (init.loading && !init.data) return <Skeleton lines={4} height={48} label="載入個人資料" />;
  return <Questionnaire initial={init.data ?? {}} onDone={onDone} />;
}

function Questionnaire({ initial, onDone }: { initial: Initial; onDone?(): void }) {
  const repos = useRepos();
  const { today, invalidate } = useAppState();
  const p = initial.profile;

  const [step, setStep] = useState(1);
  const [sex, setSex] = useState<Sex | null>(p?.sex ?? null);
  const [age, setAge] = useState<number | null>(p?.age ?? null);
  const [heightCm, setHeightCm] = useState<number | null>(p?.heightCm ?? null);
  const [weightKg, setWeightKg] = useState<number | null>(p?.weightKg ?? initial.latestWeightKg ?? null);
  const [pal, setPal] = useState<number | null>(p && isValidPal(p.pal) ? p.pal : null);
  const [goal, setGoal] = useState<Goal | null>(p?.goal ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  // 返回鍵：第 2、3 步先回上一步（在 Sheet 內時，Sheet 較早註冊，所以這裡優先）
  useBackHandler(() => setStep((s) => Math.max(1, s - 1)), step > 1);

  const step1Valid = sex !== null && age !== null && heightCm !== null && weightKg !== null;
  const canNext = step === 1 ? step1Valid : step === 2 ? pal !== null : false;

  const complete: Profile | null =
    step1Valid && pal !== null && goal !== null
      ? { sex: sex!, age: age!, heightCm: heightCm!, weightKg: weightKg!, pal, goal }
      : null;
  const preview = complete ? calcProfile(complete) : null;

  const finish = async () => {
    if (!complete || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await repos.profile.save(buildProfileRow(complete));
      // 同一天、同體重已有紀錄時不重複新增
      const latest = await repos.bodyMetrics.latest();
      if (!(latest && latest.date === today && latest.weightKg === complete.weightKg)) {
        await repos.bodyMetrics.add({ date: today, weightKg: complete.weightKg });
      }
      invalidate();
      (onDone ?? (() => navigate(paths.today, { replace: true })))();
    } catch (e) {
      setError(`儲存失敗：${e instanceof Error ? e.message : String(e)}`);
      setSaving(false);
    }
  };

  return (
    <div class="onb">
      <p class="onb-progress" aria-live="polite">
        <span class="onb-progress__count num">{step}/3</span>
        <span class="onb-progress__title">{STEP_TITLES[step - 1]}</span>
        <span class="onb-dots" aria-hidden="true">
          {[1, 2, 3].map((i) => (
            <span key={i} class={`onb-dot${i <= step ? ' is-done' : ''}`} />
          ))}
        </span>
      </p>

      {step === 1 ? (
        <>
          <p class="onb-lead">用來估算每日消耗熱量（Mifflin–St Jeor 公式）。資料只存在這支手機。</p>
          <div>
            <p class="onb-group-label">性別</p>
            <ChoiceGroup label="性別" variant="compact" options={SEX_OPTIONS} value={sex} onChange={setSex} />
          </div>
          <NumberField label="年齡" unit="歲" value={age} onChange={setAge} min={RANGES.age.min} max={RANGES.age.max} decimal={false} required />
          <NumberField label="身高" unit="cm" value={heightCm} onChange={setHeightCm} min={RANGES.heightCm.min} max={RANGES.heightCm.max} required />
          <NumberField label="體重" unit="kg" value={weightKg} onChange={setWeightKg} min={RANGES.weightKg.min} max={RANGES.weightKg.max} required />
          {!step1Valid ? <p class="onb-hint">請完整填寫並符合範圍後，才能前往下一步。</p> : null}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <p class="onb-lead">選擇最接近你平常一週的活動量。</p>
          <ChoiceGroup label="活動量" options={PAL_OPTIONS} value={pal} onChange={setPal} />
        </>
      ) : null}

      {step === 3 ? (
        <>
          <p class="onb-lead">選擇你現階段的目標。</p>
          <ChoiceGroup label="目標" options={GOAL_OPTIONS} value={goal} onChange={setGoal} />
          {preview ? (
            <section class="onb-preview" data-testid="onboarding-preview" aria-live="polite" aria-label="目標預覽">
              <p class="onb-preview__kcal">
                目標熱量 <span class="num">{preview.kcalTarget}</span> kcal
              </p>
              <p class="onb-preview__note">TDEE 約 {Math.round(preview.tdee)} kcal；蛋白質 35%／碳水 25%／脂肪 40%</p>
              <ul class="onb-preview__macros">
                <li>蛋白質<span class="num">{preview.macros.proteinG} g</span></li>
                <li>碳水<span class="num">{preview.macros.carbG} g</span></li>
                <li>脂肪<span class="num">{preview.macros.fatG} g</span></li>
              </ul>
            </section>
          ) : (
            <p class="onb-hint">選好目標後，這裡會顯示每日熱量與三大營養素克數。</p>
          )}
          {error ? <p class="onb-error" role="alert">{error}</p> : null}
        </>
      ) : null}

      <div class="onb-actions">
        {step > 1 ? (
          <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={saving}>上一步</Button>
        ) : null}
        {step < 3 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext}>下一步</Button>
        ) : (
          <Button variant="success" onClick={finish} disabled={!complete} loading={saving}>完成</Button>
        )}
      </div>
    </div>
  );
}
