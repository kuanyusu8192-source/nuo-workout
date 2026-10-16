import { act, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRepos } from '../data/repos';
import { renderWithApp } from '../test/helpers';
import { resolveDbKind, createRepos } from './createRepos';
import { AppStateProvider, ReposProvider, useAppState, useAsync, useRepoQuery, useRepos } from './context';

describe('useRepos', () => {
  it('在 Provider 外使用會擲出清楚錯誤', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bad() {
      useRepos();
      return null;
    }
    expect(() => render(<Bad />)).toThrow(/ReposProvider/);
    spy.mockRestore();
  });
  it('提供注入的 repos', () => {
    const repos = createMemoryRepos();
    let got: unknown;
    function Probe() {
      got = useRepos();
      return null;
    }
    render(<ReposProvider repos={repos}><Probe /></ReposProvider>);
    expect(got).toBe(repos);
  });
});

describe('AppState', () => {
  function Probe() {
    const s = useAppState();
    return (
      <div>
        <p data-testid="mode">{s.mode}</p>
        <p data-testid="date">{s.selectedDate}</p>
        <p data-testid="plan">{s.activePlanId ?? 'none'}</p>
        <button onClick={() => s.setMode('backfill')}>backfill</button>
        <button onClick={() => s.setSelectedDate('2026-01-01')}>pick</button>
        <button onClick={() => s.setMode('gear')}>gear</button>
      </div>
    );
  }
  it('預設器材模式、日期為今天；離開補記模式會回到今天', async () => {
    renderWithApp(<Probe />, createMemoryRepos(), { today: '2026-10-16' });
    expect(screen.getByTestId('mode').textContent).toBe('gear');
    expect(screen.getByTestId('date').textContent).toBe('2026-10-16');
    await act(async () => { screen.getByText('backfill').click(); });
    await act(async () => { screen.getByText('pick').click(); });
    expect(screen.getByTestId('mode').textContent).toBe('backfill');
    expect(screen.getByTestId('date').textContent).toBe('2026-01-01');
    await act(async () => { screen.getByText('gear').click(); });
    expect(screen.getByTestId('date').textContent).toBe('2026-10-16');
  });
  it('讀取 repos 中啟用的週計畫', async () => {
    const repos = createMemoryRepos();
    const p = await repos.plans.create({ name: '器材版', days: {}, isActive: true });
    renderWithApp(<Probe />, repos);
    await waitFor(() => expect(screen.getByTestId('plan').textContent).toBe(p.id));
  });
  it('setActivePlanId 寫入 repos', async () => {
    const repos = createMemoryRepos();
    const a = await repos.plans.create({ name: 'A', days: {}, isActive: true });
    const b = await repos.plans.create({ name: 'B', days: {} });
    let api!: ReturnType<typeof useAppState>;
    function Grab() {
      api = useAppState();
      return <p data-testid="plan">{api.activePlanId}</p>;
    }
    render(<ReposProvider repos={repos}><AppStateProvider><Grab /></AppStateProvider></ReposProvider>);
    await waitFor(() => expect(screen.getByTestId('plan').textContent).toBe(a.id));
    await act(async () => { await api.setActivePlanId(b.id); });
    expect((await repos.plans.getActive())?.id).toBe(b.id);
    await waitFor(() => expect(screen.getByTestId('plan').textContent).toBe(b.id));
  });
});

describe('useAsync', () => {
  it('loading → data，reload 會重新執行', async () => {
    let n = 0;
    let reload!: () => void;
    function C() {
      const api = useAsync(async () => ++n, []);
      reload = api.reload;
      return <p data-testid="v">{api.loading ? 'loading' : String(api.data)}</p>;
    }
    render(<C />);
    expect(screen.getByTestId('v').textContent).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('1'));
    await act(async () => reload());
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('2'));
  });
  it('錯誤進入 error 狀態', async () => {
    function C() {
      const { error, loading } = useAsync(async () => { throw new Error('壞了'); }, []);
      return <p data-testid="v">{loading ? 'loading' : error?.message}</p>;
    }
    render(<C />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('壞了'));
  });
  it('deps 改變時丟棄舊請求的結果', async () => {
    const resolvers: Record<number, (v: string) => void> = {};
    function C({ k }: { k: number }) {
      const { data } = useAsync(() => new Promise<string>((r) => { resolvers[k] = r; }), [k]);
      return <p data-testid="v">{data ?? '-'}</p>;
    }
    const { rerender } = render(<C k={1} />);
    await act(async () => { await Promise.resolve(); });
    rerender(<C k={2} />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { resolvers[2]('new'); });
    await act(async () => { resolvers[1]('old'); });
    expect(screen.getByTestId('v').textContent).toBe('new');
  });
});

describe('useRepoQuery', () => {
  it('查詢 repos，並在 invalidate 後重查', async () => {
    const repos = createMemoryRepos();
    await repos.bodyMetrics.add({ date: '2026-10-01', weightKg: 70 });
    let app!: ReturnType<typeof useAppState>;
    function C() {
      app = useAppState();
      const { data } = useRepoQuery((r) => r.bodyMetrics.list(), []);
      return <p data-testid="n">{data?.length ?? '-'}</p>;
    }
    renderWithApp(<C />, repos);
    await waitFor(() => expect(screen.getByTestId('n').textContent).toBe('1'));
    await repos.bodyMetrics.add({ date: '2026-10-02', weightKg: 71 });
    await act(async () => app.invalidate());
    await waitFor(() => expect(screen.getByTestId('n').textContent).toBe('2'));
  });
});

describe('createRepos', () => {
  it('依網址參數或環境變數選擇實作，預設記憶體版', () => {
    expect(resolveDbKind('', undefined)).toBe('memory');
    expect(resolveDbKind('?db=dexie', undefined)).toBe('dexie');
    expect(resolveDbKind('', 'dexie')).toBe('dexie');
    expect(resolveDbKind('?db=memory', 'dexie')).toBe('memory');
    expect(createRepos('memory').sessions).toBeTruthy();
  });
});
