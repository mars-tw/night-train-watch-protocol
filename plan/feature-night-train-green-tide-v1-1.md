---
goal: 將 GDD R03 綠潮線施工為可完整通關、可視、可觸控並可公開驗證的手機瀏覽器故事線
version: 1.1.0
date_created: 2026-07-28
last_updated: 2026-07-28
owner: Codex
status: 'In progress'
tags: [feature, game, story, mobile, green-tide, open-source]
---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In_progress-yellow)

本計畫把 [R03 綠潮線規格](../spec/spec-design-green-tide-story-v1-1.md) 拆成可平行施工及可驗收任務。分支 `codex/story-expansion-v110` 疊加於 `codex/story-expansion-v100`；新 Draft PR 必須以 v1.0 分支為 base 並標示依賴 PR #6。

## 1. Requirements & Constraints

- **REQ-001**: 實作 GDD R03 綠潮線 EV066–EV078、三分支、七夜與四個可達結局。
- **REQ-002**: 種植、灌溉、污染、檢疫、收成與銷毀必須是可見操作並修改權威 state。
- **REQ-003**: T008 潛伏者與 T013 孢子者必須有專屬互動、第一次錯誤免傷、重試與固定保底。
- **REQ-004**: CULTIVATE／FILTER／PURGE 必須永久改變不同車廂、Day 5 操作與 Day 7 門檻。
- **REQ-005**: schema 5 必須嚴格辨識 R01／R02／R03，保留 legacy save 且拒絕未知 route/schema。
- **REQ-006**: R01／R02 的內容、seed、route timing、按鈕與公開 QA 不得回歸。
- **REQ-007**: 三張 GPT runtime 圖像必須實際由 renderer 載入，不保留未使用候選。
- **REQ-008**: 390×844、360×640、140% 字級、reduced-motion、no-countdown 與 48×48 hit target 全通過。
- **REQ-009**: 公開預覽圖、完整遊玩影片、QA JSON、README、分支與 Draft PR 必須同步。
- **SEC-001**: 不提交 API key、token、CLI session、debug log 或私人路徑憑證；遊戲 runtime 不連 GPT API。
- **CON-001**: UI 只送 intent；RunService／story helper 是唯一資源、污染、威脅與結局寫入者。
- **CON-002**: R03 使用新的 RNG stream；不得增加 R01／R02 既有 stream 的抽樣次數。
- **CON-003**: T006 已發布為 R01 靜默群；R03 孢子者只使用 T013。
- **CON-004**: PR 保持 Draft，直到 iOS Safari／Android Chrome 人工驗收及堆疊基底合併後重跑。
- **GUD-001**: UI 遵循 16 張稿的 360×640 logical layout、8px grid、單一暖金 CTA 及 Bottom Sheet。
- **PAT-001**: 以 route policy、route-specific substate、唯一 settlement ID 及 runtime evidence 延伸 R02 已驗證模式。

## 2. Implementation Steps

### Implementation Phase 1 — Source, supervision and contract

- GOAL-001: 鎖定 GDD 事實、相容延伸、視覺方向、架構風險與可測合約。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | 從 GDD、16 張 UI 稿與既有 R01/R02 證據確認 R03 綠潮線、污染循環、代表威脅與封閉溫室站終局。 | ✅ | 2026-07-28 |
| TASK-002 | 實際派送同一設計包給 Claude Opus 與 Grok 4.5；保留 Claude 可用骨架並拒絕不相容內容，記錄 Grok 402 後改由獨立 Codex 代理做故事、視覺與 QA 稽核。 | ✅ | 2026-07-28 |
| TASK-003 | 建立 `spec/spec-design-green-tide-story-v1-1.md`，鎖定 EV066–EV078、CULTIVATE/FILTER/PURGE、Cycle Board、T008/T013、四結局與 mobile gates。 | ✅ | 2026-07-28 |
| TASK-004 | 從 `3b06d6e` 建立 `codex/story-expansion-v110`；基線 `npm run check` 146 tests、typecheck、build PASS。 | ✅ | 2026-07-28 |

### Implementation Phase 2 — Route, state and save architecture

- GOAL-002: 讓第三條路線能正確建立、排程、存檔與重載，不被 R01/R02 二分誤判。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-005 | 新增 route runtime policy 與 schedule-driven event ownership，保留 R01 `startsWithPrepStory=false`。 |  |  |
| TASK-006 | 在 `types.ts`／`story.ts` 新增 R03、GreenTideState、Cycle、T008/T013 與 ending helper；所有結算 idempotent。 |  |  |
| TASK-007 | 在 `model.ts` 以 policy 建立 R03 起始資源、溫室車廂、初始作物／種源及提示，並維持 R01/R02 snapshot。 |  |  |
| TASK-008 | 在 `save.ts` 實作 schema 5、strict route allowlist、Green repair、T008/T013 checkpoint 及 unknown current→backup。 |  |  |

### Implementation Phase 3 — Seven-night content and playable systems

- GOAL-003: 實作每晚可見決策、永久分支、循環檢疫、兩種威脅與四結局。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-009 | 在 `content.ts` 新增 EV066–EV078、R03 schedule、route definition、event-route index 與每個強制事件的零資源保底。 |  |  |
| TASK-010 | 實作 CULTIVATE／FILTER／PURGE 分支 consequence、分支操作及重載後永久 state。 |  |  |
| TASK-011 | 實作 S1–S4 Cycle Board inspect/select/move/target/reset/commit/manual-drain；拖曳與點按共用命令。 |  |  |
| TASK-012 | 實作 T008 CANOPY/FILTER/UNDERBED 檢查、標記、第一次錯判、第二次代價、timeout 與 manual-seal。 |  |  |
| TASK-013 | 實作 T013 污染水樣、作物／reservoir 感染、Cycle Board 解除及 manual-drain。 |  |  |
| TASK-014 | 實作 Day 7 GATE→CONTACT→DECISION 與 green-seedbank／symbiosis／firebreak／quarantine 唯一結算。 |  |  |

### Implementation Phase 4 — Runtime visual, animation and mobile UI

- GOAL-004: 讓玩家肉眼看到每個選擇造成的車廂、作物、污染、威脅與結局變化。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-015 | 將主選單 route card 資料化為 R01/R02/R03，R03 標示「預覽可玩／正式需求科技 8」，避免不可解鎖灰卡。 |  |  |
| TASK-016 | 在 `view.ts`／`app.ts` 實作 Cycle Bottom Sheet、三區 T008、T013、分支場景控制、pointer drop 抑制與 R03 result。 |  |  |
| TASK-017 | 在 `renderer.ts` 實際載入綠潮車廂、T008/T013 與三分支設備層；作物、污染、根脈及結局由 state 驅動。 |  |  |
| TASK-018 | 在 `integration.css` 實作活體根脈軌、420/180/360ms 動畫、360×640 compact、140% 文字與 reduced-motion 靜態等價。 |  |  |
| TASK-019 | 使用 GPT Image 生成並核准三張本地 runtime PNG，更新資產清單、來源與 naturalWidth browser 驗證。 |  |  |

### Implementation Phase 5 — Automated and real-browser evidence

- GOAL-005: 以單元、整合、全按鈕、三分支真實瀏覽器與公開媒體證明可玩。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-020 | 新增 green content/runtime/save/threat/asset tests，涵蓋事件 edge、route policy、cycle、T008/T013、四結局與 legacy。 |  |  |
| TASK-021 | 擴充 `audit:buttons`，保留 R01=49、R01+R02=56 基準並新增 R03 action/value、center hit-test、disabled reason。 |  |  |
| TASK-022 | 新增 `tools/audit-green-story.mjs`，跑 CULTIVATE／FILTER／PURGE 七夜、四結局、三 reload checkpoints、drag/tap、wrong/retry。 |  |  |
| TASK-023 | 重跑 `npm run check`、`audit:buttons`、`audit:story`、`audit:frost`、`audit:green`；browser errors 必須為 0。 |  |  |
| TASK-024 | 從乾淨 commit 產出 R03 分支、Cycle、T008/T013、小螢幕、四結局 PNG 與三支完整 390×844 WebM，寫入精確 metadata。 |  |  |

### Implementation Phase 6 — Open-source publication

- GOAL-006: 讓原始碼、GPT 圖、預覽圖、影片、QA、文件與 Draft PR 同步且可稽核。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-025 | 更新 package version、README、ASSET_MANIFEST、MOBILE_VISUAL_QA 及公開執行／驗收連結。 |  |  |
| TASK-026 | Codex 完成 diff、授權、密鑰、runtime 引用、文件連結、測試、媒體 hash 與獨立反對性審查。 |  |  |
| TASK-027 | 建立乾淨 commits 並推送 `origin/codex/story-expansion-v110`。 |  |  |
| TASK-028 | 建立 Draft PR，base=`codex/story-expansion-v100`，標示 Depends on #6 / do not merge first，並等待 CI。 |  |  |
| TASK-029 | iOS Safari／Android Chrome 人工完成 R03 關鍵流程後才能轉 Ready；#6 合併後 rebase/retarget main 並重跑全部證據。 |  |  |

### 2.1 Evidence gates

| Gate | Evidence | Status |
|---|---|---|
| Source traceability | GDD R03、UI route card／carriage／event／result 規格已核對。 | ✅ PASS |
| Baseline | `npm run check`：146 tests、typecheck、build PASS。 | ✅ PASS |
| Claude execution | Claude Opus 實際回傳；Codex 拒絕新增乘客、非 seed 機率及不相容 state。 | ✅ DISCLOSED |
| Grok review | Grok 4.5 實際呼叫回傳 402 balance exhausted；未宣稱完成。 | ⚠️ UNAVAILABLE |
| R03 implementation | Route/state/content/UI 尚未施工。 | ⏳ Pending |
| Real-browser evidence | R03 三分支、四結局與媒體尚未產出。 | ⏳ Pending |
| Manual devices | iOS Safari／Android Chrome 人工關鍵流程。 | ⏳ Pending |

## 3. Alternatives

- **ALT-001**: 把 R03 做成 R02 thermal 換皮；拒絕，因 GDD 要求每路線新增規則且綠潮核心是資源污染。
- **ALT-002**: 把 GDD T006 改回孢子者；拒絕，因公開 R01 已占用並會破壞存檔與證據。
- **ALT-003**: 新增全域 seed／tainted currency；拒絕，改放 GreenTideState，避免擴張常駐 HUD。
- **ALT-004**: 只用事件卡扣感染；拒絕，因玩家要求可見、可玩、可點且種植必須是內容。
- **ALT-005**: 綠潮卡依 UI 稿永遠鎖在科技 8；拒絕，本版無 MetaProgress，改明示預覽解鎖與正式需求。

## 4. Dependencies

- **DEP-001**: `codex/story-expansion-v100` commit `3b06d6e` 與 Draft PR #6。
- **DEP-002**: GDD v1.1 與 UI 視覺稿 v1.1。
- **DEP-003**: 現有 CropPlot、五車廂、四件可移動小物與 schema 4 legacy saves。
- **DEP-004**: GPT Image built-in generation與本地 PNG runtime。
- **DEP-005**: Vitest、Vite、Playwright／Chromium。
- **DEP-006**: GitHub 公開 repo、Draft PR 與 Actions。

## 5. Files

- **FILE-001**: `src/game/types.ts` — R03、GreenTide、Cycle、T008/T013、schema 5。
- **FILE-002**: `src/game/content.ts` — events、schedule、route policy、branches、threats。
- **FILE-003**: `src/game/story.ts` — defaults、branch、ending helpers。
- **FILE-004**: `src/game/model.ts` — route-aware initial run。
- **FILE-005**: `src/game/save.ts` — strict migration與repair。
- **FILE-006**: `src/game/services.ts` — authoritative route/content/cycle/threat/finale。
- **FILE-007**: `src/app.ts` — route/actions/persistence/pointer guard。
- **FILE-008**: `src/ui/view.ts` — route/Cycle/T008/T013/result UI。
- **FILE-009**: `src/game/renderer.ts` — GPT art與state layers。
- **FILE-010**: `src/styles/integration.css` — mobile layout、root trace與動畫。
- **FILE-011**: `tests/` — content/runtime/save/threat/assets/regression。
- **FILE-012**: `tools/` — R03 story/button/media audits。
- **FILE-013**: `public/assets/`、`README.md`、`docs/` — open-source evidence。
- **FILE-014**: `public/sw.js`、`package.json` — cache/version與 scripts。

## 6. Testing

- **TEST-001**: EV066–EV078 唯一、可達、route edge 正確且所有強制事件有保底。
- **TEST-002**: route policy 保留 R01/R02 固定 seed／時序並正確啟動 R03。
- **TEST-003**: Cycle 拖曳＝點按、inspect/reveal、每日唯一 settlement、manual-drain。
- **TEST-004**: T008/T013 deterministic、第一次錯誤、第二次代價、timeout、no-countdown、reload。
- **TEST-005**: schema 1–5、未知 route/schema、current→backup、跨路線 substate 清理。
- **TEST-006**: 四結局、唯一 reward、連點、pointer drop synthetic click。
- **TEST-007**: 390×844、360×640、140%、48×48、center hit-test、overflow、reduced-motion。
- **TEST-008**: 三張 GPT art `naturalWidth>0` 且 renderer/state screenshot 可見。
- **TEST-009**: public/output PNG、WebM、JSON hash、duration、viewport、commitSha、dirty flag。

## 7. Risks & Assumptions

- **RISK-001**: 現有 route 二分使 R03 開成 R01 或 R02；先完成 policy/schedule index 再加內容。
- **RISK-002**: schema 4 把未知 route 靜默降 R01；schema 5 必須 strict。
- **RISK-003**: Cycle 與 CropPlot 可能重複結算灌溉；使用 settlement ID 並由 RunService 單一寫入。
- **RISK-004**: 第三張 route card、Cycle Sheet 或 T008 在 360×640/140% 遮住場景；以真實中心點點擊而非 DOM 存在驗收。
- **RISK-005**: T006 ID 衝突；只新增 T013 並保留 legacy 對照。
- **RISK-006**: service worker 舊 JS 與 schema 5 save 不相容；更新 cache key 並測 reload。
- **RISK-007**: Claude 草案與視覺資產偏離現有模型；Codex 只採納經 contract 與 runtime evidence 驗證的部分。
- **ASSUMPTION-001**: R03 本版本為開發預覽解鎖，正式科技 8 門檻等 MetaProgress 後續實作。
- **ASSUMPTION-002**: 五車廂 base art 保留，R03 差異以 route／branch overlay 和獨立 GPT layer 實作。

## 8. Related Specifications / Further Reading

- [R03 綠潮線規格](../spec/spec-design-green-tide-story-v1-1.md)
- [R02 白霜線規格](../spec/spec-design-white-frost-story-v1-0.md)
- [手機瀏覽器改造規格](../spec/spec-design-mobile-browser-adaptation.md)
- [UI 視覺稿施工規格](../references/ui-mockups/UI_VISUAL_IMPLEMENTATION_SPEC_v1.1.md)
