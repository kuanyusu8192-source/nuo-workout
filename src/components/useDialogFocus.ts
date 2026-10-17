import { useEffect, useRef } from 'preact/hooks';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** 自動聚焦的文字輸入框：排除 hidden／disabled／checkbox／radio／date，以及標示 data-autofocus="false" 的 */
const AUTOFOCUS_INPUT =
  'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="date"]):not([data-autofocus="false"])';

/**
 * 對話框焦點管理：開啟時記住原焦點並移入對話框（有文字輸入框就聚焦第一個，手機會彈出鍵盤；
 * 否則第一個可聚焦元素，再否則容器本身。輸入框加 `data-autofocus="false"` 可退出，例如動作選擇的搜尋框）；
 * Tab 在內部循環；Escape 觸發 onEscape；關閉時還原焦點。
 */
export function useDialogFocus(open: boolean, onEscape: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const escRef = useRef(onEscape);
  escRef.current = onEscape;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const root = ref.current;
    if (root) {
      const first = root.querySelector<HTMLElement>(AUTOFOCUS_INPUT) ?? root.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? root).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        escRef.current();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open]);
  return ref;
}
