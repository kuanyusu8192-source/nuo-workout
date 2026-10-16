// 把 www/gifs 複製進 dist/gifs，讓 Capacitor 打包進 APK。
// 用法：node scripts/prepare-assets.mjs [--skip-gifs]（或環境變數 NUO_SKIP_GIFS=1）
// GIF 目錄不存在時只警告，不失敗。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function prepareAssets({ from = 'www/gifs', to = 'dist/gifs', skip = false } = {}) {
  if (skip) {
    console.log('[prepare-assets] 略過 GIF');
    return 0;
  }
  if (!fs.existsSync(from) || !fs.statSync(from).isDirectory()) {
    console.warn(`[prepare-assets] 警告：找不到 ${from}，APK 將不含 GIF（先跑 npm run copy:gifs）`);
    return 0;
  }
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const name of fs.readdirSync(from)) {
    if (!name.toLowerCase().endsWith('.gif')) continue;
    fs.copyFileSync(path.join(from, name), path.join(to, name));
    n++;
  }
  console.log(`[prepare-assets] 已複製 ${n} 個 GIF 到 ${to}`);
  return n;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareAssets({ skip: process.argv.includes('--skip-gifs') || process.env.NUO_SKIP_GIFS === '1' });
}
