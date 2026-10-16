// 檢查 theme.css 內「文字／底色」配對（scripts/contrast-pairs.json）的 WCAG 對比 >= 4.5。
// fg/bg 可為 #rrggbb 或 theme.css 的 CSS 變數名（--xxx）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`無效色碼：${hex}`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function parseVars(css) {
  const vars = {};
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) vars[m[1]] = m[2];
  return vars;
}

export function checkPairs(pairs, vars, min = 4.5) {
  return pairs.map((p) => {
    const resolve = (v) => (v.startsWith('--') ? vars[v] : v);
    const fg = resolve(p.fg);
    const bg = resolve(p.bg);
    if (!fg || !bg) throw new Error(`找不到色彩變數：${p.name}`);
    const ratio = contrastRatio(fg, bg);
    return { name: p.name, fg, bg, ratio, ok: ratio >= min };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const css = fs.readFileSync(path.join(here, '..', 'src', 'theme.css'), 'utf8');
  const pairs = JSON.parse(fs.readFileSync(path.join(here, 'contrast-pairs.json'), 'utf8'));
  let failed = false;
  try {
    for (const r of checkPairs(pairs, parseVars(css))) {
      console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.ratio.toFixed(2)}  ${r.name} (${r.fg} / ${r.bg})`);
      if (!r.ok) failed = true;
    }
  } catch (e) {
    console.error(e.message);
    failed = true;
  }
  process.exit(failed ? 1 : 0);
}
