import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
// @ts-expect-error mjs 無型別宣告
import { copyGifs } from './copy-gifs.mjs';

let tmp: string;
let from: string;
let to: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-gifs-'));
  from = path.join(tmp, 'src');
  to = path.join(tmp, 'out', 'gifs');
  fs.mkdirSync(from);
  fs.writeFileSync(path.join(from, 'a.gif'), Buffer.from([1, 2, 3]));
  fs.writeFileSync(path.join(from, 'b.GIF'), Buffer.from([4, 5]));
  fs.writeFileSync(path.join(from, 'c.gif'), Buffer.from([6]));
  fs.writeFileSync(path.join(from, 'note.txt'), 'ignore');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('copyGifs', () => {
  it('複製所有 gif 並建立目標資料夾，忽略非 gif', () => {
    const r = copyGifs(from, to);
    expect(r).toEqual({ copied: 3, skipped: 0, total: 3 });
    expect(fs.readdirSync(to).sort()).toEqual(['a.gif', 'b.GIF', 'c.gif']);
    expect([...fs.readFileSync(path.join(to, 'a.gif'))]).toEqual([1, 2, 3]);
  });

  it('已存在且大小相同的檔案跳過，大小不同則覆蓋', () => {
    copyGifs(from, to);
    fs.writeFileSync(path.join(to, 'c.gif'), Buffer.from([9, 9]));
    const r = copyGifs(from, to);
    expect(r).toEqual({ copied: 1, skipped: 2, total: 3 });
    expect(fs.statSync(path.join(to, 'c.gif')).size).toBe(1);
  });

  it('來源不存在時丟出錯誤', () => {
    expect(() => copyGifs(path.join(tmp, 'nope'), to)).toThrow('來源資料夾不存在');
  });

  it('CLI：來源不存在以非 0 結束', () => {
    const script = path.resolve(__dirname, 'copy-gifs.mjs');
    const r = spawnSync(process.execPath, [script, '--from', path.join(tmp, 'nope'), '--to', to]);
    expect(r.status).not.toBe(0);
  });
});
