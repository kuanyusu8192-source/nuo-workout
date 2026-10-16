export interface ProgressBarProps {
  value: number;
  max?: number;
  /** 文字標籤（必填：不只靠顏色辨識，例如「蛋白質」） */
  label: string;
  /** 右側顯示的文字，預設「value / max」 */
  valueText?: string;
  /** 超標時改用警示色（同時文字顯示） */
  over?: boolean;
  color?: string;
}

export function ProgressBar({ value, max = 100, label, valueText, over, color }: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1;
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  const pct = Math.min(100, (v / safeMax) * 100);
  const text = valueText ?? `${Math.round(v)} / ${Math.round(safeMax)}`;
  return (
    <div class={`nuo-progress${over ? ' is-over' : ''}`}>
      <div class="nuo-progress__row">
        <span class="nuo-progress__label">{label}</span>
        <span class="nuo-progress__value num">{text}{over ? '（超標）' : ''}</span>
      </div>
      <div
        class="nuo-progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={Math.min(v, safeMax)}
        aria-valuetext={text}
      >
        <div class="nuo-progress__fill" style={{ width: `${pct}%`, ...(color && !over ? { background: color } : {}) }} />
      </div>
    </div>
  );
}
