import { prefersReducedMotion } from './motion';

export interface LinePoint {
  label: string;
  value: number;
  /** 破紀錄：綠色圓點並標示「PR」 */
  isPr?: boolean;
}

export interface LineChartProps {
  data: ReadonlyArray<LinePoint>;
  height?: number;
  color?: string;
  /** 折線下方 20% 透明面積 */
  area?: boolean;
  formatter?: (v: number) => string;
  /** 虛線目標線 */
  target?: number;
  targetLabel?: string;
  ariaLabel: string;
}

const W = 340;
const PAD = { top: 24, bottom: 26, left: 8, right: 14 };

export function LineChart({ data, height = 200, color = 'var(--primary)', area = false, formatter = (v) => String(Math.round(v * 10) / 10), target, targetLabel, ariaLabel }: LineChartProps) {
  const pts = data.filter((d) => Number.isFinite(d.value));
  const values = pts.map((d) => d.value);
  if (target !== undefined) values.push(target);
  let lo = values.length ? Math.min(...values) : 0;
  let hi = values.length ? Math.max(...values) : 1;
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const padV = (hi - lo) * 0.1;
  lo -= padV;
  hi += padV;
  const plotH = height - PAD.top - PAD.bottom;
  const plotW = W - PAD.left - PAD.right;
  const x = (i: number) => PAD.left + (pts.length <= 1 ? plotW / 2 : (plotW * i) / (pts.length - 1));
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const areaPath = pts.length > 1 ? `${line} L${x(pts.length - 1).toFixed(1)} ${y(lo)} L${x(0).toFixed(1)} ${y(lo)} Z` : '';
  const animate = !prefersReducedMotion();
  const labelEvery = Math.max(1, Math.ceil(pts.length / 5));
  const last = pts.length - 1;

  return (
    <svg
      class={`nuo-chart nuo-line-chart${animate ? ' nuo-chart--animate' : ''}`}
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="xMidYMid meet"
    >
      <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="var(--line)" stroke-width="1" />
      {area && areaPath ? <path class="nuo-area" d={areaPath} fill={color} fill-opacity="0.2" /> : null}
      {pts.length > 1 ? <path class="nuo-line" d={line} fill="none" stroke={color} stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" /> : null}
      {target !== undefined ? (
        <g>
          <line class="nuo-target" x1={PAD.left} x2={W - PAD.right} y1={y(target)} y2={y(target)} stroke="var(--ink-2)" stroke-width="1.5" stroke-dasharray="5 4" />
          {targetLabel ? <text x={W - PAD.right} y={y(target) - 4} text-anchor="end" font-size="11" fill="var(--ink-2)">{targetLabel}</text> : null}
        </g>
      ) : null}
      {pts.map((p, i) => (
        <g key={`${p.label}-${i}`}>
          <circle
            class={`nuo-point${p.isPr ? ' nuo-point--pr' : ''}`}
            cx={x(i)}
            cy={y(p.value)}
            r={p.isPr ? 6 : 3.5}
            fill={p.isPr ? 'var(--success)' : color}
            stroke="var(--card)"
            stroke-width="1.5"
          />
          {p.isPr ? (
            <text class="nuo-pr-label" x={x(i)} y={y(p.value) - 10} text-anchor="middle" font-size="11" font-weight="700" fill="var(--success-600)">
              PR {formatter(p.value)}
            </text>
          ) : null}
          {i % labelEvery === 0 || i === last ? (
            <text class="nuo-axis-label" x={x(i)} y={height - 8} text-anchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} font-size="11" fill="var(--ink-2)">
              {p.label}
            </text>
          ) : null}
        </g>
      ))}
      {pts.length > 0 ? (
        <text class="nuo-last-value num" x={x(last)} y={y(pts[last].value) - (pts[last].isPr ? 24 : 10)} text-anchor="end" font-size="12" font-weight="600" fill="var(--ink)">
          {formatter(pts[last].value)}
        </text>
      ) : null}
    </svg>
  );
}
