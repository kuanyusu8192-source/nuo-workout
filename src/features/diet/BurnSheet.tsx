/** 「記錄運動消耗」面板：自動估算值、手動覆寫（留空＝恢復自動）、計入每日可用熱量的開關。 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { useAppState, useRepoQuery, useRepos } from '../../app/context';
import { Button, FieldFrame, NumberField, Sheet } from '../../components';
import type { DateStr } from '../../domain/types';
import { loadBurn } from './dietData';
import { formatNum } from './dietLogic';
import { Switch } from './Switch';

export interface BurnSheetProps {
  date: DateStr;
  onClose: () => void;
  onSaved: (info: { date: DateStr; cleared: boolean }) => void;
}

export function BurnSheet({ date: initialDate, onClose, onSaved }: BurnSheetProps) {
  const repos = useRepos();
  const { invalidate } = useAppState();
  const [date, setDate] = useState<DateStr>(initialDate);
  const [kcal, setKcal] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const q = useRepoQuery((r) => loadBurn(r, date), [date]);
  const data = q.data;

  // 載入（或換日期）後帶入該日既有覆寫；設定開關造成的重查不會覆蓋使用者正在輸入的值
  useEffect(() => {
    if (data) setKcal(data.override ?? null);
  }, [data?.date, data?.override]);

  async function save() {
    if (bodyRef.current?.querySelector('[aria-invalid="true"]')) {
      setError('運動消耗需為 0–20000 的數字；留空則恢復自動計算');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('請選擇日期');
      return;
    }
    setError('');
    setSaving(true);
    try {
      if (kcal === null) await repos.burnOverrides.clear(date);
      else await repos.burnOverrides.set(date, kcal);
      invalidate();
      onSaved({ date, cleared: kcal === null });
    } catch {
      setError('儲存失敗，請再試一次');
    } finally {
      setSaving(false);
    }
  }

  const countBurn = data?.settings.countBurnToBudget ?? true;

  return (
    <Sheet
      open
      title="記錄運動消耗"
      onClose={onClose}
      footer={<Button variant="primary" loading={saving} onClick={save}>儲存</Button>}
    >
      <div ref={bodyRef} class="diet-form">
        {error ? <p class="diet-form__error" role="alert">{error}</p> : null}

        <FieldFrame label="日期" inputId="diet-burn-date">
          <input
            id="diet-burn-date"
            class="nuo-input"
            type="date"
            value={date}
            onInput={(e) => setDate((e.currentTarget as HTMLInputElement).value)}
          />
        </FieldFrame>

        <p class="diet-burn__auto">
          自動估算：<strong class="num" data-testid="burn-auto">{data ? (data.auto == null ? '—' : formatNum(data.auto)) : '…'}</strong>
          {data && data.auto != null ? ' kcal' : ''}
        </p>
        {data && data.auto == null ? (
          <p class="diet-burn__note">缺少體重，無法估算。請先完成首次設定（或記錄體重），也可以直接手動輸入。</p>
        ) : null}

        <NumberField
          label="運動消耗"
          unit="kcal"
          value={kcal}
          onChange={setKcal}
          min={0}
          max={20000}
          hint="手動輸入會取代自動估算；留空並儲存＝恢復自動計算"
        />

        <Switch
          label="將運動消耗計入每日可用熱量"
          checked={countBurn}
          onChange={async (v) => {
            await repos.settings.patch({ countBurnToBudget: v });
            invalidate();
          }}
        />
        <p class="diet-burn__note">
          目前{countBurn ? '已計入：剩餘可攝取 = 目標 − 已攝取 + 運動消耗' : '未計入：運動消耗只作紀錄，不增加剩餘可攝取'}。
        </p>
      </div>
    </Sheet>
  );
}
