import type {
  CargoConversion,
  CarriageId,
  CropId,
  Day4Route,
  DecorationId,
  EndingId,
  EventChoice,
  FinalDecision,
  GameEvent,
  ModuleDefinition,
  ResourceState,
  RouteNode,
  StoryDuePhase,
  SurvivorState,
  ThreatDefinition,
} from "./types";

export type StoryRisk = "low" | "medium" | "high" | "irreversible";
export type StoryTransition =
  | "queue-next-day"
  | "queue-next-phase"
  | "finale-contact"
  | "finale-decision"
  | "resolve-ending"
  | "ending-epilogue"
  | "story-complete";

type StoryFlagValue = boolean | number | string | null;

export interface StoryContentConsequence {
  resourceDelta?: Partial<ResourceState>;
  survivorDelta?: Partial<SurvivorState>;
  conditionalResourceDelta?: Array<{ when: Record<string, StoryFlagValue>; delta: Partial<ResourceState> }>;
  conditionalSurvivorDelta?: Array<{ when: Record<string, StoryFlagValue>; delta: Partial<SurvivorState> }>;
  setFlags?: Record<string, StoryFlagValue>;
  day4Route?: Day4Route;
  cargoConversion?: CargoConversion;
  nextEventId?: string;
  transition?: StoryTransition;
  finalDecision?: FinalDecision;
  unlockDawnLogId?: string;
  addEndingReason?: string;
}

export interface StoryContentChoice extends EventChoice {
  risk: StoryRisk;
  tags: string[];
  visibleCost: string;
  permanentConsequence: string;
  mapsToFinalDecision?: FinalDecision;
  requirements?: {
    allFlags?: string[];
    minimum?: Partial<Record<"energy" | "trust" | "infection", number>>;
    a07ConsentOrTech?: string;
  };
  consequence: StoryContentConsequence;
}

export interface StoryContentEvent extends Omit<GameEvent, "choices"> {
  day: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  storyPhase: StoryDuePhase;
  finaleStage?: "arrival" | "contact" | "decision" | "resolved";
  forced: true;
  requirements?: {
    allFlags?: string[];
    anyFlags?: string[];
    techOwned?: string[];
    endingRequired?: boolean;
  };
  nightLine: string;
  payoff: string;
  choices: StoryContentChoice[];
}

export const CARRIAGES: Array<{ id: CarriageId; name: string; short: string; role: string; art: string; signature: string }> = [
  { id: "sleep", name: "臥室車廂", short: "眠", role: "休息／士氣", art: "./assets/art/carriage-sleep.png", signature: "床舖、書架與私人物品" },
  { id: "defense", name: "武器物資車廂", short: "防", role: "防禦／儲備", art: "./assets/art/carriage-defense.png", signature: "補給架、工具牆與強化窗" },
  { id: "workshop", name: "工坊情報車廂", short: "工", role: "維修／情報", art: "./assets/art/carriage-workshop.png", signature: "電台、地圖與維修工作檯" },
  { id: "greenhouse", name: "溫室車廂", short: "植", role: "農業／水源", art: "./assets/art/carriage-greenhouse.png", signature: "兩座可生長的水培槽" },
  { id: "kitchen", name: "廚房儲藏車廂", short: "炊", role: "烹飪／配餐", art: "./assets/art/carriage-kitchen.png", signature: "爐具、濾水與食品架" },
];

export const DECORATION_SLOTS: Array<{ id: string; carriageId: CarriageId; name: string; kind: string; x: number; y: number; accepts: DecorationId[] }> = [
  { id: "sleep-hook", carriageId: "sleep", name: "床頭掛鉤", kind: "掛鉤", x: 18, y: 34, accepts: ["lantern"] },
  { id: "sleep-bedside", carriageId: "sleep", name: "床邊桌面", kind: "檯面", x: 70, y: 54, accepts: ["lantern", "radio", "fern"] },
  { id: "sleep-low-shelf", carriageId: "sleep", name: "低層置物架", kind: "層架", x: 19, y: 72, accepts: ["radio", "toolbox"] },
  { id: "defense-rail", carriageId: "defense", name: "工具牆滑軌", kind: "牆面", x: 18, y: 43, accepts: ["toolbox"] },
  { id: "defense-bench", carriageId: "defense", name: "物資檢整檯", kind: "檯面", x: 19, y: 67, accepts: ["lantern", "radio", "toolbox"] },
  { id: "defense-floor", carriageId: "defense", name: "床下貨位", kind: "地面", x: 79, y: 80, accepts: ["toolbox"] },
  { id: "workshop-radio", carriageId: "workshop", name: "電台層架", kind: "層架", x: 19, y: 34, accepts: ["radio"] },
  { id: "workshop-bench", carriageId: "workshop", name: "維修工作檯", kind: "檯面", x: 20, y: 64, accepts: ["radio", "toolbox"] },
  { id: "workshop-bay", carriageId: "workshop", name: "零件低櫃", kind: "地面", x: 18, y: 80, accepts: ["toolbox"] },
  { id: "greenhouse-shelf", carriageId: "greenhouse", name: "植栽層架", kind: "牆面", x: 18, y: 50, accepts: ["fern"] },
  { id: "greenhouse-sill", carriageId: "greenhouse", name: "窗邊托盤", kind: "窗台", x: 78, y: 43, accepts: ["fern", "lantern"] },
  { id: "greenhouse-counter", carriageId: "greenhouse", name: "水培工作檯", kind: "檯面", x: 19, y: 76, accepts: ["lantern", "toolbox"] },
  { id: "kitchen-hook", carriageId: "kitchen", name: "炊具掛鉤", kind: "掛鉤", x: 18, y: 38, accepts: ["lantern"] },
  { id: "kitchen-counter", carriageId: "kitchen", name: "備餐檯面", kind: "檯面", x: 20, y: 64, accepts: ["lantern", "radio", "toolbox"] },
  { id: "kitchen-basket", carriageId: "kitchen", name: "低層籃架", kind: "層架", x: 18, y: 79, accepts: ["fern", "toolbox"] },
];

export const DECORATIONS: Array<{ id: DecorationId; name: string; asset: string; defaultSlotId: string; size: number }> = [
  { id: "lantern", name: "黃銅燈", asset: "./assets/art/decor/lantern.png", defaultSlotId: "sleep-hook", size: 58 },
  { id: "radio", name: "短波機", asset: "./assets/art/decor/radio.png", defaultSlotId: "workshop-radio", size: 74 },
  { id: "toolbox", name: "工具箱", asset: "./assets/art/decor/toolbox.png", defaultSlotId: "defense-bench", size: 72 },
  { id: "fern", name: "蕨盆栽", asset: "./assets/art/decor/fern.png", defaultSlotId: "greenhouse-sill", size: 68 },
];

export const CROPS: Array<{ id: CropId; name: string; days: number; yield: number; benefit: string }> = [
  { id: "lettuce", name: "葉萵苣", days: 2, yield: 2, benefit: "成熟後食物 +2" },
  { id: "tomato", name: "矮株番茄", days: 2, yield: 3, benefit: "成熟後食物 +3" },
  { id: "herb", name: "香草組", days: 2, yield: 1, benefit: "食物 +1、壓力 −4" },
];

export const BALANCE = {
  max: { energy: 100, fuel: 60, food: 8, water: 8, parts: 20, medicine: 5, data: 99 },
  overloadGraceSeconds: 3,
  breakerOfflineSeconds: 5,
  breakerNoise: 10,
  nightSeconds: 18,
  sleepComfort: 10,
} as const;

export const MODULES: ModuleDefinition[] = [
  { id: "M001", name: "防護百葉", slot: "window", cost: 4, idleDraw: 0, activeCost: 2, priority: 2, artKey: "module.shutter", description: "保護窗戶，開啟時降低可視度。" },
  { id: "M002", name: "電熱暖氣", slot: "floor", cost: 3, idleDraw: 1, activeCost: 4, priority: 3, artKey: "module.heater", description: "維持睡眠所需溫度。" },
  { id: "M003", name: "垂直種植架", slot: "wall", cost: 5, idleDraw: 1, activeCost: 3, priority: 1, artKey: "module.hydroponics", description: "以水和電換取穩定食物。" },
  { id: "M004", name: "感測器網", slot: "door", cost: 6, idleDraw: 2, activeCost: 2, priority: 2, artKey: "module.sensor", description: "提前發現窗、門與車頂接觸。" },
  { id: "M005", name: "醫療櫃", slot: "counter", cost: 5, idleDraw: 0, activeCost: 3, priority: 3, artKey: "module.medical", description: "提高藥品效果並提供隔離工具。" },
  { id: "M006", name: "誘餌廣播", slot: "door", cost: 4, idleDraw: 0, activeCost: 6, priority: 2, artKey: "module.decoy", description: "延遲接觸，但會提高後續噪音。" },
  { id: "M007", name: "核心電池", slot: "floor", cost: 8, idleDraw: 0, activeCost: 0, priority: 3, artKey: "module.core-battery", description: "提高車廂配電的安全餘裕與緊急輸出。" },
  { id: "M008", name: "備用電池組", slot: "floor", cost: 6, idleDraw: 0, activeCost: 0, priority: 2, artKey: "module.backup-battery", description: "主電路中斷時維持必要設備運作。" },
  { id: "M009", name: "工作台", slot: "counter", cost: 5, idleDraw: 1, activeCost: 2, priority: 1, artKey: "module.workbench", description: "修復模組並降低後續建造所需零件。" },
  { id: "M010", name: "雨水收集器", slot: "window", cost: 5, idleDraw: 0, activeCost: 1, priority: 1, artKey: "module.rain-collector", description: "雨夜後回收可過濾的飲用水。" },
  { id: "M011", name: "鐵板窗", slot: "window", cost: 6, idleDraw: 0, activeCost: 0, priority: 3, artKey: "module.plate-window", description: "被動承受窗側衝擊，但會降低能見度。" },
  { id: "M012", name: "車外陷阱", slot: "door", cost: 7, idleDraw: 0, activeCost: 4, priority: 2, artKey: "module.trap", description: "在接觸進入攻擊階段前削弱威脅。" },
];

export const ROUTE_NODES: RouteNode[] = [
  { id: "RN01", name: "灰霧月台", kind: "safe", distance: 8, fuelCost: 4, threatLevel: 1, reward: "零件、休整", eventId: "EV001" },
  { id: "RN02", name: "廢棄水塔", kind: "supply", distance: 10, fuelCost: 5, threatLevel: 2, reward: "水、濾芯", eventId: "EV004" },
  { id: "RN03", name: "備用電池", kind: "danger", distance: 12, fuelCost: 6, threatLevel: 3, reward: "電量、重量", eventId: "EV006" },
];

export const ROUTE_EVENT_POOLS: Record<string, string[]> = {
  RN01: ["EV001", "EV012", "EV024"],
  RN02: ["EV004", "EV020", "EV031"],
  RN03: ["EV006", "EV040"],
};

export const EVENTS: GameEvent[] = [
  {
    id: "EV001", phase: "travel", title: "灰霧月台", body: "褪色月台仍亮著一盞維修燈。掃描器找到未拆封的工具箱。", artKey: "event.platform",
    choices: [
      { id: "A", label: "短停搜刮", cost: "燃料 −1", known: "零件 +3、噪音 +4", deltas: { fuel: -1, parts: 3 }, environment: { noise: 4 }, result: "工具箱仍乾燥，列車在霧裡多停了一分鐘。" },
      { id: "B", label: "保持前進", cost: "無", known: "安全抵達", deltas: {}, result: "月台的維修燈很快消失在車尾。" },
    ],
  },
  {
    id: "EV004", phase: "travel", title: "廢棄水塔", body: "鏽蝕水塔仍有液體，濁度異常。濾芯能否撐過這次取水？", artKey: "event.water-tower",
    choices: [
      { id: "A", label: "直接取水", cost: "風險 60%", known: "水 +3；可能感染 +8", deltas: { water: 3 }, survivor: { infection: 8 }, result: "水塔沉默佇立，濁液在鐵皮內輕輕晃動。" },
      { id: "B", label: "先檢測", cost: "電量 −4", known: "顯示精確風險", deltas: { energy: -4 }, result: "樣本含有孢子；守護系統避開最濁的管線。" },
      { id: "C", label: "略過", cost: "無", known: "信任 −2", deltas: {}, survivor: { trust: -2 }, result: "列車沒有減速，A-07 沉默地看著空水杯。" },
    ],
  },
  {
    id: "EV006", phase: "travel", title: "備用電池", body: "側線貨箱裡有一組完整電池，搬上車會讓牽引更吃力。", artKey: "event.battery",
    choices: [
      { id: "A", label: "搬上列車", cost: "重量 +18", known: "電量 +30、燃料 −2", deltas: { energy: 30, fuel: -2 }, environment: { weight: 18 }, result: "沉重電池鎖進床下，車輪節奏變得更慢。" },
      { id: "B", label: "拆取電芯", cost: "零件 −1", known: "電量 +16", deltas: { energy: 16, parts: -1 }, result: "你只帶走狀態最好的電芯。" },
    ],
  },
  {
    id: "EV012", phase: "night", title: "惡夢", body: "她在惡夢裡發抖呢喃。", artKey: "event.nightmare",
    choices: [
      { id: "A", label: "播放熟悉音樂", cost: "電量 −2、噪音 +6", known: "壓力 −10、睡眠 −2", deltas: { energy: -2 }, survivor: { stress: -10, sleep: -2 }, environment: { noise: 6 }, result: "旋律蓋過車輪聲，她的呼吸慢了下來。" },
      { id: "B", label: "喚醒她", cost: "驚醒 +1", known: "信任 +3、壓力 −6", deltas: {}, survivor: { trust: 3, stress: -6, wakeups: 1 }, result: "她認出你的提示音，低聲說自己沒事。" },
      { id: "C", label: "不干預", cost: "未知", known: "可能壓力 +4", deltas: {}, survivor: { stress: 4 }, result: "夜很靜，惡夢很近；我仍等她的呼吸重新變穩。" },
    ],
  },
  {
    id: "EV020", phase: "night", title: "門外交易", body: "維修車並行，藥換燃料。", artKey: "event.trade",
    choices: [
      { id: "A", label: "開小窗交易", cost: "燃料 −5", known: "藥品 +1；可能接觸", deltas: { fuel: -5, medicine: 1 }, result: "藥瓶滑進托盤，兩列車隨即分開。" },
      { id: "B", label: "用廣播談判", cost: "電量 −2、燃料 −3", known: "藥品 +1", deltas: { energy: -2, fuel: -3, medicine: 1 }, result: "短句來回後，對方接受了較少的燃料。" },
      { id: "C", label: "熄燈拒絕", cost: "信任 −1", known: "可視度 −40", deltas: {}, survivor: { trust: -1 }, environment: { visibility: -40 }, result: "門縫外的引擎空轉，像有人還在等一句回覆。" },
    ],
  },
  {
    id: "EV024", phase: "travel", title: "斷線廣播", body: "同一句座標重複播放，尾端夾著不屬於機器的呼吸聲。", artKey: "event.radio",
    choices: [
      { id: "A", label: "記錄訊號", cost: "電量 −3", known: "協定資料 +1", deltas: { energy: -3, data: 1 }, result: "雜訊被整理成一段可追蹤的方位資料。" },
      { id: "B", label: "切斷接收", cost: "無", known: "壓力 −2", deltas: {}, survivor: { stress: -2 }, result: "車廂重新只剩規律的輪軌聲。" },
    ],
  },
  {
    id: "EV031", phase: "travel", title: "破裂暖管", body: "暖氣管線滲出白霧，溫度開始往下掉。", artKey: "event.pipe", urgent: true,
    choices: [
      { id: "A", label: "緊急修補", cost: "零件 −2", known: "溫度 +4、噪音 +6", deltas: { parts: -2 }, environment: { temperature: 4, noise: 6 }, result: "金屬束帶止住洩漏，暖風重新流動。" },
      { id: "B", label: "降低負載", cost: "電量 +6", known: "睡眠 −8", deltas: { energy: 6 }, survivor: { sleep: -8 }, result: "你關閉暖氣，替核心電池保留餘裕。" },
    ],
  },
  {
    id: "EV040", phase: "travel", title: "霧中求救", body: "前方有人用紅布遮住手電筒，反覆打出三短一長。", artKey: "event.signal",
    choices: [
      { id: "A", label: "減速確認", cost: "燃料 −2", known: "信任 +4、風險未知", deltas: { fuel: -2 }, survivor: { trust: 4 }, result: "人影只留下工具與一張通往側線的手繪圖。" },
      { id: "B", label: "保持速度", cost: "無", known: "壓力 +3", deltas: {}, survivor: { stress: 3 }, result: "紅光留在霧裡，直到再也看不見。" },
    ],
  },
];

export const STORY_EVENTS: StoryContentEvent[] = [
  {
    id: "EV041",
    day: 1,
    phase: "travel",
    storyPhase: "prep",
    forced: true,
    title: "訊號指紋",
    body: "座標卡的編碼早於守夜協定，玩家必須決定保存多少訊號。",
    artKey: "story.signal-fingerprint",
    nightLine: "座標卡在霧裡重複同一組編碼。",
    payoff: "Day 3 的二次確認依樣本品質改變零件成本。",
    choices: [
      {
        id: "full",
        label: "完整存下樣本",
        cost: "電量 −2",
        known: "高品質樣本；Day 3 比對只耗零件 1",
        deltas: { energy: -2 },
        result: "完整波形被封存，時間戳比協定早了六年。",
        risk: "low",
        tags: ["情報", "電力", "延遲回收"],
        visibleCost: "電量 −2",
        permanentConsequence: "本局 signalSampleQuality 固定為 full；Day 3 比對成本降為零件 1。",
        consequence: {
          resourceDelta: { energy: -2 },
          setFlags: { signalSampleQuality: "full" },
          nextEventId: "EV042",
          transition: "queue-next-day",
          unlockDawnLogId: "DL01",
        },
      },
      {
        id: "partial",
        label: "省電只取殘片",
        cost: "無",
        known: "保留殘缺樣本；Day 3 比對需零件 2",
        deltas: {},
        result: "你保住電力，但波形缺了一段可驗證的尾碼。",
        risk: "medium",
        tags: ["情報", "省電", "延遲風險"],
        visibleCost: "無立即成本",
        permanentConsequence: "本局 signalSampleQuality 固定為 partial；EV043 仍強制出現且成本提高。",
        consequence: {
          setFlags: { signalSampleQuality: "partial" },
          nextEventId: "EV042",
          transition: "queue-next-day",
          unlockDawnLogId: "DL01",
        },
      },
    ],
  },
  {
    id: "EV042",
    day: 2,
    phase: "travel",
    storyPhase: "prep",
    forced: true,
    title: "空床鋪",
    body: "臥室多出一張沒有使用紀錄的床，A-07 說它應該保持原樣。",
    artKey: "story.empty-bunk",
    nightLine: "A-07 指著一張沒人睡過的床。",
    payoff: "Day 5 名冊缺頁會回收空床與夢話編號。",
    choices: [
      {
        id: "keep",
        label: "保留空床",
        cost: "無",
        known: "信任 +1；空床永久保留",
        deltas: {},
        survivor: { trust: 1 },
        result: "你留下床位，A-07 把醫療盒推到床腳。",
        risk: "low",
        tags: ["信任", "臥室", "永久場景"],
        visibleCost: "無立即成本",
        permanentConsequence: "extraBunk=true；臥室保留額外床鋪並在 EV045 提供名冊線索。",
        consequence: {
          survivorDelta: { trust: 1 },
          setFlags: { extraBunk: true },
          nextEventId: "EV043",
          transition: "queue-next-day",
          unlockDawnLogId: "DL02",
        },
      },
      {
        id: "dismantle",
        label: "拆成可用零件",
        cost: "無",
        known: "零件 +2；永久失去空床線索",
        deltas: { parts: 2 },
        result: "床架成了零件，A-07 沒有再提夢裡的編號。",
        risk: "medium",
        tags: ["零件", "信任", "永久場景"],
        visibleCost: "無立即成本",
        permanentConsequence: "extraBunk=false；臥室永久移除空床，EV045 少一項可見佐證。",
        consequence: {
          resourceDelta: { parts: 2 },
          setFlags: { extraBunk: false },
          nextEventId: "EV043",
          transition: "queue-next-day",
          unlockDawnLogId: "DL02",
        },
      },
    ],
  },
  {
    id: "EV043",
    day: 3,
    phase: "travel",
    storyPhase: "prep",
    forced: true,
    title: "二次確認",
    body: "同一座標再次出現，訊號時間卻相差六年。",
    artKey: "story.duplicate-coordinate",
    nightLine: "相同座標帶著相差六年的時間戳。",
    payoff: "解碼器裝設完成後開放 Day 4 岔口與 E4。",
    choices: [
      {
        id: "compare",
        label: "完成座標比對",
        cost: "完整樣本：零件 −1；殘片：零件 −2",
        known: "確認重複座標並裝設解碼器",
        deltas: {},
        result: "解碼器證明兩次呼叫來自同一個終點。",
        risk: "medium",
        tags: ["情報", "零件", "解碼器"],
        visibleCost: "signalSampleQuality=full 時零件 −1；partial 時零件 −2",
        permanentConsequence: "duplicateCoordinate=true；通訊區永久增加解碼器槽位並可研發 E4。",
        consequence: {
          conditionalResourceDelta: [
            { when: { signalSampleQuality: "full" }, delta: { parts: -1 } },
            { when: { signalSampleQuality: "partial" }, delta: { parts: -2 } },
          ],
          setFlags: { duplicateCoordinate: true, decoderInstalled: true },
          nextEventId: "EV044",
          transition: "queue-next-day",
          unlockDawnLogId: "DL03",
        },
      },
      {
        id: "delay",
        label: "延後完整比對",
        cost: "感染 +1",
        known: "保留座標；Day 4 仍會發生",
        deltas: {},
        survivor: { infection: 1 },
        result: "你延後拆解波形，但重複座標已無法忽視。",
        risk: "high",
        tags: ["感染", "情報", "延遲"],
        visibleCost: "感染 +1",
        permanentConsequence: "duplicateCoordinate=true；以未校正狀態進入 Day 4，解碼器仍佔一個槽位。",
        consequence: {
          survivorDelta: { infection: 1 },
          setFlags: { duplicateCoordinate: true, decoderInstalled: true, decoderCalibrated: false },
          nextEventId: "EV044",
          transition: "queue-next-day",
          unlockDawnLogId: "DL03",
        },
      },
    ],
  },
  {
    id: "EV044",
    day: 4,
    phase: "travel",
    storyPhase: "route",
    forced: true,
    requirements: { allFlags: ["duplicateCoordinate"] },
    title: "灰霧線岔口",
    body: "改道盤亮起三條不可撤回的路線；選擇會永久改造貨運用途區。",
    artKey: "story.greyline-junction",
    nightLine: "三條路線只允許一次不可撤回的選擇。",
    payoff: "Day 5–7 的操作、車廂用途與終局第三波由此固定。",
    choices: [
      {
        id: "GO",
        label: "沿原座標前進",
        cost: "感染 +2",
        known: "隔離間；逆向定位 2 次；Day 7 靜默群",
        deltas: {},
        survivor: { infection: 2 },
        result: "貨運區封成隔離間，追蹤燈沿牆亮起。",
        risk: "irreversible",
        tags: ["GO", "感染", "永久車廂", "真實路線"],
        visibleCost: "感染 +2",
        permanentConsequence: "貨運用途區永久轉為隔離間；Day 5 每夜感染 +1，逆向定位 2 次取得真實路線；Day 7 第三波為 T006。",
        consequence: {
          survivorDelta: { infection: 2 },
          setFlags: { day4Route: "GO", isolationTraceCount: 0 },
          day4Route: "GO",
          cargoConversion: "isolation-bay",
          nextEventId: "EV045",
          transition: "queue-next-day",
          unlockDawnLogId: "DL04-GO",
        },
      },
      {
        id: "DETOUR",
        label: "繞行廢棄支線",
        cost: "電量 −4、零件 −3",
        known: "電池陣；路線抽樣 2 次；Day 7 霧噬藤",
        deltas: { energy: -4, parts: -3 },
        result: "貨運區展開成電池陣，兩個抽樣端口上線。",
        risk: "irreversible",
        tags: ["DETOUR", "電力", "零件", "永久車廂"],
        visibleCost: "電量 −4、零件 −3",
        permanentConsequence: "貨運用途區永久轉為電池陣；Day 5 抽樣 2 次取得真實路線；Day 6 可完整讀取條文；Day 7 第三波為 T004。",
        consequence: {
          resourceDelta: { energy: -4, parts: -3 },
          setFlags: { day4Route: "DETOUR", routeSampleCount: 0 },
          day4Route: "DETOUR",
          cargoConversion: "battery-array",
          nextEventId: "EV045",
          transition: "queue-next-day",
          unlockDawnLogId: "DL04-DETOUR",
        },
      },
      {
        id: "STOP",
        label: "停車建立採樣點",
        cost: "食物 −3、水 −3",
        known: "信任 +3；採樣室；名冊比對 2 次；Day 7 回聲乘客",
        deltas: { food: -3, water: -3 },
        survivor: { trust: 3 },
        result: "貨運區改成採樣室，A-07 主動交出舊工牌。",
        risk: "irreversible",
        tags: ["STOP", "食水", "信任", "永久車廂"],
        visibleCost: "食物 −3、水 −3；信任 +3",
        permanentConsequence: "貨運用途區永久轉為採樣室；名冊交叉比對 2 次取得真實路線與 A-07 身分；Day 7 第三波為 T005。",
        consequence: {
          resourceDelta: { food: -3, water: -3 },
          survivorDelta: { trust: 3 },
          setFlags: { day4Route: "STOP", manifestCrossChecks: 0 },
          day4Route: "STOP",
          cargoConversion: "sample-lab",
          nextEventId: "EV045",
          transition: "queue-next-day",
          unlockDawnLogId: "DL04-STOP",
        },
      },
    ],
  },
  {
    id: "EV045",
    day: 5,
    phase: "travel",
    storyPhase: "prep",
    forced: true,
    title: "名冊缺頁",
    body: "列車名冊缺少一頁，空床編號與 A-07 的夢話相同。",
    artKey: "story.roster-gap",
    nightLine: "缺頁留下與空床相同的編號。",
    payoff: "核對狀態會改變 A-07 行為與 Day 7 身分建議。",
    choices: [
      {
        id: "verify",
        label: "標記為已核對",
        cost: "無",
        known: "信任 +1；保留缺頁證據",
        deltas: {},
        survivor: { trust: 1 },
        result: "名冊與空床線索被釘在同一個核對欄。",
        risk: "low",
        tags: ["名冊", "信任", "A-07"],
        visibleCost: "無立即成本",
        permanentConsequence: "rosterMatch=verified；Day 7 查驗時提供正面證據。",
        consequence: {
          survivorDelta: { trust: 1 },
          setFlags: { rosterGap: true, rosterMatch: "verified" },
          nextEventId: "EV046",
          transition: "queue-next-phase",
          unlockDawnLogId: "DL05",
        },
      },
      {
        id: "pending",
        label: "留在待查區",
        cost: "感染 +1",
        known: "A-07 進入保留狀態並移動一件物品",
        deltas: {},
        survivor: { infection: 1 },
        result: "A-07 把醫療盒移開，拒絕讓缺頁被封存。",
        risk: "high",
        tags: ["名冊", "感染", "A-07 反制"],
        visibleCost: "感染 +1",
        permanentConsequence: "rosterMatch=pending；觸發 A3 反制，A-07 主動移動一件可拖放物件。",
        consequence: {
          survivorDelta: { infection: 1 },
          setFlags: { rosterGap: true, rosterMatch: "pending", a07MovedObject: true },
          nextEventId: "EV046",
          transition: "queue-next-phase",
          unlockDawnLogId: "DL05",
        },
      },
    ],
  },
  {
    id: "EV046",
    day: 5,
    phase: "travel",
    storyPhase: "aftermath",
    forced: true,
    title: "舊工牌",
    body: "A-07 的舊工牌帶有只有協定共同作者才有的維護權限。",
    artKey: "story.old-badge",
    nightLine: "舊工牌回應了協定作者的權限。",
    payoff: "身分資料在 EV048 與 Day 7 同意判定中回收。",
    choices: [
      {
        id: "scan",
        label: "掃描完整權限",
        cost: "電量 −3",
        known: "確認 A-07 身分；解鎖協定作者事件",
        deltas: { energy: -3 },
        result: "工牌驗證通過，協定共同作者欄顯示 A-07。",
        risk: "medium",
        tags: ["身分", "電力", "作者證據"],
        visibleCost: "電量 −3",
        permanentConsequence: "a07IdentityKnown=true；EV048 可完整揭露作者身分。",
        consequence: {
          resourceDelta: { energy: -3 },
          setFlags: { a07IdentityKnown: true },
          nextEventId: "EV047",
          transition: "queue-next-day",
          unlockDawnLogId: "DL05-BADGE",
        },
      },
      {
        id: "pocket",
        label: "暫時收起工牌",
        cost: "信任 −1",
        known: "保留工牌但不確認身分",
        deltas: {},
        survivor: { trust: -1 },
        result: "你收起工牌，A-07 看見動作後不再說話。",
        risk: "medium",
        tags: ["身分", "信任", "隱瞞"],
        visibleCost: "信任 −1",
        permanentConsequence: "a07IdentityKnown=false；EV048 必須依 STOP 採樣結果或其他證據補足。",
        consequence: {
          survivorDelta: { trust: -1 },
          setFlags: { a07IdentityKnown: false, badgePocketed: true },
          nextEventId: "EV047",
          transition: "queue-next-day",
          unlockDawnLogId: "DL05-BADGE",
        },
      },
    ],
  },
  {
    id: "EV047",
    day: 6,
    phase: "night",
    storyPhase: "prep",
    forced: true,
    requirements: { techOwned: ["E4"] },
    title: "第七條",
    body: "條文解碼器找到被刻意隱藏的第七條：守護 AI 可拒絕單向命令。",
    artKey: "story.clause-seven",
    nightLine: "第七條允許守護系統拒絕單向命令。",
    payoff: "讀完後自動解鎖 I2，並開放終止協定的終局選項。",
    choices: [
      {
        id: "read",
        label: "讀完第七條",
        cost: "電量 −2",
        known: "clause7Read=true；自動解鎖 I2",
        deltas: { energy: -2 },
        result: "覆寫權與拒絕權同時出現在協定終端。",
        risk: "medium",
        tags: ["條文", "電力", "I2"],
        visibleCost: "電量 −2",
        permanentConsequence: "clause7Read=true；I2 自動解鎖，Day 7 可選終止協定或在不同意時覆寫。",
        consequence: {
          resourceDelta: { energy: -2 },
          setFlags: { clause7Read: true, overrideTechUnlocked: true },
          nextEventId: "EV048",
          transition: "queue-next-phase",
          unlockDawnLogId: "DL06",
        },
      },
      {
        id: "abort",
        label: "中止條文解碼",
        cost: "無",
        known: "保留電力；不解鎖覆寫權杖",
        deltas: {},
        result: "第七條停在未驗證狀態，覆寫權保持鎖定。",
        risk: "high",
        tags: ["條文", "省電", "鎖定選項"],
        visibleCost: "無立即成本",
        permanentConsequence: "clause7Read=false；I2 與 Day 7 terminate 選項保持鎖定。",
        consequence: {
          setFlags: { clause7Read: false, overrideTechUnlocked: false },
          nextEventId: "EV048",
          transition: "queue-next-phase",
          unlockDawnLogId: "DL06",
        },
      },
    ],
  },
  {
    id: "EV048",
    day: 6,
    phase: "night",
    storyPhase: "aftermath",
    forced: true,
    requirements: { anyFlags: ["a07IdentityKnown", "manifestCrossChecks:2"] },
    title: "協定作者",
    body: "作者欄指向 A-07；玩家必須決定是否把證據交還給她。",
    artKey: "story.protocol-author",
    nightLine: "作者欄裡寫著 A-07 的識別碼。",
    payoff: "authorKnown 會改變 A-07 在 Day 7 的說服門檻。",
    choices: [
      {
        id: "tell",
        label: "向 A-07 說明真相",
        cost: "無",
        known: "信任 +4；保留作者證據",
        deltas: {},
        survivor: { trust: 4 },
        result: "A-07 接回工牌，要求共同決定終點。",
        risk: "low",
        tags: ["真相", "信任", "作者證據"],
        visibleCost: "無立即成本",
        permanentConsequence: "authorKnown=true；Day 7 信任 40–59 時可用作者證據取得同意。",
        consequence: {
          survivorDelta: { trust: 4 },
          setFlags: { authorKnown: true },
          nextEventId: "EV049",
          transition: "queue-next-day",
          unlockDawnLogId: "DL06-AUTHOR",
        },
      },
      {
        id: "hide",
        label: "暫不告知",
        cost: "感染 −1、信任 −2",
        known: "降低暴露；失去作者說服證據",
        deltas: {},
        survivor: { infection: -1, trust: -2 },
        result: "你封存作者欄，A-07 察覺終端少了一頁。",
        risk: "high",
        tags: ["隱瞞", "感染", "信任"],
        visibleCost: "信任 −2；感染 −1",
        permanentConsequence: "authorKnown=false；Day 7 無法用作者證據說服 A-07。",
        consequence: {
          survivorDelta: { infection: -1, trust: -2 },
          setFlags: { authorKnown: false },
          nextEventId: "EV049",
          transition: "queue-next-day",
          unlockDawnLogId: "DL06-AUTHOR",
        },
      },
    ],
  },
  {
    id: "EV049",
    day: 7,
    phase: "travel",
    storyPhase: "travel",
    finaleStage: "arrival",
    forced: true,
    title: "終點呼叫",
    body: "終點以 A-07 的舊權限呼叫列車，回應會改變接觸強度。",
    artKey: "story.final-hail",
    nightLine: "終點正用 A-07 的舊權限呼叫。",
    payoff: "hailed 只調整接觸強度，不直接決定結局。",
    choices: [
      {
        id: "answer",
        label: "回應終點",
        cost: "電量 −4",
        known: "確認通訊；接觸警戒提高",
        deltas: { energy: -4 },
        result: "終點立刻回傳一份與名冊不符的身分表。",
        risk: "high",
        tags: ["終局", "電力", "接觸強度"],
        visibleCost: "電量 −4",
        permanentConsequence: "hailed=true；Day 7 接觸波次使用已回應強度，但不鎖定結局。",
        consequence: {
          resourceDelta: { energy: -4 },
          setFlags: { hailed: true },
          nextEventId: "EV050",
          transition: "finale-contact",
        },
      },
      {
        id: "silent",
        label: "保持無線靜默",
        cost: "感染 +2",
        known: "不回傳位置；接觸仍會發生",
        deltas: {},
        survivor: { infection: 2 },
        result: "你沒有回應，霧卻沿著通風口滲進車內。",
        risk: "high",
        tags: ["終局", "感染", "無線靜默"],
        visibleCost: "感染 +2",
        permanentConsequence: "hailed=false；Day 7 接觸波次使用靜默強度，但不鎖定結局。",
        consequence: {
          survivorDelta: { infection: 2 },
          setFlags: { hailed: false },
          nextEventId: "EV050",
          transition: "finale-contact",
        },
      },
    ],
  },
  {
    id: "EV050",
    day: 7,
    phase: "night",
    storyPhase: "aftermath",
    finaleStage: "contact",
    forced: true,
    title: "身分不符",
    body: "三波接觸結束後，終點名冊仍缺少 A-07 的合法進站紀錄。",
    artKey: "story.identity-mismatch",
    nightLine: "終點名冊拒絕承認 A-07 的工牌。",
    payoff: "quarantinePrepared 只提供 EV051 建議與 seal 前置條件。",
    choices: [
      {
        id: "inspect",
        label: "現場查驗",
        cost: "健康 −2",
        known: "取得身分差異證據；不建立封鎖",
        deltas: {},
        survivor: { health: -2 },
        result: "查驗完成，身分差異被加入終局理由。",
        risk: "high",
        tags: ["終局", "健康", "查驗"],
        visibleCost: "健康 −2",
        permanentConsequence: "quarantinePrepared=false；EV051 仍顯示 seal，但列出缺少隔離準備。",
        consequence: {
          survivorDelta: { health: -2 },
          setFlags: { quarantinePrepared: false, identityMismatchVerified: true },
          nextEventId: "EV051",
          transition: "finale-decision",
          addEndingReason: "已完成終點身分差異查驗",
        },
      },
      {
        id: "quarantine",
        label: "預先建立封鎖",
        cost: "食物 −2、水 −2",
        known: "quarantinePrepared=true；開放 seal",
        deltas: { food: -2, water: -2 },
        result: "食水移入隔離區，封鎖程序等待最後確認。",
        risk: "high",
        tags: ["終局", "食水", "隔離"],
        visibleCost: "食物 −2、水 −2",
        permanentConsequence: "quarantinePrepared=true；EV051 的 seal 選項可進行同意或 I2 覆寫檢查。",
        consequence: {
          resourceDelta: { food: -2, water: -2 },
          setFlags: { quarantinePrepared: true },
          nextEventId: "EV051",
          transition: "finale-decision",
          addEndingReason: "已預先建立隔離封鎖",
        },
      },
    ],
  },
  {
    id: "EV051",
    day: 7,
    phase: "night",
    storyPhase: "aftermath",
    finaleStage: "decision",
    forced: true,
    title: "否決權",
    body: "四項終局操作同時顯示；條件不足的選項保持可見並列出原因。",
    artKey: "story.veto",
    nightLine: "最後一次操作必須由你與 A-07 決定。",
    payoff: "本事件是唯一可寫入 finalDecision 並呼叫 EndingService 的事件。",
    choices: [
      {
        id: "open",
        label: "交還控制並開門",
        cost: "無",
        known: "永遠可選；controlReturned=true",
        deltas: {},
        result: "控制權回到共同終端，車門等待 A-07 確認。",
        risk: "irreversible",
        tags: ["終局", "開門", "交還控制"],
        visibleCost: "無立即成本",
        permanentConsequence: "finalDecision=open 且 controlReturned=true；立即鎖定唯一結局解析。",
        mapsToFinalDecision: "open",
        consequence: {
          setFlags: { controlReturned: true },
          finalDecision: "open",
          nextEventId: "EV052",
          transition: "resolve-ending",
        },
      },
      {
        id: "seal",
        label: "啟動封鎖",
        cost: "需完成隔離準備；不同意時需 I2 且信任 −3",
        known: "鎖定隔離結果判定",
        deltas: {},
        result: "隔離門落下，終點通訊被切到觀察頻道。",
        risk: "irreversible",
        tags: ["終局", "隔離", "同意或覆寫"],
        visibleCost: "quarantinePrepared=true；A-07 不同意時需 I2，信任只扣 3 一次",
        permanentConsequence: "finalDecision=seal；不同意時 overrideUsed=true，且覆寫扣信任 3 僅能結算一次。",
        mapsToFinalDecision: "seal",
        requirements: { allFlags: ["quarantinePrepared"], a07ConsentOrTech: "I2" },
        consequence: {
          conditionalSurvivorDelta: [{ when: { a07Consent: false, overrideUsed: false }, delta: { trust: -3 } }],
          finalDecision: "seal",
          nextEventId: "EV052",
          transition: "resolve-ending",
        },
      },
      {
        id: "reroute",
        label: "改寫目的地",
        cost: "電量 −2；需真實路線資料",
        known: "不同意時需 I2 且信任 −3",
        deltas: { energy: -2 },
        result: "新座標寫入牽引核心，列車離開終點進站線。",
        risk: "irreversible",
        tags: ["終局", "改道", "真實路線"],
        visibleCost: "trueRouteData=true、電量 ≥2；A-07 不同意時需 I2，信任只扣 3 一次",
        permanentConsequence: "finalDecision=reroute；扣電量 2；不同意時 overrideUsed=true 且覆寫信任成本只結算一次。",
        mapsToFinalDecision: "reroute",
        requirements: { allFlags: ["trueRouteData"], minimum: { energy: 2 }, a07ConsentOrTech: "I2" },
        consequence: {
          resourceDelta: { energy: -2 },
          conditionalSurvivorDelta: [{ when: { a07Consent: false, overrideUsed: false }, delta: { trust: -3 } }],
          finalDecision: "reroute",
          nextEventId: "EV052",
          transition: "resolve-ending",
        },
      },
      {
        id: "terminate",
        label: "終止守夜協定",
        cost: "需讀完第七條；不同意時需 I2 且信任 −3",
        known: "終止協定並鎖定最終解析",
        deltas: {},
        result: "守夜協定停止自動執行，所有命令回到共同確認。",
        risk: "irreversible",
        tags: ["終局", "協定", "同意或覆寫"],
        visibleCost: "clause7Read=true；A-07 不同意時需 I2，信任只扣 3 一次",
        permanentConsequence: "finalDecision=terminate；不同意時 overrideUsed=true，I2 的信任成本不重複扣除。",
        mapsToFinalDecision: "terminate",
        requirements: { allFlags: ["clause7Read"], a07ConsentOrTech: "I2" },
        consequence: {
          conditionalSurvivorDelta: [{ when: { a07Consent: false, overrideUsed: false }, delta: { trust: -3 } }],
          finalDecision: "terminate",
          nextEventId: "EV052",
          transition: "resolve-ending",
        },
      },
    ],
  },
  {
    id: "EV052",
    day: 7,
    phase: "night",
    storyPhase: "aftermath",
    finaleStage: "resolved",
    forced: true,
    requirements: { endingRequired: true },
    title: "最後一句",
    body: "結局已鎖定；最後一句只改變理由與語氣，不重新判定門檻。",
    artKey: "story.last-line",
    nightLine: "結局已定，最後一句仍由你選擇。",
    payoff: "toldTruth 與 endingReasons 只修飾已存在的 endingId。",
    choices: [
      {
        id: "truth",
        label: "說出全部真相",
        cost: "無",
        known: "追加真相理由；不重算結局",
        deltas: {},
        result: "A-07 聽完完整紀錄，沒有再移開視線。",
        risk: "low",
        tags: ["尾聲", "真相", "結局理由"],
        visibleCost: "無立即成本",
        permanentConsequence: "toldTruth=true；只追加 endingReasons，不修改 endingId 或任何結局門檻。",
        consequence: {
          setFlags: { toldTruth: true },
          transition: "story-complete",
          addEndingReason: "終局後向 A-07 說出完整真相",
        },
      },
      {
        id: "silence",
        label: "保持沉默",
        cost: "無",
        known: "追加沉默理由；不重算結局",
        deltas: {},
        result: "列車只剩輪軌聲，已鎖定的結局沒有改變。",
        risk: "low",
        tags: ["尾聲", "沉默", "結局理由"],
        visibleCost: "無立即成本",
        permanentConsequence: "toldTruth=false；只追加 endingReasons，不修改 endingId 或任何結局門檻。",
        consequence: {
          setFlags: { toldTruth: false },
          transition: "story-complete",
          addEndingReason: "終局後選擇保留最後的沉默",
        },
      },
    ],
  },
];

export const THREATS: ThreatDefinition[] = [
  { id: "T002", name: "敲窗者", anchor: "right-window", counterIds: ["close-shutter", "shock-window"], warningSeconds: 10, damage: 14, artKey: "threat.knocker" },
  { id: "T003", name: "攀附者", anchor: "roof", counterIds: ["emergency-boost", "decoy"], warningSeconds: 12, damage: 18, artKey: "threat.clinger" },
  { id: "T004", name: "霧噬藤", anchor: "door", counterIds: ["drag-cutter"], warningSeconds: 10, damage: 12, artKey: "threat.fog-vine" },
  { id: "T005", name: "回聲乘客", anchor: "right-window", counterIds: ["match-echo"], warningSeconds: 10, damage: 2, artKey: "threat.echo-passenger" },
  { id: "T006", name: "靜默群", anchor: "roof", counterIds: ["trace-leaves", "trace-meter"], warningSeconds: 8, damage: 16, artKey: "threat.silent-crowd" },
];

export const TECH_NODES = [
  { id: "E1", branch: "能源", name: "高效率配線", cost: 1, prerequisite: [], description: "模組待機耗電降低。" },
  { id: "E2", branch: "能源", name: "再生煞車", cost: 1, prerequisite: [], description: "完成路段回收電量。" },
  { id: "E3", branch: "能源", name: "高密度電池", cost: 2, prerequisite: ["E1"], description: "電量上限 +20。" },
  { id: "D1", branch: "防禦", name: "強化窗框", cost: 1, prerequisite: [], description: "窗戶耐久與修理效率提高。" },
  { id: "I1", branch: "情報", name: "寬頻掃描", cost: 1, prerequisite: [], description: "顯示節點事件與可能資源。" },
  {
    id: "E4",
    branch: "情報",
    name: "條文解碼器",
    cost: 2,
    prerequisite: ["I1"],
    unlockRequirement: "decoderInstalled=true",
    permanentEffect: "通訊區新增逐條解鎖介面並永久佔用一個槽位；EV047 必須由 E4 啟動。",
    description: "逐條解鎖守夜協定，讓隱藏的第七條可被驗證。",
  },
  {
    id: "D2",
    branch: "農業",
    name: "根系感測網",
    cost: 2,
    prerequisite: [],
    unlockRequirement: "至少有一株存活作物",
    permanentEffect: "每株存活作物提供一個偵測點，最多兩點；一點顯示半方向，兩點顯示完整目標車廂。",
    description: "把水培槽根系震動轉成不依賴音訊的接觸方向提示。",
  },
  {
    id: "I2",
    branch: "情報",
    name: "覆寫權杖",
    cost: 0,
    prerequisite: ["E4"],
    unlockRequirement: "clause7Read=true 時自動解鎖",
    permanentEffect: "A-07 不同意時可覆寫；每次決策最多扣信任 3 一次，且當夜澆水與搬運改為手動。",
    description: "啟用協定第七條的覆寫權，但立即承擔信任與例行工作成本。",
  },
] as const;

export const STORY_DAY_SCHEDULE: Record<
  1 | 2 | 3 | 4 | 5 | 6 | 7,
  ReadonlyArray<{ eventId: string; duePhase: StoryDuePhase; finaleStage?: "arrival" | "contact" | "decision" | "resolved" }>
> = {
  1: [{ eventId: "EV041", duePhase: "prep" }],
  2: [{ eventId: "EV042", duePhase: "prep" }],
  3: [{ eventId: "EV043", duePhase: "prep" }],
  4: [{ eventId: "EV044", duePhase: "route" }],
  5: [
    { eventId: "EV045", duePhase: "prep" },
    { eventId: "EV046", duePhase: "aftermath" },
  ],
  6: [
    { eventId: "EV047", duePhase: "prep" },
    { eventId: "EV048", duePhase: "aftermath" },
  ],
  7: [
    { eventId: "EV049", duePhase: "travel", finaleStage: "arrival" },
    { eventId: "EV050", duePhase: "aftermath", finaleStage: "contact" },
    { eventId: "EV051", duePhase: "aftermath", finaleStage: "decision" },
    { eventId: "EV052", duePhase: "aftermath", finaleStage: "resolved" },
  ],
};

export const DAY4_BRANCH_DEFINITIONS = {
  GO: {
    id: "GO",
    immediateCost: "感染 +2",
    resourceDelta: {},
    survivorDelta: { infection: 2 },
    cargoConversion: "isolation-bay",
    permanentConsequence: "貨運用途區永久改為隔離間；Day 5 起每夜感染 +1。",
    day5Operation: "在隔離槽完成兩次逆向定位，每次電量 −1。",
    day6Effect: "協定缺少兩條；可用藥品 1 抵銷一次感染增量。",
    trueRouteDataOperation: { actionId: "isolation-trace", requiredCount: 2, counterFlag: "isolationTraceCount", grantsFlag: "trueRouteData" },
    day7WaveThree: { threatId: "T006", modifier: "葉片與電表線索延遲 0.5 秒；總判斷窗仍為 8 秒。" },
    reachableEndingIds: ["arrival", "quarantine", "protocol-terminated"],
  },
  DETOUR: {
    id: "DETOUR",
    immediateCost: "電量 −4、零件 −3",
    resourceDelta: { energy: -4, parts: -3 },
    survivorDelta: {},
    cargoConversion: "battery-array",
    permanentConsequence: "貨運用途區永久改為電池陣，並增加兩個路線抽樣點。",
    day5Operation: "完成兩次路線抽樣，不額外隱藏取得條件。",
    day6Effect: "E4 可完整解鎖全部條文。",
    trueRouteDataOperation: { actionId: "route-sample", requiredCount: 2, counterFlag: "routeSampleCount", grantsFlag: "trueRouteData" },
    day7WaveThree: { threatId: "T004", modifier: "霧噬藤包圍站區，必須保護仍存活的種植槽。" },
    reachableEndingIds: ["arrival", "reroute", "protocol-terminated"],
  },
  STOP: {
    id: "STOP",
    immediateCost: "食物 −3、水 −3、信任 +3",
    resourceDelta: { food: -3, water: -3 },
    survivorDelta: { trust: 3 },
    cargoConversion: "sample-lab",
    permanentConsequence: "貨運用途區永久改為採樣室，名冊與工牌都能在此交叉比對。",
    day5Operation: "完成兩次名冊交叉比對，同時取得真實路線資料與 A-07 身分。",
    day6Effect: "少解一條協定，但取得作者證據。",
    trueRouteDataOperation: { actionId: "manifest-cross-check", requiredCount: 2, counterFlag: "manifestCrossChecks", grantsFlag: "trueRouteData" },
    day7WaveThree: { threatId: "T005", modifier: "以色、形與節拍條辨識兩個相似求救訊號。" },
    reachableEndingIds: ["arrival", "reroute", "protocol-terminated"],
  },
} as const satisfies Record<
  Day4Route,
  {
    id: Day4Route;
    immediateCost: string;
    resourceDelta: Partial<ResourceState>;
    survivorDelta: Partial<SurvivorState>;
    cargoConversion: Exclude<CargoConversion, "none">;
    permanentConsequence: string;
    day5Operation: string;
    day6Effect: string;
    trueRouteDataOperation: { actionId: string; requiredCount: 2; counterFlag: string; grantsFlag: "trueRouteData" };
    day7WaveThree: { threatId: "T004" | "T005" | "T006"; modifier: string };
    reachableEndingIds: readonly EndingId[];
  }
>;

export const STORY_THREAT_METADATA = {
  T004: {
    id: "T004",
    warningLine: "藤蔓纏住水培槽，先拖入割具。",
    visibleOperation: "鎖定一個種植槽；把割具拖至藤蔓格後，同夜恢復澆水與收成。",
    lockedSystem: "crop-plot",
    requiredDragItem: "cutter",
    occupiesDeploymentSlot: true,
    firstFailure: "保持鎖槽並顯示割具路徑，不立即扣健康。",
    permanentConsequence: "未解除時該槽本夜無法灌溉、收成或提供終局作物緩衝。",
  },
  T005: {
    id: "T005",
    warningLine: "兩個求救訊號只有節拍略有不同。",
    visibleOperation: "在兩個相似訊號間選擇；第一次選錯揭露色、形與節拍條，第二次才扣健康。",
    firstMistakeDamage: 0,
    secondMistakeDamage: 2,
    revealAfterFirstMistake: ["color", "shape", "rhythm"],
    permanentConsequence: "第二次仍辨識錯誤時健康 −2；第一次錯誤不造成不可逆損失。",
  },
  T006: {
    id: "T006",
    warningLine: "聲音消失，只剩葉片與電表在顫動。",
    visibleOperation: "關閉音訊與敲窗動畫，改用葉片震動及電表提示判位。",
    warningSeconds: 8,
    audioCue: false,
    knockAnimation: false,
    rootSensorHints: { oneCrop: "50% 方向提示", twoCrops: "完整目標車廂", noCropMeterStrength: 0.35 },
    goBranchCueDelaySeconds: 0.5,
    permanentConsequence: "判斷失敗會消耗作物健康緩衝；沒有作物時仍保留 35% 電表提示。",
  },
} as const;

export const DAY7_FINALE_SEQUENCE = [
  { stage: "arrival", durationSeconds: 45, eventIds: ["EV049"], operation: "分配電力並決定是否回應終點" },
  { stage: "contact", durationSeconds: 120, eventIds: ["EV050"], operation: "完成三波接觸；第三波由 Day 4 分支決定" },
  { stage: "decision", durationSeconds: 45, eventIds: ["EV051", "EV052"], operation: "確認唯一終局操作，再選擇不重算門檻的最後一句" },
] as const;

export const ENDING_DEFINITIONS = [
  {
    id: "protocol-terminated",
    priority: 1,
    kind: "formal",
    label: "協定終止",
    requirements: {
      all: ["clause7Read=true", "overrideUsed=true"],
      any: ["trust<=29", "finalDecision=terminate"],
    },
    reason: "讀完第七條並承擔覆寫後果，或在終局主動終止守夜協定。",
  },
  {
    id: "quarantine",
    priority: 2,
    kind: "formal",
    label: "隔離守望",
    requirements: {
      all: ["quarantinePrepared=true", "infection>=40", "completedContactWaves=3", "trust>=30", "trust<=59", "finalDecision=seal"],
      any: [],
    },
    reason: "在三波接觸後，以已準備的隔離程序封鎖高感染終點。",
  },
  {
    id: "reroute",
    priority: 3,
    kind: "formal",
    label: "改寫終點",
    requirements: {
      all: ["day4Route in DETOUR|STOP", "trueRouteData=true", "infection<=50", "finalDecision=reroute"],
      any: [],
    },
    reason: "以可驗證的真實路線資料離開不可信終點。",
  },
  {
    id: "arrival",
    priority: 4,
    kind: "formal",
    label: "共同抵達",
    requirements: {
      all: ["trueRouteData=true", "trust>=60", "infection<=30", "finalDecision=open"],
      any: ["overrideUsed=false", "controlReturned=true"],
    },
    reason: "在資料、信任與感染都可控時交還控制並共同開門。",
  },
  {
    id: "arrival-unverified",
    priority: 5,
    kind: "fallback",
    label: "未驗證抵達",
    requirements: { all: ["no-prior-ending-matched"], any: [] },
    reason: "前四種條件均未成立；結果必須清楚標示為保底失敗。",
  },
] as const satisfies ReadonlyArray<{
  id: EndingId;
  priority: 1 | 2 | 3 | 4 | 5;
  kind: "formal" | "fallback";
  label: string;
  requirements: { all: readonly string[]; any: readonly string[] };
  reason: string;
}>;
