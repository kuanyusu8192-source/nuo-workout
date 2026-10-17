# src/app 應用外殼與共用契約

畫面（`src/features/*`）只依賴：`src/app/context`（Repos、AppState、資料 hooks）、`src/app/router`＋`paths`、`src/components`（共用元件）、`src/features/shared`（常數）、`src/domain`（純函式）。**不得**直接 import `data/repos/memory|dexie`。

## 路由表（`routes.tsx`，hash 路由）

| 路徑 | 畫面 | 備註 |
|---|---|---|
| `#/today` `#/history` `#/plans` `#/diet` `#/settings` | 五個分頁畫面 | 有底部分頁列；根畫面，返回鍵 = 離開 App |
| `#/exercise/:id?tab=tutorial\|record\|chart\|history` | `ExerciseDetail` | 全螢幕子頁；外殼標頭有返回鈕，元件自帶標頭由 CSS 隱藏（見「標頭去重」） |
| `#/picker?mode=single\|multi` | `ExercisePicker` | 路由僅供獨立使用／開發；功能內嵌請直接放進 `<Sheet>` |
| `#/onboarding` | `OnboardingFlow` | 首次問卷 |
| 空 hash | 導向 `#/today` | |

路徑一律用 `paths`（`paths.exercise(id, 'chart')`、`paths.picker('multi')`）；導覽用 `navigate(path, {replace?})`、`goBack()`、`useRoute()`；支援 `:param` 與結尾 `/*`（巢狀）。分頁切換用 replace，所以返回鍵不會在分頁間來回。

## 契約

- **Repos 注入**：`<ReposProvider repos>` / `useRepos()`。啟動時 `<Boot>`（`Boot.tsx`，載入中 Skeleton／失敗可重試）呼叫 `bootstrap()`（`bootstrap.ts`），用 `createRepos()`（`createRepos.ts`）建立實作：**正式環境預設 Dexie**，`?fake=1`／`?db=memory`（或 `VITE_DB=memory`）用記憶體版，測試環境（vitest）預設記憶體版。Dexie 模式啟動時以 `EXERCISE_SEED_VERSION`（`bootstrap.ts`，動作庫 JSON 變動時加 1）灌入動作庫，並以 `<BackupServiceProvider>` 注入備份服務。
- **首次啟動**：`App` 內的 `FirstRunGate` 掛載時檢查 `repos.profile.get()`，沒有就 `navigate(paths.onboarding, {replace:true})`；問卷完成導向今日（問卷頁沒有底部分頁列）。
- **標頭去重**：動作詳情／動作選擇元件自帶「返回＋標題」標頭。放進路由時外殼標頭保留返回與標題，`.route-embed` 內的元件標頭由 `app.css` 隱藏（動作名稱改由路由包裝層以 h2 顯示）；放進 `<Sheet>` 時由 `.nuo-sheet__body` 規則隱藏，只留 Sheet 的 X。新增嵌入元件請沿用這兩個容器。
- **AppState**：`useAppState()` → `mode`／`setMode`（相容保留，外殼 UI 已不使用 gear/travel；標頭只在 `selectedDate` ≠ 今天時顯示「補記」標籤與補記色）、`activePlanId`、`setActivePlanId`（會寫入 repo）、`selectedDate`、`setSelectedDate`、`today`、`dataVersion`、`invalidate()`。離開補記模式會把 `selectedDate` 重設為今天。
- **資料 hooks**：`useRepoQuery((repos) => repos.sessions.getByDate(d), [d])` → `{ data, error, loading, reload }`；`useAsync(fn, deps)` 同形。寫入資料後呼叫 `invalidate()`，所有 `useRepoQuery` 自動重查。重新載入時保留舊 `data`（不閃爍）。
- **返回鍵**：面板／彈窗用 `useBackHandler(onClose, open)`（`Sheet`／`Modal` 已內建）。返回時先關「最上層」，沒有就返回上一頁，根畫面則呼叫 `<App onExit>`。導覽與回收的協調：標記條目回收時若 hash 已變（剛 `navigate` 離開），就不再 `history.go(-n)`（以免蓋掉新路由），遺留的標記在使用者按返回時自動跳過。目前由 `popstate` 與自訂事件 `nuo:back`（`dispatchBackEvent()`）模擬；原生環境由 `native.ts` 的 `setupNative()` 把 backButton 轉成 `dispatchBackEvent()`；根畫面（五分頁與首次問卷）按返回呼叫 `<App onExit>`，`main.tsx` 傳入 `native.exitApp`（原生呼叫 `App.exitApp()`，網頁 no-op）。首次問卷不顯示標頭返回鈕。
- **跨功能元件簽名**（stub 在 `src/features/**`，只可填實作、不可改簽名）：`ExercisePickerProps`、`ExerciseDetailProps`、`CelebrationProps`（`kinds` 型別 = `PrKind`，`src/domain/pr.ts`）。

## 如何新增畫面

1. 在 `src/features/<name>/` 建元件（只用上述依賴）。
2. 在 `routes.tsx` 的 `ROUTES` 加一筆 `{ pattern, title, tab?, render }`（有 `tab` 才會顯示底部分頁並視為根畫面）。
3. 若需要被其他畫面導覽，在 `paths.ts` 加建構器。
4. 測試用 `src/test/helpers.tsx` 的 `renderWithApp(ui, repos?)`；資料用 `seedFakeData`。

## 用假資料開發

`npm run dev` 後開 `http://localhost:5173/?fake=1`：啟動時灌入真實動作庫＋約 8 週訓練、3 個課表、器材版／出差版週計畫、8 筆體重、profile、今天與昨天的飲食（`src/dev/fakeData.ts`，固定亂數種子；訓練只到昨天，所以「今天」可直接測開始訓練）。不帶 `fake` 則是 Dexie 版（空白狀態、首次會進問卷）。`?fake=1` 強制記憶體版，不會污染 Dexie。測試中：`await seedFakeData(repos, { today: '2026-10-16' })`、`seedEmptyData(repos)`。

## 樣式

`theme.css`（色票變數、字型）→ `components/ui.css`（共用元件）→ `app/app.css`（外殼）。按鈕底色用 `*-600` 深階色；所有可點元素 ≥ 44px；z-index 用 `--z-*` 變數。`components/ui.css.test.ts` 會檢查這些規則。

## 轉場與載入

- 路由內容包在 `.route-view`（key = pathname）：分頁 `--fade` 淡入、子頁 `--slide` 滑入，只動 opacity／transform，`prefers-reduced-motion` 下關閉。標頭與底部分頁列在 `.route-view` 之外，切換時不重繪。
- `Skeleton` 預設延遲 150ms 才顯示（`delay` 屬性可改，0 = 立即）；共用的 `Delayed`／`useDelayedFlag`（`components/useDelayed.tsx`）可用在其他載入中 UI。`useRepoQuery`／`useAsync` 重載保留舊 data。

## 對話框焦點

`Sheet`／`Modal` 開啟時：有文字輸入框（排除 hidden／disabled／checkbox／radio／date）就聚焦第一個（手機會彈出鍵盤）；否則第一個可聚焦元素。輸入框加 `data-autofocus="false"` 可退出（例如動作選擇的搜尋框，避免一開就遮住清單）。
