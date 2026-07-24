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

export interface ThreatContact {
  id: string;
  definitionId: string;
  stage: ContactStage;
  secondsLeft: number;
  wave?: number;
  totalWaves?: number;
  resolvedBy?: string;
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
  schemaVersion: 2;
  seed: string;
  day: number;
  maxDays: number;
  phase: Phase;
  actionPoints: number;
  rationMode: RationMode;
  nightPowerDemand: number;
  outcome: RunOutcome;
  routeId: string;
  selectedRouteNodeId?: string;
  activeEventId?: string;
  activeContact?: ThreatContact;
  resources: ResourceState;
  survivor: SurvivorState;
  environment: EnvironmentState;
  modules: ModuleInstance[];
  decorations: DecorationPlacement[];
  crops: CropPlot[];
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
