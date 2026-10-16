// 測試用的最小 node 型別（專案未安裝 @types/node）。只宣告 ui.css.test 需要的部分。
declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string;
}
