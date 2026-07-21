import { MODULES } from "./content";
import type { AppState, RunState, SettingsState } from "./types";

export const DEFAULT_SETTINGS: SettingsState = {
  textScale: 100,
  reducedMotion: false,
  noCountdown: false,
  lowSpeed: false,
  sound: true,
};

export function createRun(seed = `${Date.now()}`): RunState {
  return {
    schemaVersion: 1,
    seed,
    day: 1,
    maxDays: 7,
    phase: "prep",
    actionPoints: 5,
    rationMode: "standard",
    nightPowerDemand: 0,
    outcome: "active",
    routeId: "R01",
    resources: { energy: 75, fuel: 40, food: 5, water: 6, parts: 8, medicine: 1, data: 0 },
    survivor: { health: 85, stress: 20, infection: 0, trust: 50, sleep: 100, wakeups: 0 },
    environment: { temperature: 18, noise: 14, visibility: 42, hull: 100, weight: 54 },
    modules: MODULES.slice(0, 3).map((definition, index) => ({
      id: `MI${index + 1}`,
      definitionId: definition.id,
      slotId: ["window-right", "floor-a", "wall-a"][index] ?? `slot-${index}`,
      active: true,
      powered: true,
      durability: 100,
      mk: 1,
    })),
    techOwned: [],
    flags: [],
    ledger: [],
    ended: false,
    lastMessage: "守護協定已啟動。先檢查配電與乘客狀態。",
  };
}

export function createAppState(): AppState {
  return {
    screen: "menu",
    run: null,
    settings: { ...DEFAULT_SETTINGS },
    selectedTechId: "E1",
    selectedModuleId: "M003",
    selectedRouteId: "RN02",
    carriagePanel: "module",
    nightPaused: false,
    eventPreview: false,
    routePreview: false,
    modulePreview: false,
    moduleCategory: "全部",
    techBranch: "能源",
    saveStatus: "none",
  };
}
