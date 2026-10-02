import type { ProfileState, RunState, StoryRouteId } from "../types";
import { reconcileRouteUnlocks } from "../profile";
import { QUEST_CATALOG, getQuestDefinition } from "./catalog";
import type {
  QuestClaimDraft,
  QuestDaySettlement,
  QuestDefinition,
  QuestEmitResult,
  QuestEventEnvelope,
  QuestLifecycle,
  QuestMissionState,
  QuestResult,
  QuestState,
  QuestView,
} from "./types";

const TERMINAL_LIFECYCLES = new Set<QuestLifecycle>([
  "completed",
  "claimed",
  "expired",
  "retired",
  "resolved-fallback",
]);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isTerminal(mission: QuestMissionState): boolean {
  return TERMINAL_LIFECYCLES.has(mission.lifecycle);
}

function terminalize(
  mission: QuestMissionState,
  definition: QuestDefinition,
  day: number,
  reason = "deadline-reached",
): void {
  mission.settledDay = Math.min(7, Math.max(1, day));
  if (definition.failure.policy === "expire") {
    mission.lifecycle = "expired";
    mission.result = "expired";
    mission.reason = reason;
    return;
  }
  mission.lifecycle = "resolved-fallback";
  mission.result = "compromised";
  mission.reason = definition.failure.policy === "fallback" ? "fallback-context" : "mainline-continued";
  mission.fallbackContext = definition.failure.policy === "fallback";
}

function createMissionState(definition: QuestDefinition, routeId: StoryRouteId, day: number): QuestMissionState {
  const mission: QuestMissionState = {
    id: definition.id,
    lifecycle: "locked",
    result: null,
    progress: definition.objectives.map(() => ({ count: 0, matchedEventIds: [] })),
  };
  if (!definition.routes.includes(routeId)) {
    mission.reason = "route-unavailable";
    return mission;
  }
  if (day < definition.dayMin) return mission;
  if (day > definition.dayMax) {
    terminalize(mission, definition, definition.dayMax, "window-missed");
    return mission;
  }
  mission.lifecycle = definition.category === "main" ? "active" : "available";
  mission.startedDay = day;
  return mission;
}

export function createQuestState(runId: string, routeId: StoryRouteId, day: number): QuestState {
  const normalizedDay = Math.min(7, Math.max(1, Math.floor(day)));
  return {
    version: 1,
    runId,
    routeId,
    createdDay: normalizedDay,
    sequence: 0,
    consumedEventIds: [],
    consumedEventKeys: [],
    eventHistory: [],
    missions: Object.fromEntries(
      QUEST_CATALOG.map((definition) => [definition.id, createMissionState(definition, routeId, normalizedDay)]),
    ),
    trackedMissionIds: [],
    branchChoices: {},
    rewardReceipts: [],
    journalEntries: [],
  };
}

function validLifecycle(value: unknown): value is QuestLifecycle {
  return typeof value === "string" && [
    "locked", "available", "active", "completed", "claimed", "expired", "retired", "resolved-fallback",
  ].includes(value);
}

function validResult(value: unknown): value is QuestResult | null {
  return value === null || value === "completed" || value === "compromised" || value === "expired" || value === "declined";
}

export function repairQuestState(
  saved: Partial<QuestState> | null | undefined,
  runId: string,
  routeId: StoryRouteId,
  day: number,
): QuestState {
  const repaired = createQuestState(runId, routeId, day);
  if (!saved || saved.version !== 1 || saved.runId !== runId || saved.routeId !== routeId) return repaired;
  repaired.createdDay = Number.isInteger(saved.createdDay)
    ? Math.min(7, Math.max(1, saved.createdDay ?? day))
    : repaired.createdDay;
  repaired.sequence = Number.isInteger(saved.sequence) && (saved.sequence ?? -1) >= 0 ? saved.sequence ?? 0 : 0;
  repaired.consumedEventIds = Array.isArray(saved.consumedEventIds)
    ? [...new Set(saved.consumedEventIds.filter((id): id is string => typeof id === "string"))]
    : [];
  repaired.consumedEventKeys = Array.isArray(saved.consumedEventKeys)
    ? [...new Set(saved.consumedEventKeys.filter((id): id is string => typeof id === "string"))]
    : repaired.consumedEventIds.map((id) => `event:${id}`);
  repaired.eventHistory = Array.isArray(saved.eventHistory)
    ? saved.eventHistory.filter((event): event is QuestEventEnvelope =>
      Boolean(event) && event.runId === runId && event.routeId === routeId && typeof event.eventId === "string",
    )
    : [];
  repaired.trackedMissionIds = Array.isArray(saved.trackedMissionIds)
    ? [...new Set(saved.trackedMissionIds.filter((id): id is string => definitionExists(id)))].slice(0, 2)
    : [];
  repaired.branchChoices = saved.branchChoices && typeof saved.branchChoices === "object"
    ? Object.fromEntries(Object.entries(saved.branchChoices).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  repaired.rewardReceipts = Array.isArray(saved.rewardReceipts)
    ? [...new Set(saved.rewardReceipts.filter((id): id is string => typeof id === "string"))]
    : [];
  repaired.journalEntries = Array.isArray(saved.journalEntries)
    ? [...new Set(saved.journalEntries.filter((id): id is string => typeof id === "string"))]
    : [];
  repaired.importedFromLegacy = saved.importedFromLegacy === true || undefined;

  for (const definition of QUEST_CATALOG) {
    const candidate = saved.missions?.[definition.id];
    if (!candidate || !validLifecycle(candidate.lifecycle) || !validResult(candidate.result)) continue;
    const mission = repaired.missions[definition.id]!;
    mission.lifecycle = candidate.lifecycle;
    mission.result = candidate.result;
    mission.reason = typeof candidate.reason === "string" ? candidate.reason : undefined;
    mission.startedDay = Number.isInteger(candidate.startedDay) ? candidate.startedDay : undefined;
    mission.settledDay = Number.isInteger(candidate.settledDay) ? candidate.settledDay : undefined;
    mission.fallbackContext = candidate.fallbackContext === true || undefined;
    mission.progress = definition.objectives.map((objective, index) => {
      const progress = candidate.progress?.[index];
      const matchedEventIds = Array.isArray(progress?.matchedEventIds)
        ? [...new Set(progress.matchedEventIds.filter((id): id is string => typeof id === "string"))]
        : [];
      return { count: Math.min(objective.count, matchedEventIds.length), matchedEventIds };
    });
  }
  return repaired;
}

function definitionExists(id: string): boolean {
  return getQuestDefinition(id) !== undefined;
}

function prerequisitesAllow(state: QuestState, definition: QuestDefinition): { allowed: boolean; fallback: boolean } {
  let fallback = false;
  for (const prerequisite of definition.prerequisites) {
    if (prerequisite.kind === "facility-branch-uncommitted") {
      if (prerequisite.branchGroup && state.branchChoices[prerequisite.branchGroup]) return { allowed: false, fallback };
      continue;
    }
    const prior = prerequisite.missionId ? state.missions[prerequisite.missionId] : undefined;
    if (!prior?.result || !prerequisite.acceptedResults?.includes(prior.result)) {
      if (prerequisite.onUnresolved === "activate-fallback-context") fallback = true;
      else return { allowed: false, fallback };
    } else if (prior.result !== "completed") {
      fallback = true;
    }
  }
  return { allowed: true, fallback };
}

function reconcileAvailability(run: RunState): void {
  const state = run.quests;
  for (const definition of QUEST_CATALOG) {
    const mission = state.missions[definition.id]!;
    if (!definition.routes.includes(run.routeId) || isTerminal(mission)) continue;
    if (run.day > definition.deadline.afterNight) {
      terminalize(mission, definition, definition.deadline.afterNight, "deadline-reached");
      continue;
    }
    if (run.day < definition.dayMin || run.day > definition.dayMax) continue;
    const prerequisite = prerequisitesAllow(state, definition);
    if (!prerequisite.allowed) continue;
    mission.fallbackContext = prerequisite.fallback || undefined;
    mission.lifecycle = definition.category === "main" ? "active" : "available";
    mission.startedDay ??= run.day;
    mission.reason = undefined;
  }
}

export function ensureQuestState(run: RunState): QuestState {
  if (!run.quests || run.quests.runId !== run.runId || run.quests.routeId !== run.routeId) {
    run.quests = createQuestState(run.runId, run.routeId, run.day);
  } else {
    run.quests = repairQuestState(run.quests, run.runId, run.routeId, run.day);
  }
  reconcileAvailability(run);
  return run.quests;
}

function sameNightActionMatches(
  state: QuestState,
  definition: QuestDefinition,
  event: QuestEventEnvelope,
): boolean {
  return state.eventHistory.some((candidate) =>
    candidate.day === event.day
    && candidate.type === "action.committed"
    && definition.objectives.some((objective) =>
      objective.event === "action.committed" && matchObjective(state, definition, objective.match, candidate),
    ),
  );
}

function matchObjective(
  state: QuestState,
  definition: QuestDefinition,
  match: QuestDefinition["objectives"][number]["match"],
  event: QuestEventEnvelope,
): boolean {
  return Object.entries(match).every(([key, expected]) => {
    if (key === "sameNightAsMissionAction" && expected === true) {
      return sameNightActionMatches(state, definition, event);
    }
    const actual = event[key];
    return Array.isArray(expected) ? expected.includes(actual as never) : actual === expected;
  });
}

function retireCompetingBranches(state: QuestState, event: QuestEventEnvelope): string[] {
  if (event.type !== "facility.upgraded" || event.result !== "success" || typeof event.branchGroup !== "string") return [];
  const branchGroup = event.branchGroup;
  const branchChoice = typeof event.branchChoice === "string" ? event.branchChoice : String(event.upgradeId ?? "committed");
  state.branchChoices[branchGroup] = branchChoice;
  const retired: string[] = [];
  for (const definition of QUEST_CATALOG) {
    if (definition.branchGroup !== branchGroup) continue;
    const mission = state.missions[definition.id]!;
    const matchesUpgrade = definition.objectives.some((objective) =>
      objective.event === "facility.upgraded" && matchObjective(state, definition, objective.match, event),
    );
    if (!matchesUpgrade && !isTerminal(mission)) {
      mission.lifecycle = "retired";
      mission.result = "expired";
      mission.reason = "branch-superseded";
      mission.settledDay = event.day;
      retired.push(definition.id);
    }
  }
  return retired;
}

export function emitQuestEvent(
  run: RunState,
  type: string,
  payload: Record<string, unknown>,
): QuestEmitResult {
  const state = ensureQuestState(run);
  if (payload.runId !== undefined && payload.runId !== run.runId) throw new Error("Quest event runId mismatch");
  if (payload.routeId !== undefined && payload.routeId !== run.routeId) throw new Error("Quest event routeId mismatch");
  const day = typeof payload.day === "number" && Number.isInteger(payload.day)
    ? Math.min(7, Math.max(1, payload.day))
    : run.day;
  const transactionId = typeof payload.transactionId === "string" && payload.transactionId
    ? payload.transactionId
    : `${run.runId}:${day}:${type}:${state.sequence + 1}`;
  const eventId = typeof payload.eventId === "string" && payload.eventId
    ? payload.eventId
    : `${transactionId}:${type}`;
  const semanticKey = type === "action.committed" && payload.operation === "inspect" && typeof payload.targetId === "string"
    ? `${type}:D${day}:inspect:${payload.targetId}`
    : typeof payload.stableKey === "string" && payload.stableKey
      ? `${type}:stable:${payload.stableKey}`
      : `${type}:tx:${transactionId}`;
  const nextSequence = state.sequence + 1;
  const event: QuestEventEnvelope = {
    ...payload,
    eventId,
    runId: run.runId,
    routeId: run.routeId,
    day,
    sequence: nextSequence,
    transactionId,
    type,
    dedupKey: semanticKey,
  };
  if (state.consumedEventIds.includes(eventId) || state.consumedEventKeys.includes(semanticKey)) {
    const original = state.eventHistory.find((candidate) =>
      candidate.eventId === eventId || candidate.dedupKey === semanticKey,
    ) ?? event;
    return { accepted: false, duplicate: true, event: original, progressedMissionIds: [], completedMissionIds: [] };
  }

  state.sequence = nextSequence;
  state.consumedEventIds.push(eventId);
  state.consumedEventKeys.push(semanticKey);
  state.eventHistory.push(event);
  const progressedMissionIds: string[] = [];
  const completedMissionIds: string[] = [];

  for (const definition of QUEST_CATALOG) {
    if (!definition.routes.includes(run.routeId) || day < definition.dayMin || day > definition.dayMax) continue;
    const mission = state.missions[definition.id]!;
    if (isTerminal(mission) || mission.lifecycle === "locked") continue;
    let progressed = false;
    definition.objectives.forEach((objective, index) => {
      if (objective.event !== type) return;
      const progress = mission.progress[index]!;
      if (progress.count >= objective.count || progress.matchedEventIds.includes(eventId)) return;
      if (!matchObjective(state, definition, objective.match, event)) return;
      progress.matchedEventIds.push(eventId);
      progress.count = Math.min(objective.count, progress.count + 1);
      progressed = true;
    });
    if (!progressed) continue;
    progressedMissionIds.push(definition.id);
    if (mission.lifecycle === "available") mission.lifecycle = "active";
    if (definition.objectives.every((objective, index) => mission.progress[index]!.count >= objective.count)) {
      mission.settledDay = day;
      const matchedEvents = mission.progress.flatMap((progress) =>
        progress.matchedEventIds
          .map((id) => state.eventHistory.find((candidate) => candidate.eventId === id))
          .filter((candidate): candidate is QuestEventEnvelope => candidate !== undefined),
      );
      const declined = definition.category === "relationship"
        && matchedEvents.some((candidate) => candidate.type === "relationship.choice" && candidate.result === "declined");
      const fallback = matchedEvents.some((candidate) =>
        (definition.category === "main"
          && candidate.type === "story.milestone"
          && (candidate.result === "compromised" || candidate.result === "fallback"))
        || (definition.category === "relationship"
          && candidate.type === "relationship.choice"
          && candidate.result === "fallback"),
      );
      if (declined) {
        mission.lifecycle = "expired";
        mission.result = "declined";
        mission.reason = "declined";
      } else if (fallback) {
        mission.lifecycle = "resolved-fallback";
        mission.result = "compromised";
        mission.reason = "fallback-context";
        mission.fallbackContext = true;
      } else {
        mission.lifecycle = "completed";
        mission.result = "completed";
        mission.reason = undefined;
        completedMissionIds.push(definition.id);
      }
    }
  }

  retireCompetingBranches(state, event);
  return { accepted: true, duplicate: false, event, progressedMissionIds, completedMissionIds };
}

export function settleQuestDay(run: RunState): QuestDaySettlement {
  const state = ensureQuestState(run);
  const result: QuestDaySettlement = {
    day: run.day,
    completedMissionIds: [],
    expiredMissionIds: [],
    fallbackMissionIds: [],
    retiredMissionIds: [],
  };
  for (const definition of QUEST_CATALOG) {
    const mission = state.missions[definition.id]!;
    if (!definition.routes.includes(run.routeId)) continue;
    if (mission.lifecycle === "completed") result.completedMissionIds.push(definition.id);
    if (isTerminal(mission)) continue;
    const deadlineReached = run.day >= definition.deadline.afterNight;
    const earlyEnd = run.ended && run.day < definition.dayMin;
    if (earlyEnd) {
      mission.reason = "run-ended-before-window";
      continue;
    }
    if (!deadlineReached && !run.ended) continue;
    terminalize(mission, definition, Math.min(run.day, definition.deadline.afterNight), run.ended ? "run-ended" : "deadline-reached");
    if (mission.lifecycle === "expired") result.expiredMissionIds.push(definition.id);
    else result.fallbackMissionIds.push(definition.id);
  }
  state.trackedMissionIds = state.trackedMissionIds.filter((id) => {
    const mission = state.missions[id];
    return Boolean(mission && !["expired", "retired", "resolved-fallback"].includes(mission.lifecycle));
  });
  return result;
}

export function toggleQuestTracking(run: RunState, id: string): boolean {
  const state = ensureQuestState(run);
  const mission = state.missions[id];
  if (!mission || mission.lifecycle === "locked" || ["expired", "retired", "resolved-fallback"].includes(mission.lifecycle)) return false;
  const index = state.trackedMissionIds.indexOf(id);
  if (index >= 0) {
    state.trackedMissionIds.splice(index, 1);
    return true;
  }
  if (state.trackedMissionIds.length >= 2) return false;
  state.trackedMissionIds.push(id);
  return true;
}

const OPERATION_LABELS: Record<string, string> = {
  inspect: "完成一次觀察",
  "power.configure": "確認今晚的供電配置",
  "ration.configure": "確認今晚的配餐方式",
  "crop.plant": "在溫室播下一株作物",
  "crop.harvest": "收成一株健康成熟的作物",
  "route.confirm": "確認今天要走的路段",
  "counter.deploy": "部署反制並完成這次接觸",
  comfort: "在臥室完成一次安撫",
  repair: "在工坊完成一次維修",
  cook: "在廚房完成一次烹飪",
};

const TARGET_LABELS: Record<string, string> = {
  "passenger-breathing": "檢查乘客的呼吸是否安穩",
  "window-silhouette": "查看窗外影子的移動",
  "plot-a": "在一號種植槽播種",
  "plot-b": "在二號種植槽播種",
};

const UPGRADE_LABELS: Record<string, string> = {
  "quiet-wiring": "完成低噪配線改裝",
  "burst-buffer": "完成峰值緩衝改裝",
  "blackout-shutter": "完成遮光百葉改裝",
  "observation-frame": "完成觀測窗框改裝",
  "closed-return": "完成封閉回水改裝",
  "isolated-trays": "完成隔離培育改裝",
  "warm-berth": "完成保暖床邊改裝",
  "medical-berth": "完成急救床邊改裝",
};

function objectiveText(definition: QuestDefinition, index: number): string {
  const objective = definition.objectives[index]!;
  if (objective.event === "action.committed") {
    const target = objective.match.targetId;
    if (typeof target === "string" && TARGET_LABELS[target]) return TARGET_LABELS[target];
    const operation = objective.match.operation;
    if (typeof operation === "string" && OPERATION_LABELS[operation]) return OPERATION_LABELS[operation];
  }
  if (objective.event === "story.milestone") return `完成「${definition.title}」的當夜故事行動`;
  if (objective.event === "night.resolved") {
    const day = objective.match.day;
    if (typeof day === "number") return `完成第 ${day} 夜並抵達黎明`;
    return "完成符合條件的一夜並抵達黎明";
  }
  if (objective.event === "relationship.choice") return `回應「${definition.title}」這段對話`;
  if (objective.event === "facility.upgraded") {
    const upgrade = objective.match.upgradeId;
    if (typeof upgrade === "string" && UPGRADE_LABELS[upgrade]) return UPGRADE_LABELS[upgrade];
  }
  if (objective.event === "expedition.resolved") return `完成「${definition.title}」的沿線探索`;
  if (objective.event === "run.ended") return "完成旅程並把最後選擇寫進日誌";
  return `依任務說明完成「${definition.title}」：${definition.description}`;
}

function profileHasMission(profile: ProfileState | undefined, missionId: string): boolean {
  return profile?.milestones.includes(`mission:${missionId}:completed`) === true;
}

export function listRunQuests(run: RunState, profile?: ProfileState): QuestView[] {
  const state = ensureQuestState(run);
  return QUEST_CATALOG
    .filter((definition) => definition.routes.includes(run.routeId))
    .map((definition) => {
      const mission = state.missions[definition.id]!;
      const profileCompleted = definition.scope === "profile" && profileHasMission(profile, definition.id);
      const nextIndex = definition.objectives.findIndex((objective, index) => mission.progress[index]!.count < objective.count);
      const progressTotal = definition.objectives.reduce((sum, objective) => sum + objective.count, 0);
      const progressNow = mission.progress.reduce((sum, objective) => sum + objective.count, 0);
      return {
        ...mission,
        lifecycle: profileCompleted ? "claimed" as const : mission.lifecycle,
        result: profileCompleted ? "completed" as const : mission.result,
        definition,
        tracked: state.trackedMissionIds.includes(definition.id),
        nextObjective: nextIndex >= 0 && !isTerminal(mission) && !profileCompleted
          ? objectiveText(definition, nextIndex)
          : null,
        progressText: profileCompleted
          ? `${progressTotal}/${progressTotal}`
          : `${Math.min(progressNow, progressTotal)}/${progressTotal}`,
        profileCompleted,
      };
    })
    .sort((left, right) => Number(right.tracked) - Number(left.tracked)
      || right.definition.priority - left.definition.priority
      || left.definition.dayMin - right.definition.dayMin
      || left.id.localeCompare(right.id));
}

export function claimQuestRewards(
  run: RunState,
  profile: ProfileState,
  missionId: string,
): QuestClaimDraft {
  const definition = getQuestDefinition(missionId);
  const nextRun = clone(run);
  const nextProfile = clone(profile);
  const current = ensureQuestState(nextRun).missions[missionId];
  if (!definition || !current || (current.lifecycle !== "completed" && current.lifecycle !== "claimed")) {
    return { status: "ineligible", run, profile, missionId, rewardIds: [], runReceiptIds: [], profileReceiptIds: [] };
  }
  const mission = current;
  const rewardIds: string[] = [];
  const runReceiptIds: string[] = [];
  const profileReceiptIds: string[] = [];

  if (definition.scope === "profile" && profileHasMission(nextProfile, missionId)) {
    mission.lifecycle = "claimed";
    mission.result = "completed";
    return {
      status: "noop",
      run: nextRun,
      profile: reconcileRouteUnlocks(nextProfile),
      missionId,
      rewardIds,
      runReceiptIds,
      profileReceiptIds,
    };
  }

  for (const reward of definition.rewards) {
    const runReceipt = `${nextRun.runId}:${missionId}:${reward.id}`;
    const profileReceipt = `${nextProfile.profileId}:${reward.id}`;
    if (!nextRun.quests.rewardReceipts.includes(runReceipt)) {
      nextRun.quests.rewardReceipts.push(runReceipt);
      runReceiptIds.push(runReceipt);
      rewardIds.push(reward.id);
      if (reward.type === "journal" && !nextRun.quests.journalEntries.includes(reward.id)) {
        nextRun.quests.journalEntries.push(reward.id);
      }
    }
    if (!nextProfile.rewardReceipts.includes(profileReceipt)) {
      nextProfile.rewardReceipts.push(profileReceipt);
      profileReceiptIds.push(profileReceipt);
      if (reward.type === "journal" && !nextProfile.journal.includes(reward.id)) nextProfile.journal.push(reward.id);
      if (reward.type === "blueprint" && !nextProfile.blueprints.includes(reward.id)) nextProfile.blueprints.push(reward.id);
      if (reward.type === "cosmetic" && !nextProfile.decorations.includes(reward.id)) nextProfile.decorations.push(reward.id);
    }
  }
  const milestone = `mission:${missionId}:completed`;
  if (!nextProfile.milestones.includes(milestone)) nextProfile.milestones.push(milestone);
  mission.lifecycle = "claimed";
  mission.result = "completed";
  nextProfile.updatedAt = Date.now();
  const reconciledProfile = reconcileRouteUnlocks(nextProfile);
  const status = runReceiptIds.length > 0 || profileReceiptIds.length > 0 || current.lifecycle !== "claimed"
    ? "prepared"
    : "noop";
  return { status, run: nextRun, profile: reconciledProfile, missionId, rewardIds, runReceiptIds, profileReceiptIds };
}
