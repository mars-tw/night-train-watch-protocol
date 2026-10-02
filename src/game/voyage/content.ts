import type { ResourceState, StoryRouteId } from "../types";
import type {
  ExpeditionSiteId,
  FacilityBranchGroup,
  RelationshipNpcId,
  RelationshipResult,
} from "./types";

export interface ExpeditionDefinition {
  id: ExpeditionSiteId;
  missionId: string;
  routeId: StoryRouteId;
  title: string;
  description: string;
  discoveryId: string;
  dayMin: number;
  dayMax: number;
  necessaryTool: string;
  toolDefinitionId?: string;
  observationLoot: Partial<ResourceState>;
  toolLoot: Partial<ResourceState>;
  improvisedLoot: Partial<ResourceState>;
  deepLoot: Partial<ResourceState>;
  deepRisk: { hull: number; noise: number; stress: number; threshold: number };
}

export const EXPEDITIONS: readonly ExpeditionDefinition[] = [
  {
    id: "fog-relay",
    missionId: "EXP-R01-01",
    routeId: "R01",
    title: "中繼台的舊錄音",
    description: "比較中繼台原聲與列車樣本，來源線索不是主線唯一鑰匙。",
    discoveryId: "signal-origin",
    dayMin: 2,
    dayMax: 5,
    necessaryTool: "感測器網",
    toolDefinitionId: "M004",
    observationLoot: { data: 1 },
    toolLoot: { data: 1, parts: 1 },
    improvisedLoot: { data: 1 },
    deepLoot: { data: 2, parts: 1 },
    deepRisk: { hull: -5, noise: 8, stress: 3, threshold: 0.42 },
  },
  {
    id: "fog-service-siding",
    missionId: "EXP-R01-02",
    routeId: "R01",
    title: "側線留下的工牌",
    description: "核對工牌與名冊，不把未知姓名自動填成作者。",
    discoveryId: "badge-comparison",
    dayMin: 3,
    dayMax: 6,
    necessaryTool: "工作台",
    toolDefinitionId: "M009",
    observationLoot: { parts: 1 },
    toolLoot: { data: 1, parts: 1 },
    improvisedLoot: { parts: 1 },
    deepLoot: { data: 1, medicine: 1 },
    deepRisk: { hull: -6, noise: 9, stress: 4, threshold: 0.48 },
  },
  {
    id: "frost-weather-tower",
    missionId: "EXP-R02-01",
    routeId: "R02",
    title: "氣象塔的熱圖",
    description: "取得實測熱圖片段；略過時仍能使用主線備援。",
    discoveryId: "heat-map-fragment",
    dayMin: 2,
    dayMax: 5,
    necessaryTool: "電熱暖氣",
    toolDefinitionId: "M002",
    observationLoot: { data: 1 },
    toolLoot: { data: 2 },
    improvisedLoot: { data: 1 },
    deepLoot: { data: 2, parts: 1 },
    deepRisk: { hull: -4, noise: 7, stress: 5, threshold: 0.46 },
  },
  {
    id: "frost-maintenance-hut",
    missionId: "EXP-R02-02",
    routeId: "R02",
    title: "雪下的維修屋",
    description: "查看道岔紀錄，線索不會直接免除末夜暴風雪。",
    discoveryId: "shelter-route",
    dayMin: 3,
    dayMax: 6,
    necessaryTool: "工作台",
    toolDefinitionId: "M009",
    observationLoot: { parts: 1 },
    toolLoot: { parts: 2 },
    improvisedLoot: { parts: 1 },
    deepLoot: { fuel: 2, parts: 1 },
    deepRisk: { hull: -7, noise: 6, stress: 4, threshold: 0.5 },
  },
  {
    id: "green-river-intake",
    missionId: "EXP-R03-01",
    routeId: "R03",
    title: "河道的第二份水樣",
    description: "取得車外對照樣本，保留來源證據程度。",
    discoveryId: "external-water-sample",
    dayMin: 2,
    dayMax: 5,
    necessaryTool: "醫療櫃",
    toolDefinitionId: "M005",
    observationLoot: { water: 1 },
    toolLoot: { data: 1, water: 1 },
    improvisedLoot: { data: 1 },
    deepLoot: { water: 2, medicine: 1 },
    deepRisk: { hull: -4, noise: 8, stress: 3, threshold: 0.52 },
  },
  {
    id: "green-seed-relay",
    missionId: "EXP-R03-02",
    routeId: "R03",
    title: "封存種庫的索引",
    description: "取得封存索引；仍須符合原終局操作條件。",
    discoveryId: "seedbank-index",
    dayMin: 3,
    dayMax: 6,
    necessaryTool: "垂直種植架",
    toolDefinitionId: "M003",
    observationLoot: { food: 1 },
    toolLoot: { data: 1, food: 1 },
    improvisedLoot: { data: 1 },
    deepLoot: { food: 2, data: 1 },
    deepRisk: { hull: -5, noise: 10, stress: 4, threshold: 0.5 },
  },
] as const;

export interface RelationshipChoiceDefinition {
  id: string;
  label: string;
  description: string;
  requires?: { resource?: Partial<ResourceState>; flag?: string; minimumTrust?: number };
  cost?: Partial<ResourceState>;
  resourceDelta?: Partial<ResourceState>;
  trustDelta?: number;
  stressDelta?: number;
  result: RelationshipResult;
  journalText: string;
}

export interface RelationshipDefinition {
  missionId: string;
  npcId: RelationshipNpcId;
  stepId: string;
  title: string;
  prompt: string;
  day: number;
  priorMissionId?: string;
  choices: readonly RelationshipChoiceDefinition[];
}

export const RELATIONSHIPS: readonly RelationshipDefinition[] = [
  {
    missionId: "REL-A07-01", npcId: "A-07", stepId: "preferences", day: 2,
    title: "先問她今晚需要什麼", prompt: "A-07 指了指床頭燈，又看向暖氣出風口。",
    choices: [
      { id: "ask-details", label: "逐項詢問", description: "記下燈光、聲音與溫度偏好。", trustDelta: 2, result: "success", journalText: "A-07 的偏好已被逐項記錄。" },
      { id: "offer-quiet", label: "先提供安靜", description: "先降低刺激，偏好仍待確認。", stressDelta: -3, result: "partial", journalText: "先替車廂降噪，仍保留詢問空間。" },
      { id: "defer", label: "說明稍後再問", description: "不替她預設答案。", result: "declined", journalText: "守護系統沒有把沉默記成同意。" },
    ],
  },
  {
    missionId: "REL-A07-02", npcId: "A-07", stepId: "familiar-drink", day: 3, priorMissionId: "REL-A07-01",
    title: "一杯熟悉的味道", prompt: "她記得某種溫熱的香味，但食水不算充裕。",
    choices: [
      { id: "prepare", label: "準備熱飲", description: "使用一份水，給她一段熟悉的休息。", requires: { resource: { water: 1 } }, cost: { water: -1 }, trustDelta: 2, stressDelta: -4, result: "success", journalText: "熱飲的味道讓她想起仍能說出口的片段。" },
      { id: "explain", label: "坦白物資限制", description: "不消耗物資，誠實說明取捨。", trustDelta: 1, result: "partial", journalText: "限制被說清楚，沒有用空杯假裝照護。" },
      { id: "change-subject", label: "暫不談這件事", description: "保留沉默，不偽稱完成。", result: "declined", journalText: "這次沒有準備飲品，也沒有編造理由。" },
    ],
  },
  {
    missionId: "REL-A07-03", npcId: "A-07", stepId: "branch-consultation", day: 4, priorMissionId: "REL-A07-02",
    title: "讓她知道會改什麼", prompt: "永久改裝即將確認，但原主線分支仍由玩家另行決定。",
    choices: [
      { id: "show-tradeoffs", label: "列出已知代價", description: "只說目前確定的代價。", trustDelta: 2, result: "success", journalText: "A-07 聽過改裝代價；這不等於她同意任何主線分支。" },
      { id: "summary", label: "簡短說明", description: "交代方向，保留未確認細節。", trustDelta: 1, result: "partial", journalText: "她知道大方向，但沒有被代替作答。" },
      { id: "withhold", label: "暫不揭露", description: "記錄守護系統選擇保留資訊。", trustDelta: -1, result: "declined", journalText: "資訊被保留；主線同意狀態未改變。" },
    ],
  },
  {
    missionId: "REL-A07-04", npcId: "A-07", stepId: "truth-discussion", day: 5, priorMissionId: "REL-A07-03",
    title: "缺頁該怎麼說", prompt: "她問起名冊缺頁。沒有證據時不能說已查清。",
    choices: [
      { id: "share-verified", label: "只說已證實部分", description: "需要任一名冊或身分證據旗標。", requires: { flag: "roster-evidence" }, trustDelta: 2, result: "success", journalText: "已證實與仍未知的部分被分開說明。" },
      { id: "admit-unknown", label: "承認仍不知道", description: "不需要證據，也不編造結論。", trustDelta: 1, result: "partial", journalText: "未知被原樣保留。" },
      { id: "postpone", label: "請她稍後再問", description: "問題未解決，保留到後續。", result: "declined", journalText: "名冊疑問仍未解決。" },
    ],
  },
  {
    missionId: "REL-A07-05", npcId: "A-07", stepId: "final-consent", day: 6, priorMissionId: "REL-A07-04",
    title: "把最後選擇交還", prompt: "可以詢問她的意願，但本關係命令不產生原主線同意。",
    choices: [
      { id: "ask-openly", label: "詢問她想怎麼選", description: "記下意願，仍由原主線驗證同意。", trustDelta: 2, result: "success", journalText: "她的意願被記下；story consent 維持原值。" },
      { id: "offer-options", label: "列出可行方案", description: "說明方案，不要求立刻回答。", trustDelta: 1, result: "partial", journalText: "方案已共享，沒有把保留意見改寫成同意。" },
      { id: "decide-alone", label: "由守護系統自行規劃", description: "保留她不同意的可能。", trustDelta: -2, result: "declined", journalText: "守護系統選擇自行規劃；原主線條件沒有被繞過。" },
    ],
  },
  {
    missionId: "REL-XU-01", npcId: "xu", stepId: "first-call", day: 2,
    title: "雜訊裡的老許", prompt: "電台裡傳來自稱無線電工程師老許的聲音。",
    choices: [
      { id: "answer", label: "回覆呼號", description: "建立完整通話紀錄。", resourceDelta: { data: 1 }, result: "success", journalText: "老許的呼號與時間戳已記錄。" },
      { id: "record", label: "只錄下訊號", description: "不宣稱雙方已交談。", result: "partial", journalText: "留下署名錄音，沒有假稱已接通。" },
      { id: "silence", label: "保持靜默", description: "保存接收紀錄，拒絕回覆。", result: "declined", journalText: "這次沒有回覆老許。" },
    ],
  },
  {
    missionId: "REL-XU-02", npcId: "xu", stepId: "radio-calibration", day: 3, priorMissionId: "REL-XU-01",
    title: "工程師的舊刻度", prompt: "可比對電台刻度；若前夜未接通，就以署名錄音作前情。",
    choices: [
      { id: "calibrate", label: "共同校正", description: "耗一份電量完成清晰刻度。", requires: { resource: { energy: 1 } }, cost: { energy: -1 }, resourceDelta: { data: 1 }, result: "success", journalText: "刻度校正完成，聲音變得可辨識。" },
      { id: "compare-recording", label: "比對署名錄音", description: "取得局部刻度，不假稱通話。", result: "partial", journalText: "只從錄音取得局部刻度。" },
      { id: "skip", label: "略過校正", description: "保留原始雜訊。", result: "declined", journalText: "電台維持原刻度。" },
    ],
  },
  {
    missionId: "REL-XU-03", npcId: "xu", stepId: "relay-advice", day: 4, priorMissionId: "REL-XU-02",
    title: "訊號和人該先救誰", prompt: "老許提出中繼站與求救訊號的取捨，但不替玩家選路。",
    choices: [
      { id: "short-stop", label: "答應只短停", description: "記錄風險，路線仍待原操作確認。", result: "success", journalText: "短停意向已記錄，沒有自動選路。" },
      { id: "log-only", label: "只記錄座標", description: "保留救援資訊但不承諾停車。", resourceDelta: { data: 1 }, result: "partial", journalText: "求救座標被保存。" },
      { id: "keep-course", label: "維持行程", description: "明示不改道。", result: "declined", journalText: "守護系統決定維持行程。" },
    ],
  },
  {
    missionId: "REL-XU-04", npcId: "xu", stepId: "unfinished-name", day: 5, priorMissionId: "REL-XU-03",
    title: "他沒說完的名字", prompt: "可追問各路線異常，但資訊只標示已知部分。",
    choices: [
      { id: "cross-check", label: "交叉核對現有證據", description: "有探索證據時取得完整證詞。", requires: { flag: "expedition-evidence" }, resourceDelta: { data: 1 }, result: "success", journalText: "老許的證詞與本局探索證據完成交叉核對。" },
      { id: "ask-limited", label: "只問已知部分", description: "接受不完整回答。", result: "partial", journalText: "只保留老許能確定的部分。" },
      { id: "lost-signal", label: "保存失聯錄音", description: "不補寫沒聽見的名字。", result: "fallback", journalText: "失聯錄音保留空白，沒有自動填名。" },
    ],
  },
  {
    missionId: "REL-XU-05", npcId: "xu", stepId: "last-call", day: 6, priorMissionId: "REL-XU-04",
    title: "最後一次通聯", prompt: "交換最後已知路況；資訊不會直接打開隱藏結局。",
    choices: [
      { id: "exchange", label: "交換已知路況", description: "取得一份資料，不授予結局權限。", resourceDelta: { data: 1 }, result: "success", journalText: "最後路況已交換；隱藏結局條件維持原規則。" },
      { id: "leave-message", label: "留下錄音", description: "對方未必收到。", result: "partial", journalText: "最後訊息留在公開頻道。" },
      { id: "end-call", label: "結束通聯", description: "不再要求回覆。", result: "declined", journalText: "通聯在沒有額外承諾下結束。" },
    ],
  },
] as const;

export interface FacilityUpgradeDefinition {
  missionId: string;
  title: string;
  facilityId: string;
  upgradeId: string;
  branchGroup: FacilityBranchGroup;
  branchChoice: string;
  dayMin: number;
  dayMax: number;
  apCost: number;
  partsCost: number;
  sceneState: string;
  effectSummary: string;
}

export const FACILITY_UPGRADES: readonly FacilityUpgradeDefinition[] = [
  { missionId: "FAC-01", title: "低噪配線", facilityId: "power-core", upgradeId: "quiet-wiring", branchGroup: "core-output", branchChoice: "quiet", dayMin: 2, dayMax: 5, apCost: 2, partsCost: 4, sceneState: "power-core-quiet-wiring", effectSummary: "夜間模組噪音 −4。" },
  { missionId: "FAC-02", title: "峰值緩衝", facilityId: "power-core", upgradeId: "burst-buffer", branchGroup: "core-output", branchChoice: "burst", dayMin: 2, dayMax: 5, apCost: 2, partsCost: 5, sceneState: "power-core-burst-buffer", effectSummary: "每次反制的電量成本 −2（最低 0）。" },
  { missionId: "FAC-03", title: "遮光百葉", facilityId: "window-frame", upgradeId: "blackout-shutter", branchGroup: "window-approach", branchChoice: "covered", dayMin: 2, dayMax: 5, apCost: 2, partsCost: 4, sceneState: "window-blackout-shutter", effectSummary: "窗側傷害 −5、能見度 −8。" },
  { missionId: "FAC-04", title: "觀測窗框", facilityId: "window-frame", upgradeId: "observation-frame", branchGroup: "window-approach", branchChoice: "visible", dayMin: 2, dayMax: 5, apCost: 2, partsCost: 4, sceneState: "window-observation-frame", effectSummary: "接觸警告 +3 秒、能見度 +6。" },
  { missionId: "FAC-05", title: "封閉回水", facilityId: "greenhouse-loop", upgradeId: "closed-return", branchGroup: "greenhouse-loop", branchChoice: "closed", dayMin: 3, dayMax: 6, apCost: 2, partsCost: 5, sceneState: "greenhouse-closed-return", effectSummary: "整架灌溉水成本 −1；污染灌溉時額外污染 +1。" },
  { missionId: "FAC-06", title: "隔離培育", facilityId: "greenhouse-loop", upgradeId: "isolated-trays", branchGroup: "greenhouse-loop", branchChoice: "isolated", dayMin: 3, dayMax: 6, apCost: 2, partsCost: 5, sceneState: "greenhouse-isolated-trays", effectSummary: "單槽污染不擴散，手動排水成本 −1 水。" },
  { missionId: "FAC-07", title: "保暖床邊", facilityId: "bedside-bay", upgradeId: "warm-berth", branchGroup: "bedside-use", branchChoice: "warmth", dayMin: 2, dayMax: 6, apCost: 2, partsCost: 4, sceneState: "bedside-warm-berth", effectSummary: "有供暖的黎明睡眠 +6。" },
  { missionId: "FAC-08", title: "急救床邊", facilityId: "bedside-bay", upgradeId: "medical-berth", branchGroup: "bedside-use", branchChoice: "medical", dayMin: 2, dayMax: 6, apCost: 2, partsCost: 4, sceneState: "bedside-medical-berth", effectSummary: "使用藥品時健康 +4、感染額外 −2。" },
] as const;

export const CHALLENGE_SUMMARIES = [
  { id: "CH-01", title: "把一夜留給睡眠", summary: "第 2–6 夜任一夜零驚醒且乘客、車體存活。" },
  { id: "CH-02", title: "替緊急狀況留餘裕", summary: "生命維持有供電並以正值備援電量抵達黎明。" },
  { id: "CH-03", title: "一株完整長大的作物", summary: "收成本局實際播種、成熟且健康的同一株作物。" },
  { id: "CH-04", title: "工具真正派上用場", summary: "有限工具或手動備援反制成功，並在同夜存活。" },
  { id: "CH-05", title: "讓車廂各做一件事", summary: "完成臥室安撫、工坊維修、健康收成、烹飪與防禦反制。" },
  { id: "CH-06", title: "把選擇的理由留下", summary: "以合法結局完成七夜，日誌留下最終選擇與至少一項已驗證理由。" },
] as const;

export const ROUTE_TRADEOFFS = [
  {
    nodeId: "RN01",
    title: "快速幹線",
    advantage: "燃料成本最低，保留整備 AP 給乘客與維修。",
    cost: "第 3 日起夜間接觸 +1，沒有固定補給。",
    fuelCost: 4,
    nightContactDeltaAfterTutorial: 1,
    environmentDelta: {},
    resourceDelta: {},
  },
  {
    nodeId: "RN02",
    title: "補給支線",
    advantage: "結算時取得零件 +2、水 +1。",
    cost: "停車噪音 +6，當夜接觸不減少。",
    fuelCost: 5,
    nightContactDeltaAfterTutorial: 0,
    environmentDelta: { noise: 6 },
    resourceDelta: { parts: 2, water: 1 },
  },
  {
    nodeId: "RN03",
    title: "遮蔽舊線",
    advantage: "當夜接觸 −1（最低 1），黎明睡眠 +5。",
    cost: "繞行燃料成本最高，訊號資料 −1。",
    fuelCost: 7,
    nightContactDeltaAfterTutorial: -1,
    environmentDelta: {},
    resourceDelta: { data: -1 },
  },
] as const;

export const REFILL_ACTIONS = [
  { id: "refill-battery", title: "整理備用電芯", apCost: 1, cost: { parts: -2 }, gain: { energy: 15 }, warning: "會少兩份維修零件。" },
  { id: "refill-water", title: "啟動濾水循環", apCost: 1, cost: { energy: -3 }, gain: { water: 2 }, warning: "今晚可用電量會降低。" },
  { id: "refill-rations", title: "重整儲藏配給", apCost: 1, cost: { water: -1 }, gain: { food: 1 }, warning: "飲水會先減少一份。" },
] as const;

export const RESOURCE_WARNING_RULES = [
  { key: "energy", atOrBelow: 12, message: "繼續耗電可能失去生命維持與反制能力。" },
  { key: "fuel", atOrBelow: 7, message: "繼續耗油可能只能走緊急漂移路線。" },
  { key: "food", atOrBelow: 2, message: "繼續消耗食物會迫使下一夜採節約餐。" },
  { key: "water", atOrBelow: 2, message: "繼續用水可能失去灌溉或飲用選擇。" },
  { key: "parts", atOrBelow: 2, message: "繼續用零件可能無法維修車體。" },
] as const;
