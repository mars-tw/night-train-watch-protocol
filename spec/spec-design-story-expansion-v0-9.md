---
title: 夜行列車：守夜協定 v0.9 灰霧線七夜故事擴充規格
version: 0.9.0
date_created: 2026-07-25
last_updated: 2026-07-25
owner: mars-tw
tags: [design, narrative, gameplay, mobile-web, data-driven]
---

# Introduction

本規格把 GDD v1.1 的灰霧線主題轉成可操作的七夜流程。故事必須改變玩家看得到、點得到的車廂、種植、擺設、資源、路線與接觸戰，不得只以長對話或純數值事件呈現。

## 1. Purpose & Scope

本規格適用於 v0.9 灰霧線單一路線擴充，供遊戲工程、關卡設計、敘事、2D 美術與 QA 直接施工。範圍包含：

- Day 1 至 Day 7 的主線、Day 4 永久分支與 Day 7 三階段終局。
- 12 個新事件、3 個新威脅、3 個新科技及 4 種正式結局。
- A-07 與守護 AI 的雙角色弧，並以操作反應、動畫及介面狀態表現。
- 延遲旗標、路線真實資料、車廂轉換與結局判定資料契約。
- 手機瀏覽器可見、可點、可測的互動及時間預算。

本規格不包含自由走動、射擊、開放世界、多人連線、即時 AI API 呼叫或其他三條主題路線的完整內容。

## 2. Definitions

- **守護 AI**：由玩家控制的列車管理系統。
- **A-07**：守護 AI 必須保護的成年倖存者，也是守夜協定的共同設計者之一。
- **灰霧線**：探討信任及「AI 是否只是工具」的主題路線。
- **直接效果**：選擇確認後立即顯示於資源、倖存者或場景的變化。
- **延遲旗標**：當下可不顯示完整後果，但必須在後續事件、場景或結局中回收的狀態。
- **真實路線資料**：用於證明終點座標與 A-07 身分訊號不一致的可驗證資料。
- **永久車廂轉換**：Day 4 後，貨運用途區在本輪遊戲中改成隔離間、電池陣或採樣室。
- **三階段終局**：Day 7 的進站前、接觸戰、終局操作三個連續階段。
- **接觸波次**：Threat Director 依序執行的一組威脅接觸；不是射擊戰。
- **黎明紀錄**：承載超過 24 個中文字之敘事的非戰鬥閱讀區。

## 3. Requirements, Constraints & Guidelines

### 3.1 Core requirements

- **REQ-001**: 完整遊戲流程必須固定包含 Day 1 至 Day 7，且每夜至少有一個改變遊戲狀態的玩家操作。
- **REQ-002**: 每 3 至 4 分鐘至少提供一次可操作危機，單次遊玩目標為 5 至 10 分鐘。
- **REQ-003**: 所有事件選項必須在確認前顯示直接成本、風險等級與分類標籤。
- **REQ-004**: 延遲旗標可以隱藏後果，但必須在後續事件、場景、黎明紀錄或結局中至少回收一次。
- **REQ-005**: Day 4 必須提供 `GO`、`DETOUR`、`STOP` 三個選擇，並永久改變 Day 5 至 Day 7 的車廂用途、事件池及終局第三波。
- **REQ-006**: Day 7 必須依序執行 `arrival`、`contact`、`decision` 三個階段，並在同一局內產生一個可判定結局。
- **REQ-007**: 種植系統必須同時影響食物供給、A-07 生存上限及威脅偵測，不能維持為獨立等待計時器。
- **REQ-008**: A-07 的信任狀態必須以延遲、拒絕、主動移動擺設或交還識別牌等可見行為呈現。
- **REQ-009**: 玩家使用覆寫權時，必須立即承擔信任損失及手動完成 A-07 當夜例行工作的操作成本。
- **REQ-010**: 新威脅必須改變玩家觀察或拖放的方式，不得只修改傷害係數。
- **REQ-011**: 四種正式結局必須由信任、感染、真實路線資料、Day 4 選擇及 Day 7 操作共同判定。
- **REQ-012**: 所有內容資料必須離線存在於專案內，遊戲執行期間不得依賴外部 AI 或網路服務。
- **REQ-013**: 玩家必須能從結果畫面看見本局的 Day 4 選擇、關鍵旗標及結局成立原因。
- **REQ-014**: 既有 RN01、RN02、RN03 必須保留 1、2、3 波風險語意；故事層只能增加波次組合，不能破壞此對應。

### 3.2 Constraints and guidelines

- **CON-001**: 夜間單句可見對話不得超過 24 個中文字；長敘事移至黎明紀錄。
- **CON-002**: 禁止新增自由走動、射擊、開放世界或多人連線玩法。
- **CON-003**: 手機主要互動目標不得小於 48 × 48 CSS px。
- **CON-004**: Day 7 時間預算為進站前 90 秒、接觸戰 240 秒、終局操作 60 秒。
- **CON-005**: 分支不得要求玩家重新開始 App 才能生效；所有變化須在目前 RunState 立即反映。
- **GUD-001**: 每個敘事揭露優先使用場景改變、動畫、控制權或物件位移，其次才使用文字。
- **GUD-002**: 不公平風險必須先提供一次可觀察線索，再允許造成健康或不可逆損失。
- **GUD-003**: Day 4 選項確認後，當夜立即改變貨運用途區外觀及槽位，讓玩家看見選擇差異。
- **PAT-001**: 所有事件透過資料定義，由 EventService 驗證前置條件、顯示成本、套用立即效果、寫入旗標及紀錄回收。
- **PAT-002**: 所有資源與倖存者變化必須經既有服務寫入 Resource Ledger，不得由 UI 直接修改 RunState。

### 3.3 Current gaps to close

| Gap | Current problem | v0.9 correction |
|---|---|---|
| GAP-01 | 事件與車廂實體狀態脫鉤 | 事件可鎖定槽位、改變車廂用途並移動擺設 |
| GAP-02 | 路線只有波次數差異 | 加入訊號樣本、重複座標與真實路線資料 |
| GAP-03 | 種植不影響守夜 | 新增根系感測、霧噬藤與終局存活上限 |
| GAP-04 | A-07 缺乏主體性 | 以延遲、拒絕、搬動物件及識別牌行為表現 |
| GAP-05 | 威脅解法重複 | 新威脅要求割除、節奏辨識及視覺震動判位 |

### 3.4 Seven-night playable structure

| Day | Suspense | Visible player operation | Event and direct cost | Carriage, farming, or object effect | Contact change | Flag and dawn payoff |
|---|---|---|---|---|---|---|
| 1 | 座標來自誰 | 讀座標卡；分配暖房或廣播電力 | EV041：存樣本耗電 2；省電則不存 | 開放兩個種植槽；暖燈位置影響發芽 | RN01，T002 一波 | `signalSample`; 黎明顯示編碼早於協定 |
| 2 | A-07 是否真的入睡 | 澆水；拖放醫療盒 | EV042：留空床增信任 1；拆除得零件 2 | 臥廂出現額外床鋪，可留可拆 | RN01，T002 指向臥廂 | `extraBunk`; 黎明回收夢話編號 |
| 3 | 相同座標再次出現 | 比對座標；部署解碼器 | EV043：比對耗零件 2；忽略增感染 1 | 通訊廂解碼器排擠一件裝飾 | RN02；第二波加入 T004 | `duplicateCoordinate`; 發送時間差六年 |
| 4 | 是否相信既有路線 | 在改道盤選 GO、DETOUR 或 STOP | EV044；成本依分支契約 | 貨運用途區轉成隔離間、電池陣或採樣室 | RN02；重設後續事件權重 | `day4Route`; A-07 認得未曾到過的橋 |
| 5 | 名冊上少了誰 | 拖放識別牌到已核對或待查 | EV045、EV046；掃描耗電 3 | 通訊廂新增名冊面板；採樣室可交叉比對 | RN03 前哨一波 T005 | `rosterMatch`, `a07IdentityKnown`; 工牌權限異常 |
| 6 | 協定為誰而寫 | 逐條解鎖協定；在暖燈與解碼器間取捨 | EV047、EV048；每條耗電 2 | 車頭開放協定終端槽位 | RN03 三波；條件成立時第三波 T006 | `clause7Read`, `authorKnown`; 顯示 A-07 署名 |
| 7 | 終點是否可信 | 分配電力、三波守夜、選擇開門或改道 | EV049–EV052；成本依階段契約 | 全車固定終局佈局；作物庫存決定存活上限 | 三波混合；第三波由 Day 4 決定 | 寫入 `endingId`; 結果畫面列出成立原因 |

### 3.5 Day 4 persistent branch contract

| Branch | Immediate cost | Permanent carriage conversion | Day 5 | Day 6 | Day 7 wave 3 |
|---|---|---|---|---|---|
| `GO` | 感染 +2 | 隔離間 | 每夜感染 +1；只能單向核對名冊 | 協定缺兩條 | T006；反應時間縮短 20% |
| `DETOUR` | 電力 -4、零件 -3 | 電池陣 | 增加路線抽樣，可取得真實路線資料 | 可完整解鎖條文 | T004 圍站，必須保護種植艙 |
| `STOP` | 食物 -3、水 -3、信任 +3 | 採樣室 | 可交叉比對名冊並提早確認身分 | 少解一條但取得作者證據 | T005 群體回聲辨識 |

### 3.6 Character arcs

| Actor | Node | Trigger | Visible behavior |
|---|---|---|---|
| A-07 | A1 服從 | Day 1–2 | 立即執行玩家安排的澆水與搬運 |
| A-07 | A2 保留 | `duplicateCoordinate=true` | 指令出現 3 秒猶豫動畫後才執行 |
| A-07 | A3 反制 | Day 5 選擇待查或信任低於 40 | 主動移動一件可拖放物件；玩家可拖回但耗一次操作 |
| A-07 | A4 交還 | Day 7 接觸階段結束 | 信任達門檻時把識別牌放入終端，否則拒絕 |
| 守護 AI | B1 工具 | Day 1–2 | 只能執行已授權指令 |
| 守護 AI | B2 猜疑 | 解碼器啟用 | 解鎖「暫不告知」事件選項 |
| 守護 AI | B3 越權 | `clause7Read=true` | 解鎖覆寫；每次信任 -3 且例行工作改為手動 |
| 守護 AI | B4 選擇 | Day 7 終局操作 | 覆寫與交還控制權互斥，只能確認一次 |

### 3.7 Event catalogue

| ID | Title | Prerequisite | Choice A / B | Immediate effect | Delayed flag | Payoff |
|---|---|---|---|---|---|---|
| EV041 | 訊號指紋 | Day 1 | 存樣本 / 省電 | 電力 -2 / 無 | `signalSample` | EV043 |
| EV042 | 空床鋪 | Day 2 | 留下 / 拆除 | 信任 +1 / 零件 +2 | `extraBunk` | EV045 |
| EV043 | 二次確認 | `signalSample` | 比對 / 忽略 | 零件 -2、信任 +2 / 感染 +1 | `duplicateCoordinate` | EV044 |
| EV044 | 灰霧線岔口 | Day 4 | GO / DETOUR / STOP | 見 3.5 | `day4Route` | Day 5–7 |
| EV045 | 名冊缺頁 | Day 5 | 補寫 / 留白 | 信任 -2 / 感染 +1 | `rosterGap` | EV050 |
| EV046 | 舊工牌 | Day 5 | 掃描 / 收起 | 電力 -3 / 信任 -1 | `a07IdentityKnown` | EV048 |
| EV047 | 第七條 | 解碼器啟用 | 讀完 / 中止 | 電力 -2、信任 -3 / 無 | `clause7Read` | EV051 |
| EV048 | 協定作者 | `a07IdentityKnown` | 告知 / 隱瞞 | 信任 +4 / 感染 -1、信任 -2 | `authorKnown` | Day 7 |
| EV049 | 終點呼叫 | Day 7 arrival | 回應 / 靜默 | 電力 -4 / 感染 +2 | `hailed` | contact |
| EV050 | 身分不符 | Day 7 contact | 開門查驗 / 封鎖 | 健康 -2 / 食物 -2、水 -2 | `quarantine` | decision |
| EV051 | 否決權 | `clause7Read` | 行使 / 放棄 | 信任 -5 / 感染 +2 | `overrideUsed` | ending |
| EV052 | 最後一句 | Day 7 decision | 說出真相 / 沉默 | 信任 +3 / 信任 -3 | `toldTruth` | ending |

### 3.8 Threat and technology catalogue

| ID | Type | Name | Visible operation change |
|---|---|---|---|
| T004 | Threat | 霧噬藤 | 鎖定一個種植槽；玩家須把割具拖至藤蔓格才能恢復澆水或收成，割具佔一個部署位 |
| T005 | Threat | 回聲乘客 | 顯示兩個相似求救訊號；玩家須在名冊面板比對節奏後選擇，錯誤使健康 -2 |
| T006 | Threat | 靜默群 | 關閉音訊提示及敲窗動畫；玩家只能從葉片震動與電表抖動判斷目標車廂 |
| E4 | Tech | 條文解碼器 | 通訊廂新增逐條解鎖介面，且解碼器佔用槽位 |
| D2 | Tech | 根系感測網 | 每株存活作物成為偵測點，增加夜間可見警示範圍 |
| I2 | Tech | 覆寫權杖 | 解鎖強制執行；使用後 A-07 當夜例行工作停擺 |

## 4. Interfaces & Data Contracts

### 4.1 RunState additions

```ts
type Day4Route = "GO" | "DETOUR" | "STOP";
type FinaleStage = "inactive" | "arrival" | "contact" | "decision" | "resolved";
type EndingId = "arrival" | "quarantine" | "reroute" | "protocol-terminated" | "arrival-unverified";
type CargoConversion = "none" | "isolation-bay" | "battery-array" | "sample-lab";
type StoryDuePhase = "dawn" | "prep" | "route" | "travel" | "aftermath";

interface ScheduledStoryEvent {
  id: string;
  eventId: string;
  dueDay: number;
  duePhase: StoryDuePhase;
  sourceEventId: string;
  sourceChoiceId: string;
}

interface StoryFlags {
  signalSample: boolean;
  extraBunk: boolean;
  duplicateCoordinate: boolean;
  day4Route: Day4Route | null;
  rosterGap: boolean;
  rosterMatch: "unchecked" | "verified" | "pending";
  a07IdentityKnown: boolean;
  clause7Read: boolean;
  authorKnown: boolean;
  trueRouteData: boolean;
  hailed: boolean;
  quarantine: boolean;
  overrideUsed: boolean;
  toldTruth: boolean;
}

interface StoryState {
  version: 1;
  flags: StoryFlags;
  cargoConversion: CargoConversion;
  finaleStage: FinaleStage;
  completedContactWaves: number;
  queue: ScheduledStoryEvent[];
  seenEventIds: string[];
  endingId: EndingId | null;
  endingReasons: string[];
  dawnLogIds: string[];
}
```

`RunState` 必須新增 `story: StoryState`。載入舊存檔時，SaveService 必須建立預設 StoryState；不得把新旗標繼續編碼進無型別的 `flags: string[]`。

### 4.2 Event definition additions

```ts
interface StoryRequirement {
  day?: number;
  phase?: Phase;
  allFlags?: Array<keyof StoryFlags>;
  day4Route?: Day4Route[];
  minimum?: Partial<Record<SurvivorKey | ResourceKey, number>>;
}

interface StoryConsequence {
  resourceDelta?: Partial<ResourceState>;
  survivorDelta?: Partial<SurvivorState>;
  setFlags?: Partial<StoryFlags>;
  cargoConversion?: CargoConversion;
  unlockDawnLogId?: string;
}

interface StoryChoice {
  id: string;
  label: string;
  risk: "low" | "medium" | "high" | "irreversible";
  tags: string[];
  visibleCost: string;
  consequence: StoryConsequence;
}
```

### 4.3 Ending resolver

EndingService 必須以固定優先序解析，且只執行一次：

1. `protocol-terminated`
2. `quarantine`
3. `reroute`
4. `arrival`
5. `arrival-unverified`

```ts
interface EndingEvaluation {
  endingId: EndingId;
  reasons: string[];
}

function evaluateEnding(state: RunState, finalDecision: "open" | "seal" | "reroute" | "terminate"): EndingEvaluation;
```

正式條件：

| Ending | Testable condition |
|---|---|
| `arrival` | `trueRouteData=true`、信任 ≥60、感染 ≤30、Day 7 選擇 `open`、`overrideUsed=false` |
| `quarantine` | `quarantine=true`、感染 ≥40、完成 3 波、信任介於 30–59、Day 7 選擇 `seal` |
| `reroute` | `day4Route` 為 DETOUR 或 STOP、`trueRouteData=true`、感染 ≤50、Day 7 選擇 `reroute` |
| `protocol-terminated` | `clause7Read=true`、`overrideUsed=true`，且信任 ≤29 或 Day 7 選擇 `terminate` |
| `arrival-unverified` | 前四者皆不成立；結果必須明確標記為失敗結局 |

## 5. Acceptance Criteria

- **AC-001**: Given 新遊戲開始，When 玩家完成七個黎明循環，Then 每日只前進一次且 Day 7 必定進入三階段終局。
- **AC-002**: Given 任一事件選項，When 玩家尚未確認，Then 畫面已顯示直接成本、風險及至少一個分類標籤。
- **AC-003**: Given Day 4 三個選項，When 玩家確認其中一個，Then 當夜場景、可用槽位及 `cargoConversion` 同步變更。
- **AC-004**: Given Day 4 已選擇分支，When 進入 Day 5、6、7，Then 事件池、協定內容及第三波分別符合 3.5 表格。
- **AC-005**: Given 已種植至少一株作物並裝設 D2，When T006 發生，Then 音訊及敲窗提示關閉，但葉片震動與電表提示仍可判位。
- **AC-006**: Given T004 鎖定種植槽，When 玩家尚未拖入割具，Then 該槽不可澆水或收成；完成拖放後同夜恢復操作。
- **AC-007**: Given T005 顯示兩個訊號，When 玩家先開啟名冊面板，Then 可取得可區分的節奏線索；連續錯誤兩次後顯示明確提示。
- **AC-008**: Given A-07 信任低於 40，When 玩家下達可拒絕指令，Then UI 顯示 3 秒猶豫或拒絕動畫，不得只改數值。
- **AC-009**: Given 玩家使用 I2 覆寫，When 覆寫成立，Then 信任立即 -3，且當夜澆水與搬運改為玩家手動操作。
- **AC-010**: Given Day 7 終局開始，When 玩家依序完成三階段，Then 只產生一個 `endingId` 並列出所有成立原因。
- **AC-011**: Given 舊版存檔沒有 `story`，When SaveService 載入，Then 自動補上預設 StoryState 且既有資源、車廂及作物不遺失。
- **AC-012**: Given 360 × 640、390 × 844 及文字 140%，When 操作事件、名冊、條文與終局，Then 所有主要按鈕至少 48 × 48 px，無水平溢位且不遮住遊戲場景。
- **AC-013**: Given 離線或阻擋外部網路，When 完整遊玩七夜，Then 所有事件、威脅、黎明紀錄與結局皆可執行。
- **AC-014**: Given 相同 seed 及相同選擇序列，When 重玩七夜，Then 事件、威脅波次、旗標及結局完全一致。

## 6. Test Automation Strategy

- **Test Levels**: Vitest 單元測試、服務整合測試、Playwright 手機瀏覽器流程測試。
- **Frameworks**: TypeScript、Vitest、Playwright，以及現有 `npm run check` 驗證鏈。
- **Test Data Management**: 新增固定 seed 的 GO、DETOUR、STOP 三套七夜劇本；每套明確列出選擇、預期旗標、資源與結局。
- **CI/CD Integration**: Pull request 必須執行型別檢查、單元測試、建置、資產驗證及 Playwright 按鈕稽核。
- **Coverage Requirements**: EndingService、StoryState migration、Day 4 分支、Day 7 狀態機與新威脅操作必須 100% 分支覆蓋。
- **Performance Testing**: 390 × 844 中階手機模擬下，T006 葉片及電表動畫須維持平均 50 fps 以上；任何面板開啟不得造成超過 200 ms 主執行緒停頓。

## 7. Rationale & Context

現有 v0.8 已讓 RN01、RN02、RN03 對應 1、2、3 波接觸，並具備五節車廂、拖放擺設與種植。v0.9 不重做核心迴圈，而是把 GDD 的灰霧線謎團附著到現有操作：

- 訊號真偽透過解碼器、名冊及真實路線資料判定。
- 信任不是單一進度條，而會改變 A-07 是否延遲、拒絕或交還控制權。
- 種植不只產糧，也成為 T006 的偵測介面及 Day 7 生存條件。
- Day 4 立刻改變車廂，讓分支差異在肉眼可見的玩法中成立。

Claude Opus 5 於 2026-07-25 提供七夜節點、事件、威脅與角色弧初稿；Codex 依現有 TypeScript 狀態、服務分層及 GDD 約束修正為本資料契約。Grok 的獨立反向審查只有在 CLI 驗證登入並實際回傳內容後才能列為完成。

## 8. Dependencies & External Integrations

### External Systems

- **EXT-001**: GitHub Pages - 完成合併後提供公開手機瀏覽器版本與證據頁面。

### Third-Party Services

- **SVC-001**: GPT Image 生成 - 只用於製作新威脅、車廂轉換及終局場景的靜態美術素材；遊戲執行時不呼叫 API。

### Infrastructure Dependencies

- **INF-001**: Service Worker 與 Cache Storage - 必須快取 v0.9 事件資料及新增美術，使七夜流程離線可玩。

### Data Dependencies

- **DAT-001**: GDD v1.1 - 提供灰霧線主題、七日節奏、角色關係及結局方向。
- **DAT-002**: v0.8 `src/game/content.ts` - 提供現有車廂、事件、路線、威脅與科技 ID。

### Technology Platform Dependencies

- **PLT-001**: TypeScript、Vite、Canvas、DOM/CSS 及現有 PWA 架構 - 不新增伺服器執行期。

### Compliance Dependencies

- **COM-001**: 專案開源授權與素材清單 - 新增素材必須可重新散布，並在資產清單標註來源與生成方式。

## 9. Examples & Edge Cases

```ts
const stopBranchFixture: StoryState = {
  version: 1,
  flags: {
    signalSample: true,
    extraBunk: true,
    duplicateCoordinate: true,
    day4Route: "STOP",
    rosterGap: false,
    rosterMatch: "verified",
    a07IdentityKnown: true,
    clause7Read: true,
    authorKnown: true,
    trueRouteData: true,
    hailed: false,
    quarantine: false,
    overrideUsed: false,
    toldTruth: true,
  },
  cargoConversion: "sample-lab",
  finaleStage: "decision",
  completedContactWaves: 3,
  queue: [],
  seenEventIds: ["EV041", "EV043", "EV044", "EV046", "EV047", "EV048"],
  endingId: null,
  endingReasons: [],
  dawnLogIds: ["DL01", "DL03", "DL05", "DL06"],
};
```

Edge cases:

- 玩家未存訊號樣本時，EV043 不出現，但 Day 4 仍必須提供三選一；DETOUR 與 STOP 可在後續補得真實路線資料。
- 玩家在 Day 4 無法支付 DETOUR 或 STOP 成本時，按鈕保持可見但禁用，並顯示缺少的資源；GO 永遠可選。
- 作物全毀且 T006 發生時，電表仍提供較弱但足以完成的提示，避免無解。
- Day 7 中途重新載入時，必須從 `finaleStage` 與完成波次恢復，不得重複套用階段成本。
- 多個結局同時符合時，EndingService 依 4.3 固定優先序選擇並保留原因，避免不確定結果。

## 10. Validation Criteria

- 規格中的 EV041–EV052、T004–T006、E4、D2、I2 均在內容資料中唯一宣告。
- Day 4 三分支各有一套七夜固定 seed 測試，且後三夜產生不同可見車廂與第三波。
- 每個延遲旗標至少有一個自動化測試驗證後續回收。
- 四個正式結局及保底失敗結局皆可由測試資料穩定重現。
- 新增 UI 在 360 × 640、390 × 844、140% 文字與 `prefers-reduced-motion` 下通過可視及操作檢查。
- 完整流程在封鎖網路後可從 Day 1 玩至結果畫面。
- `npm run check`、新增故事測試與按鈕稽核全部通過後才能標記 v0.9 故事施工完成。

## 11. Related Specifications / Further Reading

- [手機瀏覽器改編規格](./spec-design-mobile-browser-adaptation.md)
- [v0.8 垂直切片計畫](../plan/feature-night-train-vertical-slice-1.md)
- [GDD v1.1 原始文件](../夜行列車_守夜協定_完整遊戲設計文件_GDD_v1.1_視覺製作版.docx)
