import { useEffect } from 'preact/hooks';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { ToastProvider } from '../components/Toast';
import { MODE_COLOR_VAR, MODE_LABELS } from '../features/shared';
import { installBackHandling } from './back';
import { AppStateProvider, useAppState } from './context';
import { goBack, href, navigate, parseHash, useRoute } from './router';
import { resolveRoute, TABS } from './routes';
import { paths } from './paths';

export interface AppProps {
  /** 沒有上一頁、且在根畫面按返回時呼叫（Capacitor 之後接 App.exitApp） */
  onExit?: () => void;
}

/** 外殼：標頭（模式色＋文字標籤）、路由內容、底部五分頁。需在 ReposProvider 內。 */
export function App({ onExit }: AppProps) {
  return (
    <AppStateProvider>
      <ToastProvider>
        <Shell onExit={onExit} />
      </ToastProvider>
    </AppStateProvider>
  );
}

/** 外殼本體（不含 Provider）；測試可在自己的 AppStateProvider 內渲染它 */
export function Shell({ onExit }: AppProps) {
  const route = useRoute();
  const { mode } = useAppState();
  const resolved = route.pathname === '/' ? null : resolveRoute(route);
  const tab = resolved?.route.tab;

  // 空路由 → 今日
  useEffect(() => {
    if (route.pathname === '/') navigate(paths.today, { replace: true });
  }, [route.pathname]);

  useEffect(
    () =>
      installBackHandling({
        isRoot: () => !!resolveRoute(parseHash(window.location.hash))?.route.tab,
        goBack: () => goBack(),
        exit: () => onExit?.(),
      }),
    [onExit],
  );

  return (
    <div class="app-shell">
      <header class="app-header" data-mode={mode} style={{ background: MODE_COLOR_VAR[mode] }}>
        {resolved && !tab ? <IconButton icon="chevron-left" label="返回" variant="onDark" onClick={() => goBack()} /> : <span class="app-header__spacer" />}
        <h1 class="app-header__title">{resolved?.route.title ?? 'NUO Fit'}</h1>
        <span class="app-header__mode" data-testid="mode-label">{MODE_LABELS[mode]}</span>
      </header>

      <main class={`app-main${tab ? ' has-nav' : ''}`} id="main">
        {resolved ? (
          resolved.route.render(resolved.ctx)
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
