import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useAppState, useRepoQuery, useRepos } from '../../app/context';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Field, FieldFrame, NumberField } from '../../components/Field';
import { IconButton } from '../../components/IconButton';
import type { BodyMetric } from '../../data/types';
import { formatWeight, fromDisplayWeight, toDisplayWeight, type WeightUnit } from './units';

export const UNDO_MS = 5000;
const KG_RANGE = { min: 30, max: 300 };
const FAT_RANGE = { min: 3, max: 60 };

/** 體脂欄位：空白＝省略；有輸入則須為 3–60 的數字。回傳 undefined 表示合法。 */
function fatError(text: string): string | undefined {
  const t = text.trim();
  if (t === '') return undefined;
  const n = Number(t);
  if (!/^\d*\.?\d+$/.test(t) || !Number.isFinite(n) || n < FAT_RANGE.min || n > FAT_RANGE.max) {
    return `體脂需介於 ${FAT_RANGE.min}–${FAT_RANGE.max}`;
  }
  return undefined;
}

interface Pending {
  id: string;
  date: string;
  /** true = 已真正刪除（保持隱藏到重新載入完成） */
  done: boolean;
}

/** 資料層是否已提供 remove（目前 BodyMetricRepo 介面尚無，P4 補上後這裡自動啟用刪除） */
type Removable = { remove?: (id: string) => Promise<void> };

export function BodySection({ unit }: { unit: WeightUnit }) {
  const repos = useRepos();
  const { today, invalidate } = useAppState();
  const list = useRepoQuery((r) => r.bodyMetrics.list(), []);
  const remove = (repos.bodyMetrics as Removable).remove?.bind(repos.bodyMetrics);

  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState<number | null>(null);
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<Pending[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const removeRef = useRef(remove);
  removeRef.current = remove;

  // 離開畫面時，尚在倒數的刪除立即提交，避免遺失使用者的刪除動作
  // 用 layout effect：掛載後立刻註冊清理函式（不等 paint 之後），確保快速離開畫面也不會漏掉提交
  useLayoutEffect(
    () => () => {
      for (const [id, t] of timers.current) {
        clearTimeout(t);
        void removeRef.current?.(id);
      }
      timers.current.clear();
    },
    [],
  );

  const fatMsg = fatError(fat);
  const range = {
    min: toDisplayWeight(KG_RANGE.min, unit),
    max: toDisplayWeight(KG_RANGE.max, unit),
  };
  const canAdd = weight !== null && date !== '' && !fatMsg && !saving;

  const add = async () => {
    if (!canAdd || weight === null) return;
    setSaving(true);
    setError(undefined);
    try {
      const metric: Omit<BodyMetric, 'id'> = { date, weightKg: fromDisplayWeight(weight, unit) };
      if (fat.trim() !== '') metric.bodyFatPct = Number(fat);
      await repos.bodyMetrics.add(metric);
      setWeight(null);
      setFat('');
      invalidate();
    } catch (e) {
      setError(`新增失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const commit = async (id: string) => {
    timers.current.delete(id);
    try {
      await remove?.(id);
      setPending((ps) => ps.map((p) => (p.id === id ? { ...p, done: true } : p)));
      invalidate();
    } catch (e) {
      setPending((ps) => ps.filter((p) => p.id !== id));
      setError(`刪除失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const startDelete = (m: BodyMetric) => {
    setPending((ps) => [...ps, { id: m.id, date: m.date, done: false }]);
    timers.current.set(m.id, setTimeout(() => void commit(m.id), UNDO_MS));
  };

  const undo = (id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setPending((ps) => ps.filter((p) => p.id !== id));
  };

  const hidden = new Set(pending.map((p) => p.id));
  const rows = [...(list.data ?? [])].reverse().filter((m) => !hidden.has(m.id));
  const waiting = pending.filter((p) => !p.done);
  const lastWaiting = waiting[waiting.length - 1];

  return (
    <Card title="體重與體脂">
      <div class="set-body-form">
        <FieldFrame label="日期" inputId="set-body-date" error={date === '' ? '請選擇日期' : undefined}>
          <input
            id="set-body-date"
            class="nuo-input"
            type="date"
            value={date}
            max={today}
            aria-invalid={date === '' ? true : undefined}
            onInput={(e) => setDate((e.currentTarget as HTMLInputElement).value)}
          />
        </FieldFrame>
        <NumberField label="體重" unit={unit} value={weight} onChange={setWeight} min={range.min} max={range.max} required />
        <Field label="體脂（%）" value={fat} onChange={setFat} inputMode="decimal" error={fatMsg} hint="可不填" />
        <Button fullWidth disabled={!canAdd} loading={saving} onClick={add}>新增紀錄</Button>
      </div>

      {error ? <p class="set-error" role="alert">{error}</p> : null}

      {lastWaiting ? (
        <div class="set-undo" role="status" aria-label="復原刪除">
          <span>已刪除 {lastWaiting.date} 的紀錄</span>
          <Button variant="ghost" onClick={() => undo(lastWaiting.id)}>復原</Button>
        </div>
      ) : null}

      <h3 class="set-subtitle">歷史紀錄</h3>
      {list.data && rows.length === 0 ? (
        <EmptyState icon="scale" title="還沒有體重紀錄" description="在上方新增第一筆，之後會顯示在這裡。" />
      ) : (
        <ul class="set-history" aria-label="體重紀錄">
          {rows.map((m) => (
            <li key={m.id} class="set-history__item">
              <span class="set-history__date">{m.date}</span>
              <span class="set-history__val num">{m.weightKg !== undefined ? formatWeight(m.weightKg, unit) : '—'}</span>
              <span class="set-history__fat">{m.bodyFatPct !== undefined ? `體脂 ${m.bodyFatPct}%` : ''}</span>
              {remove ? <IconButton icon="trash-2" variant="danger" label={`刪除 ${m.date} 的體重紀錄`} onClick={() => startDelete(m)} /> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

