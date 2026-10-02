---
title: R03 綠潮線可玩故事、循環檢疫與潛伏者規格
version: 1.1.0
date_created: 2026-07-28
last_updated: 2026-07-28
owner: Codex
tags: [design, game, story, mobile, green-tide, crops, open-source]
---

# Introduction

本規格把 GDD v1.1 已定義的 R03「綠潮線」施工為可選、可見、可操作、可存檔及可自動驗收的七夜路線。R03 的核心不是再做一套白霜熱力板，而是讓水、濾芯、作物與感染形成可見的封閉循環；玩家必須親自播種、灌溉、採樣、分流、隔離、收成或銷毀，並承擔這些選擇在 A-07 與終局留下的後果。

## 1. Purpose & Scope

### 1.1 GDD 固定事實

- 路線：`R03 綠潮線`。
- 主題：封閉循環與污染。
- 核心問題：自給自足是否必然安全。
- 主視覺：森林、藤蔓、溫室配置。
- 主要規則：孢子污染與食物生產；水源比前兩線多，但可能受污染。
- 終局揭露：感染可透過資源系統而非敵人直接傳入。
- 代表威脅：孢子者、T008 潛伏者、污染水。
- 終局：封閉溫室站，保留「取種子或燒毀感染源」的核心抉擇。
- 玩家仍是列車守護 AI；不新增持槍角色、自由走動、射擊或第二個自由探索場景。

### 1.2 相容延伸

- 新增 EV066–EV078、三個 Day 4 永久分支與四個可達結局。
- 新增「循環檢疫板」，以四枚水樣在 `INTAKE／FILTER／GROW_A／GROW_B／DRAIN` 間移動。
- 新增 T008 專屬潛伏者定位互動。
- GDD 的孢子者原 ID T006 已被公開 R01 的「靜默群」使用；依發布後 ID 不重用原則，R03 runtime 孢子者使用 `T013`，且不得建立 T006 alias。
- 新增 schema 5 存檔遷移、R03 真實瀏覽器稽核、公開截圖與完整遊玩影片。

### 1.3 非目標

- 不重寫 R01／R02 已發布事件、威脅 ID、seed stream 或結局。
- 不把 GPT API 放入遊戲 runtime；生成圖完成後必須本地化。
- 不以事件長文取代種植、檢疫、威脅定位或終局操作。
- 不在 iOS Safari／Android Chrome 人工 QA 前把堆疊 PR 轉 Ready 或合併。

## 2. Definitions

| 名稱 | 定義 |
|---|---|
| R03 | 本規格新增的綠潮線。 |
| Cycle Board | 車廂場景內可收合的循環檢疫板。 |
| Sample Token | S1–S4 四枚可拖曳、可點選且可序列化的水樣。 |
| INTAKE | 未檢疫水樣的入口。 |
| FILTER | 淨化水樣的濾芯節點。 |
| GROW_A／GROW_B | 對應既有 `plot-a`／`plot-b` 的兩個種植槽。 |
| DRAIN | 排放水樣並承擔資源損失的安全節點。 |
| CULTIVATE | 受控培育分支；保留產能並管理有限污染。 |
| FILTER | 深度過濾分支；以能源與零件換低污染。 |
| PURGE | 焚除斷路分支；犧牲作物與種源換安全。 |
| T008 | GDD 定義的低可見威脅「潛伏者」。 |
| T013 | R03 runtime 的「孢子者」；GDD legacy ID 為已占用的 T006。 |

## 3. Requirements, Constraints & Guidelines

- **REQ-001**: `StoryRouteId` 必須支援 `R01 | R02 | R03`；所有路線解析使用嚴格 allowlist，未知值不得靜默降為 R01。
- **REQ-002**: 主選單必須同時顯示三張可見路線卡；R03 可在本開發預覽直接遊玩，但卡片需標示正式解鎖需求「科技 8」尚未由 MetaProgress 實作。
- **REQ-003**: EV066–EV078 各宣告一次、全可達、只在 R03 排程且每局最多結算一次。
- **REQ-004**: R01 保持 `startsWithPrepStory=false`；R02／R03 為 true，避免 R01 EV041 被提前。
- **REQ-005**: Day 4 EV072 必須提供 CULTIVATE、FILTER、PURGE 三個不可逆分支；資源不足選項仍可見並列出原因，至少 CULTIVATE 永遠可選。
- **REQ-006**: 三分支必須立即改變不同車廂的設備、光色、動畫與 Day 5 操作；重載後仍可見。
- **REQ-007**: 既有 `plot-a`、`plot-b` 播種、灌溉、成長、收成必須在 R03 主流程中被使用，不得只作背景裝飾。
- **REQ-008**: R03 必須保存 `seedStock`、reservoir contamination、兩槽污染、隔離槽、循環板配置與每日唯一結算 ID。
- **REQ-009**: 四枚水樣的純淨／污染值必須由 `seed + R03 專用 stream + day` 產生，不得呼叫 `Math.random()` 或改變 R01／R02 既有 stream。
- **REQ-010**: 拖曳水樣與「先點水樣、再點節點」必須呼叫同一個 RunService command；每次成功移動都保存。
- **REQ-011**: 每日循環提交必須實際改變水、電量、作物灌溉、plot contamination、reservoir contamination 或感染，不得只播放動畫。
- **REQ-012**: 循環配置第一次錯誤不得扣資源或健康，必須揭露每枚污染水樣的形狀與文字；第二次起才套用已知代價。
- **REQ-013**: `MANUAL_DRAIN` 必須永遠可見，於第一次錯誤、資源不足或 no-countdown 模式可用；它以排空水樣、降低作物階段與壓力 +5 解除軟鎖。
- **REQ-014**: T008 必須要求玩家先檢查三個實體區域，再標記潛伏位置；舊式一鍵 `counterThreat` 不得解除。
- **REQ-015**: T008 第一次錯判只揭露非色彩線索且免傷；第二次錯判感染 +4、壓力 +3；手動封層為固定可見保底。
- **REQ-016**: T013 必須實際污染 reservoir／作物並改變感染；其解除使用循環檢疫板，不得只扣一般 hull damage。
- **REQ-017**: Day 7 必須依序完成 `GATE → CONTACT(T013, T008) → DECISION`，總操作時間上限 210 秒。
- **REQ-018**: EV078 四個最終操作必須同時可見；條件不足仍列出原因，`quarantine` 永遠可選。
- **REQ-019**: 四個結局為 `green-seedbank`、`green-symbiosis`、`green-firebreak`、`green-quarantine`，各自必須可由真實 UI 操作到達。
- **REQ-020**: finalDecision、endingId、endingReasons、路線獎勵與所有 settlement 必須各寫入一次；重載、連點或 pointer drop 後 synthetic click 不得重複結算。
- **REQ-021**: schema 1–4 舊存檔遷移至 schema 5 時必須保留 R01／R02 全資料；缺 routeId 的 legacy 才可補 R01。
- **REQ-022**: 未知 route 或未來 schema 必須拒絕 current 並嘗試 backup，禁止偷偷載成另一條路線。
- **REQ-023**: 正式圖像需由 runtime 真實載入；asset test 及瀏覽器需驗證 `naturalWidth > 0`。
- **REQ-024**: 390×844／100%、360×640／100% 與 360×640／140% 必須無水平溢位；enabled targets 至少 48×48 CSS px，中心 hit-test 命中自身。
- **REQ-025**: Cycle Board 與 T008 使用 Bottom Sheet；不得永久遮住三個實體目標或車廂主場景。
- **REQ-026**: reduced-motion 必須以靜態輪廓、紋理、文字與數值保留所有線索，不依賴流動、閃爍或顏色。
- **REQ-027**: R03 完整驗收不得取代 `audit:story`、`audit:frost` 或舊按鈕基準。
- **REQ-028**: 公開 repo 必須同步包含 R03 QA JSON、分支／小螢幕／威脅／四結局 PNG、至少三支完整 WebM 與 README 引用。
- **CON-001**: UI 只送出 intent；所有資源、污染、旗標、互動與結局由 RunService／story helper 修改。
- **CON-002**: 每屏最多一個 `#E2A85D` 暖金主 CTA。
- **CON-003**: 狀態不得只靠顏色；污染必須同時以濁度、紋理、輪廓或文字表示。
- **CON-004**: 分支與威脅 overlay 不得修改五張共用 carriage base art；以獨立 runtime layer 疊加。
- **GUD-001**: R03 敘事集中於資源循環、食物信任與生態污染，不重複 R01 的身分謎題或 R02 的熱力／照護主題。

## 4. Interfaces & Data Contracts

### 4.1 型別

```ts
export type StoryRouteId = "R01" | "R02" | "R03";
export type GreenBranch = "CULTIVATE" | "FILTER" | "PURGE";
export type GreenCycleZone = "INTAKE" | "FILTER" | "GROW_A" | "GROW_B" | "DRAIN";
export type GreenSampleId = "S1" | "S2" | "S3" | "S4";
export type GreenSampleQuality = "unknown" | "clean" | "tainted";
export type GreenFinaleStage = "inactive" | "gate" | "contact" | "decision" | "resolved";
export type GreenFinalDecision = "seedbank" | "symbiosis" | "firebreak" | "quarantine";
export type GreenEndingId =
  | "green-seedbank"
  | "green-symbiosis"
  | "green-firebreak"
  | "green-quarantine";
export type LurkerZone = "CANOPY" | "FILTER" | "UNDERBED";

export interface GreenSampleState {
  id: GreenSampleId;
  quality: GreenSampleQuality;
  revealed: boolean;
  zone: GreenCycleZone;
}

export interface GreenCycleState {
  samples: GreenSampleState[];
  selectedSampleId: GreenSampleId | null;
  committedDay: number | null;
  settlementIds: string[];
  revision: number;
  attempts: number;
  firstMissRevealed: boolean;
  manualDrainAvailable: boolean;
}

export interface GreenTideState {
  version: 1;
  branch: GreenBranch | null;
  finaleStage: GreenFinaleStage;
  seedStock: number;
  reservoirContamination: number;
  plotContamination: Record<"plot-a" | "plot-b", number>;
  isolatedPlots: Array<"plot-a" | "plot-b">;
  branchOperationComplete: boolean;
  sourceLocated: boolean;
  filterCalibrated: boolean;
  truthShared: boolean;
  finalDecision: GreenFinalDecision | null;
  endingId: GreenEndingId | null;
  endingReasons: string[];
  rewardSettled: boolean;
  cycle: GreenCycleState;
}
```

`StoryState.version` 升為 3，新增 `greenTide: GreenTideState | null`；`RunState.schemaVersion` 升為 5。

路線不變式：

| Route | whiteFrost | greenTide |
|---|---|---|
| R01 | null | null |
| R02 | non-null | null |
| R03 | null | non-null |

### 4.2 Runtime route policy

```ts
interface RouteRuntimePolicy {
  id: StoryRouteId;
  initialCarriageId: CarriageId;
  startsWithPrepStory: boolean;
  storyStateKey: "base" | "whiteFrost" | "greenTide";
  standardThreatIds: readonly string[];
  sceneArtKey: string;
  completionLedgerSource: string;
}
```

| Route | initialCarriage | startsWithPrepStory | threats |
|---|---|---:|---|
| R01 | greenhouse | false | T002, T003 |
| R02 | defense | true | T003 |
| R03 | greenhouse | true | T008, T013 |

事件合法性必須由 schedule 建立 `eventId → routeId` 索引，不再用字串區間二分。

### 4.3 循環命令

```ts
type GreenCycleCommand =
  | `cycle:inspect:${GreenSampleId}`
  | `cycle:select:${GreenSampleId}`
  | `cycle:move:${GreenSampleId}:${GreenCycleZone}`
  | `cycle:target:${GreenCycleZone}`
  | "cycle:commit"
  | "cycle:reset"
  | "cycle:manual-drain";
```

- S1–S4 每日由 `createRng(seed, "R03-cycle:D<day>")` 產生固定品質，起始於 INTAKE。
- `inspect` 揭露品質並保存，不移動水樣。
- `move` 與 `target` 共用同一驗證函式；`revision += 1`。
- `reset` 回到當日未結算的起始配置，不改品質、不重抽。
- `commit` 使用 `cycle:R03:D<day>:<branch-or-UNSET>` 作唯一 settlement。
- FILTER 中的污染水樣先消耗電量 1 再轉 clean；FILTER 分支每日第一枚免費。
- GROW_A／GROW_B 各最多接收兩枚；clean 會灌溉對應作物，tainted 會令 plot contamination +1、reservoir contamination +8。
- DRAIN 不灌溉、不加感染；PURGE 分支每排掉一枚 tainted 令 reservoir contamination -5。
- 未移出 INTAKE 或污染水直接進 GROW 時，第一次 commit 只揭露且不結算；第二次起感染 +2、reservoir contamination +5。
- `manual-drain` 把所有樣本移至 DRAIN、令兩槽成長階段各 -1、壓力 +5，並完成當日循環。

### 4.4 T008 interaction

```ts
type T008Command =
  | `lurker:inspect:${LurkerZone}`
  | `lurker:mark:${LurkerZone}`
  | "lurker:manual-seal";

interface T008InteractionState {
  kind: "T008";
  targetZone: LurkerZone;
  inspectedZones: LurkerZone[];
  attempts: number;
  firstMissRevealed: boolean;
  manualFallbackAvailable: boolean;
  resolvedBy?: "marked" | "manual-seal";
}
```

- target 由 `createRng(seed, "T008:<day>:<wave>")` 決定。
- 未 inspect 的區域不可 mark。
- 第一次錯判不扣狀態；揭露兩個候選區與根脈紋理。
- 第二次錯判：感染 +4、壓力 +3，仍可繼續。
- `manual-seal` 第一次錯判後、no-countdown 或沒有其他可行操作時啟用；代價為車體 -4、壓力 +5。
- timeout 視為一次錯判；no-countdown 時不自動 timeout。

### 4.5 T013 interaction

T013 使用當日 Cycle Board。兩枚污染水樣必須被 inspect 並送入 FILTER 或 DRAIN；舊式 counter 不得解除。

- 第一次錯誤：揭露污染樣本，無傷害。
- 第二次錯誤：reservoir contamination +15、感染 +4。
- timeout：reservoir contamination +12、兩槽 plot contamination 各 +1。
- `cycle:manual-drain` 為固定保底。

### 4.6 EV066–EV078

| ID | 日／階段 | 標題 | 主要操作與可見代價 | 保底／後果 |
|---|---|---|---|---|
| EV066 | D1 prep | 集水槽的綠膜 | 掃描（電 -2）／煮沸（水 +1、電 -1）／撇除綠膜（壓力 +2） | 撇除永遠可選；建立 cycle 水樣。 |
| EV067 | D1 aftermath | 第一批種子 | 播兩槽（seed -2）／播一留一（seed -1）／讓 A-07 選（信任 +2） | seed=0 時取得一枚應急種；至少一槽可見播種。 |
| EV068 | D2 travel | 污染水塔 | 過濾取水（電 -2、水 +2）／取樣（reservoir +12、水 +3）／略過（無） | 略過永遠可選；循環板顯示第一個 tainted 樣本。 |
| EV069 | D2 aftermath | 根系回聲 | 查上層／查下層／比對兩槽（電 -1） | 單槽檢查無資源成本；建立 T008 root hint。 |
| EV070 | D3 prep | 可疑收成 | 檢測（電 -1）／隔離一槽／提早收成（感染風險） | 隔離永遠可選；作物與污染狀態同屏。 |
| EV071 | D3 aftermath | 孢子雨 | 關閉進氣（睡眠 -5）／循環沖洗（水 -1）／承受薄霧（感染 +4） | 承受薄霧永遠可選；排入 T013 線索。 |
| EV072 | D4 route | 三條活體根脈 | CULTIVATE／FILTER（零件 -3、電 -2）／PURGE（食物 -2、作物階段下降） | CULTIVATE 永遠可選；分支立即改變 runtime overlay。 |
| EV073 | D5 prep | 嫁接環 | 擴冠（感染 +3、seed +2）／控制生長（無）／切除病葉（食物 -1） | CULTIVATE 專屬；控制生長永遠可選。 |
| EV074 | D5 prep | 多級濾芯塔 | 全濾（電 -3、contamination -20）／半濾（電 -1、-8）／手搖濾芯（壓力 +4、-5） | FILTER 專屬；手搖永遠可選。 |
| EV075 | D5 prep | 焚化導軌 | 焚污水（contamination -18、水 -1）／焚病株（crop reset、-25）／封存灰燼（壓力 +3、-5） | PURGE 專屬；封存永遠可選。 |
| EV076 | D6 prep | A-07 的發燒 | 用藥（藥 -1、感染 -10）／隔離病株／說明真相（信任 +4、壓力 +2） | 說明真相永遠可選；改變終局理由。 |
| EV077 | D7 travel | 封閉溫室站 | 開啟種庫閘（電 -2）／外部採樣（電 -1）／手動絞盤（車體 -4） | 手動絞盤永遠可選；進入 T013→T008 contact。 |
| EV078 | D7 aftermath | 取種或焚源 | 保存種庫／受控共生／燒毀斷路／感染隔離 | quarantine 永遠可選；其他保持可見並列缺少條件。 |

### 4.7 分支與四結局

| Branch | 永久車廂 | Runtime 可見層 | Day 5 | Day 7 優勢 |
|---|---|---|---|---|
| CULTIVATE | greenhouse | 嫁接環、琥珀生長燈、擴張冠層 | EV073 | 共生門檻降低；seed yield +1。 |
| FILTER | workshop | 多級濾芯塔、樣本抽屜、冷凝管 | EV074 | 每日首枚 tainted 免費淨化。 |
| PURGE | defense | 密封百葉、焚化導軌、焦黑切口 | EV075 | 排放 tainted 額外降 contamination。 |

| Ending | 必要條件 |
|---|---|
| green-seedbank | `seedStock >= 4`、至少一槽成熟且 plot contamination=0、reservoir contamination <=30。 |
| green-symbiosis | CULTIVATE、感染 20–69、至少一槽存活、`truthShared=true`。 |
| green-firebreak | PURGE 或 EV078 支付焚源成本；結算後 reservoir contamination <=20。 |
| green-quarantine | 永遠可選；封站、放棄種源並留下警示。 |

### 4.8 視覺與動態

沿用 UI 稿 token：

| Token | Hex | 用途 |
|---|---:|---|
| ink | `#090E12` | 全頁與窗外底色 |
| panel | `#192329` | HUD、卡片、Bottom Sheet |
| text | `#F5E8D8` | 標題與正文 |
| action | `#E2A85D` | 唯一主 CTA |
| living | `#7EA57A` | 培育、活體脈絡、成功 |
| danger | `#C2604E` | 污染、清除、倒數、錯誤 |

- Signature：活體根脈軌沿場景管線與 Cycle Board 生長，直接顯示污染流向與分支結果。
- 事件標題／結局使用 CJK 明體／襯線角色；控制與正文使用 CJK 黑體／無襯線；數值使用 tabular numbers。
- 360×640：Header 72、可玩場景至少 248、威脅列 48、Bottom Sheet 最多 246、下安全區 26 logical px。
- 動畫：分支根脈生長 420ms、T008 樣本脈衝 180ms、分支解決動畫 360ms；reduced-motion 使用靜態等價。
- GPT runtime 資產：
  - `carriage-greentide-gpt-v1.png`
  - `threat-t008-gpt-v1.png`
  - `greentide-branch-equipment-gpt-v1.png` 或可分層的等價三件資產

## 5. Acceptance Criteria

- **AC-001**: Given 主選單，When 玩家點 R03 卡與開始 CTA，Then `createRun(...,"R03")` 且首屏顯示 EV066，不會開成 R01/R02。
- **AC-002**: Given 任一分支，When 玩家完成七夜，Then EV066–EV078 的該分支路徑可達且只結算一次。
- **AC-003**: Given Day 4，When 選 CULTIVATE／FILTER／PURGE，Then 對應車廂、設備、色光、Day 5 事件與規則立即且永久改變。
- **AC-004**: Given 空水／空電／空零件，When 進入強制事件、Cycle Board、T008/T013 或終局，Then 至少一個可見保底操作可點。
- **AC-005**: Given 水樣，When 以拖曳或點按移動，Then state、revision、畫面與存檔結果相同。
- **AC-006**: Given T008 第一次錯判，When 重試，Then無數值傷害且出現非色彩線索；第二次才套用已知代價。
- **AC-007**: Given Day 7，When 完成 EV077、T013、T008、EV078，Then四個結局各可由至少一個 fixture／真實瀏覽器流程到達。
- **AC-008**: Given schema 1–4 save，When 載入，Then 保留 R01/R02 state 並升 schema 5；未知 route/schema 轉由 backup。
- **AC-009**: Given 360×640、140% 字級，When Cycle Board 或 T008 開啟，Then場景目標與主 CTA 均可見、可命中、無水平溢位。
- **AC-010**: Given三張 GPT 圖，When production build 與真實瀏覽器啟動，Then renderer 實際載入、`naturalWidth>0` 且畫面可見。
- **AC-011**: Given完整 QA，When執行既有與新 audit，Then R01、R02 固定 seed／事件／結局、按鈕數與媒體均不回歸。

## 6. Test Automation Strategy

- **Unit**: Vitest 測 events、route policy、cycle reducer、T008/T013、ending、save repair、idempotency。
- **Integration**: public RunService commands 驗證拖曳＝點按、資源不足不部分扣款、連點不重複。
- **Browser**: Playwright runner 驗證 CULTIVATE／FILTER／PURGE 七夜、四結局、reload checkpoints、no-countdown、reduced-motion。
- **Mobile**: 390×844 與 360×640（100%、140%），所有 enabled control 需 48×48、center hit-test、overflow 0。
- **Regression**:
  - `npm run check`
  - `npm run audit:buttons`
  - `npm run audit:story`
  - `npm run audit:frost`
  - `npm run audit:green`
- **Evidence**: `public/assets/qa/green-story-flow-report.json`、公開 PNG／WebM、精確 commit SHA、package version、dirty flag、browser errors 與 media metadata。

## 7. Rationale & Context

Claude Opus 的文字草案提供「淨化／共生／焚除」方向與潛伏者定位概念，但其新增三名乘客、未受 seed 控制的機率、非繁中文字及與現有資源不相容的欄位未採用。本規格把可用概念重構為 A-07、現有 CropPlot／ResourceState 與 seed stream 能資料化、可存檔、可回歸的版本。

獨立程式稽核指出 R01/R02 二分、schema 4 route fallback、T006 ID 衝突及第三張路線卡在 360×640 的遮擋是阻斷問題；因此 route policy、strict allowlist、T013 相容 ID與真實 mobile hit-test 是本規格的必要條件。

## 8. Dependencies & External Integrations

### Data Dependencies

- **DAT-001**: GDD v1.1 四路線、威脅與 UI 章節。
- **DAT-002**: `夜行列車_UI視覺稿_16張_v1.1.zip` 解壓施工規格。

### Technology Platform Dependencies

- **PLT-001**: TypeScript／Vite／Vitest 現有架構。
- **PLT-002**: Playwright／Chromium 真實瀏覽器證據。

### Third-Party Services

- **SVC-001**: GPT Image built-in generation，只用於製作本地 runtime PNG；遊戲本身不連線。

## 9. Examples & Edge Cases

```ts
// 未知 route 必須拒絕，不能降成 R01。
repairRun({ schemaVersion: 5, routeId: "R99" }); // throws

// 同日第二次提交不得重扣。
service.applyGreenCycleCommand(run, "cycle:commit");
service.applyGreenCycleCommand(run, "cycle:commit"); // duplicate, no delta

// 第一次把 tainted 樣本送進作物槽只揭露。
service.applyGreenCycleCommand(run, "cycle:move:S2:GROW_A");
service.applyGreenCycleCommand(run, "cycle:commit"); // reveal, no damage
```

Edge cases：

- 兩槽皆空、皆成熟、皆污染或一槽隔離。
- 水／電／零件／食物均 0。
- pointer drop 後同座標 click。
- T008／T013 互動中 reload。
- EV078 已選決定但結局畫面尚未 render 時 reload。
- schema 4 R02 正在 T009 first miss。
- service worker 保留舊 JS、IndexedDB 已升 schema 5 的版本不一致。

## 10. Validation Criteria

- Spec 中 REQ、AC、事件 ID、威脅 ID、結局 ID 均唯一且可由測試對應。
- R03 不會進入 R02 schedule、thermal、T009 或 frost ending。
- R01/R02 的 route policy、seed、事件內容與公開影片基準不變。
- 三分支的 scene screenshot 差異不能只來自文字。
- GPT PNG 實際被 renderer 載入；不接受「檔案存在但未使用」。
- 公開 QA 報告需從乾淨 commit 產出，且 source/public media hash 一致。

## 11. Related Specifications / Further Reading

- [R02 白霜線規格](./spec-design-white-frost-story-v1-0.md)
- [v0.9 灰霧故事規格](./spec-design-story-expansion-v0-9.md)
- [手機瀏覽器改造規格](./spec-design-mobile-browser-adaptation.md)
- [UI 視覺稿施工規格](../references/ui-mockups/UI_VISUAL_IMPLEMENTATION_SPEC_v1.1.md)
