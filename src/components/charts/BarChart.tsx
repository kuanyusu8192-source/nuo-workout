import { prefersReducedMotion } from './motion';

export interface BarDatum {
  label: string;
  value: number;
  /** 例如「今天」：用主色，其餘用淺色 */
  highlight?: boolean;
  /** 覆寫此柱顏色（例：熱量超標用 var(--danger-600)） */
  color?: string;
}

export interface BarChartProps {
  data: ReadonlyArray<BarDatum>;
  /** 圖高（px，固定避免跳動） */
  height?: number;
  color?: string;
  /** 非 highlight 柱的淺色；省略則用主色 35% 透明度 */
  mutedColor?: string;
  formatter?: (v: number) => string;
  /** 虛線目標線 */
  target?: number;
  targetLabel?: string;
  /** 無障礙說明（必填） */
  ariaLabel: string;
}

const W = 340;
const PAD = { top: 22, bottom: 24, left: 6, right: 6 };

/** 純 SVG 長條圖：柱頂標數值；有 highlight 時其餘柱變淺；週一起排由呼叫端的資料順序決定。 */
export function BarChart({ data, height = 200, color = 'var(--primary)', mutedColor, formatter = (v) => String(Math.round(v * 10) / 10), target, targetLabel, ariaLabel }: BarChartProps) {
  const n = data.length;
  const max = Math.max(1, ...data.map((d) => (Number.isFinite(d.value) ? d.value : 0)), target ?? 0);
  const plotH = height - PAD.top - PAD.bottom;
  const slot = (W - PAD.left - PAD.right) / Math.max(1, n);
  const barW = Math.max(2, Math.min(36, slot * 0.62));
  const hasHighlight = data.some((d) => d.highlight);
  const crowded = n > 12;
  const maxVal = Math.max(...data.map((d) => d.value));
  const animate = !prefersReducedMotion();
  const y = (v: number) => PAD.top + plotH - (Math.max(0, v) / max) * plotH;

  return (
    <svg
      class={`nuo-chart nuo-bar-chart${animate ? ' nuo-chart--animate' : ''}`}
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="xMidYMid meet"
    >
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--line)" stroke-width="1" />
      {data.map((d, i) => {
        const v = Number.isFinite(d.value) ? d.value : 0;
        const cx = PAD.left + slot * i + slot / 2;
        const top = y(v);
        const main = d.color ?? color;
        const muted = hasHighlight && !d.highlight && !d.color;
        const showValue = v > 0 && (!crowded || d.highlight || v === maxVal);
        return (
          <g key={`${d.label}-${i}`}>
            <rect
              class={`nuo-bar${d.highlight ? ' nuo-bar--hl' : ''}`}
              x={cx - barW / 2}
              y={top}
              width={barW}
              height={Math.max(0, y(0) - top)}
              rx="3"
              fill={muted && mutedColor ? mutedColor : main}
              fill-opacity={muted && !mutedColor ? 0.35 : 1}
              style={{ animationDelay: `${Math.min(i, 20) * 15}ms` }}
            />
            {showValue ? (
              <text class="nuo-bar-value num" x={cx} y={top - 5} text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">
                {formatter(v)}
              </text>
            ) : null}
            {!crowded || i % Math.ceil(n / 8) === 0 || d.highlight ? (
              <text class="nuo-axis-label" x={cx} y={height - 6} text-anchor="middle" font-size="11" fill="var(--ink-2)">
                {d.label}
              </text>
            ) : null}
          </g>
        );
      })}
      {target !== undefined ? (
        <g>
          <line class="nuo-target" x1={PAD.left} x2={W - PAD.right} y1={y(target)} y2={y(target)} stroke="var(--ink-2)" stroke-width="1.5" stroke-dasharray="5 4" />
          {targetLabel ? (
            <text x={W - PAD.right} y={y(target) - 4} text-anchor="end" font-size="11" fill="var(--ink-2)">{targetLabel}</text>
          ) : null}
        </g>
      ) : null}
    </svg>
  );
}
