import type { ButtonHTMLAttributes } from 'preact';
import { Icon, type IconName } from './Icon';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size' | 'icon'> {
  icon: IconName;
  /** 必填：圖示按鈕的無障礙名稱（aria-label） */
  label: string;
  variant?: 'plain' | 'primary' | 'danger' | 'onDark';
  iconSize?: number;
}

export function IconButton({ icon, label, variant = 'plain', iconSize = 24, type = 'button', class: cls, ...rest }: IconButtonProps) {
  return (
    <button {...rest} type={type} aria-label={label} title={label} class={`nuo-iconbtn nuo-iconbtn--${variant} ${cls ?? ''}`.trim()}>
      <Icon name={icon} size={iconSize} />
    </button>
  );
}
