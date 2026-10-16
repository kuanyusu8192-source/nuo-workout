// 將來源資料夾內的 *.gif 複製到目標資料夾（預設 www/gifs，不進 git）。
// 用法：node scripts/copy-gifs.mjs --from <資料夾> [--to www/gifs]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function copyGifs(from, to = 'www/gifs') {
  if (!fs.existsSync(from) || !fs.statSync(from).isDirectory()) {
    throw new Error(`來源資料夾不存在：${from}`);
  }
  fs.mkdirSync(to, { recursive: true });
  let copied = 0;
  let skipped = 0;
  for (const name of fs.readdirSync(from)) {
    if (!name.toLowerCase().endsWith('.gif')) continue;
    const src = path.join(from, name);
    const dst = path.join(to, name);
    const srcStat = fs.statSync(src);
    if (!srcStat.isFile()) continue;
    if (fs.existsSync(dst) && fs.statSync(dst).size === srcStat.size) {
      skipped++;
      continue;
    }
    fs.copyFileSync(src, dst);
    copied++;
  }
  return { copied, skipped, total: copied + skipped };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') args.from = argv[++i];
    else if (argv[i] === '--to') args.to = argv[++i];
  }
  return args;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { from, to } = parseArgs(process.argv.slice(2));
  if (!from) {
    console.error('用法：node scripts/copy-gifs.mjs --from <資料夾> [--to www/gifs]');
    process.exit(1);
  }
  try {
    const r = copyGifs(from, to);
    console.log(`複製 ${r.copied}、跳過 ${r.skipped}、總數 ${r.total}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
