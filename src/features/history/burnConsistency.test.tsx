/** 整合測試：同一份資料，今日紀錄彈窗、歷史日曆（單日＋本月總消耗）、飲食頁的運動消耗必須是同一個數字。 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { AppStateProvider, ReposProvider } from '../../app/context';
import { ToastProvider } from '../../components';
import { createMemoryRepos } from '../../data/repos';
import type { Repos } from '../../data/repos/interfaces';
import { seedEmptyData } from '../../dev/fakeData';
import { makeExercise } from '../../test/helpers';
import { DietScreen } from '../diet/DietScreen';
import { TodayWorkout } from '../today/TodayWorkout';
import { HistoryScreen } from './HistoryScreen';

const TODAY = '2026-10-16';
const PROFILE = {
  sex: 'male', age: 30, heightCm: 170, weightKg: 70, pal: 1.2, goal: 'maintain',
  tdee: 2000, kcalTarget: 2000, macros: { proteinG: 150, carbG: 200, fatG: 60 },
} as const;
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
};

/** 70kg、MET 5.0、當天一個未結束的 session 只填 1 組重訓 → 5×70×3/60 = 17.5 → 18 */
async function oneSetRepos(): Promise<Repos> {
  const repos = createMemoryRepos();
  await seedEmptyData(repos, { today: TODAY, exercises: [makeExercise('bench', '槓鈴臥推')] });
  await repos.profile.save({ ...PROFILE, macros: { ...PROFILE.macros } });
  const s = await repos.sessions.create({ date: TODAY, mode: 'gear', startedAt: Date.now() });
  await repos.sets.add({ sessionId: s.id, exerciseId: 'bench', setIndex: 0, kind: 'strength', weightKg: 40, reps: 10 });
  return repos;
}

const mountWith = (repos: Repos, ui: preact.ComponentChildren) =>
  render(
    <ReposProvider repos={repos}>
      <AppStateProvider today={TODAY}>
        <ToastProvider>{ui}</ToastProvider>
      </AppStateProvider>
    </ReposProvider>,
  );

/** 再加 60 分鐘橢圓機（查表 5.0 MET、id 不含 elliptical）：18 + 350 = 368 */
async function withCardio(): Promise<Repos> {
  const repos = await oneSetRepos();
  await repos.exercises.bulkPut([makeExercise('cx1', '橢圓機', { trackingType: 'cardio', category: '有氧' })]);
  const s = (await repos.sessions.getByDate(TODAY))[0];
  await repos.sets.add({ sessionId: s.id, exerciseId: 'cx1', setIndex: 1, kind: 'cardio', durationSec: 3600 });
  return repos;
}

afterEach(cleanup);

describe('三個畫面的運動消耗一致', () => {
  it('今日紀錄彈窗 = 18 kcal', async () => {
    mountWith(await oneSetRepos(), <TodayWorkout />);
    await settle();
    fireEvent.click(await screen.findByRole('button', { name: '今日紀錄' }));
    const dlg = await screen.findByRole('dialog', { name: '今日訓練紀錄' });
    await waitFor(() => expect(dlg.textContent).toContain('約 18 kcal'));
  });

  it('歷史日曆：單日卡片與本月總消耗 = 18 kcal', async () => {
    mountWith(await oneSetRepos(), <HistoryScreen />);
    fireEvent.click(await screen.findByRole('tab', { name: '日曆' }));
    const metric = () => within(screen.getByRole('group', { name: '本月總消耗' })).getByTestId('metric-value').textContent;
    await waitFor(() => expect(metric()).toBe('18'));
    fireEvent.click(await screen.findByRole('gridcell', { name: /10 月 16 日/ }));
    const card = await screen.findByRole('region', { name: /2026-10-16 摘要/ });
    await waitFor(() => expect(card.textContent).toContain('18 kcal'));
  });

  it('飲食頁運動消耗 = 18 kcal', async () => {
    mountWith(await oneSetRepos(), <DietScreen />);
    await settle();
    await waitFor(() => expect(screen.getByTestId('burn').textContent).toContain('18'));
  });

  it('有手動覆寫時三處都顯示覆寫值', async () => {
    const repos = await oneSetRepos();
    await repos.burnOverrides.set(TODAY, 321);
    const diet = mountWith(repos, <DietScreen />);
    await settle();
    await waitFor(() => expect(screen.getByTestId('burn').textContent).toContain('321'));
    diet.unmount();
    mountWith(repos, <HistoryScreen />);
    fireEvent.click(await screen.findByRole('tab', { name: '日曆' }));
    await waitFor(() => expect(within(screen.getByRole('group', { name: '本月總消耗' })).getByTestId('metric-value').textContent).toBe('321'));
  });

  it('含有氧（橢圓機 60 分鐘）：三處都是 368，不再各算各的', async () => {
    const repos = await withCardio();
    const today = mountWith(repos, <TodayWorkout />);
    await settle();
    fireEvent.click(await screen.findByRole('button', { name: '今日紀錄' }));
    const dlg = await screen.findByRole('dialog', { name: '今日訓練紀錄' });
    await waitFor(() => expect(dlg.textContent).toContain('約 368 kcal'));
    today.unmount();

    const diet = mountWith(repos, <DietScreen />);
    await settle();
    await waitFor(() => expect(screen.getByTestId('burn').textContent).toContain('368'));
    diet.unmount();

    mountWith(repos, <HistoryScreen />);
    fireEvent.click(await screen.findByRole('tab', { name: '日曆' }));
    await waitFor(() => expect(within(screen.getByRole('group', { name: '本月總消耗' })).getByTestId('metric-value').textContent).toBe('368'));
    fireEvent.click(await screen.findByRole('gridcell', { name: /10 月 16 日/ }));
    const card = await screen.findByRole('region', { name: /2026-10-16 摘要/ });
    await waitFor(() => expect(card.textContent).toContain('368 kcal'));
  });
});
