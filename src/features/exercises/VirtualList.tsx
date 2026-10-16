/** 固定列高的視窗化清單：只渲染可視範圍加緩衝列。 */
import type { ComponentChild } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

export interface VirtualListProps<T> {
  items: ReadonlyArray<T>;
  rowHeight: number;
  /** 可視範圍上下各多渲染幾列 */
  buffer?: number;
  keyOf(item: T): string;
  renderRow(item: T, index: number): ComponentChild;
  testId?: string;
  label: string;
  /** 改變時捲回頂端 */
  resetKey?: string;
}

/** 量不到高度（例如測試環境）時的假設值 */
const FALLBACK_HEIGHT = 600;

export function VirtualList<T>({ items, rowHeight, buffer = 6, keyOf, renderRow, testId, label, resetKey }: VirtualListProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = 0;
    setTop(0);
  }, [resetKey]);

  const viewH = height || FALLBACK_HEIGHT;
  const start = Math.max(0, Math.floor(top / rowHeight) - buffer);
  const end = Math.min(items.length, Math.ceil((top + viewH) / rowHeight) + buffer);
  const visible = items.slice(start, end);

  return (
    <div
      ref={ref}
      class="exp-list"
      data-testid={testId}
      onScroll={(e) => setTop((e.currentTarget as HTMLDivElement).scrollTop)}
    >
      <div class="exp-list__inner" role="list" aria-label={label} style={{ height: items.length * rowHeight }}>
        {visible.map((item, i) => (
          <div
            key={keyOf(item)}
            role="listitem"
            class="exp-row"
            style={{ top: (start + i) * rowHeight, height: rowHeight }}
          >
            {renderRow(item, start + i)}
          </div>
        ))}
      </div>
    </div>
  );
}
