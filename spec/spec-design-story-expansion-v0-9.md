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
- **REQ-011**: 結果必須統一為四種正式結局與一種保底失敗結局，並由信任、感染、真實路線資料、Day 4 選擇及 Day 7 操作共同判定。
- **REQ-012**: 所有內容資料必須離線存在於專案內，遊戲執行期間不得依賴外部 AI 或網路服務。
- **REQ-013**: 玩家必須能從結果畫面看見本局的 Day 4 選擇、關鍵旗標及結局成立原因。
- **REQ-014**: 既有 RN01、RN02、RN03 必須保留 1、2、3 波風險語意；故事層只能增加波次組合，不能破壞此對應。

### 3.2 Constraints and guidelines

- **CON-001**: 夜間單句可見對話不得超過 24 個中文字；長敘事移至黎明紀錄。
- **CON-002**: 禁止新增自由走動、射擊、開放世界或多人連線玩法。
- **CON-003**: 手機主要互動目標不得小於 48 × 48 CSS px。
- **CON-004**: Day 7 硬性時間上限為 210 秒：進站前 45 秒、三波接觸戰合計 120 秒、終局操作 45 秒。
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
| 1 | 座標來自誰 | 讀座標卡；分配暖房或廣播電力 | EV041：完整存樣本耗電 2；省電仍保留殘缺樣本 | 開放兩個種植槽；暖燈位置影響發芽 | RN01，T002 一波 | `signalSampleQuality`; 黎明顯示編碼早於協定 |
| 2 | A-07 是否真的入睡 | 澆水；拖放醫療盒 | EV042：留空床增信任 1；拆除得零件 2 | 臥廂出現額外床鋪，可留可拆 | RN01，T002 指向臥廂 | `extraBunk`; 黎明回收夢話編號 |
| 3 | 相同座標再次出現 | 比對完整或殘缺座標；部署解碼器 | EV043 固定出現；完整樣本耗零件 1，殘缺樣本耗零件 2 | 通訊廂解碼器排擠一件裝飾 | RN02；第二波加入 T004 | `duplicateCoordinate`; 發送時間差六年 |
| 4 | 是否相信既有路線 | 在改道盤選 GO、DETOUR 或 STOP | EV044；成本依分支契約 | 貨運用途區轉成隔離間、電池陣或採樣室 | RN02；重設後續事件權重 | `day4Route`; A-07 認得未曾到過的橋 |
| 5 | 名冊上少了誰 | 拖放識別牌到已核對或待查 | EV045、EV046；掃描耗電 3 | 通訊廂新增名冊面板；採樣室可交叉比對 | RN03 前哨一波 T005 | `rosterMatch`, `a07IdentityKnown`; 工牌權限異常 |
| 6 | 協定為誰而寫 | 逐條解鎖協定；在暖燈與解碼器間取捨 | EV047、EV048；每條耗電 2 | 車頭開放協定終端槽位 | RN03 三波；條件成立時第三波 T006 | `clause7Read`, `authorKnown`; 顯示 A-07 署名 |
| 7 | 終點是否可信 | 分配電力、三波守夜、完成一次四選一終局操作 | EV049–EV052；只有 EV051 寫入 `finalDecision` | 全車固定終局佈局；可用作物提供可見健康緩衝 | 三波混合；第三波由 Day 4 決定 | 寫入唯一 `endingId`; EV052 只修飾結局理由 |

### 3.5 Day 4 persistent branch contract

| Branch | Immediate cost | Permanent carriage conversion | Day 5 | Day 6 | Day 7 wave 3 |
|---|---|---|---|---|---|
| `GO` | 感染 +2 | 隔離間 | 每夜感染 +1；玩家可在隔離槽執行兩次逆向定位，每次耗電 1；完成兩次後取得真實路線資料 | 協定缺兩條；隔離槽可用藥品 1 抵銷一次感染增量 | T006；警示線索延遲 0.5 秒，總判斷窗固定 8 秒 |
| `DETOUR` | 電力 -4、零件 -3 | 電池陣 | 增加兩個可操作路線抽樣點；完成兩次後取得真實路線資料 | 可完整解鎖條文 | T004 圍站，必須保護種植艙 |
| `STOP` | 食物 -3、水 -3、信任 +3 | 採樣室 | 成功交叉比對名冊兩次後，同時取得真實路線資料及 A-07 身分 | 少解一條但取得作者證據 | T005 群體回聲辨識 |

每條 Day 4 分支都必須能穩定取得 `trueRouteData=true`，且至少能到達兩種非保底結局。EV044 選項卡必須在確認前顯示永久車廂用途、Day 5 主要操作、Day 7 第三波與真實路線資料取得方式。

### 3.6 Character arcs

| Actor | Node | Trigger | Visible behavior |
|---|---|---|---|
| A-07 | A1 服從 | Day 1–2 | 立即執行玩家安排的澆水與搬運 |
| A-07 | A2 保留 | `duplicateCoordinate=true` | 指令出現 3 秒猶豫動畫後才執行 |
| A-07 | A3 反制 | Day 5 選擇待查或信任低於 40 | 主動移動一件可拖放物件；玩家可拖回但耗一次操作 |
| A-07 | A4 交還 | Day 7 接觸階段結束 | 信任 ≥60 時同意終局操作；信任 40–59 且 `authorKnown=true` 時要求玩家出示證據後同意；其他情況拒絕，只有 I2 可覆寫 |
| 守護 AI | B1 工具 | Day 1–2 | 只能執行已授權指令 |
| 守護 AI | B2 猜疑 | 解碼器啟用 | 解鎖「暫不告知」事件選項 |
| 守護 AI | B3 越權 | `clause7Read=true` | 解鎖覆寫；每次信任 -3 且例行工作改為手動 |
| 守護 AI | B4 選擇 | Day 7 終局操作 | 覆寫與交還控制權互斥，只能確認一次 |

### 3.7 Event catalogue

| ID | Title | Prerequisite | Choice A / B | Immediate effect | Delayed flag | Payoff |
|---|---|---|---|---|---|---|
| EV041 | 訊號指紋 | Day 1 | 完整存樣本 / 省電取殘片 | 電力 -2 / 無 | `signalSampleQuality=full` / `partial` | EV043 |
| EV042 | 空床鋪 | Day 2 | 留下 / 拆除 | 信任 +1 / 零件 +2 | `extraBunk` | EV045 |
| EV043 | 二次確認 | Day 3 固定 | 完成比對 / 延後 | 完整樣本零件 -1、殘片零件 -2；延後則感染 +1 | `duplicateCoordinate` | EV044 |
| EV044 | 灰霧線岔口 | Day 4 | GO / DETOUR / STOP | 見 3.5；卡片先顯示永久後果 | `day4Route` | Day 5–7 |
| EV045 | 名冊缺頁 | Day 5 | 核對 / 待查 | 信任 +1 / 感染 +1 | `rosterMatch=verified` / `pending` | EV050、A3 |
| EV046 | 舊工牌 | Day 5 | 掃描 / 收起 | 電力 -3 / 信任 -1 | `a07IdentityKnown` | EV048 |
| EV047 | 第七條 | E4 已裝設 | 讀完 / 中止 | 電力 -2 / 無 | `clause7Read` | 自動解鎖 I2 與 EV051 |
| EV048 | 協定作者 | `a07IdentityKnown` | 告知 / 隱瞞 | 信任 +4 / 感染 -1、信任 -2 | `authorKnown` | Day 7 |
| EV049 | 終點呼叫 | Day 7 arrival | 回應 / 靜默 | 電力 -4 / 感染 +2 | `hailed` | 只改變 contact 強度，不直接決定結局 |
| EV050 | 身分不符 | Day 7 contact 後 | 查驗 / 預先封鎖 | 健康 -2 / 食物 -2、水 -2 | `quarantinePrepared` | 只提供 EV051 可見建議 |
| EV051 | 否決權 | Day 7 decision | 開門 / 封鎖 / 改道 / 終止協定 | 依選項及 A-07 同意狀態；I2 覆寫時信任 -3，且只扣一次 | `finalDecision`、必要時 `overrideUsed` | 呼叫 EndingService |
| EV052 | 最後一句 | `endingId` 已產生 | 說出真相 / 保持沉默 | 不修改結局門檻 | `toldTruth` | 追加 `endingReasons` 與結尾文本，不重新解析結局 |

### 3.8 Day 7 final-decision mapping

EV051 是唯一可以寫入 `finalDecision` 的事件。四個選項都必須同時顯示；未達條件時保持可見但 disabled，並列出原因。`open` 永遠可選，避免所有選項同時鎖死。

| EV051 choice | `mapsToFinalDecision` | Requirement | State update |
|---|---|---|---|
| 交還控制並開門 | `open` | 永遠可選 | `controlReturned=true`；不設定 `overrideUsed` |
| 啟動封鎖 | `seal` | `quarantinePrepared=true`；若 A-07 不同意則還需 I2 | 不同意時以 I2 覆寫並設定 `overrideUsed=true`、信任 -3 |
| 改寫目的地 | `reroute` | `trueRouteData=true`、電力 ≥2；若 A-07 不同意則還需 I2 | 電力 -2；不同意時設定 `overrideUsed=true`、信任 -3 |
| 終止守夜協定 | `terminate` | `clause7Read=true`；若 A-07 不同意則還需 I2 | 不同意時設定 `overrideUsed=true`、信任 -3 |

EV051 成功結算後立即呼叫 EndingService 並鎖定 `endingId`。EV052 只能追加結尾語氣與 `endingReasons`，不得再次呼叫 EndingService。

### 3.9 Threat and technology catalogue

| ID | Type | Name | Visible operation change |
|---|---|---|---|
| T004 | Threat | 霧噬藤 | 鎖定一個種植槽；玩家須把割具拖至藤蔓格才能恢復澆水或收成，割具佔一個部署位 |
| T005 | Threat | 回聲乘客 | 顯示兩個相似求救訊號；第一次選錯只顯示色、形、節拍條線索且不扣血，第二次選錯才使健康 -2 |
| T006 | Threat | 靜默群 | 關閉音訊及敲窗動畫；一般判斷窗 8 秒，GO 第三波的葉片／電表線索延遲 0.5 秒；無作物時電表仍以 35% 強度提示 |
| E4 | Tech | 條文解碼器 | Day 3 解碼器裝設後可研發；通訊廂新增逐條解鎖介面並佔一個槽位；EV047 明確要求 E4 |
| D2 | Tech | 根系感測網 | 每株存活作物增加一個偵測點，最多兩點；一點顯示 50% 方向提示，兩點顯示完整目標車廂 |
| I2 | Tech | 覆寫權杖 | `clause7Read=true` 後自動解鎖；覆寫只扣信任 3 一次，並使 A-07 當夜例行工作停擺 |

Day 7 進站時建立 `finaleHealthBuffer = min(4, usableCropCount * 2)`。`usableCropCount` 是成熟或當日可收成作物數量，HUD 必須在接觸戰前顯示「作物緩衝 +0／+2／+4 健康」。

## 4. Interfaces & Data Contracts

### 4.1 RunState additions

```ts
type Day4Route = "GO" | "DETOUR" | "STOP";
type FinaleStage = "inactive" | "arrival" | "contact" | "decision" | "resolved";
type EndingId = "arrival" | "quarantine" | "reroute" | "protocol-terminated" | "arrival-unverified";
type CargoConversion = "none" | "isolation-bay" | "battery-array" | "sample-lab";
type StoryDuePhase = "dawn" | "prep" | "route" | "travel" | "aftermath";
type SignalSampleQuality = "none" | "partial" | "full";
type FinalDecision = "open" | "seal" | "reroute" | "terminate";

interface ScheduledStoryEvent {
  id: string;
  eventId: string;
  dueDay: number;
  duePhase: StoryDuePhase;
  sourceEventId: string;
  sourceChoiceId: string;
}

interface StoryFlags {
  signalSampleQuality: SignalSampleQuality;
  extraBunk: boolean;
  duplicateCoordinate: boolean;
  day4Route: Day4Route | null;
  rosterGap: boolean;
  rosterMatch: "unchecked" | "verified" | "pending";
  a07IdentityKnown: boolean;
  clause7Read: boolean;
  authorKnown: boolean;
  trueRouteData: boolean;
  routeSampleCount: number;
  manifestCrossChecks: number;
  isolationTraceCount: number;
  hailed: boolean;
  quarantinePrepared: boolean;
  overrideUsed: boolean;
  controlReturned: boolean;
  toldTruth: boolean;
}

interface StoryState {
  version: 1;
  flags: StoryFlags;
  cargoConversion: CargoConversion;
  finaleStage: FinaleStage;
  completedContactWaves: number;
  finaleHealthBuffer: number;
  finalDecision: FinalDecision | null;
  queue: ScheduledStoryEvent[];
  seenEventIds: string[];
  endingId: EndingId | null;
  endingReasons: string[];
  dawnLogIds: string[];
}
```

`RunState` 必須新增 `story: StoryState`。載入舊存檔時，SaveService 必須建立預設 StoryState；不得把新旗標繼續編碼進無型別的 `flags: string[]`。

`ScheduledStoryEvent` 必須以 `(dueDay, phaseOrder, id)` 穩定排序。事件在指定日與階段到期；若玩家因強制終局轉移錯過階段，事件只能在下一個允許階段標記為 overdue 並觸發一次。成功選擇時，數值、旗標、queue 入列、`seenEventIds` 與 transition 必須在同一次原子更新完成；重載不得重複入列或結算。

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
  mapsToFinalDecision?: FinalDecision;
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

function evaluateEnding(state: RunState, finalDecision: FinalDecision): EndingEvaluation;
```

正式條件：

| Ending | Testable condition |
|---|---|
| `arrival` | `trueRouteData=true`、信任 ≥60、感染 ≤30、Day 7 選擇 `open`，且 `overrideUsed=false` 或玩家已設定 `controlReturned=true` |
| `quarantine` | `quarantinePrepared=true`、感染 ≥40、完成 3 波、信任介於 30–59、Day 7 選擇 `seal` |
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
- **AC-007**: Given T005 顯示兩個訊號，When 玩家第一次選錯，Then 健康不下降且 UI 顯示可區分的色、形、節拍條；第二次選錯才使健康 -2。
- **AC-008**: Given A-07 信任低於 40，When 玩家下達可拒絕指令，Then UI 顯示 3 秒猶豫後拒絕；信任 40–59 且有作者證據時可說服，信任 ≥60 時直接同意。
- **AC-009**: Given 玩家使用 I2 覆寫，When 覆寫成立，Then 信任只扣 3 一次，且當夜澆水與搬運改為玩家手動操作；EV051 不得再額外扣 5。
- **AC-010**: Given Day 7 終局開始，When 玩家依序完成三階段，Then 總時長不超過 210 秒、只有 EV051 寫入一個 `finalDecision`，且只產生一個 `endingId`。
- **AC-011**: Given 舊版存檔沒有 `story`，When SaveService 載入，Then 自動補上預設 StoryState 且既有資源、車廂及作物不遺失。
- **AC-012**: Given 360 × 640、390 × 844 及文字 140%，When 操作事件、名冊、條文與終局，Then 所有主要按鈕至少 48 × 48 px，無水平溢位且不遮住遊戲場景。
- **AC-013**: Given 離線或阻擋外部網路，When 完整遊玩七夜，Then 所有事件、威脅、黎明紀錄與結局皆可執行。
- **AC-014**: Given 相同 seed 及相同選擇序列，When 重玩七夜，Then 事件、威脅波次、旗標及結局完全一致。
- **AC-015**: Given Day 1 選擇省電，When 進入 Day 3，Then EV043 仍出現並使用 `signalSampleQuality=partial` 的成本及線索。
- **AC-016**: Given GO、DETOUR、STOP 各一固定 fixture，When 完成各分支兩次指定資料操作，Then 三者都設定 `trueRouteData=true` 且每條可達至少兩個非保底結局。
- **AC-017**: Given EV051 顯示四個選項，When 玩家確認任一選項，Then `mapsToFinalDecision` 分別唯一映射 `open`、`seal`、`reroute`、`terminate`。
- **AC-018**: Given 同時滿足多個結局，When EndingService 解析，Then 依固定優先序只回傳一個 `endingId`，但 `endingReasons` 保留所有符合條件。

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

Claude Opus 5 於 2026-07-25 提供七夜節點、事件、威脅與角色弧初稿；Codex 依現有 TypeScript 狀態、服務分層及 GDD 約束修正為資料契約。Grok CLI 於同日經 `grok models` 驗證登入，以 grok-4.5、單回合、停用 web、subagents 與 memory 的輸出模式完成獨立紅隊審查。Codex 已合併其 P0 修正：三分支真實路線資料公平性、Day 7 210 秒上限、EV051 單一終局操作映射與四正式加一保底的結局用語。

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
    signalSampleQuality: "full",
    extraBunk: true,
    duplicateCoordinate: true,
    day4Route: "STOP",
    rosterGap: false,
    rosterMatch: "verified",
    a07IdentityKnown: true,
    clause7Read: true,
    authorKnown: true,
    trueRouteData: true,
    routeSampleCount: 0,
    manifestCrossChecks: 2,
    isolationTraceCount: 0,
    hailed: false,
    quarantinePrepared: false,
    overrideUsed: false,
    controlReturned: true,
    toldTruth: true,
  },
  cargoConversion: "sample-lab",
  finaleStage: "decision",
  completedContactWaves: 3,
  finaleHealthBuffer: 4,
  finalDecision: null,
  queue: [],
  seenEventIds: ["EV041", "EV043", "EV044", "EV046", "EV047", "EV048"],
  endingId: null,
  endingReasons: [],
  dawnLogIds: ["DL01", "DL03", "DL05", "DL06"],
};
```

Edge cases:

- 玩家 Day 1 選擇省電時，EV043 仍固定出現，但使用 `signalSampleQuality=partial` 的較高成本及較弱線索。
- 玩家在 Day 4 無法支付 DETOUR 或 STOP 成本時，按鈕保持可見但禁用，並顯示缺少的資源；GO 永遠可選。
- GO、DETOUR、STOP 分別以隔離逆向定位兩次、路線抽樣兩次、名冊交叉比對兩次取得 `trueRouteData=true`。
- 作物全毀且 T006 發生時，電表仍提供 35% 強度提示，避免無解。
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
- [Grok v0.9 故事紅隊審查](../docs/GROK_STORY_REVIEW_V0.9.md)
- [GDD v1.1 原始文件](../夜行列車_守夜協定_完整遊戲設計文件_GDD_v1.1_視覺製作版.docx)
