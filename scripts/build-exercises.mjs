// 動作資料建置：VolumeX JSON + NUO 舊動作 → src/assets/exercises.json
// 用法：node scripts/build-exercises.mjs --from <VolumeX JSON> --out src/assets/exercises.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CATEGORY_MAP = {
  chest: '胸',
  back: '背',
  shoulders: '肩',
  neck: '肩',
  'upper arms': '手臂',
  'lower arms': '手臂',
  'upper legs': '臀腿',
  'lower legs': '臀腿',
  waist: '核心',
  cardio: '有氧',
};
const NUO_CATEGORIES = new Set(['胸', '背', '臀腿', '肩', '手臂', '核心', '有氧', '伸展']);
const TIP_PREFIX = /^教練提示[：:]\s*/;

export function mapCategory(raw) {
  const c = CATEGORY_MAP[raw];
  if (!c) throw new Error(`未知的 VolumeX 分類：${raw}`);
  return c;
}

export function trackingTypeOf(category) {
  if (category === '有氧') return 'cardio';
  if (category === '伸展') return 'stretch';
  return 'strength';
}

export function gifFileOf(p) {
  if (!p) return null;
  const name = String(p).split(/[\/]/).pop();
  return /\.gif$/i.test(name) ? name : null;
}

// 步驟取 zh-TW（缺則 instructions）；「教練提示：」那一條抽成 tips，不重複放進 steps
function stepsAndTips(raw) {
  const zh = raw.instruction_steps?.['zh-TW'];
  const list = (Array.isArray(zh) && zh.length ? zh : raw.instructions) ?? [];
  const steps = [];
  const tips = [];
  for (const s of list) {
    if (TIP_PREFIX.test(s)) tips.push(s.replace(TIP_PREFIX, ''));
    else steps.push(s);
  }
  return { steps, tips: tips.join('\n') };
}

export function convertVolumex(raw) {
  const gifPath = raw.local_gif_path || raw.gif_url || raw.gifUrl;
  const gifFile = gifFileOf(gifPath);
  // 部分紀錄缺 id：以 GIF 檔名（唯一）衍生穩定 id
  const baseId = raw.id || (gifFile ? gifFile.replace(/\.gif$/i, '') : null);
  if (!baseId) throw new Error(`VolumeX 紀錄缺 id 且無 GIF 可衍生：${raw.name}`);
  const category = mapCategory(raw.category || raw.body_part);
  const { steps, tips } = stepsAndTips(raw);
  return {
    id: `vx-${baseId}`,
    name: raw.name,
    nameEn: raw.name_en ?? '',
    category,
    equipment: raw.equipment ?? '',
    primaryMuscle: raw.primaryMuscle || raw.target || '',
    secondaryMuscles: raw.secondaryMuscles || raw.secondary_muscles || [],
    trackingType: trackingTypeOf(category),
    steps,
    tips,
    gifFile,
    source: 'volumex',
  };
}

export function convertNuo(raw) {
  if (!/^nuo-/.test(raw.id ?? '')) throw new Error(`NUO 動作 id 需以 nuo- 開頭：${raw.id}`);
  if (!NUO_CATEGORIES.has(raw.category)) throw new Error(`NUO 動作分類無效：${raw.id} ${raw.category}`);
  return {
    id: raw.id,
    name: raw.name,
    nameEn: '',
    category: raw.category,
    equipment: raw.equipment ?? '',
    primaryMuscle: '',
    secondaryMuscles: [],
    trackingType: trackingTypeOf(raw.category),
    steps: raw.steps ?? [],
    tips: raw.tips ?? '',
    gifFile: null,
    source: 'nuo',
  };
}

export function assertUniqueIds(list) {
  const seen = new Set();
  const dups = new Set();
  for (const { id } of list) (seen.has(id) ? dups : seen).add(id);
  if (dups.size) throw new Error(`重複的 id：${[...dups].join(', ')}`);
}

export function buildAll(volumex, nuo) {
  const all = [...volumex.map(convertVolumex), ...nuo.map(convertNuo)];
  assertUniqueIds(all);
  return all;
}

function main() {
  const args = process.argv.slice(2);
  const arg = (k) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const from = arg('--from');
  const out = arg('--out') ?? 'src/assets/exercises.json';
  if (!from) throw new Error('缺少 --from <VolumeX JSON 路徑>');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const volumex = JSON.parse(fs.readFileSync(from, 'utf8'));
  const nuo = JSON.parse(fs.readFileSync(path.join(here, 'nuo-legacy-exercises.json'), 'utf8'));
  const all = buildAll(volumex, nuo);
  const expected = volumex.length + nuo.length;
  if (all.length !== expected) throw new Error(`筆數不符：${all.length} ≠ ${expected}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(all));
  const counts = {};
  for (const e of all) counts[e.category] = (counts[e.category] || 0) + 1;
  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
  console.log(`共 ${all.length} 筆（VolumeX ${volumex.length} + NUO ${nuo.length}），id 無重複`);
  console.log('分類計數：', counts);
  console.log(`無 GIF：${all.filter((e) => !e.gifFile).length} 筆；輸出 ${out}（${mb} MB）`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
