# 手機肉眼可玩性驗收

v0.7.0 的驗收目標是讓玩家先看見並理解車廂，再用拇指完成切換與操作。測試不是直接呼叫遊戲服務，而是讓 Playwright 在真正的 Chromium 手機視窗中，依玩家可見按鈕與水平手勢完成整局流程。

## 視覺規則

- 預設整備畫面不得出現覆蓋車廂的大型功能面板。
- 配電、配餐與佈置由玩家明確打開；再次點同一個底部按鈕即可收起。
- 安撫、百葉、維修、回收與熱食直接標在對應車廂設備旁，顯示名稱、成本與停用狀態。
- 溫室作物直接出現在兩個水培槽；右側窄軌只負責選種，點水培槽即可播種、灌溉或收成。
- 可點目標至少 48px 高，中心點不得被透明層、提示或其他面板攔截。
- 常駐提示縮成底部單行訊息；工具抽屜開啟時隱藏提示，避免重疊。
- 整備階段右上角必須是可讀 AP 儀表，不得留下看似可按、實際停用的暫停鍵；夜間才顯示真正可操作的暫停鍵。
- 390×844 與 360×640 都能在車廂主畫面左右滑動；第一次顯示導引，成功滑動後收起。
- 操作後必須顯示資源增減票籤，讓 AP、食水、零件、健康或壓力變化能被肉眼立即辨認。

## 2026-07-24 實測結果

| 視窗 | 不被面板切斷的場景高度 | 底部指令列 | 最小可點區 | 水平溢位 |
|---|---:|---:|---:|---:|
| 390×844 | 534px | 70px | 54×48px | 0px |
| 360×640 | 337px | 70px | 54×48px | 0px |

自動流程實際走過 49 種玩家操作、五節車廂、左右滑動、抽屜開關、播種至收成、佈置拖曳、夜間反制、破口維修、存檔重載與局外預覽，共通過 406 項斷言。整備畫面不存在假暫停鍵，第一次滑動提示會在成功操作後消失，播種後可直接看見 `AP -1` 與 `水 -1`；瀏覽器沒有頁面或 console 錯誤。

## 可直接檢查的證據

- `public/assets/screenshots/02-carriage-prep.png`：390×844 預設觀察模式。
- `public/assets/screenshots/20-compact-observation.png`：360×640 小螢幕模式。
- `public/assets/screenshots/21-collapsible-power.png`：玩家明確打開配電工具後的畫面。
- `public/assets/screenshots/22-swipe-guidance.png`：第一次進入時的滑動提示與 AP 儀表。
- `public/assets/screenshots/23-action-feedback.png`：播種後同步可見的場景變化、AP 與用水票籤。
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
