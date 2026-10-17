import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadBundledExercises } from '../../data/exercise-source';
import { createMemoryRepos } from '../../data/repos';
import type { Repos } from '../../data/repos/interfaces';
import type { Exercise } from '../../data/types';
import { seedEmptyData } from '../../dev/fakeData';
import { renderWithApp } from '../../test/helpers';
import { ExerciseDetail } from './ExerciseDetail';

let all: Exercise[];
beforeAll(async () => {
  all = await loadBundledExercises();
});

const BENCH = 'vx-0025';
const RUN = 'vx-0685';

async function addSets(repos: Repos, exerciseId: string, date: string, rows: Array<[number, number]>) {
  const session = await repos.sessions.create({ date, mode: 'gear' });
  let i = 0;
  for (const [w, r] of rows) {
    await repos.sets.add({ sessionId: session.id, exerciseId, setIndex: i++, kind: 'strength', weightKg: w, reps: r });
  }
}

async function setup(exerciseId = BENCH, initialTab?: 'tutorial' | 'record' | 'chart' | 'history', withData = true, extra?: (repos: Repos) => Promise<void>) {
  const repos = createMemoryRepos();
  await seedEmptyData(repos, { exercises: all });
  if (withData) {
    await addSets(repos, BENCH, '2026-03-01', [[50, 10]]); // 3 個月以外
    await addSets(repos, BENCH, '2026-09-01', [[60, 10], [60, 8]]);
    await addSets(repos, BENCH, '2026-09-08', [[70, 5]]);
    await addSets(repos, BENCH, '2026-09-15', [[50, 12]]);
  }
  await extra?.(repos);
  let closed = 0;
  renderWithApp(
    <ExerciseDetail exerciseId={exerciseId} initialTab={initialTab} onClose={() => closed++} />,
    repos,
    { today: '2026-10-16' },
  );
  await screen.findByRole('tablist');
  return { repos, closed: () => closed };
}

const showAllTables = async () => {
  for (const b of await screen.findAllByRole('button', { name: '顯示表格' })) fireEvent.click(b);
};
const fig = (title: string) => screen.queryAllByRole('figure').find((f) => f.querySelector('figcaption')?.textContent === title) ?? null;
const findFig = async (title: string) => waitFor(() => expect(fig(title)).not.toBeNull());
const tableOf = (title: string) => within(fig(title) as HTMLElement).getByRole('table');

describe('ExerciseDetail 教學', () => {
  it('預設教學分頁：動作名、肌群、器材、步驟、教練提示', async () => {
    await setup();
    const ex = all.find((e) => e.id === BENCH)!;
    expect(await screen.findByRole('heading', { level: 1, name: '槓鈴臥推' })).toBeTruthy();
    expect(screen.getByText(new RegExp(`主要肌群.*${ex.primaryMuscle}`))).toBeTruthy();
    expect(screen.getByText(/次要肌群/)).toBeTruthy();
    expect(screen.getByText(/器材.*槓鈴/)).toBeTruthy();
    expect(document.querySelectorAll('.exp-steps > li')).toHaveLength(ex.steps.length);
    expect(screen.getByText('教練提示')).toBeTruthy();
    const img = document.querySelector<HTMLImageElement>('img.exp-gif')!;
    expect(img.getAttribute('src')).toBe(`gifs/${ex.gifFile}`);
  });

  it('沒有 GIF 的動作顯示占位', async () => {
    const noGif = all.find((e) => !e.gifFile)!;
    await setup(noGif.id, undefined, false);
    await screen.findByRole('heading', { level: 1, name: noGif.name });
    expect(document.querySelector('img.exp-gif')).toBeNull();
    expect(document.querySelector('.exp-gif--placeholder')).toBeTruthy();
  });

  it('找不到動作時顯示提示；返回鈕呼叫 onClose', async () => {
    const { closed } = await setup('zzz', undefined, false);
    await screen.findByText('找不到這個動作');
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(closed()).toBe(1);
  });
});

describe('ExerciseDetail 紀錄', () => {
  it('顯示最近一次紀錄摘要與前往今日訓練連結', async () => {
    await setup(BENCH, 'record');
    await screen.findByText('2026-09-15');
    expect(screen.getByText(/50 kg × 12/)).toBeTruthy();
    const link = screen.getByRole('link', { name: '前往今日訓練' });
    expect(link.getAttribute('href')).toBe('#/today');
  });

  it('沒有紀錄時有說明', async () => {
    await setup(BENCH, 'record', false);
    await screen.findByText('還沒有此動作的紀錄');
    expect(screen.getByText(/在今日訓練記錄這個動作/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '前往今日訓練' })).toBeTruthy();
  });
});

describe('ExerciseDetail 圖表', () => {
  it('預設 3 個月：四張圖，資料正確（e1RM、容量、最大次數、總次數）', async () => {
    await setup(BENCH, 'chart');
    await findFig('力量突破（預估 1RM，kg）');
    await showAllTables();
    const e = tableOf('力量突破（預估 1RM，kg）');
    expect(within(e).getByText('2026-09-01').closest('tr')!.textContent).toContain('80');
    expect(within(e).getByText('2026-09-08').closest('tr')!.textContent).toContain('81.7');
    expect(within(e).queryByText('2026-03-01')).toBeNull();
    const v = tableOf('總訓練容量（kg）');
    expect(within(v).getByText('2026-09-01').closest('tr')!.textContent).toContain('1080');
    expect(within(v).getByText('2026-09-08').closest('tr')!.textContent).toContain('350');
    const m = tableOf('最大次數');
    expect(within(m).getByText('2026-09-01').closest('tr')!.textContent).toContain('10');
    const t = tableOf('總訓練次數');
    expect(within(t).getByText('2026-09-01').closest('tr')!.textContent).toContain('18');
    // PR 點：09-01（80 > 3 月的 66.7）與 09-08（81.7）；09-15 不是
    expect(document.querySelectorAll('.nuo-point--pr')).toHaveLength(2);
  });

  it('期間切換：全部會包含 3 個月以外的資料', async () => {
    await setup(BENCH, 'chart');
    fireEvent.click(await screen.findByRole('radio', { name: '全部' }));
    await showAllTables();
    await waitFor(() => expect(within(tableOf('總訓練容量（kg）')).getByText('2026-03-01')).toBeTruthy());
  });

  it('無資料顯示引導文字', async () => {
    await setup(BENCH, 'chart', false);
    await screen.findByText('暫無此動作之訓練數據，完成一次訓練即可顯示趨勢');
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it('有氧動作改顯示時間／距離／速度', async () => {
    await setup(RUN, 'chart', false, async (repos) => {
      const s = await repos.sessions.create({ date: '2026-09-10', mode: 'gear' });
      await repos.sets.add({ sessionId: s.id, exerciseId: RUN, setIndex: 0, kind: 'cardio', durationSec: 1800, distanceM: 5000, speed: 10 });
    });
    await findFig('時間（分鐘）');
    expect(fig('距離（公里）')).not.toBeNull();
    expect(fig('平均速度（km/h）')).not.toBeNull();
    expect(screen.queryByText(/力量突破/)).toBeNull();
  });

  it('有氧動作只有時間資料時隱藏距離與速度圖', async () => {
    await setup(RUN, 'chart', false, async (repos) => {
      const s = await repos.sessions.create({ date: '2026-09-10', mode: 'gear' });
      await repos.sets.add({ sessionId: s.id, exerciseId: RUN, setIndex: 0, kind: 'cardio', durationSec: 600 });
    });
    await findFig('時間（分鐘）');
    expect(fig('距離（公里）')).toBeNull();
    expect(fig('平均速度（km/h）')).toBeNull();
  });
});

describe('ExerciseDetail 歷史', () => {
  it('個人紀錄與紀錄歷程（依日期新到舊）', async () => {
    await setup(BENCH, 'history');
    await screen.findByText('個人紀錄');
    const pr = (label: string) => screen.getByText(label).parentElement!.textContent!;
    expect(pr('最大次數')).toContain('12 次');
    expect(pr('最大重量')).toContain('70 kg');
    expect(pr('最高總容量')).toContain('1,080 kg');
    const dates = Array.from(document.querySelectorAll('.exp-log__date')).map((d) => d.textContent);
    expect(dates).toEqual(['2026-09-15', '2026-09-08', '2026-09-01', '2026-03-01']);
    const sep1 = document.querySelectorAll('.exp-log__day')[2];
    expect(sep1.textContent).toContain('60 kg × 10');
    expect(sep1.textContent).toContain('60 kg × 8');
  });

  it('無資料個人紀錄顯示「—」', async () => {
    await setup(BENCH, 'history', false);
    await screen.findByText('個人紀錄');
    expect(screen.getByText('最大次數').parentElement!.textContent).toContain('—');
    expect(screen.getByText('最高總容量').parentElement!.textContent).toContain('—');
    expect(screen.getByText('還沒有訓練紀錄')).toBeTruthy();
  });
});

describe('ExerciseDetail 分頁', () => {
  it('可切換四個分頁', async () => {
    await setup();
    for (const name of ['紀錄', '圖表', '歷史', '教學']) {
      fireEvent.click(screen.getByRole('tab', { name }));
      await waitFor(() => expect(screen.getByRole('tab', { name }).getAttribute('aria-selected')).toBe('true'));
    }
  });
});
