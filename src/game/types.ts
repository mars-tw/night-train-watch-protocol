export type ScreenId = "menu" | "hub" | "carriage" | "route" | "event" | "modules" | "tech" | "result" | "settings";
export type Phase = "dawn" | "prep" | "route" | "travel" | "night" | "aftermath" | "ending";
export type ContactStage = "approach" | "warning" | "attack" | "breach" | "resolve";
export type RationMode = "full" | "standard" | "strict";
export type CarriagePanel = "scene" | "power" | "meal";
export type RunOutcome = "active" | "victory" | "hull-lost" | "survivor-lost";
export type ModuleCategory = "全部" | "防禦" | "生產" | "生活";
export type TechBranch = "能源" | "居住" | "農業" | "防禦" | "情報";
export type DecorationId = "lantern" | "radio" | "toolbox" | "fern";
export type CarriageId = "sleep" | "defense" | "workshop" | "greenhouse" | "kitchen";
export type CropId = "lettuce" | "tomato" | "herb";
export type CropPlotId = "plot-a" | "plot-b";
export type FeedbackTone = "gain" | "cost" | "relief" | "neutral";
export type Day4Route = "GO" | "DETOUR" | "STOP";
export type StoryRouteId = "R01" | "R02";
export type FinaleStage = "inactive" | "arrival" | "contact" | "decision" | "resolved";
export type EndingId = "arrival" | "quarantine" | "reroute" | "protocol-terminated" | "arrival-unverified";
export type CargoConversion = "none" | "isolation-bay" | "battery-array" | "sample-lab";
export type StoryDuePhase = "dawn" | "prep" | "route" | "travel" | "aftermath";
export type SignalSampleQuality = "none" | "partial" | "full";
export type FinalDecision = "open" | "seal" | "reroute" | "terminate";
export type FrostBranch = "CARE" | "CLEAR" | "SUSTAIN";
export type FrostZone = "BERTH" | "DEICER" | "LOOP";
export type FrostSwitchMethod = "deicer" | "repair" | "ram" | "bypass";
export type FrostFinaleStage = "inactive" | "warm" | "blizzard" | "clear" | "accelerate" | "resolved";
export type FrostConsent = "unknown" | "shared" | "protected" | "a07-plan";
export type FrostFinalDecision = "joint" | "shield" | "a07-plan" | "emergency-stop";
export type FrostEndingId =
  | "frost-shared-arrival"
  | "frost-guarded-arrival"
  | "frost-chosen-detour"
  | "frost-emergency-shelter";
export type HeatTokenId = "H1" | "H2" | "H3" | "H4" | "H5" | "H6";
export type ThermalCommand =
  | `thermal:select:${HeatTokenId}`
  | `thermal:move:${HeatTokenId}:${FrostZone}`
  | `thermal:target:${FrostZone}`
  | "thermal:commit"
  | "thermal:reset";
export type T009Command =
  | `frost:inspect:${FrostZone}`
  | "frost:confirm"
  | "frost:manual-scrape";
export type ThreatSignalId = "sig-a" | "sig-b";
export type ThreatSignalColor = "amber" | "cyan" | "red";
export type ThreatSignalShape = "diamond" | "circle" | "triangle";
export type ThreatSignalRhythm = "short-short-long" | "long-short-short" | "short-long-short";
export type ThreatClue = "color" | "shape" | "rhythm";
export type ThreatInteractionVerb = "cutter" | "signal" | "trace";
export type ThreatInteractionValue = CropPlotId | ThreatSignalId | "leaves" | "meter";
export type ThreatInteractionCommand =
  | `cutter:${CropPlotId}`
  | `signal:${ThreatSignalId}`
  | "trace:leaves"
  | "trace:meter"
  | T009Command;
export type ThreatInteractionStatus = "accepted" | "resolved" | "incorrect" | "invalid" | "unsupported";
export type ThermalCommandStatus = "accepted" | "invalid" | "insufficient" | "duplicate";
export type ResourceKey = "energy" | "fuel" | "food" | "water" | "parts" | "medicine" | "data";
export type SurvivorKey = "health" | "stress" | "infection" | "trust" | "sleep" | "wakeups";
export type EnvironmentKey = "temperature" | "noise" | "visibility" | "hull" | "weight";

export interface ResourceState {
  energy: number;
  fuel: number;
  food: number;
  water: number;
  parts: number;
  medicine: number;
  data: number;
}

export interface SurvivorState {
  health: number;
  stress: number;
  infection: number;
  trust: number;
  sleep: number;
  wakeups: number;
}

export interface EnvironmentState {
  temperature: number;
  noise: number;
  visibility: number;
  hull: number;
  weight: number;
}

export interface ModuleDefinition {
  id: string;
  name: string;
  slot: "wall" | "counter" | "window" | "floor" | "door";
  cost: number;
  idleDraw: number;
  activeCost: number;
  priority: 0 | 1 | 2 | 3;
  artKey: string;
  description: string;
}

export interface ModuleInstance {
  id: string;
  definitionId: string;
  slotId: string;
  active: boolean;
  powered: boolean;
  durability: number;
  mk: 1 | 2 | 3;
}

export interface DecorationPlacement {
  id: DecorationId;
  carriageId: CarriageId;
  slotId: string;
  x: number;
  y: number;
}

export interface CropPlot {
  id: CropPlotId;
  cropId?: CropId;
  stage: 0 | 1 | 2 | 3;
  plantedDay?: number;
  wateredDay?: number;
  dryDays: number;
}

export interface RouteNode {
  id: string;
  name: string;
  kind: "supply" | "story" | "danger" | "safe";
  distance: number;
  fuelCost: number;
  threatLevel: 0 | 1 | 2 | 3;
  reward: string;
  eventId: string;
  scanned?: boolean;
}

export interface EventChoice {
  id: string;
  label: string;
  cost: string;
  known: string;
  deltas: Partial<ResourceState>;
  survivor?: Partial<SurvivorState>;
  environment?: Partial<EnvironmentState>;
  result: string;
}

export interface GameEvent {
  id: string;
  phase: "travel" | "night";
  title: string;
  body: string;
  artKey: string;
  urgent?: boolean;
  choices: EventChoice[];
}

export interface ThreatDefinition {
  id: string;
  name: string;
  anchor: "left-window" | "right-window" | "door" | "roof";
  counterIds: string[];
  warningSeconds: number;
  damage: number;
  artKey: string;
}

export interface ThreatSignal {
  id: ThreatSignalId;
  color: ThreatSignalColor;
  shape: ThreatSignalShape;
  rhythm: ThreatSignalRhythm;
}

export interface T004InteractionState {
  kind: "T004";
  targetPlotId: CropPlotId;
  attempts: number;
  lastAttemptPlotId?: CropPlotId;
  targetRevealed: boolean;
}

export interface T005InteractionState {
  kind: "T005";
  signals: ThreatSignal[];
  clues: ThreatSignal[];
  targetSignalId: ThreatSignalId;
  attempts: number;
  wrongAttempts: number;
  lastAttemptSignalId?: ThreatSignalId;
  revealedClues: ThreatClue[];
  secondMissPenaltyApplied: boolean;
}

export interface T006InteractionState {
  kind: "T006";
  mode: "leaf" | "meter";
  traceTarget: CropPlotId | "meter";
  targetPlotId?: CropPlotId;
  attempts: number;
  lastAttempt?: "leaves" | "meter";
}

export interface T009InteractionState {
  kind: "T009";
  requiredZones: [FrostZone, FrostZone];
  inspectedZones: FrostZone[];
  attempts: number;
  firstMissRevealed: boolean;
  freeMissUsed: boolean;
  manualFallbackAvailable: boolean;
  resolvedBy?: "thermal" | "manual-scrape";
}

export type ThreatInteractionState =
  | T004InteractionState
  | T005InteractionState
  | T006InteractionState
  | T009InteractionState;

export interface ThreatInteractionResult {
  status: ThreatInteractionStatus;
  accepted: boolean;
  resolved: boolean;
  healthDelta: number;
  message: string;
}

export interface ThermalCommandResult {
  status: ThermalCommandStatus;
  accepted: boolean;
  settled: boolean;
  message: string;
  settlementId?: string;
}

export interface ThreatContact {
  id: string;
  definitionId: string;
  stage: ContactStage;
  secondsLeft: number;
  wave?: number;
  totalWaves?: number;
  resolvedBy?: string;
  interaction?: ThreatInteractionState;
}

export interface ScheduledStoryEvent {
  id: string;
  eventId: string;
  dueDay: number;
  duePhase: StoryDuePhase;
  sourceEventId: string;
  sourceChoiceId: string;
}

export interface HeatTokenState {
  id: HeatTokenId;
  zone: FrostZone;
}

export interface ThermalRoutingState {
  tokens: HeatTokenState[];
  selectedTokenId: HeatTokenId | null;
  committedAllocation: Record<FrostZone, number>;
  committedDay: number | null;
  settlementIds: string[];
  revision: number;
}

export interface WhiteFrostState {
  version: 1;
  branch: FrostBranch | null;
  finaleStage: FrostFinaleStage;
  consent: FrostConsent;
  heatMapQuality: "partial" | "full";
  switchCleared: boolean;
  switchMethod: FrostSwitchMethod | null;
  heaterPatched: boolean;
  coauthorEvidence: boolean;
  branchOperationComplete: boolean;
  delayedConsequenceSettled: boolean;
  finalDecision: FrostFinalDecision | null;
  endingId: FrostEndingId | null;
  endingReasons: string[];
  rewardSettled: boolean;
  thermal: ThermalRoutingState;
  coldDebt: number;
  pendingRouteFuelPenalty: number;
  frostRisk: number;
  manualScrapeHullCost: 4 | 6;
  jointTrustRequirement: number;
  warmRequirementDiscount: number;
  recordCalibrated: boolean;
}

export interface StoryFlags {
  signalSampleQuality: SignalSampleQuality;
  extraBunk: boolean;
  duplicateCoordinate: boolean;
  day4Route: Day4Route | null;
  rosterGap: boolean;
  rosterMatch: "unchecked" | "verified" | "pending";
  a07IdentityKnown: boolean;
  clause7Read: boolean;
  authorKnown: boolean;
  trueRouteData: boolean;
  routeSampleCount: number;
  manifestCrossChecks: number;
  isolationTraceCount: number;
  hailed: boolean;
  quarantinePrepared: boolean;
  overrideUsed: boolean;
  controlReturned: boolean;
  toldTruth: boolean;
  decoderInstalled: boolean;
  decoderCalibrated: boolean;
  a07MovedObject: boolean;
  badgePocketed: boolean;
  overrideTechUnlocked: boolean;
  identityMismatchVerified: boolean;
}

export interface StoryState {
  version: 2;
  flags: StoryFlags;
  cargoConversion: CargoConversion;
  finaleStage: FinaleStage;
  completedContactWaves: number;
  finaleHealthBuffer: number;
  finalDecision: FinalDecision | null;
  queue: ScheduledStoryEvent[];
  seenEventIds: string[];
  endingId: EndingId | null;
  endingReasons: string[];
  dawnLogIds: string[];
  whiteFrost: WhiteFrostState | null;
}

export type A07ConsentStatus = "granted" | "granted-with-evidence" | "refused";

export interface A07ConsentEvaluation {
  status: A07ConsentStatus;
  consents: boolean;
  evidenceRequired: boolean;
  canOverride: boolean;
  reason: string;
}

export interface EndingEvaluation {
  endingId: EndingId;
  reasons: string[];
}

export interface FrostEndingEvaluation {
  endingId: FrostEndingId;
  reasons: string[];
}

export interface LedgerEntry {
  id: string;
  at: number;
  source: string;
  key: string;
  before: number;
  delta: number;
  after: number;
}

export interface SettingsState {
  textScale: 100 | 120 | 140;
  reducedMotion: boolean;
  noCountdown: boolean;
  lowSpeed: boolean;
  sound: boolean;
}

export interface RunState {
  schemaVersion: 4;
  seed: string;
  day: number;
  maxDays: number;
  phase: Phase;
  actionPoints: number;
  rationMode: RationMode;
  nightPowerDemand: number;
  outcome: RunOutcome;
  routeId: StoryRouteId;
  selectedRouteNodeId?: string;
  activeEventId?: string;
  activeContact?: ThreatContact;
  resources: ResourceState;
  survivor: SurvivorState;
  environment: EnvironmentState;
  modules: ModuleInstance[];
  decorations: DecorationPlacement[];
  crops: CropPlot[];
  story: StoryState;
  techOwned: string[];
  flags: string[];
  ledger: LedgerEntry[];
  lastMessage?: string;
  ended: boolean;
}

export interface AppState {
  screen: ScreenId;
  run: RunState | null;
  settings: SettingsState;
  selectedTechId: string;
  selectedModuleId: string;
  selectedRouteId: string;
  carriagePanel: CarriagePanel;
  nightPaused: boolean;
  eventPreview: boolean;
  routePreview: boolean;
  modulePreview: boolean;
  decorating: boolean;
  selectedDecorationId: DecorationId;
  activeCarriageId: CarriageId;
  selectedCropId: CropId;
  actionFeedback: Array<{ label: string; delta: number; tone: FeedbackTone }>;
  moduleCategory: ModuleCategory;
  techBranch: TechBranch;
  saveStatus: "none" | "saved" | "saving" | "recovered" | "error";
}

export interface Intent {
  type: string;
  payload?: Record<string, unknown>;
}
