# 夜行列車：守夜協定

一款固定 9:16 的手機瀏覽器生存管理遊戲。玩家不是持槍角色，而是夜行列車的守護 AI：管理車廂電力、選擇路線、處理事件，並在乘客熟睡時阻止感染者突破車窗與車頂。

![夜間守望：中風險路線第二波接觸](public/assets/screenshots/24-route-risk-waves.png)

## 目前可玩內容

- 主選單可直接選擇 R01「灰霧線」或 R02「白霜線」，兩條路線都有完整七夜旅程：整備 → 路線 → 行車事件 → 夜襲 → 黎明結算 → 結局。
- v0.9「灰霧線」以 EV041–EV052 串成固定七日主線；Day 4 的 GO／DETOUR／STOP 會永久改變貨運用途、真實路線資料取得方式與 Day 7 第三波威脅。
- v1.0「白霜線」以 EV053–EV065 串成另一條七日主線；Day 4 的 CARE／CLEAR／SUSTAIN 會分別永久改變臥室（sleep）保溫、武器物資（defense）除冰與溫室（greenhouse）循環設備，不是只換結局文字。
- 白霜線的熱力板有六枚可見單元，可在 BERTH／DEICER／LOOP 三區選取、移動、重設與提交；配置、版本與已提交結算都會存檔，重載後可繼續操作。
- T009 暴風雪必須先檢查霜區；第一次錯配只揭示兩個必要霜區，不扣資源或健康，玩家可依線索重新分熱確認，或選擇承受代價的手動刮冰。
- 白霜車廂與 T009 暴風雪分別使用 `carriage-frostline-gpt-v1.png`、`threat-blizzard-gpt-v1.png` 兩張 GPT 原創 9:16 圖；兩張都由 Canvas runtime 真正載入，熱力單元、霜區與互動標記則由遊戲狀態即時繪製。
- 灰霧線的 Day 7 不再直接跳結局：玩家必須完成終點呼叫、固定三波接觸、身分查驗、四項終局決定與最後一句，結果畫面會列出成立原因、Day 4 分支及最後操作。
- T004 霧噬藤不再是一鍵按鈕：玩家要把割具拖到受感染的種植槽，手機也可用「先拿割具、再點槽」；T005 以兩張色／形／三拍訊號卡比對，首錯只揭示線索、第二錯才扣健康；T006 完全移除敲窗音訊提示，改讀左右葉片與電表錶針。成熟作物仍會在 Day 7 提供可消耗的車體傷害緩衝。
- T004–T006 各自使用一張 GPT 製作、由 Canvas 真正載入的 9:16 威脅場景；互動熱區與背景構圖對齊，不是把素材放進資料夾卻不顯示。
- 整備階段有 3–5 AP：播種、收成、安撫、維修、工坊回收、烹飪與建造會實際消耗對應資源／行動點；睡眠品質決定隔日 AP。
- 五節可切換且畫面、配置、操作都不同的車廂：只有臥室保留床鋪；武器物資是裝甲監控站、工坊情報是雙側維修台、溫室是水耕農場、廚房儲藏是固定式列車餐廚。四張專用 GPT v2 底圖不是在同一張臥室上換小道具。
- 整備畫面採「先看車廂、再叫工具」：預設不再用大選單壓住場景，配電／配餐／佈置都是可收合抽屜；五節車廂功能改成場景內有文字、成本與狀態的操作牌。
- 手機可直接左右滑動切換車廂；第一次進入會顯示滑動提示，使用後自動收起。切換有方向過場與支援裝置的短震動，原本像失效按鈕的整備暫停位改為可讀 AP 儀表。
- 每次播種、烹飪、維修、安撫、回收等操作都會在底部即時顯示最多三項資源增減票籤，例如 `AP -1`、`水 -1`，不用從數字欄自行猜測結果。
- 溫室有兩個可見水培槽與 GPT 製作的葉萵苣、矮株番茄、香草四階段圖；播種 → 每日灌溉 → 連續兩個供電夜成長 → 成熟收成是正式玩法，不是裝飾圖。
- 配電會在入夜時實際扣除電量並依 P3 → P1 自動斷載；停用設備會同步改變可用反制。
- 安心／標準／節約三種配餐會在黎明影響食水、睡眠、壓力與信任；物資不足會造成健康損失。
- 夜間暫停鍵直接顯示「暫停／繼續」，而不是難辨識的倍速符號；路線威脅等級會真的形成 1／2／3 波連續接觸，每波顯示目前進度，只有最後一波解除後才進入黎明。威脅逐夜加速、破口傷害逐夜提高，健康或車體歸零會進入可重玩的失敗結局。
- 車廂佈置模式提供 4 件 GPT 製作的透明小物：黃銅燈、短波機、工具箱與蕨盆栽；五節車廂共 15 個具語意的掛鉤、牆面、檯面、窗台、層架與地面槽位，綠色可放、紅色不相容、占用中不可覆蓋，支援點放、滑鼠／手指拖曳吸附、重設、存檔與重載復原。
- 8 個核心畫面與 A/B 狀態：主選單、局外中心、車廂、路線、事件、模組、科技、結算。
- 8 個一般事件、2 條七夜故事線、EV041–EV065 共 25 個故事事件、每日 3 個行車節點、12 個模組、8 個科技節點、6 種夜間威脅。
- IndexedDB current／backup 雙存檔，localStorage 降級，PWA 離線快取。
- 文字 100／120／140%、減少動態、無倒數、0.75× 守夜與音效開關。
- 原創車廂、A-07 與威脅圖層均由 runtime 實際載入，不使用攤平的 UI 截圖當遊戲畫面。
- 動態場景不是裝飾影片：Canvas 即時繪製車身搖晃、窗外雨霧與鐵軌流動、燈火、乘客呼吸；威脅依 Approach／Warning／Attack／Breach 分階段靠近與撞擊。
- 畫面進場依 03A／03B／05A／05B／08B 稿的資訊層級編排；只在真正換頁時播放，倒數重繪不會反覆觸發。

## 遊玩影片與畫面

### v1.0 白霜線

以下 3 支 WebM 分別由 CARE／CLEAR／SUSTAIN 的 390×844 七夜瀏覽器通關流程錄製：

- [CARE 七夜遊玩影片（WebM）](public/assets/video/night-train-frost-v100-care.webm)
- [CLEAR 七夜遊玩影片（WebM）](public/assets/video/night-train-frost-v100-clear.webm)
- [SUSTAIN 七夜遊玩影片（WebM）](public/assets/video/night-train-frost-v100-sustain.webm)

| R02 主選單路線卡 | 360×640／140% 熱力板 |
|---|---|
| ![R02 白霜線路線卡](public/assets/screenshots/frost-route-selection-v100.png) | ![白霜線熱力板](public/assets/screenshots/frost-thermal-drawer-360x640-text140-v100.png) |

| 六枚單元實際拖放 | EV057 三項永久分支 |
|---|---|
| ![熱力單元拖放](public/assets/screenshots/frost-thermal-pointer-drag-v100.png) | ![EV057 CARE CLEAR SUSTAIN](public/assets/screenshots/frost-ev057-three-branches-v100.png) |

| CARE：臥室保溫 | CLEAR：武器物資除冰 | SUSTAIN：溫室循環 |
|---|---|---|
| ![CARE 臥室車廂](public/assets/screenshots/frost-care-carriage-v100.png) | ![CLEAR 武器物資車廂](public/assets/screenshots/frost-clear-carriage-v100.png) | ![SUSTAIN 溫室車廂](public/assets/screenshots/frost-sustain-carriage-v100.png) |

| CARE T009 首錯揭示 | CLEAR T009 首錯揭示 | SUSTAIN T009 首錯揭示 |
|---|---|---|
| ![CARE T009](public/assets/screenshots/frost-care-t009-first-miss-v100.png) | ![CLEAR T009](public/assets/screenshots/frost-clear-t009-first-miss-v100.png) | ![SUSTAIN T009](public/assets/screenshots/frost-sustain-t009-first-miss-v100.png) |

| CARE：共享熱源抵達 | CLEAR：守護式抵達 |
|---|---|
| ![CARE 結局](public/assets/screenshots/frost-care-ending-v100.png) | ![CLEAR 結局](public/assets/screenshots/frost-clear-ending-v100.png) |

| SUSTAIN：共同選擇改道 | 保底：雪崩避難 |
|---|---|
| ![SUSTAIN 結局](public/assets/screenshots/frost-sustain-ending-v100.png) | ![雪崩避難結局](public/assets/screenshots/frost-emergency-shelter-ending-v100.png) |

v1.0 公開驗收共保留 22 張 PNG 與上述 3 支 WebM；三分支七夜、T009 首錯揭示／重試／手動刮冰、熱力提交與重載證據見 [白霜線 QA JSON](public/assets/qa/frost-story-flow-report.json)。

### v0.9 灰霧線與共用畫面

- [v0.9 七日故事實機遊玩影片（WebM）](public/assets/video/night-train-story-v090.webm)
- [v0.9 DETOUR／T004 割具拖放七日影片（WebM）](public/assets/video/night-train-story-v090-detour.webm)
- [v0.9 STOP／T005 訊號比對七日影片（WebM）](public/assets/video/night-train-story-v090-stop.webm)
- [直式遊玩影片（WebM，包含行車與威脅動態）](public/assets/video/night-train-gameplay.webm)
- [主選單](public/assets/screenshots/01-main-menu.png)
- [車廂整備](public/assets/screenshots/02-carriage-prep.png)
- [路線地圖](public/assets/screenshots/03-route-map.png)
- [EV004 廢棄水塔](public/assets/screenshots/04-event-water-tower.png)
- [T002 敲窗者接觸](public/assets/screenshots/08-night-knocker.png)
- [黎明結算](public/assets/screenshots/06-dawn-result.png)
- [七夜結局](public/assets/screenshots/07-ending.png)

以下三張是 v0.3.1 全按鈕實機稽核直接截取的 390×844 遊戲畫面，已隨開源專案提交，不是另外製作的概念稿：

| 破口後維修 | 局外路線預覽 | 起始藍圖預覽 |
|---|---|---|
| ![破口後維修](public/assets/screenshots/09-repaired-carriage.png) | ![局外路線預覽](public/assets/screenshots/10-route-preview.png) | ![起始藍圖預覽](public/assets/screenshots/11-module-preview.png) |

| 小物拖曳配置 | 完成後正常遊玩 |
|---|---|
| ![小物拖曳配置](public/assets/screenshots/12-decor-placement.png) | ![完成後正常遊玩](public/assets/screenshots/13-decor-in-play.png) |

以下為 v0.8.0 從同一個可玩版本直接截取的五車廂與農業／槽位畫面；不是獨立概念圖：

| 臥室車廂 | 武器物資車廂 | 工坊情報車廂 |
|---|---|---|
| ![臥室車廂](public/assets/screenshots/14-sleep-carriage.png) | ![武器物資車廂](public/assets/screenshots/15-defense-carriage.png) | ![工坊情報車廂](public/assets/screenshots/16-workshop-carriage.png) |

| 溫室成熟番茄 | 廚房儲藏車廂 | 相容槽位配置 |
|---|---|---|
| ![溫室成熟番茄](public/assets/screenshots/17-greenhouse-farming.png) | ![廚房儲藏車廂](public/assets/screenshots/18-kitchen-carriage.png) | ![相容槽位配置](public/assets/screenshots/19-slot-placement.png) |

| 360×640 小螢幕觀察模式 | 主動畫面保留的可收合配電工具 |
|---|---|
| ![360×640 小螢幕觀察模式](public/assets/screenshots/20-compact-observation.png) | ![可收合配電工具](public/assets/screenshots/21-collapsible-power.png) |

| 第一次滑動導引與 AP 儀表 | 播種後可見的資源增減 |
|---|---|
| ![第一次滑動導引與 AP 儀表](public/assets/screenshots/22-swipe-guidance.png) | ![播種後可見的資源增減](public/assets/screenshots/23-action-feedback.png) |

| 中風險路線第 2／2 波 |
|---|
| ![中風險路線第 2／2 波](public/assets/screenshots/24-route-risk-waves.png) |

以下三張由 v0.9 自動故事通關稽核在同一個 390×844 Chromium 遊戲流程直接截取：

| Day 4 三項永久分支 | Day 7 四項終局操作 | 唯一結局與成立原因 |
|---|---|---|
| ![Day 4 三項永久分支](public/assets/screenshots/25-story-day4-branches.png) | ![Day 7 四項終局操作](public/assets/screenshots/26-story-day7-decisions.png) | ![唯一結局與成立原因](public/assets/screenshots/27-story-ending.png) |

以下三張是 2026-07-26 三分支七日稽核在 Day 7 第三波「操作前」直接截取，背景、倒數、玩家狀態與可點面板都來自同一個 runtime：

| T004 霧噬藤：拖割具到槽位 | T005 回聲乘客：色形節拍比對 | T006 靜默群：葉片／電表判位 |
|---|---|---|
| ![T004 霧噬藤割具拖放](public/assets/screenshots/28-story-t004-fog-vine.png) | ![T005 回聲乘客訊號比對](public/assets/screenshots/29-story-t005-echo-passenger.png) | ![T006 靜默群無聲判位](public/assets/screenshots/30-story-t006-silent-crowd.png) |

目前的真人視角自動驗收不是只檢查函式：Playwright 真的在 390×844 與 360×640 瀏覽器中以可見中心座標點擊、滑動與拖放，並檢查中心沒有被透明層或面板攔截。全按鈕流程涵蓋 56 種操作與 591 項斷言；R01 的 GO／DETOUR／STOP 完整矩陣各完成七夜與 Day 7 三波，R02 的 CARE／CLEAR／SUSTAIN 也各完成七夜、熱力配置、T009 與不同結局。v1.0 白霜線的公開證據為 22 張 PNG、3 支 WebM 與 QA JSON。這些是桌面 Chromium 自動驗收證據，不代表 iOS Safari／Android Chrome 人工實機已通過。詳見 [手機肉眼可玩性驗收](docs/MOBILE_VISUAL_QA.md)、[全按鈕 JSON 報告](public/assets/qa/mobile-playability-report.json)、[R01 七夜故事 JSON 報告](public/assets/qa/story-flow-report.json) 與 [R02 白霜線 JSON 報告](public/assets/qa/frost-story-flow-report.json)。

## 本機執行

需要 Node.js 20 或更新版本。

```bash
npm ci
npm run dev
```

開啟 `http://localhost:5173`。完整驗證：

```bash
npm run check
```

重新錄製手機遊玩影片（需先啟動 dev server）：

```bash
npm run capture:video
```

手機可玩性驗收（配電、配餐、播種、夜間成長、暫停與黎明結算）：

```bash
npm run capture:playability
```

全操作手機瀏覽器稽核（56 種操作、591 項斷言、390×844／360×640 肉眼版面、可見中心實際點擊、左右滑動、五車廂、種植／收成、熱力配置、場景威脅、零燃料承受撞擊與緊急路線）：

```bash
npm run audit:buttons
```

七日故事實機通關稽核（預設依序跑 GO／DETOUR／STOP；包含 Day 7 三波、T004 真拖放、T005 訊號卡、T006 無聲判位、360×640／140% 終局、存檔、截圖與分支錄影）：

```bash
npm run audit:story
```

R02 白霜線七夜實機通關稽核（預設依序跑 CARE／CLEAR／SUSTAIN；包含六枚熱力單元、EV057 永久車廂差異、T009 首錯揭示／重試／手動刮冰、360×640／140%、存檔重載、22 張 PNG 與 3 支分支錄影）：

```bash
npm run audit:frost
```

## 發布狀態

- v1.0 的發布方式固定為 stacked Draft，base 為 `codex/story-expansion-v090`；建立 PR 時描述必須保留 `Depends on #5`，避免在灰霧線 Draft PR #5 尚未合併前錯誤改以 `main` 為基底。
- 自動化 PASS、截圖與 WebM 都不是人工裝置核可。iOS Safari 與 Android Chrome 都完成手動遊玩並明確批准前，不得把 v1.0 Draft 改為 Ready for review，也不得部署。

## 技術結構

- TypeScript + Vite。
- DOM/CSS 負責可及性與精準 UI；Canvas 負責 720×1280 分層場景。
- `RunService` 是資源、事件、威脅、睡眠與 Ledger 的唯一權威寫入層。
- 固定 seed 的獨立 RNG stream 讓事件與威脅可重播。
- WebAudio 僅在首次互動後啟用；成品不含任何 OpenAI 或 xAI 金鑰。

詳細規格見 [瀏覽器改編規格](spec/spec-design-mobile-browser-adaptation.md)、[R02 白霜線規格](spec/spec-design-white-frost-story-v1-0.md)、[垂直切片實作計畫](plan/feature-night-train-vertical-slice-1.md) 與 [R02 白霜線施工計畫](plan/feature-night-train-white-frost-v1-0.md)。資產來源與產圖提示見 [ASSET_MANIFEST](docs/ASSET_MANIFEST.md)。

## 開源授權

- 程式碼與文件：GNU AGPL-3.0-or-later。
- `public/assets/art/` 原創圖像：CC BY 4.0，署名「夜行列車：守夜協定 contributors」。
- 原始 GDD、ZIP 與 16 張參考視覺稿不包含在公開儲存庫中。

參與開發前請閱讀 [CONTRIBUTING.md](CONTRIBUTING.md) 與 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
