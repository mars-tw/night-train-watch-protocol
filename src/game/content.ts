import type { CarriageId, CropId, DecorationId, GameEvent, ModuleDefinition, RouteNode, ThreatDefinition } from "./types";

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

export const THREATS: ThreatDefinition[] = [
  { id: "T002", name: "敲窗者", anchor: "right-window", counterIds: ["close-shutter", "shock-window"], warningSeconds: 10, damage: 14, artKey: "threat.knocker" },
  { id: "T003", name: "攀附者", anchor: "roof", counterIds: ["emergency-boost", "decoy"], warningSeconds: 12, damage: 18, artKey: "threat.clinger" },
];

export const TECH_NODES = [
  { id: "E1", branch: "能源", name: "高效率配線", cost: 1, prerequisite: [], description: "模組待機耗電降低。" },
  { id: "E2", branch: "能源", name: "再生煞車", cost: 1, prerequisite: [], description: "完成路段回收電量。" },
  { id: "E3", branch: "能源", name: "高密度電池", cost: 2, prerequisite: ["E1"], description: "電量上限 +20。" },
  { id: "D1", branch: "防禦", name: "強化窗框", cost: 1, prerequisite: [], description: "窗戶耐久與修理效率提高。" },
  { id: "I1", branch: "情報", name: "寬頻掃描", cost: 1, prerequisite: [], description: "顯示節點事件與可能資源。" },
] as const;
