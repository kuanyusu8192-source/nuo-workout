import { fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BarChart, ChartWithTable, LineChart } from '.';

const bars = [
  { label: '一', value: 0 },
  { label: '二', value: 4200 },
  { label: '三', value: 3100, highlight: true },
  { label: '四', value: 0 },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BarChart', () => {
  it('每筆資料一根柱，role=img 並有說明', () => {
    const { container } = render(<BarChart data={bars} ariaLabel="本週容量" />);
    expect(screen.getByRole('img', { name: '本週容量' })).toBeTruthy();
    expect(container.querySelectorAll('.nuo-bar').length).toBe(4);
  });
  it('柱頂標數值（只標 > 0），可傳 formatter', () => {
    const { container } = render(<BarChart data={bars} ariaLabel="容量" formatter={(v) => `${v} kg`} />);
    const texts = [...container.querySelectorAll('.nuo-bar-value')].map((t) => t.textContent);
    expect(texts).toEqual(['4200 kg', '3100 kg']);
  });
  it('有 highlight 時今天用主色、其他變淺；沒有時全部主色', () => {
    const { container, rerender } = render(<BarChart data={bars} ariaLabel="容量" color="#2471a3" />);
    const rects = [...container.querySelectorAll('.nuo-bar')];
    expect(rects[2].getAttribute('fill')).toBe('#2471a3');
    expect(rects[2].getAttribute('fill-opacity')).toBe('1');
    expect(rects[1].getAttribute('fill-opacity')).toBe('0.35');
    rerender(<BarChart data={bars.map((b) => ({ ...b, highlight: false }))} ariaLabel="容量" />);
    expect([...container.querySelectorAll('.nuo-bar')].every((r) => r.getAttribute('fill-opacity') === '1')).toBe(true);
    rerender(<BarChart data={bars} ariaLabel="容量" color="#2471a3" mutedColor="#a9cce3" />);
    expect(container.querySelectorAll('.nuo-bar')[1].getAttribute('fill')).toBe('#a9cce3');
  });
  it('單柱可覆寫顏色（超標）；目標虛線', () => {
    const { container } = render(
      <BarChart data={[{ label: '一', value: 2500, color: 'var(--danger-600)' }, { label: '二', value: 1800 }]} target={2200} targetLabel="目標 2200" ariaLabel="熱量" />,
    );
    expect(container.querySelectorAll('.nuo-bar')[0].getAttribute('fill')).toBe('var(--danger-600)');
    const t = container.querySelector('.nuo-target')!;
    expect(t.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(container.textContent).toContain('目標 2200');
  });
  it('高度固定；全部為 0 或空資料不會產生 NaN', () => {
    const { container } = render(<BarChart data={[{ label: 'a', value: 0 }]} height={160} ariaLabel="空" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('height')).toBe('160');
    expect(svg.outerHTML).not.toContain('NaN');
    const r2 = render(<BarChart data={[]} ariaLabel="空" />);
    expect(r2.container.innerHTML).not.toContain('NaN');
  });
  it('較多柱（月視圖）不會每根都標值，仍渲染全部柱', () => {
    const data = Array.from({ length: 30 }, (_, i) => ({ label: String(i + 1), value: i % 3 === 0 ? 0 : 1000 + i * 10 }));
    const { container } = render(<BarChart data={data} ariaLabel="月容量" />);
    expect(container.querySelectorAll('.nuo-bar').length).toBe(30);
    expect(container.querySelectorAll('.nuo-bar-value').length).toBeLessThanOrEqual(2);
  });
  it('prefers-reduced-motion 時不加進場動畫 class', () => {
    const { container, rerender } = render(<BarChart data={bars} ariaLabel="容量" />);
    expect(container.querySelector('svg')!.getAttribute('class')).toContain('nuo-chart--animate');
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    rerender(<BarChart data={[...bars]} ariaLabel="容量" />);
    expect(container.querySelector('svg')!.getAttribute('class')).not.toContain('nuo-chart--animate');
  });
});

const pts = [
  { label: '9/1', value: 60 },
  { label: '9/8', value: 62.5 },
  { label: '9/15', value: 65, isPr: true },
  { label: '9/22', value: 64 },
];

describe('LineChart', () => {
  it('每筆資料一個點與一條折線', () => {
    const { container } = render(<LineChart data={pts} ariaLabel="e1RM" />);
    expect(screen.getByRole('img', { name: 'e1RM' })).toBeTruthy();
    expect(container.querySelectorAll('.nuo-point').length).toBe(4);
    expect(container.querySelectorAll('.nuo-line').length).toBe(1);
    expect(container.querySelector('.nuo-area')).toBeNull();
  });
  it('PR 點為綠色並標示文字', () => {
    const { container } = render(<LineChart data={pts} ariaLabel="e1RM" formatter={(v) => `${v}kg`} />);
    const pr = container.querySelectorAll('.nuo-point--pr');
    expect(pr.length).toBe(1);
    expect(pr[0].getAttribute('fill')).toBe('var(--success)');
    expect(container.querySelector('.nuo-pr-label')?.textContent).toBe('PR 65kg');
  });
  it('area 時畫 20% 透明面積；有目標線時畫虛線', () => {
    const { container } = render(<LineChart data={pts} area target={70} targetLabel="目標 70" ariaLabel="體重" />);
    expect(container.querySelector('.nuo-area')?.getAttribute('fill-opacity')).toBe('0.2');
    expect(container.querySelector('.nuo-target')?.getAttribute('stroke-dasharray')).toBeTruthy();
  });
  it('單點、空資料、全部相同值都不產生 NaN', () => {
    for (const data of [[], [{ label: 'a', value: 5 }], [{ label: 'a', value: 5 }, { label: 'b', value: 5 }]]) {
      const { container, unmount } = render(<LineChart data={data} ariaLabel="x" />);
      expect(container.innerHTML).not.toContain('NaN');
      unmount();
    }
  });
  it('略過非有限值', () => {
    const { container } = render(<LineChart data={[{ label: 'a', value: 1 }, { label: 'b', value: NaN }, { label: 'c', value: 3 }]} ariaLabel="x" />);
    expect(container.querySelectorAll('.nuo-point').length).toBe(2);
    expect(container.innerHTML).not.toContain('NaN');
  });
  it('prefers-reduced-motion 時不加進場動畫 class', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    const { container } = render(<LineChart data={pts} ariaLabel="x" />);
    expect(container.querySelector('svg')!.getAttribute('class')).not.toContain('nuo-chart--animate');
  });
});

describe('ChartWithTable', () => {
  const rows = [['一', 0], ['二', 4200], ['三', 3100]];
  it('預設隱藏表格；切換後顯示 <table> 並含表頭與全部列', () => {
    render(
      <ChartWithTable title="本週容量" headers={['日期', '容量 (kg)']} rows={rows}>
        <BarChart data={bars} ariaLabel="本週容量" />
      </ChartWithTable>,
    );
    expect(screen.queryByRole('table')).toBeNull();
    const toggle = screen.getByRole('button', { name: '顯示表格' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    const table = screen.getByRole('table', { name: '本週容量' });
    expect(table.querySelectorAll('tbody tr').length).toBe(3);
    expect(table.querySelectorAll('th[scope="col"]').length).toBe(2);
    expect(screen.getByRole('button', { name: '隱藏表格' }).getAttribute('aria-expanded')).toBe('true');
    expect(table.textContent).toContain('4200');
    fireEvent.click(screen.getByRole('button', { name: '隱藏表格' }));
    expect(screen.queryByRole('table')).toBeNull();
  });
  it('切換鈕高度規則在 ui.css（見 ui.css.test）；圖表仍在', () => {
    render(
      <ChartWithTable title="體重" headers={['日期', '體重']} rows={[]}>
        <LineChart data={pts} ariaLabel="體重" />
      </ChartWithTable>,
    );
    expect(screen.getByRole('img', { name: '體重' })).toBeTruthy();
  });
});
