import { describe, it, expect } from 'vitest';
import {
  buildAllWithAliases,
  checkExercises,
  convertNuo,
  convertVolumex,
  findAliases,
  normalizeName,
} from '../../scripts/build-exercises.mjs';
import aliasesJson from '../assets/exercise-aliases.json';
import exercisesJson from '../assets/exercises.json';

const vx = (id: string, name: string, equipment = '啞鈴') => ({
  id, name, name_en: name, category: 'chest', equipment, primaryMuscle: '胸肌',
  secondary_muscles: [], instructions: [], instruction_steps: {}, local_gif_path: `assets/gifs/${id}.gif`,
});
const nuo = (id: string, name: string, category = '胸', equipment = '啞鈴') => ({ id, name, category, equipment, steps: [] });

describe('normalizeName', () => {
  it('去前綴、括號補充、空白與全形半形', () => {
    expect(normalizeName('[徒手] 啞鈴　臥推')).toBe('啞鈴臥推');
    expect(normalizeName('【有氧】波比跳（進階）')).toBe('波比跳');
    expect(normalizeName('[全身]登山者(快速)')).toBe('登山者');
    expect(normalizeName('ＥＺ 槓彎舉')).toBe('ez槓彎舉');
  });
  it('不同名不會被正規化成相同', () => {
    expect(normalizeName('伏地挺身')).not.toBe(normalizeName('掌上壓'));
    expect(normalizeName('上斜臥推')).not.toBe(normalizeName('啞鈴上斜臥推'));
  });
});

describe('NUO 與 VolumeX 同名去重', () => {
  it('同名：保留 VolumeX、丟棄 NUO，並輸出別名', () => {
    const { exercises, aliases } = buildAllWithAliases([vx('0289', '啞鈴臥推')], [nuo('nuo-db-bench', '啞鈴臥推')]);
    expect(aliases).toEqual({ 'nuo-db-bench': 'vx-0289' });
    expect(exercises.map((e: { id: string }) => e.id)).toEqual(['vx-0289']);
  });
  it('近似但不同名不合併', () => {
    const { exercises, aliases } = buildAllWithAliases([vx('0662', '掌上壓', '自重')], [nuo('nuo-bw-pushup', '伏地挺身', '胸', '自重')]);
    expect(aliases).toEqual({});
    expect(exercises).toHaveLength(2);
  });
  it('伸展類一律保留，即使與 VolumeX 同名', () => {
    const { exercises, aliases } = buildAllWithAliases(
      [vx('0817', '三頭肌伸展', '自重')],
      [nuo('nuo-cd-triceps-stretch', '三頭肌伸展', '伸展', '自重')],
    );
    expect(aliases).toEqual({});
    expect(exercises.map((e: { id: string }) => e.id).sort()).toEqual(['nuo-cd-triceps-stretch', 'vx-0817']);
  });
  it('多個同名候選：優先器材相同、再優先名稱無括號', () => {
    const list = [vx('0100', '啞鈴臥推', '槓鈴'), vx('0150', '啞鈴臥推（變化）'), vx('0289', '啞鈴臥推')].map(convertVolumex);
    expect(findAliases(list, [convertNuo(nuo('nuo-db-bench', '啞鈴臥推'))])).toEqual({ 'nuo-db-bench': 'vx-0289' });
  });
  it('筆數 = VolumeX + NUO − 別名數', () => {
    const { exercises, aliases } = buildAllWithAliases(
      [vx('1', '甲'), vx('2', '乙')],
      [nuo('nuo-a', '甲'), nuo('nuo-b', '丙')],
    );
    expect(exercises).toHaveLength(2 + 2 - Object.keys(aliases).length);
  });
});

describe('checkExercises', () => {
  const ok = { id: 'a', name: 'n', category: '胸', gifFile: 'a.gif' };
  it('正常資料無問題', () => {
    expect(checkExercises([ok], new Set(['a.gif']))).toEqual([]);
  });
  it('抓出缺 id、重複 id、空白名稱、異常分類、缺 GIF 檔、共用 GIF', () => {
    const issues = checkExercises(
      [
        { ...ok, id: '' },
        ok,
        ok,
        { ...ok, id: 'x', name: ' x' },
        { ...ok, id: 'b', category: '怪' as never },
        { ...ok, id: 'c', gifFile: 'missing.gif' },
      ],
      new Set(['a.gif']),
    ).join('|');
    for (const re of [/缺 id/, /重複 id/, /空白/, /分類異常/, /GIF 檔不存在/, /同一 GIF/]) expect(issues).toMatch(re);
  });
});

describe('真實 exercises.json', () => {
  const list = exercisesJson as unknown as { id: string; name: string; category: string; source: string }[];
  const aliases = aliasesJson as Record<string, string>;
  it('無缺 id／重複 id／空白名稱／異常分類', () => {
    expect(checkExercises(list as never).filter((m: string) => !/同一 GIF/.test(m))).toEqual([]);
  });
  it('別名來源已移除、目標存在', () => {
    const ids = new Set(list.map((e) => e.id));
    expect(Object.keys(aliases).length).toBeGreaterThan(0);
    for (const [o, n] of Object.entries(aliases)) {
      expect(ids.has(o)).toBe(false);
      expect(ids.has(n)).toBe(true);
    }
  });
  it('不再有同名的 NUO 與 VolumeX 非伸展動作', () => {
    const names = new Set(list.filter((e) => e.source === 'volumex').map((e) => normalizeName(e.name)));
    const dup = list.filter((e) => e.source === 'nuo' && e.category !== '伸展' && names.has(normalizeName(e.name)));
    expect(dup.map((e) => e.id)).toEqual([]);
  });
});
