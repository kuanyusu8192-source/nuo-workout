import { act, fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRepos } from '../../data/repos';
import type { Repos } from '../../data/repos/interfaces';
import { renderWithApp } from '../../test/helpers';
import { BackupServiceProvider, type BackupService } from './backupService';
import { SettingsScreen } from './SettingsScreen';

const PROFILE = {
  sex: 'male' as const, age: 30, heightCm: 175, weightKg: 70, pal: 1.55, goal: 'maintain' as const,
  tdee: 2555.56, kcalTarget: 2556, macros: { proteinG: 224, carbG: 160, fatG: 114 },
};

async function renderSettings(repos: Repos = createMemoryRepos()) {
  await repos.profile.save(PROFILE);
  const service = { export: vi.fn(async () => '{}'), import: vi.fn(async () => ({})) } as unknown as BackupService;
  renderWithApp(
    <BackupServiceProvider service={service}>
      <SettingsScreen />
    </BackupServiceProvider>,
    repos,
    { today: '2026-10-16' },
  );
  await screen.findByRole('heading', { name: '偏好設定' });
  return repos;
}

const click = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }));
const radio = (group: string, name: string) =>
  fireEvent.click(within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name }));

describe('資料：匯出訓練紀錄（給 AI 分析）', () => {
  const origShare = Object.getOwnPropertyDescriptor(navigator, 'share');
  const origCan = Object.getOwnPropertyDescriptor(navigator, 'canShare');
  const origClip = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  afterEach(() => {
    for (const [k, d] of [['share', origShare], ['canShare', origCan], ['clipboard', origClip]] as const) {
      if (d) Object.defineProperty(navigator, k, d);
      else delete (navigator as unknown as Record<string, unknown>)[k];
    }
    vi.restoreAllMocks();
  });

  const localToday = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  async function seeded(date = '2026-01-05') {
    const repos = createMemoryRepos();
    await repos.exercises.bulkPut([
      { id: 'bench', name: '槓鈴臥推', nameEn: 'Bench Press', category: '胸', equipment: '槓鈴', primaryMuscle: '胸肌', secondaryMuscles: [], trackingType: 'strength', steps: [], tips: '', gifFile: '', source: 'nuo' },
    ]);
    const s = await repos.sessions.create({ date, mode: 'normal' });
    await repos.sets.add({ sessionId: s.id, exerciseId: 'bench', setIndex: 1, kind: 'strength', weightKg: 40, reps: 10 });
    await repos.meals.add({ date, name: '雞胸', servings: 1, proteinG: 23, carbG: 0, fatG: 3, kcal: 130 });
    await repos.bodyMetrics.add({ date, weightKg: 70 });
    return repos;
  }
  const mockShare = () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    return share;
  };
  const sharedJson = async (share: ReturnType<typeof mockShare>) => {
    const arg = (share.mock.calls[0] as unknown as [{ files: File[] }])[0];
    return { file: arg.files[0], data: JSON.parse(await arg.files[0].text()) };
  };

  it('顯示說明、範圍（預設全部）與三個核取（預設全勾），且仍只有五個 h2', async () => {
    await renderSettings();
    expect(screen.getByRole('heading', { name: '匯出訓練紀錄（給 AI 分析）' })).toBeTruthy();
    expect(screen.getByText(/不含姓名與 Email/)).toBeTruthy();
    const group = screen.getByRole('radiogroup', { name: '匯出範圍' });
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['全部', '最近 90 天', '最近 30 天']);
    expect(within(group).getByRole('radio', { name: '全部' }).getAttribute('aria-checked')).toBe('true');
    for (const name of [/含飲食/, /含體重與體脂/, /含個人資料/]) {
      expect((screen.getByRole('checkbox', { name }) as HTMLInputElement).checked).toBe(true);
    }
    expect(screen.getByText(/性別、年齡、身高、體重/)).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(5);
  });

  it('「匯出 JSON」用 Web Share 分享檔案，檔名 nuo-history-YYYYMMDD-HHmm.json，內容為整理後格式', async () => {
    const share = mockShare();
    await renderSettings(await seeded());
    click('匯出 JSON');
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const { file, data } = await sharedJson(share);
    expect(file.name).toMatch(/^nuo-history-\d{8}-\d{4}\.json$/);
    expect(file.type).toBe('application/json');
    expect(data.format).toBe('nuo-fit-history');
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].exercises[0]).toMatchObject({ name: '槓鈴臥推', totalVolumeKg: 400, bestSet: { e1rmKg: 53.3 } });
    expect(data.profile.heightCm).toBe(175);
    expect(data.nutrition).toHaveLength(1);
    expect(data.bodyMetrics).toHaveLength(1);
    expect(JSON.stringify(data)).not.toMatch(/email/i);
    expect((await screen.findByText(/已匯出 1 場訓練/)).getAttribute('role')).toBe('status');
  });

  it('選項生效：最近 30 天排除舊資料、取消含飲食／體重／個人資料', async () => {
    const share = mockShare();
    const repos = await seeded('2020-01-01');
    const recent = await repos.sessions.create({ date: localToday(), mode: 'normal' });
    await repos.sets.add({ sessionId: recent.id, exerciseId: 'bench', setIndex: 1, kind: 'strength', weightKg: 50, reps: 5 });
    await renderSettings(repos);
    radio('匯出範圍', '最近 30 天');
    fireEvent.click(screen.getByRole('checkbox', { name: /含飲食/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /含體重與體脂/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /含個人資料/ }));
    click('匯出 JSON');
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const { data } = await sharedJson(share);
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].date).toBe(localToday());
    expect('nutrition' in data).toBe(false);
    expect('bodyMetrics' in data).toBe(false);
    expect('profile' in data).toBe(false);
  });

  it('不支援分享時改用下載連結，檔名相同', async () => {
    delete (navigator as unknown as Record<string, unknown>).share;
    delete (navigator as unknown as Record<string, unknown>).canShare;
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:hist'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await renderSettings(await seeded());
    click('匯出 JSON');
    const link = (await screen.findByRole('link', { name: /下載訓練紀錄/ })) as HTMLAnchorElement;
    expect(link.getAttribute('download')).toMatch(/^nuo-history-\d{8}-\d{4}\.json$/);
    expect(link.getAttribute('href')).toBe('blob:hist');
    expect(await screen.findByText(/已匯出 1 場訓練/)).toBeTruthy();
  });

  it('使用者取消分享（AbortError）不顯示錯誤', async () => {
    const share = vi.fn(async () => { throw new DOMException('cancel', 'AbortError'); });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    await renderSettings(await seeded());
    click('匯出 JSON');
    await waitFor(() => expect(share).toHaveBeenCalled());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('「複製到剪貼簿」成功：寫入完整 JSON 並顯示訊息', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await renderSettings(await seeded());
    click('複製到剪貼簿');
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const data = JSON.parse((writeText.mock.calls[0] as unknown as [string])[0]);
    expect(data.format).toBe('nuo-fit-history');
    expect(await screen.findByText(/已複製 1 場訓練/)).toBeTruthy();
    expect(screen.queryByLabelText(/可手動全選複製/)).toBeNull();
  });

  it('複製失敗：顯示可手動全選複製的文字框作為備援', async () => {
    const writeText = vi.fn(async () => { throw new Error('denied'); });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await renderSettings(await seeded());
    click('複製到剪貼簿');
    const box = (await screen.findByLabelText(/可手動全選複製/)) as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    expect(JSON.parse(box.value).format).toBe('nuo-fit-history');
    expect(screen.getByText(/無法自動複製/)).toBeTruthy();
  });

  it('沒有 clipboard API 時同樣走文字框備援', async () => {
    delete (navigator as unknown as Record<string, unknown>).clipboard;
    await renderSettings(await seeded());
    click('複製到剪貼簿');
    expect(await screen.findByLabelText(/可手動全選複製/)).toBeTruthy();
  });

  it('沒有任何紀錄：按鈕仍可用，訊息提醒「目前沒有訓練紀錄」且不分享', async () => {
    const share = mockShare();
    await renderSettings();
    expect((screen.getByRole('button', { name: '匯出 JSON' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: '複製到剪貼簿' }) as HTMLButtonElement).disabled).toBe(false);
    click('匯出 JSON');
    expect(await screen.findByText(/目前沒有訓練紀錄/)).toBeTruthy();
    expect(share).not.toHaveBeenCalled();
  });
});
