---
goal: 將 R02 白霜線施工為可選、可見、可操作、可存檔及可公開驗收的 v1.0 手機故事線
version: 1.0.0
date_created: 2026-07-28
last_updated: 2026-07-28
owner: Codex
status: 'In progress'
tags: [feature, game, story, mobile, white-frost, open-source]
---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In%20progress-yellow)

本計畫把 [R02 白霜線規格](../spec/spec-design-white-frost-story-v1-0.md) 拆成可平行施工與可驗收任務。分支 `codex/story-expansion-v100` 疊加於 `codex/story-expansion-v090`；新 Draft PR 以 v0.9 分支為 base，避免把 PR #5 重複納入審查。

## 1. Requirements & Constraints

- **REQ-001**: R02 必須是玩家可見選擇的新路線，R01 維持預設與完全相容。
- **REQ-002**: EV053–EV065、CARE／CLEAR／SUSTAIN、thermal board、T009 及 R02 endings 必須為資料驅動。
- **REQ-003**: 六枚熱能單元、選取、移動、提交、T009 進度及終局結算必須可存檔。
- **REQ-004**: 三分支必須改變不同車廂的 runtime 畫面與後續玩法。
- **REQ-005**: GPT 圖只允許核准且 runtime 實際引用的白霜車廂與 T009 圖進入 public。
- **REQ-006**: R01 既有 91 測試、三分支瀏覽器故事、農業、擺設及 T004–T006 不得退化。
- **REQ-007**: R02 CARE／CLEAR／SUSTAIN 各完成真實瀏覽器七夜流程並產出公開證據。
- **SEC-001**: 不得提交 API key、使用者 token、CLI session 或外部服務憑證。
- **CON-001**: UI 不直接修改資源或故事 state；所有 mutation 經服務層。
- **CON-002**: 360×640／140% 與 390×844 的 enabled 控制至少 48×48 且不可被面板遮擋。
- **CON-003**: iOS Safari／Android Chrome 人工 QA 未核准前保持 Draft，不部署或聲稱正式站已同步。
- **GUD-001**: 只生成兩張會進 runtime 的 GPT 核准圖，避免再次累積無用素材。
- **PAT-001**: route catalog、story schedule、finale ID 及 ending presentation 依 routeId 資料化，不新增 R02 專用硬編碼散落點。

## 2. Implementation Steps

### Implementation Phase 1 — Contract and orchestration

- GOAL-001: 鎖定 GDD、資料契約、協作結果及可自動驗收門檻。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Codex 讀取 GDD v1.1、16 張 UI 視覺稿施工規格、v0.9 story/runtime/save/UI/tests，建立 R02 阻點清單。 | ✅ | 2026-07-28 |
| TASK-002 | 實際呼叫 Claude Opus 5 產出故事初稿；Codex 因初稿不符合 GDD 與資料契約而封鎖，只保留紀錄意象。 | ✅ | 2026-07-28 |
| TASK-003 | 實際呼叫 Grok CLI `grok-4.5`；API 回覆 402 餘額耗盡，記錄為未完成，不宣稱 Grok 審查。 | ✅ | 2026-07-28 |
| TASK-004 | Codex 結合本地 runtime、mobile visual、QA 稽核，完成本規格及計畫。 | ✅ | 2026-07-28 |

### Implementation Phase 2 — Route, state, save, and content

- GOAL-002: 建立不破壞 R01 的 R02 權威狀態與資料內容。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-005 | 在 `src/game/types.ts` 新增 StoryRouteId、WhiteFrostState、thermal/T009 commands、R02 endings，並將 RunState schema 設為 4。依賴 TASK-004。 | ✅ | 2026-07-28 |
| TASK-006 | 在 `src/game/story.ts` 新增 whiteFrost defaults、分支套用、thermal helpers、R02 ending resolver；保留所有 R01 exports。依賴 TASK-005。 | ✅ | 2026-07-28 |
| TASK-007 | 在 `src/game/content.ts` 新增 route catalog、EV053–EV065、route-specific schedule、T009、branch metadata；保留 STORY_EVENTS 相容匯出。依賴 TASK-005。 | ✅ | 2026-07-28 |
| TASK-008 | 在 `src/game/model.ts` 讓 `createRun(seed?, routeId?)` 支援 R01／R02，並建立不同初始環境。依賴 TASK-006。 | ✅ | 2026-07-28 |
| TASK-009 | 在 `src/game/save.ts` 實作 schema 1–4 深合併遷移、R02 partial interaction 修復及 R01 無損相容。依賴 TASK-006、TASK-008。 | ✅ | 2026-07-28 |

### Implementation Phase 3 — Authoritative gameplay

- GOAL-003: 讓熱力板、T009、三分支及雪崩終局成為可見且不可繞過的 gameplay。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-010 | 在 `src/game/services.ts` 按 routeId 選排程、事件池及 Day 7 continuation，移除 EV050 單一路線硬編碼。依賴 TASK-007。 | ✅ | 2026-07-28 |
| TASK-011 | 在 RunService 實作 thermal select/move/target/reset/commit、每日唯一 settlement、區域及 branch 修正。依賴 TASK-006、TASK-010。 | ✅ | 2026-07-28 |
| TASK-012 | 在 RunService 實作 T009 deterministic required zones、inspect、first-miss reveal、retry、manual scrape、environment timeout 及 legacy counter denial。依賴 TASK-011。 | ✅ | 2026-07-28 |
| TASK-013 | 實作 EV057 三個車廂轉換、EV058–EV060 operations、EV063–EV065 WARM／CLEAR／ACCELERATE 及 idempotent ending/reward。依賴 TASK-010–TASK-012。 | ✅ | 2026-07-28 |

### Implementation Phase 4 — Mobile UI, renderer, and GPT art

- GOAL-004: 依 16 張稿的場景／工具抽屜層級，提供肉眼可讀、可點、可拖、可關閉的 R02 畫面。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-014 | 在 `src/app.ts` 新增 R02 新局、thermal/T009 controller actions、每次中間操作即時保存；未傳 route value 仍開 R01。依賴 TASK-009、TASK-012。 | ✅ | 2026-07-28 |
| TASK-015 | 在 `src/ui/view.ts` 資料化路線／事件／結局標題，新增 R02 route card、熱力工具抽屜、六枚單元、三霜區、分支場景標記及 fallback。依賴 TASK-014。 | ✅ | 2026-07-28 |
| TASK-016 | 依核准 asset brief 使用 GPT Image 生成白霜車廂與 T009 兩張候選圖；Codex 視覺檢查後只將兩張核准圖移入 `public/assets/art/story/`。依賴 TASK-004。 | ✅ | 2026-07-28 |
| TASK-017 | 在 `src/game/renderer.ts` 實際載入核准圖，繪製白霜天候、分支設備、霜區與 reduced-motion 靜態等價資訊。依賴 TASK-015、TASK-016。 | ✅ | 2026-07-28 |
| TASK-018 | 在 `src/styles/integration.css` 實作 360×640 logical band、48×48、140% 文字、可收合工具、不遮擋警報及一個主 CTA。依賴 TASK-015。 | ✅ | 2026-07-28 |
| TASK-019 | 更新 `docs/ASSET_MANIFEST.md`、ART_SOURCES 及資產測試，確認兩張圖皆由 runtime 引用，沒有未用候選。依賴 TASK-016、TASK-017。 | ✅ | 2026-07-28 |

### Implementation Phase 5 — Tests and real-browser evidence

- GOAL-005: 以單元、整合、全按鈕、三分支真實瀏覽器及公開媒體證明可玩。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-020 | 新增 frost content/story tests：ID、edge、排程、三分支、thermal、T009、R02 endings、R01 regression。依賴 TASK-013。 | ✅ | 2026-07-28 |
| TASK-021 | 擴充 save tests：schema 3 R01、R02 branch reload、T009 first move reload、ending reload、corrupt current→backup。依賴 TASK-009、TASK-012。 | ✅ | 2026-07-28 |
| TASK-022 | 新增 `tools/audit-frost-story.mjs`；audit harness 與完整 CARE／CLEAR／SUSTAIN 七夜矩陣均 PASS，覆蓋 drag/tap、wrong/retry、三 reload checkpoint、390×844 與 360×640／140%。依賴 TASK-018、TASK-021。 | ✅ | 2026-07-28 |
| TASK-023 | 全按鈕報告已擴充至 R01+R02 action/value union，真實命中 56 個 controller actions、591 項斷言，包含 R02 conditional values、中心 hit-test、disabled reason，console/page errors 為 0。依賴 TASK-018。 | ✅ | 2026-07-28 |
| TASK-024 | `npm run check` 的 typecheck、146 tests、build 均 PASS；R01 GO／DETOUR／STOP、R02 CARE／CLEAR／SUSTAIN 與全按鈕 audit 全數 PASS。依賴 TASK-020–TASK-023。 | ✅ | 2026-07-28 |
| TASK-025 | 已產出並放入 `public` 的 22 張白霜 runtime PNG 與 CARE／CLEAR／SUSTAIN 三支完整 WebM；畫面涵蓋 route card、三分支車廂、thermal board、T009、360×640／140% 及四個可見結局（含 `frost-emergency-shelter`）。依賴 TASK-024。 | ✅ | 2026-07-28 |
| TASK-026 | `frost-story-flow-report.json` 精確記錄 `commitSha`、`packageVersion`、`workingTreeDirty`、`baseUrl`、`routeId`、requested branches 與 acceptance；各分支記錄 viewport、action count/log、browser errors、screenshots，以及 WebM output/public/bytes/metadata（durationSeconds、width、height），三片皆可播放且為 390×844、duration>0。依賴 TASK-025。 | ✅ | 2026-07-28 |

### Implementation Phase 6 — Open-source publication

- GOAL-006: 讓原始碼、預覽圖、影片、QA 與 Draft PR 同步且可稽核。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-027 | 已更新 v1.0 版本、開源執行／驗收說明、R02 runtime 畫面／影片／QA 連結及 stacked dependency 說明。依賴 TASK-026。 | ✅ | 2026-07-28 |
| TASK-028 | Codex 已完成最終 local diff、授權、無密鑰、runtime 資產、測試與媒體審查；實作、修正與公開證據均已建立乾淨 commit 並推送至 `origin/codex/story-expansion-v100`。依賴 TASK-027。 | ✅ | 2026-07-28 |
| TASK-029 | 已建立 [Draft PR #6](https://github.com/mars-tw/night-train-watch-protocol/pull/6)，base=`codex/story-expansion-v090`、head=`codex/story-expansion-v100`，並標示 Depends on #5 / do not merge first；GitHub Actions `verify` 已通過。依賴 TASK-028。 | ✅ | 2026-07-28 |
| TASK-030 | iOS Safari／Android Chrome 人工完成 R02 關鍵流程後才能轉 Ready；#5 合併後 rebase/retarget main 並重跑全部證據。依賴 TASK-029。 |  |  |

## 2.1 Evidence gates

總狀態維持 **In progress**：自動化、本機 Chromium、final commit/push、公開 Draft PR 與 GitHub Actions 證據已通過；iOS Safari／Android Chrome 實機人工驗收仍未完成，因此 PR 保持 Draft。

| Gate | Evidence | Status |
|---|---|---|
| Typecheck／tests／build | `npm run check`：typecheck PASS、146 tests PASS、build PASS。 | ✅ PASS |
| 全按鈕可玩性 | [`mobile-playability-report.json`](../public/assets/qa/mobile-playability-report.json)：56 controller actions、591 assertions、browser errors 0。 | ✅ PASS |
| R01 三分支 | [`story-flow-report.json`](../public/assets/qa/story-flow-report.json)：GO／DETOUR／STOP 全 PASS；Day 7 第三波為 T006／T004／T005。 | ✅ PASS |
| R02 三分支 | [`frost-story-flow-report.json`](../public/assets/qa/frost-story-flow-report.json)：CARE／CLEAR／SUSTAIN 七夜全 PASS，三個主結局與 `frost-emergency-shelter` 替代結局均由 runtime 操作驗證。 | ✅ PASS |
| 公開 runtime 媒體 | `public/assets/screenshots/frost-*-v100.png` 共 22 張；`public/assets/video/night-train-frost-v100-*.webm` 共 3 支且 metadata 為 390×844、duration>0；均為 runtime capture，非 concept。 | ✅ PASS |
| Final commit／clean／push | R02 runtime audit 來源為乾淨 commit `4d3757d`；實作、修正、公開證據與狀態文件均已 commit，分支已推送並追蹤 `origin/codex/story-expansion-v100`。 | ✅ PASS |
| Draft PR／CI | [Draft PR #6](https://github.com/mars-tw/night-train-watch-protocol/pull/6) 疊加於 `codex/story-expansion-v090`，明列依賴 #5 且不得先合併；GitHub Actions `verify` PASS。 | ✅ PASS |
| 實機發布門檻 | iOS Safari／Android Chrome 人工關鍵流程與 Draft→Ready 核准。 | ⏳ Pending |

## 3. Alternatives

- **ALT-001**: 繼續擴寫灰霧線；未採用，因 GDD 已明確定義下一條 R02，且無法提供新的熱力玩法與視覺。
- **ALT-002**: 只加入白霜事件文字；未採用，因不會改善玩家肉眼可見的可玩性。
- **ALT-003**: 把 thermal board 做成全螢幕配置頁；未採用，因會重現選單遮住場景的既有問題。
- **ALT-004**: 使用 Claude 第一稿的冰霜回音主線；未採用，因偏離 A-07 共同署名、照護抉擇、T009 及雪崩終局。
- **ALT-005**: 把 v1.0 直接加入 PR #5；未採用，因 PR #5 已是大型 Draft 且尚未通過實機 gate。

## 4. Dependencies

- **DEP-001**: `codex/story-expansion-v090` commit `928f301`。
- **DEP-002**: GDD v1.1 與 UI 視覺稿 v1.1。
- **DEP-003**: GPT Image 生成工具，只用於兩張本地 runtime 美術。
- **DEP-004**: Playwright／Chromium 真實瀏覽器 QA。
- **DEP-005**: GitHub 公開 repo、Draft PR、Actions。

## 5. Files

- **FILE-001**: `src/game/types.ts` - route、whiteFrost、thermal、T009、ending 型別。
- **FILE-002**: `src/game/content.ts` - R02 route、events、schedule、branch、T009。
- **FILE-003**: `src/game/story.ts` - defaults、branch、thermal、ending。
- **FILE-004**: `src/game/model.ts` - route-aware new run。
- **FILE-005**: `src/game/save.ts` - schema 4 migration。
- **FILE-006**: `src/game/services.ts` - authoritative R02 gameplay。
- **FILE-007**: `src/app.ts` - controller and persistence。
- **FILE-008**: `src/ui/view.ts` - route card、thermal/T009 UI、route-specific result。
- **FILE-009**: `src/game/renderer.ts` - GPT art and visible state layers。
- **FILE-010**: `src/styles/integration.css` - mobile layout and interactions。
- **FILE-011**: `tests/` - content、story、save、threat、assets、regression。
- **FILE-012**: `tools/` - R02 story/button/media audits。
- **FILE-013**: `public/assets/`、`README.md`、`docs/` - open-source evidence。

## 6. Testing

- **TEST-001**: 所有既有 Vitest、typecheck、build 維持 PASS。
- **TEST-002**: EV053–EV065 edge／排程／成本／要求全部可達。
- **TEST-003**: thermal drag/tap 等價、六枚唯一、三分支效果、idempotent settlement。
- **TEST-004**: T009 first miss、retry、manual fallback、timeout、legacy denial。
- **TEST-005**: schema 1–3 migration、R02 three reload checkpoints、backup recovery。
- **TEST-006**: R01 GO／DETOUR／STOP browser regression。
- **TEST-007**: R02 CARE／CLEAR／SUSTAIN full browser completion。
- **TEST-008**: 390×844／360×640 140%、48×48、overflow、hit-test、console errors。
- **TEST-009**: public PNG／WebM／JSON existence、runtime reference、commitSha／version／metadata。

## 7. Risks & Assumptions

- **RISK-001**: Day 7、結果頁及 audit 目前硬編碼 EV050／EV051／EV052；未先資料化會把 R02 送回 R01 終局。
- **RISK-002**: route UI 的 `selectedRouteId` 現在代表每日 RN 節點；若直接重用會混淆宏觀路線。
- **RISK-003**: 新互動加入按鈕但未進 action/value union，可能形成「程式存在但玩家按不到」。
- **RISK-004**: 影片缺 metadata 驗證或 QA JSON 缺 commit SHA，會造成證據與版本錯配。
- **RISK-005**: PR #5 尚未合併；v1.0 必須維持 stacked dependency 並避免提前 merge。
- **ASSUMPTION-001**: 現有 Canvas／DOM 混合場景可支援兩張新 GPT 圖與小量 state-driven overlay，不需更換渲染引擎。
- **ASSUMPTION-002**: 三個 R02 分支各一局完整 browser audit 是最低可接受證據；不可只跑兩局。

## 8. Related Specifications / Further Reading

- [R02 白霜線故事規格](../spec/spec-design-white-frost-story-v1-0.md)
- [v0.9 灰霧線施工計畫](./feature-night-train-story-expansion-v0-9.md)
- [UI 視覺稿施工規格](../references/ui-mockups/UI_VISUAL_IMPLEMENTATION_SPEC_v1.1.md)
