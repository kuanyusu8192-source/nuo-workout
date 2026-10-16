import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { useEffect } from 'preact/hooks';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { dispatchBackEvent, installBackHandling } from '../../app/back';
import { AppStateProvider, ReposProvider, useAppState } from '../../app/context';
import { ToastProvider } from '../../components';
import { createMemoryRepos } from '../../data/repos';
import type { Repos } from '../../data/repos/interfaces';
import { loadBundledExercises } from '../../data/exercise-source';
import { seedExercises } from '../../data/seed';
import type { Exercise } from '../../data/types';
import { seedEmptyData, seedFakeData } from '../../dev/fakeData';
import type { AppMode } from '../shared';
import { TodayWorkout } from './TodayWorkout';

// 動作選擇是別人負責的畫面（目前是占位）；這裡換成會呼叫 onSelect 的替身
vi.mock('../exercises/ExercisePicker', async () => {
  const { h } = await import('preact');
  const ids = ['vx-0025', 'vx-0032', 'vx-0685', 'nuo-bw-plank'];
  return {
    ExercisePicker: (p: { onSelect?: (id: string) => void; onClose: () => void }) =>
      h('div', { 'data-testid': 'picker' }, ids.map((id) => h('button', { key: id, type: 'button', onClick: () => p.onSelect?.(id) }, `選擇 ${id}`))),
  };
});

const TODAY = '2026-10-16'; // 週五 → 器材版排「腿與有氧」
const IDS = [
  'vx-0025', 'nuo-db-incline', 'vx-0334', 'nuo-db-tri-ext', 'vx-0027', 'nuo-db-row-one', 'nuo-db-curl', 'vx-0032',
  'nuo-db-goblet', 'nuo-db-lunge', 'vx-0685', 'vx-overlay_rowing_machine', 'nuo-bw-pushup', 'nuo-bw-squat',
  'nuo-bw-glute-bridge', 'nuo-bw-plank',
];
let exercises: Exercise[];
beforeAll(async () => {
  exercises = (await loadBundledExercises()).filter((e) => IDS.includes(e.id));
});

const fakeRepos = async () => {
  const repos = createMemoryRepos();
  await seedFakeData(repos, { today: TODAY, exercises });
  return repos;
};
const emptyRepos = async () => {
  const repos = createMemoryRepos();
  await seedEmptyData(repos, { today: TODAY, exercises });
  return repos;
};

function Setup({ mode, date }: { mode?: AppMode; date?: string }) {
  const app = useAppState();
  useEffect(() => {
    if (mode) app.setMode(mode);
    if (date) app.setSelectedDate(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderToday(repos: Repos, opts: { mode?: AppMode; date?: string } = {}) {
  return render(
    <ReposProvider repos={repos}>
      <AppStateProvider today={TODAY}>
        <ToastProvider>
          <Setup mode={opts.mode} date={opts.date} />
          <TodayWorkout />
        </ToastProvider>
      </AppStateProvider>
    </ReposProvider>,
  );
}

const fill = (root: HTMLElement, label: string, value: string) => {
  const input = within(root).getByLabelText(label) as HTMLInputElement;
  input.value = value;
  fireEvent.input(input);
};
const click = (name: string | RegExp, root: HTMLElement | typeof document.body = document.body) =>
  fireEvent.click(within(root as HTMLElement).getByRole('button', { name }));
const settle = (ms = 60) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const todaySession = async (repos: Repos) => (await repos.sessions.getByDate(TODAY))[0];
const setsOf = async (repos: Repos) => repos.sets.listBySession((await todaySession(repos)).id);

/** 自由訓練 → 新增動作（替身選擇器）→ 回傳該動作卡 */
async function addExercise(id: string, name: string, opts: { alreadyStarted?: boolean } = {}) {
  if (!opts.alreadyStarted) {
    fireEvent.click(await screen.findByRole('button', { name: '自由訓練' }));
    await screen.findByRole('button', { name: '完成訓練' }); // 等進入訓練畫面
  }
  fireEvent.click(await screen.findByRole('button', { name: '新增動作' }));
  fireEvent.click(await screen.findByRole('button', { name: `選擇 ${id}` }));
  fireEvent.click(await screen.findByRole('button', { name: '加入今日訓練' })); // 原版流程：選動作後先問加入／看教學
  return screen.findByRole('article', { name });
}

describe('開始訓練', () => {
  it('標頭顯示日期、模式與今日課表；從課表開始會建立今日 session 並帶入動作與空白組', async () => {
    const repos = await fakeRepos();
    renderToday(repos);
    expect(await screen.findByText(/2026-10-16/)).toBeTruthy();
    expect(screen.getByText('器材模式')).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: '開始訓練（腿與有氧）' }));
    const deadlift = await screen.findByRole('article', { name: '槓鈴硬舉' });
    expect(within(deadlift).getAllByLabelText(/^第\d組 重量/)).toHaveLength(4);
    expect(screen.getByRole('article', { name: '高腳杯深蹲' })).toBeTruthy();
    expect(screen.getByRole('article', { name: '跑步' })).toBeTruthy();

    const s = await todaySession(repos);
    expect(s.mode).toBe('gear');
    expect(s.templateId).toBeTruthy();
    expect(await repos.sets.listBySession(s.id)).toHaveLength(0); // 空白組不存
    // 歷史／教學／更多
    expect(within(deadlift).getByRole('button', { name: /動作教學/ })).toBeTruthy();
    expect(within(deadlift).getByRole('button', { name: /歷史紀錄/ })).toBeTruthy();
    expect(within(deadlift).getByRole('button', { name: /更多選項/ })).toBeTruthy();
  });

  it('沒有課表時顯示自由訓練與新增動作', async () => {
    const repos = await emptyRepos();
    renderToday(repos);
    expect(await screen.findByRole('button', { name: '自由訓練' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '新增動作' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^開始訓練/ })).toBeNull();
  });

  it('先按新增動作：自動建立 session 並加入該動作', async () => {
    const repos = await emptyRepos();
    renderToday(repos);
    fireEvent.click(await screen.findByRole('button', { name: '新增動作' }));
    fireEvent.click(await screen.findByRole('button', { name: '選擇 vx-0025' }));
    fireEvent.click(await screen.findByRole('button', { name: '加入今日訓練' }));
    expect(await screen.findByRole('article', { name: '槓鈴臥推' })).toBeTruthy();
    expect(await repos.sessions.getByDate(TODAY)).toHaveLength(1);
  });
});

describe('選好動作後：加入今日訓練／看教學（原版流程）', () => {
  it('選動作後先出現小對話框，確認前不建立 session；取消回到選擇器', async () => {
    const repos = await emptyRepos();
    renderToday(repos);
    fireEvent.click(await screen.findByRole('button', { name: '新增動作' }));
    fireEvent.click(await screen.findByRole('button', { name: '選擇 vx-0025' }));
    const dialog = await screen.findByRole('dialog', { name: '槓鈴臥推' });
    expect(within(dialog).getByRole('button', { name: '看教學' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '加入今日訓練' })).toBeTruthy();
    expect(await repos.sessions.getByDate(TODAY)).toHaveLength(0);
    expect(screen.queryByRole('article')).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: '關閉' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '槓鈴臥推' })).toBeNull());
    expect(screen.getByTestId('picker')).toBeTruthy(); // 選擇器還在，可以換一個
    expect(await repos.sessions.getByDate(TODAY)).toHaveLength(0);
  });

  it('看教學：開動作詳情面板；從面板可「加入今日訓練」', async () => {
    const repos = await emptyRepos();
    renderToday(repos);
    fireEvent.click(await screen.findByRole('button', { name: '新增動作' }));
    fireEvent.click(await screen.findByRole('button', { name: '選擇 vx-0025' }));
    fireEvent.click(await within(await screen.findByRole('dialog', { name: '槓鈴臥推' })).findByRole('button', { name: '看教學' }));

    const sheet = await screen.findByRole('dialog', { name: '槓鈴臥推' });
    expect(await within(sheet).findByRole('tablist')).toBeTruthy(); // ExerciseDetail 本體
    expect(await repos.sessions.getByDate(TODAY)).toHaveLength(0);
    fireEvent.click(within(sheet).getByRole('button', { name: '加入今日訓練' }));
    expect(await screen.findByRole('article', { name: '槓鈴臥推' })).toBeTruthy();
    expect(await repos.sessions.getByDate(TODAY)).toHaveLength(1);
  });

  it('看教學後關閉面板：回到對話框，仍未加入', async () => {
    const repos = await emptyRepos();
    renderToday(repos);
    fireEvent.click(await screen.findByRole('button', { name: '新增動作' }));
    fireEvent.click(await screen.findByRole('button', { name: '選擇 vx-0025' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: '槓鈴臥推' })).getByRole('button', { name: '看教學' }));
    const sheet = await screen.findByRole('dialog', { name: '槓鈴臥推' });
    fireEvent.click(within(sheet).getByRole('button', { name: '關閉' }));
    const back = await screen.findByRole('dialog', { name: '槓鈴臥推' });
    expect(within(back).getByRole('button', { name: '看教學' })).toBeTruthy();
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('訓練進行中新增動作也走同一流程', async () => {
    const repos = await emptyRepos();
    renderToday(repos);
    fireEvent.click(await screen.findByRole('button', { name: '自由訓練' }));
    await screen.findByRole('button', { name: '完成訓練' });
    fireEvent.click(await screen.findByRole('button', { name: '新增動作' }));
    fireEvent.click(await screen.findByRole('button', { name: '選擇 vx-0032' }));
    expect(screen.queryByRole('article')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: '加入今日訓練' }));
    expect((await screen.findAllByRole('article')).length).toBe(1);
  });
});

describe('每組填完就存', () => {
  it('重量與次數都填了才寫入；修改同一組是更新不是新增；並自動啟動休息計時', async () => {
    const repos = await fakeRepos();
    renderToday(repos);
    fireEvent.click(await screen.findByRole('button', { name: '開始訓練（腿與有氧）' }));
    const card = await screen.findByRole('article', { name: '槓鈴硬舉' });
    expect(screen.getByRole('button', { name: '開始休息計時' })).toBeTruthy();

    fill(card, '第1組 重量（kg）', '100');
    await settle();
    expect(await setsOf(repos)).toHaveLength(0); // 只填一半不存
    fill(card, '第1組 次數', '5');
    await waitFor(async () => expect(await setsOf(repos)).toHaveLength(1));
    const [saved] = await setsOf(repos);
    expect(saved).toMatchObject({ exerciseId: 'vx-0032', kind: 'strength', weightKg: 100, reps: 5 });
    expect(await screen.findByRole('button', { name: '暫停休息計時' })).toBeTruthy();

    fill(card, '第1組 次數', '6');
    await waitFor(async () => expect((await setsOf(repos))[0].reps).toBe(6));
    expect(await setsOf(repos)).toHaveLength(1);
  });

  it('休息計時：±30 秒、預設秒數來自設定', async () => {
    const repos = await fakeRepos();
    await repos.settings.patch({ restDefaultSec: 120 });
    renderToday(repos);
    fireEvent.click(await screen.findByRole('button', { name: '開始訓練（腿與有氧）' }));
    const rest = await screen.findByRole('timer', { name: '組間休息剩餘時間' });
    await waitFor(() => expect(rest.textContent).toBe('2:00'));
    click('休息加 30 秒');
    await waitFor(() => expect(rest.textContent).toBe('2:30'));
    click('休息減 30 秒');
    click('休息減 30 秒');
    await waitFor(() => expect(rest.textContent).toBe('1:30'));
  });

  it('加一組／減一組；減掉已存的那組會一併刪除', async () => {
    const repos = await emptyRepos();
    renderToday(repos);
    const card = await addExercise('vx-0025', '槓鈴臥推');
    expect(within(card).getAllByLabelText(/^第\d組 重量/)).toHaveLength(3);
    click('加一組', card);
    expect(within(card).getAllByLabelText(/^第\d組 重量/)).toHaveLength(4);
    fill(card, '第4組 重量（kg）', '50');
    fill(card, '第4組 次數', '5');
    await waitFor(async () => expect(await setsOf(repos)).toHaveLength(1));
    click('減一組', card);
    expect(within(card).getAllByLabelText(/^第\d組 重量/)).toHaveLength(3);
    await waitFor(async () => expect(await setsOf(repos)).toHaveLength(0));
  });

  it('上次紀錄只當灰色 placeholder，不會自動填值', async () => {
    const repos = await fakeRepos();
    renderToday(repos);
    const card = await addExercise('vx-0025', '槓鈴臥推');
    const hist = (await repos.sets.listByExercise('vx-0025')).slice();
    const lastSessionId = hist[hist.length - 1].sessionId;
    const first = hist.filter((s) => s.sessionId === lastSessionId).sort((a, b) => a.setIndex - b.setIndex)[0];
    const input = within(card).getByLabelText('第1組 重量（kg）') as HTMLInputElement;
    expect(input.getAttribute('placeholder')).toBe(String(first.weightKg));
    expect(input.value).toBe('');
    await settle();
    expect(await repos.sessions.getByDate(TODAY)).toHaveLength(1);
    expect(await setsOf(repos)).toHaveLength(0);
  });

  it('替換動作、刪除動作', async () => {
    const repos = await emptyRepos();
    renderToday(repos);
    const card = await addExercise('vx-0025', '槓鈴臥推');
    fireEvent.click(within(card).getByRole('button', { name: /更多選項/ }));
    fireEvent.click(await screen.findByRole('button', { name: '替換動作' }));
    fireEvent.click(await screen.findByRole('button', { name: '選擇 vx-0032' }));
    expect(await screen.findByRole('article', { name: '槓鈴硬舉' })).toBeTruthy();
    expect(screen.queryByRole('article', { name: '槓鈴臥推' })).toBeNull();

    const card2 = screen.getByRole('article', { name: '槓鈴硬舉' });
    fireEvent.click(within(card2).getByRole('button', { name: /更多選項/ }));
    fireEvent.click(await screen.findByRole('button', { name: '刪除動作' }));
    await waitFor(() => expect(screen.queryByRole('article', { name: '槓鈴硬舉' })).toBeNull());
  });
});

describe('有氧', () => {
  it('依類型顯示時間／速度／斜度，沒有重量；存檔不啟動休息計時', async () => {
    const repos = await fakeRepos();
    renderToday(repos);
    fireEvent.click(await screen.findByRole('button', { name: '開始訓練（腿與有氧）' }));
    const run = await screen.findByRole('article', { name: '跑步' });
    expect(within(run).getByLabelText('第1組 時間（分鐘）')).toBeTruthy();
    expect(within(run).getByLabelText('第1組 速度（km/h）')).toBeTruthy();
    expect(within(run).getByLabelText('第1組 斜度（%）')).toBeTruthy();
    expect(within(run).queryByLabelText(/重量/)).toBeNull();

    fill(run, '第1組 時間（分鐘）', '20');
    await waitFor(async () => expect(await setsOf(repos)).toHaveLength(1));
    fill(run, '第1組 速度（km/h）', '8');
    await waitFor(async () => expect((await setsOf(repos))[0].speed).toBe(8));
    expect((await setsOf(repos))[0]).toMatchObject({ kind: 'cardio', durationSec: 1200 });
    expect(screen.getByRole('button', { name: '開始休息計時' })).toBeTruthy(); // 有氧不計時
  });
});

describe('PR 與慶祝頁', () => {
  it('首次紀錄該動作視為 PR，顯示慶祝頁，點擊後關閉', async () => {
    const repos = await emptyRepos();
    renderToday(repos);
    const card = await addExercise('vx-0025', '槓鈴臥推');
    click('減一組', card);
    click('減一組', card);
    fill(card, '第1組 重量（kg）', '40');
    fill(card, '第1組 次數', '10');
    expect(await screen.findByText('恭喜打破 PR！')).toBeTruthy();
    expect(screen.getByText(/槓鈴臥推 新高：最大重量 40 kg/)).toBeTruthy();
    expect(screen.getByText(/0 → 400 \/ 10,000 kg/)).toBeTruthy();
    expect(screen.getByText('點擊任意處繼續')).toBeTruthy();
    fireEvent.click(screen.getByRole('dialog'));
    await waitFor(() => expect(screen.queryByText('恭喜打破 PR！')).toBeNull());
  });

  it('破自己的紀錄也會慶祝', async () => {
    const repos = await fakeRepos();
    renderToday(repos);
    const card = await addExercise('vx-0025', '槓鈴臥推');
    click('減一組', card);
    click('減一組', card);
    fill(card, '第1組 重量（kg）', '200');
    fill(card, '第1組 次數', '5');
    expect(await screen.findByText('恭喜打破 PR！')).toBeTruthy();
    expect(screen.getByText(/最大重量 200 kg/)).toBeTruthy();
  });

  it('沒破紀錄不顯示；要等該動作所有組都填完才判定', async () => {
    const repos = await fakeRepos();
    renderToday(repos);
    const card = await addExercise('vx-0025', '槓鈴臥推');
    click('減一組', card);
    click('減一組', card);
    fill(card, '第1組 重量（kg）', '20');
    fill(card, '第1組 次數', '5');
    await waitFor(async () => expect(await setsOf(repos)).toHaveLength(1));
    await settle();
    expect(screen.queryByText('恭喜打破 PR！')).toBeNull();
  });

  it('有多組時，最後一組存檔後才判定', async () => {
    const repos = await emptyRepos();
    renderToday(repos);
    const card = await addExercise('vx-0025', '槓鈴臥推');
    click('減一組', card); // 3 → 2 組
    fill(card, '第1組 重量（kg）', '40');
    fill(card, '第1組 次數', '10');
    await waitFor(async () => expect(await setsOf(repos)).toHaveLength(1));
    await settle();
    expect(screen.queryByText('恭喜打破 PR！')).toBeNull();
    fill(card, '第2組 重量（kg）', '40');
    fill(card, '第2組 次數', '10');
    expect(await screen.findByText('恭喜打破 PR！')).toBeTruthy();
    expect(screen.getByText(/0 → 800 \/ 10,000 kg/)).toBeTruthy();
  });
});

describe('完成訓練', () => {
  it('空訓練不留紀錄，按鈕變已完成', async () => {
    const repos = await fakeRepos();
    renderToday(repos);
    fireEvent.click(await screen.findByRole('button', { name: '開始訓練（腿與有氧）' }));
    await screen.findByRole('article', { name: '槓鈴硬舉' });
    click('完成訓練');
    const done = (await screen.findByRole('button', { name: '訓練完成' })) as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    expect(await repos.sessions.getByDate(TODAY)).toHaveLength(0);
    expect(screen.queryByRole('button', { name: '完成訓練' })).toBeNull();
  });

  it('有紀錄時寫入 endedAt 並保留 session', async () => {
    const repos = await emptyRepos();
    renderToday(repos);
    const card = await addExercise('vx-0025', '槓鈴臥推');
    fill(card, '第1組 重量（kg）', '40');
    fill(card, '第1組 次數', '10');
    await waitFor(async () => expect(await setsOf(repos)).toHaveLength(1));
    click('完成訓練');
    expect(await screen.findByRole('button', { name: '訓練完成' })).toBeTruthy();
    const s = await todaySession(repos);
    expect(s.endedAt).toBeGreaterThan(0);
    expect(await setsOf(repos)).toHaveLength(1);
  });
});

describe('今日紀錄摘要', () => {
  async function withOneSet() {
    const repos = await fakeRepos();
    renderToday(repos);
    const card = await addExercise('vx-0025', '槓鈴臥推');
    click('減一組', card);
    click('減一組', card);
    fill(card, '第1組 重量（kg）', '50');
    fill(card, '第1組 次數', '5');
    await waitFor(async () => expect(await setsOf(repos)).toHaveLength(1));
    await settle();
    return { repos, card };
  }

  it('顯示總容量與消耗；刪除一組後可在 5 秒內復原', async () => {
    const { repos } = await withOneSet();
    click('今日紀錄');
    const dlg = await screen.findByRole('dialog', { name: '今日訓練紀錄' });
    expect(within(dlg).getByText(/250/)).toBeTruthy(); // 50 × 5
    expect(await within(dlg).findByText(/kcal/)).toBeTruthy(); // fake profile 有體重

    click('刪除 槓鈴臥推 第1組', dlg);
    await waitFor(async () => expect(await setsOf(repos)).toHaveLength(0));
    const undo = await screen.findByRole('button', { name: '復原' });
    fireEvent.click(undo);
    await waitFor(async () => expect(await setsOf(repos)).toHaveLength(1));
    expect((await setsOf(repos))[0]).toMatchObject({ weightKg: 50, reps: 5 });
    expect(screen.queryByRole('button', { name: '復原' })).toBeNull();
  });

  it('可編輯一組：改次數會更新紀錄', async () => {
    const { repos } = await withOneSet();
    click('今日紀錄');
    const dlg = await screen.findByRole('dialog', { name: '今日訓練紀錄' });
    click('編輯 槓鈴臥推 第1組', dlg);
    fill(dlg, '第1組 次數', '8');
    await waitFor(async () => expect((await setsOf(repos))[0].reps).toBe(8));
    expect(await setsOf(repos)).toHaveLength(1);
  });

  it('沒有體重時消耗顯示「—」', async () => {
    const repos = createMemoryRepos();
    await seedExercises(repos, exercises, 1); // 沒有 profile、沒有體重紀錄
    renderToday(repos);
    const card = await addExercise('vx-0025', '槓鈴臥推');
    click('減一組', card);
    click('減一組', card);
    fill(card, '第1組 重量（kg）', '50');
    fill(card, '第1組 次數', '5');
    await waitFor(async () => expect(await setsOf(repos)).toHaveLength(1));
    click('今日紀錄');
    const dlg = await screen.findByRole('dialog', { name: '今日訓練紀錄' });
    expect(await within(dlg).findByText('—')).toBeTruthy();
  });

  it('手動覆寫的消耗優先', async () => {
    const { repos } = await withOneSet();
    await repos.burnOverrides.set(TODAY, 321);
    click('今日紀錄');
    const dlg = await screen.findByRole('dialog', { name: '今日訓練紀錄' });
    expect(await within(dlg).findByText(/321/)).toBeTruthy();
  });
});

describe('返回鍵', () => {
  it('返回鍵先關閉今日紀錄面板，不離開畫面', async () => {
    const repos = await emptyRepos();
    const off = installBackHandling({ isRoot: () => true, goBack: () => {}, exit: () => {} });
    renderToday(repos);
    await addExercise('vx-0025', '槓鈴臥推');
    click('今日紀錄');
    await screen.findByRole('dialog', { name: '今日訓練紀錄' });
    act(() => dispatchBackEvent());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '今日訓練紀錄' })).toBeNull());
    expect(screen.getByRole('article', { name: '槓鈴臥推' })).toBeTruthy();
    off();
  });
});

describe('收操', () => {
  it('顯示該場課表的收操建議，按完成關閉', async () => {
    const repos = await fakeRepos();
    renderToday(repos);
    fireEvent.click(await screen.findByRole('button', { name: '開始訓練（腿與有氧）' }));
    await screen.findByRole('article', { name: '槓鈴硬舉' });
    click('結束 & 收操');
    const dlg = await screen.findByRole('dialog', { name: '收操建議' });
    expect(within(dlg).getByText(/股四頭拉伸/)).toBeTruthy();
    click('完成', dlg);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '收操建議' })).toBeNull());
    expect(await screen.findByRole('button', { name: '訓練完成' })).toBeTruthy();
  });

  it('沒有課表時顯示通用建議', async () => {
    const repos = await emptyRepos();
    renderToday(repos);
    await addExercise('vx-0025', '槓鈴臥推');
    click('結束 & 收操');
    const dlg = await screen.findByRole('dialog', { name: '收操建議' });
    expect(within(dlg).getByText(/伸展/)).toBeTruthy();
  });
});

describe('補記模式', () => {
  it('操作寫入 selectedDate 那天的 session', async () => {
    const repos = await emptyRepos();
    renderToday(repos, { mode: 'backfill', date: '2026-10-10' });
    expect(await screen.findByText(/2026-10-10/)).toBeTruthy();
    expect(screen.getByText('補記模式')).toBeTruthy();
    const card = await addExercise('vx-0025', '槓鈴臥推');
    fill(card, '第1組 重量（kg）', '40');
    fill(card, '第1組 次數', '10');
    await waitFor(async () => expect((await repos.sessions.getByDate('2026-10-10'))).toHaveLength(1));
    const [s] = await repos.sessions.getByDate('2026-10-10');
    expect(s.mode).toBe('backfill');
    await waitFor(async () => expect(await repos.sets.listBySession(s.id)).toHaveLength(1));
    expect(await repos.sessions.getByDate(TODAY)).toHaveLength(0);
  });
});
