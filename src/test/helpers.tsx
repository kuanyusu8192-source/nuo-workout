import { render } from '@testing-library/preact';
import type { ComponentChildren } from 'preact';
import { AppStateProvider, ReposProvider } from '../app/context';
import type { Repos } from '../data/repos/interfaces';
import { createMemoryRepos } from '../data/repos';

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
