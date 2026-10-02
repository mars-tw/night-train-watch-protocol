import { MODULES } from "./content";
import { hashString } from "./rng";
import type { CarriageId, ModuleInstance } from "./types";
import { FACILITY_UPGRADES } from "./voyage/content";
import type {
  FacilityBranchGroup,
  VoyageActionResult,
  VoyageRunInput,
} from "./voyage/types";

function facilityVoyageState(value: VoyageRunInput["voyage"]): NonNullable<VoyageRunInput["voyage"]> {
  const input = value;
  return {
    version: 2,
    stoppedDays: { ...(input?.stoppedDays ?? {}) },
    activeExpedition: input?.activeExpedition
      ? {
          ...input.activeExpedition,
          rolls: { ...input.activeExpedition.rolls },
          choices: [...input.activeExpedition.choices],
          collected: { ...input.activeExpedition.collected },
        }
      : undefined,
    expeditions: (input?.expeditions ?? []).map((record) => ({ ...record, choices: [...record.choices], collected: { ...record.collected } })),
    relationships: Object.fromEntries(Object.entries(input?.relationships ?? {}).map(([key, record]) => [key, { ...record }])),
    facilityChoices: { ...(input?.facilityChoices ?? {}) },
    facilities: Object.fromEntries(Object.entries(input?.facilities ?? {}).map(([key, record]) => [key, { ...record }])),
    settlementIds: [...(input?.settlementIds ?? [])],
    nightSummaries: (input?.nightSummaries ?? []).map((summary) => ({ ...summary })),
    nightStartWakeups: input?.nightStartWakeups,
    lastSettledDay: input?.lastSettledDay,
    inspectedIds: [...(input?.inspectedIds ?? [])],
  };
}

export type FunctionalSlotKind = "wall" | "counter" | "window" | "floor" | "door";

export interface FunctionalModuleSlot {
  id: string;
  carriageId: CarriageId;
  name: string;
  kind: FunctionalSlotKind;
  capacity: number;
  accepts: readonly string[];
}

export const FUNCTIONAL_MODULE_SLOTS: readonly FunctionalModuleSlot[] = [
  { id: "sleep-floor", carriageId: "sleep", name: "臥室地板機能座", kind: "floor", capacity: 1, accepts: ["M002", "M007", "M008"] },
  { id: "sleep-counter", carriageId: "sleep", name: "床邊機能槽", kind: "counter", capacity: 1, accepts: ["M005"] },
  { id: "defense-window", carriageId: "defense", name: "防禦窗框", kind: "window", capacity: 1, accepts: ["M001", "M011"] },
  { id: "defense-door", carriageId: "defense", name: "防禦門軌", kind: "door", capacity: 1, accepts: ["M006", "M012"] },
  { id: "defense-floor", carriageId: "defense", name: "防禦備援電池座", kind: "floor", capacity: 1, accepts: ["M007", "M008"] },
  { id: "workshop-counter", carriageId: "workshop", name: "工坊檯面機能槽", kind: "counter", capacity: 1, accepts: ["M005", "M009"] },
  { id: "workshop-door", carriageId: "workshop", name: "工坊感測門軌", kind: "door", capacity: 1, accepts: ["M004", "M006"] },
  { id: "greenhouse-wall", carriageId: "greenhouse", name: "溫室生產牆", kind: "wall", capacity: 1, accepts: ["M003"] },
  { id: "greenhouse-window", carriageId: "greenhouse", name: "溫室外部接口", kind: "window", capacity: 1, accepts: ["M010", "M011"] },
  { id: "kitchen-counter", carriageId: "kitchen", name: "廚房醫療檯", kind: "counter", capacity: 1, accepts: ["M005"] },
] as const;

export interface FunctionalSlotAssignment {
  moduleId: string;
  definitionId: string;
  slotId: string;
  carriageId?: CarriageId;
  legacy: boolean;
  compatible: boolean;
  reason?: string;
}

export interface ModulePlacementResult {
  ok: boolean;
  message: string;
  assignments: FunctionalSlotAssignment[];
}

export function moduleSlotCompatibility(definitionId: string, slotId: string): boolean {
  const definition = MODULES.find((module) => module.id === definitionId);
  const slot = FUNCTIONAL_MODULE_SLOTS.find((candidate) => candidate.id === slotId);
  return Boolean(
    definition &&
    slot &&
    definition.slot === slot.kind &&
    slot.accepts.includes(definitionId),
  );
}

export function repairFunctionalModuleSlots(
  modules: readonly ModuleInstance[],
): FunctionalSlotAssignment[] {
  const occupied = new Map<string, number>();
  const assignments: FunctionalSlotAssignment[] = [];
  for (const module of modules) {
    const current = FUNCTIONAL_MODULE_SLOTS.find((slot) => slot.id === module.slotId);
    if (
      current &&
      moduleSlotCompatibility(module.definitionId, current.id) &&
      (occupied.get(current.id) ?? 0) < current.capacity
    ) {
      occupied.set(current.id, (occupied.get(current.id) ?? 0) + 1);
      assignments.push({
        moduleId: module.id,
        definitionId: module.definitionId,
        slotId: current.id,
        carriageId: current.carriageId,
        legacy: false,
        compatible: true,
      });
      continue;
    }
    const available = FUNCTIONAL_MODULE_SLOTS.find(
      (slot) =>
        moduleSlotCompatibility(module.definitionId, slot.id) &&
        (occupied.get(slot.id) ?? 0) < slot.capacity,
    );
    if (available) {
      occupied.set(available.id, (occupied.get(available.id) ?? 0) + 1);
      assignments.push({
        moduleId: module.id,
        definitionId: module.definitionId,
        slotId: available.id,
        carriageId: available.carriageId,
        legacy: module.slotId !== available.id,
        compatible: true,
        reason: module.slotId === available.id ? undefined : "舊模組已遷移到相容機能槽。",
      });
      continue;
    }
    assignments.push({
      moduleId: module.id,
      definitionId: module.definitionId,
      slotId: module.slotId,
      legacy: true,
      compatible: false,
      reason: "沒有空的相容機能槽；保留舊模組，不刪除也不占用裝飾槽。",
    });
  }
  return assignments;
}

export function placeModuleInFunctionalSlot(
  assignments: readonly FunctionalSlotAssignment[],
  module: ModuleInstance,
  slotId: string,
): ModulePlacementResult {
  const slot = FUNCTIONAL_MODULE_SLOTS.find((candidate) => candidate.id === slotId);
  if (!slot) return { ok: false, message: "未知的機能槽。", assignments: [...assignments] };
  if (!moduleSlotCompatibility(module.definitionId, slotId)) {
    return {
      ok: false,
      message: `${MODULES.find((definition) => definition.id === module.definitionId)?.name ?? module.definitionId}不相容於${slot.name}。`,
      assignments: [...assignments],
    };
  }
  const occupied = assignments.filter(
    (assignment) => assignment.slotId === slotId && assignment.moduleId !== module.id,
  ).length;
  if (occupied >= slot.capacity) {
    return { ok: false, message: `${slot.name}容量已滿。`, assignments: [...assignments] };
  }
  const next = assignments.filter((assignment) => assignment.moduleId !== module.id);
  next.push({
    moduleId: module.id,
    definitionId: module.definitionId,
    slotId,
    carriageId: slot.carriageId,
    legacy: false,
    compatible: true,
  });
  return { ok: true, message: `模組已裝入${slot.name}。`, assignments: next };
}

export interface FacilityUpgradePreview {
  ok: boolean;
  message: string;
  missionId?: string;
  facilityId?: string;
  upgradeId?: string;
  branchGroup?: FacilityBranchGroup;
  branchChoice?: string;
  apCost: number;
  partsCost: number;
  sceneState?: string;
  effectSummary?: string;
}

function findUpgrade(facilityId: string, branchId: string) {
  return FACILITY_UPGRADES.find(
    (upgrade) =>
      upgrade.facilityId === facilityId &&
      (upgrade.upgradeId === branchId || upgrade.branchChoice === branchId || upgrade.missionId === branchId),
  );
}

export function previewFacilityUpgrade(
  run: VoyageRunInput,
  facilityId: string,
  branchId: string,
): FacilityUpgradePreview {
  const upgrade = findUpgrade(facilityId, branchId);
  if (!upgrade) return { ok: false, message: "未知的設施改裝方案。", apCost: 0, partsCost: 0 };
  const state = facilityVoyageState(run.voyage);
  const committed = state.facilityChoices[upgrade.branchGroup];
  let message = `${upgrade.title}：${upgrade.effectSummary}`;
  let ok = true;
  if (run.phase !== "prep") {
    ok = false;
    message = "只有整備階段能提交永久改裝。";
  } else if (run.day < upgrade.dayMin || run.day > upgrade.dayMax) {
    ok = false;
    message = `此改裝可在第 ${upgrade.dayMin}–${upgrade.dayMax} 日提交。`;
  } else if (committed) {
    ok = false;
    message = committed === upgrade.branchChoice ? "此分支已提交。" : `同一機能槽已選擇「${committed}」，兩方案互斥。`;
  } else if (run.actionPoints < upgrade.apCost) {
    ok = false;
    message = `行動點不足；需要 ${upgrade.apCost} AP。`;
  } else if (run.resources.parts < upgrade.partsCost) {
    ok = false;
    message = `零件不足；需要 ${upgrade.partsCost}。`;
  }
  return {
    ok,
    message,
    missionId: upgrade.missionId,
    facilityId: upgrade.facilityId,
    upgradeId: upgrade.upgradeId,
    branchGroup: upgrade.branchGroup,
    branchChoice: upgrade.branchChoice,
    apCost: upgrade.apCost,
    partsCost: upgrade.partsCost,
    sceneState: upgrade.sceneState,
    effectSummary: upgrade.effectSummary,
  };
}

export function commitFacilityUpgrade(
  run: VoyageRunInput,
  facilityId: string,
  branchId: string,
): VoyageActionResult {
  const state = facilityVoyageState(run.voyage);
  const preview = previewFacilityUpgrade({ ...run, voyage: state }, facilityId, branchId);
  if (
    !preview.ok ||
    !preview.missionId ||
    !preview.upgradeId ||
    !preview.branchGroup ||
    !preview.branchChoice ||
    !preview.sceneState
  ) {
    return {
      ok: false,
      message: preview.message,
      resourceDelta: {},
      survivorDelta: {},
      environmentDelta: {},
      apCost: 0,
      eventType: null,
      eventPayload: null,
      stateDraft: state,
    };
  }
  const settlementId = `v2-${hashString(`${run.seed}:${preview.missionId}:${preview.branchChoice}`).toString(36)}`;
  if (state.settlementIds.includes(settlementId)) {
    return {
      ok: false,
      message: "此改裝已結算。",
      resourceDelta: {},
      survivorDelta: {},
      environmentDelta: {},
      apCost: 0,
      eventType: null,
      eventPayload: null,
      stateDraft: state,
    };
  }
  const draft = facilityVoyageState(state);
  const branchGroup = preview.branchGroup!;
  const branchChoice = preview.branchChoice!;
  const committedFacilityId = preview.facilityId!;
  draft.facilityChoices[branchGroup] = branchChoice;
  draft.facilities[committedFacilityId] = {
    missionId: preview.missionId,
    facilityId: committedFacilityId,
    upgradeId: preview.upgradeId,
    branchGroup,
    branchChoice,
    sceneState: preview.sceneState,
    settlementId,
  };
  draft.settlementIds.push(settlementId);
  return {
    ok: true,
    message: `${preview.message} 場景已切換為 ${preview.sceneState}。`,
    resourceDelta: { parts: -preview.partsCost },
    survivorDelta: {},
    environmentDelta: {},
    apCost: preview.apCost,
    eventType: "facility.upgraded",
    eventPayload: {
      transactionId: settlementId,
      settlementId,
      missionId: preview.missionId,
      facilityId: committedFacilityId,
      upgradeId: preview.upgradeId,
      branchGroup,
      branchChoice,
      result: "success",
      sceneState: preview.sceneState,
      mainStoryBranchChanged: false,
    },
    stateDraft: draft,
  };
}

export interface FacilityEffects {
  nightNoiseDelta: number;
  counterEnergyDiscount: number;
  windowDamageReduction: number;
  visibilityDelta: number;
  warningSecondsBonus: number;
  irrigationWaterDiscount: number;
  contaminationOnIrrigation: number;
  isolateContamination: boolean;
  manualDrainWaterDiscount: number;
  heatedSleepBonus: number;
  medicineHealthBonus: number;
  medicineInfectionReduction: number;
}

export function getFacilityEffects(voyage: unknown): FacilityEffects {
  const state = facilityVoyageState(voyage as VoyageRunInput["voyage"]);
  const choices = state.facilityChoices;
  return {
    nightNoiseDelta: choices["core-output"] === "quiet" ? -4 : 0,
    counterEnergyDiscount: choices["core-output"] === "burst" ? 2 : 0,
    windowDamageReduction: choices["window-approach"] === "covered" ? 5 : 0,
    visibilityDelta: choices["window-approach"] === "covered" ? -8 : choices["window-approach"] === "visible" ? 6 : 0,
    warningSecondsBonus: choices["window-approach"] === "visible" ? 3 : 0,
    irrigationWaterDiscount: choices["greenhouse-loop"] === "closed" ? 1 : 0,
    contaminationOnIrrigation: choices["greenhouse-loop"] === "closed" ? 1 : 0,
    isolateContamination: choices["greenhouse-loop"] === "isolated",
    manualDrainWaterDiscount: choices["greenhouse-loop"] === "isolated" ? 1 : 0,
    heatedSleepBonus: choices["bedside-use"] === "warmth" ? 6 : 0,
    medicineHealthBonus: choices["bedside-use"] === "medical" ? 4 : 0,
    medicineInfectionReduction: choices["bedside-use"] === "medical" ? 2 : 0,
  };
}
