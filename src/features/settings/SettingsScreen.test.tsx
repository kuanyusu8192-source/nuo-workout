import { act, fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRepos } from '../../data/repos';
import type { Repos } from '../../data/repos/interfaces';
import type { BodyMetric, DateRange } from '../../data/types';
import { renderWithApp } from '../../test/helpers';
import { BackupServiceProvider, type BackupService } from './backupService';
import { SettingsScreen } from './SettingsScreen';

const TODAY = '2026-10-16';

const PROFILE = {
  sex: 'male' as const, age: 30, heightCm: 175, weightKg: 70, pal: 1.55, goal: 'maintain' as const,
  tdee: 2555.56, kcalTarget: 2556, macros: { proteinG: 224, carbG: 160, fatG: 114 },
};

function fakeService(over: Partial<BackupService> = {}): BackupService & { export: ReturnType<typeof vi.fn>; import: ReturnType<typeof vi.fn> } {
  return {
    export: vi.fn(async () => '{"app":"nuo-fit","version":1}'),
    import: vi.fn(async () => ({ sessions: 3, sets: 20 })),
    ...over,
  } as never;
}

async function renderSettings(opts: { repos?: Repos; service?: BackupService; profile?: boolean } = {}) {
  const repos = opts.repos ?? createMemoryRepos();
  if (opts.profile !== false) await repos.profile.save(PROFILE);
  const service = opts.service ?? fakeService();
  const r = renderWithApp(
    <BackupServiceProvider service={service}>
      <SettingsScreen />
    </BackupServiceProvider>,
    repos,
    { today: TODAY },
  );
  await screen.findByRole('heading', { name: '偏好設定' });
  return { service, ...r };
}

const click = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }));
const radio = (group: string, name: string) =>
  fireEvent.click(within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name }));
const type = (label: RegExp | string, value: string) =>
  fireEvent.input(screen.getByLabelText(label), { target: { value } });

describe('版面', () => {
  it('依序有 偏好設定／營養／體重與體脂／資料／關於 區塊，沒有帳戶區', async () => {
    await renderSettings();
    const heads = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(heads).toEqual(['偏好設定', '營養', '體重與體脂', '資料', '關於']);
    expect(screen.queryByText(/登入|帳戶/)).toBeNull();
    expect(screen.getByText('NUO Fit')).toBeTruthy();
  });
});

describe('偏好設定', () => {
  it('顯示預設值', async () => {
    await renderSettings();
    expect(within(screen.getByRole('radiogroup', { name: '體重單位' })).getByRole('radio', { name: 'kg' }).getAttribute('aria-checked')).toBe('true');
    expect(within(screen.getByRole('radiogroup', { name: '重量單位' })).getByRole('radio', { name: 'kg' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('rest-value').textContent).toBe('90 秒');
    expect((screen.getByRole('switch', { name: /運動消耗/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('switch', { name: /Health Connect/ }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/重訓 MET/) as HTMLInputElement).value).toBe('5');
  });

  it('體重單位與重量單位獨立切換，只改設定值', async () => {
    const { repos } = await renderSettings();
    await repos.bodyMetrics.add({ date: TODAY, weightKg: 70 });
    radio('體重單位', 'lb');
    await waitFor(async () => expect((await repos.settings.get()).weightUnit).toBe('lb'));
    expect((await repos.settings.get()).loadUnit).toBe('kg');
    radio('重量單位', 'lb');
    await waitFor(async () => expect((await repos.settings.get()).loadUnit).toBe('lb'));
    // 既有資料仍以 kg 儲存
    expect((await repos.bodyMetrics.list())[0].weightKg).toBe(70);
    expect((await repos.profile.get())!.weightKg).toBe(70);
  });

  it('休息秒數以 15 為步進、限制在 30–300', async () => {
    const { repos } = await renderSettings();
    click('增加休息秒數');
    await waitFor(() => expect(screen.getByTestId('rest-value').textContent).toBe('105 秒'));
    expect((await repos.settings.get()).restDefaultSec).toBe(105);
    click('減少休息秒數');
    click('減少休息秒數');
    await waitFor(() => expect(screen.getByTestId('rest-value').textContent).toBe('75 秒'));
    expect((await repos.settings.get()).restDefaultSec).toBe(75);
  });

  it('休息秒數到上下限時按鈕停用', async () => {
    const repos = createMemoryRepos();
    await repos.settings.patch({ restDefaultSec: 300 });
    await renderSettings({ repos });
    expect((screen.getByRole('button', { name: '增加休息秒數' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '減少休息秒數' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('休息秒數下限 30', async () => {
    const repos = createMemoryRepos();
    await repos.settings.patch({ restDefaultSec: 30 });
    await renderSettings({ repos });
    expect((screen.getByRole('button', { name: '減少休息秒數' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('「運動消耗計入每日可用熱量」開關寫回設定', async () => {
    const { repos } = await renderSettings();
    fireEvent.click(screen.getByRole('switch', { name: /運動消耗/ }));
    await waitFor(async () => expect((await repos.settings.get()).countBurnToBudget).toBe(false));
    fireEvent.click(screen.getByRole('switch', { name: /運動消耗/ }));
    await waitFor(async () => expect((await repos.settings.get()).countBurnToBudget).toBe(true));
  });

  it('Health Connect 開關只儲存設定，並註明尚未接上', async () => {
    const { repos } = await renderSettings();
    expect(screen.getByText(/尚未接上/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: /Health Connect/ }));
    await waitFor(async () => expect((await repos.settings.get()).healthConnect).toBe(true));
  });

  it('重訓 MET 可調 3–8：合法值寫入、越界顯示錯誤且不寫入', async () => {
    const { repos } = await renderSettings();
    type(/重訓 MET/, '6.5');
    await waitFor(async () => expect((await repos.settings.get()).metStrength).toBe(6.5));
    type(/重訓 MET/, '9');
    expect(screen.getByText('重訓 MET需介於 3–8')).toBeTruthy();
    type(/重訓 MET/, '2.9');
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect((await repos.settings.get()).metStrength).toBe(6.5);
    expect(screen.getByText(/一般重訓約 5/)).toBeTruthy();
  });
});

describe('營養：自訂每日營養目標', () => {
  it('164/117/83 → 唯讀顯示熱量 1871，儲存寫回 profile.macros 與 kcalTarget', async () => {
    const { repos } = await renderSettings();
    type(/蛋白質/, '164');
    type(/碳水/, '117');
    type(/脂肪/, '83');
    expect(screen.getByTestId('macro-kcal').textContent).toContain('1871');
    expect(screen.getByTestId('macro-kcal').tagName).toBe('OUTPUT');
    click('儲存營養目標');
    await waitFor(async () => expect((await repos.profile.get())!.kcalTarget).toBe(1871));
    const p = (await repos.profile.get())!;
    expect(p.macros).toEqual({ proteinG: 164, carbG: 117, fatG: 83 });
    // 其他欄位不變
    expect(p).toMatchObject({ sex: 'male', age: 30, weightKg: 70, tdee: 2555.56 });
  });

  it('預設帶入目前 profile.macros 與目標熱量', async () => {
    await renderSettings();
    expect((screen.getByLabelText(/蛋白質/) as HTMLInputElement).value).toBe('224');
    expect(screen.getByTestId('macro-kcal').textContent).toContain('2562'); // 224*4 + 160*4 + 114*9（與 kcalTarget 2556 因克數四捨五入差 6）
  });

  it('欄位不合法時停用儲存', async () => {
    await renderSettings();
    type(/蛋白質/, '');
    expect((screen.getByRole('button', { name: '儲存營養目標' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('「恢復依 TDEE 計算」把克數與熱量還原成 35/25/40 分配', async () => {
    const { repos } = await renderSettings();
    type(/蛋白質/, '164');
    type(/碳水/, '117');
    type(/脂肪/, '83');
    click('儲存營養目標');
    await waitFor(async () => expect((await repos.profile.get())!.kcalTarget).toBe(1871));
    click('恢復依 TDEE 計算');
    await waitFor(async () => expect((await repos.profile.get())!.kcalTarget).toBe(2556));
    expect((await repos.profile.get())!.macros).toEqual({ proteinG: 224, carbG: 160, fatG: 114 });
    await waitFor(() => expect((screen.getByLabelText(/蛋白質/) as HTMLInputElement).value).toBe('224'));
  });

  it('尚無 profile 時提示先做問卷，不顯示表單', async () => {
    await renderSettings({ profile: false });
    expect(screen.getByText(/尚未建立個人資料/)).toBeTruthy();
    expect(screen.queryByLabelText(/蛋白質/)).toBeNull();
  });
});

describe('營養：重新計算 TDEE', () => {
  it('在 Sheet 內開啟問卷（預填），完成後關閉並更新 profile', async () => {
    const { repos } = await renderSettings();
    click('重新計算 TDEE');
    const sheet = await screen.findByRole('dialog', { name: '重新計算 TDEE' });
    await within(sheet).findByText('1/3');
    await waitFor(() => expect((within(sheet).getByLabelText(/體重/) as HTMLInputElement).value).toBe('70'));
    fireEvent.input(within(sheet).getByLabelText(/體重/), { target: { value: '65' } });
    fireEvent.click(within(sheet).getByRole('button', { name: '下一步' }));
    fireEvent.click(within(sheet).getByRole('button', { name: '下一步' }));
    fireEvent.click(within(sheet).getByRole('radio', { name: /減脂/ }));
    fireEvent.click(within(sheet).getByRole('button', { name: '完成' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '重新計算 TDEE' })).toBeNull());
    const p = (await repos.profile.get())!;
    expect(p.weightKg).toBe(65);
    expect(p.goal).toBe('cut');
    // bmr = 650 + 1093.75 − 150 + 5 = 1598.75；tdee = 2478.0625；目標 = round(×0.8) = 1982
    expect(p.kcalTarget).toBe(1982);
    // 營養表單同步更新
    await waitFor(() => expect((screen.getByLabelText(/蛋白質/) as HTMLInputElement).value).toBe('173'));
  });

  it('沒有 profile 也能開啟問卷', async () => {
    await renderSettings({ profile: false });
    click('重新計算 TDEE');
    expect(await screen.findByText('1/3')).toBeTruthy();
  });
});

describe('體重與體脂', () => {
  const add = (repos: Repos, m: Omit<BodyMetric, 'id'>) => repos.bodyMetrics.add(m);

  it('沒有紀錄時顯示空狀態', async () => {
    await renderSettings();
    expect(await screen.findByText(/還沒有體重紀錄/)).toBeTruthy();
  });

  it('新增體重（日期預設今天）與體脂，列表立即出現，由新到舊', async () => {
    const repos = createMemoryRepos();
    await add(repos, { date: '2026-10-01', weightKg: 71 });
    await renderSettings({ repos });
    expect((screen.getByLabelText('日期') as HTMLInputElement).value).toBe(TODAY);
    type(/體重（kg）/, '72.5');
    type(/體脂/, '20.5');
    click('新增紀錄');
    await waitFor(async () => expect(await repos.bodyMetrics.list()).toHaveLength(2));
    const added = (await repos.bodyMetrics.list()).find((m) => m.date === TODAY)!;
    expect(added).toMatchObject({ weightKg: 72.5, bodyFatPct: 20.5 });
    const list = await screen.findByRole('list', { name: '體重紀錄' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0].textContent).toContain(TODAY);
    expect(items[0].textContent).toContain('72.5');
    expect(items[0].textContent).toContain('20.5');
    expect(items[1].textContent).toContain('2026-10-01');
  });

  it('體脂可省略；體重為必填且須 30–300', async () => {
    const { repos } = await renderSettings();
    expect((screen.getByRole('button', { name: '新增紀錄' }) as HTMLButtonElement).disabled).toBe(true);
    type(/體重（kg）/, '29');
    expect(screen.getByText('體重需介於 30–300')).toBeTruthy();
    expect((screen.getByRole('button', { name: '新增紀錄' }) as HTMLButtonElement).disabled).toBe(true);
    type(/體重（kg）/, '70');
    click('新增紀錄');
    await waitFor(async () => expect(await repos.bodyMetrics.list()).toHaveLength(1));
    expect((await repos.bodyMetrics.list())[0].bodyFatPct).toBeUndefined();
  });

  it('體脂超出 3–60 時顯示錯誤並擋住新增', async () => {
    await renderSettings();
    type(/體重（kg）/, '70');
    type(/體脂/, '80');
    expect(screen.getByText('體脂需介於 3–60')).toBeTruthy();
    expect((screen.getByRole('button', { name: '新增紀錄' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('體重單位為 lb 時以 lb 輸入並換算成 kg 儲存，列表以 lb 顯示', async () => {
    const repos = createMemoryRepos();
    await repos.settings.patch({ weightUnit: 'lb' });
    await renderSettings({ repos });
    type(/體重（lb）/, '154.3');
    click('新增紀錄');
    await waitFor(async () => expect(await repos.bodyMetrics.list()).toHaveLength(1));
    expect((await repos.bodyMetrics.list())[0].weightKg).toBe(69.99);
    const list = await screen.findByRole('list', { name: '體重紀錄' });
    expect(list.textContent).toContain('154.3 lb');
  });

  describe('刪除與 5 秒復原', () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    afterEach(() => vi.useRealTimers());

    function reposWithRemove() {
      const base = createMemoryRepos();
      const gone = new Set<string>();
      const remove = vi.fn(async (id: string) => { gone.add(id); });
      const repos: Repos = {
        ...base,
        bodyMetrics: {
          ...base.bodyMetrics,
          list: async (r?: DateRange) => (await base.bodyMetrics.list(r)).filter((m) => !gone.has(m.id)),
          remove,
        } as never,
      };
      return { repos, remove };
    }

    it('刪除後列隱藏並出現復原列；5 秒內復原則不真正刪除', async () => {
      const { repos, remove } = reposWithRemove();
      await add(repos, { date: '2026-10-10', weightKg: 71 });
      await renderSettings({ repos });
      fireEvent.click(await screen.findByRole('button', { name: '刪除 2026-10-10 的體重紀錄' }));
      expect(screen.queryByRole('button', { name: '刪除 2026-10-10 的體重紀錄' })).toBeNull();
      const bar = screen.getByRole('status', { name: '復原刪除' });
      expect(bar.textContent).toContain('2026-10-10');
      fireEvent.click(within(bar).getByRole('button', { name: '復原' }));
      await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
      expect(remove).not.toHaveBeenCalled();
      expect(await screen.findByRole('button', { name: '刪除 2026-10-10 的體重紀錄' })).toBeTruthy();
    });

    it('5 秒後才真正呼叫 remove', async () => {
      const { repos, remove } = reposWithRemove();
      const m = await add(repos, { date: '2026-10-10', weightKg: 71 });
      await renderSettings({ repos });
      fireEvent.click(await screen.findByRole('button', { name: '刪除 2026-10-10 的體重紀錄' }));
      await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
      expect(remove).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
      expect(remove).toHaveBeenCalledWith(m.id);
      expect(screen.queryByRole('status', { name: '復原刪除' })).toBeNull();
    });

    it('離開畫面時，待刪除的項目立即提交，不遺失刪除動作', async () => {
      const { repos, remove } = reposWithRemove();
      const m = await add(repos, { date: '2026-10-10', weightKg: 71 });
      const { unmount } = await renderSettings({ repos });
      fireEvent.click(await screen.findByRole('button', { name: '刪除 2026-10-10 的體重紀錄' }));
      unmount();
      expect(remove).toHaveBeenCalledWith(m.id);
    });
  });

  it('資料層尚未提供 remove 時不顯示刪除鈕（避免假按鈕）', async () => {
    const repos = createMemoryRepos();
    await add(repos, { date: '2026-10-10', weightKg: 71 });
    await renderSettings({ repos });
    await screen.findByRole('list', { name: '體重紀錄' });
    expect(screen.queryByRole('button', { name: /^刪除/ })).toBeNull();
  });
});

describe('資料：匯出備份', () => {
  const origShare = Object.getOwnPropertyDescriptor(navigator, 'share');
  const origCan = Object.getOwnPropertyDescriptor(navigator, 'canShare');
  afterEach(() => {
    for (const [k, d] of [['share', origShare], ['canShare', origCan]] as const) {
      if (d) Object.defineProperty(navigator, k, d);
      else delete (navigator as unknown as Record<string, unknown>)[k];
    }
    vi.restoreAllMocks();
  });

  it('支援檔案分享時用 Web Share（files），檔名為 nuo-backup-YYYYMMDD-HHmm.json', async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    const service = fakeService();
    await renderSettings({ service });
    click('匯出備份');
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(service.export).toHaveBeenCalledTimes(1);
    const arg = (share.mock.calls[0] as unknown as [{ files: File[] }])[0];
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0].name).toMatch(/^nuo-backup-\d{8}-\d{4}\.json$/);
    expect(arg.files[0].type).toBe('application/json');
    expect(await arg.files[0].text()).toBe('{"app":"nuo-fit","version":1}');
  });

  it('不支援分享時改用 a[download] 下載連結，檔名相同', async () => {
    delete (navigator as unknown as Record<string, unknown>).share;
    delete (navigator as unknown as Record<string, unknown>).canShare;
    const create = vi.fn(() => 'blob:fake-url');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await renderSettings();
    click('匯出備份');
    const link = (await screen.findByRole('link', { name: /下載備份檔/ })) as HTMLAnchorElement;
    expect(link.getAttribute('download')).toMatch(/^nuo-backup-\d{8}-\d{4}\.json$/);
    expect(link.getAttribute('href')).toBe('blob:fake-url');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('使用者取消分享（AbortError）不視為錯誤', async () => {
    const share = vi.fn(async () => { throw new DOMException('cancel', 'AbortError'); });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    await renderSettings();
    click('匯出備份');
    await waitFor(() => expect(share).toHaveBeenCalled());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('匯出失敗顯示錯誤訊息', async () => {
    const service = fakeService({ export: vi.fn(async () => { throw new Error('資料庫無法讀取'); }) });
    await renderSettings({ service });
    click('匯出備份');
    expect((await screen.findByRole('alert')).textContent).toContain('資料庫無法讀取');
  });
});

describe('資料：匯入備份', () => {
  const backupJson = JSON.stringify({
    app: 'nuo-fit', version: 1, exportedAt: '2026-10-15T08:30:00.000Z',
    data: { sessions: [{}, {}, {}], sets: new Array(20).fill({}), bodyMetrics: [{}], meals: [] },
  });

  function pick(json: string, name = 'b.json') {
    const input = screen.getByLabelText('選擇備份檔') as HTMLInputElement;
    const file = new File([json], name, { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
  }

  it('選檔後先顯示「將取代目前所有資料」確認視窗，含備份時間與各表筆數；取消不匯入', async () => {
    const { service } = await renderSettings();
    pick(backupJson);
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg.textContent).toContain('將取代目前所有資料');
    expect(dlg.textContent).toMatch(/2026[-/.]10[-/.]1[56]/);
    expect(dlg.textContent).toMatch(/訓練場次\D*3/);
    expect(dlg.textContent).toMatch(/訓練組數\D*20/);
    expect(dlg.textContent).toMatch(/體重紀錄\D*1/);
    expect(service.import).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(service.import).not.toHaveBeenCalled();
  });

  it('確認後呼叫 service.import(json)，成功顯示各表筆數並重新整理資料', async () => {
    const { service } = await renderSettings();
    pick(backupJson);
    const dlg = await screen.findByRole('alertdialog');
    fireEvent.click(within(dlg).getByRole('button', { name: '確認取代' }));
    await waitFor(() => expect(service.import).toHaveBeenCalledWith(backupJson));
    expect((await screen.findByRole('status', { name: '匯入結果' })).textContent).toMatch(/匯入完成/);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('匯入失敗顯示錯誤並註明資料未變更', async () => {
    const service = fakeService({ import: vi.fn(async () => { throw new Error('備份檔缺少資料表 sets'); }) });
    await renderSettings({ service });
    pick(backupJson);
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '確認取代' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('備份檔缺少資料表 sets');
    expect(alert.textContent).toContain('資料未變更');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('不是 JSON 的檔案：直接報錯，不開確認視窗、不呼叫 import', async () => {
    const { service } = await renderSettings();
    pick('這不是 json');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('資料未變更');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(service.import).not.toHaveBeenCalled();
  });

  it('Hevy／Strong 匯入入口顯示「即將推出」且不可操作', async () => {
    await renderSettings();
    const btn = screen.getByRole('button', { name: /Hevy.*Strong/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('即將推出');
  });
});
