---
title: 夜行列車：守夜協定手機瀏覽器改編規格
version: 1.0.0
date_created: 2026-07-20
last_updated: 2026-07-20
owner: mars-tw
tags: [design, game, mobile-web, pwa, accessibility]
---

# Introduction

本規格把《夜行列車：守夜協定》GDD v1.1 與 16 張 9:16 UI 視覺稿轉為可直接施工的手機瀏覽器規格。GDD 是玩法與數值的權威來源，16 張稿件是版面錨點與視覺狀態的權威來源。

## 1. Purpose & Scope

首個公開版本交付一個可離線遊玩的七夜旅程，包含八個核心畫面、完整日循環、十二個模組、兩個威脅、一種天候、八個輪替事件與五個科技節點。架構必須可擴充 GDD 的後續內容量，不得用畫面元件直接持有權威玩法狀態。

不在首個垂直切片範圍：角色自由移動、射擊、多人連線、後端依賴、付費數值、完整 24 模組或 80 事件內容量。

## 2. Definitions

- **GDD**: `夜行列車_守夜協定_完整遊戲設計文件_GDD_v1.1_視覺製作版.docx`。
- **Visual Baseline**: `references/ui-mockups/夜行列車_UI視覺稿_v1.1/` 下的 16 張 A/B 稿與兩張基礎規格圖。
- **RunState**: 一局的權威執行中狀態。
- **Phase**: Dawn、Prep、Route、Travel、Night、Aftermath。
- **Threat Contact**: Approach、Warning、Attack、Breach、Resolve 五階段接觸。
- **Logical Pixel**: 以 360×640 為基準的 UI 座標單位。
- **Art Key**: 資料定義引用視覺資產的穩定識別碼。

## 3. Requirements, Constraints & Guidelines

- **REQ-001**: 遊戲必須採 360×640 邏輯畫布、9:16 直式手機優先版面，並涵蓋安全區、瀏海與圓角螢幕。
- **REQ-002**: 必須實作 SCR-MM、SCR-MH、SCR-CV、SCR-RM、SCR-EV、SCR-MD、SCR-TT、SCR-RS 八個核心畫面及其 A/B 狀態。
- **REQ-003**: 主循環必須依 Dawn → Prep → Route → Travel → Night → Aftermath 轉移；所有階段切換均自動存檔。
- **REQ-004**: 玩家身份是列車守護 AI；不可加入角色走動、搖桿、瞄準或戰鬥操作。
- **REQ-005**: 車廂場景必須呈現乘客、床、窗／門、設備、天候、威脅、光影及 UI 的分層狀態。
- **REQ-006**: 夜間同時高優先警報不得超過三個；快捷反制不得超過三個，成本與冷卻需在觸發前可見。
- **REQ-007**: 垂直切片必須提供電量、燃料、食物、水、零件、藥品、溫度、噪音、車體、健康、壓力、感染、信任及睡眠狀態。
- **REQ-008**: 每個事件選項必須顯示動作、立即成本與已知後果；未知結果要明示為未知。
- **REQ-009**: 文字必須使用繁體中文 localization key，不得把文字烘焙到 PNG。
- **REQ-010**: 存檔必須保留 current 與 backup，包含 schemaVersion，載入 current 失敗時回退 backup。
- **REQ-011**: 首個版本必須在無網路、無後端、無執行期 AI API 的情況下完成核心流程。
- **REQ-012**: 正式遊戲必須實際引用專案內的場景、角色、威脅與圖示素材；不得只在 README 或封面展示。
- **REQ-013**: 固定車廂必須以即時動畫表達列車仍在行進：窗外雨霧與鐵軌位移、車身低幅搖晃、燈火變化與乘客呼吸至少各有一層；不得以靜態背景替代。
- **REQ-014**: Threat Contact 的 Approach、Warning、Attack、Breach 必須有可辨識的距離、透明度、位移、撞擊與警報差異；Resolve 必須回落，不可只更換倒數文字。
- **REQ-015**: 每日整備提供由前夜睡眠決定的 3–5 AP；收成、安撫、維修及建造必須驗證並消耗 AP，同一日不可無限重複收益。
- **REQ-016**: 入夜時必須結算啟用模組的真實耗電；能源不足依 P3 → P1 保留高優先設備，反制按鈕需反映設備與資源是否可用。
- **REQ-017**: 配餐必須在黎明消耗食物／飲水並改變睡眠、壓力與信任；健康或車體歸零必須進入具失敗原因與重新開始入口的終局。
- **CON-001**: UI 色票固定為背景 `#090E12`、面板 `#192329`、暖色主動作 `#E2A85D`、冷色資訊 `#89B7C7`、安全 `#7EA57A`、危險 `#C2604E`、稀缺 `#E7C970`、正文 `#F5E8D8`、次要文字 `#AAB6BA`。
- **CON-002**: 關鍵觸控區至少 48×48 logical px；不可逆操作採 350ms 長按或二次確認。第 9 章的 48×48 與第 15 章的 44×44 有衝突時採較嚴格值。
- **CON-003**: 事件面板在夜間暫停；設備面板把時間縮放為 0.35×。
- **CON-004**: 危險、可用性與優先級不可只靠顏色表示，必須同時使用形狀、圖樣、文字或方向。
- **CON-005**: 參考稿不得作為唯一不可拆背景直接上架；正式資產必須原創或具專案授權並保存產生紀錄。
- **GUD-001**: 先讓玩家感受到暖室／冷窗反差，再顯示數字；HUD 僅在需要時展開。
- **GUD-002**: 所有平衡值集中於資料檔；元件與畫面不得硬編碼玩法常數。
- **PAT-001**: UI 只讀取 RunState 並發送意圖；模擬服務驗證意圖、更新狀態與寫入 Resource Ledger。

### 3.1 Screen Contract

| Screen | Primary state | Alternate state | Required transition |
|---|---|---|---|
| SCR-MM | 有存檔／繼續守夜 | 無存檔／開始新局 | 續局、新局、局外中心、設定 |
| SCR-MH | 局外總覽 | 路線選擇 | 科技、路線、圖鑑、起始藍圖 |
| SCR-CV | 整備熱區 | 夜間接觸與三項反制 | 模組、配電、配餐、出發／守夜 |
| SCR-RM | 節點選擇 | 掃描資訊 | 選路、確認、進入事件 |
| SCR-EV | 一般暫停事件 | 緊急倒數事件 | 選項結果、Ledger、回到循環 |
| SCR-MD | 模組 Bottom Sheet | 場景插槽配置 | 預覽、原子確認、取消回復 |
| SCR-TT | 五分支全覽 | 單一節點詳情 | 購買、前置檢查、免費重置 |
| SCR-RS | 黎明每日結算 | 路線完成結局 | 鎖定快照、下一夜／回局外 |

## 4. Interfaces & Data Contracts

```ts
type Phase = "dawn" | "prep" | "route" | "travel" | "night" | "aftermath";
type ContactStage = "approach" | "warning" | "attack" | "breach" | "resolve";

interface RunState {
  schemaVersion: 1;
  seed: string;
  day: number;
  maxDays: number;
  phase: Phase;
  routeId: string;
  resources: Record<string, number>;
  survivor: { health: number; stress: number; infection: number; trust: number; sleep: number };
  environment: { temperature: number; noise: number; visibility: number; hull: number; weight: number };
  modules: ModuleInstance[];
  contacts: ThreatContact[];
  flags: string[];
  ledger: LedgerEntry[];
}

interface Intent {
  type: string;
  payload?: Record<string, unknown>;
  issuedAt: number;
}
```

服務介面：`RunService` 管理階段狀態機；`ResourceService` 驗證與記錄資源變更；`ModuleService` 原子建造／升級／拆解；`ThreatDirector` 推進接觸；`EventService` 依 seed 選擇結果；`SaveService` 寫入 current／backup；`AudioService` 在首次使用者互動後啟動。

## 5. Acceptance Criteria

- **AC-001**: Given 390×844 手機視口，When 玩家完成第一夜，Then 八個核心畫面均無水平捲動且所有關鍵按鈕可觸。
- **AC-002**: Given 暖氣與防護同時啟用，When Demand 大於 Supply，Then UI 顯示過載並依優先級斷載或在三秒後跳脫。
- **AC-003**: Given 夜間接觸進入 Warning，When 玩家選擇有效反制，Then 接觸推進至 Resolve 並在 Ledger 記錄成本與結果。
- **AC-004**: Given current 存檔損壞，When 遊戲載入，Then 從 backup 恢復並顯示可理解訊息。
- **AC-005**: Given 140% 字級、減少動態、無倒數，When 玩家走完第一夜，Then 無文字截斷且核心流程仍可完成。
- **AC-006**: Given 網路離線，When 重新開啟已安裝 PWA，Then 可載入、續局及完成當夜。
- **AC-007**: Given正式 Build，When 靜態掃描資產引用，Then 遊戲程式或 CSS 直接引用所有標記為 shipping 的遊戲素材。
- **AC-008**: Given 390×844 視口且動態未停用，When 比較行車畫面相隔一秒的畫格，Then 窗外天候／軌道與至少一個生活光影層產生可見差異，而 HUD 錨點不位移。
- **AC-009**: Given 接觸從 Approach 推進至 Attack，When 比較兩階段畫格，Then 威脅尺寸、位置、警報速度及撞擊效果均可辨識；啟用減少動態後則保留靜態紅框、方向與倒數數字。
- **AC-010**: Given 新局 5 AP，When 玩家完成一次收成，Then AP −1、飲水 −1、食物 +2，且本日收成按鈕停用。
- **AC-011**: Given 只有 5 電量且三個起始模組啟用，When 進入夜晚，Then P3 暖氣保持供電、低優先設備斷載且 HUD 顯示實際耗電。
- **AC-012**: Given 守夜倒數正在運作，When 玩家暫停並等待一秒，Then 秒數不變；繼續後秒數再次推進。

## 6. Test Automation Strategy

- **Test Levels**: 資料驗證、模擬單元測試、服務整合測試、Playwright 行動視口端對端測試、截圖回歸。
- **Frameworks**: Vitest、Playwright、TypeScript compiler、ESLint。
- **Test Data Management**: 固定 seed，分離 route、event、loot、threat RNG stream。
- **CI/CD Integration**: GitHub Actions 執行 typecheck、unit、build、E2E 與 Pages 部署。
- **Coverage Requirements**: 核心模擬與服務行覆蓋率至少 80%；UI 採核心流程 E2E 驗收。
- **Performance Testing**: 390×844 視口連續夜間 3 分鐘；60 fps 目標、30 fps 低階模式，無持續增長的物件數。

## 7. Rationale & Context

DOM/CSS 負責可存取的 UI 與精準排版；Canvas 負責可替換的場景、光影、天候與威脅。這保留視覺稿的資訊架構，也符合 GDD 對「UI 不持有權威狀態」與分層資產的要求。AI 製圖只存在於建置期，避免金鑰外洩與執行期網路依賴。

## 8. Dependencies & External Integrations

- **EXT-001**: GitHub Pages - 公開靜態部署與開源發布。
- **SVC-001**: GPT Image 產圖通道 - 只產生建置期原創資產，不進入遊戲 runtime。
- **INF-001**: Service Worker / Cache Storage - 離線載入。
- **DAT-001**: GDD v1.1 與 16 張 UI 視覺稿 - 設計來源。
- **PLT-001**: 現代 iOS Safari、Android Chrome 與桌面 Chromium。
- **COM-001**: 原創／已授權素材與開源第三方聲明。

## 9. Examples & Edge Cases

```ts
// 不允許扣成負值；所有變化必須經 ResourceService。
applyDelta("parts", -2, "module.M006.build");
// 若 parts < 2，回傳 rejected intent，UI 不得先行扣款。
```

邊界：背景分頁、裝置旋轉、觸控取消、重複點擊 CTA、事件倒數歸零、所有反制冷卻、電量為零、燃料不足、存檔版本過舊、字級 140%、prefers-reduced-motion。

## 10. Validation Criteria

- 所有資料 ID 唯一，前置關係無循環且 artKey 存在。
- 所有資源變化可由 Ledger 追蹤。
- 16 張視覺稿的錨點與 A/B 狀態各有可達 Debug 路徑。
- 首夜無口頭說明可完成，且至少一次產生電力取捨、噪音威脅與睡眠影響。
- 專案不含執行期 API 金鑰、未授權網路素材或只展示不使用的 shipping asset。

## 11. Related Specifications / Further Reading

- `../夜行列車_守夜協定_完整遊戲設計文件_GDD_v1.1_視覺製作版.docx`
- `../references/ui-mockups/夜行列車_UI視覺稿_v1.1/README_視覺稿索引.txt`
- `../plan/feature-night-train-vertical-slice-1.md`
