/**
 * 依賴注入與全域狀態。畫面只依賴 `Repos` 介面（useRepos），不得直接 import memory/dexie 實作。
 */
import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Repos } from '../data/repos/interfaces';
import { toDateStr } from '../domain/dates';
import type { DateStr } from '../domain/types';
import type { AppMode } from '../features/shared';

// ---------- Repos ----------

const ReposContext = createContext<Repos | null>(null);

export function ReposProvider({ repos, children }: { repos: Repos; children?: ComponentChildren }) {
  return <ReposContext.Provider value={repos}>{children}</ReposContext.Provider>;
}

export function useRepos(): Repos {
  const r = useContext(ReposContext);
  if (!r) throw new Error('useRepos 必須在 <ReposProvider> 內使用');
  return r;
}

// ---------- AppState ----------

export interface AppState {
  mode: AppMode;
  setMode(mode: AppMode): void;
  /** 啟用中週計畫 id（null = 尚無）。setActivePlanId 會同步寫入 repos.plans.setActive */
  activePlanId: string | null;
  setActivePlanId(id: string): Promise<void>;
  /** 目前瀏覽／記錄的日期（預設今天；補記模式下可改） */
  selectedDate: DateStr;
  setSelectedDate(d: DateStr): void;
  /** 今天（啟動時決定） */
  today: DateStr;
  /**
   * 資料版本號。任何畫面寫入資料後呼叫 invalidate()，所有 useRepoQuery 會自動重查。
   */
  dataVersion: number;
  invalidate(): void;
}

const AppStateContext = createContext<AppState | null>(null);

export interface AppStateProviderProps {
  children?: ComponentChildren;
  /** 測試用：指定「今天」與初始模式 */
  today?: DateStr;
  initialMode?: AppMode;
}

export function AppStateProvider({ children, today: todayProp, initialMode = 'gear' }: AppStateProviderProps) {
  const repos = useRepos();
  const today = useMemo(() => todayProp ?? toDateStr(new Date()), [todayProp]);
  const [mode, setModeState] = useState<AppMode>(initialMode);
  const [activePlanId, setActivePlanIdState] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<DateStr>(today);
  const [dataVersion, setDataVersion] = useState(0);

  const setMode = useCallback(
    (m: AppMode) => {
      setModeState(m);
      // 離開補記模式就回到今天，避免誤把今天的訓練記到過去
      if (m !== 'backfill') setSelectedDate(today);
    },
    [today],
  );

  useEffect(() => {
    let alive = true;
    repos.plans.getActive().then((p) => alive && setActivePlanIdState(p?.id ?? null));
    return () => {
      alive = false;
    };
  }, [repos, dataVersion]);

  const setActivePlanId = useCallback(
    async (id: string) => {
      await repos.plans.setActive(id);
      setActivePlanIdState(id);
      setDataVersion((v) => v + 1);
    },
    [repos],
  );
  const invalidate = useCallback(() => setDataVersion((v) => v + 1), []);

  const value = useMemo<AppState>(
    () => ({ mode, setMode, activePlanId, setActivePlanId, selectedDate, setSelectedDate, today, dataVersion, invalidate }),
    [mode, setMode, activePlanId, setActivePlanId, selectedDate, today, dataVersion, invalidate],
  );
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const s = useContext(AppStateContext);
  if (!s) throw new Error('useAppState 必須在 <AppStateProvider> 內使用');
  return s;
}

// ---------- 資料 hooks ----------

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload(): void;
}

/**
 * 簡單的非同步資料 hook。deps 改變或呼叫 reload() 會重新執行；舊請求的結果會被丟棄。
 * 重新載入時保留舊 data（避免畫面閃爍），loading 為 true。
 */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    Promise.resolve()
      .then(() => fnRef.current())
      .then(
        (data) => alive && setState({ data, loading: false }),
        (e) => alive && setState((s) => ({ data: s.data, error: e instanceof Error ? e : new Error(String(e)), loading: false })),
      );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

/**
 * 查 Repos：`useRepoQuery((r) => r.sessions.getByDate(d), [d])`。
 * 會在 AppState.dataVersion 變動（invalidate）時自動重查。
 */
export function useRepoQuery<T>(query: (repos: Repos) => Promise<T>, deps: readonly unknown[] = []): AsyncState<T> {
  const repos = useRepos();
  const app = useContext(AppStateContext);
  return useAsync(() => query(repos), [repos, app?.dataVersion ?? 0, ...deps]);
}
