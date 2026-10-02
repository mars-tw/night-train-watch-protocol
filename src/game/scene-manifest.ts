import type { CarriageId, ContactStage, RunState, ThreatContact } from "./types";

export type SceneVisualState =
  | "unprepared" | "secure" | "disturbed" | "restored"
  | "breached" | "active" | "overloaded"
  | "productive" | "contaminated" | "sparse" | "prepared" | "spoiled";

export interface NormalizedBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SceneHotspot {
  id: string;
  label: string;
  bounds: NormalizedBounds;
}

export interface CarriageSceneManifest {
  source: string;
  states: readonly SceneVisualState[];
  hotspots: readonly SceneHotspot[];
  weatherWindows: readonly NormalizedBounds[];
}

export const CARRIAGE_SCENES: Readonly<Record<CarriageId, CarriageSceneManifest>> = {
  sleep: {
    source: "./assets/art/v2/carriages/sleep.png",
    states: ["unprepared", "secure", "disturbed", "restored"],
    hotspots: [
      { id: "sleep-bed", label: "主床與 A-07", bounds: { x: 0.55, y: 0.38, width: 0.43, height: 0.44 } },
      { id: "sleep-lamp", label: "書桌燈", bounds: { x: 0.02, y: 0.39, width: 0.25, height: 0.22 } },
      { id: "sleep-note", label: "私人筆記", bounds: { x: 0.05, y: 0.55, width: 0.32, height: 0.18 } },
    ],
    weatherWindows: [
      { x: 0.36, y: 0.12, width: 0.25, height: 0.27 },
      { x: 0.78, y: 0.13, width: 0.22, height: 0.25 },
    ],
  },
  defense: {
    source: "./assets/art/v2/carriages/defense.png",
    states: ["unprepared", "secure", "breached", "restored"],
    hotspots: [
      { id: "defense-window", label: "觀察窗", bounds: { x: 0.24, y: 0.16, width: 0.43, height: 0.28 } },
      { id: "defense-latch", label: "門窗扣具", bounds: { x: 0.53, y: 0.35, width: 0.23, height: 0.19 } },
      { id: "defense-kit", label: "反制工具架", bounds: { x: 0.03, y: 0.36, width: 0.32, height: 0.34 } },
    ],
    weatherWindows: [
      { x: 0.26, y: 0.18, width: 0.25, height: 0.25 },
      { x: 0.74, y: 0.16, width: 0.26, height: 0.27 },
    ],
  },
  workshop: {
    source: "./assets/art/v2/carriages/workshop.png",
    states: ["unprepared", "active", "overloaded", "restored"],
    hotspots: [
      { id: "workbench", label: "工作桌", bounds: { x: 0.02, y: 0.36, width: 0.46, height: 0.36 } },
      { id: "workshop-radio", label: "收音機", bounds: { x: 0.6, y: 0.3, width: 0.34, height: 0.24 } },
      { id: "workshop-board", label: "線路圖", bounds: { x: 0.61, y: 0.15, width: 0.27, height: 0.22 } },
    ],
    weatherWindows: [
      { x: 0.43, y: 0.15, width: 0.2, height: 0.22 },
      { x: 0.83, y: 0.13, width: 0.17, height: 0.24 },
    ],
  },
  greenhouse: {
    source: "./assets/art/v2/carriages/greenhouse.png",
    states: ["unprepared", "productive", "contaminated", "restored"],
    hotspots: [
      { id: "greenhouse-a", label: "上植床", bounds: { x: 0.01, y: 0.27, width: 0.39, height: 0.19 } },
      { id: "greenhouse-b", label: "下植床", bounds: { x: 0.01, y: 0.43, width: 0.42, height: 0.22 } },
      { id: "greenhouse-loop", label: "水循環箱", bounds: { x: 0.01, y: 0.54, width: 0.3, height: 0.24 } },
    ],
    weatherWindows: [
      { x: 0.43, y: 0.14, width: 0.18, height: 0.2 },
      { x: 0.76, y: 0.11, width: 0.24, height: 0.27 },
    ],
  },
  kitchen: {
    source: "./assets/art/v2/carriages/kitchen.png",
    states: ["sparse", "prepared", "spoiled", "restored"],
    hotspots: [
      { id: "kitchen-stove", label: "爐具", bounds: { x: 0.02, y: 0.32, width: 0.4, height: 0.25 } },
      { id: "kitchen-pantry", label: "儲藏架", bounds: { x: 0.01, y: 0.04, width: 0.34, height: 0.28 } },
      { id: "kitchen-meal", label: "餐盒與折桌", bounds: { x: 0.61, y: 0.31, width: 0.37, height: 0.28 } },
    ],
    weatherWindows: [
      { x: 0.4, y: 0.15, width: 0.2, height: 0.22 },
      { x: 0.83, y: 0.1, width: 0.17, height: 0.24 },
    ],
  },
};

export const SCENE_STATE_COUNT = Object.values(CARRIAGE_SCENES)
  .reduce((total, scene) => total + scene.states.length, 0);

export type A07ClipId = "sleep" | "turn" | "listen" | "startle" | "sit" | "drink" | "settle";

export interface A07ClipManifest {
  start: number;
  frames: number;
  fps: number;
  loop: boolean;
  keyFrame: number;
}

export const A07_ATLAS = {
  source: "./assets/art/v2/characters/a07/atlas.png",
  width: 1340,
  height: 1174,
  columns: 8,
  rows: 7,
  frameCount: 52,
  occupancyByRow: [8, 8, 8, 8, 8, 6, 6] as const,
  destination: { x: 0.43, y: 0.31, width: 0.5, height: 0.29 },
  headAnchor: { x: 0.6, y: 0.38 },
  clips: {
    sleep: { start: 0, frames: 8, fps: 4, loop: true, keyFrame: 0 },
    turn: { start: 8, frames: 8, fps: 6, loop: true, keyFrame: 4 },
    listen: { start: 16, frames: 8, fps: 6, loop: false, keyFrame: 5 },
    startle: { start: 24, frames: 8, fps: 8, loop: false, keyFrame: 4 },
    sit: { start: 32, frames: 8, fps: 6, loop: false, keyFrame: 6 },
    drink: { start: 40, frames: 6, fps: 5, loop: false, keyFrame: 3 },
    settle: { start: 46, frames: 6, fps: 6, loop: false, keyFrame: 5 },
  } satisfies Record<A07ClipId, A07ClipManifest>,
} as const;

export const A07_FRAME_CELLS: readonly { row: number; column: number }[] = A07_ATLAS.occupancyByRow
  .flatMap((count, row) => Array.from({ length: count }, (_, column) => ({ row, column })));

export interface FacilityVisual {
  facilityId: string;
  upgradeId: string;
  carriageId: CarriageId;
  anchor: { x: number; y: number };
  color: string;
  shape: "coil" | "cells" | "shutter" | "frame" | "loop" | "trays" | "heater" | "medical";
  equipmentFrame: number;
}

export const FACILITY_VISUALS: readonly FacilityVisual[] = [
  { facilityId: "power-core", upgradeId: "quiet-wiring", carriageId: "workshop", anchor: { x: 0.38, y: 0.42 }, color: "#72B4A6", shape: "coil", equipmentFrame: 27 },
  { facilityId: "power-core", upgradeId: "burst-buffer", carriageId: "workshop", anchor: { x: 0.38, y: 0.42 }, color: "#F2BD67", shape: "cells", equipmentFrame: 7 },
  { facilityId: "window-frame", upgradeId: "blackout-shutter", carriageId: "defense", anchor: { x: 0.74, y: 0.3 }, color: "#63716D", shape: "shutter", equipmentFrame: 25 },
  { facilityId: "window-frame", upgradeId: "observation-frame", carriageId: "defense", anchor: { x: 0.74, y: 0.3 }, color: "#9AB6B7", shape: "frame", equipmentFrame: 3 },
  { facilityId: "greenhouse-loop", upgradeId: "closed-return", carriageId: "greenhouse", anchor: { x: 0.2, y: 0.61 }, color: "#72B4A6", shape: "loop", equipmentFrame: 35 },
  { facilityId: "greenhouse-loop", upgradeId: "isolated-trays", carriageId: "greenhouse", anchor: { x: 0.2, y: 0.61 }, color: "#AAC18A", shape: "trays", equipmentFrame: 19 },
  { facilityId: "bedside-bay", upgradeId: "warm-berth", carriageId: "sleep", anchor: { x: 0.8, y: 0.62 }, color: "#F2BD67", shape: "heater", equipmentFrame: 31 },
  { facilityId: "bedside-bay", upgradeId: "medical-berth", carriageId: "sleep", anchor: { x: 0.8, y: 0.62 }, color: "#72B4A6", shape: "medical", equipmentFrame: 13 },
];

export const EQUIPMENT_ATLAS = {
  source: "./assets/art/v2/equipment/atlas.png",
  width: 1774,
  height: 887,
  columns: 10,
  rows: 5,
  frameCount: 50,
} as const;

export interface CosmeticVisual {
  id: string;
  carriageIds: readonly CarriageId[];
  equipmentFrame: number;
  anchor: { x: number; y: number };
  size: number;
  accent: string;
  detail: "note" | "qsl" | "lamp" | "gauge" | "garden-label" | "tool-wrap" | "stamp" | "log-cover";
}

export const COSMETIC_VISUALS: readonly CosmeticVisual[] = [
  { id: "COS-A07-NOTE", carriageIds: ["sleep"], equipmentFrame: 0, anchor: { x: 0.78, y: 0.37 }, size: 0.12, accent: "#EFE2C4", detail: "note" },
  { id: "COS-XU-QSL", carriageIds: ["workshop"], equipmentFrame: 9, anchor: { x: 0.71, y: 0.47 }, size: 0.17, accent: "#D3AB79", detail: "qsl" },
  { id: "COS-QUIET-LAMP", carriageIds: ["sleep"], equipmentFrame: 1, anchor: { x: 0.18, y: 0.49 }, size: 0.16, accent: "#F2BD67", detail: "lamp" },
  { id: "COS-RESERVE-GAUGE", carriageIds: ["defense"], equipmentFrame: 7, anchor: { x: 0.78, y: 0.44 }, size: 0.16, accent: "#72B4A6", detail: "gauge" },
  { id: "COS-GARDEN-LABEL", carriageIds: ["greenhouse"], equipmentFrame: 23, anchor: { x: 0.22, y: 0.48 }, size: 0.17, accent: "#AAC18A", detail: "garden-label" },
  { id: "COS-TOOL-WRAP", carriageIds: ["defense", "workshop"], equipmentFrame: 17, anchor: { x: 0.2, y: 0.58 }, size: 0.18, accent: "#A9774F", detail: "tool-wrap" },
  { id: "COS-TRAIN-STAMP", carriageIds: ["sleep", "defense", "workshop", "greenhouse", "kitchen"], equipmentFrame: 47, anchor: { x: 0.09, y: 0.2 }, size: 0.1, accent: "#D3AB79", detail: "stamp" },
  { id: "COS-FINAL-LOG", carriageIds: ["sleep", "workshop"], equipmentFrame: 47, anchor: { x: 0.25, y: 0.62 }, size: 0.16, accent: "#EFE2C4", detail: "log-cover" },
];

export interface EquipmentPlacement {
  frame: number;
  anchor: { x: number; y: number };
  size: number;
}

export const SCENE_STATE_EQUIPMENT: Readonly<Record<CarriageId, Readonly<Record<string, EquipmentPlacement>>>> = {
  sleep: {
    unprepared: { frame: 0, anchor: { x: 0.2, y: 0.52 }, size: 0.18 },
    secure: { frame: 1, anchor: { x: 0.2, y: 0.52 }, size: 0.18 },
    disturbed: { frame: 30, anchor: { x: 0.73, y: 0.59 }, size: 0.22 },
    restored: { frame: 49, anchor: { x: 0.2, y: 0.52 }, size: 0.16 },
  },
  defense: {
    unprepared: { frame: 14, anchor: { x: 0.58, y: 0.41 }, size: 0.17 },
    secure: { frame: 15, anchor: { x: 0.58, y: 0.41 }, size: 0.17 },
    breached: { frame: 2, anchor: { x: 0.45, y: 0.27 }, size: 0.2 },
    restored: { frame: 3, anchor: { x: 0.45, y: 0.27 }, size: 0.2 },
  },
  workshop: {
    unprepared: { frame: 8, anchor: { x: 0.72, y: 0.42 }, size: 0.2 },
    active: { frame: 9, anchor: { x: 0.72, y: 0.42 }, size: 0.2 },
    overloaded: { frame: 26, anchor: { x: 0.32, y: 0.45 }, size: 0.21 },
    restored: { frame: 27, anchor: { x: 0.32, y: 0.45 }, size: 0.21 },
  },
  greenhouse: {
    unprepared: { frame: 18, anchor: { x: 0.2, y: 0.48 }, size: 0.2 },
    productive: { frame: 19, anchor: { x: 0.2, y: 0.48 }, size: 0.2 },
    contaminated: { frame: 38, anchor: { x: 0.2, y: 0.63 }, size: 0.19 },
    restored: { frame: 39, anchor: { x: 0.2, y: 0.63 }, size: 0.19 },
  },
  kitchen: {
    sparse: { frame: 42, anchor: { x: 0.25, y: 0.45 }, size: 0.18 },
    prepared: { frame: 49, anchor: { x: 0.6, y: 0.43 }, size: 0.15 },
    spoiled: { frame: 46, anchor: { x: 0.62, y: 0.43 }, size: 0.18 },
    restored: { frame: 43, anchor: { x: 0.25, y: 0.45 }, size: 0.18 },
  },
};

export type ThreatFamilyId = "knocker" | "clinger" | "vine" | "echo" | "crowd";

export interface ThreatAtlasManifest {
  source: string;
  width: number;
  height: number;
  columns: 4;
  rows: 5;
  frameCount: 20;
  destination: NormalizedBounds;
  clips: {
    approach: A07ClipManifest;
    action: A07ClipManifest;
    resolve: A07ClipManifest;
  };
}

const THREAT_CLIPS = {
  approach: { start: 0, frames: 6, fps: 6, loop: false, keyFrame: 4 },
  action: { start: 6, frames: 8, fps: 8, loop: false, keyFrame: 4 },
  resolve: { start: 14, frames: 6, fps: 6, loop: false, keyFrame: 5 },
} as const;

export const THREAT_ATLASES: Readonly<Record<ThreatFamilyId, ThreatAtlasManifest>> = {
  knocker: { source: "./assets/art/v2/threats/knocker/atlas.png", width: 1122, height: 1402, columns: 4, rows: 5, frameCount: 20, destination: { x: 0.43, y: 0.18, width: 0.56, height: 0.315 }, clips: THREAT_CLIPS },
  clinger: { source: "./assets/art/v2/threats/clinger/atlas.png", width: 1122, height: 1402, columns: 4, rows: 5, frameCount: 20, destination: { x: 0.14, y: 0.02, width: 0.72, height: 0.405 }, clips: THREAT_CLIPS },
  vine: { source: "./assets/art/v2/threats/vine/atlas.png", width: 1122, height: 1402, columns: 4, rows: 5, frameCount: 20, destination: { x: 0.12, y: 0.28, width: 0.64, height: 0.36 }, clips: THREAT_CLIPS },
  echo: { source: "./assets/art/v2/threats/echo/atlas.png", width: 1122, height: 1402, columns: 4, rows: 5, frameCount: 20, destination: { x: 0.39, y: 0.16, width: 0.58, height: 0.326 }, clips: THREAT_CLIPS },
  crowd: { source: "./assets/art/v2/threats/crowd/atlas.png", width: 1122, height: 1402, columns: 4, rows: 5, frameCount: 20, destination: { x: 0.08, y: 0.19, width: 0.84, height: 0.472 }, clips: THREAT_CLIPS },
};

export function threatFamilyForId(definitionId: string): ThreatFamilyId | undefined {
  if (definitionId === "T002") return "knocker";
  if (definitionId === "T003") return "clinger";
  if (definitionId === "T004") return "vine";
  if (definitionId === "T005") return "echo";
  if (definitionId === "T006" || definitionId === "T008") return "crowd";
  return undefined;
}

export type ThreatClipId = "approach" | "action" | "resolve";

export const THREAT_RETREAT_DURATION_MS = 1000;

export interface ThreatRetreatVisual {
  contact: ThreatContact;
  family: ThreatFamilyId;
  startedAt: number;
}

export interface ThreatVisualLifecycle {
  runId: string | null;
  activeRef?: ThreatContact;
  activeStage?: ContactStage;
  activeResolvedAt?: number;
  retreat?: ThreatRetreatVisual;
}

export function threatClipForStage(stage: ContactStage): ThreatClipId {
  if (stage === "approach") return "approach";
  if (stage === "resolve") return "resolve";
  return "action";
}

export function updateThreatVisualLifecycle(
  previous: ThreatVisualLifecycle,
  runId: string | null,
  activeContact: ThreatContact | undefined,
  time: number,
): ThreatVisualLifecycle {
  if (previous.runId !== runId) {
    return {
      runId,
      activeRef: activeContact,
      activeStage: activeContact?.stage,
      ...(activeContact?.stage === "resolve" ? { activeResolvedAt: time } : {}),
    };
  }
  let retreat = previous.retreat;
  if (retreat && time - retreat.startedAt >= THREAT_RETREAT_DURATION_MS) retreat = undefined;
  const priorContact = previous.activeRef;
  if (priorContact && priorContact.id !== activeContact?.id) {
    const family = threatFamilyForId(priorContact.definitionId);
    const startedAt = previous.activeResolvedAt ?? time;
    if (priorContact.resolvedBy && family && time - startedAt < THREAT_RETREAT_DURATION_MS) {
      retreat = { contact: { ...priorContact }, family, startedAt };
    }
  }
  const sameContact = previous.activeRef?.id === activeContact?.id;
  const resolvedStartedAt = activeContact?.stage === "resolve"
    ? sameContact && previous.activeStage === "resolve"
      ? previous.activeResolvedAt ?? time
      : time
    : undefined;
  return {
    runId,
    activeRef: activeContact,
    activeStage: activeContact?.stage,
    ...(resolvedStartedAt !== undefined ? { activeResolvedAt: resolvedStartedAt } : {}),
    ...(retreat ? { retreat } : {}),
  };
}

export function sceneVisualState(run: RunState, carriageId: CarriageId): SceneVisualState {
  if (carriageId === "sleep") {
    if (run.phase === "dawn" || run.ended) return "restored";
    if (run.environment.temperature < 12 || run.environment.noise > 55 || run.survivor.sleep < 55) return "disturbed";
    return run.phase === "night" ? "secure" : "unprepared";
  }
  if (carriageId === "defense") {
    if (run.environment.hull < 70) return "breached";
    if (run.environment.hull < 100) return "restored";
    return run.phase === "night" ? "secure" : "unprepared";
  }
  if (carriageId === "workshop") {
    if (run.environment.noise > 70) return "overloaded";
    if (run.phase === "prep" && run.actionPoints < 5) return "active";
    return run.flags.includes("workshop-restored") ? "restored" : "unprepared";
  }
  if (carriageId === "greenhouse") {
    if ((run.story.greenTide?.reservoirContamination ?? 0) > 20) return "contaminated";
    if (run.crops.some((crop) => crop.stage >= 2)) return "productive";
    return run.flags.includes("greenhouse-restored") ? "restored" : "unprepared";
  }
  if (run.flags.includes("kitchen-spoiled")) return "spoiled";
  if (run.resources.food <= 2 || run.rationMode === "strict") return "sparse";
  return run.phase === "dawn" || run.flags.includes("kitchen-restored") ? "restored" : "prepared";
}

export interface A07Playback {
  clipId: A07ClipId;
  animationKey: string;
  freezeFrame?: number;
}

function latestPrepCarePlayback(run: RunState): A07Playback | undefined {
  if (run.phase !== "prep") return undefined;
  const comfortedToday = run.flags.includes(`comforted-${run.day}`);
  const hotMealToday = run.flags.includes(`hot-meal-${run.day}`);
  for (let index = run.ledger.length - 1; index >= 0; index -= 1) {
    const entry = run.ledger[index];
    if (!entry) continue;
    if (comfortedToday && entry.source === "prep.comfort") {
      return { clipId: "settle", animationKey: `settle:${entry.id}` };
    }
    if (hotMealToday && entry.source.startsWith("kitchen.hot-meal.")) {
      return { clipId: "drink", animationKey: `drink:${entry.id}` };
    }
  }
  return undefined;
}

export function a07PlaybackForRun(run: RunState): A07Playback {
  if (run.ended && run.outcome === "survivor-lost") {
    return { clipId: "sleep", animationKey: `dead:${run.runId}`, freezeFrame: 0 };
  }
  if (run.phase === "aftermath" || run.phase === "ending" || run.phase === "dawn") {
    return { clipId: "sit", animationKey: `sit:${run.day}:${run.phase}` };
  }
  if (run.phase === "night") {
    const contact = run.activeContact;
    if (contact?.stage === "attack" || contact?.stage === "breach") {
      return { clipId: "startle", animationKey: `startle:${contact.id}:${contact.stage}` };
    }
    const nightStartWakeups = run.voyage?.nightStartWakeups;
    if (nightStartWakeups !== undefined && run.survivor.wakeups > nightStartWakeups) {
      return { clipId: "startle", animationKey: `startle:wakeups:${run.survivor.wakeups}` };
    }
    if (contact?.stage === "warning") {
      return { clipId: "listen", animationKey: `listen:${contact.id}` };
    }
    if (run.environment.temperature < 12 || run.environment.noise > 55) {
      return { clipId: "turn", animationKey: `turn:${run.day}` };
    }
    return { clipId: "sleep", animationKey: `sleep:${run.day}:night` };
  }
  const care = latestPrepCarePlayback(run);
  if (care) return care;
  if (run.environment.temperature < 12 || run.environment.noise > 55) {
    return { clipId: "turn", animationKey: `turn:${run.day}:${run.phase}` };
  }
  return { clipId: "sleep", animationKey: `sleep:${run.day}:${run.phase}` };
}

export function a07ClipForRun(run: RunState): A07ClipId {
  return a07PlaybackForRun(run).clipId;
}

export function installedFacilityVisuals(run: RunState, carriageId: CarriageId): FacilityVisual[] {
  const facilities = run.voyage?.facilities ?? {};
  return FACILITY_VISUALS.filter((visual) =>
    visual.carriageId === carriageId
    && facilities[visual.facilityId]?.upgradeId === visual.upgradeId,
  );
}
