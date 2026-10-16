import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
}

export interface TabsProps<T extends string = string> {
  tabs: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  /** tablist 的無障礙名稱 */
  label: string;
  /** 目前分頁的內容（會包在 role=tabpanel 內） */
  children?: ComponentChildren;
}

/** 分頁切換。左右鍵／Home／End 移動並啟用（roving tabindex）。 */
export function Tabs<T extends string = string>({ tabs, value, onChange, label, children }: TabsProps<T>) {
  const base = useId();
  const idx = tabs.findIndex((t) => t.id === value);
  const move = (to: number) => {
    const next = tabs[(to + tabs.length) % tabs.length];
    onChange(next.id);
    requestAnimationFrame?.(() => document.getElementById(`${base}-tab-${next.id}`)?.focus());
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') (e.preventDefault(), move(idx + 1));
    else if (e.key === 'ArrowLeft') (e.preventDefault(), move(idx - 1));
    else if (e.key === 'Home') (e.preventDefault(), move(0));
    else if (e.key === 'End') (e.preventDefault(), move(tabs.length - 1));
  };
  return (
    <div class="nuo-tabs">
      <div class="nuo-tabs__list" role="tablist" aria-label={label} onKeyDown={onKey}>
        {tabs.map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              id={`${base}-tab-${t.id}`}
              type="button"
              role="tab"
              class={`nuo-tab${selected ? ' is-selected' : ''}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${value}`} class="nuo-tabs__panel">
        {children}
      </div>
    </div>
  );
}
