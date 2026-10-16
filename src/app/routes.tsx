/** 路由表。新增畫面：在這裡加一筆（見 src/app/README.md）。 */
import type { VNode } from 'preact';
import type { IconName } from '../components/Icon';
import { ExerciseDetail } from '../features/exercises/ExerciseDetail';
import { ExercisePicker } from '../features/exercises/ExercisePicker';
import { DietScreen } from '../features/diet/DietScreen';
import { HistoryScreen } from '../features/history/HistoryScreen';
import { OnboardingFlow } from '../features/onboarding/OnboardingFlow';
import { PlansScreen } from '../features/plans/PlansScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { TodayWorkout } from '../features/today/TodayWorkout';
import type { ExerciseDetailTab } from '../features/shared';
import { useRepoQuery } from './context';
import { goBack, matchPath, navigate, type Route } from './router';
import { paths } from './paths';

export type TabId = 'today' | 'history' | 'plans' | 'diet' | 'settings';

export const TABS: ReadonlyArray<{ id: TabId; path: string; label: string; icon: IconName }> = [
  { id: 'today', path: paths.today, label: '今日', icon: 'home' },
  { id: 'history', path: paths.history, label: '歷史', icon: 'calendar' },
  { id: 'plans', path: paths.plans, label: '計畫', icon: 'list-checks' },
  { id: 'diet', path: paths.diet, label: '飲食', icon: 'utensils' },
  { id: 'settings', path: paths.settings, label: '設定', icon: 'settings' },
];

export interface RouteContext {
  params: Record<string, string>;
  query: URLSearchParams;
}

export interface AppRoute {
  /** 支援 :param 與結尾 /*（巢狀） */
  pattern: string;
  /** 標頭標題 */
  title: string;
  /** 屬於哪個底部分頁（有值＝顯示底部分頁列且為根畫面；沒有＝全螢幕子頁，標頭顯示返回鍵） */
  tab?: TabId;
  render: (ctx: RouteContext) => VNode;
}

const DETAIL_TABS: ExerciseDetailTab[] = ['tutorial', 'record', 'chart', 'history'];

export const ROUTES: ReadonlyArray<AppRoute> = [
  { pattern: '/today', title: '今日', tab: 'today', render: () => <TodayWorkout /> },
  { pattern: '/history', title: '歷史', tab: 'history', render: () => <HistoryScreen /> },
  { pattern: '/plans', title: '計畫', tab: 'plans', render: () => <PlansScreen /> },
  { pattern: '/diet', title: '飲食', tab: 'diet', render: () => <DietScreen /> },
  { pattern: '/settings', title: '設定', tab: 'settings', render: () => <SettingsScreen /> },
  {
    pattern: '/exercise/:id',
    title: '動作詳情',
    render: ({ params, query }) => {
      const t = query.get('tab') as ExerciseDetailTab | null;
      return (
        <ExerciseDetailRoute
          exerciseId={params.id}
          initialTab={t && DETAIL_TABS.includes(t) ? t : undefined}
        />
      );
    },
  },
  {
    pattern: '/picker',
    title: '選擇動作',
    render: ({ query }) => (
      <div class="route-embed">
        <ExercisePicker mode={query.get('mode') === 'multi' ? 'multi' : 'single'} onClose={() => goBack()} />
      </div>
    ),
  },
  {
    pattern: '/onboarding',
    title: '建立個人資料',
    render: () => <OnboardingFlow onDone={() => navigate(paths.today, { replace: true })} />,
  },
];

/**
 * 動作詳情路由。元件自帶標頭（返回鈕＋動作名稱）與外殼標頭重複：app.css 隱藏元件標頭（.route-embed 內），
 * 外殼標頭保留返回與標題「動作詳情」，動作名稱改由這裡以 h2 顯示。
 */
function ExerciseDetailRoute({ exerciseId, initialTab }: { exerciseId: string; initialTab?: ExerciseDetailTab }) {
  const ex = useRepoQuery((r) => r.exercises.get(exerciseId), [exerciseId]);
  return (
    <div class="route-embed">
      {ex.data ? <h2 class="route-embed__name">{ex.data.name}</h2> : null}
      <ExerciseDetail exerciseId={exerciseId} initialTab={initialTab} onClose={() => goBack()} />
    </div>
  );
}

export interface ResolvedRoute {
  route: AppRoute;
  ctx: RouteContext;
}

export function resolveRoute(r: Route, routes: ReadonlyArray<AppRoute> = ROUTES): ResolvedRoute | null {
  for (const route of routes) {
    const params = matchPath(route.pattern, r.pathname);
    if (params) return { route, ctx: { params, query: r.query } };
  }
  return null;
}
