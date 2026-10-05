# v2.3.1 首頁／結算頁動畫邊界獨立覆核

日期：2026-10-05
角色：獨立覆核者（未參與本輪實作、未發布）
結論：**PASS，未發現阻斷發布的 correctness 問題。**

## 覆核範圍

- `SceneRenderer.render()` 的 render-time state snapshot。
- `menu`／`result` 固定背景的 renderer 與 asset-priority 契約。
- 離開車廂時 swipe、shift class、timer 與 pointer capture 的清理。
- `nightPaused`、`activeCarriageId`、`screen` 在非同步保存期間的可見性。
- 新增單元測試與 Chromium／WebKit 實際 UI 稽核報告。

## 判定依據

### 1. Render commit 邊界

`SceneRenderer.render()` 現在以 `{ ...state }` 保存新的頂層物件。這使 `screen`、`activeCarriageId`、`nightPaused` 等頂層值固定在最近一次 `NightTrainApp.render()` 的提交點。`App.handleAction()` 在 `await persist()` 期間繼續修改原本的 `AppState` 時，背景的 `requestAnimationFrame` 不會再透過同一個頂層參照提前讀到下一個 screen 或 carriage。

這項修正的責任邊界合理：

- `NightTrainApp` 保有 canonical mutable state 與保存交易的所有權。
- `GameView.render()` 提交 DOM。
- `SceneRenderer.render()` 同步接收同一提交點的視圖選擇值，之後的 animation frame 只重畫該次已提交場景。

Shallow snapshot 並非完整 immutable snapshot；`run`、`settings` 等巢狀物件仍共用參照。這表示它只保證本次問題所需的頂層視圖選擇邊界，不保證所有巢狀遊戲資料在非同步保存期間完全隔離。現行呼叫流程中，pause action 會在同一同步 action 結尾呼叫 `render()`；night timer 也在每次 tick 結尾呼叫 `render()`，因此 `nightPaused` 的動畫時間補償仍使用最近一次提交的值。這個限制未構成本輪首頁／結算頁固定畫面問題的阻斷項。

### 2. 固定畫面不再進入動態場景管線

Renderer 在清空 Canvas 後，對 `menu` 與 `result` 都只繪製完整的 `menu-hero`，隨即 return。`sceneAssetPriority()` 對相同兩個 screen 也只回傳 `menu-hero`。因此固定畫面不會再選取 A-07 pose、threat atlas、carriage animation 或保存檔中的 active contact。

CSS 同時把這兩個 screen 的 Canvas animation、transform、filter 與 opacity 固定；`GameView` 在離開 carriage 時另會：

- 釋放仍存在的 pointer capture；
- 清除 swipe 產生的 inline transform／opacity；
- 取消 carriage shift timer；
- 移除兩個 carriage shift class；
- 重置前一個 carriage id。

JS lifecycle 清理是主防線，CSS 是固定畫面的第二層邊界；兩者職責沒有衝突。

## 驗證結果

- `npm test -- --run tests/r7-static-screen.test.ts`：**5/5 PASS**。
- `git diff --check`：**PASS**。
- 讀回 `chromium-fixed-qa.json`：**PASS，17 checks，0 failures，0 page errors，0 unexpected draws**。
- 讀回 `webkit-fixed-qa.json`：**PASS，17 checks，0 failures，0 page errors，0 unexpected draws**。
- 兩個瀏覽器報告各含 6 組實際 UI 樣本；覆蓋 partial swipe 後離開、快速切車廂後返回、實際夜晚進入 Day 1 result，以及 320px／1366px 視口。時間樣本為 0、16、50、100、320、800、1600ms，固定畫面 hash 一致且 Canvas rect 全程位於 frame 內。
- 新單元測試直接覆蓋 render 後修改原始 `AppState.screen`／`activeCarriageId` 不會滲入 renderer，以及 0–5000ms 多個 draw time 都不會呼叫 A-07 動態繪製。

## 非阻斷限制

- Shallow snapshot 不隔離 `run` 內部欄位；若未來要求「保存完成前連資源、威脅、overlay 等巢狀資料也完全不可變」，應另建立明確的 renderer view model 或針對必要巢狀欄位建立 snapshot，不能把目前的 spread 視為深拷貝。
- 本覆核沒有重新執行完整 build、完整測試、效能閘門或發布；這些由主線最終驗證負責。
