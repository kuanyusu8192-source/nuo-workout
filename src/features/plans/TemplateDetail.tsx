import { useId, useState } from 'preact/hooks';
import { useBackHandler } from '../../app/back';
import { useAppState, useAsync, useRepos } from '../../app/context';
import { navigate } from '../../app/router';
import { paths } from '../../app/paths';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Field, NumberField } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { Modal } from '../../components/Modal';
import { Sheet } from '../../components/Sheet';
import { Skeleton } from '../../components/Skeleton';
import type { TemplateExercise } from '../../data/types';
import { ExercisePicker } from '../exercises/ExercisePicker';
import { DEFAULT_TARGET_REPS, DEFAULT_TARGET_SETS, MAX_TARGET_SETS, moveItem, TEMPLATE_COLORS } from './planLogic';
import { useExerciseNames } from './useExerciseNames';

/** 開啟詳情的目標：既有課表（id）或「剛命名＋選好動作、尚未儲存」的新課表（initial）。key 用來重置編輯狀態。 */
export interface TemplateDetailTarget {
  key: string;
  id?: string;
  initial?: { name: string; exerciseIds: string[]; color: string };
}

interface Draft {
  name: string;
  color: string;
  exercises: TemplateExercise[];
  cooldownText: string;
}

export function TemplateDetail({ target, onBack }: { target: TemplateDetailTarget; onBack: () => void }) {
  const repos = useRepos();
  const loaded = useAsync(async () => (target.id ? ((await repos.templates.get(target.id)) ?? null) : undefined), [target.id]);

  if (loaded.loading && loaded.data === undefined && !loaded.error) return <Skeleton lines={5} height={56} />;
  if (target.id && loaded.data === null) {
    return <EmptyState icon="list-checks" title="找不到這個課表" description="它可能已被刪除。" actionLabel="回到課表清單" onAction={onBack} />;
  }
  const t = loaded.data ?? undefined;
  const initial: Draft = t
    ? { name: t.name, color: t.color, exercises: t.exercises, cooldownText: t.cooldownText ?? '' }
    : {
        name: target.initial?.name ?? '',
        color: target.initial?.color ?? TEMPLATE_COLORS[0].value,
        exercises: (target.initial?.exerciseIds ?? []).map((exerciseId) => ({ exerciseId, targetSets: DEFAULT_TARGET_SETS, targetReps: DEFAULT_TARGET_REPS })),
        cooldownText: '',
      };
  return <Editor initial={initial} existingId={t?.id} onBack={onBack} />;
}

const snap = (d: Draft) => JSON.stringify(d);

function Editor({ initial, existingId, onBack }: { initial: Draft; existingId?: string; onBack: () => void }) {
  const repos = useRepos();
  const { mode, selectedDate, activePlanId, invalidate } = useAppState();
  const names = useExerciseNames();
  const cooldownId = useId();

  const [draft, setDraft] = useState<Draft>(initial);
  const [savedId, setSavedId] = useState<string | undefined>(existingId);
  const [saved, setSaved] = useState<string | null>(existingId ? snap(initial) : null);
  const [justSaved, setJustSaved] = useState(false);
  const [nameError, setNameError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const dirty = saved === null || snap(draft) !== saved;

  const requestLeave = () => (dirty ? setConfirmLeave(true) : onBack());
  // 離開（導向今日）時先停用 handler；back.ts 會偵測到 hash 已變而不再 history.go 回收標記
  useBackHandler(requestLeave, !leaving);

  const edit = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setJustSaved(false);
    setError(undefined);
  };
  const editExercise = (i: number, patch: Partial<TemplateExercise>) =>
    edit({ exercises: draft.exercises.map((e, k) => (k === i ? { ...e, ...patch } : e)) });

  /** 回傳存好的課表 id；驗證失敗或出錯回 null */
  const save = async (): Promise<string | null> => {
    const name = draft.name.trim();
    if (!name) {
      setNameError('請輸入課表名稱，例如「推日」「腿日」');
      return null;
    }
    setBusy(true);
    setError(undefined);
    try {
      const payload = { name, color: draft.color, exercises: draft.exercises, cooldownText: draft.cooldownText.trim() };
      const row = savedId ? await repos.templates.update(savedId, payload) : await repos.templates.create(payload);
      const next: Draft = { ...draft, name, cooldownText: payload.cooldownText };
      setDraft(next);
      setSavedId(row.id);
      setSaved(snap(next));
      setJustSaved(true);
      invalidate();
      return row.id;
    } catch (e) {
      setError(e instanceof Error ? e.message : '儲存失敗，請再試一次');
      return null;
    } finally {
      setBusy(false);
    }
  };

  /**
   * 開始訓練：建立今日 session（帶 templateId、planId）後導向今日訓練。
   * 動作與組數的預填由今日訓練畫面依 session.templateId 處理，這裡不寫入 sets。
   * 若今天已有同課表且尚未結束的 session，直接導向（不重複建立）。
   */
  const start = async () => {
    const id = !dirty && savedId ? savedId : await save();
    if (!id) return;
    setBusy(true);
    try {
      const sameDay = await repos.sessions.getByDate(selectedDate);
      const open = sameDay.find((s) => !s.endedAt && s.templateId === id);
      if (!open) await repos.sessions.create({ date: selectedDate, mode, templateId: id, planId: activePlanId ?? undefined });
      invalidate();
      setLeaving(true);
      navigate(paths.today);
    } catch (e) {
      setError(e instanceof Error ? e.message : '無法開始訓練，請再試一次');
      setBusy(false);
    }
  };

  const applyPicked = (ids: string[]) => {
    const kept = draft.exercises.filter((e) => ids.includes(e.exerciseId));
    const have = new Set(draft.exercises.map((e) => e.exerciseId));
    const added = [...new Set(ids)]
      .filter((id) => !have.has(id))
      .map((exerciseId) => ({ exerciseId, targetSets: DEFAULT_TARGET_SETS, targetReps: DEFAULT_TARGET_REPS }));
    edit({ exercises: [...kept, ...added] });
    setPicking(false);
  };

  const nameOf = (id: string) => names.get(id) ?? id;

  return (
    <div class="plans-detail">
      <div class="plans-detail__bar">
        <IconButton icon="chevron-left" label="返回課表清單" onClick={requestLeave} />
        <h2 class="plans-h plans-detail__title">課表詳情</h2>
      </div>

      <Field
        label="課表名稱"
        value={draft.name}
        onChange={(v) => {
          edit({ name: v });
          if (nameError) setNameError(undefined);
        }}
        error={nameError}
        maxLength={30}
        autoComplete="off"
      />

      <div class="plans-field">
        <span class="nuo-field__label" id={`${cooldownId}-colors`}>課表顏色</span>
        <div class="plans-colors" role="group" aria-labelledby={`${cooldownId}-colors`}>
          {TEMPLATE_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              class={`plans-color${draft.color.toLowerCase() === c.value ? ' is-selected' : ''}`}
              style={{ background: c.value }}
              aria-label={`顏色 ${c.name}`}
              aria-pressed={draft.color.toLowerCase() === c.value}
              onClick={() => edit({ color: c.value })}
            >
              {draft.color.toLowerCase() === c.value ? <Icon name="check" size={22} /> : null}
            </button>
          ))}
        </div>
      </div>

      <section aria-label="動作清單">
        <h3 class="plans-h">{`動作（${draft.exercises.length}）`}</h3>
        {draft.exercises.length === 0 ? (
          <p class="plans-hint">還沒有動作，按下方「新增動作」加入。</p>
        ) : (
          <ul class="plans-list">
            {draft.exercises.map((e, i) => {
              const n = nameOf(e.exerciseId);
              return (
                <li key={e.exerciseId} class="plans-ex" data-testid="tpl-exercise">
                  <div class="plans-ex__top">
                    <span class="plans-ex__name">{n}</span>
                    <div class="plans-ex__moves">
                      <button type="button" class="plans-act" aria-label={`上移動作 ${n}`} disabled={i === 0} onClick={() => edit({ exercises: moveItem(draft.exercises, i, i - 1) })}>
                        <span class="plans-rot-up"><Icon name="chevron-right" size={22} /></span>
                      </button>
                      <button type="button" class="plans-act" aria-label={`下移動作 ${n}`} disabled={i === draft.exercises.length - 1} onClick={() => edit({ exercises: moveItem(draft.exercises, i, i + 1) })}>
                        <span class="plans-rot-down"><Icon name="chevron-right" size={22} /></span>
                      </button>
                      <button type="button" class="plans-act plans-act--danger" aria-label={`移除動作 ${n}`} onClick={() => edit({ exercises: draft.exercises.filter((_, k) => k !== i) })}>
                        <Icon name="trash-2" size={22} />
                      </button>
                    </div>
                  </div>
                  <div class="plans-ex__targets">
                    <div class="plans-stepper" role="group" aria-label={`${n} 目標組數`}>
                      <button type="button" class="plans-act" aria-label={`減少組數 ${n}`} disabled={e.targetSets <= 1} onClick={() => editExercise(i, { targetSets: e.targetSets - 1 })}>
                        <Icon name="minus" size={22} />
                      </button>
                      <span class="plans-stepper__value num">{`${e.targetSets} 組`}</span>
                      <button type="button" class="plans-act" aria-label={`增加組數 ${n}`} disabled={e.targetSets >= MAX_TARGET_SETS} onClick={() => editExercise(i, { targetSets: e.targetSets + 1 })}>
                        <Icon name="plus" size={22} />
                      </button>
                    </div>
                    <NumberField label="目標次數" decimal={false} min={1} max={100} value={e.targetReps ?? null} onChange={(v) => editExercise(i, { targetReps: v ?? undefined })} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Button variant="ghost" fullWidth onClick={() => setPicking(true)}>＋新增動作</Button>
      </section>

      <div class="nuo-field plans-field">
        <label class="nuo-field__label" for={cooldownId}>收操建議</label>
        <textarea
          id={cooldownId}
          class="nuo-input plans-textarea"
          rows={4}
          value={draft.cooldownText}
          placeholder="例如：胸肌門框伸展 30 秒 × 2"
          onInput={(e) => edit({ cooldownText: (e.currentTarget as HTMLTextAreaElement).value })}
        />
        <p class="nuo-field__msg">訓練結束後會顯示這段文字。</p>
      </div>

      {error ? <p class="plans-error" role="alert">{error}</p> : null}
      <p class="plans-saved" role="status">{justSaved && !dirty ? '已儲存' : ''}</p>

      <div class="plans-detail__foot">
        <Button variant="success" loading={busy} disabled={!dirty} onClick={() => void save()}>儲存</Button>
        <Button variant="primary" loading={busy} onClick={() => void start()}>開始訓練</Button>
      </div>

      <Sheet open={picking} title="選擇動作" onClose={() => setPicking(false)}>
        {picking ? (
          <ExercisePicker mode="multi" initialSelectedIds={draft.exercises.map((e) => e.exerciseId)} onClose={() => setPicking(false)} onDone={applyPicked} />
        ) : null}
      </Sheet>

      <Modal
        open={confirmLeave}
        role="alertdialog"
        title="尚未儲存"
        onClose={() => setConfirmLeave(false)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmLeave(false)}>繼續編輯</Button>
            <Button variant="danger" onClick={() => (setConfirmLeave(false), onBack())}>放棄變更</Button>
          </>
        }
      >
        <p>這份課表有尚未儲存的修改，離開會放棄這些修改。</p>
      </Modal>
    </div>
  );
}
