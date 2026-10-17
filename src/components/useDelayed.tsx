import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/** 載入中 UI 的預設延遲：資料在這段時間內載好就完全不顯示骨架，避免一閃而過 */
export const SKELETON_DELAY_MS = 150;

/** active 持續超過 delay 毫秒才回傳 true；active 變 false 立即回傳 false。 */
export function useDelayedFlag(active = true, delay = SKELETON_DELAY_MS): boolean {
  const [shown, setShown] = useState(delay <= 0);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    if (delay <= 0) {
      setShown(true);
      return;
    }
    const t = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(t);
  }, [active, delay]);
  return active && (delay <= 0 || shown);
}

/** 子元素延遲 delay 毫秒才渲染（期間不佔位）。 */
export function Delayed({ delay = SKELETON_DELAY_MS, children }: { delay?: number; children?: ComponentChildren }) {
  return useDelayedFlag(true, delay) ? <>{children}</> : null;
}
