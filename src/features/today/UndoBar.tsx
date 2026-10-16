/** 「已刪除，可復原」提示列：5 秒後自動消失。共用 Toast 沒有動作按鈕，所以這裡自己做一個同樣風格的。 */
import { useEffect } from 'preact/hooks';

export const UNDO_MS = 5000;

export interface UndoItem {
  id: number;
  label: string;
  restore(): void;
}

export function UndoBar({ item, onDismiss }: { item: UndoItem | null; onDismiss(): void }) {
  useEffect(() => {
    if (!item) return;
    const t = setTimeout(onDismiss, UNDO_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);
  if (!item) return null;
  return (
    <div class="today-undo" role="status">
      <span class="today-undo__text">{item.label}</span>
      <button
        type="button"
        class="today-undo__btn"
        onClick={() => {
          item.restore();
          onDismiss();
        }}
      >
        復原
      </button>
    </div>
  );
}
