export interface SkeletonProps {
  /** 預留高度（px），避免載入完成時版面跳動 */
  height?: number;
  width?: number | string;
  /** 重複幾列 */
  lines?: number;
  label?: string;
}

/** 骨架畫面：role=status 讓讀屏器知道在載入，視覺閃動在 reduced-motion 下停用（theme.css）。 */
export function Skeleton({ height = 16, width = '100%', lines = 1, label = '載入中' }: SkeletonProps) {
  return (
    <div class="nuo-skeleton-group" role="status" aria-label={label} aria-busy="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} class="nuo-skeleton" style={{ height: `${height}px`, width: typeof width === 'number' ? `${width}px` : width }} />
      ))}
    </div>
  );
}
