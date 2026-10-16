export interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** 可見文字，同時是無障礙名稱 */
  label: string;
  disabled?: boolean;
}

/** 開關：role=switch，狀態用文字「開／關」顯示（不只靠顏色）。 */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      class={`diet-switch${checked ? ' is-on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span class="diet-switch__label">{label}</span>
      <span class="diet-switch__state" aria-hidden="true">{checked ? '開' : '關'}</span>
    </button>
  );
}
