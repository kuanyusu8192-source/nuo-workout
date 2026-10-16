import type { ComponentChildren } from 'preact';

export interface CardProps {
  title?: string;
  children?: ComponentChildren;
  /** 有 onClick 時整張卡變成可點的 <button>（按壓回饋用顏色，不位移） */
  onClick?: () => void;
  /** 可點卡片的無障礙名稱（預設取 title） */
  label?: string;
  class?: string;
}

export function Card({ title, children, onClick, label, class: cls }: CardProps) {
  const body = (
    <>
      {title ? <h2 class="nuo-card__title">{title}</h2> : null}
      {children}
    </>
  );
  if (onClick) {
    return (
      <button type="button" class={`nuo-card nuo-card--pressable ${cls ?? ''}`.trim()} onClick={onClick} aria-label={label ?? title}>
        {body}
      </button>
    );
  }
  return <section class={`nuo-card ${cls ?? ''}`.trim()}>{body}</section>;
}
