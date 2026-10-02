import type { ProfileState, RunState, StoryRouteId } from "../types";

export type QuestCategory = "main" | "tutorial" | "relationship" | "facility" | "exploration" | "challenge";
export type QuestLifecycle =
  | "locked"
  | "available"
  | "active"
  | "completed"
  | "claimed"
  | "expired"
  | "retired"
  | "resolved-fallback";
export type QuestResult = "completed" | "compromised" | "expired" | "declined";
export type QuestRewardType = "journal" | "blueprint" | "cosmetic";
export type QuestFailurePolicy = "continue" | "expire" | "fallback";

export interface QuestObjectiveDefinition {
  event: string;
  match: Record<string, string | number | boolean | Array<string | number | boolean>>;
  count: number;
}

export interface QuestPrerequisiteDefinition {
  kind: "prior-mission-settled" | "facility-branch-uncommitted";
  missionId?: string;
  acceptedResults?: QuestResult[];
  branchGroup?: string;
  onUnresolved?: string;
  onFalse?: string;
}

export interface QuestRewardDefinition {
  type: QuestRewardType;
  id: string;
  description: string;
}

export interface QuestDefinition {
  id: string;
  category: QuestCategory;
  title: string;
  description: string;
  routes: StoryRouteId[];
  dayMin: number;
  dayMax: number;
  prerequisites: QuestPrerequisiteDefinition[];
  objectives: QuestObjectiveDefinition[];
  completionMode: "all";
  costs: { accept: unknown[]; execution: string; description: string };
  rewards: QuestRewardDefinition[];
  failure: { policy: QuestFailurePolicy; description: string };
  repeat: "once-per-run" | "once-per-profile";
  scope: "run" | "profile";
  deadline: { afterNight: number; evaluationPhase: "aftermath-before-day-advance" };
  priority: number;
  branchGroup?: string;
  contextFallback?: string;
}

export interface QuestEventEnvelope {
  eventId: string;
  runId: string;
  routeId: StoryRouteId;
  day: number;
  sequence: number;
  transactionId: string;
  type: string;
  [key: string]: unknown;
}

export interface QuestObjectiveProgress {
  count: number;
  matchedEventIds: string[];
}

export interface QuestMissionState {
  id: string;
  lifecycle: QuestLifecycle;
  result: QuestResult | null;
  reason?: string;
  progress: QuestObjectiveProgress[];
  startedDay?: number;
  settledDay?: number;
  fallbackContext?: boolean;
}

export interface QuestState {
  version: 1;
  runId: string;
  routeId: StoryRouteId;
  createdDay: number;
  sequence: number;
  consumedEventIds: string[];
  consumedEventKeys: string[];
  eventHistory: QuestEventEnvelope[];
  missions: Record<string, QuestMissionState>;
  trackedMissionIds: string[];
  branchChoices: Record<string, string>;
  rewardReceipts: string[];
  journalEntries: string[];
  importedFromLegacy?: boolean;
}

export interface QuestView extends QuestMissionState {
  definition: QuestDefinition;
  tracked: boolean;
  nextObjective: string | null;
  progressText: string;
  profileCompleted: boolean;
}

export interface QuestEmitResult {
  accepted: boolean;
  duplicate: boolean;
  event: QuestEventEnvelope;
  progressedMissionIds: string[];
  completedMissionIds: string[];
}

export interface QuestDaySettlement {
  day: number;
  completedMissionIds: string[];
  expiredMissionIds: string[];
  fallbackMissionIds: string[];
  retiredMissionIds: string[];
}

export interface QuestClaimDraft {
  status: "prepared" | "noop" | "ineligible";
  run: RunState;
  profile: ProfileState;
  missionId: string;
  rewardIds: string[];
  runReceiptIds: string[];
  profileReceiptIds: string[];
}
