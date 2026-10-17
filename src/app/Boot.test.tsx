import { act, fireEvent, screen, waitFor, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupService } from '../features/settings/backupService';
import { createProfiledRepos } from '../test/helpers';
import { dispatchBackEvent } from './back';
import { Boot } from './Boot';
import { bootstrap, EXERCISE_SEED_VERSION, type Booted } from './bootstrap';

const wait = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe('Boot 啟動外殼', () => {
  beforeEach(() => {
    window.location.hash = '#/today';
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('啟動中顯示 Skeleton，完成後顯示 App', async () => {
    let finish!: (b: Booted) => void;
    render(<Boot boot={() => new Promise<Booted>((r) => (finish = r))} />);
    await wait(); // useAsync 於下一個微任務才呼叫 boot
    expect(screen.queryByRole('status', { name: '資料庫載入中' })).toBeNull(); // 骨架延遲 150ms 才顯示
    await wait(200);
    expect(screen.getByRole('status', { name: '資料庫載入中' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: '主要分頁' })).toBeNull();
    await act(async () => finish({ repos: await createProfiledRepos(), kind: 'memory' }));
    expect(await screen.findByRole('navigation', { name: '主要分頁' })).toBeTruthy();
    expect(screen.queryByRole('status', { name: '資料庫載入中' })).toBeNull();
  });

  it('啟動失敗顯示錯誤與重試；重試成功後進入 App', async () => {
    const repos = await createProfiledRepos();
    const boot = vi.fn<() => Promise<Booted>>().mockRejectedValueOnce(new Error('IndexedDB 被封鎖')).mockResolvedValue({ repos, kind: 'memory' });
    render(<Boot boot={boot} />);
    expect(await screen.findByText('啟動失敗')).toBeTruthy();
    expect(screen.getByText('IndexedDB 被封鎖')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(await screen.findByRole('navigation', { name: '主要分頁' })).toBeTruthy();
    expect(boot).toHaveBeenCalledTimes(2);
  });

  it('bootstrap 提供的 BackupService 會注入設定畫面（匯出走它）', async () => {
    const backup: BackupService = { export: vi.fn(async () => '{"fake":true}'), import: vi.fn(async () => ({})) };
    const created = vi.fn(() => 'blob:fake');
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    render(<Boot boot={async () => ({ repos: await createProfiledRepos(), kind: 'dexie', backup })} />);
    await screen.findByRole('navigation', { name: '主要分頁' });
    await act(async () => { window.location.hash = '#/settings'; await new Promise((r) => setTimeout(r, 30)); });
    fireEvent.click(await screen.findByRole('button', { name: '匯出備份' }));
    await waitFor(() => expect(backup.export).toHaveBeenCalledTimes(1));
  });
});

describe('bootstrap', () => {
  it('?db=memory：記憶體版，灌入動作庫，不提供 BackupService', async () => {
    const b = await bootstrap('?db=memory');
    expect(b.kind).toBe('memory');
    expect(b.backup).toBeUndefined();
    expect((await b.repos.exercises.list()).length).toBeGreaterThan(1000);
    expect((await b.repos.settings.get()).exerciseSeedVersion).toBe(EXERCISE_SEED_VERSION);
  });

  it('?fake=1：記憶體版假資料（有 profile 與訓練紀錄），不碰 Dexie', async () => {
    const b = await bootstrap('?fake=1');
    expect(b.kind).toBe('memory');
    expect(b.backup).toBeUndefined();
    expect(await b.repos.profile.get()).toBeTruthy();
    expect((await b.repos.sessions.listByRange({})).length).toBeGreaterThan(10);
  });

  it('?db=dexie：Dexie 版，灌入動作庫一次，提供 BackupService；重啟不重灌且保留資料', async () => {
    const b = await bootstrap('?db=dexie');
    expect(b.kind).toBe('dexie');
    expect(b.backup).toBeTruthy();
    const n = (await b.repos.exercises.list()).length;
    expect(n).toBeGreaterThan(1000);
    expect((await b.repos.settings.get()).exerciseSeedVersion).toBe(EXERCISE_SEED_VERSION);
    const custom = await b.repos.exercises.addCustom({
      name: '自訂動作', nameEn: '', category: '胸', equipment: '', primaryMuscle: '', secondaryMuscles: [],
      trackingType: 'strength', steps: [], tips: '', gifFile: '',
    });
    const again = await bootstrap('?db=dexie');
    expect(await again.repos.exercises.get(custom.id)).toBeTruthy();
    expect((await again.repos.exercises.list()).length).toBe(n + 1);
  });

  it('測試環境預設記憶體版', async () => {
    expect((await bootstrap('')).kind).toBe('memory');
  });

  it('onExit 會傳給 App：根畫面按返回鍵呼叫它', async () => {
    const onExit = vi.fn();
    const repos = await createProfiledRepos();
    render(<Boot boot={async () => ({ repos, kind: 'memory' })} onExit={onExit} />);
    await screen.findByRole('navigation', { name: '主要分頁' });
    act(() => dispatchBackEvent());
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
