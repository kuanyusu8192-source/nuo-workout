import { describe, expect, it } from 'vitest';
import type { Template } from '../../data/types';
import { moveItem, reorderStamps } from './planLogic';

const tpl = (id: string, createdAt: number): Template => ({ id, name: id, color: '#000', exercises: [], createdAt });

describe('planLogic', () => {
  it('moveItem 不改原陣列、越界回傳副本', () => {
    const a = [1, 2, 3];
    expect(moveItem(a, 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem(a, 2, 0)).toEqual([3, 1, 2]);
    expect(moveItem(a, 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem(a, 1, 3)).toEqual([1, 2, 3]);
    expect(a).toEqual([1, 2, 3]);
  });

  it('reorderStamps：重新分配時間戳且嚴格遞增（即使原本同毫秒）', () => {
    const old = [tpl('a', 100), tpl('b', 100), tpl('c', 100)];
    const next = [old[1], old[0], old[2]];
    const updates = reorderStamps(old, next);
    const stamp = new Map(old.map((t) => [t.id, t.createdAt]));
    for (const u of updates) stamp.set(u.id, u.createdAt);
    const order = [...stamp.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id);
    expect(order).toEqual(['b', 'a', 'c']);
    expect(new Set(stamp.values()).size).toBe(3);
  });

  it('reorderStamps：順序不變時沒有更新', () => {
    const old = [tpl('a', 1), tpl('b', 2)];
    expect(reorderStamps(old, old)).toEqual([]);
  });
});
