import { describe, it, expect } from 'vitest';
import {
  mapCategory,
  trackingTypeOf,
  gifFileOf,
  convertVolumex,
  convertNuo,
  assertUniqueIds,
  buildAll,
} from '../../scripts/build-exercises.mjs';

// 自編小型 fixture（非真實資料）
const vxChest = {
  id: '0001',
  name: '測試臥推',
  name_en: 'Test Bench',
  category: 'chest',
  equipment: '槓鈴',
  primaryMuscle: '胸肌',
  secondary_muscles: ['三頭肌'],
  instructions: ['舊步驟一'],
  instruction_steps: { 'zh-TW': ['步驟一', '步驟二', '教練提示：保持穩定'] },
  tips: ['x'],
  local_gif_path: 'assets/gifs/abc12345.gif',
};
// 缺 id、camelCase 欄位、無 zh-TW、無 equipment 的異形紀錄
const vxOdd = {
  name: '異形弓步',
  name_en: 'Odd Lunge',
  category: 'upper legs',
  primaryMuscle: '股四頭肌',
  secondaryMuscles: ['臀大肌'],
  instructions: ['只有 instructions'],
  instruction_steps: { en: ['english'] },
  local_gif_path: 'assets/gifs/zzz99999.gif',
};
const vxRower = {
  id: '0900',
  name: '划船機',
  name_en: 'Rowing Machine',
  category: 'cardio',
  equipment: '划船機',
  primaryMuscle: '心肺',
  secondary_muscles: [],
  instructions: [],
  instruction_steps: {},
  local_gif_path: 'assets/images/rowing_placeholder.png',
};
const vxNeck = { ...vxChest, id: '0002', category: 'neck', local_gif_path: 'assets/gifs/neck0001.gif' };
const nuoStretch = { id: 'nuo-cd-cat-cow', name: '貓牛式', category: '伸展', equipment: '自重', steps: ['重複 10 次'] };

describe('mapCategory', () => {
  it.each([
    ['chest', '胸'],
    ['back', '背'],
    ['shoulders', '肩'],
    ['neck', '肩'],
    ['upper arms', '手臂'],
    ['lower arms', '手臂'],
    ['upper legs', '臀腿'],
    ['lower legs', '臀腿'],
    ['waist', '核心'],
    ['cardio', '有氧'],
  ])('%s → %s', (raw, expected) => {
    expect(mapCategory(raw)).toBe(expected);
  });
  it('未知分類丟錯', () => {
    expect(() => mapCategory('foo')).toThrow();
  });
});

describe('trackingTypeOf', () => {
  it('有氧→cardio、伸展→stretch、其餘→strength', () => {
    expect(trackingTypeOf('有氧')).toBe('cardio');
    expect(trackingTypeOf('伸展')).toBe('stretch');
    expect(trackingTypeOf('胸')).toBe('strength');
  });
});

describe('gifFileOf', () => {
  it('取檔名', () => expect(gifFileOf('assets/gifs/abc12345.gif')).toBe('abc12345.gif'));
  it('非 gif（占位圖）或空值 → null', () => {
    expect(gifFileOf('assets/images/rowing_placeholder.png')).toBeNull();
    expect(gifFileOf('')).toBeNull();
    expect(gifFileOf(undefined)).toBeNull();
  });
});

describe('convertVolumex', () => {
  it('沿用 id 加 vx- 前綴、映射分類、zh-TW 步驟、抽出教練提示', () => {
    const e = convertVolumex(vxChest);
    expect(e).toMatchObject({
      id: 'vx-0001',
      name: '測試臥推',
      nameEn: 'Test Bench',
      category: '胸',
      equipment: '槓鈴',
      primaryMuscle: '胸肌',
      secondaryMuscles: ['三頭肌'],
      trackingType: 'strength',
      steps: ['步驟一', '步驟二'],
      tips: '保持穩定',
      gifFile: 'abc12345.gif',
      source: 'volumex',
    });
  });
  it('缺 id 時以 GIF 檔名衍生 id；缺 zh-TW 退回 instructions；缺 equipment → 空字串', () => {
    const e = convertVolumex(vxOdd);
    expect(e.id).toBe('vx-zzz99999');
    expect(e.steps).toEqual(['只有 instructions']);
    expect(e.secondaryMuscles).toEqual(['臀大肌']);
    expect(e.equipment).toBe('');
    expect(e.category).toBe('臀腿');
  });
  it('缺 GIF（占位圖）→ gifFile null；有氧 → cardio', () => {
    const e = convertVolumex(vxRower);
    expect(e.gifFile).toBeNull();
    expect(e.trackingType).toBe('cardio');
  });
  it('neck 併入肩', () => expect(convertVolumex(vxNeck).category).toBe('肩'));
});

describe('convertNuo', () => {
  it('伸展 → stretch、source nuo、缺欄位給預設', () => {
    const e = convertNuo(nuoStretch);
    expect(e).toMatchObject({
      id: 'nuo-cd-cat-cow',
      category: '伸展',
      trackingType: 'stretch',
      source: 'nuo',
      gifFile: null,
      nameEn: '',
      tips: '',
      steps: ['重複 10 次'],
    });
  });
  it('id 缺 nuo- 前綴丟錯', () => {
    expect(() => convertNuo({ ...nuoStretch, id: 'cat-cow' })).toThrow();
  });
});

describe('assertUniqueIds / buildAll', () => {
  it('重複 id 丟錯並指出 id', () => {
    expect(() => assertUniqueIds([{ id: 'a' }, { id: 'b' }, { id: 'a' }])).toThrow(/a/);
  });
  it('合併 VolumeX 與 NUO，筆數相加且 id 唯一', () => {
    const all = buildAll([vxChest, vxOdd, vxRower, vxNeck], [nuoStretch]);
    expect(all).toHaveLength(5);
    expect(new Set(all.map((e) => e.id)).size).toBe(5);
  });
  it('VolumeX 內 id 重複 → buildAll 丟錯', () => {
    expect(() => buildAll([vxChest, vxChest], [])).toThrow(/vx-0001/);
  });
});
