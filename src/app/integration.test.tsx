/**
 * P4 整合測試：真正的 Dexie（fake-indexeddb）＋完整 <App />，走使用者流程。
 * 同一個 describe 內的測試共用一個資料庫並依序執行（後面的測試接續前面寫入的資料）。
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NuoDB } from '../data/db';
import { createDexieRepos } from '../data/repos';
import type { Repos } from '../data/repos/interfaces';
import { seedExercises } from '../data/seed';
import { toDateStr } from '../domain/dates';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { BackupServiceProvider, createDbBackupService } from '../features/settings/backupService';
import { makeExercise } from '../test/helpers';
import { ToastProvider } from '../components/Toast';
import { App } from './App';
import { AppStateProvider, ReposProvider, useRepoQuery } from './context';

const TODAY = toDateStr(new Date());
const settle = (ms = 40) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const click = (name: string | RegExp, root: HTMLElement = document.body) => fireEvent.click(within(root).getByRole('button', { name }));
const radio = (name: string | RegExp) => fireEvent.click(screen.getByRole('radio', { name }));
const fill = (root: HTMLElement | Document, label: string | RegExp, value: string) => {
  const input = within(root as HTMLElement).getByLabelText(label) as HTMLInputElement;
  input.value = value;
  fireEvent.input(input);
};

let db: NuoDB;
let repos: Repos;
let dbSeq = 0;

async function openDb() {
  db = new NuoDB(`nuo-int-${Date.now()}-${dbSeq++}`);
  repos = createDexieRepos(db);
  await seedExercises(repos, [makeExercise('vx-0025', '槓鈴臥推'), makeExercise('vx-0032', '槓鈴硬舉', { category: '背' })], 1);
}

function mountApp() {
  window.location.hash = '#/today';
  return render(
    <ReposProvider repos={repos}>
      <BackupServiceProvider service={createDbBackupService(db)}>
        <App />
      </BackupServiceProvider>
    </ReposProvider>,
  );
}

const nav = async (label: string) => fireEvent.click(await screen.findByRole('link', { name: label }));

describe('整合：首次啟動到歷史（Dexie）', () => {
  beforeAll(async () => {
    window.location.hash = '';
    await openDb();
  });
  afterAll(async () => {
    window.location.hash = '';
    db.close();
  });

  it('(a) 空資料庫啟動 → 導向問卷 → 填完 → 進入今日', async () => {
    mountApp();
    await waitFor(() => expect(window.location.hash).toBe('#/onboarding'));
    expect(screen.queryByRole('navigation', { name: '主要分頁' })).toBeNull();
    await screen.findByText('1/3');

    radio('男');
    fill(document, /年齡/, '30');
    fill(document, /身高/, '175');
    fill(document, /體重/, '70');
    click('下一步');
    radio(/中度活動/);
    click('下一步');
    radio(/維持/);
    click('完成');

    await waitFor(() => expect(window.location.hash).toBe('#/today'));
    expect(await screen.findByRole('navigation', { name: '主要分頁' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('今日');
    const profile = await repos.profile.get();
    expect(profile).toMatchObject({ sex: 'male', age: 30, heightCm: 175, weightKg: 70 });
    expect(profile!.kcalTarget).toBeGreaterThan(1000);
  });

  it('(b) 今日自由訓練：新增動作、填一組、儲存即寫入 → 首次紀錄觸發慶祝頁 → 繼續', async () => {
    mountApp();
    await waitFor(() => expect(window.location.hash).toBe('#/today'));
    fireEvent.click(await screen.findByRole('button', { name: '新增動作' }));
    const picker = await screen.findByRole('dialog', { name: '新增動作' });
    // 選擇器在 Sheet 內：只有 Sheet 的關閉鈕，沒有重複的返回鈕（CSS 在 jsdom 不生效，這裡只確認 Sheet 的 X 在）
    expect(within(picker).getByRole('button', { name: '關閉' })).toBeTruthy();
    fireEvent.click(await within(picker).findByText('槓鈴臥推'));

    // 原版流程：先問「加入今日訓練／看教學」
    const ask = await screen.findByRole('dialog', { name: '槓鈴臥推' });
    click('加入今日訓練', ask);

    const card = await screen.findByRole('article', { name: '槓鈴臥推' });
    click('減一組', card);
    click('減一組', card); // 只留一組，填完就是「該動作全部組完成」
    fill(card, '第1組 重量（kg）', '40');
    fill(card, '第1組 次數', '10');

    expect(await screen.findByText('恭喜打破 PR！')).toBeTruthy();
    const sets = await repos.sets.listAllAsSetRecords();
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ exerciseId: 'vx-0025', weightKg: 40, reps: 10, date: TODAY });

    fireEvent.click(screen.getByRole('dialog', { name: /PR/ }));
    await waitFor(() => expect(screen.queryByText('恭喜打破 PR！')).toBeNull());
  });

  it('(c) 歷史頁顯示該日容量與日曆標記', async () => {
    mountApp();
    await waitFor(() => expect(window.location.hash).toBe('#/today'));
    await nav('歷史');
    const volume = await screen.findByRole('region', { name: '訓練量' });
    await waitFor(() => expect(within(volume).getAllByText('400').length).toBeGreaterThan(0)); // 40 kg × 10

    fireEvent.click(screen.getByRole('tab', { name: '日曆' }));
    expect(await screen.findByRole('gridcell', { name: new RegExp('今天，有訓練') })).toBeTruthy();
    expect(within(screen.getByRole('group', { name: '本月訓練天數' })).getByText('1')).toBeTruthy();
    expect(within(screen.getByRole('group', { name: '連續訓練週數' })).getByText('1')).toBeTruthy();
  });

  it('(d) 迴歸：刪除該組後歷史與日曆歸零', async () => {
    mountApp();
    await waitFor(() => expect(window.location.hash).toBe('#/today'));
    const card = await screen.findByRole('article', { name: '槓鈴臥推' }); // 進行中的 session 從資料庫還原
    expect(within(card).getByLabelText('第1組 次數')).toBeTruthy();
    // 重新載入後卡片還有補滿的空白列：按「減一組」直到已存的那組也被刪掉
    expect(within(card).getAllByLabelText(/^第\d組 次數/).length).toBeGreaterThan(0);
    for (let i = within(card).getAllByLabelText(/^第\d組 次數/).length; i > 0; i--) click('減一組', card);
    await waitFor(async () => expect(await repos.sets.listAllAsSetRecords()).toHaveLength(0));

    await nav('歷史');
    const volume = await screen.findByRole('region', { name: '訓練量' });
    await waitFor(() => expect(within(volume).queryByText('400')).toBeNull());
    expect(within(volume).getAllByText('0').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('tab', { name: '日曆' }));
    await screen.findByRole('grid');
    expect(screen.queryByRole('gridcell', { name: /有訓練/ })).toBeNull();
    expect(within(screen.getByRole('group', { name: '本月訓練天數' })).getByText('0')).toBeTruthy();
    expect(within(screen.getByRole('group', { name: '連續訓練週數' })).getByText('0')).toBeTruthy();
  });
});

/** 讀取 sessions 筆數的探針，用來確認匯入後畫面會重查（invalidate） */
function Probe() {
  const q = useRepoQuery((r) => r.sessions.listByRange({}), []);
  return <output aria-label="場次數">{q.data ? String(q.data.length) : '…'}</output>;
}

describe('整合：備份匯出 → 清空 → 匯入（Dexie）', () => {
  beforeAll(openDb);
  afterAll(() => db.close());

  it('(e) 匯出備份 → 清空 → 匯入 → 資料還原，且畫面重查', async () => {
    const session = await repos.sessions.create({ date: TODAY, mode: 'gear', startedAt: Date.now() });
    await repos.sets.add({ sessionId: session.id, exerciseId: 'vx-0025', setIndex: 0, kind: 'strength', weightKg: 60, reps: 8 });
    await repos.bodyMetrics.add({ date: TODAY, weightKg: 70 });
    const service = createDbBackupService(db);
    const json = await service.export();

    // 清空所有資料
    await Promise.all(db.tables.map((t) => t.clear()));
    expect(await repos.sessions.listByRange({})).toHaveLength(0);

    render(
      <ReposProvider repos={repos}>
        <BackupServiceProvider service={service}>
          <AppStateProvider>
            <ToastProvider>
              <SettingsScreen />
              <Probe />
            </ToastProvider>
          </AppStateProvider>
        </BackupServiceProvider>
      </ReposProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText('場次數').textContent).toBe('0'));

    const input = (await screen.findByLabelText('選擇備份檔')) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([json], 'nuo-backup.json', { type: 'application/json' })] } });
    fireEvent.click(await screen.findByRole('button', { name: '確認取代' }));

    expect((await screen.findByRole('status', { name: '匯入結果' })).textContent).toMatch(/匯入完成/);
    // 資料還原
    expect(await repos.sessions.listByRange({})).toHaveLength(1);
    const sets = await repos.sets.listAllAsSetRecords();
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ exerciseId: 'vx-0025', weightKg: 60, reps: 8 });
    expect((await repos.bodyMetrics.latest())?.weightKg).toBe(70);
    // 畫面重查
    await waitFor(() => expect(screen.getByLabelText('場次數').textContent).toBe('1'));
  });
});

describe('整合：計畫畫面「開始訓練」導向今日（返回鍵回收協調）', () => {
  beforeAll(async () => {
    await openDb();
    await repos.profile.save({
      sex: 'male', age: 30, heightCm: 175, weightKg: 70, pal: 1.55, goal: 'maintain',
      tdee: 2500, kcalTarget: 2500, macros: { proteinG: 150, carbG: 300, fatG: 70 },
    } as never);
    await repos.templates.create({
      name: '推日', color: '#2f6fed', cooldownText: '',
      exercises: [{ exerciseId: 'vx-0025', targetSets: 3, targetReps: 10 }],
    });
  });
  afterAll(() => db.close());

  it('開始訓練 → 立即導向今日並停留（不被標記條目回收蓋掉），今日顯示課表動作', async () => {
    window.location.hash = '#/plans';
    render(
      <ReposProvider repos={repos}>
        <App />
      </ReposProvider>,
    );
    await settle(60);
    fireEvent.click(await screen.findByRole('tab', { name: '課表' }));
    fireEvent.click(await screen.findByRole('button', { name: '開啟 推日' }));
    fireEvent.click(await screen.findByRole('button', { name: '開始訓練' }));

    await waitFor(() => expect(window.location.hash).toBe('#/today'));
    // 舊版會在 250ms 後或 history.go 完成時被蓋回 #/plans；等超過這段時間仍應停在今日
    await settle(500);
    expect(window.location.hash).toBe('#/today');
    expect(await screen.findByRole('article', { name: '槓鈴臥推' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('今日');
    expect((await repos.sessions.getByDate(TODAY))).toHaveLength(1);
  });
});
