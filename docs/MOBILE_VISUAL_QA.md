# 手機肉眼可玩性驗收

v0.6.0 的驗收目標是讓玩家先看見並理解車廂，再決定要打開哪一項管理工具。測試不是直接呼叫遊戲服務，而是讓 Playwright 在真正的 Chromium 手機視窗中，依玩家可見按鈕完成整局流程。

## 視覺規則

- 預設整備畫面不得出現覆蓋車廂的大型功能面板。
- 配電、配餐與佈置由玩家明確打開；再次點同一個底部按鈕即可收起。
- 安撫、百葉、維修、回收與熱食直接標在對應車廂設備旁，顯示名稱、成本與停用狀態。
- 溫室作物直接出現在兩個水培槽；右側窄軌只負責選種，點水培槽即可播種、灌溉或收成。
- 可點目標至少 48px 高，中心點不得被透明層、提示或其他面板攔截。
- 常駐提示縮成底部單行訊息；工具抽屜開啟時隱藏提示，避免重疊。

## 2026-07-23 實測結果

| 視窗 | 不被面板切斷的場景高度 | 底部指令列 | 最小可點區 | 水平溢位 |
|---|---:|---:|---:|---:|
| 390×844 | 534px | 70px | 54×48px | 0px |
| 360×640 | 332px | 70px | 54×48px | 0px |

開啟配電抽屜後，車廂選擇列與抽屜之間仍保有約 389px 的可視區。自動流程實際走過 48 種玩家操作、五節車廂、抽屜開關、播種至收成、佈置拖曳、夜間反制、破口維修、存檔重載與局外預覽，共通過 392 項斷言，瀏覽器沒有頁面或 console 錯誤。

## 可直接檢查的證據

- `public/assets/screenshots/02-carriage-prep.png`：390×844 預設觀察模式。
- `public/assets/screenshots/20-compact-observation.png`：360×640 小螢幕模式。
- `public/assets/screenshots/21-collapsible-power.png`：玩家明確打開配電工具後的畫面。
- `public/assets/screenshots/14-sleep-carriage.png` 至 `19-slot-placement.png`：五節車廂、場景操作牌、農業與佈置。
- `public/assets/video/night-train-gameplay.webm`：同一版本的真實點擊與動畫錄影。
- `public/assets/qa/mobile-playability-report.json`：隨開源專案提交的完整量測報告；執行 `npm run audit:buttons` 可重建本機來源。

## 重跑

先以 `npm run dev -- --host 127.0.0.1 --port 4312` 啟動遊戲，再執行：

```bash
$env:GAME_URL='http://127.0.0.1:4312'
npm run audit:buttons
npm run capture:playability
npm run capture:video
```
