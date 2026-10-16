import type { ComponentChildren } from 'preact';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

export interface EmptyStateProps {
  /** 一句說明，例：「今天還沒有訓練」 */
  title: string;
  description?: string;
  /** 明確的下一步按鈕，例：「開始訓練」 */
  actionLabel?: string;
  onAction?: () => void;
  icon?: IconName;
  children?: ComponentChildren;
}

export function EmptyState({ title, description, actionLabel, onAction, icon = 'dumbbell', children }: EmptyStateProps) {
  return (
    <div class="nuo-empty" role="status">
      <Icon name={icon} size={40} />
      <p class="nuo-empty__title">{title}</p>
      {description ? <p class="nuo-empty__desc">{description}</p> : null}
      {actionLabel && onAction ? <Button onClick={onAction}>{actionLabel}</Button> : null}
      {children}
    </div>
  );
}
