# src/app 應用外殼與共用契約

畫面（`src/features/*`）只依賴：`src/app/context`（Repos、AppState、資料 hooks）、`src/app/router`＋`paths`、`src/components`（共用元件）、`src/features/shared`（常數）、`src/domain`（純函式）。**不得**直接 import `data/repos/memory|dexie`。

## 路由表（`routes.tsx`，hash 路由）

| 路徑 | 畫面 | 備註 |
|---|---|---|
| `#/today` `#/history` `#/plans` `#/diet` `#/settings` | 五個分頁畫面 | 有底部分頁列；根畫面，返回鍵 = 離開 App |
| `#/exercise/:id?tab=tutorial\|record\|chart\|history` | `ExerciseDetail` | 全螢幕子頁，標頭有返回鈕 |
| `#/picker?mode=single\|multi` | `ExercisePicker` | 路由僅供獨立使用／開發；功能內嵌請直接放進 `<Sheet>` |
| `#/onboarding` | `OnboardingFlow` | 首次問卷 |
| 空 hash | 導向 `#/today` | |

路徑一律用 `paths`（`paths.exercise(id, 'chart')`、`paths.picker('multi')`）；導覽用 `navigate(path, {replace?})`、`goBack()`、`useRoute()`；支援 `:param` 與結尾 `/*`（巢狀）。分頁切換用 replace，所以返回鍵不會在分頁間來回。

## 契約

- **Repos 注入**：`<ReposProvider repos>` / `useRepos()`。啟動時 `bootstrap()`（`bootstrap.ts`）用 `createRepos()`（`createRepos.ts`）建立實作：預設記憶體版，`?db=dexie` 或 `VITE_DB=dexie` 換 Dexie 版（P4）。
- **AppState**：`useAppState()` → `mode`（gear/travel/backfill）、`setMode`、`activePlanId`、`setActivePlanId`（會寫入 repo）、`selectedDate`、`setSelectedDate`、`today`、`dataVersion`、`invalidate()`。離開補記模式會把 `selectedDate` 重設為今天。
- **資料 hooks**：`useRepoQuery((repos) => repos.sessions.getByDate(d), [d])` → `{ data, error, loading, reload }`；`useAsync(fn, deps)` 同形。寫入資料後呼叫 `invalidate()`，所有 `useRepoQuery` 自動重查。重新載入時保留舊 `data`（不閃爍）。
- **返回鍵**：面板／彈窗用 `useBackHandler(onClose, open)`（`Sheet`／`Modal` 已內建）。返回時先關「最上層」，沒有就返回上一頁，根畫面則呼叫 `<App onExit>`。目前由 `popstate` 與自訂事件 `nuo:back`（`dispatchBackEvent()`）模擬；Capacitor 之後只要在 `App.addListener('backButton', ...)` 裡呼叫 `dispatchBackEvent()`。
- **跨功能元件簽名**（stub 在 `src/features/**`，只可填實作、不可改簽名）：`ExercisePickerProps`、`ExerciseDetailProps`、`CelebrationProps`（`kinds` 型別 = `PrKind`，`src/domain/pr.ts`）。

## 如何新增畫面

1. 在 `src/features/<name>/` 建元件（只用上述依賴）。
2. 在 `routes.tsx` 的 `ROUTES` 加一筆 `{ pattern, title, tab?, render }`（有 `tab` 才會顯示底部分頁並視為根畫面）。
3. 若需要被其他畫面導覽，在 `paths.ts` 加建構器。
4. 測試用 `src/test/helpers.tsx` 的 `renderWithApp(ui, repos?)`；資料用 `seedFakeData`。

## 用假資料開發

`npm run dev` 後開 `http://localhost:5173/?fake=1`：啟動時灌入真實動作庫＋約 8 週訓練、3 個課表、器材版／出差版週計畫、8 筆體重、profile、今天與昨天的飲食（`src/dev/fakeData.ts`，固定亂數種子；訓練只到昨天，所以「今天」可直接測開始訓練）。不帶 `fake` 則只灌動作庫（空白狀態）。`?fake=1` 只對記憶體版生效，不會污染 Dexie。測試中：`await seedFakeData(repos, { today: '2026-10-16' })`、`seedEmptyData(repos)`。

## 樣式

`theme.css`（色票變數、字型）→ `components/ui.css`（共用元件）→ `app/app.css`（外殼）。按鈕底色用 `*-600` 深階色；所有可點元素 ≥ 44px；z-index 用 `--z-*` 變數。`components/ui.css.test.ts` 會檢查這些規則。
