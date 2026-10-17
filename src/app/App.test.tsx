import { readFileSync } from 'node:fs';
import { act, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from '../components/Sheet';
import { createMemoryRepos } from '../data/repos';
import { ExerciseDetail } from '../features/exercises/ExerciseDetail';
import { ExercisePicker } from '../features/exercises/ExercisePicker';
import { MODE_COLOR_VAR } from '../features/shared';
import { createProfiledRepos, goTo, makeExercise, renderApp, renderShell } from '../test/helpers';
import { dispatchBackEvent } from './back';
import { useAppState } from './context';
import { parseHash } from './router';
import { ROUTES, TABS, resolveRoute } from './routes';

// jsdom 不會載入 import 進來的 CSS；標頭去重靠 app.css 的規則，所以測試手動注入
// 用變數組 URL：Vite 會把字面的 new URL('./x', import.meta.url) 當成資產改寫
const rel = './app.css';
const appCss = readFileSync(new URL(rel, import.meta.url), 'utf8');
let styleEl: HTMLStyleElement;
beforeAll(() => {
  styleEl = document.createElement('style');
  styleEl.textContent = appCss;
  document.head.appendChild(styleEl);
});
afterAll(() => styleEl.remove());

const tick = (ms = 20) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe('App 外殼', () => {
  beforeEach(() => {
    window.location.hash = '#/today';
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('底部有五個分頁，文字標示，可切換並標示當前頁', async () => {
    renderApp(await createProfiledRepos());
    await goTo('#/today');
    const nav = screen.getByRole('navigation', { name: '主要分頁' });
    expect([...nav.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['今日', '歷史', '計畫', '飲食', '設定']);
    expect(screen.getByRole('link', { name: '今日' }).getAttribute('aria-current')).toBe('page');

    for (const t of TABS) {
      await act(async () => { fireEvent.click(screen.getByRole('link', { name: t.label })); await new Promise((r) => setTimeout(r, 20)); });
      expect(window.location.hash).toBe(`#${t.path}`);
      expect(screen.getByRole('link', { name: t.label }).getAttribute('aria-current')).toBe('page');
      expect(screen.getAllByRole('link', { current: 'page' })).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t.label);
    }
  });

  it('空 hash 導向今日', async () => {
    window.location.hash = '';
    renderApp(await createProfiledRepos());
    await waitFor(() => expect(window.location.hash).toBe('#/today'));
  });

  it('標頭沒有器材／出差模式徽章，背景固定 --ink；今天不顯示補記標籤', async () => {
    const { container } = renderShell(await createProfiledRepos());
    await goTo('#/today');
    const header = container.querySelector('header') as HTMLElement;
    expect(header.textContent).not.toContain('器材模式');
    expect(screen.queryByTestId('mode-label')).toBeNull();
    expect(header.style.background).toContain('var(--ink)');
  });

  it('selectedDate 不是今天時顯示「補記」標籤與補記色；回到今天就消失', async () => {
    let setDate!: (d: string) => void;
    function Spy() {
      const s = useAppState();
      setDate = s.setSelectedDate as (d: string) => void;
      return null;
    }
    const { container } = renderShell(await createProfiledRepos(), <Spy />);
    await goTo('#/today');
    const header = container.querySelector('header') as HTMLElement;
    await act(async () => setDate('2000-01-01'));
    expect(screen.getByTestId('mode-label').textContent).toBe('補記');
    expect(header.style.background).toContain(MODE_COLOR_VAR.backfill);
    await act(async () => setDate(new Date().toLocaleDateString('sv')));
    expect(screen.queryByTestId('mode-label')).toBeNull();
    expect(header.style.background).toContain('var(--ink)');
  });

  it('頁面內容包在轉場容器：分頁淡入、子頁滑入', async () => {
    const { container } = renderApp(await createProfiledRepos());
    await goTo('#/history');
    expect(container.querySelector('.route-view')?.classList.contains('route-view--fade')).toBe(true);
    await goTo('#/exercise/abc');
    expect(container.querySelector('.route-view')?.classList.contains('route-view--slide')).toBe(true);
  });

  it('切換分頁時標頭與底部分頁列是同一個 DOM 節點（不重繪）', async () => {
    const { container } = renderApp(await createProfiledRepos());
    await goTo('#/today');
    const header = container.querySelector('header');
    const nav = container.querySelector('nav');
    await goTo('#/history');
    expect(container.querySelector('header')).toBe(header);
    expect(container.querySelector('nav')).toBe(nav);
  });

  it('子頁（動作詳情）：無底部分頁、只有一個返回鈕、標頭標題', async () => {
    const repos = await createProfiledRepos();
    await repos.exercises.bulkPut([makeExercise('vx-0025', '槓鈴臥推')]);
    renderApp(repos);
    await goTo('#/exercise/vx-0025?tab=chart');
    expect(screen.queryByRole('navigation', { name: '主要分頁' })).toBeNull();
    expect(screen.getAllByRole('button', { name: '返回' })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('動作詳情');
    expect(await screen.findByRole('heading', { name: '槓鈴臥推' })).toBeTruthy();
  });

  it('子頁的返回鈕會返回上一頁', async () => {
    renderApp(await createProfiledRepos());
    await goTo('#/history');
    await goTo('#/exercise/vx-0025');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '返回' })); await new Promise((r) => setTimeout(r, 50)); });
    await waitFor(() => expect(window.location.hash).toBe('#/history'));
  });

  it('選擇動作路由：mode=multi 才有「完成」，且只有一個返回鈕', async () => {
    renderApp(await createProfiledRepos());
    await goTo('#/picker?mode=multi');
    expect(screen.getByRole('button', { name: /^完成/ })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '返回' })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await goTo('#/picker');
    expect(screen.queryByRole('button', { name: /^完成/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: '返回' })).toHaveLength(1);
  });

  it('未知路由顯示空狀態並可回今日', async () => {
    renderApp(await createProfiledRepos());
    await goTo('#/nope/xyz');
    expect(screen.getByText('找不到這個畫面')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '回到今日' })); await new Promise((r) => setTimeout(r, 20)); });
    expect(window.location.hash).toBe('#/today');
  });

  it('返回事件：根畫面呼叫 onExit；子頁則返回上一頁', async () => {
    const onExit = vi.fn();
    renderApp(await createProfiledRepos(), { onExit });
    await goTo('#/today');
    act(() => dispatchBackEvent());
    expect(onExit).toHaveBeenCalledTimes(1);
    await goTo('#/exercise/abc');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    act(() => dispatchBackEvent());
    expect(back).toHaveBeenCalled();
    back.mockRestore();
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe('標頭去重（元件自帶標頭 vs 外殼／Sheet 標頭）', () => {
  beforeEach(() => {
    window.location.hash = '#/today';
  });

  it('動作詳情放進 Sheet：只剩 Sheet 的關閉鈕，沒有詳情自己的返回鈕', async () => {
    const onClose = vi.fn();
    renderShell(
      await createProfiledRepos(),
      <Sheet open title="啞鈴彎舉" onClose={onClose}>
        <ExerciseDetail exerciseId="x" onClose={onClose} />
      </Sheet>,
    );
    await tick();
    expect(screen.queryByRole('button', { name: '返回' })).toBeNull();
    // 外殼在 /today 沒有返回鈕，所以頁面上只剩 Sheet 的 X
    expect(screen.getAllByRole('button', { name: '關閉' })).toHaveLength(1);
  });

  it('動作選擇放進 Sheet：沒有返回鈕、沒有重複標題，但保留「新增自訂動作」', async () => {
    renderShell(
      await createProfiledRepos(),
      <Sheet open title="新增動作" onClose={() => {}}>
        <ExercisePicker mode="single" onClose={() => {}} />
      </Sheet>,
    );
    await tick();
    expect(screen.queryByRole('button', { name: '返回' })).toBeNull();
    expect(screen.queryByRole('heading', { name: '選擇動作' })).toBeNull();
    expect(screen.getByRole('button', { name: '新增自訂動作' })).toBeTruthy();
  });
});

describe('首次啟動', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('沒有 profile：導向問卷，且不顯示底部分頁列', async () => {
    window.location.hash = '#/today';
    renderApp(createMemoryRepos());
    await waitFor(() => expect(window.location.hash).toBe('#/onboarding'));
    await tick();
    expect(screen.queryByRole('navigation', { name: '主要分頁' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('建立個人資料');
  });

  it('問卷畫面沒有標頭返回按鈕；第 1 步按返回鍵＝離開 App，不會跳到今日', async () => {
    window.location.hash = '#/today';
    const onExit = vi.fn();
    renderApp(createMemoryRepos(), { onExit });
    await waitFor(() => expect(window.location.hash).toBe('#/onboarding'));
    await screen.findByRole('heading', { level: 1, name: '建立個人資料' }, { timeout: 10_000 });
    expect(screen.queryByRole('button', { name: '返回' })).toBeNull();
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    // 首次啟動時外殼是在非同步導向之後才掛載，「安裝返回處理」的 effect 要等下一個繪製週期才跑
    // （真實使用不受影響：沒人能在畫面出現的十幾毫秒內按返回）。處理器還沒掛上時送返回事件是「無作用」的，
    // 所以輪詢送事件是安全的：掛上後第一次送出就會呼叫 exit，不會重複。
    await waitFor(
      () => {
        act(() => dispatchBackEvent());
        expect(onExit).toHaveBeenCalledTimes(1);
      },
      { timeout: 10_000 },
    );
    expect(back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/onboarding');
    back.mockRestore();
  });

  it('已有 profile：不導向問卷', async () => {
    window.location.hash = '#/history';
    renderApp(await createProfiledRepos());
    await tick(60);
    expect(window.location.hash).toBe('#/history');
    expect(screen.getByRole('navigation', { name: '主要分頁' })).toBeTruthy();
  });

  it('空 hash 且沒有 profile：直接進問卷（不經過今日）', async () => {
    window.location.hash = '';
    renderApp(createMemoryRepos());
    await waitFor(() => expect(window.location.hash).toBe('#/onboarding'));
  });
});

describe('路由表', () => {
  it('每個分頁都有對應路由；全部路由能被解析', () => {
    for (const t of TABS) {
      const r = resolveRoute(parseHash(`#${t.path}`));
      expect(r?.route.tab).toBe(t.id);
    }
    expect(resolveRoute(parseHash('#/exercise/abc'))?.ctx.params.id).toBe('abc');
    expect(resolveRoute(parseHash('#/picker?mode=multi'))?.ctx.query.get('mode')).toBe('multi');
    expect(resolveRoute(parseHash('#/onboarding'))).toBeTruthy();
    expect(resolveRoute(parseHash('#/nope'))).toBeNull();
    expect(ROUTES.length).toBeGreaterThanOrEqual(8);
  });
});
