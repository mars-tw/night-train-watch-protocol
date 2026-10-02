import type {
  EnvironmentState,
  ModuleInstance,
  ResourceState,
  StoryRouteId,
  SurvivorState,
} from "../types";

export type ExpeditionSiteId =
  | "fog-relay"
  | "fog-service-siding"
  | "frost-weather-tower"
  | "frost-maintenance-hut"
  | "green-river-intake"
  | "green-seed-relay";

export type ExpeditionChoiceId =
  | "survey"
  | "proper-tool"
  | "improvise"
  | "withdraw"
  | "deep-dive";

export type ExpeditionStatus = "active" | "withdrawn" | "resolved";
export type RelationshipNpcId = "A-07" | "xu";
export type RelationshipResult = "success" | "partial" | "declined" | "fallback";
export type FacilityBranchGroup =
  | "core-output"
  | "window-approach"
  | "greenhouse-loop"
  | "bedside-use";

export interface ExpeditionRolls {
  observation: number;
  tool: number;
  depth: number;
}

export interface ActiveExpedition {
  expeditionId: string;
  siteId: ExpeditionSiteId;
  routeId: StoryRouteId;
  day: number;
  nodeIndex: 0 | 1 | 2;
  rolls: ExpeditionRolls;
  choices: ExpeditionChoiceId[];
  collected: Partial<ResourceState>;
  usedProperTool: boolean;
}

export interface ExpeditionRecord {
  expeditionId: string;
  siteId: ExpeditionSiteId;
  routeId: StoryRouteId;
  day: number;
  status: Exclude<ExpeditionStatus, "active">;
  result: "success" | "partial";
  discoveryId: string;
  collected: Partial<ResourceState>;
  settlementId: string;
  choices: ExpeditionChoiceId[];
}

export interface RelationshipRecord {
  missionId: string;
  npcId: RelationshipNpcId;
  stepId: string;
  choiceId: string;
  result: RelationshipResult;
  settlementId: string;
}

export interface FacilityRecord {
  missionId: string;
  facilityId: string;
  upgradeId: string;
  branchGroup: FacilityBranchGroup;
  branchChoice: string;
  sceneState: string;
  settlementId: string;
}

export interface NightSummary {
  day: number;
  wakeupsDelta: number;
  passengerAlive: boolean;
  hullPositive: boolean;
  reservePositive: boolean;
  lifeSupportPowered: boolean;
  manualCounter: boolean;
}

export interface VoyageState {
  version: 2;
  stoppedDays: Record<string, string>;
  activeExpedition?: ActiveExpedition;
  expeditions: ExpeditionRecord[];
  relationships: Record<string, RelationshipRecord>;
  facilityChoices: Partial<Record<FacilityBranchGroup, string>>;
  facilities: Record<string, FacilityRecord>;
  settlementIds: string[];
  nightSummaries: NightSummary[];
  nightStartWakeups?: number;
  lastSettledDay?: number;
  inspectedIds: string[];
}

export interface VoyageRunInput {
  seed: string;
  day: number;
  routeId: StoryRouteId;
  phase: string;
  actionPoints: number;
  resources: ResourceState;
  survivor: SurvivorState;
  environment: EnvironmentState;
  modules: ModuleInstance[];
  techOwned: string[];
  flags?: string[];
  voyage?: VoyageState;
}

export interface VoyageEventPayload extends Record<string, unknown> {
  transactionId: string;
  settlementId?: string;
}

export interface VoyageActionResult {
  ok: boolean;
  message: string;
  resourceDelta: Partial<ResourceState>;
  survivorDelta: Partial<SurvivorState>;
  environmentDelta: Partial<EnvironmentState>;
  apCost: number;
  eventType: string | null;
  eventPayload: VoyageEventPayload | null;
  stateDraft: VoyageState;
}

export interface ExpeditionAvailability {
  id: ExpeditionSiteId;
  title: string;
  description: string;
  discoveryId: string;
  apCost: number;
  necessaryTool: string;
  worstCase: string;
  available: boolean;
  reason?: string;
}

export interface RelationshipChoiceAvailability {
  id: string;
  label: string;
  description: string;
  available: boolean;
  reason?: string;
}

export interface RelationshipAvailability {
  missionId: string;
  npcId: RelationshipNpcId;
  stepId: string;
  title: string;
  prompt: string;
  fallbackContext: boolean;
  choices: RelationshipChoiceAvailability[];
}
