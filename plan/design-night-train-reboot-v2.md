---
goal: 將夜行列車重製為可照顧的移動避難所，完成統一美術、任務引擎、跨局成長與三條七夜內容
version: 2.0-design
date_created: 2026-10-02
last_updated: 2026-10-02
owner: 夜行列車專案
status: In progress
tags: [design, game, quests, art, migration, mobile]
---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In_progress-yellow)

本計畫依本機 v1.1 `codex/story-expansion-v110`／`231b122` 編寫。遠端 main 是 v0.8 `85f31ff`。v2.0核心已實作與自動化驗收；本表保留較完整的製作路線圖，真人盲測、實體手機效能、P2素材擴充與大型服務拆分仍待後續，不把這些標記已完成。實際檔案與數量見`docs/CODEX_RESPONSE_V2.md`。工作根目錄為 `C:/Users/digimkt/Desktop/遊戲/廣告遊戲專案`，下列所有程式路徑均相對於此目錄。具體設計見 `docs/reboot-v2/GAME_DESIGN.md`、`docs/reboot-v2/ART_DIRECTION.md`、`spec/reboot-v2/mission-catalog.json`。

## 1. Requirements & Constraints

- **REQ-001**: 保留手機直式9:16、五車廂、守護系統玩家視角、乘客A-07及三條七夜故事；新美術為原創手繪畫素插畫。
- **REQ-002**: 56項任務分成21主線、5教學、10關係、8設施、6探索、6挑戰，資料定義與引擎分離。
- **REQ-003**: 任務採 locked/available/active/completed/claimed/expired/retired/resolved-fallback；主線失敗不阻止下夜。
- **REQ-004**: 域事件只由成功的RunService操作或story里程產生；預覽、DOM點選、頁面進場不推進任務。
- **REQ-005**: 新增ProfileState儲存路線解鎖、藍圖、外觀、日誌、里程、永久領獎憑據；新局不複製上局生存資源。
- **REQ-006**: v5→v6遷移保留舊局與備份；發獎、任務進度、run/profile/ledger原子儲存並可重試。
- **REQ-007**: 新版正常車廂畫面≥60%可用高度；五廂改造與損壞都有獨立可見狀態。
- **REQ-008**: 12模組及8科技各有verified effect或明確disable，定義文字不能當運算證據。
- **REQ-009**: 現有熱力板、循環板、T004–T006/T008/T009/T013互動保留，不另寫任務系統覆蓋故事分支。
- **SEC-001**: 遊戲不含任何生成服務金鑰；企劃參考照片只留本機交付資料，不自動加入public。
- **CON-001**: 本階段不更換TypeScript/Vite、DOM/CSS/Canvas，不增加多人或3D引擎。
- **CON-002**: 既有本局資源與story branch仍由RunService／story.ts寫入；任務只寫quest state及獨立獎勵。
- **CON-003**: 本地開發與驗收完成前不發布；2026-10-02使用者已明確要求依企劃製作並完成開源更新；完成驗收後更新GitHub與既有Pages部署。
- **GUD-001**: 點物件→成本預覽→確認→效果回饋；拖曳均支援點選替代；中文採臺灣繁體。
- **PAT-001**: 純函式規則＋單一權威寫入＋固定seed＋事件去重＋可追溯ledger。

## 2. Implementation Steps

### Implementation Phase 0 — 基準與規格，2–3人日

- **GOAL-001**: 保留可重現v1.1內容，建立v2範圍與現況差異。完成標準：來源commit、模組實效、P0任務與資產清單可逐項追溯。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | 在本地v2開發分支以231b122為起點，核對`git log main..HEAD`；將`docs/reboot-v2/BASELINE_AUDIT.md`的v0.8/v1.1差異與部署未知狀態列入整合記錄。此操作不得切換或覆蓋使用者未提交檔案。 | 核心已完成 | 2026-10-02 |
| TASK-002 | 新增`spec/reboot-v2/effect-matrix.json`，逐筆列`content.ts`的12模組/8科技、services/view運算落點、測試名與可見狀態；E2/E3/D1、M007/M010/M011/M012缺口標needs-implementation。 | 實作已交付，部分範圍見追溯 | 2026-10-02 |
| TASK-003 | 將`mission-catalog.json`作為企劃來源；用`tools/validate-reboot-design.mjs`檢查56數量、ID、事件欄位、前置與期限，禁止從文字自動臆造runtime效果。 | 核心已完成 | 2026-10-02 |

### Implementation Phase 1 — 任務、Profile與遷移，8–12人日

- **GOAL-002**: 完成可持久儲存的任務狀態與單次獎勵，既有主線不改結果。完成標準：同一領獎重載/連點/寫入故障皆只獎勵一次；v5舊局可恢復。依賴GOAL-001。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-004 | 新增`src/game/quests/types.ts`，定義MissionDefinition、QuestInstance、ObjectiveProgress、DomainEvent、RewardReceipt；eventId=`runId:sequence`，儲存catalogVersion和lastConsumedSequence。lifecycle與result分欄；域事件有routeId/day/transactionId/type，去重鍵依catalog eventContract。 | 核心已完成 | 2026-10-02 |
| TASK-005 | 新增`src/game/quests/catalog.ts`先匯入R01前兩夜＋5教學的目錄資料，再新增`src/game/quests/engine.ts`純函式`issueForDay/evaluateEvent/expireAtAftermath/retireBranches/prepareClaim`；同run同eventId不重算，主線按路線及day獨立派發，prerequisites只用於支線且前置終態含expire/fallback。依賴TASK-004。 | 核心已完成 | 2026-10-02 |
| TASK-006 | 新增`src/game/profile.ts`，實作`createProfile/applyProfileReceipt/resolveRouteUnlocks`；`types.ts`加入ProfileState與runId，`model.ts:createRun`可讀起始藍圖但重設資源/科技/任務。本局未結束不得假寫完成里程。依賴TASK-004。 | 核心已完成 | 2026-10-02 |
| TASK-007 | `save.ts`新增v6 envelope與`migrateV5ToV6/commitEnvelope/recoverEnvelope`，新keys為`ntwp.v2.current/backup/profile-recovery`，保留舊`run.current/run.backup`；IndexedDB同transaction存run/profile/receipts，localStorage儲存整份envelope；不可兩份獨立storage寫操作冒稱原子。依賴TASK-005、TASK-006。 | 核心已完成 | 2026-10-02 |
| TASK-008 | 在`services.ts`成功commit路徑新增`emitDomainEvent`：buildModule/plantCrop/harvestCrop/collectWorkshopScrap/cookHotMeal/comfortPassenger/repairCarriage/chooseRoute/resolveEvent/finishNight；補上inspectObject的新權威讀取結果、setRation／toggleModule或configurePower的合法提交，以及counterThreat／interactThreat或resolveThreatInteraction的成功反制，對應inspect/power.configure/ration.configure/counter.deploy；未成功的工具選取與首錯不發成功事件；`continueAftermath`在day遞增前到期與結算、遞增後派發；禁止從資源差額推斷語意。依賴TASK-005。 | 核心已完成 | 2026-10-02 |
| TASK-009 | `story.ts`新增只讀`getMissionMilestones`適配器，把已有Day4/終局條件對映catalog里程；story branch為唯一權威，任務引用而不反寫。`app.ts`新增track/claim命令只呼叫RunService。依賴TASK-005、TASK-008。 | 核心已完成 | 2026-10-02 |

### Implementation Phase 2 — 前兩夜可玩驗證，8–12人日

- **GOAL-003**: R01前兩夜展示「點物件→改變環境→守夜→明日後果」。完成標準：自然開始不用注入checkpoint，主線任務可跟隨操作完成，首夜失敗可繼續。依賴GOAL-002。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-010 | 新增`src/ui/quest-view.ts`的`renderPinnedQuests/renderQuestJournal/renderObjectiveLocation`；`view.ts`每夜只顯示1主線＋2釘選；`app.ts`處理前往指定廂但不提交操作；抽屜關閉鍵常駐。依賴TASK-009。 | 實作已交付，部分範圍見追溯 | 2026-10-02 |
| TASK-011 | 新增`src/game/scene-manifest.ts`，以carriageId/layer/state/hitRegion定義五廂；runtime資產目錄`public/assets/art/v2`，資料與熱區不硬寫進圖片。`renderer.ts`先接五個P0場景與睡眠/破口/燈光狀態；來源在`docs/ASSET_MANIFEST.md`紀錄；EV042的extraBunk畫為折收舊架，保留邏輯旗標及原效果，故事與任務同步改成舊床位編號。 | 核心已完成 | 2026-10-02 |
| TASK-012 | 新增`src/ui/object-actions.ts`的`previewObjectAction/confirmObjectAction/cancelObjectAction`；沿用services合法性檢查及AP扣費，關窗或切廂取消預覽，UI不可快取已過期的成本結果。依賴TASK-011。 | 實作已交付，部分範圍見追溯 | 2026-10-02 |
| TASK-013 | 將`content.ts:BALANCE.nightSeconds`及`services.ts`夜間計時移到`src/game/balance.ts`，增加warning/recovery視窗；`app.ts`visibilitychange自動暫停，暫停不推進RNG或領域事件；無倒數用確認推進階段。依賴TASK-008。 | 核心已完成 | 2026-10-02 |
| TASK-014 | `view.ts`的R01前兩夜與5教學任務共同消費成功操作事件；按GDD首15分鐘流程，以自然新局錄製並記錄卡住點；先驗收任務與互動，再凍結五廂完整美術方向。依賴TASK-010至TASK-013。 | 核心已完成 | 2026-10-02 |

### Implementation Phase 3 — 生產、建造、探索，10–16人日

- **GOAL-004**: 五廂有可靠機能成長與有風險的補給決策。完成標準：每個功能有成本/成效/狀態，三路段各有可衡量取捨。依賴GOAL-003。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-015 | 新增`src/game/module-effects.ts`集中`computePowerCapacity/computeRegen/computeRepair/computeRain/computeArmor/resolveTrap`；E2/E3/D1、M007/M010/M011/M012按effect-matrix落地，服務只呼叫純函式；不可只改描述。 | 核心已完成 | 2026-10-02 |
| TASK-016 | 新增`src/game/facility-slots.ts`把buildModule虛擬slot改成帶carriageId/capacity/compatibility的真實機能槽；外觀DECORATION_SLOTS沿用但不衝突。v5既有模組對映合法槽或放可恢復倉庫，不刪除。 | 核心已完成 | 2026-10-02 |
| TASK-017 | 新增`src/game/expeditions/{content,engine}.ts`的`createExpedition/chooseExpeditionStep/withdrawExpedition`，每天最多1次、3節點、固定seed獨立stream與expeditionId；`services.ts`一次提交成本/回報，發expedition.resolved。加入6探索任務。 | 核心已完成 | 2026-10-02 |
| TASK-018 | `content.ts:ROUTE_NODES`拆至`src/game/routes/daily.ts`，保留RN01–03 id，明確fuel/noise/threat/loot取捨；`view.ts`同步顯示成本與任務關聯。跳過探索不阻斷主線；欠缺物資有代價保底。依賴TASK-017。 | 核心已完成 | 2026-10-02 |
| TASK-019 | 接8設施任務與4組互斥改裝，只有`facility.upgraded`成功事件鎖分支；失敗／預覽不鎖；任務accept不扣AP。scene manifest對應各upgrade/repair/damage狀態。依賴TASK-015、TASK-016。 | 核心已完成 | 2026-10-02 |

### Implementation Phase 4 — 三線七夜與關係，12–18人日

- **GOAL-005**: 所有路線有七夜任務、永久分支、終局與關係回應。完成標準：21主線可自然到達；56條全部有可執行路徑、失敗結果與獎勵憑據。依賴GOAL-004。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-020 | 擴充`src/game/quests/catalog.ts`由P0子集匯入完整凍結catalog，關聯21主線的story milestones與原事件；逐項run確認無重複發劇情資源、沒有主線要求optional探索鑰匙。 | 核心已完成 | 2026-10-02 |
| TASK-021 | 新增`src/game/relationships.ts`的`resolveRelationshipChoice/getRelationshipResponse`，接A-07／老許各5任務；不替A07Consent作推定同意，前節點失敗由明確fallback開放後續，回覆依歷史結果變化。依賴TASK-020。 | 核心已完成 | 2026-10-02 |
| TASK-022 | 在`renderer.ts`與scene manifest接R01/R02/R03第4夜三分支的第5夜裝置；繪製同構圖before/after，核對story branch、裝置與結局實際條件一致；八類威脅契約全部完成。依賴TASK-020。 | 核心已完成 | 2026-10-02 |
| TASK-023 | 新增`src/game/challenges.ts`的`evaluateRunChallenge`從不可重複領域事件與run結局評估6挑戰，登記Profile獎項；非可及性難度切換以catalog資格判定，不因文字放大/無倒數取消普通旅程結果。依賴TASK-020、TASK-021。 | 核心已完成 | 2026-10-02 |
| TASK-024 | 從`services.ts`提取production/day-cycle/encounters服務模組，`content.ts`拆route-story content，`view.ts`拆專屬熱力/循環/任務面板；每次分拆維持既有189測試與新任務測試綠，不重構同時改規則。依賴TASK-022、TASK-023。 | 未執行 | — |

### Implementation Phase 5 — 平衡、美術與交付驗收，15–24人日

- **GOAL-006**: 自然遊玩、手機操控、真動畫、存檔與更新都達標。完成標準：有實際證據才標完成；無素材或裝置證據列缺件，不以自動測試替代。依賴GOAL-005。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-025 | `tools/simulate-balance.mjs`執行30固定seed×3策略×3路線，輸出每晚資源與損失分佈；記錄種子和策略，調整`balance.ts`；再用自然遊玩確認至少各有優勢，未實測值標target。 | 核心已完成 | 2026-10-02 |
| TASK-026 | 美術按ART_DIRECTION P1/P2批次交付，全部分層圖和真姿勢動畫寫manifest；驗證8威脅對映、物件狀態、熱區、64px角色辨識與三檢視。尚未生成資源在缺件表保留，不宣稱已完成。 | 實作已交付，部分範圍見追溯 | 2026-10-02 |
| TASK-027 | 新增`tools/audit-v2.mjs`實跑5視口×3文字比例，覆蓋tap/drag/pause/隱藏頁面/無倒數/重載/三線分支；自然新局完整7夜至少各路線1次，checkpoint錄影明確標註。依賴TASK-025、TASK-026。 | 實作已交付，部分範圍見追溯 | 2026-10-02 |
| TASK-028 | `tools/profile-v2.mjs`以具名裝置三跑中位測p95≤18ms；低效能僅降粒子/解析度/幀率，真姿勢幀與命中幀保留。對新檔案及生成資產做秘密/授權/來源掃描。 | 實作已交付，部分範圍見追溯 | 2026-10-02 |
| TASK-029 | `public/sw.js`按versioned manifest原子切換新cache，模擬舊頁面＋新版資產與離線更新；舊v5備份仍能恢復；`package.json`版本2.0.0僅在驗收後修改，不把design版本當已釋出版本。 | 核心已完成 | 2026-10-02 |
| TASK-030 | 寫`docs/evidence/v2/ACCEPTANCE.md`彙總每項證據、未解風險、5位真人首夜觀察；local commit後核對main整合差異，釋出操作按使用者後續指令另行執行。依賴TASK-027至TASK-029。 | 實作已交付，部分範圍見追溯 | 2026-10-02 |

上述階段估算相加為55–85人日。單一全職開發者配穩定美術供給約12–18週；沒有可用產能與實測前不承諾日曆交付。

## 3. Alternatives

- **ALT-001**: 3D自由漫遊重寫會拉高素材、觸控與效能成本，也遠離固定室內參考；本版保留2D。
- **ALT-002**: 全新故事替換三線會丟失現有可玩分支；採任務適配與補內容。
- **ALT-003**: 任務在UI檢測按鈕可快速展示進度，但無法防重與儲存；採成功領域事件。
- **ALT-004**: 全圖僅更換背景無法支援修補與改造；採狀態分層圖與真實動畫。

## 4. Dependencies

- **DEP-001**: v1.1分支、現有npm lock和189回歸測試；不可用main v0.8誤算已有內容。
- **DEP-002**: P0五廂場景與主乘客姿勢資源，清單見ART_DIRECTION；素材不足時不開放未完成視覺狀態。
- **DEP-003**: 瀏覽器IndexedDB事務／localStorage envelope，以及舊v5存檔fixture。
- **DEP-004**: 五位首次試玩者、至少一臺具名手機與一臺桌機；可及性與效能真人實證不由模擬替代。

## 5. Files

- **FILE-001**: `src/game/quests/{types,definitions,engine}.ts`、`spec/reboot-v2/mission-catalog.json`，任務契約與內容。
- **FILE-002**: `src/game/{types,model,services,story,save}.ts`、`src/game/profile.ts`，權威狀態、遷移與接線。
- **FILE-003**: `src/game/{balance,module-effects,facility-slots,scene-manifest,relationships,challenges}.ts`、`routes/daily.ts`，玩法與資產規則。
- **FILE-004**: `src/game/expeditions/{content,engine}.ts`，停站探索。
- **FILE-005**: `src/ui/{view,quest-view,object-actions}.ts`、`src/app.ts`、`src/styles/*.css`，可見操作與可及性。
- **FILE-006**: `public/assets/art/v2/`、`docs/ASSET_MANIFEST.md`、`public/sw.js`，圖層、來源與版本更新。
- **FILE-007**: `tests/{quests,profile,migration,effects,expeditions}.test.ts`、`tools/{validate-mission-catalog,simulate-balance,audit-v2,profile-v2}.mjs`，新系統驗證。

## 6. Testing

- **TEST-001**: `npm run check`維持189既有測試；完成新功能後按新增斷言更新真實數量，不能只引用舊baseline。
- **TEST-002**: 任務catalog56個ID與分類計數、域事件match欄位、前置無環／可達、互斥無主線死鎖。
- **TEST-003**: 同eventId重播、快速claim兩次、寫入拋錯、舊備份恢復；每發獎鍵只能一個receipt且run/Profile一致。
- **TEST-004**: v5三route匯入，unknown schema拒寫、破current讀backup、v2不覆蓋唯一舊局、舊獎勵不憑空追發。
- **TEST-005**: 模組／科技逐項fixture證實效果，零件不足和取消預覽不扣AP，失誤後保底可操作。
- **TEST-006**: 5視口×3字級實點、拖曳/點選替代、關sheet、background pause、無倒數、主線結局。
- **TEST-007**: 同構圖車廂state-to-art、至少真實姿勢變化、攻擊命中幀傷害，低模式真幀保留。
- **TEST-008**: 三跑效能中位、具名裝置、自然七夜流程與5位首夜真人觀察；報告中分別標實測與待驗目標。

## 7. Risks & Assumptions

- **RISK-001**: main與v1.1不同；若錯誤基於main開發會重複新增故事並丟失特殊互動。TASK-001先鎖定。
- **RISK-002**: 任務／Profile拆分可能造成重複獎或只存半份；TASK-007採用同envelope事務。
- **RISK-003**: 高精細插畫與56任務可能擴大範圍；先GOAL-003前兩夜驗證，未通過不量產。
- **RISK-004**: 延長夜間可能變成等待；保持90–150秒目標有觀測／決策／恢復，試玩不達標就縮短。
- **RISK-005**: 升級造成通用最優解；TASK-025測同預算策略與副作用，不把高存活率唯一當質量。
- **ASSUMPTION-001**: 本次要求是完整重新規劃；不以製作閱讀頁或檔案異動冒稱runtime重製完成。
- **ASSUMPTION-002**: 使用者接受延續現有原創名稱與三主線；新增老許等人物都是提案，不改原作事實。
- **ASSUMPTION-003**: 一位全職開發者有穩定2D美術供給；55–85人日是工作量參考，非成本／工期承諾。

## 8. Related Specifications / Further Reading

- [完整企劃](../docs/reboot-v2/GAME_DESIGN.md)
- [美術規格](../docs/reboot-v2/ART_DIRECTION.md)
- [任務目錄](../spec/reboot-v2/mission-catalog.json)
- [現況盤點](../docs/reboot-v2/BASELINE_AUDIT.md)
- [原專案](https://github.com/mars-tw/night-train-watch-protocol)

## v2.0 實作追溯

核心任務目錄直接由`quests/catalog.ts`匯入JSON，介面在`ui/view.ts`、成本預覽控制在`app.ts`；功能純函式分到`voyage/engine.ts`、`module-effects.ts`、`facility-slots.ts`，領域事件接線在`v2-observer.ts`。這些是已交付的對應實現，不重建同義檔案。

模組實效有support表與整合測試，未另產effect-matrix.json；UI功能已實作但尚未完全拆成原提案的多個小檔。美術使用12真來源的5底圖及202姿勢／設備格，並非349格上限全數量產。23檔288測試、三線自然七夜、15版面矩陣及離線實測均有證據；實體手機與5位真人盲測尚未進行。TASK-024大型重構與P2擴充保留待後續，不影響本次七夜核心更新。

發布結果：見[更新總驗收](../docs/CODEX_RESPONSE_V2.md)。
