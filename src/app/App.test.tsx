import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRepos } from '../data/repos';
import { MODE_COLOR_VAR } from '../features/shared';
import { App, Shell } from './App';
import { dispatchBackEvent } from './back';
import { AppStateProvider, ReposProvider, useAppState } from './context';
import { ROUTES, TABS, resolveRoute } from './routes';
import { parseHash } from './router';

const go = async (hash: string) => {
  await act(async () => {
    window.location.hash = hash;
    await new Promise((r) => setTimeout(r, 20));
  });
};

function mount(onExit?: () => void) {
  return render(
    <ReposProvider repos={createMemoryRepos()}>
      <App onExit={onExit} />
    </ReposProvider>,
  );
}

describe('App 外殼', () => {
  beforeEach(() => {
    window.location.hash = '#/today';
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('底部有五個分頁，文字標示，可切換並標示當前頁', async () => {
    mount();
    await go('#/today');
    const nav = screen.getByRole('navigation', { name: '主要分頁' });
    const links = nav.querySelectorAll('a');
    expect([...links].map((a) => a.textContent)).toEqual(['今日', '歷史', '計畫', '飲食', '設定']);
    expect(screen.getByRole('link', { name: '今日' }).getAttribute('aria-current')).toBe('page');

    const screens: Record<string, string> = { 歷史: '歷史', 計畫: '計畫', 飲食: '飲食', 設定: '設定', 今日: '今日訓練' };
    for (const [label, name] of Object.entries(screens)) {
      await act(async () => { fireEvent.click(screen.getByRole('link', { name: label })); await new Promise((r) => setTimeout(r, 20)); });
      expect(screen.getByRole('link', { name: label }).getAttribute('aria-current')).toBe('page');
      expect(document.querySelector(`[data-screen="${name}"]`)).toBeTruthy();
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(label);
    }
  });

  it('空 hash 導向今日', async () => {
    window.location.hash = '';
    mount();
    await waitFor(() => expect(window.location.hash).toBe('#/today'));
  });

  it('標頭顯示模式文字標籤，背景隨模式切換', async () => {
    let setMode!: (m: 'gear' | 'travel' | 'backfill') => void;
    function Spy() {
      setMode = useAppState().setMode;
      return null;
    }
    const { container } = render(
      <ReposProvider repos={createMemoryRepos()}>
        <AppStateProvider>
          <Shell />
          <Spy />
        </AppStateProvider>
      </ReposProvider>,
    );
    await go('#/today');
    const header = container.querySelector('header') as HTMLElement;
    expect(screen.getByTestId('mode-label').textContent).toBe('器材模式');
    expect(header.style.background).toContain('var(--ink)');
    expect(header.dataset.mode).toBe('gear');
    for (const [mode, label] of [['travel', '出差模式'], ['backfill', '補記模式'], ['gear', '器材模式']] as const) {
      await act(async () => setMode(mode));
      expect(screen.getByTestId('mode-label').textContent).toBe(label);
      expect(header.dataset.mode).toBe(mode);
      expect(header.style.background).toContain(MODE_COLOR_VAR[mode]);
    }
  });

  it('子頁（動作詳情）：無底部分頁、有返回鈕、參數帶入', async () => {
    mount();
    await go('#/exercise/vx-0025?tab=chart');
    expect(screen.queryByRole('navigation', { name: '主要分頁' })).toBeNull();
    expect(screen.getByRole('button', { name: '返回' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('動作詳情');
    expect(document.body.textContent).toContain('動作 vx-0025，分頁 chart');
  });

  it('選擇動作路由帶 mode 參數', async () => {
    mount();
    await go('#/picker?mode=multi');
    expect(document.body.textContent).toContain('動作選擇（multi）');
    await go('#/picker');
    expect(document.body.textContent).toContain('動作選擇（single）');
  });

  it('未知路由顯示空狀態並可回今日', async () => {
    mount();
    await go('#/nope/xyz');
    expect(screen.getByText('找不到這個畫面')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '回到今日' })); await new Promise((r) => setTimeout(r, 20)); });
    expect(window.location.hash).toBe('#/today');
  });

  it('返回事件：根畫面呼叫 onExit；子頁則返回上一頁', async () => {
    const onExit = vi.fn();
    mount(onExit);
    await go('#/today');
    act(() => dispatchBackEvent());
    expect(onExit).toHaveBeenCalledTimes(1);
    await go('#/exercise/abc');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    act(() => dispatchBackEvent());
    expect(back).toHaveBeenCalled();
    back.mockRestore();
    expect(onExit).toHaveBeenCalledTimes(1);
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
