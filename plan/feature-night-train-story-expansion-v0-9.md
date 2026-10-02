---
goal: 將灰霧線七夜故事擴充施工為可見、可點、可存檔及可測的 v0.9 手機遊戲
version: 0.9.0
date_created: 2026-07-25
last_updated: 2026-07-26
owner: Codex controller
status: 'In progress'
tags: [feature, narrative, gameplay, mobile-web, assets, qa]
---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In%20progress-yellow)

本計畫把 [v0.9 灰霧線故事規格](../spec/spec-design-story-expansion-v0-9.md) 拆成可獨立派工、可自動驗收的施工任務。Codex 保持唯一整合與提交控制者；Claude Opus 5 已提供故事初稿；Grok CLI 已在驗證登入後完成獨立反向審查；工程、美術與 QA 代理只提交可稽核的修改或 findings。

## 2026-07-26 可玩威脅與三分支驗收批次

前一批已完成 typed StoryState、schema 3 存檔遷移、EV041–EV052、Day 1–7 固定主線、Day 4 三分支、Day 7 固定三波與五結局解析、強制事件防跳過及手機選項／結果 UI。本批把 T004–T006 從可見入口升級成各自的權威互動：割具真拖放、色／形／節拍比對、無聲葉片／電表判位；三張 GPT 9:16 場景由 Canvas runtime 實際載入。自動驗收為 91 項 Vitest、49 種按鈕／498 項瀏覽器斷言，以及 GO、DETOUR、STOP 三局七日 Chromium 通關。

本批也完成 360×640／140% 故事終局專項、三個威脅操作前截圖與三支分支錄影，全部同步至開源 `public/assets`。仍保留 iOS Safari／Android Chrome 人工核准，因此本計畫維持 `In progress`，Draft PR 不標記 ready。

## 1. Requirements & Constraints

- **REQ-001**: 完成 Day 1 至 Day 7、Day 4 三分支及 Day 7 三階段終局。
- **REQ-002**: 新增 EV041–EV052、T004–T006、E4、D2、I2，且每個內容都必須改變可見玩法。
- **REQ-003**: 所有主線進度、延遲事件、Day 4 分支、Day 7 階段及結局必須可存檔及恢復。
- **REQ-004**: GO、DETOUR、STOP 必須在 Day 5 至 Day 7 產生不同的車廂用途、事件與終局第三波。
- **REQ-005**: 四種正式結局及一種未確認失敗結局必須由固定優先序解析，並顯示成立原因。
- **REQ-006**: 所有選項在確認前顯示成本、風險及標籤；強制事件不可由返回鍵或換畫面跳過。
- **REQ-007**: RN01、RN02、RN03 仍分別代表 1、2、3 波；Day 7 三波不得與 route threatLevel 疊加成 6 波。
- **REQ-008**: 新功能在 360 × 640、390 × 844 與 140% 文字下可讀、可點且不遮住主場景。
- **REQ-009**: GPT Image 生成的新視覺素材必須實際接入遊戲畫面，並包含生成記錄、開源可散布聲明及預覽證據。
- **REQ-010**: 公開預覽圖與遊玩影片必須使用實際 build 及正式或候選部署錄製，不得使用與遊戲不一致的概念圖冒充。
- **SEC-001**: 遊戲執行期間不得包含 OpenAI、Claude、Grok 或其他生成式 AI 金鑰與 API 呼叫。
- **CON-001**: 禁止加入自由走動、射擊、開放世界、多人連線或伺服器執行期。
- **CON-002**: 夜間單句對話不超過 24 個中文字；較長內容放入黎明紀錄。
- **CON-003**: 不覆寫使用者既有未提交修改；每個代理在動手前必須先檢查 `git status --short`。
- **CON-004**: Grok 未通過 `grok models` 驗證時，不得把 Grok 工作標記完成，也不得用其他代理冒名替代。
- **GUD-001**: 故事揭露優先透過場景、物件、動畫、控制權及可操作狀態呈現。
- **GUD-002**: 每個實作任務必須附測試或可重現驗收步驟，不能只回報程式碼存在。
- **PAT-001**: RunService 負責狀態轉移；UI 僅送出 Intent；Resource Ledger 記錄所有狀態成本。
- **PAT-002**: Codex 整合 Claude、Grok、工程、美術與 QA 結果後，才可提交及推送公開分支。

## 2. Implementation Steps

### Implementation Phase 1 — Narrative source and independent review

- **GOAL-001**: 完成有來源、有反向審查紀錄且符合 GDD 與 v0.8 系統限制的故事規格。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Codex 解析 `夜行列車_守夜協定_完整遊戲設計文件_GDD_v1.1_視覺製作版.docx`、`src/game/content.ts`、`src/game/types.ts`、`src/game/services.ts`，建立現況與 GDD 約束清單。 | ✅ | 2026-07-25 |
| TASK-002 | Claude Opus 5 以 `--model opus --effort high` 產出七夜節點、雙角色弧、EV041–EV052、T004–T006、E4、D2、I2、結局及風險初稿；只輸出文字，不讀寫專案。 | ✅ | 2026-07-25 |
| TASK-003 | Grok CLI 在 `grok models` 顯示有效登入後，以單回合、停用 web、subagents、memory 的輸出模式審查故事，列出矛盾、無聊點、不公平點與具體修正。依賴 TASK-002。 | ✅ | 2026-07-25 |
| TASK-004 | Codex 將已驗證的 Claude 初稿、Grok findings 與玩法稽核整合至 `spec/spec-design-story-expansion-v0-9.md`；不得保留矛盾型別或無法測試的敘事條件。依賴 TASK-003。 | ✅ | 2026-07-25 |

### Implementation Phase 2 — Typed story state and migration

- **GOAL-002**: 建立可保存及確定性重播的 StoryProgress 資料層。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-005 | 狀態工程代理在 `src/game/types.ts` 宣告 `Day4Route`、`FinaleStage`、`EndingId`、`CargoConversion`、`StoryFlags`、`ScheduledStoryEvent` 與 `StoryState`；`StoryState` 必須包含 typed flags、`dueDay`/`duePhase` queue、`seenEventIds`、Day 4 分支、Day 7 階段、完成波次及結局。依賴 TASK-004。 |  |  |
| TASK-006 | 狀態工程代理在 `src/game/model.ts` 建立完整預設 StoryState，並在 `src/game/services.ts` 的新遊戲初始化流程加入該狀態。依賴 TASK-005。 |  |  |
| TASK-007 | 存檔工程代理在現有 SaveService 增加 schema migration：舊存檔缺少 `story` 時補預設值，保留資源、倖存者、車廂、擺設及作物。依賴 TASK-006。 |  |  |
| TASK-008 | 測試代理在 `tests/game.test.ts` 新增新局預設值、舊存檔遷移、Day 7 中斷恢復及同 seed 同選擇確定性測試。依賴 TASK-007。 |  |  |

### Implementation Phase 3 — Data-driven story transition

- **GOAL-003**: 移除事件後固定進夜及缺 ID 靜默回退，使強制故事事件不能被跳過。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-009 | 事件工程代理擴充 `src/game/types.ts` 的 GameEvent/EventChoice 契約，加入 prerequisites、risk、tags、typed consequence、transition 及 forceResolution。依賴 TASK-005。 |  |  |
| TASK-010 | 事件工程代理重構 `src/game/services.ts` 的 `resolveEvent()`：依事件 transition 前往 travel、night、aftermath、下一事件或 ending，禁止無條件呼叫 `beginNight()`。依賴 TASK-009。 |  |  |
| TASK-011 | 事件工程代理重構 `getEvent()`：未知 activeEventId 必須產生可見錯誤或受控停止，不得靜默回退 EV001；Day 4、Day 7 強制事件優先於 route event pool。依賴 TASK-010。 |  |  |
| TASK-012 | UI 工程代理修改 `src/app.ts` 與 `src/ui/view.ts`：強制事件隱藏或停用返回路線操作；一般事件仍可正常導覽；每個選項顯示風險、標籤與缺少資源。依賴 TASK-011。 |  |  |
| TASK-013 | 測試代理新增 unknown event、強制事件防跳過、分支 transition、成本預覽與 event queue 到期順序測試。依賴 TASK-012。 |  |  |

### Implementation Phase 4 — Seven-night content and Day 4 branch

- **GOAL-004**: 把七夜故事、12 個事件與三種永久車廂變化接入實際玩法。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-014 | 內容工程代理在 `src/game/content.ts` 定義 EV041–EV052、黎明紀錄、前置條件、選項成本、旗標及回收事件；所有 ID 唯一且可達。依賴 TASK-013。 |  |  |
| TASK-015 | 關卡工程代理在 RunService 增加 Day 1–7 scheduler：Day 4 固定 EV044；Day 5–7 按 `day4Route` 選事件池；每 3–4 分鐘至少一個操作危機。依賴 TASK-014。 |  |  |
| TASK-016 | 車廂工程代理在 `src/game/content.ts`、`src/game/services.ts`、`src/ui/view.ts` 實作 isolation-bay、battery-array、sample-lab 三個貨運用途狀態，確認後同夜改變場景、槽位與功能。依賴 TASK-015。 |  |  |
| TASK-017 | 角色互動代理在 RunService 及 UI 實作 A-07 的猶豫、拒絕、搬動擺設及交還識別牌；行為由信任與 typed flags 決定且可在 reduced-motion 模式讀懂。依賴 TASK-015。 |  |  |
| TASK-018 | 測試代理建立 GO、DETOUR、STOP 三個固定 seed 七夜 fixture，驗證 Day 5–7 事件、車廂用途、旗標回收及成本不同。依賴 TASK-016、TASK-017。 |  |  |

### Implementation Phase 5 — Farming, threats, and visible technologies

- **GOAL-005**: 讓種植、擺設與守夜互相影響，消除純等待與重複解法。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-019 | 威脅工程代理在 `src/game/content.ts` 與 Threat Director 實作 T004：鎖定種植槽，割具拖放成功前禁止澆水與收成。依賴 TASK-018。 | ✅ | 2026-07-26 |
| TASK-020 | 威脅工程代理實作 T005：名冊面板節奏比對、錯誤健康成本、兩次錯誤後明確提示，避免隨機猜測。依賴 TASK-018。 | ✅ | 2026-07-26 |
| TASK-021 | 威脅工程代理實作 T006：關閉音訊及敲窗提示，以葉片震動和電表抖動判位；無作物時保留較弱但可完成的電表提示。依賴 TASK-018。 | ✅ | 2026-07-26 |
| TASK-022 | 科技工程代理實作 E4、D2、I2；分別新增條文解碼槽位、根系偵測點及覆寫後手動例行工作，不得只給被動數值。依賴 TASK-019、TASK-020、TASK-021。 |  |  |
| TASK-023 | 測試代理驗證 T004 拖放解鎖、T005 線索與錯誤提示、T006 有作物及無作物判位、E4 槽位排擠、D2 覆蓋範圍及 I2 操作成本。依賴 TASK-022。 |  |  |

### Implementation Phase 6 — Day 7 finale and endings

- **GOAL-006**: 完成不可重複結算、可恢復且能產生唯一結局的 Day 7。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-024 | 終局工程代理重構 `continueAftermath()`：Day 7 不可直接寫入 victory，必須轉到 `arrival`；之後明確執行三波 contact，再進 `decision`。依賴 TASK-023。 |  |  |
| TASK-025 | 終局工程代理確保 Day 7 固定為 arrival 45 秒、contact 三波合計 120 秒、decision 45 秒；波次來源為 Day 4 分支定義，不與 RN03 `threatLevel=3` 疊加，重新載入不得重複套成本。依賴 TASK-024。 |  |  |
| TASK-026 | 結局工程代理新增 `EndingService.evaluateEnding()`，按 protocol-terminated、quarantine、reroute、arrival、arrival-unverified 固定優先序回傳 `endingId` 與 reasons；既有 hull-lost、survivor-lost 保留機械失敗。依賴 TASK-025。 |  |  |
| TASK-027 | UI 工程代理更新 `src/ui/view.ts` 結果畫面，移除單一改道硬編碼文字，顯示結局標題、成立原因、Day 4 選擇及關鍵旗標。依賴 TASK-026。 |  |  |
| TASK-028 | 測試代理為五個故事結果與兩個機械失敗建立 fixture，驗證唯一結果、優先序、重新載入及理由文字。依賴 TASK-027。 |  |  |

### Implementation Phase 7 — GPT visual assets and mobile presentation

- **GOAL-007**: 讓新增故事內容在真實遊戲畫面中肉眼可辨，並把實際素材接入 runtime。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-029 | 視覺總監依 GDD 及現有 9:16 畫風，為三個貨運用途、T004–T006、協定終端及五個結局建立多視圖 asset brief；每張列出尺寸、構圖、可互動熱區及透明圖層需求。依賴 TASK-004。 |  |  |
| TASK-030 | GPT Image 素材代理依 approved brief 生成候選圖，輸出至 `output/generated/`；Codex 只選擇與遊戲透視、照明及熱區相符的圖進入 `public/assets/art/`，並更新來源清單。依賴 TASK-029。 |  |  |
| TASK-031 | 前端整合代理將 approved assets 接到 `src/ui/view.ts`、Canvas 場景及 CSS；每個素材必須在至少一個正常遊玩流程可見，未使用候選圖不得進 public。依賴 TASK-030。 |  |  |
| TASK-032 | 手機 UX 代理在 360 × 640、390 × 844、140% 字體檢查面板高度、48 px 觸控、夜間暫停語意、車廂辨識及場景遮擋，並提交修正。依賴 TASK-031。 |  |  |

### Implementation Phase 8 — QA evidence, open-source preview, and release

- **GOAL-008**: 以實際 build、瀏覽器操作及公開部署證明 v0.9 可玩。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-033 | QA 代理執行 `npm run check`、完整故事測試、資產檢查與 Playwright 按鈕稽核；任何失敗都必須回到對應工程任務修正。依賴 TASK-028、TASK-032。 | ✅ | 2026-07-26 |
| TASK-034 | 瀏覽器 QA 代理在真實 Chromium 以 GO、DETOUR、STOP 各玩一輪關鍵節點，確認按鈕、拖放、作物、威脅、分支及結局可見可用；保存截圖、trace 與操作計數。依賴 TASK-033。 | ✅ | 2026-07-26 |
| TASK-035 | 證據代理使用候選 build 錄製直式遊玩影片，至少包含種植、物件拖放、Day 4 車廂改變、T004/T005/T006、Day 7 與結果；同步更新 README 預覽圖、影片連結及版本說明。依賴 TASK-034。 | ✅ | 2026-07-26 |
| TASK-036 | 開源稽核代理檢查 LICENSE、素材來源、GPT 生成記錄、README、預覽圖與影片，確認 clone 後能安裝、建置及離線執行。依賴 TASK-035。 |  |  |
| TASK-037 | Codex controller 審查 diff、測試、瀏覽器證據與開源稽核後提交並推送 `codex/story-expansion-v090`，建立 draft PR；未完成 Grok 審查或自動 QA 時不得標 ready。依賴 TASK-003、TASK-036。 |  |  |
| TASK-038 | 人工手機 QA 在 iOS Safari 與 Android Chrome 各完成一輪關鍵流程並核准；只有核准後才可合併、部署 GitHub Pages 及驗證公開靜態素材 HTTP 200。依賴 TASK-037。 |  |  |

## 3. Alternatives

- **ALT-001**: 只新增黎明文字章節；未採用，因為不會改善車廂、種植與守夜可玩性。
- **ALT-002**: 為四個結局建立四套完全獨立關卡；未採用，因為內容重複且測試成本高，改採 typed flags 與固定 resolver。
- **ALT-003**: 延續 `flags: string[]` 儲存所有故事狀態；未採用，因為容易混入每日/UI 旗標且無法可靠遷移。
- **ALT-004**: 在 Day 7 疊加 RN03 三波與終局三波；未採用，因為會意外產生六波並超出 5–10 分鐘節奏。
- **ALT-005**: 將生成圖全部放入 public 後再挑選；未採用，因為會再次留下未使用素材並膨脹開源專案。

## 4. Dependencies

- **DEP-001**: `spec/spec-design-story-expansion-v0-9.md` 是所有工程與 QA 的唯一 v0.9 行為契約。
- **DEP-002**: 現有 TypeScript、Vite、Canvas、PWA、Vitest 與 Playwright 執行環境。
- **DEP-003**: Claude Code 已驗證的 `claude-opus-5` 文字輸出。
- **DEP-004**: Grok CLI grok-4.5 已驗證登入並完成獨立審查；審查證據保存於 `docs/GROK_STORY_REVIEW_V0.9.md`。
- **DEP-005**: GPT Image 生成能力只用於離線製作素材，不進入遊戲執行期。
- **DEP-006**: GitHub Actions、GitHub Pages 及人工 iOS/Android QA 是發布閘門。

## 5. Files

- **FILE-001**: `spec/spec-design-story-expansion-v0-9.md` — v0.9 故事與玩法契約。
- **FILE-002**: `plan/feature-night-train-story-expansion-v0-9.md` — 本施工與派工計畫。
- **FILE-003**: `src/game/types.ts` — StoryState、事件、威脅、科技及結局型別。
- **FILE-004**: `src/game/model.ts` — 新局 StoryState 預設值。
- **FILE-005**: `src/game/content.ts` — 七夜事件、威脅、科技、黎明紀錄與分支內容。
- **FILE-006**: `src/game/services.ts` — scheduler、事件 transition、Threat Director、存檔遷移及 ending resolver。
- **FILE-007**: `src/app.ts` — 新 action routing 與強制事件導覽限制。
- **FILE-008**: `src/ui/view.ts` — 事件成本、角色反應、終局及結果畫面。
- **FILE-009**: `src/styles/integration.css` — 新面板、車廂狀態、威脅線索及手機版面。
- **FILE-010**: `tests/game.test.ts` — 故事狀態、分支、威脅、終局與結局測試。
- **FILE-011**: `tools/audit-buttons.mjs` — v0.9 手機按鈕與完整互動稽核。
- **FILE-012**: `public/assets/art/` 與素材來源清單 — approved GPT 視覺圖及授權證據。
- **FILE-013**: `README.md` 與公開證據目錄 — 實際預覽圖、影片及可玩連結。
- **FILE-014**: `docs/GROK_STORY_REVIEW_V0.9.md` — Grok 登入驗證方式、P0/P1 findings、驗收與 Codex disposition。

## 6. Testing

- **TEST-001**: StoryState 新局、舊存檔遷移及 Day 7 中斷恢復測試。
- **TEST-002**: EV041–EV052 唯一 ID、可達性、成本預覽、transition 與延遲回收測試。
- **TEST-003**: Day 4 GO、DETOUR、STOP 三分支 Day 5–7 可見差異測試。
- **TEST-004**: T004、T005、T006 與 E4、D2、I2 操作語法測試。
- **TEST-005**: Day 7 嚴格三階段、固定三波、總時長 ≤210 秒、EV051 唯一 FinalDecision 映射及不可重複結算測試。
- **TEST-006**: 四種正式結局、一種未確認失敗及兩種機械失敗唯一解析測試。
- **TEST-007**: 360 × 640、390 × 844、140% 文字、reduced-motion 與 48 px 觸控 Playwright 測試。
- **TEST-008**: 離線七夜完整流程及 Service Worker 新素材快取測試。
- **TEST-009**: README 預覽圖與遊玩影片對應候選或正式 build 的人工證據檢查。
- **TEST-010**: `npm run check`、GitHub Actions 及部署後靜態素材 HTTP 驗證。

## 7. Risks & Assumptions

- **RISK-001**: `getEvent()` 缺 ID 時回退 EV001 會掩蓋內容錯誤；TASK-011 必須改為受控失敗。
- **RISK-002**: 事件畫面返回路線可跳過 EV044 或 Day 7；TASK-012 必須鎖定強制事件。
- **RISK-003**: `resolveEvent()` 固定 `beginNight()` 會破壞多事件鏈；TASK-010 必須資料驅動。
- **RISK-004**: `continueAftermath()` Day 7 直接 victory 會跳過終局；TASK-024 必須重構。
- **RISK-005**: 結果畫面單一硬編碼文案會讓不同結局看起來相同；TASK-027 必須依 EndingDefinition 渲染。
- **RISK-006**: T005 可能被玩家視為隨機猜測；必須提供前置節奏線索及兩次錯誤後提示。
- **RISK-007**: T006 在作物全毀時可能無解；必須保留弱電表提示。
- **RISK-008**: 生成素材可能與設計稿透視或互動熱區不符；TASK-029 先定 brief，TASK-030 只接入 approved asset。
- **RISK-009**: Grok findings 可能與 GDD、現有型別或 Claude 初稿衝突；只有 Codex 可在核對原始碼與可測條件後合併，Grok 不直接改檔或發布。
- **ASSUMPTION-001**: v0.8 的 42 個單元測試及現有瀏覽器稽核是 v0.9 回歸基線。
- **ASSUMPTION-002**: 既有五節車廂與兩個 CropPlot 保留，貨運用途區以狀態圖層而非第六節車廂實作。
- **ASSUMPTION-003**: 人工 iOS Safari 與 Android Chrome 驗收由專案擁有者或指定測試者完成。

## 8. Related Specifications / Further Reading

- [v0.9 灰霧線七夜故事擴充規格](../spec/spec-design-story-expansion-v0-9.md)
- [Grok v0.9 故事紅隊審查](../docs/GROK_STORY_REVIEW_V0.9.md)
- [手機瀏覽器改編規格](../spec/spec-design-mobile-browser-adaptation.md)
- [v0.8 垂直切片計畫](./feature-night-train-vertical-slice-1.md)
- [GDD v1.1 原始文件](../夜行列車_守夜協定_完整遊戲設計文件_GDD_v1.1_視覺製作版.docx)
