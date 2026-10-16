import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';
import { useBackHandler } from '../app/back';
import { IconButton } from './IconButton';
import { useDialogFocus } from './useDialogFocus';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ComponentChildren;
  /** 底部動作按鈕（通常是 <Button>） */
  actions?: ComponentChildren;
  /** 需要使用者明確回應的確認框用 alertdialog */
  role?: 'dialog' | 'alertdialog';
  /** false = 不顯示右上關閉鈕（例如慶祝頁只允許「繼續」） */
  closable?: boolean;
}

export function Modal({ open, title, onClose, children, actions, role = 'dialog', closable = true }: ModalProps) {
  useBackHandler(onClose, open);
  const ref = useDialogFocus(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return (
    <div class="nuo-layer nuo-layer--modal">
      <div class="nuo-backdrop" onClick={closable ? onClose : undefined} aria-hidden="true" />
      <div ref={ref} class="nuo-modal" role={role} aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header class="nuo-sheet__head">
          <h2 id={titleId} class="nuo-sheet__title">{title}</h2>
          {closable ? <IconButton icon="x" label="關閉" onClick={onClose} /> : null}
        </header>
        <div class="nuo-sheet__body">{children}</div>
        {actions ? <footer class="nuo-sheet__foot">{actions}</footer> : null}
      </div>
    </div>
  );
}
