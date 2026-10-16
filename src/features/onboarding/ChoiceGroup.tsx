import type { ComponentChildren } from 'preact';

export interface ChoiceOption<T extends string | number> {
  value: T;
  label: string;
  desc?: string;
}

interface ChoiceGroupProps<T extends string | number> {
  /** 群組的無障礙名稱（radiogroup） */
  label: string;
  options: ReadonlyArray<ChoiceOption<T>>;
  /** null = 尚未選擇 */
  value: T | null;
  onChange: (v: T) => void;
  /** compact：橫向並排（性別）；cards：直向大卡片附說明（PAL、目標） */
  variant?: 'compact' | 'cards';
}

/**
 * 單選卡片。與 SegmentedControl 不同之處：允許「尚未選擇」狀態——
 * 此時第一個選項可用 Tab 聚焦（roving tabindex），避免整組無法以鍵盤操作。
 */
export function ChoiceGroup<T extends string | number>({ label, options, value, onChange, variant = 'cards' }: ChoiceGroupProps<T>): ComponentChildren {
  const onKey = (e: KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value);
    let to = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = i < 0 ? 0 : (i + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = i < 0 ? options.length - 1 : (i - 1 + options.length) % options.length;
    if (to < 0) return;
    e.preventDefault();
    onChange(options[to].value);
    (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=radio]')[to]?.focus();
  };
  return (
    <div class={`onb-choice onb-choice--${variant}`} role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o, idx) => {
        const checked = o.value === value;
        const tabbable = checked || (value === null && idx === 0);
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={tabbable ? 0 : -1}
            class={`onb-choice__item${checked ? ' is-checked' : ''}`}
            onClick={() => onChange(o.value)}
          >
            <span class="onb-choice__label">{o.label}</span>
            {o.desc ? <span class="onb-choice__desc">{o.desc}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
