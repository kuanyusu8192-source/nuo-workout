import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { ToastProvider } from '../components/Toast';
import { Skeleton } from '../components/Skeleton';
import { MODE_COLOR_VAR } from '../features/shared';
import { installBackHandling } from './back';
import { AppStateProvider, useAppState, useAsync, useRepos } from './context';
import { goBack, href, navigate, parseHash, useRoute } from './router';
import { resolveRoute, TABS } from './routes';
import { paths } from './paths';

export interface AppProps {
  /** 沒有上一頁、且在根畫面按返回時呼叫（Capacitor 之後接 App.exitApp） */
  onExit?: () => void;
}

/** 外殼：標頭（補記時顯示「補記」標籤與補記色）、路由內容、底部五分頁。需在 ReposProvider 內。 */
export function App({ onExit }: AppProps) {
  return (
    <AppStateProvider>
      <ToastProvider>
        <FirstRunGate>
          <Shell onExit={onExit} />
        </FirstRunGate>
      </ToastProvider>
    </AppStateProvider>
  );
}

/**
 * 首次啟動：還沒有 profile 就導向問卷（replace，返回鍵不會回到被取代的畫面）。
 * 只在掛載時檢查一次；檢查完成前顯示 Skeleton，避免先閃一下今日畫面。檢查失敗不擋 App（當作已有資料）。
 */
function FirstRunGate({ children }: { children?: ComponentChildren }) {
  const repos = useRepos();
  const q = useAsync(async () => {
    const profile = await repos.profile.get();
    if (!profile && parseHash(window.location.hash).pathname !== paths.onboarding) {
      navigate(paths.onboarding, { replace: true });
    }
    return true;
  }, [repos]);
  if (q.loading && !q.data && !q.error) {
    return (
      <main class="app-boot">
        <Skeleton height={48} lines={4} label="載入中" />
      </main>
    );
  }
  return <>{children}</>;
}

/** 外殼本體（不含 Provider）；測試可在自己的 AppStateProvider 內渲染它 */
export function Shell({ onExit }: AppProps) {
  const route = useRoute();
  const { selectedDate, today } = useAppState();
  const backfill = selectedDate !== today;
  const resolved = route.pathname === '/' ? null : resolveRoute(route);
  const tab = resolved?.route.tab;
  const onboarding = route.pathname === paths.onboarding;

  // 空路由 → 今日
  useEffect(() => {
    if (route.pathname === '/') navigate(paths.today, { replace: true });
  }, [route.pathname]);

  useEffect(
    () =>
      installBackHandling({
        // 分頁畫面與首次問卷都視為根畫面：返回鍵＝離開 App（問卷不能被返回鍵跳過）
        isRoot: () => {
          const p = parseHash(window.location.hash);
          return p.pathname === paths.onboarding || !!resolveRoute(p)?.route.tab;
        },
        goBack: () => goBack(),
        exit: () => onExit?.(),
      }),
    [onExit],
  );

  return (
    <div class="app-shell">
      <header class="app-header" style={{ background: backfill ? MODE_COLOR_VAR.backfill : 'var(--ink)' }}>
        {resolved && !tab && !onboarding ? <IconButton icon="chevron-left" label="返回" variant="onDark" onClick={() => goBack()} /> : <span class="app-header__spacer" />}
        <h1 class="app-header__title">{resolved?.route.title ?? 'NUO Fit'}</h1>
        {backfill ? <span class="app-header__mode" data-testid="mode-label">補記</span> : null}
      </header>

      <main class={`app-main${tab ? ' has-nav' : ''}`} id="main">
        {resolved ? (
          <div class={`route-view ${tab ? 'route-view--fade' : 'route-view--slide'}`} key={route.pathname}>
            {resolved.route.render(resolved.ctx)}
          </div>
        ) : route.pathname === '/' ? null : (
          <EmptyState title="找不到這個畫面" actionLabel="回到今日" onAction={() => navigate(paths.today, { replace: true })} />
        )}
      </main>

      {tab ? (
        <nav class="app-nav" aria-label="主要分頁">
          {TABS.map((t) => {
            const current = t.id === tab;
            return (
              <a
                key={t.id}
                class={`app-nav__item${current ? ' is-current' : ''}`}
                href={href(t.path)}
                aria-current={current ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  // 分頁切換用 replace，返回鍵不會在分頁間來回
                  if (!current) navigate(t.path, { replace: true });
                }}
              >
                <Icon name={t.icon} />
                <span>{t.label}</span>
              </a>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
