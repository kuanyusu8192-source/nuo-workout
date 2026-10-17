import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBundledExercises } from '../../data/exercise-source';
import type { Exercise } from '../../data/types';
import { createMemoryRepos } from '../../data/repos';
import type { Repos } from '../../data/repos/interfaces';
import { seedFakeData, type FakeSummary } from '../../dev/fakeData';
import { flush, renderWithApp } from '../../test/helpers';
import { PlansScreen } from './PlansScreen';

const picker = vi.hoisted(() => ({ ids: [] as string[], lastProps: undefined as undefined | Record<string, unknown> }));
vi.mock('../exercises/ExercisePicker', () => ({
  ExercisePicker: (p: { mode: string; initialSelectedIds?: string[]; onDone?: (ids: string[]) => void; onClose: () => void }) => {
    picker.lastProps = p as unknown as Record<string, unknown>;
    return (
      <div data-testid="picker">
        <span>picker-mode:{p.mode}</span>
        <button type="button" onClick={() => p.onDone?.(picker.ids)}>{`完成 (${picker.ids.length})`}</button>
        <button type="button" onClick={p.onClose}>取消選擇</button>
      </div>
    );
  },
}));

const TODAY = '2026-10-16'; // 週五
let repos: Repos;
let fake: FakeSummary;
let library: Exercise[];

vi.setConfig({ testTimeout: 20000 });
beforeAll(async () => {
  library = await loadBundledExercises();
});

async function setup(opts: { seed?: boolean } = {}) {
  repos = createMemoryRepos();
  if (opts.seed !== false) fake = await seedFakeData(repos, { today: TODAY, exercises: library });
  return renderWithApp(<PlansScreen />, repos, { today: TODAY });
}
const names = async () => (await repos.templates.list()).map((t) => t.name);
const goTemplatesTab = async () => {
  fireEvent.click(await screen.findByRole('tab', { name: '課表' }));
};
const openTemplate = async (name: string) => {
  fireEvent.click(await screen.findByRole('button', { name: `開啟 ${name}` }));
  await screen.findByLabelText('課表名稱');
};

beforeEach(() => {
  picker.ids = [];
  window.location.hash = '';
});

describe('分頁', () => {
  it('有週計畫／課表／新人計畫三個分頁，新人計畫為即將推出', async () => {
    await setup();
    expect(await screen.findByRole('tab', { name: '週計畫' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '課表' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '新人計畫' }));
    expect(await screen.findByText(/即將推出/)).toBeTruthy();
  });
});

describe('週計畫', () => {
  it('列出所有週計畫並標示啟用中', async () => {
    await setup();
    expect(await screen.findByRole('button', { name: '查看 器材版' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '查看 出差版' })).toBeTruthy();
    const badges = screen.getAllByText('啟用中');
    expect(badges).toHaveLength(1);
    expect(within(badges[0].closest('li') as HTMLElement).getByText('器材版')).toBeTruthy();
  });

  it('切換啟用週計畫：只寫入 repo，沒有「目前模式」文字、也不再跟著名稱切換模式', async () => {
    await setup();
    expect(await screen.findByRole('button', { name: '啟用 出差版' })).toBeTruthy();
    expect(screen.queryByText(/目前模式/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '啟用 出差版' }));
    await waitFor(async () => expect((await repos.plans.getActive())?.id).toBe(fake.planIds.travel));
    fireEvent.click(await screen.findByRole('button', { name: '啟用 器材版' }));
    await waitFor(async () => expect((await repos.plans.getActive())?.id).toBe(fake.planIds.gear));
    expect(screen.queryByText(/目前模式|器材模式|出差模式/)).toBeNull();
  });

  it('沒有週計畫時的說明與命名提示是中性文案（不提器材版／出差版）', async () => {
    await setup({ seed: false });
    expect(await screen.findByText(/不同情境的週計畫/)).toBeTruthy();
    expect(screen.queryByText(/器材版、出差版/)).toBeNull();
  });

  it('七列週一到週日，顯示對應課表或休息，今天高亮並附「今天」', async () => {
    await setup();
    const rows = await screen.findAllByTestId('day-row');
    expect(rows).toHaveLength(7);
    expect(rows[0].textContent).toContain('週一');
    expect(rows[0].textContent).toContain('推拉日');
    expect(rows[2].textContent).toContain('休息'); // 週三
    expect(rows[6].textContent).toContain('週日');
    const today = rows.filter((r) => r.textContent?.includes('今天'));
    expect(today).toHaveLength(1);
    expect(today[0].textContent).toContain('週五');
    expect(today[0].className).toContain('is-today');
  });

  it('點某一天開面板選課表，也能選休息', async () => {
    await setup();
    const rows = await screen.findAllByTestId('day-row');
    fireEvent.click(within(rows[2]).getByRole('button')); // 週三：休息 -> 腿與有氧
    const sheet = await screen.findByRole('dialog', { name: /週三/ });
    fireEvent.click(within(sheet).getByRole('button', { name: '腿與有氧' }));
    await waitFor(async () => expect((await repos.plans.get(fake.planIds.gear))?.days[3]).toBe(fake.templateIds.legs));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(async () => expect((await screen.findAllByTestId('day-row'))[2].textContent).toContain('腿與有氧'));

    fireEvent.click(within((await screen.findAllByTestId('day-row'))[0]).getByRole('button')); // 週一 -> 休息
    const sheet2 = await screen.findByRole('dialog', { name: /週一/ });
    fireEvent.click(within(sheet2).getByRole('button', { name: '休息' }));
    await waitFor(async () => expect((await repos.plans.get(fake.planIds.gear))?.days[1]).toBeNull());
  });

  it('新增與重新命名週計畫', async () => {
    await setup();
    fireEvent.click(await screen.findByRole('button', { name: /新增週計畫/ }));
    const dlg = await screen.findByRole('dialog', { name: '新增週計畫' });
    fireEvent.click(within(dlg).getByRole('button', { name: '儲存' }));
    expect(await within(dlg).findByText(/請輸入/)).toBeTruthy(); // 空名稱驗證
    fireEvent.input(within(dlg).getByLabelText('計畫名稱'), { target: { value: '家裡版' } });
    fireEvent.click(within(dlg).getByRole('button', { name: '儲存' }));
    await waitFor(async () => expect((await repos.plans.list()).map((p) => p.name)).toContain('家裡版'));
    const created = (await repos.plans.list()).find((p) => p.name === '家裡版')!;
    expect(created.isActive).toBe(false);

    fireEvent.click(await screen.findByRole('button', { name: '重新命名 家裡版' }));
    const dlg2 = await screen.findByRole('dialog', { name: '重新命名週計畫' });
    fireEvent.input(within(dlg2).getByLabelText('計畫名稱'), { target: { value: '旅館版' } });
    fireEvent.click(within(dlg2).getByRole('button', { name: '儲存' }));
    await waitFor(async () => expect((await repos.plans.get(created.id))?.name).toBe('旅館版'));
  });

  it('刪除非啟用週計畫需二次確認；刪除啟用中的被擋下並說明', async () => {
    await setup();
    fireEvent.click(await screen.findByRole('button', { name: '刪除 器材版' }));
    const info = await screen.findByRole('alertdialog', { name: /無法刪除/ });
    expect(info.textContent).toContain('先切換');
    fireEvent.click(within(info).getByRole('button', { name: '知道了' }));
    expect(await repos.plans.list()).toHaveLength(2);

    fireEvent.click(await screen.findByRole('button', { name: '刪除 出差版' }));
    const confirm = await screen.findByRole('alertdialog', { name: '刪除週計畫' });
    fireEvent.click(within(confirm).getByRole('button', { name: '取消' }));
    expect(await repos.plans.list()).toHaveLength(2);
    fireEvent.click(await screen.findByRole('button', { name: '刪除 出差版' }));
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: '刪除週計畫' })).getByRole('button', { name: '確定刪除' }));
    await waitFor(async () => expect(await repos.plans.list()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: '查看 出差版' })).toBeNull());
  });

  it('沒有任何週計畫時顯示空狀態', async () => {
    await setup({ seed: false });
    expect(await screen.findByText('還沒有週計畫')).toBeTruthy();
  });
});

describe('課表清單', () => {
  it('顯示卡片（名稱、動作數、建立時間）與搜尋', async () => {
    await setup();
    await goTemplatesTab();
    expect(await screen.findByRole('button', { name: '開啟 推拉日' })).toBeTruthy();
    const card = screen.getByRole('button', { name: '開啟 推拉日' }).closest('li') as HTMLElement;
    expect(card.textContent).toContain('6 個動作');
    expect(card.textContent).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect((card.querySelector('.plans-card__bar') as HTMLElement).style.background).toBeTruthy();

    fireEvent.input(screen.getByLabelText('搜尋課表'), { target: { value: '出差' } });
    expect(screen.queryByRole('button', { name: '開啟 推拉日' })).toBeNull();
    expect(screen.getByRole('button', { name: '開啟 出差徒手' })).toBeTruthy();
    fireEvent.input(screen.getByLabelText('搜尋課表'), { target: { value: '不存在的課表' } });
    expect(await screen.findByText(/找不到符合/)).toBeTruthy();
  });

  it('預覽面板唯讀顯示動作與收操建議', async () => {
    await setup();
    await goTemplatesTab();
    fireEvent.click(await screen.findByRole('button', { name: '預覽 推拉日' }));
    const sheet = await screen.findByRole('dialog', { name: /預覽：推拉日/ });
    expect(within(sheet).getAllByRole('listitem').length).toBe(6);
    expect(sheet.textContent).toContain('胸肌門框伸展');
    expect(within(sheet).queryByRole('textbox')).toBeNull();
  });

  it('複製：名稱加「 (複製)」', async () => {
    await setup();
    await goTemplatesTab();
    fireEvent.click(await screen.findByRole('button', { name: '複製 推拉日' }));
    await waitFor(async () => expect(await names()).toContain('推拉日 (複製)'));
    expect(await screen.findByRole('button', { name: '開啟 推拉日 (複製)' })).toBeTruthy();
  });

  it('刪除需二次確認，並清掉週計畫中的引用', async () => {
    await setup();
    await goTemplatesTab();
    fireEvent.click(await screen.findByRole('button', { name: '刪除 出差徒手' }));
    const dlg = await screen.findByRole('alertdialog', { name: '刪除課表' });
    fireEvent.click(within(dlg).getByRole('button', { name: '取消' }));
    expect(await names()).toContain('出差徒手');
    fireEvent.click(await screen.findByRole('button', { name: '刪除 出差徒手' }));
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: '刪除課表' })).getByRole('button', { name: '確定刪除' }));
    await waitFor(async () => expect(await names()).not.toContain('出差徒手'));
    const travelPlan = (await repos.plans.get(fake.planIds.travel))!;
    expect(Object.values(travelPlan.days).every((v) => v !== fake.templateIds.travel)).toBe(true);
  });

  it('上移／下移改變順序並持久化；首尾按鈕停用', async () => {
    await setup();
    await goTemplatesTab();
    expect(await names()).toEqual(['推拉日', '腿與有氧', '出差徒手']);
    expect((await screen.findByRole('button', { name: '上移 推拉日' })).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '下移 出差徒手' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '下移 推拉日' }));
    await waitFor(async () => expect(await names()).toEqual(['腿與有氧', '推拉日', '出差徒手']));
    fireEvent.click(await screen.findByRole('button', { name: '上移 出差徒手' }));
    await waitFor(async () => expect(await names()).toEqual(['腿與有氧', '出差徒手', '推拉日']));
    await waitFor(() => {
      const order = screen.getAllByRole('button', { name: /^開啟 / }).map((b) => b.getAttribute('aria-label'));
      expect(order).toEqual(['開啟 腿與有氧', '開啟 出差徒手', '開啟 推拉日']);
    });
  });

  it('排序把手支援鍵盤上下鍵', async () => {
    await setup();
    await goTemplatesTab();
    fireEvent.keyDown(await screen.findByRole('button', { name: '排序 推拉日' }), { key: 'ArrowDown' });
    await waitFor(async () => expect(await names()).toEqual(['腿與有氧', '推拉日', '出差徒手']));
  });

  it('沒有課表時顯示空狀態與建立按鈕', async () => {
    await setup({ seed: false });
    await goTemplatesTab();
    expect(await screen.findByText('還沒有課表')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /建立課表/ }).length).toBeGreaterThan(0);
  });
});

describe('建立與編輯課表', () => {
  it('完整流程：命名 -> 多選動作 -> 調組數 -> 儲存，資料寫入 TemplateRepo', async () => {
    await setup();
    await goTemplatesTab();
    fireEvent.click(await screen.findByRole('button', { name: /＋建立課表/ }));
    const dlg = await screen.findByRole('dialog', { name: '為課表命名' });
    fireEvent.click(within(dlg).getByRole('button', { name: '下一步' }));
    expect(await within(dlg).findByText(/請輸入/)).toBeTruthy();
    fireEvent.input(within(dlg).getByLabelText('課表名稱'), { target: { value: '手臂日' } });
    picker.ids = ['vx-0025', 'vx-0027'];
    fireEvent.click(within(dlg).getByRole('button', { name: '下一步' }));

    const pk = await screen.findByTestId('picker');
    expect(pk.textContent).toContain('picker-mode:multi');
    fireEvent.click(within(pk).getByRole('button', { name: '完成 (2)' }));

    await screen.findByLabelText('課表名稱');
    expect((screen.getByLabelText('課表名稱') as HTMLInputElement).value).toBe('手臂日');
    expect(await names()).not.toContain('手臂日'); // 儲存前不寫入
    const rows = screen.getAllByTestId('tpl-exercise');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('3 組')).toBeTruthy();
    fireEvent.click(within(rows[0]).getByRole('button', { name: /^增加組數/ }));
    await flush();
    fireEvent.click(within(rows[0]).getByRole('button', { name: /^增加組數/ }));
    await flush();
    fireEvent.click(within(rows[1]).getByRole('button', { name: /^減少組數/ }));
    await flush();
    expect(within(rows[0]).getByText('5 組')).toBeTruthy();
    fireEvent.input(within(rows[1]).getByLabelText('目標次數'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(async () => expect(await names()).toContain('手臂日'));
    const t = (await repos.templates.list()).find((x) => x.name === '手臂日')!;
    expect(t.exercises).toEqual([
      { exerciseId: 'vx-0025', targetSets: 5, targetReps: 10 },
      { exerciseId: 'vx-0027', targetSets: 2, targetReps: 12 },
    ]);
    expect(t.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(await screen.findByText('已儲存')).toBeTruthy();
  });

  it('組數下限 1', async () => {
    await setup();
    await goTemplatesTab();
    await openTemplate('出差徒手');
    const row = screen.getAllByTestId('tpl-exercise')[0];
    for (let i = 0; i < 5; i++) {
      if (!within(row).getByRole('button', { name: /^減少組數/ }).hasAttribute('disabled')) fireEvent.click(within(row).getByRole('button', { name: /^減少組數/ }));
      await flush();
    }
    expect(within(row).getByText('1 組')).toBeTruthy();
    expect(within(row).getByRole('button', { name: /^減少組數/ }).hasAttribute('disabled')).toBe(true);
  });

  it('編輯名稱、顏色、收操建議後儲存', async () => {
    await setup();
    await goTemplatesTab();
    await openTemplate('推拉日');
    fireEvent.input(screen.getByLabelText('課表名稱'), { target: { value: '推拉日 v2' } });
    fireEvent.input(screen.getByLabelText('收操建議'), { target: { value: '深呼吸 5 次' } });
    fireEvent.click(screen.getByRole('button', { name: '顏色 紅' }));
    expect(screen.getByRole('button', { name: '顏色 紅' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(async () => expect((await repos.templates.get(fake.templateIds.pushPull))?.cooldownText).toBe('深呼吸 5 次'));
    const t = (await repos.templates.get(fake.templateIds.pushPull))!;
    expect(t.name).toBe('推拉日 v2');
    expect(t.color).toBe('#e74c3c');
  });

  it('動作上移／下移／移除；新增動作保留既有設定', async () => {
    await setup();
    await goTemplatesTab();
    await openTemplate('出差徒手');
    const before = (await repos.templates.get(fake.templateIds.travel))!.exercises.map((e) => e.exerciseId);
    let rows = screen.getAllByTestId('tpl-exercise');
    expect(rows).toHaveLength(before.length);
    fireEvent.click(within(rows[0]).getByRole('button', { name: /^下移動作/ })); // [1,0,2,3]
    rows = screen.getAllByTestId('tpl-exercise');
    fireEvent.click(within(rows[rows.length - 1]).getByRole('button', { name: /^移除動作/ })); // [1,0,2]
    picker.ids = [before[1], before[0], 'vx-0025'];
    fireEvent.click(screen.getByRole('button', { name: /新增動作/ }));
    const pk = await screen.findByTestId('picker');
    expect((picker.lastProps?.initialSelectedIds as string[]).length).toBe(before.length - 1);
    fireEvent.click(within(pk).getByRole('button', { name: '完成 (3)' }));
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(async () => {
      const ids = (await repos.templates.get(fake.templateIds.travel))!.exercises.map((e) => e.exerciseId);
      expect(ids).toEqual([before[1], before[0], 'vx-0025']);
    });
  });

  it('未儲存按返回會詢問，放棄後回到清單', async () => {
    await setup();
    await goTemplatesTab();
    await openTemplate('推拉日');
    fireEvent.input(screen.getByLabelText('課表名稱'), { target: { value: '改一半' } });
    fireEvent.click(screen.getByRole('button', { name: '返回課表清單' }));
    const dlg = await screen.findByRole('alertdialog', { name: '尚未儲存' });
    fireEvent.click(within(dlg).getByRole('button', { name: '放棄變更' }));
    expect(await screen.findByRole('button', { name: '開啟 推拉日' })).toBeTruthy();
    expect(await names()).not.toContain('改一半');
  });

  it('未修改時返回直接回到清單', async () => {
    await setup();
    await goTemplatesTab();
    await openTemplate('推拉日');
    fireEvent.click(screen.getByRole('button', { name: '返回課表清單' }));
    expect(await screen.findByRole('button', { name: '開啟 推拉日' })).toBeTruthy();
  });
});

describe('開始訓練', () => {
  it('建立今日 session（帶 templateId、planId）並導向 #/today', async () => {
    await setup();
    await goTemplatesTab();
    await openTemplate('腿與有氧');
    fireEvent.click(screen.getByRole('button', { name: '開始訓練' }));
    await waitFor(() => expect(window.location.hash).toBe('#/today'));
    const sessions = await repos.sessions.getByDate(TODAY);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].templateId).toBe(fake.templateIds.legs);
    expect(sessions[0].planId).toBe(fake.planIds.gear);
    expect(sessions[0].mode).toBe('normal');
    expect(sessions[0].endedAt).toBeUndefined();
  });

  it('有未儲存變更時先儲存再開始', async () => {
    await setup();
    await goTemplatesTab();
    await openTemplate('腿與有氧');
    fireEvent.input(screen.getByLabelText('收操建議'), { target: { value: '新建議' } });
    fireEvent.click(screen.getByRole('button', { name: '開始訓練' }));
    await waitFor(() => expect(window.location.hash).toBe('#/today'));
    expect((await repos.templates.get(fake.templateIds.legs))?.cooldownText).toBe('新建議');
  });

  it('已有同課表的進行中 session 時不重複建立', async () => {
    await setup();
    await repos.sessions.create({ date: TODAY, mode: 'gear', templateId: fake.templateIds.legs, planId: fake.planIds.gear });
    await goTemplatesTab();
    await openTemplate('腿與有氧');
    fireEvent.click(screen.getByRole('button', { name: '開始訓練' }));
    await waitFor(() => expect(window.location.hash).toBe('#/today'));
    expect(await repos.sessions.getByDate(TODAY)).toHaveLength(1);
  });
});
