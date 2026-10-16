import { useEffect, useRef, useState } from 'preact/hooks';
import { useAppState, useRepos } from '../../app/context';
import { Card } from '../../components/Card';
import { NumberField } from '../../components/Field';
import { IconButton } from '../../components/IconButton';
import { SegmentedControl } from '../../components/SegmentedControl';
import type { Settings } from '../../data/types';

const UNIT_OPTIONS = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
] as const;

export const REST_MIN = 30;
export const REST_MAX = 300;
export const REST_STEP = 15;
export const MET_MIN = 3;
export const MET_MAX = 8;

export function PreferencesSection({ settings: saved }: { settings: Settings }) {
  const repos = useRepos();
  const { invalidate } = useAppState();
  const [error, setError] = useState<string>();
  // 本地樂觀狀態：連點時不必等上一次寫入完成，且每次都以最新值計算
  const [settings, setSettings] = useState(saved);
  const [met, setMet] = useState<number | null>(saved.metStrength);
  const inflight = useRef(0);
  // 外部變動（例如匯入備份）時以儲存值為準；自己的寫入還在進行時，忽略可能過期的重新載入結果
  useEffect(() => {
    if (inflight.current === 0) setSettings(saved);
  }, [saved]);

  const patch = async (p: Partial<Omit<Settings, 'id'>>) => {
    setError(undefined);
    setSettings((s) => ({ ...s, ...p }));
    inflight.current++;
    try {
      await repos.settings.patch(p);
      invalidate();
    } catch (e) {
      setError(`儲存設定失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      inflight.current--;
    }
  };

  const rest = settings.restDefaultSec;

  return (
    <Card title="偏好設定">
      <div class="set-field">
        <p class="set-label">體重單位</p>
        <SegmentedControl label="體重單位" options={UNIT_OPTIONS} value={settings.weightUnit} onChange={(v) => patch({ weightUnit: v })} />
      </div>
      <div class="set-field">
        <p class="set-label">重量單位</p>
        <SegmentedControl label="重量單位" options={UNIT_OPTIONS} value={settings.loadUnit} onChange={(v) => patch({ loadUnit: v })} />
        <p class="set-note">單位只影響顯示；已儲存的資料一律以 kg 保存，切換不會改動它們。</p>
      </div>

      <div class="set-row">
        <span class="set-label" id="set-rest-label">預設休息秒數</span>
        <div class="set-stepper" role="group" aria-labelledby="set-rest-label">
          <IconButton icon="minus" label="減少休息秒數" variant="primary" disabled={rest <= REST_MIN} onClick={() => patch({ restDefaultSec: Math.max(REST_MIN, rest - REST_STEP) })} />
          <output class="set-stepper__value num" data-testid="rest-value">{rest} 秒</output>
          <IconButton icon="plus" label="增加休息秒數" variant="primary" disabled={rest >= REST_MAX} onClick={() => patch({ restDefaultSec: Math.min(REST_MAX, rest + REST_STEP) })} />
        </div>
      </div>
      <p class="set-note">範圍 {REST_MIN}–{REST_MAX} 秒，每次調整 {REST_STEP} 秒。</p>

      <label class="set-switch">
        <span>將運動消耗計入每日可用熱量</span>
        <input type="checkbox" role="switch" checked={settings.countBurnToBudget} onChange={() => patch({ countBurnToBudget: !settings.countBurnToBudget })} />
      </label>

      <NumberField
        label="重訓 MET"
        value={met}
        min={MET_MIN}
        max={MET_MAX}
        step={0.5}
        onChange={(v) => {
          setMet(v);
          if (v !== null) void patch({ metStrength: v });
        }}
      />
      <p class="set-note">MET 是活動強度倍率，運動消耗 ＝ MET × 體重(kg) × 小時。一般重訓約 5.0（輕鬆約 3.5、很激烈約 6–8），可調 {MET_MIN}–{MET_MAX}。</p>

      <label class="set-switch">
        <span>同步 Health Connect</span>
        <input type="checkbox" role="switch" checked={settings.healthConnect} onChange={() => patch({ healthConnect: !settings.healthConnect })} />
      </label>
      <p class="set-note">尚未接上：目前只儲存這個設定值，不會實際同步。</p>

      {error ? <p class="set-error" role="alert">{error}</p> : null}
    </Card>
  );
}
