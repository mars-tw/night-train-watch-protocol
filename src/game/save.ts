import type {
  FrostZone,
  CropPlot,
  GreenCycleState,
  GreenCycleZone,
  GreenSampleId,
  GreenTideState,
  HeatTokenId,
  LurkerZone,
  ProfileState,
  RunState,
  SettingsState,
  StoryRouteId,
  T008InteractionState,
  T009InteractionState,
  T013InteractionState,
  ThermalRoutingState,
  ThreatContact,
  WhiteFrostState,
} from "./types";
import { DECORATION_SLOTS } from "./content";
import { createCropPlots, createDecorationPlacements } from "./model";
import { createProfile, repairProfile } from "./profile";
import { createQuestState, repairQuestState } from "./quests";
import {
  createDefaultGreenTideState,
  createDefaultStoryState,
  createDefaultWhiteFrostState,
  getThermalAllocation,
} from "./story";
import { repairVoyageState } from "./voyage/engine";

const DB_NAME = "night-train-save";
const STORE_NAME = "snapshots";
const LEGACY_CURRENT_KEY = "run.current";
const LEGACY_BACKUP_KEY = "run.backup";
const CURRENT_KEY = "ntwp.v2.current";
const BACKUP_KEY = "ntwp.v2.backup";
const PROFILE_RECOVERY_KEY = "ntwp.v2.profile-recovery";
const SETTINGS_KEY = "settings";

export const SAVE_KEYS = {
  current: CURRENT_KEY,
  backup: BACKUP_KEY,
  profileRecovery: PROFILE_RECOVERY_KEY,
  legacyCurrent: LEGACY_CURRENT_KEY,
  legacyBackup: LEGACY_BACKUP_KEY,
  settings: SETTINGS_KEY,
} as const;

const HEAT_TOKEN_IDS: readonly HeatTokenId[] = ["H1", "H2", "H3", "H4", "H5", "H6"];
const FROST_ZONES: readonly FrostZone[] = ["BERTH", "DEICER", "LOOP"];
const STORY_ROUTES: readonly StoryRouteId[] = ["R01", "R02", "R03"];
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
const GREEN_BRANCHES = ["CULTIVATE", "FILTER", "PURGE"] as const;
const GREEN_CYCLE_ZONES: readonly GreenCycleZone[] = ["INTAKE", "FILTER", "GROW_A", "GROW_B", "DRAIN"];
const GREEN_SAMPLE_IDS: readonly GreenSampleId[] = ["S1", "S2", "S3", "S4"];
const GREEN_SAMPLE_QUALITIES = ["unknown", "clean", "tainted"] as const;
const GREEN_FINALE_STAGES = ["inactive", "gate", "contact", "decision", "resolved"] as const;
const GREEN_FINAL_DECISIONS = ["seedbank", "symbiosis", "firebreak", "quarantine"] as const;
const GREEN_ENDING_IDS = ["green-seedbank", "green-symbiosis", "green-firebreak", "green-quarantine"] as const;
const LURKER_ZONES: readonly LurkerZone[] = ["CANOPY", "FILTER", "UNDERBED"];

function finiteInteger(value: unknown, fallback: number, minimum = 0, maximum = 999): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.floor(value)))
    : fallback;
}

function repairCropPlots(saved: unknown): CropPlot[] {
  const defaults = createCropPlots();
  if (!Array.isArray(saved) || saved.length !== defaults.length) return defaults;
  return defaults.map((fallback) => {
    const candidate = saved.find((plot): plot is CropPlot => plot?.id === fallback.id);
    if (!candidate) return fallback;
    const legacyGrowthNights = Math.max(0, finiteInteger(candidate.stage, 0, 0, 3) - 1);
    return {
      ...candidate,
      poweredGrowthNights: finiteInteger(candidate.poweredGrowthNights, legacyGrowthNights, 0, 99),
    };
  });
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

function repairGreenCycle(saved: Partial<GreenCycleState> | null | undefined): GreenCycleState {
  const defaults = createDefaultGreenTideState().cycle;
  const savedSamples = Array.isArray(saved?.samples) ? saved.samples : [];
  const samples = defaults.samples.map((fallback) => {
    const candidate = savedSamples.find((sample) => sample?.id === fallback.id);
    if (!candidate) return { ...fallback };
    const quality = GREEN_SAMPLE_QUALITIES.includes(
      candidate.quality as typeof GREEN_SAMPLE_QUALITIES[number],
    )
      ? candidate.quality
      : fallback.quality;
    return {
      id: fallback.id,
      quality,
      revealed: quality !== "unknown" && candidate.revealed === true,
      zone: GREEN_CYCLE_ZONES.includes(candidate.zone) ? candidate.zone : fallback.zone,
    };
  });
  return {
    samples,
    selectedSampleId: saved?.selectedSampleId && GREEN_SAMPLE_IDS.includes(saved.selectedSampleId)
      ? saved.selectedSampleId
      : null,
    committedDay: typeof saved?.committedDay === "number"
      && Number.isInteger(saved.committedDay)
      && saved.committedDay >= 1
      && saved.committedDay <= 7
      ? saved.committedDay
      : null,
    settlementIds: Array.isArray(saved?.settlementIds)
      ? [...new Set(saved.settlementIds.filter((id): id is string => typeof id === "string"))]
      : [],
    revision: finiteInteger(saved?.revision, 0, 0, 999_999),
    attempts: finiteInteger(saved?.attempts, 0, 0, 999),
    firstMissRevealed: saved?.firstMissRevealed === true,
    manualDrainAvailable: saved?.manualDrainAvailable === true,
  };
}

function repairGreenTide(saved: Partial<GreenTideState> | null | undefined): GreenTideState {
  const defaults = createDefaultGreenTideState();
  const savedPlotContamination = saved?.plotContamination;
  const isolatedPlots = Array.isArray(saved?.isolatedPlots)
    ? [...new Set(saved.isolatedPlots.filter((plot): plot is "plot-a" | "plot-b" =>
      plot === "plot-a" || plot === "plot-b",
    ))]
    : [];
  return {
    ...defaults,
    version: 1,
    branch: GREEN_BRANCHES.includes(saved?.branch as typeof GREEN_BRANCHES[number])
      ? saved?.branch ?? null
      : null,
    finaleStage: GREEN_FINALE_STAGES.includes(saved?.finaleStage as typeof GREEN_FINALE_STAGES[number])
      ? saved?.finaleStage ?? defaults.finaleStage
      : defaults.finaleStage,
    seedStock: finiteInteger(saved?.seedStock, defaults.seedStock, 0, 999),
    reservoirContamination: finiteInteger(saved?.reservoirContamination, 0, 0, 100),
    plotContamination: {
      "plot-a": finiteInteger(savedPlotContamination?.["plot-a"], 0, 0, 100),
      "plot-b": finiteInteger(savedPlotContamination?.["plot-b"], 0, 0, 100),
    },
    isolatedPlots,
    branchOperationComplete: saved?.branchOperationComplete === true,
    sourceLocated: saved?.sourceLocated === true,
    filterCalibrated: saved?.filterCalibrated === true,
    truthShared: saved?.truthShared === true,
    finalDecision: GREEN_FINAL_DECISIONS.includes(
      saved?.finalDecision as typeof GREEN_FINAL_DECISIONS[number],
    )
      ? saved?.finalDecision ?? null
      : null,
    endingId: GREEN_ENDING_IDS.includes(saved?.endingId as typeof GREEN_ENDING_IDS[number])
      ? saved?.endingId ?? null
      : null,
    endingReasons: Array.isArray(saved?.endingReasons)
      ? saved.endingReasons.filter((reason): reason is string => typeof reason === "string")
      : [],
    rewardSettled: saved?.rewardSettled === true,
    cycle: repairGreenCycle(saved?.cycle),
  };
}

function repairActiveContact(saved: ThreatContact | undefined): ThreatContact | undefined {
  if (!saved?.interaction) return saved;
  if (saved.interaction.kind === "T008") {
    const interaction = saved.interaction as T008InteractionState;
    return {
      ...saved,
      interaction: {
        kind: "T008",
        targetZone: LURKER_ZONES.includes(interaction.targetZone) ? interaction.targetZone : "CANOPY",
        inspectedZones: Array.isArray(interaction.inspectedZones)
          ? [...new Set(interaction.inspectedZones.filter((zone) => LURKER_ZONES.includes(zone)))]
          : [],
        attempts: finiteInteger(interaction.attempts, 0, 0, 999),
        firstMissRevealed: interaction.firstMissRevealed === true,
        manualFallbackAvailable: interaction.manualFallbackAvailable === true,
        ...(interaction.resolvedBy === "marked" || interaction.resolvedBy === "manual-seal"
          ? { resolvedBy: interaction.resolvedBy }
          : {}),
      },
    };
  }
  if (saved.interaction.kind === "T013") {
    const interaction = saved.interaction as T013InteractionState;
    const savedContaminatedIds = Array.isArray(interaction.contaminatedSampleIds)
      ? [...new Set(interaction.contaminatedSampleIds.filter((id) => GREEN_SAMPLE_IDS.includes(id)))]
      : [];
    const contaminatedSampleIds = savedContaminatedIds.length === 2
      ? savedContaminatedIds as [GreenSampleId, GreenSampleId]
      : ["S1", "S2"] as [GreenSampleId, GreenSampleId];
    return {
      ...saved,
      interaction: {
        kind: "T013",
        contaminatedSampleIds,
        inspectedSampleIds: Array.isArray(interaction.inspectedSampleIds)
          ? [...new Set(interaction.inspectedSampleIds.filter((id) => GREEN_SAMPLE_IDS.includes(id)))]
          : [],
        attempts: finiteInteger(interaction.attempts, 0, 0, 999),
        firstMissRevealed: interaction.firstMissRevealed === true,
        manualFallbackAvailable: interaction.manualFallbackAvailable === true,
        ...(interaction.resolvedBy === "cycle" || interaction.resolvedBy === "manual-drain"
          ? { resolvedBy: interaction.resolvedBy }
          : {}),
      },
    };
  }
  if (saved.interaction.kind !== "T009") return saved;
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

function parseStoryRouteId(value: unknown, schemaVersion: number): StoryRouteId {
  if (value === undefined || value === null) {
    if (schemaVersion <= 4) return "R01";
    throw new Error("Invalid save route");
  }
  if (STORY_ROUTES.includes(value as StoryRouteId)) return value as StoryRouteId;
  throw new Error("Invalid save route");
}

export function parseRun(raw: string | null): RunState | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as Omit<RunState, "schemaVersion" | "runId" | "quests"> & {
    schemaVersion: number;
    runId?: unknown;
    quests?: RunState["quests"];
    routeId?: unknown;
  };
  if (![1, 2, 3, 4, 5, 6].includes(value.schemaVersion) || !value.seed || !value.resources || !value.survivor) throw new Error("Invalid save schema");
  const routeId = parseStoryRouteId(value.routeId, value.schemaVersion);
  const day = finiteInteger(value.day, 1, 1, 7);
  if (value.schemaVersion === 6 && (typeof value.runId !== "string" || !value.runId)) throw new Error("Invalid save run id");
  const runId = typeof value.runId === "string" && value.runId
    ? value.runId
    : `legacy-${routeId}-${value.seed}`.replace(/[^A-Za-z0-9._:-]/g, "-");
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
  const migrated = {
    ...value,
    schemaVersion: 6 as const,
    runId,
    day,
    routeId,
    actionPoints: typeof value.actionPoints === "number" ? value.actionPoints : 5,
    rationMode: value.rationMode ?? "standard",
    nightPowerDemand: typeof value.nightPowerDemand === "number" ? value.nightPowerDemand : 0,
    outcome: value.outcome ?? (value.ended ? "victory" : "active"),
    decorations,
    crops: repairCropPlots(value.crops),
    activeContact: repairActiveContact(value.activeContact),
    story: {
      ...storyDefaults,
      ...(savedStory ?? {}),
      version: 3,
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
      greenTide: routeId === "R03"
        ? repairGreenTide(savedStory?.greenTide)
        : null,
    },
    quests: repairQuestState(value.quests, runId, routeId, day),
    voyage: repairVoyageState(value.voyage),
  } satisfies RunState;
  if (value.schemaVersion < 6) {
    migrated.quests = createQuestState(runId, routeId, day);
    migrated.quests.importedFromLegacy = true;
  }
  return migrated;
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

async function idbWriteBatch(entries: ReadonlyArray<readonly [string, string]>): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    for (const [key, value] of entries) store.put(value, key);
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

export interface SaveEnvelopeV2 {
  format: "ntwp.v2";
  version: 1;
  savedAt: number;
  run: RunState;
  profile: ProfileState;
}

interface ProfileRecoveryEnvelope {
  format: "ntwp.v2.profile";
  version: 1;
  savedAt: number;
  profile: ProfileState;
}

function parseEnvelope(raw: string | null): { run: RunState; profile: ProfileState } | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<SaveEnvelopeV2>;
  if (value.format !== "ntwp.v2" || value.version !== 1 || !value.run) throw new Error("Invalid save envelope");
  const run = parseRun(JSON.stringify(value.run));
  if (!run) throw new Error("Invalid save run");
  return { run, profile: repairProfile(value.profile) };
}

function parseProfileRecovery(raw: string | null): ProfileState | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<ProfileRecoveryEnvelope>;
  if (value.format !== "ntwp.v2.profile" || value.version !== 1 || !value.profile) throw new Error("Invalid profile recovery");
  return repairProfile(value.profile);
}

function mergeProfileRecovery(profile: ProfileState, rawCandidates: Array<string | null>): ProfileState {
  for (const raw of rawCandidates) {
    if (!raw) continue;
    try {
      const recovery = parseProfileRecovery(raw);
      if (!recovery || recovery.profileId !== profile.profileId) continue;
      return repairProfile({
        ...profile,
        createdAt: Math.min(profile.createdAt, recovery.createdAt),
        updatedAt: Math.max(profile.updatedAt, recovery.updatedAt),
        routeUnlocks: [...profile.routeUnlocks, ...recovery.routeUnlocks],
        blueprints: [...profile.blueprints, ...recovery.blueprints],
        decorations: [...profile.decorations, ...recovery.decorations],
        journal: [...profile.journal, ...recovery.journal],
        milestones: [...profile.milestones, ...recovery.milestones],
        rewardReceipts: [...profile.rewardReceipts, ...recovery.rewardReceipts],
      });
    } catch {
      // A corrupt recovery snapshot never invalidates the matching run envelope.
    }
  }
  return profile;
}

function restoreLocalValue(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Preserve the original write failure; the previous current envelope remains authoritative.
  }
}

export class SaveService {
  public async hasSave(): Promise<boolean> {
    try {
      return Boolean(
        localStorage.getItem(CURRENT_KEY)
        ?? localStorage.getItem(LEGACY_CURRENT_KEY)
        ?? await idbRead(CURRENT_KEY)
        ?? await idbRead(LEGACY_CURRENT_KEY),
      );
    } catch {
      return Boolean(localStorage.getItem(CURRENT_KEY) ?? localStorage.getItem(LEGACY_CURRENT_KEY));
    }
  }

  public async save(run: RunState, profile?: ProfileState): Promise<void> {
    const resolvedProfile = repairProfile(profile ?? await this.loadProfile());
    const envelope: SaveEnvelopeV2 = {
      format: "ntwp.v2",
      version: 1,
      savedAt: Date.now(),
      run: parseRun(JSON.stringify(run)) ?? run,
      profile: resolvedProfile,
    };
    const serialized = JSON.stringify(envelope);
    const recovery = JSON.stringify({
      format: "ntwp.v2.profile",
      version: 1,
      savedAt: envelope.savedAt,
      profile: resolvedProfile,
    } satisfies ProfileRecoveryEnvelope);
    const previous = localStorage.getItem(CURRENT_KEY);
    const previousBackup = localStorage.getItem(BACKUP_KEY);
    const previousRecovery = localStorage.getItem(PROFILE_RECOVERY_KEY);
    try {
      localStorage.setItem(PROFILE_RECOVERY_KEY, recovery);
      if (previous) localStorage.setItem(BACKUP_KEY, previous);
      localStorage.setItem(CURRENT_KEY, serialized);
    } catch (error) {
      restoreLocalValue(PROFILE_RECOVERY_KEY, previousRecovery);
      restoreLocalValue(BACKUP_KEY, previousBackup);
      restoreLocalValue(CURRENT_KEY, previous);
      throw error;
    }
    try {
      const idbCurrent = await idbRead(CURRENT_KEY);
      const entries: Array<readonly [string, string]> = [
        [CURRENT_KEY, serialized],
        [PROFILE_RECOVERY_KEY, recovery],
      ];
      if (idbCurrent) entries.push([BACKUP_KEY, idbCurrent]);
      await idbWriteBatch(entries);
    } catch {
      // The complete localStorage envelope remains the deterministic offline fallback.
    }
  }

  public async load(): Promise<{ run: RunState | null; recovered: boolean; profile: ProfileState }> {
    const localCurrent = localStorage.getItem(CURRENT_KEY);
    const localBackup = localStorage.getItem(BACKUP_KEY);
    const localProfileRecovery = localStorage.getItem(PROFILE_RECOVERY_KEY);
    const legacyLocalCurrent = localStorage.getItem(LEGACY_CURRENT_KEY);
    const legacyLocalBackup = localStorage.getItem(LEGACY_BACKUP_KEY);
    let idbCurrent: string | null = null;
    let idbBackup: string | null = null;
    let legacyIdbCurrent: string | null = null;
    let legacyIdbBackup: string | null = null;
    let idbProfileRecovery: string | null = null;
    try {
      idbCurrent = await idbRead(CURRENT_KEY);
      idbBackup = await idbRead(BACKUP_KEY);
      idbProfileRecovery = await idbRead(PROFILE_RECOVERY_KEY);
      legacyIdbCurrent = await idbRead(LEGACY_CURRENT_KEY);
      legacyIdbBackup = await idbRead(LEGACY_BACKUP_KEY);
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
        const loaded = parseEnvelope(candidate.raw);
        if (loaded) {
          const profile = candidate.recovered
            ? mergeProfileRecovery(loaded.profile, [localProfileRecovery, idbProfileRecovery])
            : loaded.profile;
          return { run: loaded.run, profile, recovered: candidate.recovered };
        }
      } catch {
        // Try the next current/backup copy before declaring the save unavailable.
      }
    }
    const legacyCandidates = [
      { raw: legacyLocalCurrent, recovered: false },
      { raw: legacyIdbCurrent, recovered: false },
      { raw: legacyLocalBackup, recovered: true },
      { raw: legacyIdbBackup, recovered: true },
    ];
    for (const candidate of legacyCandidates) {
      if (!candidate.raw) continue;
      try {
        const run = parseRun(candidate.raw);
        if (run) return { run, recovered: candidate.recovered, profile: await this.loadProfile() };
      } catch {
        // Keep trying legacy current and backup fixtures.
      }
    }
    return { run: null, recovered: false, profile: await this.loadProfile() };
  }

  public async loadProfile(): Promise<ProfileState> {
    const localCurrent = localStorage.getItem(CURRENT_KEY);
    if (localCurrent) {
      try {
        const loaded = parseEnvelope(localCurrent);
        if (loaded) return loaded.profile;
      } catch {
        // Try the dedicated recovery copy.
      }
    }
    try {
      const recovery = parseProfileRecovery(localStorage.getItem(PROFILE_RECOVERY_KEY));
      if (recovery) return recovery;
    } catch {
      // Try IndexedDB copies next.
    }
    const localBackup = localStorage.getItem(BACKUP_KEY);
    if (localBackup) {
      try {
        const loaded = parseEnvelope(localBackup);
        if (loaded) return loaded.profile;
      } catch {
        // Try IndexedDB copies next.
      }
    }
    try {
      for (const key of [CURRENT_KEY, BACKUP_KEY]) {
        const loaded = parseEnvelope(await idbRead(key));
        if (loaded) return loaded.profile;
      }
      const recovery = parseProfileRecovery(await idbRead(PROFILE_RECOVERY_KEY));
      if (recovery) return recovery;
    } catch {
      // A fresh profile is valid when all persisted copies are unavailable.
    }
    return createProfile();
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

export const saveKeys = SAVE_KEYS;
