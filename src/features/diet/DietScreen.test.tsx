import { act, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchBackEvent, installBackHandling } from '../../app/back';
import { createMemoryRepos } from '../../data/repos';
import type { Repos } from '../../data/repos/interfaces';
import { seedEmptyData, seedFakeData } from '../../dev/fakeData';
import { renderWithApp } from '../../test/helpers';
import { DietScreen } from './DietScreen';

const TODAY = '2026-10-16'; // 週五
// 兩輪：第一輪讓事件／effect 跑完，第二輪讓 invalidate 觸發的重新查詢完成
const settle = async () => {
  for (let i = 0; i < 2; i++) await act(async () => { await new Promise((r) => setTimeout(r, 15)); });
};

const PROFILE = {
  sex: 'male', age: 30, heightCm: 170, weightKg: 70, pal: 1.2, goal: 'maintain',
  tdee: 2000, kcalTarget: 2000, macros: { proteinG: 150, carbG: 200, fatG: 60 },
} as const;

async function makeRepos(opts: { profile?: boolean; meals?: boolean } = {}): Promise<Repos> {
  const repos = createMemoryRepos();
  if (opts.profile !== false) await repos.profile.save({ ...PROFILE, macros: { ...PROFILE.macros } });
  if (opts.meals !== false) {
    await repos.meals.add({ date: TODAY, name: '雞胸便當', servings: 1, proteinG: 30, carbG: 50, fatG: 10, kcal: 410 });
    await repos.meals.add({ date: TODAY, name: '希臘優格', servings: 1, proteinG: 20, carbG: 10, fatG: 5, kcal: 165 });
  }
  return repos;
}

async function mount(repos: Repos) {
  const r = renderWithApp(<DietScreen />, repos, { today: TODAY });
  await settle();
  return r;
}

const click = async (el: Element) => { fireEvent.click(el); await settle(); };
const btn = (name: string | RegExp) => screen.getByRole('button', { name });
const sheet = () => screen.getByRole('dialog');
// 面板開啟時底下的總覽也有同名 aria-label（進度條），所以欄位查詢限定在面板內
const typeInto = async (label: string | RegExp, value: string) => {
  fireEvent.input(within(sheet()).getByLabelText(label), { target: { value } });
  await settle();
};
const inputValue = (label: string | RegExp) => (within(sheet()).getByLabelText(label) as HTMLInputElement).value;

async function openManual() {
  await click(btn(/記錄飲食/));
  await click(btn('手動輸入'));
}

afterEach(() => { vi.useRealTimers(); });

describe('總覽數字', () => {
  it('目標 2000、已吃 575、運動消耗覆寫 100、計入 → 剩餘 1525', async () => {
    const repos = await makeRepos();
    await repos.burnOverrides.set(TODAY, 100);
    await mount(repos);
    expect(screen.getByTestId('target').textContent).toContain('2000');
    expect(screen.getByTestId('eaten').textContent).toContain('575');
    expect(screen.getByTestId('remaining').textContent).toContain('1525');
    expect(screen.getByTestId('burn').textContent).toContain('100');
  });

  it('不計入運動消耗 → 剩餘 1425，並標示未計入', async () => {
    const repos = await makeRepos();
    await repos.burnOverrides.set(TODAY, 100);
    await repos.settings.patch({ countBurnToBudget: false });
    await mount(repos);
    expect(screen.getByTestId('remaining').textContent).toContain('1425');
    expect(screen.getByTestId('burn').textContent).toContain('未計入');
  });

  it('無覆寫時用自動估算（4 組重訓 × 3 分鐘 × MET5 × 70kg = 70）', async () => {
    const repos = await makeRepos();
    const s = await repos.sessions.create({ date: TODAY, mode: 'gear' });
    for (let i = 0; i < 4; i++) {
      await repos.sets.add({ sessionId: s.id, exerciseId: 'x', setIndex: i, kind: 'strength', weightKg: 40, reps: 10 });
    }
    await mount(repos);
    expect(screen.getByTestId('burn').textContent).toContain('70');
    expect(screen.getByTestId('remaining').textContent).toContain('1495');
  });

  it('三大營養素進度條有文字標籤與克數', async () => {
    await mount(await makeRepos());
    const p = screen.getByRole('progressbar', { name: '蛋白質' });
    expect(p.getAttribute('aria-valuetext')).toContain('50');
    expect(p.getAttribute('aria-valuetext')).toContain('150');
    expect(screen.getByRole('progressbar', { name: '碳水' }).getAttribute('aria-valuetext')).toContain('60');
    expect(screen.getByRole('progressbar', { name: '脂肪' }).getAttribute('aria-valuetext')).toContain('15');
  });

  it('超過目標顯示「已超過」與超出的熱量', async () => {
    const repos = await makeRepos();
    await repos.meals.add({ date: TODAY, name: '大餐', servings: 1, proteinG: 10, carbG: 10, fatG: 10, kcal: 1700 });
    await mount(repos);
    expect(screen.getByTestId('remaining').textContent).toContain('已超過');
    expect(screen.getByTestId('remaining').textContent).toContain('275');
  });

  it('無 profile：顯示引導文字，不顯示剩餘', async () => {
    await mount(await makeRepos({ profile: false }));
    expect(screen.getByText('完成首次設定以計算目標')).toBeTruthy();
    expect(screen.queryByTestId('remaining')).toBeNull();
    expect(screen.getByTestId('eaten').textContent).toContain('575');
  });

  it('「重新計算」導向設定', async () => {
    await mount(await makeRepos());
    await click(btn('重新計算'));
    expect(window.location.hash).toBe('#/settings');
  });

  it('seedFakeData 的完整資料能正常顯示', async () => {
    const repos = createMemoryRepos();
    await seedFakeData(repos, { today: TODAY });
    await mount(repos);
    expect(screen.getByText('雞胸便當')).toBeTruthy();
    expect(screen.getByTestId('remaining')).toBeTruthy();
  });
});

describe('日期條', () => {
  it('顯示本週七天（週一起），有紀錄的日子有文字標記，今天被選取', async () => {
    const repos = await makeRepos();
    await repos.meals.add({ date: '2026-10-13', name: '午餐', servings: 1, proteinG: 1, carbG: 1, fatG: 1, kcal: 17 });
    await mount(repos);
    const strip = screen.getByRole('group', { name: '本週日期' });
    const days = within(strip).getAllByRole('button');
    expect(days).toHaveLength(7);
    expect(days[0].getAttribute('aria-label')).toContain('10月12日');
    expect(days[1].getAttribute('aria-label')).toContain('有飲食紀錄');
    expect(days[0].getAttribute('aria-label')).not.toContain('有飲食紀錄');
    expect(days[4].getAttribute('aria-label')).toContain('有飲食紀錄'); // 今天有餐
    expect(days[4].getAttribute('aria-pressed')).toBe('true');
    expect(within(days[1]).getByText('●')).toBeTruthy();
  });

  it('點另一天切換清單；上一週切換整週並保留星期', async () => {
    const repos = await makeRepos();
    await repos.meals.add({ date: '2026-10-13', name: '週二午餐', servings: 1, proteinG: 1, carbG: 1, fatG: 1, kcal: 17 });
    await repos.meals.add({ date: '2026-10-06', name: '上週二餐', servings: 1, proteinG: 1, carbG: 1, fatG: 1, kcal: 17 });
    await mount(repos);
    await click(within(screen.getByRole('group', { name: '本週日期' })).getAllByRole('button')[1]);
    expect(screen.getByText('週二午餐')).toBeTruthy();
    expect(screen.queryByText('雞胸便當')).toBeNull();
    await click(btn('上一週'));
    const days = within(screen.getByRole('group', { name: '本週日期' })).getAllByRole('button');
    expect(days[0].getAttribute('aria-label')).toContain('10月5日');
    expect(screen.getByText('上週二餐')).toBeTruthy();
    await click(btn('下一週'));
    expect(screen.getByText('週二午餐')).toBeTruthy();
  });

  it('不在今天時有「回到今天」', async () => {
    await mount(await makeRepos());
    expect(screen.queryByRole('button', { name: '回到今天' })).toBeNull();
    await click(btn('上一週'));
    await click(btn('回到今天'));
    expect(screen.getByText('雞胸便當')).toBeTruthy();
  });
});

describe('手動輸入', () => {
  it('熱量自動 = 蛋白×4＋碳水×4＋脂肪×9，儲存後寫入 MealRepo 並出現在清單', async () => {
    const repos = await makeRepos({ meals: false });
    await mount(repos);
    await openManual();
    await typeInto('食物名稱', '水煮蛋');
    await typeInto(/^蛋白質/, '12');
    await typeInto(/^碳水/, '1');
    await typeInto(/^脂肪/, '10');
    expect(inputValue(/^熱量/)).toBe('142');
    await click(btn('儲存'));
    const saved = await repos.meals.listByDate(TODAY);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: '水煮蛋', proteinG: 12, carbG: 1, fatG: 10, kcal: 142, servings: 1 });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('水煮蛋')).toBeTruthy();
    expect(screen.getByTestId('eaten').textContent).toContain('142');
  });

  it('每 100g 模式：依實際克數換算', async () => {
    const repos = await makeRepos({ meals: false });
    await mount(repos);
    await openManual();
    await typeInto('食物名稱', '雞胸肉');
    await click(screen.getByRole('switch', { name: /每 100g/ }));
    await typeInto(/^蛋白質（每 100g/, '20');
    await typeInto(/^碳水（每 100g/, '10');
    await typeInto(/^脂肪（每 100g/, '5');
    await typeInto(/^實際食用/, '150');
    expect(screen.getByTestId('converted').textContent).toContain('30');
    expect(screen.getByTestId('converted').textContent).toContain('7.5');
    expect(inputValue(/^熱量/)).toBe('248');
    await click(btn('儲存'));
    const [m] = await repos.meals.listByDate(TODAY);
    expect(m).toMatchObject({ name: '雞胸肉', grams: 150, proteinG: 30, carbG: 15, fatG: 7.5, kcal: 248 });
    expect(m.per100g).toMatchObject({ proteinG: 20, carbG: 10, fatG: 5 });
  });

  it('熱量可手動覆寫，顯示「已手動修改」，可恢復自動', async () => {
    const repos = await makeRepos({ meals: false });
    await mount(repos);
    await openManual();
    await typeInto('食物名稱', '蛋糕');
    await typeInto(/^蛋白質/, '5');
    await typeInto(/^碳水/, '40');
    await typeInto(/^脂肪/, '10');
    expect(inputValue(/^熱量/)).toBe('270');
    expect(screen.queryByText('已手動修改')).toBeNull();
    await typeInto(/^熱量/, '300');
    expect(screen.getByText('已手動修改')).toBeTruthy();
    // 改營養素不再影響已覆寫的熱量
    await typeInto(/^脂肪/, '12');
    expect(inputValue(/^熱量/)).toBe('300');
    await click(btn('恢復自動'));
    expect(screen.queryByText('已手動修改')).toBeNull();
    expect(inputValue(/^熱量/)).toBe('288');
    await typeInto(/^熱量/, '300');
    await click(btn('儲存'));
    const [m] = await repos.meals.listByDate(TODAY);
    expect(m.kcal).toBe(300);
  });

  it('份數：加減並乘上每份', async () => {
    const repos = await makeRepos({ meals: false });
    await mount(repos);
    await openManual();
    await typeInto('食物名稱', '饅頭');
    await typeInto(/^蛋白質/, '10');
    await typeInto(/^碳水/, '40');
    await typeInto(/^脂肪/, '2');
    await click(btn('增加份數')); // 1 → 1.5
    await click(btn('增加份數')); // 2
    await click(btn('儲存'));
    const [m] = await repos.meals.listByDate(TODAY);
    expect(m).toMatchObject({ servings: 2, proteinG: 20, carbG: 80, fatG: 4, kcal: 436 });
  });

  it('驗證：沒填名稱或營養素不能儲存，顯示訊息', async () => {
    const repos = await makeRepos({ meals: false });
    await mount(repos);
    await openManual();
    await click(btn('儲存'));
    expect((await repos.meals.listByDate(TODAY)).length).toBe(0);
    expect(screen.getByText('請輸入食物名稱')).toBeTruthy();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    await typeInto('食物名稱', 'x');
    await typeInto(/^蛋白質/, '999999');
    await typeInto(/^碳水/, '1');
    await typeInto(/^脂肪/, '1');
    await click(btn('儲存'));
    expect((await repos.meals.listByDate(TODAY)).length).toBe(0);
    expect(sheet()).toBeTruthy();
  });

  it('日期欄位可改記到別天', async () => {
    const repos = await makeRepos({ meals: false });
    await mount(repos);
    await openManual();
    await typeInto('食物名稱', '昨日宵夜');
    await typeInto(/^蛋白質/, '1');
    await typeInto(/^碳水/, '1');
    await typeInto(/^脂肪/, '1');
    fireEvent.input(within(sheet()).getByLabelText('日期'), { target: { value: '2026-10-15' } });
    await click(btn('儲存'));
    expect(await repos.meals.listByDate('2026-10-15')).toHaveLength(1);
    expect(await repos.meals.listByDate(TODAY)).toHaveLength(0);
  });

  it('輸入欄位使用 inputmode 與可見標籤', async () => {
    await mount(await makeRepos({ meals: false }));
    await openManual();
    expect(within(sheet()).getByLabelText(/^蛋白質/).getAttribute('inputmode')).toBe('decimal');
    expect(within(sheet()).getByLabelText('食物名稱')).toBeTruthy();
  });
});

describe('餐點清單', () => {
  it('編輯：重開表單帶入原值並更新', async () => {
    const repos = await makeRepos();
    await mount(repos);
    await click(btn('編輯 雞胸便當'));
    expect(inputValue('食物名稱')).toBe('雞胸便當');
    expect(inputValue(/^蛋白質/)).toBe('30');
    await typeInto('食物名稱', '雞腿便當');
    await typeInto(/^蛋白質/, '40');
    await click(btn('儲存'));
    const list = await repos.meals.listByDate(TODAY);
    expect(list).toHaveLength(2);
    expect(list.find((m) => m.name === '雞腿便當')).toMatchObject({ proteinG: 40, kcal: 450 });
  });

  it('調整份數會依比例更新營養與熱量', async () => {
    const repos = await makeRepos();
    await mount(repos);
    await click(btn('雞胸便當 增加份數'));
    const m = (await repos.meals.listByDate(TODAY)).find((x) => x.name === '雞胸便當')!;
    expect(m).toMatchObject({ servings: 1.5, proteinG: 45, carbG: 75, fatG: 15, kcal: 615 });
    expect(screen.getByTestId('eaten').textContent).toContain('780');
    await click(btn('雞胸便當 減少份數'));
    const m2 = (await repos.meals.listByDate(TODAY)).find((x) => x.name === '雞胸便當')!;
    expect(m2).toMatchObject({ servings: 1, kcal: 410 });
  });

  it('刪除後出現復原列，按復原還原', async () => {
    const repos = await makeRepos();
    await mount(repos);
    await click(btn('刪除 希臘優格'));
    expect(screen.queryByText('希臘優格', { selector: '.diet-meal__name' })).toBeNull();
    expect((await repos.meals.listByDate(TODAY)).length).toBe(1);
    expect(screen.getByTestId('eaten').textContent).toContain('410');
    await click(btn('復原'));
    expect(screen.getByText('希臘優格')).toBeTruthy();
    expect((await repos.meals.listByDate(TODAY)).map((m) => m.name).sort()).toEqual(['希臘優格', '雞胸便當'].sort());
    expect(screen.getByTestId('eaten').textContent).toContain('575');
  });

  it('復原列 5 秒後消失', async () => {
    const repos = await makeRepos();
    await mount(repos);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(btn('刪除 希臘優格'));
    await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
    expect(screen.queryByRole('button', { name: '復原' })).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(5100); });
    expect(screen.queryByRole('button', { name: '復原' })).toBeNull();
  });
});

describe('最愛', () => {
  it('從已記錄餐點加入最愛，之後在最愛清單點選帶入表單', async () => {
    const repos = await makeRepos();
    await mount(repos);
    await click(btn('希臘優格 加入最愛'));
    const favs = await repos.meals.favorites();
    expect(favs.find((f) => f.name === '希臘優格')).toMatchObject({ proteinG: 20, carbG: 10, fatG: 5, kcal: 165 });

    await click(btn(/記錄飲食/));
    await click(btn('我的最愛'));
    await click(btn('希臘優格 帶入'));
    expect(inputValue('食物名稱')).toBe('希臘優格');
    expect(inputValue(/^蛋白質/)).toBe('20');
    await click(btn('儲存'));
    expect((await repos.meals.listByDate(TODAY)).filter((m) => m.name === '希臘優格')).toHaveLength(2);
  });

  it('重複加入同名最愛不會重複建立', async () => {
    const repos = await makeRepos();
    await mount(repos);
    await click(btn('希臘優格 加入最愛'));
    await click(btn('希臘優格 加入最愛'));
    expect((await repos.meals.favorites()).filter((f) => f.name === '希臘優格')).toHaveLength(1);
  });

  it('管理：刪除最愛', async () => {
    const repos = await makeRepos({ meals: false });
    await repos.meals.addFavorite({ name: '燕麥', proteinG: 5, carbG: 30, fatG: 3, kcal: 167 });
    await mount(repos);
    await click(btn(/記錄飲食/));
    await click(btn('我的最愛'));
    await click(btn('管理'));
    await click(btn('刪除最愛 燕麥'));
    expect(await repos.meals.favorites()).toHaveLength(0);
    expect(screen.getByText('還沒有最愛')).toBeTruthy();
  });

  it('沒有最愛時顯示空狀態', async () => {
    await mount(await makeRepos({ meals: false }));
    await click(btn(/記錄飲食/));
    await click(btn('我的最愛'));
    expect(screen.getByText('還沒有最愛')).toBeTruthy();
  });
});

describe('記錄運動消耗', () => {
  it('顯示自動估算、手動輸入儲存（覆寫），總覽更新', async () => {
    const repos = await makeRepos();
    const s = await repos.sessions.create({ date: TODAY, mode: 'gear' });
    for (let i = 0; i < 4; i++) await repos.sets.add({ sessionId: s.id, exerciseId: 'x', setIndex: i, kind: 'strength', weightKg: 40, reps: 10 });
    await mount(repos);
    await click(btn('記錄運動消耗'));
    expect(within(sheet()).getByTestId('burn-auto').textContent).toContain('70');
    await typeInto(/^運動消耗/, '250');
    await click(btn('儲存'));
    expect(await repos.burnOverrides.get(TODAY)).toBe(250);
    expect(screen.getByTestId('burn').textContent).toContain('250');
    expect(screen.getByTestId('remaining').textContent).toContain('1675'); // 2000-575+250
  });

  it('留空儲存 = 清除覆寫、恢復自動', async () => {
    const repos = await makeRepos();
    await repos.burnOverrides.set(TODAY, 300);
    await mount(repos);
    await click(btn('記錄運動消耗'));
    expect(inputValue(/^運動消耗/)).toBe('300');
    await typeInto(/^運動消耗/, '');
    await click(btn('儲存'));
    expect(await repos.burnOverrides.get(TODAY)).toBeUndefined();
    expect(screen.getByTestId('remaining').textContent).toContain('1425');
  });

  it('缺體重：自動估算顯示「—」並說明', async () => {
    const repos = await makeRepos({ profile: false });
    await mount(repos);
    await click(btn('記錄運動消耗'));
    expect(within(sheet()).getByTestId('burn-auto').textContent).toBe('—');
    expect(within(sheet()).getByText(/缺少體重/)).toBeTruthy();
  });

  it('顯示並可切換「計入每日可用熱量」設定', async () => {
    const repos = await makeRepos();
    await repos.burnOverrides.set(TODAY, 100);
    await mount(repos);
    await click(btn('記錄運動消耗'));
    const sw = within(sheet()).getByRole('switch', { name: /計入每日可用熱量/ });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    await click(sw);
    expect((await repos.settings.get()).countBurnToBudget).toBe(false);
    expect(within(sheet()).getByRole('switch', { name: /計入每日可用熱量/ }).getAttribute('aria-checked')).toBe('false');
    await click(within(sheet()).getByRole('button', { name: '關閉' }));
    expect(screen.getByTestId('remaining').textContent).toContain('1425');
  });

  it('輸入不合法數值不會儲存也不會清除覆寫', async () => {
    const repos = await makeRepos();
    await repos.burnOverrides.set(TODAY, 300);
    await mount(repos);
    await click(btn('記錄運動消耗'));
    await typeInto(/^運動消耗/, 'abc');
    await click(btn('儲存'));
    expect(await repos.burnOverrides.get(TODAY)).toBe(300);
    expect(sheet()).toBeTruthy();
  });
});

describe('飲食日曆', () => {
  it('顯示當月、有紀錄日標記，點日期跳轉並關閉', async () => {
    const repos = await makeRepos();
    await repos.meals.add({ date: '2026-10-03', name: '月初餐', servings: 1, proteinG: 1, carbG: 1, fatG: 1, kcal: 17 });
    await mount(repos);
    await click(btn('飲食日曆'));
    const cal = sheet();
    expect(within(cal).getByText('2026年10月')).toBeTruthy();
    const d3 = within(cal).getByRole('button', { name: /10月3日/ });
    expect(d3.getAttribute('aria-label')).toContain('有飲食紀錄');
    expect(within(d3).getByText('●')).toBeTruthy();
    expect(within(cal).getByRole('button', { name: /10月4日/ }).getAttribute('aria-label')).not.toContain('有飲食紀錄');
    await click(d3);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('月初餐')).toBeTruthy();
    const days = within(screen.getByRole('group', { name: '本週日期' })).getAllByRole('button');
    expect(days[0].getAttribute('aria-label')).toContain('9月28日');
  });

  it('可切換上個月', async () => {
    await mount(await makeRepos());
    await click(btn('飲食日曆'));
    await click(within(sheet()).getByRole('button', { name: '上個月' }));
    expect(within(sheet()).getByText('2026年9月')).toBeTruthy();
  });
});

describe('空資料', () => {
  it('seedEmptyData：有 profile 無餐點 → 空狀態與全額剩餘', async () => {
    const repos = createMemoryRepos();
    await seedEmptyData(repos, { today: TODAY });
    await mount(repos);
    expect(screen.getByText('這天還沒有記錄飲食')).toBeTruthy();
    const target = (await repos.profile.get())!.kcalTarget;
    expect(screen.getByTestId('remaining').textContent).toContain(String(target));
  });
});

describe('返回鍵', () => {
  it('返回事件先關閉面板', async () => {
    const uninstall = installBackHandling({ isRoot: () => true, goBack: () => {}, exit: () => {} });
    try {
      await mount(await makeRepos());
      await click(btn(/記錄飲食/));
      expect(sheet()).toBeTruthy();
      act(() => dispatchBackEvent());
      await settle();
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally {
      uninstall();
    }
  });
});
