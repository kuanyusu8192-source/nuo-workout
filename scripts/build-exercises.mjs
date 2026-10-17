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

// 名稱正規化：去掉開頭 [徒手]／[有氧] 等前綴、括號內補充，全形半形（NFKC）與空白一律忽略
export function normalizeName(name) {
  let s = String(name ?? '').normalize('NFKC');
  s = s.replace(/^(?:[\[【][^\]】]*[\]】]\s*)+/, '');
  s = s.replace(/[(][^)]*[)]/g, '');
  return s.replace(/\s+/g, '').toLowerCase();
}

// NUO 動作若與 VolumeX 同名（正規化後）→ 保留 VolumeX、丟棄 NUO，回傳別名 { nuoId: vxId }。
// 伸展類一律保留。多個 VolumeX 同名時優先：器材相同 > 名稱無括號補充 > id 較小。
export function findAliases(volumex, nuo) {
  const byName = new Map();
  for (const v of volumex) {
    const k = normalizeName(v.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(v);
  }
  const aliases = {};
  for (const n of nuo) {
    if (n.category === '伸展') continue;
    const cands = byName.get(normalizeName(n.name));
    if (!cands?.length) continue;
    const score = (v) => [v.equipment === n.equipment ? 0 : 1, /[(（]/.test(v.name) ? 1 : 0];
    const best = [...cands].sort((a, b) => {
      const sa = score(a);
      const sb = score(b);
      return sa[0] - sb[0] || sa[1] - sb[1] || a.id.localeCompare(b.id);
    })[0];
    aliases[n.id] = best.id;
  }
  return aliases;
}

export function buildAllWithAliases(volumex, nuo) {
  const vx = volumex.map(convertVolumex);
  const nu = nuo.map(convertNuo);
  assertUniqueIds([...vx, ...nu]);
  const aliases = findAliases(vx, nu);
  const exercises = [...vx, ...nu.filter((n) => !(n.id in aliases))];
  return { exercises, aliases };
}

export function buildAll(volumex, nuo) {
  return buildAllWithAliases(volumex, nuo).exercises;
}

// 資料健檢：回傳問題清單（字串陣列）。gifFiles 為磁碟上實際存在的 GIF 檔名集合（可省略＝不檢查檔案）。
export function checkExercises(list, gifFiles) {
  const issues = [];
  const ids = new Set();
  const gifs = new Map();
  for (const e of list) {
    if (!e.id) issues.push(`缺 id：${e.name}`);
    else if (ids.has(e.id)) issues.push(`重複 id：${e.id}`);
    else ids.add(e.id);
    if (!e.name || e.name !== e.name.trim()) issues.push(`名稱為空或前後有空白：${e.id} ${JSON.stringify(e.name)}`);
    if (!NUO_CATEGORIES.has(e.category)) issues.push(`分類異常：${e.id} ${e.category}`);
    if (e.gifFile) {
      if (!gifs.has(e.gifFile)) gifs.set(e.gifFile, []);
      gifs.get(e.gifFile).push(e.id);
      if (gifFiles && !gifFiles.has(e.gifFile)) issues.push(`GIF 檔不存在：${e.id} ${e.gifFile}`);
    }
  }
  for (const [f, who] of gifs) if (who.length > 1) issues.push(`同一 GIF 對應多個動作：${f} ← ${who.join(', ')}`);
  return issues;
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
  const { exercises: all, aliases } = buildAllWithAliases(volumex, nuo);
  const expected = volumex.length + nuo.length - Object.keys(aliases).length;
  if (all.length !== expected) throw new Error(`筆數不符：${all.length} ≠ ${expected}`);
  const aliasOut = arg('--aliases-out') ?? path.join(path.dirname(out), 'exercise-aliases.json');
  fs.writeFileSync(aliasOut, `${JSON.stringify(aliases, null, 2)}\n`);
  const gifDir = arg('--gifs') ?? path.join(path.dirname(from), 'gifs');
  const gifFiles = fs.existsSync(gifDir) ? new Set(fs.readdirSync(gifDir)) : undefined;
  const issues = checkExercises(all, gifFiles);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(all));
  const counts = {};
  for (const e of all) counts[e.category] = (counts[e.category] || 0) + 1;
  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
  console.log(`共 ${all.length} 筆（VolumeX ${volumex.length} + NUO ${nuo.length} − 同名去重 ${Object.keys(aliases).length}），id 無重複`);
  console.log('別名對照：', aliases, `→ ${aliasOut}`);
  console.log(issues.length ? `資料健檢問題 ${issues.length} 項：\n  ${issues.join('\n  ')}` : '資料健檢：無問題');
  console.log('分類計數：', counts);
  console.log(`無 GIF：${all.filter((e) => !e.gifFile).length} 筆；輸出 ${out}（${mb} MB）`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
