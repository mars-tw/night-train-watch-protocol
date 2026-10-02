import { DECORATIONS, DECORATION_SLOTS, MODULES } from "./content";
import { createProfile } from "./profile";
import { applyProfileLoadout } from "./profile-loadouts";
import { createQuestState } from "./quests";
import { createDefaultStoryState } from "./story";
import { createVoyageState } from "./voyage/engine";
import type { AppState, CropPlot, DecorationPlacement, ProfileState, RunState, SettingsState, StoryRouteId } from "./types";

export const DEFAULT_SETTINGS: SettingsState = {
  textScale: 100,
  reducedMotion: false,
  noCountdown: false,
  lowSpeed: false,
  sound: true,
};

export function createDecorationPlacements(): DecorationPlacement[] {
  return DECORATIONS.map((decoration) => {
    const slot = DECORATION_SLOTS.find((candidate) => candidate.id === decoration.defaultSlotId);
    if (!slot) throw new Error(`Missing decoration slot ${decoration.defaultSlotId}`);
    return { id: decoration.id, carriageId: slot.carriageId, slotId: slot.id, x: slot.x, y: slot.y };
  });
}

export function createCropPlots(): CropPlot[] {
  return [
    { id: "plot-a", stage: 0, dryDays: 0 },
    { id: "plot-b", stage: 0, dryDays: 0 },
  ];
}

const ROUTE_START_STATE = {
  R01: {
    resources: { energy: 75, fuel: 40, food: 5, water: 6, parts: 8, medicine: 1, data: 0 },
    environment: { temperature: 18, noise: 14, visibility: 42, hull: 100, weight: 54 },
    lastMessage: "守護協定已啟動。先檢查配電與乘客狀態。",
  },
  R02: {
    resources: { energy: 78, fuel: 44, food: 5, water: 6, parts: 8, medicine: 1, data: 0 },
    environment: { temperature: 12, noise: 14, visibility: 42, hull: 100, weight: 54 },
    lastMessage: "白霜線守護協定已啟動。先確認六枚熱能單元與臥鋪溫度。",
  },
  R03: {
    resources: { energy: 75, fuel: 40, food: 5, water: 8, parts: 8, medicine: 1, data: 0 },
    environment: { temperature: 18, noise: 14, visibility: 42, hull: 100, weight: 54 },
    lastMessage: "綠潮線守護協定已啟動。先檢查集水槽、四枚水樣與兩座種植槽。",
  },
} as const satisfies Record<
  StoryRouteId,
  Pick<RunState, "resources" | "environment" | "lastMessage">
>;

let runCounter = 0;

function createRunId(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.();
  if (randomUUID) return `run-${randomUUID}`;
  runCounter += 1;
  return `run-${Date.now().toString(36)}-${runCounter.toString(36)}`;
}

export function createRun(
  seed = `${Date.now()}`,
  routeId: StoryRouteId = "R01",
  profile?: ProfileState,
): RunState {
  const routeStart = ROUTE_START_STATE[routeId];
  const runId = createRunId();
  const run: RunState = {
    schemaVersion: 6,
    runId,
    seed,
    day: 1,
    maxDays: 7,
    phase: "prep",
    actionPoints: 5,
    rationMode: "standard",
    nightPowerDemand: 0,
    outcome: "active",
    routeId,
    resources: { ...routeStart.resources },
    survivor: { health: 85, stress: 20, infection: 0, trust: 50, sleep: 100, wakeups: 0 },
    environment: { ...routeStart.environment },
    modules: MODULES.slice(0, 3).map((definition, index) => ({
      id: `MI${index + 1}`,
      definitionId: definition.id,
      slotId: ["defense-window", "sleep-floor", "greenhouse-wall"][index] ?? `slot-${index}`,
      active: true,
      powered: true,
      durability: 100,
      mk: 1,
    })),
    decorations: createDecorationPlacements(),
    crops: createCropPlots(),
    story: createDefaultStoryState(routeId),
    techOwned: [],
    flags: [],
    ledger: [],
    quests: createQuestState(runId, routeId, 1),
    voyage: createVoyageState(),
    ended: false,
    lastMessage: routeStart.lastMessage,
  };
  return applyProfileLoadout(run, profile);
}

export function createAppState(): AppState {
  return {
    screen: "menu",
    run: null,
    profile: createProfile(),
    settings: { ...DEFAULT_SETTINGS },
    selectedTechId: "E1",
    selectedModuleId: "M003",
    selectedRouteId: "RN02",
    carriagePanel: "scene",
    nightPaused: false,
    eventPreview: false,
    routePreview: false,
    modulePreview: false,
    decorating: false,
    selectedDecorationId: "lantern",
    activeCarriageId: "greenhouse",
    selectedCropId: "lettuce",
    actionFeedback: [],
    moduleCategory: "全部",
    techBranch: "能源",
    saveStatus: "none",
  };
}
