import type {
  FrostZone,
  HeatTokenId,
  RunState,
  SettingsState,
  StoryRouteId,
  T009InteractionState,
  ThermalRoutingState,
  ThreatContact,
  WhiteFrostState,
} from "./types";
import { DECORATION_SLOTS } from "./content";
import { createCropPlots, createDecorationPlacements } from "./model";
import {
  createDefaultStoryState,
  createDefaultWhiteFrostState,
  getThermalAllocation,
} from "./story";

const DB_NAME = "night-train-save";
const STORE_NAME = "snapshots";
const CURRENT_KEY = "run.current";
const BACKUP_KEY = "run.backup";
const SETTINGS_KEY = "settings";

const HEAT_TOKEN_IDS: readonly HeatTokenId[] = ["H1", "H2", "H3", "H4", "H5", "H6"];
const FROST_ZONES: readonly FrostZone[] = ["BERTH", "DEICER", "LOOP"];
const FROST_BRANCHES = ["CARE", "CLEAR", "SUSTAIN"] as const;
const FROST_FINALE_STAGES = ["inactive", "warm", "blizzard", "clear", "accelerate", "resolved"] as const;
const FROST_CONSENTS = ["unknown", "shared", "protected", "a07-plan"] as const;
const FROST_SWITCH_METHODS = ["deicer", "repair", "ram", "bypass"] as const;
const FROST_FINAL_DECISIONS = ["joint", "shield", "a07-plan", "emergency-stop"] as const;
const FROST_ENDING_IDS = [
  "frost-shared-arrival",
  "frost-guarded-arrival",
  "frost-chosen-detour",
  "frost-emergency-shelter",
] as const;

function finiteInteger(value: unknown, fallback: number, minimum = 0, maximum = 999): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.floor(value)))
    : fallback;
}

function repairThermalRouting(saved: Partial<ThermalRoutingState> | null | undefined): ThermalRoutingState {
  const defaults = createDefaultWhiteFrostState().thermal;
  const savedTokens = Array.isArray(saved?.tokens) ? saved.tokens : [];
  const tokens = defaults.tokens.map((fallback) => {
    const candidate = savedTokens.find((token) => token?.id === fallback.id);
    return candidate && FROST_ZONES.includes(candidate.zone)
      ? { id: fallback.id, zone: candidate.zone }
      : { ...fallback };
  });
  const savedAllocation = saved?.committedAllocation;
  const committedAllocation = savedAllocation
    && FROST_ZONES.every((zone) => Number.isInteger(savedAllocation[zone]) && savedAllocation[zone] >= 0)
    && FROST_ZONES.reduce((total, zone) => total + savedAllocation[zone], 0) === 6
    ? { ...savedAllocation }
    : getThermalAllocation(tokens);
  const selectedTokenId = saved?.selectedTokenId && HEAT_TOKEN_IDS.includes(saved.selectedTokenId)
    ? saved.selectedTokenId
    : null;
  return {
    tokens,
    selectedTokenId,
    committedAllocation,
    committedDay: typeof saved?.committedDay === "number" ? saved.committedDay : null,
    settlementIds: Array.isArray(saved?.settlementIds)
      ? [...new Set(saved.settlementIds.filter((id): id is string => typeof id === "string"))]
      : [],
    revision: typeof saved?.revision === "number" && Number.isFinite(saved.revision)
      ? Math.max(0, Math.floor(saved.revision))
      : 0,
  };
}

function repairWhiteFrost(saved: Partial<WhiteFrostState> | null | undefined): WhiteFrostState {
  const defaults = createDefaultWhiteFrostState();
  return {
    ...defaults,
    version: 1,
    branch: FROST_BRANCHES.includes(saved?.branch as typeof FROST_BRANCHES[number])
      ? saved?.branch ?? null
      : null,
    finaleStage: FROST_FINALE_STAGES.includes(saved?.finaleStage as typeof FROST_FINALE_STAGES[number])
      ? saved?.finaleStage ?? defaults.finaleStage
      : defaults.finaleStage,
    consent: FROST_CONSENTS.includes(saved?.consent as typeof FROST_CONSENTS[number])
      ? saved?.consent ?? defaults.consent
      : defaults.consent,
    heatMapQuality: saved?.heatMapQuality === "full" ? "full" : "partial",
    switchCleared: saved?.switchCleared === true,
    switchMethod: FROST_SWITCH_METHODS.includes(saved?.switchMethod as typeof FROST_SWITCH_METHODS[number])
      ? saved?.switchMethod ?? null
      : null,
    heaterPatched: saved?.heaterPatched === true,
    coauthorEvidence: saved?.coauthorEvidence === true,
    branchOperationComplete: saved?.branchOperationComplete === true,
    delayedConsequenceSettled: saved?.delayedConsequenceSettled === true,
    finalDecision: FROST_FINAL_DECISIONS.includes(saved?.finalDecision as typeof FROST_FINAL_DECISIONS[number])
      ? saved?.finalDecision ?? null
      : null,
    endingId: FROST_ENDING_IDS.includes(saved?.endingId as typeof FROST_ENDING_IDS[number])
      ? saved?.endingId ?? null
      : null,
    endingReasons: Array.isArray(saved?.endingReasons) ? saved.endingReasons.filter((reason): reason is string => typeof reason === "string") : [],
    rewardSettled: saved?.rewardSettled === true,
    thermal: repairThermalRouting(saved?.thermal),
    coldDebt: finiteInteger(saved?.coldDebt, 0, 0, 99),
    pendingRouteFuelPenalty: finiteInteger(saved?.pendingRouteFuelPenalty, 0, 0, 99),
    frostRisk: finiteInteger(saved?.frostRisk, 0, 0, 99),
    manualScrapeHullCost: saved?.manualScrapeHullCost === 4 ? 4 : 6,
    jointTrustRequirement: finiteInteger(saved?.jointTrustRequirement, defaults.jointTrustRequirement, 0, 100),
    warmRequirementDiscount: finiteInteger(saved?.warmRequirementDiscount, 0, 0, 3),
    recordCalibrated: saved?.recordCalibrated === true,
  };
}

function repairActiveContact(saved: ThreatContact | undefined): ThreatContact | undefined {
  if (!saved?.interaction || saved.interaction.kind !== "T009") return saved;
  const interaction = saved.interaction as T009InteractionState & { freeMissUsed?: boolean };
  const requiredZones = Array.isArray(interaction.requiredZones)
    && interaction.requiredZones.length === 2
    && interaction.requiredZones.every((zone) => FROST_ZONES.includes(zone))
    && interaction.requiredZones[0] !== interaction.requiredZones[1]
    ? [...interaction.requiredZones] as [FrostZone, FrostZone]
    : ["BERTH", "DEICER"] as [FrostZone, FrostZone];
  const attempts = finiteInteger(interaction.attempts, 0, 0, 999);
  const firstMissRevealed = interaction.firstMissRevealed === true;
  return {
    ...saved,
    interaction: {
      kind: "T009",
      requiredZones,
      inspectedZones: Array.isArray(interaction.inspectedZones)
        ? [...new Set(interaction.inspectedZones.filter((zone) => FROST_ZONES.includes(zone)))]
        : [],
      attempts,
      firstMissRevealed,
      freeMissUsed: typeof interaction.freeMissUsed === "boolean"
        ? interaction.freeMissUsed
        : firstMissRevealed && attempts > 0,
      manualFallbackAvailable: interaction.manualFallbackAvailable === true,
      ...(interaction.resolvedBy === "thermal" || interaction.resolvedBy === "manual-scrape"
        ? { resolvedBy: interaction.resolvedBy }
        : {}),
    },
  };
}

export function parseRun(raw: string | null): RunState | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as RunState & { schemaVersion: number };
  if (![1, 2, 3, 4].includes(value.schemaVersion) || !value.seed || !value.resources || !value.survivor) throw new Error("Invalid save schema");
  const routeId: StoryRouteId = value.routeId === "R02" ? "R02" : "R01";
  const defaults = createDecorationPlacements();
  const decorations = defaults.map((fallback) => {
    const saved = Array.isArray(value.decorations) ? value.decorations.find((item) => item.id === fallback.id) : undefined;
    if (!saved) return fallback;
    if (saved.slotId && saved.carriageId) return saved;
    const compatible = DECORATION_SLOTS.filter((slot) => slot.accepts.includes(fallback.id));
    const closest = compatible.sort((a, b) => Math.hypot(a.x - saved.x, a.y - saved.y) - Math.hypot(b.x - saved.x, b.y - saved.y))[0];
    return closest ? { id: fallback.id, carriageId: closest.carriageId, slotId: closest.id, x: closest.x, y: closest.y } : fallback;
  });
  const storyDefaults = createDefaultStoryState(routeId);
  const savedStory = value.story;
  return {
    ...value,
    schemaVersion: 4,
    routeId,
    actionPoints: typeof value.actionPoints === "number" ? value.actionPoints : 5,
    rationMode: value.rationMode ?? "standard",
    nightPowerDemand: typeof value.nightPowerDemand === "number" ? value.nightPowerDemand : 0,
    outcome: value.outcome ?? (value.ended ? "victory" : "active"),
    decorations,
    crops: Array.isArray(value.crops) && value.crops.length === 2 ? value.crops : createCropPlots(),
    activeContact: repairActiveContact(value.activeContact),
    story: {
      ...storyDefaults,
      ...(savedStory ?? {}),
      version: 2,
      flags: {
        ...storyDefaults.flags,
        ...(savedStory?.flags ?? {}),
      },
      queue: Array.isArray(savedStory?.queue) ? savedStory.queue : [],
      seenEventIds: Array.isArray(savedStory?.seenEventIds) ? savedStory.seenEventIds : [],
      endingReasons: Array.isArray(savedStory?.endingReasons) ? savedStory.endingReasons : [],
      dawnLogIds: Array.isArray(savedStory?.dawnLogIds) ? savedStory.dawnLogIds : [],
      whiteFrost: routeId === "R02"
        ? repairWhiteFrost(savedStory?.whiteFrost)
        : null,
    },
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Cannot open save database"));
  });
}

async function idbWrite(key: string, value: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Cannot write save"));
  });
  database.close();
}

async function idbRead(key: string): Promise<string | null> {
  const database = await openDatabase();
  const value = await new Promise<string | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
    request.onerror = () => reject(request.error ?? new Error("Cannot read save"));
  });
  database.close();
  return value;
}

export class SaveService {
  public async hasSave(): Promise<boolean> {
    try {
      return Boolean((await idbRead(CURRENT_KEY)) ?? localStorage.getItem(CURRENT_KEY));
    } catch {
      return Boolean(localStorage.getItem(CURRENT_KEY));
    }
  }

  public async save(run: RunState): Promise<void> {
    const serialized = JSON.stringify(run);
    const previous = localStorage.getItem(CURRENT_KEY);
    if (previous) localStorage.setItem(BACKUP_KEY, previous);
    localStorage.setItem(CURRENT_KEY, serialized);
    try {
      const idbCurrent = await idbRead(CURRENT_KEY);
      if (idbCurrent) await idbWrite(BACKUP_KEY, idbCurrent);
      await idbWrite(CURRENT_KEY, serialized);
    } catch {
      // localStorage remains the deterministic offline fallback.
    }
  }

  public async load(): Promise<{ run: RunState | null; recovered: boolean }> {
    const localCurrent = localStorage.getItem(CURRENT_KEY);
    const localBackup = localStorage.getItem(BACKUP_KEY);
    let idbCurrent: string | null = null;
    let idbBackup: string | null = null;
    try {
      idbCurrent = await idbRead(CURRENT_KEY);
      idbBackup = await idbRead(BACKUP_KEY);
    } catch {
      // The synchronous local snapshot remains usable when IndexedDB is unavailable.
    }

    // save() writes localStorage before awaiting IndexedDB. Prefer that synchronous
    // snapshot so an immediate reload cannot resurrect an older IDB record.
    const candidates = [
      { raw: localCurrent, recovered: false },
      { raw: idbCurrent, recovered: false },
      { raw: localBackup, recovered: true },
      { raw: idbBackup, recovered: true },
    ];
    for (const candidate of candidates) {
      if (!candidate.raw) continue;
      try {
        return { run: parseRun(candidate.raw), recovered: candidate.recovered };
      } catch {
        // Try the next current/backup copy before declaring the save unavailable.
      }
    }
    return { run: null, recovered: false };
  }

  public saveSettings(settings: SettingsState): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  public loadSettings(): SettingsState | null {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as SettingsState | null;
    } catch {
      return null;
    }
  }
}

export const saveKeys = { current: CURRENT_KEY, backup: BACKUP_KEY } as const;
