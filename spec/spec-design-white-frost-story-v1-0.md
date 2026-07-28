---
title: R02 白霜線可玩故事與熱力分流規格
version: 1.0.0
date_created: 2026-07-28
last_updated: 2026-07-28
owner: Codex
tags: [design, game, story, mobile, white-frost, open-source]
---

# Introduction

本規格把 GDD v1.1 已定義的 R02「白霜線」施工為可選、可見、可操作、可存檔及可自動驗收的七夜路線。R02 不複製 R01 灰霧線；其核心是極低溫下的熱力分配、暖氣與燃料壓力，以及 A-07 對自身照護方式的選擇權。

## 1. Purpose & Scope

### 1.1 來源約束

- GDD 路線：`R02 白霜線`。
- 主視覺：雪原、結冰電線、冷白窗光；車廂內仍維持暖色安全感。
- 核心規則：外溫極低，暖氣、電量與燃料互相競爭。
- 主題：照護與犧牲。
- 核心問題：維持生命是否等於尊重選擇。
- 終局揭露：A-07 曾參與列車協定設計。
- 代表威脅：T003 攀附者、T009 暴風雪、凍結轉轍。
- 終局：雪崩隧道的 `WARM → BLIZZARD → CLEAR → ACCELERATE` 可玩流程。

### 1.2 範圍

- 新增可選宏觀路線 R02，並保留 R01 完整行為。
- 新增 EV053–EV065、T009、三個 Day 4 分支及四個 R02 結局。
- 新增六枚熱能單元的熱力分流板。
- 新增白霜車廂與暴風雪 GPT runtime 美術。
- 新增 schema 4 存檔遷移、自動化測試、手機瀏覽器通關、公開截圖與影片。

### 1.3 非目標

- 不新增可自由走動的第二個 2D／3D 場景。
- 不加入需要網路或 API key 的 runtime 服務。
- 不用長對話取代操作。
- 不在 iOS Safari／Android Chrome 人工 QA 前合併或標記 release-ready。

## 2. Definitions

| 名稱 | 定義 |
|---|---|
| R01 | 已存在的灰霧線。 |
| R02 | 本規格新增的白霜線。 |
| Thermal Board | 車廂場景內可收合的熱力分流板。 |
| Heat Token | 六枚可序列化的熱能單元 H1–H6。 |
| BERTH | 臥鋪保暖區。 |
| DEICER | 轉轍器／牽引除冰區。 |
| LOOP | 溫室與水循環區。 |
| CARE | Day 4 臥鋪照護分支。 |
| CLEAR | Day 4 除冰清障分支。 |
| SUSTAIN | Day 4 循環維生分支。 |
| T009 | GDD 定義的環境威脅「暴風雪」。 |

## 3. Requirements, Constraints & Guidelines

- **REQ-001**: `createRun` 必須接受 `R01` 或 `R02`，未傳值時維持 `R01`，且宏觀路線不得與每日 `RN01–RN03` 節點混用。
- **REQ-002**: R02 必須由玩家在可見路線卡選擇並以可見 CTA 開始；`routeId` 必須存檔。
- **REQ-003**: EV053–EV065 必須各宣告一次、可達且只在 R02 排程。
- **REQ-004**: EV057 必須提供 CARE、CLEAR、SUSTAIN 三個不可逆分支；至少 CARE 永遠可選，其他不可用選項仍須顯示缺少成本。
- **REQ-005**: 三分支必須立即改變不同車廂的可見設備、燈路或結霜圖層，並改變 Day 5 操作與 Day 7 門檻。
- **REQ-006**: 熱力板必須有 H1–H6 六枚單元；拖曳與「先點單元、再點區域」兩種輸入必須呼叫同一個 RunService 命令。
- **REQ-007**: 熱力板的目前配置、待選單元、最後提交日、結算 ID 及修改序號必須存檔；重載後不得重抽或重複結算。
- **REQ-008**: 每次熱力提交必須改變權威狀態，不得只顯示動畫。基礎成本為電量 2、燃料 1；分支修正及區域效果見 4.4。
- **REQ-009**: T009 必須以兩個由 seed 決定的活動霜區要求玩家先檢查線索，再重新配置熱能並確認；舊式一鍵反制不得解除。
- **REQ-010**: T009 第一次錯配不得扣資源或健康，必須揭露靜態文字／數字修正；若無法移動熱能，`MANUAL_SCRAPE` 必須以車體 -6、壓力 +6 的已知成本解除。
- **REQ-011**: T009 超時為環境失溫，不沿用一般敵人的直接破口：溫度 -6、睡眠 -10；若結算前溫度低於 5°C，再健康 -4。
- **REQ-012**: Day 7 必須依序完成 WARM、T009、CLEAR、ACCELERATE；總互動時間上限 210 秒。
- **REQ-013**: EV065 必須只寫入一次最終決定、一次 ending ID、一次路線獎勵；重載或重複點擊不得重複套用。
- **REQ-014**: R01 EV041–EV052、T004–T006、GO／DETOUR／STOP、結局解析及既有存檔資料不得改變。
- **REQ-015**: schema 1–3 存檔載入後必須升為 schema 4、缺少的 `routeId` 補 R01、`whiteFrost` 補 null，並保留資源、作物、擺設及 R01 故事。
- **REQ-016**: 所有正式美術必須本地載入；不得包含 runtime GPT API、密鑰或網路依賴。
- **REQ-017**: 390×844／100% 與 360×640／140% 必須無水平溢位；所有操作目標至少 48×48 CSS px，面板不得永久蓋住車廂。
- **REQ-018**: 公開專案必須包含 R02 三分支通關 QA JSON、至少兩支完整 WebM、白霜車廂／分支／T009／小螢幕／結局截圖及 README 引用。
- **REQ-019**: 開啟「無倒數」時，T002／T003 若沒有任何可負擔的正確反制，必須提供可見的「承受撞擊」；它套用同一套破口傷害並推進接觸或正確結束失敗局，不能讓玩家卡在夜間。
- **CON-001**: UI 只發送意圖；所有資源、旗標、互動進度及結局由 RunService／story service 修改。
- **CON-002**: 所有隨機目標使用 `seed + stream key`，不得使用 `Math.random()`。
- **CON-003**: 每畫面最多一個暖金主 CTA；危險、資訊及安全狀態沿用視覺稿色彩。
- **CON-004**: 熱力板是場景工具抽屜，不是全螢幕 modal。
- **GUD-001**: 可保留 Claude 初稿「紀錄」意象作 EV054 小型文本，但不得取代 GDD 的照護、低溫、共同署名及雪崩終局。

## 4. Interfaces & Data Contracts

### 4.1 型別

```ts
export type StoryRouteId = "R01" | "R02";
export type FrostBranch = "CARE" | "CLEAR" | "SUSTAIN";
export type FrostZone = "BERTH" | "DEICER" | "LOOP";
export type FrostSwitchMethod = "deicer" | "repair" | "ram" | "bypass";
export type FrostFinaleStage =
  | "inactive"
  | "warm"
  | "blizzard"
  | "clear"
  | "accelerate"
  | "resolved";
export type FrostConsent = "unknown" | "shared" | "protected" | "a07-plan";
export type FrostFinalDecision = "joint" | "shield" | "a07-plan" | "emergency-stop";
export type FrostEndingId =
  | "frost-shared-arrival"
  | "frost-guarded-arrival"
  | "frost-chosen-detour"
  | "frost-emergency-shelter";

export interface HeatTokenState {
  id: "H1" | "H2" | "H3" | "H4" | "H5" | "H6";
  zone: FrostZone;
}

export interface ThermalRoutingState {
  tokens: HeatTokenState[];
  selectedTokenId: HeatTokenState["id"] | null;
  committedAllocation: Record<FrostZone, number>;
  committedDay: number | null;
  settlementIds: string[];
  revision: number;
}

export interface WhiteFrostState {
  version: 1;
  branch: FrostBranch | null;
  finaleStage: FrostFinaleStage;
  consent: FrostConsent;
  heatMapQuality: "partial" | "full";
  switchCleared: boolean;
  switchMethod: FrostSwitchMethod | null;
  heaterPatched: boolean;
  coauthorEvidence: boolean;
  branchOperationComplete: boolean;
  delayedConsequenceSettled: boolean;
  finalDecision: FrostFinalDecision | null;
  endingId: FrostEndingId | null;
  endingReasons: string[];
  rewardSettled: boolean;
  thermal: ThermalRoutingState;
}
```

`StoryState` 升為 version 2，保留所有既有 R01 欄位並新增：

```ts
interface StoryState {
  version: 2;
  // all existing R01 fields remain unchanged
  whiteFrost: WhiteFrostState | null;
}
```

`RunState.schemaVersion` 升為 4；`routeId` 改為 `StoryRouteId`。

### 4.2 預設值

- H1、H2 → BERTH。
- H3、H4 → DEICER。
- H5、H6 → LOOP。
- `selectedTokenId=null`。
- `committedAllocation={BERTH:2,DEICER:2,LOOP:2}`。
- `committedDay=null`、`settlementIds=[]`、`revision=0`。
- R02 初始溫度 12°C、燃料 44、電量 78；R01 初始值維持不變。

### 4.3 熱力命令

```ts
type ThermalCommand =
  | `thermal:select:${HeatTokenId}`
  | `thermal:move:${HeatTokenId}:${FrostZone}`
  | `thermal:target:${FrostZone}`
  | "thermal:commit"
  | "thermal:reset";
```

- `select` 只改變 `selectedTokenId` 並保存。
- `move` 同時支援 pointer drag 落點；成功後 `revision += 1` 並保存。
- `target` 使用已選單元；無選擇時回傳可見錯誤。
- `commit` 驗證六枚單元唯一且三區總和為 6，再依日與 branch 產生唯一 settlement ID。
- `reset` 回到最後一次 `committedAllocation`，不得回到硬編碼預設。

### 4.4 每日熱力結算

每次提交基礎成本：電量 -2、燃料 -1。

| 區域 | 0 枚 | 1 枚 | 2 枚 | 3 枚以上 |
|---|---|---|---|---|
| BERTH | 溫度 -6、睡眠 -10、健康 -3 | 溫度 -3、睡眠 -5 | 無額外變化 | 溫度 +2、睡眠 +4 |
| DEICER | 下次路段燃料成本 +3、凍結風險 +2 | 下次路段燃料成本 +1、凍結風險 +1 | 無額外變化 | `switchCleared=true`、噪音 +4 |
| LOOP | 水 -2、兩作物 dryDays +1 | 水 -1、一作物 dryDays +1 | 無額外變化 | 水 +1、作物防凍，電量額外 -1 |

分支修正：

- CARE：BERTH 有效枚數 +1；Day 7 CLEAR 要求 DEICER 實際枚數至少 3；每日額外燃料 -1。
- CLEAR：DEICER 有效枚數 +1；Day 7 WARM 要求 BERTH 實際枚數至少 3；每日噪音 +6。
- SUSTAIN：LOOP 有效枚數 +1；作物不增加 dryDays；每次提交電量額外 -2。

若成本不足，提交按鈕保持可見但 disabled，列出所缺資源；玩家仍可重排。

### 4.5 T009 互動

```ts
interface T009InteractionState {
  kind: "T009";
  requiredZones: [FrostZone, FrostZone];
  inspectedZones: FrostZone[];
  attempts: number;
  firstMissRevealed: boolean;
  freeMissUsed: boolean;
  manualFallbackAvailable: boolean;
  resolvedBy?: "thermal" | "manual-scrape";
}

type T009Command =
  | `frost:inspect:${FrostZone}`
  | "frost:confirm"
  | "frost:manual-scrape";
```

- `requiredZones` 由 `createRng(seed, "t009:<day>:<wave>")` 產生兩個不同區域。
- 未檢查任何霜區時，確認為 invalid，不計 attempts。
- 完整熱像可先令 `firstMissRevealed=true`，但不得消耗免傷次數；線索揭露與 `freeMissUsed` 必須分開。
- 第一次錯配：accepted、未解除、不扣成本；`firstMissRevealed=true`,`freeMissUsed=true`，畫面顯示兩個必要區域的形狀與嚴重度數字。
- 第二次起錯配：溫度 -2、壓力 +2，仍可修正。
- 六枚單元合法且兩個必要區域各至少 2 枚時解除。
- `counterThreat` 遇到 T009 必須回傳 false 並顯示需使用熱力板。
- `MANUAL_SCRAPE` 永遠可見；只有無法滿足配置或第一次錯配後啟用，已知成本為車體 -6、壓力 +6。

### 4.6 事件表

`Δ` 以 `{resources; survivor; environment}` 表示。空集合為無直接數值改變。

| ID | 日／階段 | 標題 | 選項 | 可見成本與 Δ | 旗標／要求 | 延遲回收與可見結果 |
|---|---|---|---|---|---|---|
| EV053 | D1 prep | 霜封進氣口 | 完整熱像掃描 | 電量 -4；信任 +1 | `heatMapQuality=full`；電量≥4 | T009 起始即顯示嚴重度；六枚單元亮起。 |
|  |  |  | 先暖臥鋪 | 燃料 -1；睡眠 +4；溫度 +2 | `heatMapQuality=partial`；燃料≥1；H3 移至 BERTH | T009 首次需自行檢查；暖風先覆住床側。 |
|  |  |  | 讓 A-07 選初配 | 壓力 -2；信任 +3 | `consent=shared`；H4 移至 LOOP | Day 6 共控選項免前置；她把一枚熱源留給水循環。 |
| EV054 | D1 aftermath | 第一筆霜耗 | 接受系統紀錄 | 無 | `EV054-settled` | 顯示前一夜熱力 ledger，不再重複獎勵。 |
|  |  |  | 與 A-07 校對 | 電量 -1；信任 +2 | 電量≥1；`EV054-settled` | Day 3 爭議選項成本降低 1 電量。 |
| EV055 | D2 travel | 凍結轉轍 | 以 DEICER 融冰 | 電量 -2、燃料 -1 | DEICER≥2；`switchCleared=true` | Day 7 CLEAR 成本 -1 電量；藍白管路融開。 |
|  |  |  | 手動維修 | 零件 -2；壓力 +2 | 零件≥2；`switchCleared=true` | Day 5 操作多一個安靜選項；刮冰工具掛上工坊牆。 |
|  |  |  | 低速撞開 | 燃料 -3；車體 -8 | 燃料≥3；`switchMethod=ram`、`coldDebt += 1` | Day 6 後果追加車體 -2；畫面留下冰裂。 |
|  |  |  | 徒手扳開旁通閥 | 溫度 -3；睡眠 -6；壓力 +5 | 永遠可選；`switchMethod=bypass` | 無資源保底；Day 7 不取得融冰折扣。 |
| EV056 | D3 prep | 暖氣裂縫 | 詢問後修補 | 零件 -2；信任 +3 | 零件≥2；`heaterPatched=true` | 共同控制信任門檻降低 5。 |
|  |  |  | 遠端覆寫 | 電量 -3（已校對 -2）；信任 -4；溫度 +2 | 電量≥2；`heaterPatched=true` | 共同控制信任門檻提高 5。 |
|  |  |  | 暫時配給 | 溫度 -4；睡眠 -8 | 永遠可選；`coldDebt += 1` | EV062 依 coldDebt 結算健康損失。 |
| EV057 | D4 route | 三路熱流 | CARE 保溫繭 | 壓力 +5；每日燃料再 -1 | 永遠可選；`branch=CARE` | 臥室顯示琥珀保溫罩；D5→EV058；WARM +1、CLEAR 要 DEICER≥3。 |
|  |  |  | CLEAR 除冰架 | 零件 -3、電量 -3；噪音 +6 | 零件≥3、電量≥3；`branch=CLEAR` | 防禦／工坊顯示除冰轉子；D5→EV059；CLEAR +1、WARM 要 BERTH≥3。 |
|  |  |  | SUSTAIN 熱水環 | 零件 -2、水 -1、電量 -2 | 零件≥2、水≥1、電量≥2；`branch=SUSTAIN` | 溫室／廚房顯示發光管路；D5→EV060；LOOP +1、提交電量再 -2。 |
| EV058 | D5 prep | 保溫繭內 | 收緊保溫層 | 燃料 -1；睡眠 +10；信任 -1 | CARE、燃料≥1；`branchOperationComplete=true` | WARM 自動通過一級；A-07 說明「活著不是唯一條件」。 |
|  |  |  | 依她要求開窗 20 秒 | 溫度 -3；信任 +4；壓力 -3 | CARE；`branchOperationComplete=true` | EV061 共控門檻 -5 信任；保溫罩短暫打開。 |
| EV059 | D5 prep | 除冰轉子 | 高速試轉 | 電量 -3；噪音 +8 | CLEAR、電量≥3；`branchOperationComplete=true` | CLEAR 自動通過一級；轉子在窗外可見旋轉。 |
|  |  |  | 安靜刮冰 | 零件 -1；壓力 +3 | CLEAR、零件≥1、`switchMethod=repair`；`branchOperationComplete=true` | T009 第一次錯配仍免傷，且 manual scrape 車體成本降為 -4。 |
|  |  |  | 手搖低速試轉 | 溫度 -2；睡眠 -6；壓力 +5 | CLEAR；永遠可選 | 無資源保底；完成分支操作但保留標準刮冰成本。 |
| EV060 | D5 prep | 循環水溫 | 提高水環 | 電量 -4；水 +1 | SUSTAIN、電量≥4；`branchOperationComplete=true` | LOOP 防凍；成熟作物保留；發光液流進入兩個種植槽。 |
|  |  |  | 分熱給臥鋪 | 水 -1；溫度 +2；睡眠 +5；信任 +2 | SUSTAIN、水≥1；`branchOperationComplete=true` | WARM 所需 BERTH 枚數 -1；一段管路改接床側。 |
|  |  |  | 排空外環保住內管 | 溫度 -3；睡眠 -5；壓力 +4 | SUSTAIN；永遠可選 | 無資源保底；作物暫停一夜。 |
| EV061 | D6 prep | 共同署名 | 交還共同控制 | 信任 +5；電量 -1 | 電量≥1；`coauthorEvidence=true`,`consent=shared` | EV065 開放 joint；控制板出現 A-07 副簽。 |
|  |  |  | 只保留生命優先 | 健康 +3；信任 -2 | `coauthorEvidence=true`,`consent=protected` | EV065 開放 shield；她接受照護但拒絕全權覆寫。 |
|  |  |  | 依她的撤回方案 | 燃料 -1；信任 +2 | 燃料≥1；`coauthorEvidence=true`,`consent=a07-plan` | EV065 開放 a07-plan；終點座標增加避難岔線。 |
| EV062 | D6 aftermath | 第零條回收 | 套用已知後果 | `coldDebt` 每點：溫度 -1、健康 -1；最多 -3 | 一次性 `delayedConsequenceSettled=true` | 顯示逐項來源；不得在重載後再扣。 |
|  |  |  | 用剩餘熱量抵銷 | 電量 -3；清除最多 2 coldDebt | 電量≥3 | 顯示抵銷明細後一次結算。 |
| EV063 | D7 travel | 雪崩隧道入口 | 鎖定 WARM 配置 | 電量 -2、燃料 -1 | 已提交 D7 thermal；有效 BERTH 達 branch 門檻 | `finaleStage=blizzard`，建立 T009；保溫管路由場景狀態點亮。 |
|  |  |  | 返回熱力板 | 無 | 永遠可選 | 關閉事件卡並展開場景熱力工具，不推進終局。 |
|  |  |  | 封窗共用保溫毯 | 溫度 -4；睡眠 -8；壓力 +6 | 永遠可選 | 無資源保底；直接進入 BLIZZARD。 |
| EV064 | D7 travel | 清出轉轍 | 啟動除冰 | 電量 -3 | 有效 DEICER≥門檻、電量≥3 | `finaleStage=accelerate`；車窗外冰層剝落。 |
|  |  |  | 手動清障 | 零件 -2、車體 -4、壓力 +3 | 零件≥2 | `finaleStage=accelerate`；永不造成無解。 |
|  |  |  | 等暴風空檔 | 燃料 -2、溫度 -2 | 燃料≥2 | `finaleStage=accelerate`；保留零件但承受失溫。 |
|  |  |  | 躲入側線等冰裂 | 溫度 -4；睡眠 -8；壓力 +6 | 永遠可選 | 無資源保底；進入最後加速。 |
| EV065 | D7 decision | 加速與署名 | 共同加速 | 燃料 -3、電量 -2 | `consent=shared`、信任≥55 | `finalDecision=joint`,`endingId=frost-shared-arrival`；A-07 與 AI 共同署名。 |
|  |  |  | 封艙護送 | 燃料最多 -2（不足時耗盡現有燃料）；壓力 +4 | 永遠可選 | `finalDecision=shield`,`endingId=frost-guarded-arrival`；列車帶傷抵達。 |
|  |  |  | 走她的岔線 | 燃料 -2、車體 -2 | `consent=a07-plan`,`coauthorEvidence=true` | `finalDecision=a07-plan`,`endingId=frost-chosen-detour`；前往她設計的避難線。 |
|  |  |  | 緊急停入維修洞 | 車體 -6、健康 -2 | 永遠可選 | `finalDecision=emergency-stop`,`endingId=frost-emergency-shelter`；苦澀但非羞辱式保底。 |

### 4.7 分支可見契約

| 分支 | 車廂 | 必須可見的 runtime 層 | Day 5 操作 | Day 7 修正 |
|---|---|---|---|---|
| CARE | 臥室 | 琥珀保溫罩、床側粗管、呼吸凝霜減少 | EV058 | BERTH 有效 +1；CLEAR 要實際 DEICER≥3。 |
| CLEAR | 防禦／工坊 | 窗外除冰轉子、刮冰工具架、藍白警示燈 | EV059 | DEICER 有效 +1；WARM 要實際 BERTH≥3。 |
| SUSTAIN | 溫室／廚房 | 發光熱水環、種植槽霜線、爐側回流管 | EV060 | LOOP 有效 +1；作物防凍；提交電量再 -2。 |

## 5. Acceptance Criteria

- **AC-001**: Given 無存檔，When 玩家選白霜線並按開始，Then 建立 `routeId=R02`、schema 4、非 null whiteFrost，且畫面顯示雪原車廂。
- **AC-002**: Given R01 新局，When 完成既有 GO／DETOUR／STOP 流程，Then 事件、威脅、資源與結局與 v0.9 固定 fixture 相同。
- **AC-003**: Given 任一 EV053–EV065 選項，When 尚未確認，Then 直接成本、風險、需求及永久後果已可見。
- **AC-004**: Given EV057，When 選任一分支，Then 當下出現對應車廂層、Day 5 只出現對應事件、Day 7 門檻改變，重載後仍相同。
- **AC-005**: Given 熱力板，When 拖曳 H1 至 LOOP，Then權威 state、場景位置與存檔同步；重載後 H1 仍在 LOOP。
- **AC-006**: Given 已選 H2，When 點 BERTH，Then 與拖曳使用同一服務命令並產生相同 state。
- **AC-007**: Given 同日已提交 thermal settlement，When 重載再提交，Then 不重複扣資源或套用睡眠／作物效果。
- **AC-008**: Given T009 首次錯配，When 確認，Then不扣健康／資源、contact 保持 active、必要區域以文字、形狀及嚴重度數字揭露。
- **AC-009**: Given T009 無法合法配置，When 玩家用 MANUAL_SCRAPE，Then 可見成本結算一次並解除；legacy counter 仍不可用。
- **AC-010**: Given reduced-motion，When T009 發生，Then 不依賴流動、閃爍或顏色即可讀出兩個必要區域。
- **AC-011**: Given schema 3 R01 存檔，When 載入，Then schema 升 4 且原資源、作物、擺設、R01 story 與 active T004–T006 互動不遺失。
- **AC-012**: Given D7，When 完成 WARM、T009、CLEAR、ACCELERATE，Then只產生一個 R02 ending、一次 data 獎勵及一筆 settlement ledger。
- **AC-013**: Given 360×640／140%，When 完成 EV057、thermal board、T009、EV065，Then水平 overflow≤1px、所有 enabled 目標≥48×48、中心 hit-test 未被覆蓋。
- **AC-014**: Given 公開 clone，When 離線執行，Then R01/R02、GPT 圖、故事、存檔與所有按鈕可用，無外部 runtime 請求。
- **AC-015**: Given 三個分支固定 seed，When 各完成一局，Then CARE／CLEAR／SUSTAIN 的畫面、Day 5 操作、T009 配置及結局證據各自不同且可重現。
- **AC-016**: Given T003、燃料 0 且無可用誘餌，When 玩家點「承受撞擊」，Then 車體、睡眠與壓力依破口規則只結算一次，接觸立即前進；瀏覽器驗收不得以無界等待吞掉失敗。

## 6. Test Automation Strategy

- **Test Levels**: Vitest 單元／整合、Chromium Playwright 真實操作、靜態資產引用測試。
- **Unit**:
  - EV053–EV065 唯一性、所有 edge 可達、route 專屬排程。
  - thermal 六枚唯一、drag／tap 等價、每日 idempotency、三分支數值。
  - T009 seed、第一次錯配、第二次成本、manual fallback、legacy bypass。
  - schema 1–3 → 4 深合併；R01 fixture 不變。
- **Browser**:
  - CARE／CLEAR／SUSTAIN 三局，不得只抽兩局。
  - 真 pointer drag 與 tap-target 各一次。
  - 分支後、T009 第一次操作後、結局後三個 reload checkpoint。
  - 390×844／100% 與 360×640／140%。
  - 全按鈕流程必須以真實中心點擊覆蓋 56 個 controller actions；不得直接寫入 coverage set 代替點擊。
  - 所有 `data-action + data-value` 組合至少命中一次；console/page errors=0。
- **CI**: `npm run check` 保持快速 gate；browser audits 在 Draft PR 報告中另列實際執行證據，不得以 CI 綠燈取代。
- **Media**: QA JSON 必須含 `commitSha`、`appVersion`、viewport、branch、actionValues；WebM 必須以瀏覽器 metadata 或 ffprobe 驗證可播放、寬高與 duration>0。

## 7. Rationale & Context

白霜線採用熱力分流而不是新的文字選單，因為 GDD 把照護、燃料、外溫、種植及威脅設計成同一個系統。六枚單元讓「保護 A-07」、「清除鐵路」及「維持食水循環」在同一畫面形成有限資源取捨。三分支不只是不同結局文字，而是即時改變不同車廂、Day 5 操作與 Day 7 成功條件。

Claude Opus 5 的第一稿提出冰霜紀錄與程序選擇，但未遵循熱力板、T009、Day 4 三分支及資料契約，因此只保留 EV054 的紀錄意象。Grok CLI 實際呼叫時回覆 402 餘額耗盡，未形成有效審查；Codex 依 GDD、本地程式稽核及 QA 稽核完成最終規格。

## 8. Dependencies & External Integrations

### External Systems

- **EXT-001**: GitHub - 公開原始碼、Draft PR、CI 及最終 Pages 部署。

### Third-Party Services

- **SVC-001**: GPT Image - 只在製作階段產生本地圖像；遊戲 runtime 不呼叫服務。

### Infrastructure Dependencies

- **INF-001**: 現有 Vite／TypeScript／Canvas／IndexedDB 架構。

### Data Dependencies

- **DAT-001**: GDD v1.1 白霜線、T009、UI／場景分層規格。
- **DAT-002**: 16 張 UI 視覺稿的 360×640 logical 安全區與元件狀態。

### Technology Platform Dependencies

- **PLT-001**: 現代手機瀏覽器，包含 Pointer Events、Canvas、IndexedDB、CSS safe-area。

## 9. Examples & Edge Cases

```ts
// schema 3 R01 partial save
parseRun(oldSave) => {
  ...oldRun,
  schemaVersion: 4,
  routeId: "R01",
  story: { ...oldStory, version: 2, whiteFrost: null }
}

// T009 first miss
interactThreat(run, "frost:confirm") => {
  accepted: true,
  resolved: false,
  status: "incorrect",
  healthDelta: 0
}
```

Edge cases:

- 分支資源不足：CARE 仍可選，CLEAR／SUSTAIN 顯示缺少項目。
- 所有熱能集中一區：允許配置，但提交前顯示另外兩區已知後果。
- T009 進行中重載：保留 requiredZones、inspectedZones、attempts 及 thermal tokens。
- T009 無作物：LOOP 仍代表水循環，不會成為無效區域。
- Day 7 重載：由 finaleStage、active contact、settlementIds 恢復，不重建 T009 目標。
- 結局後再次點按：service 回傳已結算，不再改數值。

## 10. Validation Criteria

- `npm run check` 通過且既有 91 測試全部保留。
- 新增測試覆蓋 REQ-001–REQ-015。
- `npm run audit:buttons` 的 union 報告涵蓋所有 action/value。
- R01 GO／DETOUR／STOP 舊 story audit 全 PASS。
- R02 CARE／CLEAR／SUSTAIN 三局 story audit 全 PASS。
- runtime 實際引用兩張核准 GPT 圖；未使用候選圖不得進 `public`。
- 公開截圖、影片、QA JSON 與 README 引用存在且含 commit SHA／版本。
- Draft PR CI 成功；人工 iOS／Android QA 未完成前維持 Draft。

## 11. Related Specifications / Further Reading

- [v0.9 灰霧線故事規格](./spec-design-story-expansion-v0-9.md)
- [UI 視覺稿施工規格](../references/ui-mockups/UI_VISUAL_IMPLEMENTATION_SPEC_v1.1.md)
- [R02 白霜線施工計畫](../plan/feature-night-train-white-frost-v1-0.md)
