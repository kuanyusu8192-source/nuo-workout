import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';
import { useBackHandler } from '../app/back';
import { IconButton } from './IconButton';
import { useDialogFocus } from './useDialogFocus';

export interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ComponentChildren;
  /** 固定在面板底部的動作列（主要按鈕放下半部） */
  footer?: ComponentChildren;
}

/** 底部面板。開啟時註冊返回鍵 handler（返回先關面板）、焦點管理、Escape 關閉。 */
export function Sheet({ open, title, onClose, children, footer }: SheetProps) {
  useBackHandler(onClose, open);
  const ref = useDialogFocus(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return (
    <div class="nuo-layer nuo-layer--sheet">
      <div class="nuo-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={ref} class="nuo-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header class="nuo-sheet__head">
          <h2 id={titleId} class="nuo-sheet__title">{title}</h2>
          <IconButton icon="x" label="關閉" onClick={onClose} />
        </header>
        <div class="nuo-sheet__body">{children}</div>
        {footer ? <footer class="nuo-sheet__foot">{footer}</footer> : null}
      </div>
    </div>
  );
}
