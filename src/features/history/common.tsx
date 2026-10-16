import type { ComponentChildren } from 'preact';
import { Skeleton } from '../../components';
import type { AsyncState } from '../../app/context';

/** 載入中顯示骨架、失敗顯示訊息；就緒回傳 null 讓呼叫端繼續畫。 */
export function gate<T>(q: AsyncState<T>): ComponentChildren | null {
  if (q.error && !q.data) return <p role="alert" class="hist-note">資料載入失敗：{q.error.message}</p>;
  if (!q.data) return <Skeleton height={160} lines={3} />;
  return null;
}
