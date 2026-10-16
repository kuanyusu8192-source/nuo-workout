# src/data 資料層

## 版本
- IndexedDB（Dexie）schema 版本：**1**（`db.ts` 的 `this.version(1)`）。
- 備份檔格式版本：**1**（`backup.ts` 的 `BACKUP_VERSION`）。

## 索引（只有這些欄位能 where 查詢）
| 表 | 主鍵 / 索引 |
|---|---|
| exercises | id, category, equipment, source |
| sessions | id, date |
| sets | id, sessionId, exerciseId, createdAt |
| bodyMetrics / meals | id, date |
| burnOverrides | date（主鍵） |
| favoriteExercises | exerciseId（主鍵） |
| templates / plans / profile / favoriteMeals / settings | id |

## Repository 合約（memory 與 dexie 必須行為一致，見 `repos/contract.test.ts`）
- `update(id, patch)`：patch 中**值為 undefined 的欄位會被移除**（欄位消失，非存成 undefined）；找不到 id 則擲錯。共用函式 `applyPatch`（`repos/interfaces.ts`）。
- `remove(id)`：找不到靜默忽略。
- `listByRange({from,to})`：閉區間，端點可省略（meals、burnOverrides、sessions、bodyMetrics.list）。
- `templates.list()` 依 `order`（缺值在後）再 `createdAt`；`reorder(ids)` 從 0 起重寫，未知 id 忽略。

## 新增欄位（不需遷移的情況）
**非索引的選用欄位**（如 `plans.isTravel`、`templates.order`）不需升 Dexie 版本：IndexedDB 本身無固定欄位，舊資料缺欄位時讀到 `undefined`，程式端以預設值處理（例如 `Boolean(plan.isTravel)`）。步驟：
1. `types.ts` 加選用欄位。
2. `backup.ts` 的 `SCHEMA` 加 `'type?'`（選用）以驗證型別；備份版本維持 1（舊檔缺欄位可匯入）。
3. 在 `contract.test.ts` 與 `backup.test.ts` 補測試。

## 何時必須升 Dexie 版本
- 新增／修改**索引**，或新增資料表，或需要**改寫既有資料**（回填、改名、拆欄位）。
- 做法：保留舊 `version(n)`，新增 `version(n+1)`，只列出有變動的表；需改資料時加 `.upgrade()`：

```ts
this.version(2)
  .stores({ sets: 'id, sessionId, exerciseId, createdAt, [exerciseId+createdAt]' })
  .upgrade((tx) =>
    tx.table('plans').toCollection().modify((p) => {
      if (p.isTravel === undefined) p.isTravel = /出差/.test(p.name);
    }),
  );
```
- 測試：用 fake-indexeddb 先以舊版 `new Dexie(name).version(1).stores(...)` 寫入資料並 close，再以新 `NuoDB(name)` 開啟，驗證資料保留與回填。
- 若備份格式有**破壞性**變更（必填欄位、意義改變）才遞增 `BACKUP_VERSION`，並在 `validate` 對舊版做轉換。

## 本次（P4 補強）判斷
- 新增 `plans.isTravel?`、`templates.order?` 皆為非索引選用欄位 → **不升 Dexie 版本、不升備份版本**。
- 實機風險：舊資料的 plans 缺 `isTravel`，畫面端應 fallback 為「名稱含『出差』」或 false，直到使用者重存；若想一次回填，需另升 version 2 並用上方 `.upgrade()`（目前未做）。
