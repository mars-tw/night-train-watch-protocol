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
npm run audit:frost
```

## 2026-07-26 灰霧線三分支專項

`npm run audit:story` 現在預設依序完成 GO、DETOUR、STOP 三局七日流程。Day 7 第三波分別強制為 T006、T004、T005，且舊式 `.emergency-actions` 不再被視為合格：

- T004 由 Playwright 把 `[data-threat-tool="cutter"]` 真實拖到權威狀態指定的 `plot-a` 或 `plot-b`。
- T005 點選權威狀態指定的色／形／節拍訊號卡；單元測試另驗證第一次誤判零傷害、第二次誤判健康 −2。
- T006 只使用葉片或電表視覺線索；遊戲控制器不播放該威脅的 tap、warning 或 safe 音效。
- 三條分支都在 360×640、140% 文字下檢查 EV051、EV052、結局主要按鈕的尺寸、中心命中、面板寬度與水平溢位，結果皆為 0px 溢位。

公開證據為 `public/assets/screenshots/28-story-t004-fog-vine.png` 至 `30-story-t006-silent-crowd.png`、三支 `public/assets/video/night-train-story-v090*.webm`，以及 `public/assets/qa/story-flow-report.json`。

## 2026-07-28 白霜線驗收

白霜線 R02 已在真實 Chromium 手機視窗完成 CARE、CLEAR、SUSTAIN 三條分支，各自走完 Day 1 至 Day 7。完整稽核報告為 `status: passed`，來源 commit 為 `4d3757dce3d99d8f3512250b476f630b4dd9c07e`，且啟動稽核時 `workingTreeDirty: false`。同版全按鈕稽核覆蓋 56 個 controller actions、591 項斷言；瀏覽器 page error 與 console error 合計為 0。

### 肉眼與操作驗收

- R02 route card 在 390×844 視窗中完整可見，主要按鈕中心命中測試通過。
- thermal drawer 在 390×844 與 360×640、140% 文字模式下不遮住主要場景或警報；水平溢位為 0，主要控制項中心皆可命中。
- 六枚熱能 token 維持唯一身分與唯一配置；配置同時通過可見按鈕 tap 與真實 pointer drag，拖曳結果會寫回權威存檔。
- EV057 由可見選項進入 CARE、CLEAR、SUSTAIN 三條分支，並在 route node 選擇前保存、重載後維持同一分支。
- T009 覆蓋錯誤檢查、弱點 reveal、立即 reload 與 retry；CARE、SUSTAIN 以 reveal 後重試完成，CLEAR 另以 manual scrape 完成。Day 7 再次以熱能配置解決 T009。
- 三條分支都驗證 EV057、T009 first miss 與 ending 三個 reload checkpoint；結局重載前後完成獎勵都只有一筆。
- 無燃料時的 emergency route 由畫面上可見按鈕中心點擊完成，並在 360×640、140% 與 390×844 兩種視窗確認不重疊、可命中。
- 四個結局均由可見選項完成：CARE `frost-shared-arrival`、CLEAR `frost-guarded-arrival`、SUSTAIN `frost-chosen-detour`，以及 CARE 的替代抉擇 `frost-emergency-shelter`。第 4 結局使用 Day 7 EV065 選擇前的自然存檔 checkpoint，在 fresh 390×844 context 從主選單繼續；選擇前不改寫權威數值，結局與獎勵唯一性在 reload 後仍成立。

### 公開確證

- `public/assets/qa/frost-story-flow-report.json`：三分支完整報告、reload checkpoint、緊急路線、第 4 結局、畫面量測與 browser errors。
- `public/assets/video/night-train-frost-v100-care.webm`：390×844，184.24 秒。
- `public/assets/video/night-train-frost-v100-clear.webm`：390×844，148.04 秒。
- `public/assets/video/night-train-frost-v100-sustain.webm`：390×844，124.36 秒。
- 全部 22 張公開 PNG 均存在且通過 PNG 格式檢查；主要畫面包括：
  - `public/assets/screenshots/frost-route-selection-v100.png`
  - `public/assets/screenshots/frost-thermal-drawer-360x640-text140-v100.png`
  - `public/assets/screenshots/frost-thermal-pointer-drag-v100.png`
  - `public/assets/screenshots/frost-ev057-three-branches-v100.png`
  - `public/assets/screenshots/frost-t009-first-miss-360x640-text140-v100.png`
  - `public/assets/screenshots/frost-emergency-route-360x640-v100.png`
  - `public/assets/screenshots/frost-care-ending-v100.png`
  - `public/assets/screenshots/frost-clear-ending-v100.png`
  - `public/assets/screenshots/frost-sustain-ending-v100.png`
  - `public/assets/screenshots/frost-emergency-shelter-ending-v100.png`

以上為桌面 Chromium 的手機 viewport 自動驗收；iOS Safari 與 Android Chrome 實機人工 QA 尚未完成，因此相關 PR 必須保持 Draft，不得以本報告宣稱已通過實機發布門檻。
