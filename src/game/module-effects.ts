import { BALANCE, MODULES, TECH_NODES } from "./content";
import type { EnvironmentState, ResourceState } from "./types";
import { repairVoyageState } from "./voyage/engine";
import type { VoyageActionResult, VoyageRunInput } from "./voyage/types";

export const MODULE_EFFECT_SUPPORT = MODULES.map((module) => ({
  id: module.id,
  supported: true as const,
  rule: ({
    M001: "供電時窗側傷害 −6、能見度 −8。",
    M002: "供電夜溫度 +4、黎明睡眠 +4。",
    M003: "供電且已灌溉時作物完成一夜生長。",
    M004: "供電時所有接觸警告 +3 秒。",
    M005: "用藥健康回復 +6、感染額外 −2。",
    M006: "啟動誘餌使接觸延遲 4 秒並增加噪音 6。",
    M007: "電量上限 +15；低備援時反制電耗 −2。",
    M008: "主電路中斷時保留 4 點生命維持備援。",
    M009: "車體維修 +3，建造零件成本 −1（最低 1）。",
    M010: "雨夜黎明回收 2 水，每夜至多一次。",
    M011: "窗側傷害 −8、能見度 −12。",
    M012: "攻擊階段前消耗原主動電力，將該次傷害 −10。",
  } as Record<string, string>)[module.id] ?? "已支援。",
}));

export const TECH_EFFECT_SUPPORT = TECH_NODES.map((node) => ({
  id: node.id,
  supported: true as const,
  rule: ({
    E1: "每個啟用模組電耗 −1（最低 0）。",
    E2: "完成每日路段回收 4 電量。",
    E3: "電量上限 +20。",
    D1: "窗側傷害再 −3，車體維修量 +4。",
    I1: "路線預覽顯示事件與可能資源。",
    E4: "允許原故事的條文解碼互動。",
    D2: "每株存活作物提供偵測點，最多 2。",
    I2: "依原故事條件開啟覆寫；不自行產生同意。",
  } as Record<string, string>)[node.id] ?? "已支援。",
}));

function ready(run: VoyageRunInput, definitionId: string): boolean {
  return run.modules.some(
    (module) =>
      module.definitionId === definitionId &&
      module.active &&
      module.powered &&
      module.durability > 0,
  );
}

export interface GameplayEffects {
  energyCapacity: number;
  moduleDrawDiscount: number;
  routeEnergyRecovery: number;
  warningSecondsBonus: number;
  visibilityDelta: number;
  passiveWindowDamageReduction: number;
  preAttackDamageReduction: number;
  lowReserveCounterDiscount: number;
  lifeSupportReserve: number;
  repairHullBonus: number;
  buildPartsDiscount: number;
  medicineHealthBonus: number;
  medicineInfectionReduction: number;
  rainWaterRecovery: number;
  dawnTemperatureBonus: number;
  dawnSleepBonus: number;
  cropSensorPoints: number;
  routeScanVisible: boolean;
  decoderAvailable: boolean;
  overrideAvailable: boolean;
}

export function deriveGameplayEffects(run: VoyageRunInput): GameplayEffects {
  const liveCrops = Number((run.flags ?? []).includes("crop-plot-a-live")) + Number((run.flags ?? []).includes("crop-plot-b-live"));
  return {
    energyCapacity: BALANCE.max.energy + (run.techOwned.includes("E3") ? 20 : 0) + (ready(run, "M007") ? 15 : 0),
    moduleDrawDiscount: run.techOwned.includes("E1") ? 1 : 0,
    routeEnergyRecovery: run.techOwned.includes("E2") ? 4 : 0,
    warningSecondsBonus: ready(run, "M004") ? 3 : 0,
    visibilityDelta: (ready(run, "M001") ? -8 : 0) + (ready(run, "M011") ? -12 : 0),
    passiveWindowDamageReduction: (ready(run, "M001") ? 6 : 0) + (ready(run, "M011") ? 8 : 0) + (run.techOwned.includes("D1") ? 3 : 0),
    preAttackDamageReduction: ready(run, "M012") ? 10 : 0,
    lowReserveCounterDiscount: ready(run, "M007") ? 2 : 0,
    lifeSupportReserve: ready(run, "M008") ? 4 : 0,
    repairHullBonus: (ready(run, "M009") ? 3 : 0) + (run.techOwned.includes("D1") ? 4 : 0),
    buildPartsDiscount: ready(run, "M009") ? 1 : 0,
    medicineHealthBonus: ready(run, "M005") ? 6 : 0,
    medicineInfectionReduction: ready(run, "M005") ? 2 : 0,
    rainWaterRecovery: ready(run, "M010") ? 2 : 0,
    dawnTemperatureBonus: ready(run, "M002") ? 4 : 0,
    dawnSleepBonus: ready(run, "M002") ? 4 : 0,
    cropSensorPoints: run.techOwned.includes("D2") ? Math.min(2, liveCrops) : 0,
    routeScanVisible: run.techOwned.includes("I1"),
    decoderAvailable: run.techOwned.includes("E4"),
    overrideAvailable: run.techOwned.includes("I2"),
  };
}

export function getEnergyCapacity(run: VoyageRunInput): number {
  return deriveGameplayEffects(run).energyCapacity;
}

export function getRepairHullAmount(run: VoyageRunInput, baseAmount = 14): number {
  return baseAmount + deriveGameplayEffects(run).repairHullBonus;
}

export function getModuleBuildPartsCost(run: VoyageRunInput, definitionId: string): number {
  const base = MODULES.find((module) => module.id === definitionId)?.cost ?? 0;
  return Math.max(base > 0 ? 1 : 0, base - deriveGameplayEffects(run).buildPartsDiscount);
}

export function getCounterEnergyCost(run: VoyageRunInput, baseCost: number): number {
  const reserveDiscount = run.resources.energy <= 20
    ? deriveGameplayEffects(run).lowReserveCounterDiscount
    : 0;
  return Math.max(0, baseCost - reserveDiscount);
}

export interface HullDamageResolution {
  rawDamage: number;
  finalDamage: number;
  prevented: number;
  resourceDelta: Partial<ResourceState>;
  environmentDelta: Partial<EnvironmentState>;
  sources: string[];
}

export function resolveIncomingHullDamage(
  run: VoyageRunInput,
  input: { rawDamage: number; anchor: "left-window" | "right-window" | "door" | "roof"; beforeAttackStage: boolean },
): HullDamageResolution {
  const effects = deriveGameplayEffects(run);
  let prevented = 0;
  const sources: string[] = [];
  if (input.anchor === "left-window" || input.anchor === "right-window") {
    prevented += effects.passiveWindowDamageReduction;
    if (ready(run, "M011")) sources.push("M011");
    if (ready(run, "M001")) sources.push("M001");
    if (run.techOwned.includes("D1")) sources.push("D1");
  }
  const trapTriggered = input.beforeAttackStage && ready(run, "M012");
  if (trapTriggered) {
    prevented += effects.preAttackDamageReduction;
    sources.push("M012");
  }
  const finalDamage = Math.max(0, input.rawDamage - prevented);
  return {
    rawDamage: input.rawDamage,
    finalDamage,
    prevented: input.rawDamage - finalDamage,
    resourceDelta: {},
    environmentDelta: finalDamage > 0 ? { hull: -finalDamage } : {},
    sources,
  };
}

function effectResult(
  run: VoyageRunInput,
  settlementId: string,
  message: string,
  resourceDelta: Partial<ResourceState>,
): VoyageActionResult {
  const state = repairVoyageState(run.voyage);
  if (state.settlementIds.includes(settlementId)) {
    return {
      ok: false,
      message: "此效果已結算。",
      resourceDelta: {}, survivorDelta: {}, environmentDelta: {}, apCost: 0,
      eventType: null, eventPayload: null, stateDraft: state,
    };
  }
  const draft = repairVoyageState(state);
  draft.settlementIds.push(settlementId);
  return {
    ok: true,
    message,
    resourceDelta,
    survivorDelta: {},
    environmentDelta: {},
    apCost: 0,
    eventType: "module.effect",
    eventPayload: { transactionId: settlementId, settlementId },
    stateDraft: draft,
  };
}

export function applyRouteCompletionEffects(
  run: VoyageRunInput,
  routeNodeId: string,
): VoyageActionResult {
  const recovery = deriveGameplayEffects(run).routeEnergyRecovery;
  const capacity = getEnergyCapacity(run);
  const actual = Math.max(0, Math.min(recovery, capacity - run.resources.energy));
  return effectResult(
    run,
    `effect-route-${run.day}-${routeNodeId}`,
    actual > 0 ? `再生煞車回收 ${actual} 電量。` : "本路段沒有可結算的回收電量。",
    actual > 0 ? { energy: actual } : {},
  );
}

export function applyRainCollectionEffect(
  run: VoyageRunInput,
  weather: "dry" | "rain" | "storm",
): VoyageActionResult {
  const recovery = weather === "dry" ? 0 : deriveGameplayEffects(run).rainWaterRecovery;
  const actual = Math.max(0, Math.min(recovery, BALANCE.max.water - run.resources.water));
  return effectResult(
    run,
    `effect-rain-${run.day}`,
    actual > 0 ? `雨水收集器回收 ${actual} 水。` : "本夜沒有可回收的雨水。",
    actual > 0 ? { water: actual } : {},
  );
}

export function getDailyEffectSummary(run: VoyageRunInput): string[] {
  const effects = deriveGameplayEffects(run);
  const summary: string[] = [`電量上限 ${effects.energyCapacity}`];
  if (effects.routeEnergyRecovery) summary.push(`路段完成回電 +${effects.routeEnergyRecovery}`);
  if (effects.rainWaterRecovery) summary.push(`雨夜回收水 +${effects.rainWaterRecovery}`);
  if (effects.repairHullBonus) summary.push(`維修額外 +${effects.repairHullBonus}`);
  if (effects.lifeSupportReserve) summary.push(`生命維持備援 ${effects.lifeSupportReserve}`);
  return summary;
}

export function getRouteEffectSummary(run: VoyageRunInput): {
  energyRecovery: number;
  energyCapacity: number;
  scanVisible: boolean;
} {
  const effects = deriveGameplayEffects(run);
  return {
    energyRecovery: effects.routeEnergyRecovery,
    energyCapacity: effects.energyCapacity,
    scanVisible: effects.routeScanVisible,
  };
}
