import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadBundledExercises } from '../../data/exercise-source';
import { createMemoryRepos } from '../../data/repos';
import type { Exercise } from '../../data/types';
import { seedFakeData } from '../../dev/fakeData';
import { renderWithApp } from '../../test/helpers';
import { ExercisePicker } from './ExercisePicker';

let all: Exercise[];
beforeAll(async () => {
  all = await loadBundledExercises();
});

async function setup(props: Partial<Parameters<typeof ExercisePicker>[0]> = {}) {
  const repos = createMemoryRepos();
  await seedFakeData(repos, { today: '2026-10-16', exercises: all });
  const onClose = vi.fn();
  const view = renderWithApp(<ExercisePicker mode="single" onClose={onClose} {...props} />, repos);
  await screen.findByTestId('exercise-list');
  await waitFor(() => expect(cards().length).toBeGreaterThan(0));
  return { ...view, onClose };
}
const cards = () => Array.from(document.querySelectorAll<HTMLElement>('[data-exercise-id]'));
const count = () => screen.getByTestId('result-count').textContent ?? '';
const countIs = async (n: number) => waitFor(() => expect(count()).toContain(`${n} 個`));
const expectedCount = (f: (e: Exercise) => boolean) => all.filter(f).length;

describe('ExercisePicker 清單與篩選', () => {
  it('預設顯示胸分頁；虛擬化只渲染少量節點', async () => {
    await setup();
    await countIs(expectedCount((e) => e.category === '胸'));
    expect(cards().length).toBeLessThan(40);
    expect(cards().length).toBeGreaterThan(3);
  });

  it('捲動後內容更新，節點數仍遠小於總數', async () => {
    await setup();
    fireEvent.click(screen.getByRole('tab', { name: '背' }));
    await countIs(expectedCount((e) => e.category === '背'));
    const list = screen.getByTestId('exercise-list');
    const firstBefore = cards()[0].dataset.exerciseId;
    list.scrollTop = 72 * 100;
    fireEvent.scroll(list);
    await waitFor(() => expect(cards()[0].dataset.exerciseId).not.toBe(firstBefore));
    expect(cards().length).toBeLessThan(40);
  });

  it('搜尋全庫 1,368 筆時渲染節點遠小於總數', async () => {
    await setup();
    fireEvent.input(screen.getByLabelText('搜尋動作'), { target: { value: 'e' } });
    await countIs(expectedCount((e) => e.name.toLowerCase().includes('e') || e.nameEn.toLowerCase().includes('e')));
    expect(cards().length).toBeLessThan(40);
  });

  it('搜尋英文名稱（跨分類）', async () => {
    await setup();
    fireEvent.input(screen.getByLabelText('搜尋動作'), { target: { value: 'barbell bench press' } });
    const want = expectedCount((e) => e.nameEn.toLowerCase().includes('barbell bench press'));
    await countIs(want);
    expect(want).toBeGreaterThan(0);
    expect(cards().some((c) => c.textContent?.includes('槓鈴臥推'))).toBe(true);
  });

  it('搜尋中文名稱，輸入去彈跳 200ms', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await setup();
      const before = count();
      fireEvent.input(screen.getByLabelText('搜尋動作'), { target: { value: '臥推' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      expect(count()).toBe(before);
      await act(async () => { await vi.advanceTimersByTimeAsync(150); });
      await countIs(expectedCount((e) => e.name.includes('臥推')));
    } finally {
      vi.useRealTimers();
    }
  });

  it('器材篩選：啞鈴 + 胸', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: '啞鈴' }));
    await countIs(expectedCount((e) => e.category === '胸' && e.equipment === '啞鈴'));
    expect(screen.getByRole('button', { name: '啞鈴' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '全部器材' }));
    await countIs(expectedCount((e) => e.category === '胸'));
  });

  it('肌群分頁切換與細分晶片', async () => {
    await setup();
    fireEvent.click(screen.getByRole('tab', { name: '手臂' }));
    await countIs(expectedCount((e) => e.category === '手臂'));
    fireEvent.click(screen.getByRole('button', { name: '三頭肌' }));
    await countIs(expectedCount((e) => e.category === '手臂' && e.primaryMuscle === '三頭肌'));
    expect(screen.getByRole('button', { name: '全部手臂' })).toBeTruthy();
  });

  it('伸展分頁沒有細分，只有「全部伸展」與「最愛」', async () => {
    await setup();
    fireEvent.click(screen.getByRole('tab', { name: '伸展' }));
    await countIs(expectedCount((e) => e.category === '伸展'));
    const group = screen.getByRole('group', { name: '肌群細分' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['全部伸展', '最愛']);
  });
});

describe('ExercisePicker 最愛與自訂動作', () => {
  it('收藏後出現在最愛；全部取消後為空並顯示新增自訂動作', async () => {
    await setup();
    // 假資料已收藏「槓鈴臥推」（胸）；再收藏第二張卡
    const second = cards()[1];
    fireEvent.click(within(second.closest('.exp-row') as HTMLElement).getByRole('button', { name: /^收藏 / }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^取消收藏 / }).length).toBeGreaterThanOrEqual(2));
    fireEvent.click(screen.getByRole('button', { name: '最愛' }));
    await countIs(2);
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getAllByRole('button', { name: /^取消收藏 / })[0]);
      await waitFor(() => expect(count()).toContain(`${1 - i} 個`));
    }
    await screen.findByText('這個分類還沒有最愛');
    // 標頭已有「新增自訂動作」，空狀態不再重複同一顆按鈕
    expect(screen.getAllByRole('button', { name: /新增自訂動作/ })).toHaveLength(1);
  });

  it('新增自訂動作：以目前分頁為分類，之後可搜尋', async () => {
    const { repos } = await setup();
    fireEvent.click(screen.getByRole('tab', { name: '肩' }));
    await countIs(expectedCount((e) => e.category === '肩'));
    fireEvent.click(screen.getByRole('button', { name: '新增自訂動作' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '確認' }));
    expect(within(dialog).getByText(/請輸入動作名稱/)).toBeTruthy();
    fireEvent.input(within(dialog).getByLabelText('動作名稱'), { target: { value: '我的肩推機' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '確認' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const found = await repos.exercises.list({ query: '我的肩推機' });
    expect(found).toHaveLength(1);
    expect(found[0].category).toBe('肩');
    expect(found[0].source).toBe('custom');
    fireEvent.input(screen.getByLabelText('搜尋動作'), { target: { value: '我的肩推機' } });
    await countIs(1);
    expect(cards()[0].textContent).toContain('我的肩推機');
  });
});

describe('ExercisePicker 模式', () => {
  it('single：點卡即 onSelect(id)', async () => {
    const onSelect = vi.fn();
    await setup({ onSelect });
    const card = cards()[0];
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledWith(card.dataset.exerciseId);
    expect(screen.queryByRole('button', { name: /^完成/ })).toBeNull();
  });

  it('multi：切換選取、顯示完成 (N)、onDone 依選取順序', async () => {
    const onDone = vi.fn();
    const onSelect = vi.fn();
    await setup({ mode: 'multi', onDone, onSelect });
    expect(screen.getByRole('button', { name: '完成 (0)' })).toBeTruthy();
    const [a, b] = cards();
    fireEvent.click(b);
    fireEvent.click(a);
    expect(a.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '完成 (2)' }));
    expect(onDone).toHaveBeenCalledWith([b.dataset.exerciseId, a.dataset.exerciseId]);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(cards()[0]);
    expect(screen.getByRole('button', { name: '完成 (1)' })).toBeTruthy();
  });

  it('multi：initialSelectedIds 預選', async () => {
    const id = all.find((e) => e.category === '胸')!.id;
    await setup({ mode: 'multi', initialSelectedIds: [id, 'nope'] });
    expect(screen.getByRole('button', { name: '完成 (2)' })).toBeTruthy();
    expect(cards().find((c) => c.dataset.exerciseId === id)?.getAttribute('aria-pressed')).toBe('true');
  });

  it('返回鈕呼叫 onClose', async () => {
    const { onClose } = await setup();
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('GIF 懶載入、路徑為 gifs/<檔名>', async () => {
    await setup();
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img.exp-thumb__img'));
    expect(imgs.length).toBeGreaterThan(0);
    for (const i of imgs) {
      expect(i.getAttribute('loading')).toBe('lazy');
      expect(i.getAttribute('src')).toMatch(/^gifs\/.+\.gif$/);
    }
  });
});

describe('ExercisePicker 手機實測修正', () => {
  const css = readFileSync(join(process.cwd(), 'src/features/exercises/exercises.css'), 'utf8');
  const rule = (sel: string) => {
    const at = css.indexOf(`${sel} {`);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };

  it('multi：完成 (N) 在固定底部列（sticky bottom＋安全區），且保留 aria-label', async () => {
    await setup({ mode: 'multi' });
    const btn = screen.getByRole('button', { name: '完成 (0)' });
    const bar = btn.closest('.exp-donebar');
    expect(bar).toBeTruthy();
    expect(bar!.closest('.exp-head')).toBeNull();
    expect(btn.getAttribute('aria-label')).toBe('完成 (0)');
    const r = rule('.exp-donebar');
    expect(r).toMatch(/position:\s*sticky/);
    expect(r).toMatch(/bottom:\s*0/);
    expect(r).toContain('safe-area-inset-bottom');
  });

  it('single：沒有底部完成列', async () => {
    await setup();
    expect(document.querySelector('.exp-donebar')).toBeNull();
  });

  it('搜尋框 opt-out 自動聚焦；新增自訂動作的名稱欄則不 opt-out', async () => {
    await setup();
    expect(screen.getByLabelText('搜尋動作').getAttribute('data-autofocus')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: '新增自訂動作' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('動作名稱').hasAttribute('data-autofocus')).toBe(false);
  });

  it('新增自訂動作按鈕只出現一次（含最愛為空、搜尋結果）', async () => {
    await setup();
    expect(screen.getAllByRole('button', { name: /新增自訂動作/ })).toHaveLength(1);
    fireEvent.input(screen.getByLabelText('搜尋動作'), { target: { value: '臥推' } });
    await countIs(expectedCount((e) => e.name.includes('臥推')));
    expect(screen.getAllByRole('button', { name: /新增自訂動作/ })).toHaveLength(1);
  });

  it('長名稱截斷（ellipsis）', () => {
    expect(rule('.exp-card__name')).toContain('text-overflow: ellipsis');
  });
});
