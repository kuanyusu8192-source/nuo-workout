/** 一組的輸入欄位（依動作類型：重訓 kg／次；有氧 分鐘／速度／斜度；伸展 秒）。動作卡與今日紀錄的「編輯」共用。 */
import { useLayoutEffect, useRef } from 'preact/hooks';
import { NumberField } from '../../components';
import type { Exercise } from '../../data/types';
import type { LoadUnit, Values } from './model';

export interface RowInputsProps {
  ex: Pick<Exercise, 'trackingType'>;
  unit: LoadUnit;
  /** 第幾組（從 1 起），用在輸入框的無障礙名稱 */
  no: number;
  values: Values;
  /** 建議值（上次紀錄），以灰色 placeholder 呈現 */
  hint?: Values;
  targetReps?: number;
  onChange(patch: Partial<Values>): void;
}

const ph = (n: number | null | undefined): string | undefined => (n === null || n === undefined ? undefined : String(n));

export function RowInputs({ ex, unit, no, values, hint, targetReps, onChange }: RowInputsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const t = ex.trackingType;

  // NumberField 沒有 placeholder 屬性：渲染後直接補在 <input> 上（依欄位順序）
  const holders: Array<string | undefined> =
    t === 'strength'
      ? [ph(hint?.weight), ph(hint?.reps) ?? ph(targetReps)]
      : t === 'cardio'
        ? [ph(hint?.minutes), ph(hint?.speed), ph(hint?.incline)]
        : [ph(hint?.seconds)];
  const key = holders.join('|');
  useLayoutEffect(() => {
    ref.current?.querySelectorAll('input').forEach((el, i) => {
      const p = holders[i];
      if (p === undefined) el.removeAttribute('placeholder');
      else el.setAttribute('placeholder', p);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div ref={ref} class={`today-row__fields today-row__fields--${t}`}>
      {t === 'strength' ? (
        <>
          <NumberField label={`第${no}組 重量`} unit={unit} value={values.weight} min={0} max={unit === 'lb' ? 1100 : 500} onChange={(v) => onChange({ weight: v })} />
          <NumberField label={`第${no}組 次數`} value={values.reps} min={1} max={999} decimal={false} onChange={(v) => onChange({ reps: v })} />
        </>
      ) : t === 'cardio' ? (
        <>
          <NumberField label={`第${no}組 時間`} unit="分鐘" value={values.minutes} min={0.1} max={600} onChange={(v) => onChange({ minutes: v })} />
          <NumberField label={`第${no}組 速度`} unit="km/h" value={values.speed} min={0} max={40} onChange={(v) => onChange({ speed: v })} />
          <NumberField label={`第${no}組 斜度`} unit="%" value={values.incline} min={0} max={40} onChange={(v) => onChange({ incline: v })} />
        </>
      ) : (
        <NumberField label={`第${no}組 時間`} unit="秒" value={values.seconds} min={1} max={3600} decimal={false} onChange={(v) => onChange({ seconds: v })} />
      )}
    </div>
  );
}

/** 欄首標題（視覺用，輸入框本身另有無障礙名稱） */
export function rowHeaders(t: Exercise['trackingType'], unit: LoadUnit): string[] {
  return t === 'strength' ? [unit, '次'] : t === 'cardio' ? ['分鐘', 'km/h', '斜度%'] : ['秒'];
}
