---
goal: 依 GDD v1.1 與 16 張 UI 視覺稿完成夜行列車七夜手機瀏覽器版本
version: 1.1.0
date_created: 2026-07-20
last_updated: 2026-07-21
owner: mars-tw
status: 'Completed'
tags: [feature, game, mobile-web, pwa, open-source]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

本計畫供 Codex、Grok CLI 與人工協作者共同執行。Grok CLI 只負責受約束的文字草稿；Codex 負責規格、程式、素材整合、測試與發布。

## 1. Requirements & Constraints

- **REQ-001**: 完成七夜旅程與八個核心畫面 A/B 狀態。
- **REQ-002**: 所有畫面依 360×640 邏輯座標與既有 UI Token 實作。
- **REQ-003**: shipping 素材必須被遊戲 runtime 實際引用。
- **CON-001**: 遊戲 runtime 完全離線且不得包含 OpenAI、xAI 或其他服務金鑰。
- **CON-002**: GDD 數值集中於 TypeScript 資料定義，不硬編碼於 UI。
- **GUD-001**: 先完成可驗證的七夜旅程，再擴張事件與科技內容量。
- **PAT-001**: DOM/CSS UI + Canvas 場景 + 權威服務層 + IndexedDB 雙存檔。

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: 建立設計追溯與可執行專案基線。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | 解析 GDD、84 個資料表、16 張 UI 稿及視覺 Token。 | ✅ | 2026-07-20 |
| TASK-002 | 建立 `spec/spec-design-mobile-browser-adaptation.md`。 | ✅ | 2026-07-20 |
| TASK-003 | 建立 Vite、TypeScript、Canvas、PWA、測試與 CI 專案骨架。 | ✅ | 2026-07-20 |

### Implementation Phase 2

- GOAL-002: 實作資料驅動的七夜核心模擬。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-004 | 在 `src/game/` 實作 PhaseStateMachine、RunService 與固定 seed RNG streams。 | ✅ | 2026-07-20 |
| TASK-005 | 實作 ResourceService、PowerGrid、ModuleService、Ledger 與睡眠結算。 | ✅ | 2026-07-20 |
| TASK-006 | 實作 ThreatDirector 五階段接觸、兩個威脅與三項緊急反制。 | ✅ | 2026-07-20 |
| TASK-007 | 實作 EventService、八個事件、路線節點與七夜輪替腳本。 | ✅ | 2026-07-20 |
| TASK-008 | 實作 current／backup IndexedDB 存檔與 localStorage 降級。 | ✅ | 2026-07-20 |

### Implementation Phase 3

- GOAL-003: 依視覺稿實作八個核心畫面與分層場景。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-009 | 實作 SCR-MM、SCR-MH、SCR-CV、SCR-RM、SCR-EV、SCR-MD、SCR-TT、SCR-RS。 | ✅ | 2026-07-20 |
| TASK-010 | 將 UI Token、邏輯座標、安全區、大字與 reduced-motion 寫入 `src/styles/`。 | ✅ | 2026-07-20 |
| TASK-011 | 產生原創車廂、乘客、威脅與天候資產，存入 `public/assets/art/` 並保留 prompt manifest。 | ✅ | 2026-07-20 |
| TASK-012 | 在 Canvas 場景實際引用所有 shipping artKey，實作暖室／冷窗、裂痕、斷電與方向警報。 | ✅ | 2026-07-20 |
| TASK-013 | 加入首次互動後啟動的 WebAudio 環境音、警報及 UI 回饋。 | ✅ | 2026-07-20 |

### Implementation Phase 4

- GOAL-004: 驗證、錄影、開源與公開部署。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-014 | 實作 Vitest 資料／模擬測試與 Playwright 手機核心流程 E2E。 | ✅ | 2026-07-20 |
| TASK-015 | 以 390×844、360×800 與桌面窄視口進行截圖回歸，逐張比對視覺稿。 | ✅ | 2026-07-20 |
| TASK-016 | 重新製作遊玩截圖與至少 20 秒的手機遊玩影片。 | ✅ | 2026-07-20 |
| TASK-017 | 加入 README、LICENSE、CONTRIBUTING、THIRD_PARTY_NOTICES、資產來源與產圖 prompt manifest。 | ✅ | 2026-07-20 |
| TASK-018 | 初始化 Git、推送公開 GitHub repo、啟用 Actions 與 Pages，確認線上離線續局。 | ✅ | 2026-07-20 |

### Implementation Phase 5

- GOAL-005: 把靜態佈置與單一車廂擴充為具相容槽位、五車廂差異及完整農業循環的 v0.5.0。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-019 | 依 GDD 配置臥室、武器物資、工坊情報、溫室與廚房儲藏五節車廂，並以五張 GPT 場景圖與五組操作面板實際切換。 | ✅ | 2026-07-21 |
| TASK-020 | 實作五節車廂共 15 個相容放置槽、占用檢查、點放、拖曳吸附、無效回復與 schema v1 → v2 存檔遷移。 | ✅ | 2026-07-21 |
| TASK-021 | 產生三種作物四階段 GPT 素材，實作兩槽播種、灌溉、M003 夜間供電、兩夜成長、枯萎與收成收益。 | ✅ | 2026-07-21 |
| TASK-022 | 以 390×844 真實瀏覽器稽核 48 種操作、360 項斷言；逐狀態檢查所有啟用按鈕的中心命中，修正維修熱區、占用槽位、模組 Grid 與配電面板遮擋。 | ✅ | 2026-07-21 |
| TASK-023 | 更新開源預覽圖、遊玩影片、資產 prompt manifest、README、單元測試與 PWA v0.5.0 快取。 | ✅ | 2026-07-21 |

## 3. Alternatives

- **ALT-001**: 直接把 16 張 UI 截圖當背景疊透明按鈕；拒絕，因為無法呈現 GDD 要求的狀態與分層，也不是可維護遊戲。
- **ALT-002**: 使用完整 WebGL 遊戲 UI；拒絕，因為 DOM/CSS 更適合文字縮放、鍵盤焦點與精準還原設計稿。
- **ALT-003**: 在玩家裝置即時呼叫生成式 AI；拒絕，因為破壞離線要求並暴露金鑰與成本。

## 4. Dependencies

- **DEP-001**: Node.js 與 npm，用於 TypeScript 建置及測試。
- **DEP-002**: 現代瀏覽器 Canvas、WebAudio、IndexedDB、Service Worker API。
- **DEP-003**: Playwright 瀏覽器 runtime 與其 ffmpeg，用於 E2E 與錄影。
- **DEP-004**: GPT Image 產圖通道，用於建置期原創 raster 資產。
- **DEP-005**: GitHub 與 GitHub Pages，用於開源與公開部署。

## 5. Files

- **FILE-001**: `spec/spec-design-mobile-browser-adaptation.md`，瀏覽器改編規格。
- **FILE-002**: `src/game/`，權威模擬與服務。
- **FILE-003**: `src/screens/`，八個核心畫面。
- **FILE-004**: `src/styles/`，UI Token、響應式與無障礙。
- **FILE-005**: `public/assets/`，runtime 使用的圖像、音訊與 manifest。
- **FILE-006**: `tests/`，單元與 E2E 測試。

## 6. Testing

- **TEST-001**: 固定 seed 的七夜模擬可重播且 Ledger 完全一致。
- **TEST-002**: 電力過載、斷載優先級、接觸階段與反制成本符合 GDD。
- **TEST-003**: 八個畫面 A/B 狀態可由 Debug query 到達。
- **TEST-004**: current 存檔損壞時從 backup 復原。
- **TEST-005**: 390×844、140% 字級、reduced-motion、無倒數可完成第一夜。
- **TEST-006**: offline context 可載入並續局。
- **TEST-007**: shipping asset manifest 每個檔案至少有一個 runtime 引用。

## 7. Risks & Assumptions

- **RISK-001**: 參考稿場景是構圖參考而非正式授權資產；以原創分層素材替換並保存來源。
- **RISK-002**: 產圖模型可能無法穩定輸出真正分層素材；必要時以遮罩、裁切與 Canvas 合成處理。
- **RISK-003**: iOS 背景中斷可能造成狀態遺失；在 visibilitychange、pagehide 與 phase transition 寫入雙存檔。
- **ASSUMPTION-001**: 首個公開版本以七夜完整旅程為完成基線，架構與資料可延伸更多事件與路線。
- **ASSUMPTION-002**: 所有 API 圖像生成只在開發機執行，成品檔案以靜態資產發布。

## 8. Related Specifications / Further Reading

- `../spec/spec-design-mobile-browser-adaptation.md`
- `../夜行列車_守夜協定_完整遊戲設計文件_GDD_v1.1_視覺製作版.docx`
- `../references/ui-mockups/夜行列車_UI視覺稿_v1.1/README_視覺稿索引.txt`
