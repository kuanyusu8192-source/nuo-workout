import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';

export type ButtonVariant = 'primary' | 'success' | 'danger' | 'ghost';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'loading' | 'size'> {
  variant?: ButtonVariant;
  /** true：停用並顯示「處理中…」，避免重複送出 */
  loading?: boolean;
  fullWidth?: boolean;
  children?: ComponentChildren;
}

/** 底色一律用 *-600 深階色（白字對比 ≥ 4.5）；高度 ≥ 44px。 */
export function Button({ variant = 'primary', loading = false, fullWidth, disabled, type = 'button', onClick, class: cls, className, children, ...rest }: ButtonProps & { className?: string }) {
  const classes = ['nuo-btn', `nuo-btn--${variant}`, fullWidth ? 'nuo-btn--block' : '', cls ?? className ?? ''].filter(Boolean).join(' ');
  return (
    <button {...rest} type={type} onClick={disabled || loading ? undefined : onClick} class={classes} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading ? '處理中…' : children}
    </button>
  );
}
