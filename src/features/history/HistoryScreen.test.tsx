import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import type { Repos } from '../../data/repos/interfaces';
import { createMemoryRepos } from '../../data/repos';
import type { Exercise } from '../../data/types';
import { seedEmptyData, seedFakeData } from '../../dev/fakeData';
import { renderWithApp } from '../../test/helpers';
import { HistoryScreen } from './HistoryScreen';

const TODAY = '2026-10-16'; // 星期五
const ex = (id: string, name: string, category: string, trackingType: Exercise['trackingType']): Exercise => ({
  id, name, nameEn: id, category, equipment: '', primaryMuscle: '', secondaryMuscles: [],
  trackingType, steps: [], tips: '', gifFile: '', source: 'nuo',
});
const EXERCISES = [
  ex('bench', '槓鈴臥推', '胸', 'strength'),
  ex('squat', '深蹲', '臀腿', 'strength'),
  ex('run', '跑步機', '有氧', 'cardio'),
  ex('stretch1', '胸肌伸展', '伸展', 'stretch'),
];

type S = { exerciseId: string; kind?: 'strength' | 'cardio' | 'stretch'; weightKg?: number; reps?: number; durationSec?: number; speed?: number };
async function addDay(repos: Repos, date: string, sets: S[]) {
  const t0 = new Date(`${date}T18:00:00`).getTime();
  const session = await repos.sessions.create({ date, mode: 'gear', startedAt: t0 });
  let i = 0;
  for (const x of sets) {
    await repos.sets.add({ sessionId: session.id, setIndex: i, kind: x.kind ?? 'strength', createdAt: t0 + i * 1000, ...x });
    i++;
  }
  return session;
}
async function base(): Promise<Repos> {
  const repos = createMemoryRepos();
  await seedEmptyData(repos, { today: TODAY, exercises: EXERCISES });
  return repos;
}
const show = (repos: Repos) => renderWithApp(<HistoryScreen />, repos, { today: TODAY });
const barValues = (c: ParentNode) => [...c.querySelectorAll('.nuo-bar-value')].map((t) => t.textContent);
const goTab = async (name: string) => fireEvent.click(await screen.findByRole('tab', { name }));

describe('標頭與分頁', () => {
  it('三個分頁：訓練（預設）／日曆／飲食與體重', async () => {
    show(await base());
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['訓練', '日曆', '飲食與體重']);
    expect(screen.getByRole('tab', { name: '訓練' }).getAttribute('aria-selected')).toBe('true');
    await goTab('日曆');
    expect(await screen.findByRole('group', { name: '連續訓練週數' })).toBeTruthy();
    await goTab('飲食與體重');
    expect(await screen.findByText('目前體重')).toBeTruthy();
  });
});

describe('訓練分頁：柱狀圖', () => {
  async function seeded() {
    const repos = await base();
    await addDay(repos, '2026-10-12', [{ exerciseId: 'bench', weightKg: 50, reps: 10 }]); // 500
    await addDay(repos, '2026-10-14', [{ exerciseId: 'bench', weightKg: 60, reps: 5 }]); // 300
    await addDay(repos, TODAY, [{ exerciseId: 'bench', weightKg: 40, reps: 10 }, { exerciseId: 'run', kind: 'cardio', durationSec: 1800 }]); // 400 + 30 分
    await addDay(repos, '2026-09-30', [{ exerciseId: 'squat', weightKg: 100, reps: 10 }]); // 1000（上個月）
    return repos;
  }

  it('週視圖：週一到週日 7 柱，標值，今天用主色其他淺色', async () => {
    const { container } = show(await seeded());
    await waitFor(() => expect(barValues(container)).toEqual(['500', '300', '400']));
    const chart = screen.getByRole('img', { name: /本週.*重訓容量/ });
    const rects = [...chart.querySelectorAll('.nuo-bar')];
    expect(rects).toHaveLength(7);
    expect(rects[4].getAttribute('fill-opacity')).toBe('1'); // 週五 = 今天
    expect(rects[0].getAttribute('fill-opacity')).toBe('0.35');
    expect([...chart.querySelectorAll('.nuo-axis-label')].map((t) => t.textContent)).toEqual(['一', '二', '三', '四', '五', '六', '日']);
  });

  it('附「顯示表格」，表格有精確數值', async () => {
    const { container } = show(await seeded());
    await waitFor(() => expect(barValues(container)).toContain('500'));
    fireEvent.click(screen.getAllByRole('button', { name: '顯示表格' })[0]);
    const table = screen.getByRole('table');
    expect(table.textContent).toContain('2026-10-12');
    expect(table.textContent).toContain('500');
  });

  it('月視圖：當月 31 柱，不含上月資料', async () => {
    const { container } = show(await seeded());
    await waitFor(() => expect(barValues(container)).toContain('500'));
    fireEvent.click(screen.getByRole('radio', { name: '月' }));
    await waitFor(() => expect(screen.getByRole('img', { name: /本月/ }).querySelectorAll('.nuo-bar')).toHaveLength(31));
    expect(barValues(container)).not.toContain('1000');
  });

  it('年視圖：12 柱，9 月 1000、10 月合計 1200', async () => {
    const { container } = show(await seeded());
    await waitFor(() => expect(barValues(container)).toContain('500'));
    fireEvent.click(screen.getByRole('radio', { name: '年' }));
    await waitFor(() => expect(screen.getByRole('img', { name: /今年/ }).querySelectorAll('.nuo-bar')).toHaveLength(12));
    expect(barValues(container)).toEqual(['1000', '1200']);
  });

  it('重訓／有氧切換：有氧顯示分鐘', async () => {
    const { container } = show(await seeded());
    await waitFor(() => expect(barValues(container)).toContain('500'));
    fireEvent.click(screen.getByRole('radio', { name: '有氧' }));
    await waitFor(() => expect(barValues(container)).toEqual(['30']));
    expect(screen.getByRole('img', { name: /有氧/ })).toBeTruthy();
  });
});

describe('訓練分頁：力量突破', () => {
  it('預估 1RM：40kg×10 → 53.3；動作下拉只列有力量紀錄的動作', async () => {
    const repos = await base();
    await addDay(repos, '2026-10-10', [
      { exerciseId: 'bench', weightKg: 40, reps: 10 },
      { exerciseId: 'run', kind: 'cardio', durationSec: 600 },
      { exerciseId: 'stretch1', kind: 'stretch', durationSec: 30 },
    ]);
    show(repos);
    const card = await screen.findByRole('region', { name: '力量突破' });
    await waitFor(() => expect(within(card).getByTestId('e1rm-value').textContent).toBe('53.3'));
    expect(within(card).getByTestId('e1rm-value').className).toContain('num');
    const select = within(card).getByLabelText('動作') as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual(['槓鈴臥推']);
  });

  it('資料不足（只有一天）顯示提示，不畫趨勢圖', async () => {
    const repos = await base();
    await addDay(repos, '2026-10-10', [{ exerciseId: 'bench', weightKg: 40, reps: 10 }]);
    show(repos);
    const card = await screen.findByRole('region', { name: '力量突破' });
    await waitFor(() => expect(within(card).getByText('再記錄一次即可顯示趨勢')).toBeTruthy());
    expect(within(card).queryByRole('img', { name: /e1RM 趨勢/ })).toBeNull();
  });

  it('多日：畫趨勢圖、PR 點與「新高」標籤只出現在創新高的日子', async () => {
    const repos = await base();
    await addDay(repos, '2026-10-01', [{ exerciseId: 'bench', weightKg: 40, reps: 10 }]); // 53.3 新高（首筆）
    await addDay(repos, '2026-10-05', [{ exerciseId: 'bench', weightKg: 30, reps: 10 }]); // 40 未破
    await addDay(repos, '2026-10-10', [{ exerciseId: 'bench', weightKg: 50, reps: 10 }]); // 66.7 新高
    show(repos);
    const card = await screen.findByRole('region', { name: '力量突破' });
    const chart = await within(card).findByRole('img', { name: /e1RM 趨勢/ });
    expect(chart.querySelectorAll('.nuo-point')).toHaveLength(3);
    expect(chart.querySelectorAll('.nuo-point--pr')).toHaveLength(2);
    expect(within(card).getAllByText('新高')).toHaveLength(2);
    expect(within(card).getByTestId('e1rm-value').textContent).toBe('66.7');
    expect(within(card).getByText(/50 kg × 10/)).toBeTruthy();
  });

  it('切換動作會更新數字', async () => {
    const repos = await base();
    await addDay(repos, '2026-10-01', [{ exerciseId: 'bench', weightKg: 40, reps: 10 }, { exerciseId: 'squat', weightKg: 100, reps: 1 }]);
    show(repos);
    const card = await screen.findByRole('region', { name: '力量突破' });
    await waitFor(() => expect(within(card).getByLabelText('動作')).toBeTruthy());
    fireEvent.change(within(card).getByLabelText('動作'), { target: { value: 'squat' } });
    await waitFor(() => expect(within(card).getByTestId('e1rm-value').textContent).toBe('100'));
  });

  it('空資料：顯示空狀態、沒有柱值', async () => {
    const repos = await base();
    const { container } = show(repos);
    expect(await screen.findByText('尚無力量紀錄')).toBeTruthy();
    expect(barValues(container)).toEqual([]);
    expect(container.querySelectorAll('.nuo-bar')).toHaveLength(7);
  });
});

const metric = (name: string) => within(screen.getByRole('group', { name })).getByTestId('metric-value').textContent;

describe('日曆分頁', () => {
  async function seeded() {
    const repos = await base();
    await addDay(repos, '2026-10-14', [{ exerciseId: 'squat', weightKg: 100, reps: 5 }, { exerciseId: 'squat', weightKg: 100, reps: 5 }]); // 2 組 → 37 kcal
    await addDay(repos, TODAY, [1, 2, 3, 4].map(() => ({ exerciseId: 'bench', weightKg: 40, reps: 10 }))); // 4 組 → 74 kcal
    await addDay(repos, '2026-09-20', [{ exerciseId: 'bench', weightKg: 40, reps: 10 }]);
    return repos;
  }

  it('三個指標：連續週數、本月訓練天數、本月總消耗（體重 74kg）', async () => {
    show(await seeded());
    await goTab('日曆');
    await waitFor(() => expect(metric('本月訓練天數')).toBe('2'));
    expect(metric('連續訓練週數')).toBe('1'); // 10/12 週有；10/5 週沒有
    expect(metric('本月總消耗')).toBe('111');
  });

  it('burnOverrides 優先於自動計算', async () => {
    const repos = await seeded();
    await repos.burnOverrides.set(TODAY, 500);
    show(repos);
    await goTab('日曆');
    await waitFor(() => expect(metric('本月總消耗')).toBe('537')); // 500 + 37
  });

  it('缺體重顯示「—」', async () => {
    const repos = createMemoryRepos();
    await repos.exercises.bulkPut(EXERCISES);
    await addDay(repos, TODAY, [{ exerciseId: 'bench', weightKg: 40, reps: 10 }]);
    show(repos);
    await goTab('日曆');
    await waitFor(() => expect(metric('本月訓練天數')).toBe('1'));
    expect(metric('本月總消耗')).toBe('—');
  });

  it('刪光資料後歸零（迴歸）', async () => {
    const repos = createMemoryRepos();
    await seedFakeData(repos, { today: TODAY });
    const first = show(repos);
    await goTab('日曆');
    await waitFor(() => expect(Number(metric('本月訓練天數'))).toBeGreaterThan(0));
    expect(Number(metric('連續訓練週數'))).toBeGreaterThan(0);
    first.unmount();
    for (const s of await repos.sessions.listByRange({})) await repos.sessions.remove(s.id);
    show(repos);
    await goTab('日曆');
    await waitFor(() => expect(metric('本月訓練天數')).toBe('0'));
    expect(metric('連續訓練週數')).toBe('0');
    expect(metric('本月總消耗')).toBe('0');
    expect(document.querySelectorAll('.hist-dot')).toHaveLength(0);
  });

  it('月曆週一起、31 天；有訓練的日子有實心點；今天有 aria-current', async () => {
    show(await seeded());
    await goTab('日曆');
    const grid = await screen.findByRole('grid', { name: '2026 年 10 月' });
    expect([...grid.querySelectorAll('[role=columnheader]')].map((h) => h.textContent)).toEqual(['一', '二', '三', '四', '五', '六', '日']);
    expect(grid.querySelectorAll('button.hist-day')).toHaveLength(31);
    await waitFor(() => expect(grid.querySelectorAll('.hist-dot')).toHaveLength(2));
    const today = within(grid).getByRole('gridcell', { name: /10 月 16 日/ });
    expect(today.getAttribute('aria-current')).toBe('date');
    expect(today.getAttribute('aria-label')).toContain('今天');
    expect(today.getAttribute('aria-label')).toContain('有訓練');
    // 2026-10-01 是星期四 → 前面有 3 個空格
    expect(grid.querySelectorAll('.hist-day--blank')).toHaveLength(3);
  });

  it('點日期展開摘要：肌群、動作數·組數·容量、時長、kcal；查看詳情列出各組', async () => {
    show(await seeded());
    await goTab('日曆');
    fireEvent.click(await screen.findByRole('gridcell', { name: /10 月 16 日/ }));
    const card = await screen.findByRole('region', { name: /2026-10-16 摘要/ });
    await waitFor(() => expect(card.textContent).toContain('74 kcal'));
    expect(card.textContent).toContain('胸');
    expect(card.textContent).toContain('1 個動作');
    expect(card.textContent).toContain('4 組');
    expect(card.textContent).toContain('1,600 kg');
    expect(card.textContent).toMatch(/時長/);
    expect(within(card).queryByText(/40 kg × 10/)).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: '查看詳情' }));
    expect(within(card).getAllByText(/40 kg × 10/)).toHaveLength(4);
    expect(within(card).getByText('槓鈴臥推')).toBeTruthy();
  });

  it('點沒訓練的日子顯示「這天沒有訓練紀錄」', async () => {
    show(await seeded());
    await goTab('日曆');
    fireEvent.click(await screen.findByRole('gridcell', { name: /10 月 3 日/ }));
    expect(await screen.findByText('這天沒有訓練紀錄')).toBeTruthy();
  });

  it('切換月份：上個月顯示 9 月；下個月回來', async () => {
    show(await seeded());
    await goTab('日曆');
    await screen.findByRole('grid', { name: '2026 年 10 月' });
    fireEvent.click(screen.getByRole('button', { name: '上個月' }));
    const grid = await screen.findByRole('grid', { name: '2026 年 9 月' });
    expect(grid.querySelectorAll('button.hist-day')).toHaveLength(30);
    await waitFor(() => expect(grid.querySelectorAll('.hist-dot')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: '下個月' }));
    expect(await screen.findByRole('grid', { name: '2026 年 10 月' })).toBeTruthy();
  });
});

describe('飲食與體重分頁', () => {
  async function dietRepos() {
    const repos = await base();
    const p = (await repos.profile.get())!;
    const { id: _id, ...rest } = p;
    await repos.profile.save({ ...rest, kcalTarget: 2200, macros: { proteinG: 150, carbG: 200, fatG: 70 } });
    const meal = (date: string, kcal: number, proteinG: number) =>
      repos.meals.add({ date, name: 'm', servings: 1, proteinG, carbG: 10, fatG: 5, kcal });
    await meal('2026-10-12', 2000, 140);
    await meal('2026-10-14', 1500, 100);
    await meal(TODAY, 1000, 60);
    await meal(TODAY, 1500, 70); // 今天 2500 超標；蛋白 130
    return repos;
  }

  it('本週熱量：長條＋目標虛線；超標柱用警示色並有文字', async () => {
    const { container } = show(await dietRepos());
    await goTab('飲食與體重');
    await waitFor(() => expect(barValues(container)).toEqual(['2000', '1500', '2500']));
    const chart = screen.getByRole('img', { name: /本週熱量/ });
    expect(chart.querySelector('.nuo-target')).toBeTruthy();
    expect(chart.textContent).toContain('目標 2200');
    const rects = [...chart.querySelectorAll('.nuo-bar')];
    expect(rects[4].getAttribute('fill')).toBe('var(--danger-600)');
    expect(rects[0].getAttribute('fill')).not.toBe('var(--danger-600)');
    expect(screen.getByText(/超標：週五/)).toBeTruthy();
  });

  it('指標切換：蛋白質改用 macros 目標，未超標不顯示超標文字', async () => {
    const { container } = show(await dietRepos());
    await goTab('飲食與體重');
    await waitFor(() => expect(barValues(container)).toContain('2500'));
    fireEvent.click(screen.getByRole('radio', { name: '蛋白質' }));
    await waitFor(() => expect(barValues(container)).toEqual(['140', '100', '130']));
    expect(screen.getByRole('img', { name: /本週蛋白質/ }).textContent).toContain('目標 150');
    expect(screen.queryByText(/超標：/)).toBeNull();
  });

  it('體重與體脂：目前值與歷史折線圖', async () => {
    const repos = await dietRepos();
    await repos.bodyMetrics.add({ date: '2026-10-01', weightKg: 75, bodyFatPct: 19 });
    await repos.bodyMetrics.add({ date: '2026-10-08', weightKg: 74.2 });
    await repos.bodyMetrics.add({ date: '2026-10-15', weightKg: 73.5, bodyFatPct: 18.4 });
    show(repos);
    await goTab('飲食與體重');
    await waitFor(() => expect(screen.getByTestId('current-weight').textContent).toContain('73.5'));
    expect(screen.getByTestId('current-bodyfat').textContent).toContain('18.4');
    const chart = screen.getByRole('img', { name: /體重歷史/ });
    expect(chart.querySelectorAll('.nuo-point')).toHaveLength(3);
    expect(screen.getByText(/較首筆.*1\.5 kg/)).toBeTruthy();
  });

  it('沒有體重紀錄：顯示引導文字，沒有圖', async () => {
    show(await base());
    await goTab('飲食與體重');
    expect(await screen.findByText('暫無體重紀錄，請先記錄您的第一次體重')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /體重歷史/ })).toBeNull();
    expect(screen.getByTestId('current-weight').textContent).toContain('—');
  });
});
