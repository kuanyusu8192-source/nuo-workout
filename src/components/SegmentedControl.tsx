export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string = string> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (v: T) => void;
  /** 群組的無障礙名稱 */
  label: string;
}

/** 單選分段鈕（例：週／月／年、重訓／有氧）。radiogroup 語意，方向鍵切換。 */
export function SegmentedControl<T extends string = string>({ options, value, onChange, label }: SegmentedControlProps<T>) {
  const onKey = (e: KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value);
    let to = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = (i + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = (i - 1 + options.length) % options.length;
    if (to < 0) return;
    e.preventDefault();
    onChange(options[to].value);
    const buttons = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=radio]');
    buttons[to]?.focus();
  };
  return (
    <div class="nuo-seg" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            class={`nuo-seg__item${checked ? ' is-checked' : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
