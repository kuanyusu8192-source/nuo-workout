import { useState } from 'preact/hooks';
import { useAppState, useRepoQuery, useRepos } from '../../app/context';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { Sheet } from '../../components/Sheet';
import { Skeleton } from '../../components/Skeleton';
import type { Template } from '../../data/types';
import { ExercisePicker } from '../exercises/ExercisePicker';
import { NameDialog } from './NameDialog';
import { formatCreated, moveItem, reorderStamps, TEMPLATE_COLORS } from './planLogic';
import type { TemplateDetailTarget } from './TemplateDetail';
import { useExerciseNames } from './useExerciseNames';

/** 課表清單：搜尋、預覽、複製、刪除、排序、建立課表流程（命名 -> 多選動作 -> 詳情編輯）。 */
export function TemplateList({ onOpen }: { onOpen: (target: TemplateDetailTarget) => void }) {
  const repos = useRepos();
  const { invalidate } = useAppState();
  const tplQ = useRepoQuery((r) => r.templates.list(), []);
  const names = useExerciseNames();
  const [query, setQuery] = useState('');
  const [previewing, setPreviewing] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [naming, setNaming] = useState(false);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  if (!tplQ.data) return <Skeleton lines={4} height={72} />;
  const templates = tplQ.data;
  const q = query.trim().toLowerCase();
  const shown = q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : templates;

  const guard = async (fn: () => Promise<void>) => {
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失敗，請再試一次');
    }
  };

  const move = (from: number, to: number) =>
    guard(async () => {
      if (to < 0 || to >= templates.length) return;
      const next = moveItem(templates, from, to);
      // 資料模型沒有 order 欄位：以交換 createdAt 表達順序（清單依 createdAt 排序）
      for (const s of reorderStamps(templates, next)) await repos.templates.update(s.id, { createdAt: s.createdAt });
      invalidate();
    });

  const duplicate = (t: Template) =>
    guard(async () => {
      await repos.templates.duplicate(t.id);
      invalidate();
    });

  const remove = (t: Template) =>
    guard(async () => {
      await repos.templates.remove(t.id);
      // 週計畫裡指到這個課表的日子改為休息，避免殘留失效的 id
      for (const p of await repos.plans.list()) {
        if (Object.values(p.days).includes(t.id)) {
          const days = Object.fromEntries(Object.entries(p.days).map(([k, v]) => [k, v === t.id ? null : v]));
          await repos.plans.update(p.id, { days });
        }
      }
      invalidate();
      setDeleting(null);
    });

  const startCreate = () => setNaming(true);
  const defaultColor = TEMPLATE_COLORS[templates.length % TEMPLATE_COLORS.length].value;

  return (
    <div class="plans-templates">
      {error ? <p class="plans-error" role="alert">{error}</p> : null}

      {templates.length === 0 ? (
        <EmptyState icon="list-checks" title="還沒有課表" description="課表是一組固定的動作與組數，可以排進週計畫，一鍵開始訓練。" actionLabel="建立課表" onAction={startCreate} />
      ) : (
        <>
          <Field label="搜尋課表" type="search" value={query} onChange={setQuery} autoComplete="off" />
          {q ? <p class="plans-hint">搜尋中無法調整順序，清除搜尋後可排序。</p> : null}
          {shown.length === 0 ? (
            <p class="plans-hint" role="status">{`找不到符合「${query.trim()}」的課表。`}</p>
          ) : (
            <ul class="plans-list" aria-label="課表清單">
              {shown.map((t) => {
                const idx = templates.findIndex((x) => x.id === t.id);
                return (
                  <li key={t.id} class="plans-card">
                    <span class="plans-card__bar" style={{ background: t.color }} aria-hidden="true" />
                    <div class="plans-card__main">
                      <button type="button" class="plans-card__open" aria-label={`開啟 ${t.name}`} onClick={() => onOpen({ key: t.id, id: t.id })}>
                        <span class="plans-card__name">{t.name}</span>
                        <span class="plans-card__meta">{`${t.exercises.length} 個動作 · 建立於 ${formatCreated(t.createdAt)}`}</span>
                      </button>
                      <div class="plans-card__actions">
                        <button
                          type="button"
                          class="plans-handle"
                          aria-label={`排序 ${t.name}`}
                          title="按上下方向鍵調整順序"
                          disabled={!!q}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp') (e.preventDefault(), move(idx, idx - 1));
                            else if (e.key === 'ArrowDown') (e.preventDefault(), move(idx, idx + 1));
                          }}
                        >
                          <span class="plans-grip" aria-hidden="true" />
                        </button>
                        <button type="button" class="plans-act" aria-label={`上移 ${t.name}`} disabled={!!q || idx === 0} onClick={() => move(idx, idx - 1)}>
                          <span class="plans-rot-up"><Icon name="chevron-right" size={22} /></span>
                        </button>
                        <button type="button" class="plans-act" aria-label={`下移 ${t.name}`} disabled={!!q || idx === templates.length - 1} onClick={() => move(idx, idx + 1)}>
                          <span class="plans-rot-down"><Icon name="chevron-right" size={22} /></span>
                        </button>
                        <button type="button" class="plans-act plans-act--text" aria-label={`預覽 ${t.name}`} onClick={() => setPreviewing(t)}>預覽</button>
                        <button type="button" class="plans-act plans-act--text" aria-label={`複製 ${t.name}`} onClick={() => duplicate(t)}>複製</button>
                        <button type="button" class="plans-act plans-act--danger" aria-label={`刪除 ${t.name}`} onClick={() => setDeleting(t)}>
                          <Icon name="trash-2" size={22} />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Button className="plans-fab" onClick={startCreate}>＋建立課表</Button>
        </>
      )}

      <Sheet open={previewing !== null} title={`預覽：${previewing?.name ?? ''}`} onClose={() => setPreviewing(null)}>
        {previewing ? (
          <>
            <ul class="plans-preview">
              {previewing.exercises.map((e, i) => (
                <li key={`${e.exerciseId}-${i}`}>
                  <span>{names.get(e.exerciseId) ?? e.exerciseId}</span>
                  <span class="plans-preview__target">{`${e.targetSets} 組${e.targetReps ? ` × ${e.targetReps} 次` : ''}`}</span>
                </li>
              ))}
            </ul>
            <h3 class="plans-h">收操建議</h3>
            <p class="plans-cooldown">{previewing.cooldownText?.trim() ? previewing.cooldownText : '尚未設定收操建議'}</p>
          </>
        ) : null}
      </Sheet>

      <Modal
        open={deleting !== null}
        role="alertdialog"
        title="刪除課表"
        onClose={() => setDeleting(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>取消</Button>
            <Button variant="danger" onClick={() => deleting && remove(deleting)}>確定刪除</Button>
          </>
        }
      >
        <p>{`確定要刪除「${deleting?.name ?? ''}」嗎？週計畫裡排到它的日子會改成休息，過去的訓練紀錄不受影響。`}</p>
      </Modal>

      <NameDialog
        open={naming}
        title="為課表命名"
        fieldLabel="課表名稱"
        submitLabel="下一步"
        emptyMessage="請輸入課表名稱，例如「推日」「腿日」"
        onSubmit={(name) => {
          setNaming(false);
          setPendingName(name);
        }}
        onClose={() => setNaming(false)}
      />

      <Sheet open={pendingName !== null} title="選擇動作" onClose={() => setPendingName(null)}>
        {pendingName !== null ? (
          <ExercisePicker
            mode="multi"
            initialSelectedIds={[]}
            onClose={() => setPendingName(null)}
            onDone={(ids) => {
              const name = pendingName;
              setPendingName(null);
              onOpen({ key: `new-${Date.now()}`, initial: { name, exerciseIds: ids, color: defaultColor } });
            }}
          />
        ) : null}
      </Sheet>
    </div>
  );
}
