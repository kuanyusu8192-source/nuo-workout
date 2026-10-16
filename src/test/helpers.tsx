import { act, render } from '@testing-library/preact';
import type { ComponentChildren } from 'preact';
import { App, Shell } from '../app/App';
import { AppStateProvider, ReposProvider } from '../app/context';
import { ToastProvider } from '../components/Toast';
import type { Repos } from '../data/repos/interfaces';
import type { Exercise } from '../data/types';
import { createMemoryRepos } from '../data/repos';
import { seedEmptyData } from '../dev/fakeData';

/** 帶 Repos 與 AppState 的 render。 */
export function renderWithApp(ui: ComponentChildren, repos: Repos = createMemoryRepos(), props: { today?: string } = {}) {
  const result = render(
    <ReposProvider repos={repos}>
      <AppStateProvider today={props.today}>{ui}</AppStateProvider>
    </ReposProvider>,
  );
  return { repos, ...result };
}

/** a11y：可互動元素必須有可辨識名稱。 */
export function accessibleName(el: Element): string {
  return (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
}

export const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/** 記憶體 repos，且已有 profile（不會被首次啟動導向問卷）；不灌動作庫（需要時自行 seed） */
export async function createProfiledRepos(): Promise<Repos> {
  const repos = createMemoryRepos();
  await seedEmptyData(repos, { exercises: [] });
  return repos;
}

/** 包好 ReposProvider／AppStateProvider／ToastProvider 的外殼（單獨渲染 Shell，不含首次啟動檢查）。 */
export function renderShell(repos: Repos = createMemoryRepos(), extra?: ComponentChildren) {
  const result = render(
    <ReposProvider repos={repos}>
      <AppStateProvider>
        <ToastProvider>
          <Shell />
          {extra}
        </ToastProvider>
      </AppStateProvider>
    </ReposProvider>,
  );
  return { repos, ...result };
}

/** 渲染完整 <App />（含首次啟動檢查）。 */
export function renderApp(repos: Repos = createMemoryRepos(), props: { onExit?: () => void } = {}) {
  const result = render(
    <ReposProvider repos={repos}>
      <App onExit={props.onExit} />
    </ReposProvider>,
  );
  return { repos, ...result };
}

/** 改 hash 並等路由與非同步載入跑完。 */
export async function goTo(hash: string, ms = 30) {
  await act(async () => {
    window.location.hash = hash;
    await new Promise((r) => setTimeout(r, ms));
  });
}

/** 測試用的最小動作（重訓）。 */
export function makeExercise(id: string, name: string, patch: Partial<Exercise> = {}): Exercise {
  return {
    id, name, nameEn: name, category: '胸', equipment: '槓鈴', primaryMuscle: '胸肌', secondaryMuscles: [],
    trackingType: 'strength', steps: ['步驟一'], tips: '', gifFile: '', source: 'nuo', ...patch,
  };
}
