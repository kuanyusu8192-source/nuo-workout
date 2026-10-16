import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRepos } from '../../data/repos';
import type { Repos } from '../../data/repos/interfaces';
import { renderWithApp } from '../../test/helpers';
import { OnboardingFlow } from './OnboardingFlow';

const TODAY = '2026-10-16';

const type = (label: RegExp | string, value: string) =>
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
const click = (name: RegExp | string) => fireEvent.click(screen.getByRole('button', { name }));
const radio = (name: RegExp | string) => fireEvent.click(screen.getByRole('radio', { name }));

async function renderFlow(repos: Repos = createMemoryRepos(), onDone = vi.fn()) {
  const r = renderWithApp(<OnboardingFlow onDone={onDone} />, repos, { today: TODAY });
  await screen.findByText('1/3');
  return { ...r, onDone };
}

function fillStep1(sex = '男', age = '30', height = '175', weight = '70') {
  radio(sex);
  type(/年齡/, age);
  type(/身高/, height);
  type(/體重/, weight);
}

const nextBtn = () => screen.getByRole('button', { name: '下一步' }) as HTMLButtonElement;

describe('OnboardingFlow 步驟 1：身體數據', () => {
  it('顯示進度 1/3，未填完時「下一步」停用，沒有上一步', async () => {
    await renderFlow();
    expect(screen.getByText('1/3')).toBeTruthy();
    expect(nextBtn().disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '上一步' })).toBeNull();
    // 標籤可見
    expect(screen.getByLabelText(/年齡/)).toBeTruthy();
    expect(screen.getByLabelText(/身高/)).toBeTruthy();
    expect(screen.getByLabelText(/體重/)).toBeTruthy();
  });

  it('性別有男／女／其他三選項', async () => {
    await renderFlow();
    for (const n of ['男', '女', '其他']) expect(screen.getByRole('radio', { name: n })).toBeTruthy();
  });

  it.each([
    ['年齡', /年齡/, '9', '10', '100', '101', '年齡需介於 10–100'],
    ['身高', /身高/, '99', '100', '230', '231', '身高需介於 100–230'],
    ['體重', /體重/, '29', '30', '300', '301', '體重需介於 30–300'],
  ])('%s 範圍驗證：邊界值通過、越界出現錯誤訊息並擋住下一步', async (_n, label, low, min, max, high, msg) => {
    await renderFlow();
    fillStep1();
    expect(nextBtn().disabled).toBe(false);
    for (const bad of [low, high]) {
      type(label, bad);
      expect(screen.getByText(msg)).toBeTruthy();
      expect(nextBtn().disabled).toBe(true);
    }
    for (const ok of [min, max]) {
      type(label, ok);
      expect(screen.queryByText(msg)).toBeNull();
      expect(nextBtn().disabled).toBe(false);
    }
  });

  it('未選性別不能前進', async () => {
    await renderFlow();
    type(/年齡/, '30');
    type(/身高/, '175');
    type(/體重/, '70');
    expect(nextBtn().disabled).toBe(true);
    radio('女');
    expect(nextBtn().disabled).toBe(false);
  });

  it('數字欄位使用 inputmode：年齡 numeric、身高體重 decimal', async () => {
    await renderFlow();
    expect(screen.getByLabelText(/年齡/).getAttribute('inputmode')).toBe('numeric');
    expect(screen.getByLabelText(/體重/).getAttribute('inputmode')).toBe('decimal');
  });
});

describe('OnboardingFlow 步驟 2、3', () => {
  it('步驟 2 列出 PAL 五級（含說明文字），選擇前不能前進，可回上一步且保留輸入', async () => {
    await renderFlow();
    fillStep1();
    click('下一步');
    expect(screen.getByText('2/3')).toBeTruthy();
    for (const n of ['久坐', '輕度活動', '中度活動', '高度活動', '極高活動']) {
      expect(screen.getByRole('radio', { name: new RegExp(n) })).toBeTruthy();
    }
    expect(screen.getAllByRole('radio').length).toBe(5);
    expect(nextBtn().disabled).toBe(true);
    radio(/中度活動/);
    expect(nextBtn().disabled).toBe(false);
    click('上一步');
    expect(screen.getByText('1/3')).toBeTruthy();
    expect((screen.getByLabelText(/年齡/) as HTMLInputElement).value).toBe('30');
    expect((screen.getByLabelText(/體重/) as HTMLInputElement).value).toBe('70');
    click('下一步');
    // 活動量選擇仍保留
    expect(screen.getByRole('radio', { name: /中度活動/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('步驟 3 有三個目標，並即時預覽目標熱量與三大營養素克數', async () => {
    await renderFlow();
    fillStep1();
    click('下一步');
    radio(/中度活動/);
    click('下一步');
    expect(screen.getByText('3/3')).toBeTruthy();
    expect(screen.getAllByRole('radio').length).toBe(3);
    // 尚未選目標：不能完成
    expect((screen.getByRole('button', { name: '完成' }) as HTMLButtonElement).disabled).toBe(true);

    radio(/維持/);
    const preview = screen.getByTestId('onboarding-preview');
    expect(preview.textContent).toContain('2556');
    expect(preview.textContent).toContain('224');
    expect(preview.textContent).toContain('160');
    expect(preview.textContent).toContain('114');

    radio(/減脂/);
    expect(screen.getByTestId('onboarding-preview').textContent).toContain('2044');
    radio(/增肌/);
    expect(screen.getByTestId('onboarding-preview').textContent).toContain('2811');
  });
});

describe('OnboardingFlow 完成', () => {
  it('30 歲男、175cm、70kg、PAL 1.55、維持 → tdee 2555.56、目標 2556、營養 224/160/114，並新增今天體重', async () => {
    const { repos, onDone } = await renderFlow();
    fillStep1();
    click('下一步');
    radio(/中度活動/);
    click('下一步');
    radio(/維持/);
    click('完成');

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const p = await repos.profile.get();
    expect(p).toBeDefined();
    expect(p).toMatchObject({ id: 1, sex: 'male', age: 30, heightCm: 175, weightKg: 70, pal: 1.55, goal: 'maintain' });
    expect(p!.tdee).toBeCloseTo(2555.56, 2);
    expect(p!.kcalTarget).toBe(2556);
    expect(p!.macros).toEqual({ proteinG: 224, carbG: 160, fatG: 114 });

    const metrics = await repos.bodyMetrics.list();
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({ date: TODAY, weightKg: 70 });
  });

  it('女性＋減脂：使用 Mifflin–St Jeor（女 −161）與 0.8 係數', async () => {
    const { repos, onDone } = await renderFlow();
    fillStep1('女', '28', '160', '55');
    click('下一步');
    radio(/輕度活動/);
    click('下一步');
    radio(/減脂/);
    click('完成');
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const p = (await repos.profile.get())!;
    // bmr = 550 + 1000 − 140 − 161 = 1249；tdee = 1249 × 1.375 = 1717.375；目標 = round(1717.375 × 0.8) = 1374
    expect(p.tdee).toBeCloseTo(1717.38, 2);
    expect(p.kcalTarget).toBe(1374);
    expect(p.goal).toBe('cut');
  });

  it('寫入失敗時顯示錯誤、不呼叫 onDone、可重試', async () => {
    const repos = createMemoryRepos();
    const save = vi.spyOn(repos.profile, 'save').mockRejectedValueOnce(new Error('磁碟已滿'));
    const { onDone } = await renderFlow(repos);
    fillStep1();
    click('下一步');
    radio(/中度活動/);
    click('下一步');
    radio(/維持/);
    click('完成');
    expect((await screen.findByRole('alert')).textContent).toContain('磁碟已滿');
    expect(onDone).not.toHaveBeenCalled();
    click('完成');
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe('OnboardingFlow 可重入（重新計算 TDEE）', () => {
  async function withProfile() {
    const repos = createMemoryRepos();
    await repos.profile.save({
      sex: 'male', age: 30, heightCm: 175, weightKg: 70, pal: 1.55, goal: 'maintain',
      tdee: 2555.56, kcalTarget: 2556, macros: { proteinG: 224, carbG: 160, fatG: 114 },
    });
    await repos.bodyMetrics.add({ date: TODAY, weightKg: 70 });
    return repos;
  }

  it('預填現有 profile，三步都已選好，可直接連按下一步到完成', async () => {
    const repos = await withProfile();
    const { onDone } = await renderFlow(repos);
    await waitFor(() => expect((screen.getByLabelText(/年齡/) as HTMLInputElement).value).toBe('30'));
    expect((screen.getByLabelText(/身高/) as HTMLInputElement).value).toBe('175');
    expect((screen.getByLabelText(/體重/) as HTMLInputElement).value).toBe('70');
    expect(screen.getByRole('radio', { name: '男' }).getAttribute('aria-checked')).toBe('true');
    click('下一步');
    expect(screen.getByRole('radio', { name: /中度活動/ }).getAttribute('aria-checked')).toBe('true');
    click('下一步');
    expect(screen.getByRole('radio', { name: /維持/ }).getAttribute('aria-checked')).toBe('true');
    click('完成');
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    // 同一天、同體重不重複新增紀錄
    expect(await repos.bodyMetrics.list()).toHaveLength(1);
  });

  it('改目標與體重後重算：profile 更新、今天新增新的體重紀錄', async () => {
    const repos = await withProfile();
    const { onDone } = await renderFlow(repos);
    await waitFor(() => expect((screen.getByLabelText(/體重/) as HTMLInputElement).value).toBe('70'));
    type(/體重/, '68');
    click('下一步');
    click('下一步');
    radio(/增肌/);
    click('完成');
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const p = (await repos.profile.get())!;
    expect(p.weightKg).toBe(68);
    expect(p.goal).toBe('bulk');
    // bmr = 680 + 1093.75 − 150 + 5 = 1628.75；tdee = 2524.5625；目標 = round(×1.1) = 2777
    expect(p.tdee).toBeCloseTo(2524.56, 2);
    expect(p.kcalTarget).toBe(2777);
    const ms = await repos.bodyMetrics.list();
    expect(ms.map((m) => m.weightKg).sort()).toEqual([68, 70]);
  });

  it('沒有 profile 但有體重紀錄時，體重欄預填最近一筆', async () => {
    const repos = createMemoryRepos();
    await repos.bodyMetrics.add({ date: '2026-10-01', weightKg: 81.5 });
    await renderFlow(repos);
    await waitFor(() => expect((screen.getByLabelText(/體重/) as HTMLInputElement).value).toBe('81.5'));
  });
});
