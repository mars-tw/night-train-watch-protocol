# 手機肉眼可玩性驗收

v0.8.0 的驗收目標是讓玩家先看見並理解每節不同的車廂，再用拇指完成切換、整備與多波守夜。測試不是直接呼叫遊戲服務，而是讓 Playwright 在真正的 Chromium 手機視窗中，依玩家可見按鈕中心與水平手勢完成整局流程。

## 視覺規則

- 預設整備畫面不得出現覆蓋車廂的大型功能面板。
- 配電、配餐與佈置由玩家明確打開；再次點同一個底部按鈕即可收起。
- 安撫、百葉、維修、回收與熱食直接標在對應車廂設備旁，顯示名稱、成本與停用狀態。
- 溫室作物直接出現在兩個水培槽；右側窄軌只負責選種，點水培槽即可播種、灌溉或收成。
- 可點目標至少 48px 高，中心點不得被透明層、提示或其他面板攔截。
- 常駐提示縮成底部單行訊息；工具抽屜開啟時隱藏提示，避免重疊。
- 整備階段右上角必須是可讀 AP 儀表，不得留下看似可按、實際停用的暫停鍵；夜間才顯示真正可操作的暫停鍵。
- 夜間按鈕必須直接顯示「暫停／繼續」，中心命中區不能被資訊標頭攔截；中風險路線必須實際顯示並完成 `1/2`、`2/2` 兩次接觸。
- 除臥室外，防禦、工坊、溫室與廚房均使用無床鋪、無睡眠人物的 GPT v2 專屬場景，不能只在相同臥室背景上更換小道具。
- 390×844 與 360×640 都能在車廂主畫面左右滑動；第一次顯示導引，成功滑動後收起。
- 操作後必須顯示資源增減票籤，讓 AP、食水、零件、健康或壓力變化能被肉眼立即辨認。

## 2026-07-24 實測結果

| 視窗 | 不被面板切斷的場景高度 | 底部指令列 | 最小可點區 | 水平溢位 |
|---|---:|---:|---:|---:|
| 390×844 | 534px | 70px | 60×48px | 0px |
| 360×640 | 338px | 70px | 60×48px | 0px |

自動流程實際走過 49 種玩家操作、五節 GPT 專屬車廂、左右滑動、抽屜開關、播種至收成、佈置拖曳、中風險兩波夜襲、破口維修、存檔重載與局外預覽，共通過 498 項斷言。每次操作都先確認按鈕可見中心沒有被遮擋，再由滑鼠座標模擬玩家按下。整備畫面不存在假暫停鍵，夜間暫停會切換為「繼續」，第一次滑動提示會在成功操作後消失，播種後可直接看見 `AP -1` 與 `水 -1`；瀏覽器沒有頁面或 console 錯誤。

## 可直接檢查的證據

- `public/assets/screenshots/02-carriage-prep.png`：390×844 預設觀察模式。
- `public/assets/screenshots/20-compact-observation.png`：360×640 小螢幕模式。
- `public/assets/screenshots/21-collapsible-power.png`：玩家明確打開配電工具後的畫面。
- `public/assets/screenshots/22-swipe-guidance.png`：第一次進入時的滑動提示與 AP 儀表。
- `public/assets/screenshots/23-action-feedback.png`：播種後同步可見的場景變化、AP 與用水票籤。
- `public/assets/screenshots/24-route-risk-waves.png`：RN02 中風險路線進入第 2／2 波，而不是第一個反制成功就直接結算。
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

## 2026-07-26 灰霧線三分支專項

`npm run audit:story` 現在預設依序完成 GO、DETOUR、STOP 三局七日流程。Day 7 第三波分別強制為 T006、T004、T005，且舊式 `.emergency-actions` 不再被視為合格：

- T004 由 Playwright 把 `[data-threat-tool="cutter"]` 真實拖到權威狀態指定的 `plot-a` 或 `plot-b`。
- T005 點選權威狀態指定的色／形／節拍訊號卡；單元測試另驗證第一次誤判零傷害、第二次誤判健康 −2。
- T006 只使用葉片或電表視覺線索；遊戲控制器不播放該威脅的 tap、warning 或 safe 音效。
- 三條分支都在 360×640、140% 文字下檢查 EV051、EV052、結局主要按鈕的尺寸、中心命中、面板寬度與水平溢位，結果皆為 0px 溢位。

公開證據為 `public/assets/screenshots/28-story-t004-fog-vine.png` 至 `30-story-t006-silent-crowd.png`、三支 `public/assets/video/night-train-story-v090*.webm`，以及 `public/assets/qa/story-flow-report.json`。
