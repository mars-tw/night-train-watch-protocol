import { createRng, hashString } from "../rng";
import type { ResourceState } from "../types";
import {
  EXPEDITIONS,
  REFILL_ACTIONS,
  RELATIONSHIPS,
  RESOURCE_WARNING_RULES,
  ROUTE_TRADEOFFS,
} from "./content";
import type {
  ActiveExpedition,
  ExpeditionAvailability,
  ExpeditionChoiceId,
  ExpeditionRecord,
  ExpeditionSiteId,
  RelationshipAvailability,
  RelationshipChoiceAvailability,
  VoyageActionResult,
  VoyageRunInput,
  VoyageState,
} from "./types";
import type { NightSummary } from "./types";

function cloneState(state: VoyageState): VoyageState {
  return {
    version: 2,
    stoppedDays: { ...state.stoppedDays },
    activeExpedition: state.activeExpedition
      ? {
          ...state.activeExpedition,
          rolls: { ...state.activeExpedition.rolls },
          choices: [...state.activeExpedition.choices],
          collected: { ...state.activeExpedition.collected },
        }
      : undefined,
    expeditions: state.expeditions.map((record) => ({
      ...record,
      collected: { ...record.collected },
      choices: [...record.choices],
    })),
    relationships: Object.fromEntries(
      Object.entries(state.relationships).map(([key, value]) => [key, { ...value }]),
    ),
    facilityChoices: { ...state.facilityChoices },
    facilities: Object.fromEntries(
      Object.entries(state.facilities).map(([key, value]) => [key, { ...value }]),
    ),
    settlementIds: [...state.settlementIds],
    nightSummaries: state.nightSummaries.map((summary) => ({ ...summary })),
    nightStartWakeups: state.nightStartWakeups,
    lastSettledDay: state.lastSettledDay,
    inspectedIds: [...state.inspectedIds],
  };
}

export function createVoyageState(): VoyageState {
  return {
    version: 2,
    stoppedDays: {},
    expeditions: [],
    relationships: {},
    facilityChoices: {},
    facilities: {},
    settlementIds: [],
    nightSummaries: [],
    inspectedIds: [],
  };
}

export function recordNightStart(voyage: unknown, wakeups: number): VoyageState {
  const draft = repairVoyageState(voyage);
  draft.nightStartWakeups = Math.max(0, Math.floor(wakeups));
  return draft;
}

export function recordNightSummary(voyage: unknown, summary: NightSummary): VoyageState {
  const draft = repairVoyageState(voyage);
  if (draft.lastSettledDay === summary.day) return draft;
  draft.nightSummaries.push({ ...summary });
  draft.lastSettledDay = summary.day;
  draft.nightStartWakeups = undefined;
  return draft;
}

export function recordInspectedId(voyage: unknown, objectId: string): VoyageState {
  const draft = repairVoyageState(voyage);
  if (!draft.inspectedIds.includes(objectId)) draft.inspectedIds.push(objectId);
  return draft;
}

export function getRouteTradeoff(nodeId: string, day: number) {
  const route = ROUTE_TRADEOFFS.find((candidate) => candidate.nodeId === nodeId);
  if (!route) return undefined;
  return {
    ...route,
    contactDelta: day <= 2 ? 0 : route.nightContactDeltaAfterTutorial,
    tutorialSafetyApplied: day <= 2,
  };
}

export function resourceWarnings(
  run: VoyageRunInput,
  pendingDelta: Partial<ResourceState> = {},
): string[] {
  return RESOURCE_WARNING_RULES.filter((rule) => {
    const key = rule.key as keyof ResourceState;
    return run.resources[key] + (pendingDelta[key] ?? 0) <= rule.atOrBelow;
  }).map((rule) => rule.message);
}

export function availableRefillActions(run: VoyageRunInput) {
  const state = stateFor(run);
  return REFILL_ACTIONS.map((action) => {
    const settlementId = transactionId([run.seed, run.day, action.id]);
    const insufficient = Object.entries(action.cost).find(
      ([key, delta]) => run.resources[key as keyof ResourceState] + delta < 0,
    );
    const reason = state.settlementIds.includes(settlementId)
      ? "今天已完成這項補充。"
      : run.phase !== "prep"
        ? "只有整備階段能補充。"
        : run.actionPoints < action.apCost
          ? `需要 ${action.apCost} AP。`
          : insufficient
            ? `${insufficient[0]}不足。`
            : undefined;
    return { ...action, available: !reason, reason, settlementId };
  });
}

export function commitRefillAction(
  run: VoyageRunInput,
  actionId: string,
): VoyageActionResult {
  const state = stateFor(run);
  const action = availableRefillActions({ ...run, voyage: state }).find(
    (candidate) => candidate.id === actionId,
  );
  if (!action?.available) {
    return result(state, { message: action?.reason ?? "未知的補充操作。" });
  }
  const draft = cloneState(state);
  draft.settlementIds.push(action.settlementId);
  const resourceDelta = addDelta(action.cost, action.gain);
  return result(draft, {
    ok: true,
    message: `${action.title}完成。${action.warning}`,
    resourceDelta,
    apCost: action.apCost,
    eventType: "action.committed",
    eventPayload: {
      transactionId: action.settlementId,
      settlementId: action.settlementId,
      operation: action.id,
      result: "success",
      day: run.day,
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function repairVoyageState(value: unknown): VoyageState {
  if (!isRecord(value)) return createVoyageState();
  const state = createVoyageState();
  if (isRecord(value.stoppedDays)) {
    for (const [day, expeditionId] of Object.entries(value.stoppedDays)) {
      if (typeof expeditionId === "string") state.stoppedDays[day] = expeditionId;
    }
  }
  if (Array.isArray(value.expeditions)) {
    state.expeditions = value.expeditions.filter(
      (record): record is ExpeditionRecord =>
        isRecord(record) &&
        typeof record.expeditionId === "string" &&
        typeof record.siteId === "string" &&
        typeof record.settlementId === "string",
    );
  }
  if (isRecord(value.relationships)) {
    for (const [missionId, record] of Object.entries(value.relationships)) {
      if (isRecord(record) && typeof record.settlementId === "string") {
        state.relationships[missionId] = record as unknown as VoyageState["relationships"][string];
      }
    }
  }
  if (isRecord(value.facilityChoices)) {
    state.facilityChoices = { ...value.facilityChoices } as VoyageState["facilityChoices"];
  }
  if (isRecord(value.facilities)) {
    state.facilities = { ...value.facilities } as VoyageState["facilities"];
  }
  if (Array.isArray(value.settlementIds)) {
    state.settlementIds = [...new Set(value.settlementIds.filter((id): id is string => typeof id === "string"))];
  }
  if (Array.isArray(value.nightSummaries)) {
    state.nightSummaries = value.nightSummaries
      .filter((summary): summary is VoyageState["nightSummaries"][number] =>
        isRecord(summary) && typeof summary.day === "number",
      )
      .map((summary) => ({
        day: summary.day,
        wakeupsDelta: Number(summary.wakeupsDelta) || 0,
        passengerAlive: summary.passengerAlive !== false,
        hullPositive: summary.hullPositive !== false,
        reservePositive: summary.reservePositive === true,
        lifeSupportPowered: summary.lifeSupportPowered === true,
        manualCounter: summary.manualCounter === true,
      }));
  }
  if (typeof value.nightStartWakeups === "number") state.nightStartWakeups = value.nightStartWakeups;
  if (typeof value.lastSettledDay === "number") state.lastSettledDay = value.lastSettledDay;
  if (Array.isArray(value.inspectedIds)) {
    state.inspectedIds = [...new Set(value.inspectedIds.filter((id): id is string => typeof id === "string"))];
  }
  if (isRecord(value.activeExpedition)) {
    const active = value.activeExpedition;
    const site = EXPEDITIONS.find((candidate) => candidate.id === active.siteId);
    if (
      site &&
      typeof active.expeditionId === "string" &&
      typeof active.day === "number" &&
      typeof active.nodeIndex === "number" &&
      active.nodeIndex >= 0 &&
      active.nodeIndex <= 2 &&
      isRecord(active.rolls)
    ) {
      state.activeExpedition = {
        expeditionId: active.expeditionId,
        siteId: site.id,
        routeId: site.routeId,
        day: active.day,
        nodeIndex: active.nodeIndex as 0 | 1 | 2,
        rolls: {
          observation: Number(active.rolls.observation) || 0,
          tool: Number(active.rolls.tool) || 0,
          depth: Number(active.rolls.depth) || 0,
        },
        choices: Array.isArray(active.choices)
          ? active.choices.filter((choice): choice is ExpeditionChoiceId =>
              ["survey", "proper-tool", "improvise", "withdraw", "deep-dive"].includes(String(choice)),
            )
          : [],
        collected: isRecord(active.collected)
          ? (active.collected as Partial<ResourceState>)
          : {},
        usedProperTool: active.usedProperTool === true,
      };
    }
  }
  return state;
}

function stateFor(run: VoyageRunInput): VoyageState {
  return repairVoyageState(run.voyage);
}

function transactionId(parts: Array<string | number>): string {
  const material = parts.join(":");
  return `v2-${hashString(material).toString(36)}-${hashString(`receipt:${material}`).toString(36)}`;
}

function result(
  stateDraft: VoyageState,
  overrides: Partial<Omit<VoyageActionResult, "stateDraft">>,
): VoyageActionResult {
  return {
    ok: false,
    message: "操作未完成。",
    resourceDelta: {},
    survivorDelta: {},
    environmentDelta: {},
    apCost: 0,
    eventType: null,
    eventPayload: null,
    ...overrides,
    stateDraft,
  };
}

function addDelta(
  collected: Partial<ResourceState>,
  delta: Partial<ResourceState>,
): Partial<ResourceState> {
  const next = { ...collected };
  for (const [key, amount] of Object.entries(delta)) {
    const resourceKey = key as keyof ResourceState;
    next[resourceKey] = (next[resourceKey] ?? 0) + (amount ?? 0);
  }
  return next;
}

function moduleReady(run: VoyageRunInput, definitionId?: string): boolean {
  if (!definitionId) return true;
  return run.modules.some(
    (module) =>
      module.definitionId === definitionId &&
      module.active &&
      module.powered &&
      module.durability > 0,
  );
}

export function availableExpeditions(run: VoyageRunInput): ExpeditionAvailability[] {
  const state = stateFor(run);
  const stopped = state.stoppedDays[String(run.day)];
  return EXPEDITIONS.filter((site) => site.routeId === run.routeId).map((site) => {
    let reason: string | undefined;
    if (state.activeExpedition) reason = "已有進行中的停站探索。";
    else if (stopped) reason = "今天已使用一次停站機會。";
    else if (state.expeditions.some((record) => record.siteId === site.id)) reason = "本局已探索此站點，不能重抽。";
    else if (run.day < site.dayMin || run.day > site.dayMax) reason = `可探索日為第 ${site.dayMin}–${site.dayMax} 日。`;
    else if (run.phase !== "prep" && run.phase !== "route") reason = "只有整備或選路階段能開始停站。";
    else if (run.actionPoints < 1) reason = "停站探索需要 1 AP。";
    return {
      id: site.id,
      title: site.title,
      description: site.description,
      discoveryId: site.discoveryId,
      apCost: 1,
      necessaryTool: site.necessaryTool,
      worstCase: `深入時最差可能車體 ${site.deepRisk.hull}、噪音 +${site.deepRisk.noise}、壓力 +${site.deepRisk.stress}。`,
      available: reason === undefined,
      reason,
    };
  });
}

export function startExpedition(
  run: VoyageRunInput,
  requestedSiteId?: ExpeditionSiteId,
): VoyageActionResult {
  const state = stateFor(run);
  const availabilityList = availableExpeditions({ ...run, voyage: state });
  const selectedSiteId = requestedSiteId ?? availabilityList.find((item) => item.available)?.id;
  const availability = availabilityList.find((item) => item.id === selectedSiteId);
  if (!availability?.available) {
    return result(state, { message: availability?.reason ?? "這個站點不屬於目前路線。" });
  }
  const siteId = availability.id;
  const site = EXPEDITIONS.find((candidate) => candidate.id === siteId)!;
  const expeditionId = `exp-${run.routeId.toLowerCase()}-${run.day}-${hashString(`${run.seed}:${siteId}:${run.day}`).toString(36)}`;
  const rng = createRng(run.seed, `expedition:${run.routeId}:${run.day}:${siteId}`);
  const active: ActiveExpedition = {
    expeditionId,
    siteId,
    routeId: run.routeId,
    day: run.day,
    nodeIndex: 0,
    rolls: { observation: rng(), tool: rng(), depth: rng() },
    choices: [],
    collected: {},
    usedProperTool: false,
  };
  const draft = cloneState(state);
  draft.activeExpedition = active;
  draft.stoppedDays[String(run.day)] = expeditionId;
  const tx = transactionId([expeditionId, "start"]);
  return result(draft, {
    ok: true,
    message: `已停靠${site.title}；固定結果已寫入本局，讀檔不會重抽。`,
    apCost: 1,
    eventType: "expedition.started",
    eventPayload: { transactionId: tx, expeditionId, routeId: run.routeId, siteId, day: run.day },
  });
}

function settleExpedition(
  state: VoyageState,
  active: ActiveExpedition,
  status: "withdrawn" | "resolved",
  resultValue: "success" | "partial",
  resourceDelta: Partial<ResourceState>,
  survivorDelta: VoyageActionResult["survivorDelta"],
  environmentDelta: VoyageActionResult["environmentDelta"],
  message: string,
): VoyageActionResult {
  const site = EXPEDITIONS.find((candidate) => candidate.id === active.siteId)!;
  const settlementId = transactionId([
    active.expeditionId,
    status,
    active.choices.join(","),
  ]);
  if (state.settlementIds.includes(settlementId)) {
    return result(state, { message: "這次探索已結算，不能重複取得物資。" });
  }
  const draft = cloneState(state);
  const record: ExpeditionRecord = {
    expeditionId: active.expeditionId,
    siteId: active.siteId,
    routeId: active.routeId,
    day: active.day,
    status,
    result: resultValue,
    discoveryId: site.discoveryId,
    collected: addDelta(active.collected, resourceDelta),
    settlementId,
    choices: [...active.choices],
  };
  draft.activeExpedition = undefined;
  draft.expeditions.push(record);
  draft.settlementIds.push(settlementId);
  return result(draft, {
    ok: true,
    message,
    resourceDelta,
    survivorDelta,
    environmentDelta,
    eventType: "expedition.resolved",
    eventPayload: {
      transactionId: settlementId,
      settlementId,
      expeditionId: active.expeditionId,
      routeId: active.routeId,
      siteId: active.siteId,
      discoveryId: site.discoveryId,
      result: resultValue,
      status,
      day: active.day,
    },
  });
}

export function chooseExpeditionStep(
  run: VoyageRunInput,
  choiceId: ExpeditionChoiceId,
): VoyageActionResult {
  const state = stateFor(run);
  const active = state.activeExpedition;
  if (!active) return result(state, { message: "目前沒有進行中的探索。" });
  const site = EXPEDITIONS.find((candidate) => candidate.id === active.siteId)!;
  if (active.day !== run.day || active.routeId !== run.routeId) {
    return result(state, { message: "探索上下文與目前旅程不一致，請先撤回。" });
  }
  const draft = cloneState(state);
  const next = draft.activeExpedition!;
  if (active.nodeIndex === 0) {
    if (choiceId !== "survey") return result(state, { message: "第一節點必須先觀察環境。" });
    next.choices.push(choiceId);
    next.nodeIndex = 1;
    next.collected = addDelta(next.collected, site.observationLoot);
    const tx = transactionId([active.expeditionId, "node-0", choiceId]);
    return result(draft, {
      ok: true,
      message: "觀察完成；找到的物資已可帶回，下一步選擇工具。",
      resourceDelta: site.observationLoot,
      eventType: "expedition.progressed",
      eventPayload: { transactionId: tx, expeditionId: active.expeditionId, node: 0, choiceId },
    });
  }
  if (active.nodeIndex === 1) {
    if (choiceId !== "proper-tool" && choiceId !== "improvise") {
      return result(state, { message: "第二節點必須選擇工具或臨時處置。" });
    }
    if (choiceId === "proper-tool" && !moduleReady(run, site.toolDefinitionId)) {
      return result(state, { message: `${site.necessaryTool}未安裝或未供電，不能使用。` });
    }
    const loot = choiceId === "proper-tool" ? site.toolLoot : site.improvisedLoot;
    next.choices.push(choiceId);
    next.nodeIndex = 2;
    next.usedProperTool = choiceId === "proper-tool";
    next.collected = addDelta(next.collected, loot);
    const tx = transactionId([active.expeditionId, "node-1", choiceId]);
    return result(draft, {
      ok: true,
      message: choiceId === "proper-tool" ? "工具判讀成功；可安全撤回或承擔風險深入。" : "臨時處置取得局部物資；深入風險較高。",
      resourceDelta: loot,
      eventType: "expedition.progressed",
      eventPayload: { transactionId: tx, expeditionId: active.expeditionId, node: 1, choiceId },
    });
  }
  if (choiceId === "withdraw") return withdrawExpedition(run);
  if (choiceId !== "deep-dive") {
    return result(state, { message: "第三節點只能撤回或深入。" });
  }
  const riskThreshold = site.deepRisk.threshold + (active.usedProperTool ? -0.12 : 0.12);
  const riskHit = active.rolls.depth < riskThreshold;
  const deepLoot = site.deepLoot;
  const settledActive: ActiveExpedition = {
    ...active,
    choices: [...active.choices, choiceId],
    collected: { ...active.collected },
  };
  return settleExpedition(
    state,
    settledActive,
    "resolved",
    riskHit ? "partial" : "success",
    deepLoot,
    riskHit ? { stress: site.deepRisk.stress } : {},
    riskHit ? { hull: site.deepRisk.hull, noise: site.deepRisk.noise } : { noise: Math.ceil(site.deepRisk.noise / 2) },
    riskHit
      ? "深入取得額外物資，但固定風險判定造成車體、噪音與壓力代價。"
      : "深入成功，額外物資與站點證據已結算。",
  );
}

export function withdrawExpedition(run: VoyageRunInput): VoyageActionResult {
  const state = stateFor(run);
  const active = state.activeExpedition;
  if (!active) return result(state, { message: "目前沒有可撤回的探索。" });
  const settledActive: ActiveExpedition = {
    ...active,
    choices: [...active.choices, "withdraw"],
    collected: { ...active.collected },
  };
  return settleExpedition(
    state,
    settledActive,
    "withdrawn",
    "partial",
    {},
    {},
    {},
    "檢修裝置已撤回；先前找到的物資全部保留，本日不能重啟探索。",
  );
}

function resourceRequirementFailure(
  run: VoyageRunInput,
  required?: Partial<ResourceState>,
): string | undefined {
  for (const [key, amount] of Object.entries(required ?? {})) {
    if (run.resources[key as keyof ResourceState] < (amount ?? 0)) return `${key}不足。`;
  }
  return undefined;
}

function relationshipChoiceAvailability(
  run: VoyageRunInput,
  choice: (typeof RELATIONSHIPS)[number]["choices"][number],
): RelationshipChoiceAvailability {
  const requirement = choice.requires;
  let reason = resourceRequirementFailure(run, requirement?.resource);
  if (!reason && requirement?.minimumTrust !== undefined && run.survivor.trust < requirement.minimumTrust) {
    reason = `信任需達 ${requirement.minimumTrust}。`;
  }
  if (!reason && requirement?.flag) {
    const flags = new Set(run.flags ?? []);
    const hasEvidence = requirement.flag === "expedition-evidence"
      ? stateFor(run).expeditions.length > 0
      : requirement.flag === "roster-evidence"
        ? flags.has("roster-evidence") || flags.has("rosterGap") || flags.has("a07IdentityKnown")
        : flags.has(requirement.flag);
    if (!hasEvidence) reason = "目前沒有足夠證據；可選擇承認未知。";
  }
  return { id: choice.id, label: choice.label, description: choice.description, available: !reason, reason };
}

export function availableRelationships(run: VoyageRunInput): RelationshipAvailability[] {
  const state = stateFor(run);
  return RELATIONSHIPS.filter(
    (relationship) =>
      relationship.day === run.day && !state.relationships[relationship.missionId],
  ).map((relationship) => ({
    missionId: relationship.missionId,
    npcId: relationship.npcId,
    stepId: relationship.stepId,
    title: relationship.title,
    prompt: relationship.prompt,
    fallbackContext: Boolean(
      relationship.priorMissionId && !state.relationships[relationship.priorMissionId],
    ),
    choices: relationship.choices.map((choice) => relationshipChoiceAvailability(run, choice)),
  }));
}

export function resolveRelationshipChoice(
  run: VoyageRunInput,
  missionOrNpcId: string,
  choiceId: string,
): VoyageActionResult {
  const state = stateFor(run);
  const available = availableRelationships({ ...run, voyage: state });
  const relationshipView = available.find(
    (candidate) => candidate.missionId === missionOrNpcId || candidate.npcId === missionOrNpcId,
  );
  if (!relationshipView) return result(state, { message: "目前沒有可回應的關係節點，或本節點已結算。" });
  const definition = RELATIONSHIPS.find((candidate) => candidate.missionId === relationshipView.missionId)!;
  const choice = definition.choices.find((candidate) => candidate.id === choiceId);
  const choiceView = relationshipView.choices.find((candidate) => candidate.id === choiceId);
  if (!choice || !choiceView?.available) {
    return result(state, { message: choiceView?.reason ?? "未知的關係選項。" });
  }
  const resourceDelta = addDelta(choice.cost ?? {}, choice.resourceDelta ?? {});
  for (const [key, amount] of Object.entries(resourceDelta)) {
    if (run.resources[key as keyof ResourceState] + (amount ?? 0) < 0) {
      return result(state, { message: `${key}不足，沒有提交關係選擇。` });
    }
  }
  const settlementId = transactionId([run.seed, definition.missionId, choice.id]);
  if (state.settlementIds.includes(settlementId)) {
    return result(state, { message: "這個關係選擇已結算。" });
  }
  const draft = cloneState(state);
  const fallbackContext = Boolean(definition.priorMissionId && !state.relationships[definition.priorMissionId]);
  const resolvedResult = fallbackContext && choice.result === "success" ? "fallback" : choice.result;
  draft.relationships[definition.missionId] = {
    missionId: definition.missionId,
    npcId: definition.npcId,
    stepId: definition.stepId,
    choiceId: choice.id,
    result: resolvedResult,
    settlementId,
  };
  draft.settlementIds.push(settlementId);
  return result(draft, {
    ok: true,
    message: choice.journalText,
    resourceDelta,
    survivorDelta: {
      ...(choice.trustDelta ? { trust: choice.trustDelta } : {}),
      ...(choice.stressDelta ? { stress: choice.stressDelta } : {}),
    },
    eventType: "relationship.choice",
    eventPayload: {
      transactionId: settlementId,
      settlementId,
      missionId: definition.missionId,
      npcId: definition.npcId,
      stepId: definition.stepId,
      choiceId: choice.id,
      result: resolvedResult,
      fallbackContext,
      storyConsentChanged: false,
      mainStoryBranchChanged: false,
    },
  });
}

export { commitFacilityUpgrade, previewFacilityUpgrade } from "../facility-slots";
