import {
  ALL_STORY_EVENTS,
  BALANCE,
  CROPS,
  DAY4_BRANCH_DEFINITIONS,
  DECORATIONS,
  DECORATION_SLOTS,
  EVENTS,
  FROST_STORY_DAY_SCHEDULE,
  MODULES,
  ROUTE_EVENT_POOLS,
  ROUTE_NODES,
  STORY_DAY_SCHEDULE,
  TECH_NODES,
  THREATS,
} from "./content";
import type { StoryContentChoice, StoryContentEvent } from "./content";
import { createDecorationPlacements } from "./model";
import { createRng } from "./rng";
import {
  applyDay4Route,
  applyFrostBranch,
  consumeStoryEvent,
  effectiveFrostAllocation,
  evaluateA07Consent,
  evaluateEnding,
  evaluateFrostEnding,
  frostClearRequirement,
  frostWarmRequirement,
  getDueStoryEvents,
  getThermalAllocation,
  queueStoryEvent,
  refreshTrueRouteData,
  thermalRoutingIsValid,
  tokensForCommittedAllocation,
} from "./story";
import type {
  CropId,
  CropPlotId,
  DecorationId,
  EnvironmentKey,
  EventChoice,
  FrostZone,
  HeatTokenId,
  RationMode,
  ResourceKey,
  RouteNode,
  RunState,
  StoryDuePhase,
  SurvivorKey,
  ThermalCommand,
  ThermalCommandResult,
  ThreatContact,
  ThreatInteractionCommand,
  ThreatInteractionResult,
  ThreatInteractionState,
  ThreatInteractionValue,
  ThreatInteractionVerb,
  ThreatSignal,
} from "./types";

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export const COUNTER_COSTS: Record<string, Partial<Record<ResourceKey, number>>> = {
  "close-shutter": { energy: -8 },
  "shock-window": { energy: -12 },
  "emergency-boost": { fuel: -4 },
  decoy: { energy: -6 },
};

const THREAT_INTERACTION_COMMANDS = new Set<ThreatInteractionCommand>([
  "cutter:plot-a",
  "cutter:plot-b",
  "signal:sig-a",
  "signal:sig-b",
  "trace:leaves",
  "trace:meter",
  "frost:inspect:BERTH",
  "frost:inspect:DEICER",
  "frost:inspect:LOOP",
  "frost:confirm",
  "frost:manual-scrape",
]);

const FROST_ZONES: readonly FrostZone[] = ["BERTH", "DEICER", "LOOP"];
const HEAT_TOKEN_IDS: readonly HeatTokenId[] = ["H1", "H2", "H3", "H4", "H5", "H6"];

const T005_SIGNAL_CLUES: readonly ThreatSignal[] = [
  { id: "sig-a", color: "amber", shape: "diamond", rhythm: "short-short-long" },
  { id: "sig-b", color: "cyan", shape: "circle", rhythm: "long-short-short" },
];

function isStoryChoice(choice: EventChoice): choice is StoryContentChoice {
  return "consequence" in choice;
}

function storyFlagValue(run: RunState, key: string): unknown {
  if (key.startsWith("whiteFrost.")) {
    const frostKey = key.slice("whiteFrost.".length);
    return (run.story.whiteFrost as unknown as Record<string, unknown> | null)?.[frostKey];
  }
  return (run.story.flags as unknown as Record<string, unknown>)[key];
}

function storyFlagSatisfied(run: RunState, requirement: string): boolean {
  const [key, rawMinimum] = requirement.split(":");
  const value = storyFlagValue(run, key ?? "");
  if (rawMinimum !== undefined) return typeof value === "number" && value >= Number(rawMinimum);
  return Boolean(value);
}

function storyConditionMatches(run: RunState, condition: Record<string, boolean | number | string | null>): boolean {
  return Object.entries(condition).every(([key, expected]) => {
    if (key === "a07Consent") return evaluateA07Consent(run).consents === expected;
    return storyFlagValue(run, key) === expected;
  });
}

function isStoryEvent(event: { id: string }): event is StoryContentEvent {
  return "forced" in event;
}

type WhiteFrostConsequence = NonNullable<StoryContentChoice["consequence"]["whiteFrost"]>;

function scheduledStoryEventForRun(run: RunState, duePhase?: StoryDuePhase) {
  const day = run.day as keyof typeof STORY_DAY_SCHEDULE;
  if (run.routeId === "R01") return STORY_DAY_SCHEDULE[day]?.[0];
  const branch = run.story.whiteFrost?.branch;
  return FROST_STORY_DAY_SCHEDULE[day]?.find((entry) =>
    (!duePhase || entry.duePhase === duePhase)
    && (!entry.frostBranch || entry.frostBranch === branch)
    && !run.story.seenEventIds.includes(entry.eventId),
  );
}

export function getNightPowerDemand(run: RunState): number {
  const efficiencyDiscount = run.techOwned.includes("E1") ? 1 : 0;
  return run.modules.reduce((total, instance) => {
    if (!instance.active) return total;
    const definition = MODULES.find((module) => module.id === instance.definitionId);
    return total + Math.max(0, (definition?.activeCost ?? 0) - efficiencyDiscount);
  }, 0);
}

export function counterReadiness(run: RunState, counterId: string): { available: boolean; reason: string } {
  const requiredModules: Record<string, string> = { "close-shutter": "M001", decoy: "M006" };
  const requiredModule = requiredModules[counterId];
  if (requiredModule) {
    const module = run.modules.find((instance) => instance.definitionId === requiredModule);
    if (!module) return { available: false, reason: "未安裝" };
    if (!module.active || !module.powered) return { available: false, reason: "未供電" };
  }
  for (const [key, delta] of Object.entries(COUNTER_COSTS[counterId] ?? {})) {
    if (typeof delta === "number" && run.resources[key as ResourceKey] + delta < 0) return { available: false, reason: `${key === "fuel" ? "燃料" : "電量"}不足` };
  }
  return { available: true, reason: "可用" };
}

export class RunService {
  public enterStoryPhase(run: RunState, duePhase: "prep" | "route"): boolean {
    if (run.routeId !== "R02" || run.ended || run.activeEventId) return false;
    const scheduled = scheduledStoryEventForRun(run, duePhase);
    if (!scheduled) return false;
    run.phase = duePhase;
    run.activeEventId = scheduled.eventId;
    run.lastMessage = duePhase === "prep"
      ? `第 ${run.day} 日整備故事已就緒。`
      : `第 ${run.day} 日永久路線決策必須先完成。`;
    return true;
  }

  public moveDecoration(run: RunState, id: DecorationId, slotId: string): boolean {
    const placement = run.decorations.find((item) => item.id === id);
    const definition = DECORATIONS.find((item) => item.id === id);
    const slot = DECORATION_SLOTS.find((item) => item.id === slotId);
    if (!placement || !definition) return false;
    if (!slot) {
      run.lastMessage = `${definition.name}沒有吸附到放置槽；請放到標示的掛鉤、檯面或層架。`;
      return false;
    }
    if (!slot.accepts.includes(id)) {
      run.lastMessage = `${slot.name}不適合${definition.name}；紅色斜線槽不能放置。`;
      return false;
    }
    const occupied = run.decorations.find((item) => item.id !== id && item.slotId === slot.id);
    if (occupied) {
      const occupiedName = DECORATIONS.find((item) => item.id === occupied.id)?.name ?? "其他物件";
      run.lastMessage = `${slot.name}已放置${occupiedName}；請先移到別的槽位。`;
      return false;
    }
    placement.carriageId = slot.carriageId;
    placement.slotId = slot.id;
    placement.x = slot.x;
    placement.y = slot.y;
    run.lastMessage = `${definition.name}已吸附到${slot.name}；位置已自動保存。`;
    return true;
  }

  public resetDecorations(run: RunState): void {
    run.decorations = createDecorationPlacements();
    run.lastMessage = "四件小物已回到各自相容的車廂槽位。";
  }

  public applyResource(run: RunState, key: ResourceKey, delta: number, source: string): boolean {
    const before = run.resources[key];
    const maximum = BALANCE.max[key];
    if (delta < 0 && before + delta < 0) return false;
    const after = clamp(before + delta, 0, maximum);
    run.resources[key] = after;
    run.ledger.push({ id: crypto.randomUUID(), at: Date.now(), source, key, before, delta: after - before, after });
    return true;
  }

  public applySurvivor(run: RunState, key: SurvivorKey, delta: number, source: string): void {
    const before = run.survivor[key];
    const maximum = key === "wakeups" ? 99 : 100;
    const after = clamp(before + delta, 0, maximum);
    run.survivor[key] = after;
    run.ledger.push({ id: crypto.randomUUID(), at: Date.now(), source, key, before, delta: after - before, after });
  }

  public applyEnvironment(run: RunState, key: EnvironmentKey, delta: number, source: string): void {
    const before = run.environment[key];
    const minimum = key === "temperature" ? -10 : 0;
    const maximum = key === "temperature" ? 35 : 100;
    const after = clamp(before + delta, minimum, maximum);
    run.environment[key] = after;
    run.ledger.push({ id: crypto.randomUUID(), at: Date.now(), source, key, before, delta: after - before, after });
  }

  private endRunIfTerminal(run: RunState): boolean {
    if (run.environment.hull > 0 && run.survivor.health > 0) return false;
    run.activeContact = undefined;
    run.activeEventId = undefined;
    run.phase = "ending";
    run.ended = true;
    run.outcome = run.environment.hull <= 0 ? "hull-lost" : "survivor-lost";
    run.lastMessage = run.environment.hull <= 0
      ? "車體失去密封，守護協定被迫終止。"
      : "A-07 生命徵象消失，守護協定被迫終止。";
    return true;
  }

  public chooseRoute(run: RunState, nodeId: string): void {
    if ((run.phase !== "prep" && run.phase !== "route") || run.activeEventId || run.ended) {
      run.lastMessage = "目前階段不能重複確認路線。";
      return;
    }
    if (this.enterStoryPhase(run, "route")) return;
    const node = ROUTE_NODES.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(`Unknown route node: ${nodeId}`);
    const frostFuelPenalty = run.routeId === "R02" ? run.story.whiteFrost?.pendingRouteFuelPenalty ?? 0 : 0;
    if (run.resources.fuel < node.fuelCost + frostFuelPenalty) {
      run.lastMessage = "燃料不足，請選擇較近的節點。";
      return;
    }
    this.applyResource(run, "fuel", -node.fuelCost, `route.${node.id}`);
    if (frostFuelPenalty > 0) {
      this.applyResource(run, "fuel", -frostFuelPenalty, `route.${node.id}.frost-penalty`);
      if (run.story.whiteFrost) run.story.whiteFrost.pendingRouteFuelPenalty = 0;
    }
    run.selectedRouteNodeId = node.id;
    this.activateTravelAfterRoute(run, node);
    run.lastMessage = `已鎖定 ${node.name}，預計消耗燃料 ${node.fuelCost}。`;
  }

  public emergencyRoute(run: RunState): boolean {
    if ((run.phase !== "prep" && run.phase !== "route") || run.activeEventId || run.ended) {
      run.lastMessage = "目前不能啟動慣性滑行。";
      return false;
    }
    if (this.enterStoryPhase(run, "route")) return false;
    const frostFuelPenalty = run.routeId === "R02" ? run.story.whiteFrost?.pendingRouteFuelPenalty ?? 0 : 0;
    const cheapestCost = Math.min(...ROUTE_NODES.map((node) => node.fuelCost + frostFuelPenalty));
    if (run.resources.fuel >= cheapestCost) {
      run.lastMessage = "仍有可正常抵達的路線，不需要承擔慣性滑行風險。";
      return false;
    }
    const fallback = ROUTE_NODES.find((node) => node.id === "RN01") ?? ROUTE_NODES[0];
    if (!fallback) return false;
    this.applyEnvironment(run, "hull", -6, "route.emergency-drift");
    this.applyEnvironment(run, "temperature", -3, "route.emergency-drift");
    this.applySurvivor(run, "sleep", -8, "route.emergency-drift");
    this.applySurvivor(run, "stress", 8, "route.emergency-drift");
    if (run.story.whiteFrost) run.story.whiteFrost.pendingRouteFuelPenalty = 0;
    if (this.endRunIfTerminal(run)) return true;
    run.selectedRouteNodeId = fallback.id;
    this.activateTravelAfterRoute(run, fallback);
    run.lastMessage = `燃料不足，列車以慣性滑向${fallback.name}；車體 −6、溫度 −3、睡眠 −8、壓力 +8。`;
    return true;
  }

  private activateTravelAfterRoute(run: RunState, node: RouteNode): void {
    const scheduledStoryEvent = run.routeId === "R02"
      ? scheduledStoryEventForRun(run, "travel")
      : scheduledStoryEventForRun(run);
    if (scheduledStoryEvent && !run.story.seenEventIds.includes(scheduledStoryEvent.eventId)) {
      run.activeEventId = scheduledStoryEvent.eventId;
      if (scheduledStoryEvent.finaleStage) {
        if (run.routeId === "R01") run.story.finaleStage = scheduledStoryEvent.finaleStage;
        else if (run.story.whiteFrost && scheduledStoryEvent.eventId === "EV063") run.story.whiteFrost.finaleStage = "warm";
      }
    } else {
      const eventPool = ROUTE_EVENT_POOLS[node.id] ?? [node.eventId];
      run.activeEventId = eventPool[(run.day - 1) % eventPool.length] ?? node.eventId;
    }
    run.phase = "travel";
  }

  public resolveEvent(run: RunState, choice: EventChoice): boolean {
    const event = this.getEvent(run);
    const eventId = run.activeEventId;
    if (!event || !eventId || !event.choices.some((candidate) => candidate.id === choice.id)) return false;
    if (run.routeId === "R01" && eventId >= "EV053" && eventId <= "EV065") return false;
    if (run.routeId === "R02" && eventId >= "EV041" && eventId <= "EV052") return false;
    const storyEvent = isStoryEvent(event) ? event : undefined;
    const eventRequirements = storyEvent?.requirements;
    if (eventRequirements?.allFlags?.some((requirement) => !storyFlagSatisfied(run, requirement))) {
      run.lastMessage = "故事證據不足，這個事件尚不能結算。";
      return false;
    }
    if (eventRequirements?.anyFlags && !eventRequirements.anyFlags.some((requirement) => storyFlagSatisfied(run, requirement))) {
      run.lastMessage = "至少還缺一項可驗證的故事證據。";
      return false;
    }
    if (eventRequirements?.techOwned?.some((techId) => !run.techOwned.includes(techId))) {
      run.lastMessage = `需要 ${eventRequirements.techOwned.join("、")} 才能繼續解碼。`;
      return false;
    }
    if (eventRequirements?.endingRequired && !run.story.endingId) {
      run.lastMessage = "結局尚未鎖定，不能提前進入尾聲。";
      return false;
    }

    const storyChoice = isStoryChoice(choice) ? choice : undefined;
    const requirements = storyChoice?.requirements;
    const whiteFrost = run.story.whiteFrost;
    if (eventId === "EV065" && whiteFrost?.rewardSettled) {
      run.lastMessage = "白霜線結局與路線獎勵已結算，不能重複套用。";
      return false;
    }
    if (requirements?.allFlags?.some((requirement) => !storyFlagSatisfied(run, requirement))) {
      run.lastMessage = "尚未完成這項操作所需的故事條件。";
      return false;
    }
    const effectiveMinimum = { ...(requirements?.minimum ?? {}) };
    if (eventId === "EV064" && choice.id === "deice" && whiteFrost?.switchMethod === "deicer") {
      effectiveMinimum.energy = 2;
    }
    for (const [key, minimum] of Object.entries(effectiveMinimum)) {
      const current = key in run.resources
        ? run.resources[key as ResourceKey]
        : run.survivor[key as SurvivorKey];
      if (typeof minimum === "number" && current < minimum) {
        run.lastMessage = "資源或乘客狀態不足，無法執行這項操作。";
        return false;
      }
    }
    const consent = requirements?.a07ConsentOrTech ? evaluateA07Consent(run) : undefined;
    if (requirements?.a07ConsentOrTech && !consent?.consents && !run.techOwned.includes(requirements.a07ConsentOrTech)) {
      run.lastMessage = `A-07 不同意；需要 ${requirements.a07ConsentOrTech} 才能覆寫。`;
      return false;
    }
    if (requirements?.frostBranch && whiteFrost?.branch !== requirements.frostBranch) {
      run.lastMessage = `這項操作只屬於 ${requirements.frostBranch} 分支。`;
      return false;
    }
    if (requirements?.frostSwitchMethod && whiteFrost?.switchMethod !== requirements.frostSwitchMethod) {
      run.lastMessage = `需要先以 ${requirements.frostSwitchMethod} 方式處理凍結轉轍。`;
      return false;
    }
    if (requirements?.frostConsent && whiteFrost?.consent !== requirements.frostConsent) {
      run.lastMessage = `需要 A-07 的 ${requirements.frostConsent} 同意狀態。`;
      return false;
    }
    if (requirements?.frostCoauthorEvidence && !whiteFrost?.coauthorEvidence) {
      run.lastMessage = "尚未取得 A-07 的共同署名證據。";
      return false;
    }
    if (requirements?.frostThermal) {
      if (!whiteFrost) return false;
      const actual = getThermalAllocation(whiteFrost.thermal.tokens);
      if (requirements.frostThermal === "day7-committed" && whiteFrost.thermal.committedDay !== 7) {
        run.lastMessage = "尚未提交 Day 7 熱力配置。";
        return false;
      }
      if (
        requirements.frostThermal === "warm-ready"
        && (whiteFrost.thermal.committedDay !== 7 || actual.BERTH < frostWarmRequirement(whiteFrost))
      ) {
        run.lastMessage = `WARM 尚未成立：Day 7 BERTH 實際需要 ${frostWarmRequirement(whiteFrost)} 枚。`;
        return false;
      }
      if (requirements.frostThermal === "clear-ready" && actual.DEICER < frostClearRequirement(whiteFrost)) {
        run.lastMessage = `CLEAR 尚未成立：DEICER 實際需要 ${frostClearRequirement(whiteFrost)} 枚。`;
        return false;
      }
    }
    if (eventId === "EV055" && choice.id === "deicer" && (whiteFrost ? getThermalAllocation(whiteFrost.thermal.tokens).DEICER : 0) < 2) {
      run.lastMessage = "DEICER 至少需要兩枚熱能單元才能融冰。";
      return false;
    }
    if (eventId === "EV065" && choice.id === "joint" && whiteFrost && run.survivor.trust < whiteFrost.jointTrustRequirement) {
      run.lastMessage = `共同加速需要信任 ${whiteFrost.jointTrustRequirement}。`;
      return false;
    }

    const consequence = storyChoice?.consequence;
    let resourceDelta = consequence?.resourceDelta ?? choice.deltas;
    if (eventId === "EV064" && choice.id === "deice" && whiteFrost?.switchMethod === "deicer") {
      resourceDelta = { ...resourceDelta, energy: -2 };
    }
    if (eventId === "EV065" && choice.id === "shield") {
      resourceDelta = { ...resourceDelta, fuel: -Math.min(2, run.resources.fuel) };
    }
    const survivorDelta = consequence?.survivorDelta ?? choice.survivor;
    const conditionalResource = (consequence?.conditionalResourceDelta ?? [])
      .filter((entry) => storyConditionMatches(run, entry.when))
      .flatMap((entry) => Object.entries(entry.delta));
    const conditionalSurvivor = (consequence?.conditionalSurvivorDelta ?? [])
      .filter((entry) => storyConditionMatches(run, entry.when))
      .flatMap((entry) => Object.entries(entry.delta));

    const totalResourceDelta = new Map<string, number>();
    for (const [key, delta] of [...Object.entries(resourceDelta), ...conditionalResource]) {
      if (typeof delta === "number") totalResourceDelta.set(key, (totalResourceDelta.get(key) ?? 0) + delta);
    }
    for (const [key, delta] of totalResourceDelta) {
      if (delta < 0 && run.resources[key as ResourceKey] + delta < 0) {
        run.lastMessage = `資源不足，無法執行「${choice.label}」。`;
        return false;
      }
    }
    for (const [key, delta] of totalResourceDelta) {
      this.applyResource(run, key as ResourceKey, delta, `event.${eventId}.${choice.id}`);
    }

    const totalSurvivorDelta = new Map<string, number>();
    for (const [key, delta] of [...Object.entries(survivorDelta ?? {}), ...conditionalSurvivor]) {
      if (typeof delta === "number") totalSurvivorDelta.set(key, (totalSurvivorDelta.get(key) ?? 0) + delta);
    }
    for (const [key, delta] of totalSurvivorDelta) {
      this.applySurvivor(run, key as SurvivorKey, delta, `event.${eventId}.${choice.id}`);
    }
    for (const [key, delta] of Object.entries(choice.environment ?? {})) {
      if (typeof delta === "number") this.applyEnvironment(run, key as EnvironmentKey, delta, `event.${eventId}.${choice.id}`);
    }
    if (this.endRunIfTerminal(run)) return true;

    if (consequence?.setFlags) {
      Object.assign(run.story.flags as unknown as Record<string, unknown>, consequence.setFlags);
    }
    if (consequence?.whiteFrost) this.applyWhiteFrostConsequence(run, consequence.whiteFrost);
    if (this.endRunIfTerminal(run)) return true;
    if (consequence?.day4Route) run.story = applyDay4Route(run.story, consequence.day4Route);
    if (consequence?.unlockDawnLogId && !run.story.dawnLogIds.includes(consequence.unlockDawnLogId)) {
      run.story.dawnLogIds.push(consequence.unlockDawnLogId);
    }
    if (consequence?.addEndingReason && !run.story.endingReasons.includes(consequence.addEndingReason)) {
      run.story.endingReasons.push(consequence.addEndingReason);
    }
    if (!run.story.seenEventIds.includes(eventId)) run.story.seenEventIds.push(eventId);

    if (eventId === "EV043") {
      for (const techId of ["I1", "E4"]) if (!run.techOwned.includes(techId)) run.techOwned.push(techId);
    }
    if (eventId === "EV045" || eventId === "EV047") this.recordBranchEvidence(run);
    if (eventId === "EV045" && run.story.flags.a07MovedObject) {
      const target = run.decorations.some((item) => item.slotId === "sleep-bedside" && item.id !== "radio")
        ? "kitchen-counter"
        : "sleep-bedside";
      this.moveDecoration(run, "radio", target);
    }
    if (eventId === "EV047" && run.story.flags.clause7Read && !run.techOwned.includes("I2")) {
      run.techOwned.push("I2");
    }
    if (requirements?.a07ConsentOrTech && consent && !consent.consents) run.story.flags.overrideUsed = true;
    if (consequence?.frostFinalDecision && consequence.frostEndingId && run.story.whiteFrost) {
      const evaluated = evaluateFrostEnding(run, consequence.frostFinalDecision);
      run.story.whiteFrost.finalDecision = consequence.frostFinalDecision;
      run.story.whiteFrost.endingId = consequence.frostEndingId;
      run.story.whiteFrost.endingReasons = [...new Set([
        ...run.story.whiteFrost.endingReasons,
        ...evaluated.reasons,
      ])];
    }

    run.lastMessage = choice.result;
    run.activeEventId = undefined;
    const transition = consequence?.transition;
    if (transition === "queue-next-phase") {
      const nextEvent = ALL_STORY_EVENTS.find((candidate) => candidate.id === consequence?.nextEventId);
      if (nextEvent?.storyPhase === "aftermath") {
        run.story = queueStoryEvent(run.story, {
          id: `${eventId}.${choice.id}.${nextEvent.id}`,
          eventId: nextEvent.id,
          dueDay: run.day,
          duePhase: "aftermath",
          sourceEventId: eventId,
          sourceChoiceId: choice.id,
        });
        if (run.routeId === "R02" && storyEvent?.storyPhase === "prep") {
          run.phase = "prep";
        } else if (run.routeId === "R02" && storyEvent?.storyPhase === "route") {
          run.phase = "route";
        } else {
          this.beginNight(run);
        }
      } else {
        run.activeEventId = consequence?.nextEventId;
        run.phase = "travel";
      }
    } else if (transition === "finale-decision" || transition === "ending-epilogue") {
      run.activeEventId = consequence?.nextEventId;
      run.phase = "travel";
      if (transition === "finale-decision") run.story.finaleStage = "decision";
    } else if (transition === "finale-contact") {
      run.story.finaleStage = "contact";
      this.beginNight(run);
    } else if (transition === "resolve-ending") {
      if (!consequence?.finalDecision) return false;
      run.story.finalDecision = consequence.finalDecision;
      const ending = evaluateEnding(run, consequence.finalDecision);
      run.story.endingId = ending.endingId;
      run.story.endingReasons = [...new Set([...run.story.endingReasons, ...ending.reasons])];
      run.story.finaleStage = "resolved";
      run.activeEventId = consequence.nextEventId;
      run.phase = "travel";
    } else if (transition === "story-complete") {
      run.story.finaleStage = "resolved";
      run.phase = "ending";
      run.ended = true;
      run.outcome = "victory";
    } else if (transition === "queue-next-day" && storyEvent?.storyPhase === "aftermath") {
      run.phase = "aftermath";
    } else if (transition === "queue-next-day" && run.routeId === "R02" && storyEvent?.storyPhase === "prep") {
      run.phase = "prep";
    } else if (transition === "queue-next-day" && run.routeId === "R02" && storyEvent?.storyPhase === "route") {
      run.phase = "route";
    } else if (transition === "thermal-board") {
      run.phase = "prep";
      run.activeEventId = undefined;
      run.lastMessage = "熱力板已展開；提交 Day 7 配置後會返回雪崩隧道入口。";
    } else if (transition === "frost-finale-contact") {
      if (run.story.whiteFrost) run.story.whiteFrost.finaleStage = "blizzard";
      this.beginNight(run);
    } else if (transition === "frost-finale-decision") {
      if (run.story.whiteFrost) run.story.whiteFrost.finaleStage = "accelerate";
      run.activeEventId = consequence?.nextEventId;
      run.phase = "travel";
    } else if (transition === "frost-story-complete") {
      const frost = run.story.whiteFrost;
      if (!frost?.finalDecision || !frost.endingId) return false;
      if (!frost.rewardSettled) {
        this.applyResource(run, "data", 4, "story.R02.route-complete");
        frost.rewardSettled = true;
      }
      frost.finaleStage = "resolved";
      run.phase = "ending";
      run.ended = true;
      run.outcome = "victory";
    } else {
      this.beginNight(run);
    }
    return true;
  }

  public beginNight(run: RunState): void {
    const route = ROUTE_NODES.find((node) => node.id === run.selectedRouteNodeId);
    const frostFinale = run.routeId === "R02" && run.day === 7 && run.story.whiteFrost?.finaleStage === "blizzard";
    const totalWaves = frostFinale ? 1 : run.day === 7 && run.routeId === "R01" ? 3 : Math.max(1, route?.threatLevel ?? 1);
    const powerReport = this.settleNightPower(run);
    if (run.day === 7 && run.routeId === "R01") {
      const matureCrops = run.crops.filter((plot) => plot.cropId && plot.stage >= 3).length;
      run.story.finaleHealthBuffer = matureCrops * 6;
      run.story.completedContactWaves = 0;
      run.story.finaleStage = "contact";
    }
    run.phase = "night";
    run.activeContact = this.createNightContact(run, 1, totalWaves);
    run.lastMessage = `${powerReport} 遠距感測出現異常，等待方向確認。接觸 1/${totalWaves}。`;
  }

  public tickNight(run: RunState): void {
    const contact = run.activeContact;
    if (run.phase !== "night" || !contact || contact.stage === "resolve") return;
    if (contact.stage === "breach") {
      this.advanceNightContactOrFinish(run, `${this.getThreat(contact)?.name ?? "威脅"}造成的破口已隔離。`);
      return;
    }
    contact.secondsLeft -= 1;
    if (contact.secondsLeft > 0) {
      if (contact.stage === "approach" && contact.secondsLeft <= 6) contact.stage = "warning";
      if (contact.stage === "warning" && contact.secondsLeft <= 3) contact.stage = "attack";
      return;
    }
    const threat = THREATS.find((candidate) => candidate.id === contact.definitionId);
    if (!threat) return;
    contact.stage = "breach";
    if (threat.id === "T009") {
      const temperatureBefore = run.environment.temperature;
      this.applyEnvironment(run, "temperature", -6, "threat.T009.timeout");
      this.applySurvivor(run, "sleep", -10, "threat.T009.timeout");
      if (temperatureBefore < 5) this.applySurvivor(run, "health", -4, "threat.T009.timeout.cold");
      run.lastMessage = temperatureBefore < 5
        ? "暴風雪造成環境失溫：溫度 −6、睡眠 −10、健康 −4。"
        : "暴風雪造成環境失溫：溫度 −6、睡眠 −10。";
      this.endRunIfTerminal(run);
      return;
    }
    this.applyStandardBreachDamage(run, threat);
  }

  public counterThreat(run: RunState, counterId: string): boolean {
    const contact = run.activeContact;
    if (!contact) return false;
    const threat = THREATS.find((candidate) => candidate.id === contact.definitionId);
    if (!threat) return false;
    if (threat.id === "T009") {
      this.ensureThreatInteraction(run);
      run.lastMessage = "暴風雪必須使用熱力板或 MANUAL_SCRAPE，舊式一鍵反制無效。";
      return false;
    }
    if (contact.interaction) {
      run.lastMessage = "這個接觸需要在可見線索上指定目標，不能用舊式一鍵反制跳過。";
      return false;
    }
    if (counterId === "brace-impact") {
      if (threat.id !== "T002" && threat.id !== "T003") {
        run.lastMessage = "只有一般窗外接觸能選擇承受撞擊；此威脅必須完成場景互動。";
        return false;
      }
      contact.stage = "breach";
      contact.resolvedBy = counterId;
      const ended = this.applyStandardBreachDamage(run, threat);
      if (ended) return true;
      return this.advanceNightContactOrFinish(run, `${threat.name}的撞擊已承受，列車帶傷繼續前進。`);
    }
    const readiness = counterReadiness(run, counterId);
    if (!readiness.available) {
      run.lastMessage = `反制未啟動：${readiness.reason}。`;
      return false;
    }
    const cost = COUNTER_COSTS[counterId] ?? {};
    for (const [key, delta] of Object.entries(cost)) {
      if (typeof delta === "number") this.applyResource(run, key as ResourceKey, delta, `counter.${counterId}`);
    }
    const effective = threat.counterIds.includes(counterId);
    if (effective) {
      contact.stage = "resolve";
      contact.resolvedBy = counterId;
      return this.advanceNightContactOrFinish(run, `${threat.name}已離開接觸範圍。`);
    }
    contact.secondsLeft = Math.max(1, contact.secondsLeft - 2);
    run.lastMessage = "反制無效，接觸仍在升級。";
    return false;
  }

  public applyThermalCommand(run: RunState, command: ThermalCommand): ThermalCommandResult {
    const frost = run.story.whiteFrost;
    if (run.routeId !== "R02" || !frost) {
      return this.thermalResult(run, "invalid", false, false, "熱力板只在白霜線可用。");
    }
    const thermal = frost.thermal;
    if (command.startsWith("thermal:select:")) {
      const tokenId = command.slice("thermal:select:".length) as HeatTokenId;
      if (!HEAT_TOKEN_IDS.includes(tokenId) || !thermal.tokens.some((token) => token.id === tokenId)) {
        return this.thermalResult(run, "invalid", false, false, "選到不存在的熱能單元。");
      }
      thermal.selectedTokenId = tokenId;
      return this.thermalResult(run, "accepted", true, false, `${tokenId} 已選取；請點選 BERTH、DEICER 或 LOOP。`);
    }
    if (command.startsWith("thermal:move:")) {
      const [, , rawTokenId, rawZone] = command.split(":");
      const tokenId = rawTokenId as HeatTokenId;
      const zone = rawZone as FrostZone;
      const token = thermal.tokens.find((candidate) => candidate.id === tokenId);
      if (!token || !FROST_ZONES.includes(zone)) {
        return this.thermalResult(run, "invalid", false, false, "拖放目標不是有效的熱能區域。");
      }
      if (token.zone === zone) {
        thermal.selectedTokenId = null;
        return this.thermalResult(run, "duplicate", false, false, `${tokenId} 已在 ${zone}。`);
      }
      token.zone = zone;
      thermal.selectedTokenId = null;
      thermal.revision += 1;
      return this.thermalResult(run, "accepted", true, false, `${tokenId} 已移至 ${zone}；配置修改序號 ${thermal.revision}。`);
    }
    if (command.startsWith("thermal:target:")) {
      const zone = command.slice("thermal:target:".length) as FrostZone;
      if (!FROST_ZONES.includes(zone)) {
        return this.thermalResult(run, "invalid", false, false, "熱力目標區域無效。");
      }
      if (!thermal.selectedTokenId) {
        return this.thermalResult(run, "invalid", false, false, "請先選一枚熱能單元，再點目標區域。");
      }
      return this.applyThermalCommand(run, `thermal:move:${thermal.selectedTokenId}:${zone}`);
    }
    if (command === "thermal:reset") {
      thermal.tokens = tokensForCommittedAllocation(thermal.committedAllocation);
      thermal.selectedTokenId = null;
      thermal.revision += 1;
      return this.thermalResult(run, "accepted", true, false, "已回到最後一次提交的熱力配置。");
    }
    if (command !== "thermal:commit") {
      return this.thermalResult(run, "invalid", false, false, "無法辨識熱力板指令。");
    }
    if (!thermalRoutingIsValid(thermal)) {
      return this.thermalResult(run, "invalid", false, false, "六枚熱能單元必須唯一，且全部位於三個有效區域。");
    }
    const settlementId = `thermal:R02:D${run.day}:${frost.branch ?? "UNSET"}`;
    if (thermal.committedDay === run.day || thermal.settlementIds.includes(settlementId)) {
      return this.thermalResult(run, "duplicate", false, false, "本日熱力配置已結算，不會重複扣除資源。", settlementId);
    }

    const actual = getThermalAllocation(thermal.tokens);
    const effective = effectiveFrostAllocation(frost);
    const berthCount = effective.BERTH;
    const deicerCount = effective.DEICER;
    const loopCount = effective.LOOP;
    const energyCost = 2 + (frost.branch === "SUSTAIN" ? 2 : 0) + (loopCount >= 3 ? 1 : 0);
    const fuelCost = 1 + (frost.branch === "CARE" ? 1 : 0);
    const waterCost = loopCount === 0 ? 2 : loopCount === 1 ? 1 : 0;
    const missing: string[] = [];
    if (run.resources.energy < energyCost) missing.push(`電量 ${energyCost}`);
    if (run.resources.fuel < fuelCost) missing.push(`燃料 ${fuelCost}`);
    if (run.resources.water < waterCost) missing.push(`水 ${waterCost}`);
    if (missing.length > 0) {
      return this.thermalResult(run, "insufficient", false, false, `資源不足：${missing.join("、")}。仍可繼續重排。`, settlementId);
    }

    const source = settlementId;
    this.applyResource(run, "energy", -energyCost, source);
    this.applyResource(run, "fuel", -fuelCost, source);
    if (berthCount === 0) {
      this.applyEnvironment(run, "temperature", -6, source);
      this.applySurvivor(run, "sleep", -10, source);
      this.applySurvivor(run, "health", -3, source);
    } else if (berthCount === 1) {
      this.applyEnvironment(run, "temperature", -3, source);
      this.applySurvivor(run, "sleep", -5, source);
    } else if (berthCount >= 3) {
      this.applyEnvironment(run, "temperature", 2, source);
      this.applySurvivor(run, "sleep", 4, source);
    }

    if (deicerCount === 0) {
      frost.pendingRouteFuelPenalty += 3;
      frost.frostRisk += 2;
    } else if (deicerCount === 1) {
      frost.pendingRouteFuelPenalty += 1;
      frost.frostRisk += 1;
    } else if (deicerCount >= 3) {
      frost.switchCleared = true;
      this.applyEnvironment(run, "noise", 4, source);
    }
    if (frost.branch === "CLEAR") this.applyEnvironment(run, "noise", 6, source);

    if (waterCost > 0) this.applyResource(run, "water", -waterCost, source);
    if (loopCount === 0 && frost.branch !== "SUSTAIN") {
      for (const plot of run.crops) plot.dryDays += 1;
    } else if (loopCount === 1 && frost.branch !== "SUSTAIN") {
      const plot = run.crops.find((candidate) => Boolean(candidate.cropId)) ?? run.crops[0];
      if (plot) plot.dryDays += 1;
    } else if (loopCount >= 3) {
      this.applyResource(run, "water", 1, source);
    }

    thermal.committedAllocation = { ...actual };
    thermal.committedDay = run.day;
    thermal.selectedTokenId = null;
    thermal.settlementIds.push(settlementId);
    if (this.endRunIfTerminal(run)) {
      return this.thermalResult(
        run,
        "accepted",
        true,
        true,
        "熱力配置已結算，但臥鋪失溫使守護協定終止。",
        settlementId,
      );
    }
    if (run.day === 7 && frost.finaleStage !== "resolved") {
      frost.finaleStage = "warm";
      run.phase = "travel";
      run.activeEventId = "EV063";
    }
    return this.thermalResult(
      run,
      "accepted",
      true,
      true,
      `熱力配置已結算：BERTH ${actual.BERTH}、DEICER ${actual.DEICER}、LOOP ${actual.LOOP}。`,
      settlementId,
    );
  }

  public interactThreat(run: RunState, command: ThreatInteractionCommand): ThreatInteractionResult;
  public interactThreat(
    run: RunState,
    verb: ThreatInteractionVerb,
    value: ThreatInteractionValue,
  ): ThreatInteractionResult;
  public interactThreat(
    run: RunState,
    commandOrVerb: ThreatInteractionCommand | ThreatInteractionVerb,
    value?: ThreatInteractionValue,
  ): ThreatInteractionResult {
    const rawCommand = value === undefined ? commandOrVerb : `${commandOrVerb}:${value}`;
    if (!THREAT_INTERACTION_COMMANDS.has(rawCommand as ThreatInteractionCommand)) {
      return this.rejectThreatInteraction(run, "invalid", "無法辨識這個威脅互動指令。");
    }

    const command = rawCommand as ThreatInteractionCommand;
    const contact = run.activeContact;
    const interaction = contact?.interaction ?? this.ensureThreatInteraction(run);
    if (run.phase !== "night" || !contact || contact.stage === "resolve" || contact.stage === "breach") {
      return this.rejectThreatInteraction(run, "invalid", "目前沒有可互動的夜間接觸。");
    }
    if (!interaction) {
      return this.rejectThreatInteraction(run, "unsupported", "這個接觸仍使用標準緊急反制。");
    }

    switch (interaction.kind) {
      case "T004":
        return this.interactT004(run, contact, interaction, command);
      case "T005":
        return this.interactT005(run, contact, interaction, command);
      case "T006":
        return this.interactT006(run, contact, interaction, command);
      case "T009":
        return this.interactT009(run, contact, interaction, command);
    }
  }

  public ensureThreatInteraction(run: RunState): ThreatInteractionState | undefined {
    const contact = run.activeContact;
    if (!contact || contact.interaction) return contact?.interaction;
    const interaction = this.createThreatInteraction(
      run,
      contact.definitionId,
      contact.wave ?? 1,
    );
    if (interaction) contact.interaction = interaction;
    return interaction;
  }

  public finishNight(run: RunState): void {
    const encounterMessage = run.lastMessage ?? "守夜結束。";
    const rationMessage = this.settleRation(run);
    const comfort = run.environment.temperature >= 16 && run.environment.temperature <= 24 ? BALANCE.sleepComfort : 0;
    const sleep = clamp(run.survivor.sleep - 8 * run.survivor.wakeups - Math.max(0, run.environment.noise - 20) + comfort - (100 - run.environment.hull) * 0.2);
    run.survivor.sleep = Math.round(sleep);
    this.applyResource(run, "data", 1, "aftermath.night-complete");
    run.activeContact = undefined;
    if (run.environment.hull <= 0 || run.survivor.health <= 0) {
      run.phase = "ending";
      run.ended = true;
      run.outcome = run.environment.hull <= 0 ? "hull-lost" : "survivor-lost";
      run.lastMessage = run.environment.hull <= 0 ? "車體失去密封，守護協定被迫終止。" : "A-07 生命徵象消失，守護協定被迫終止。";
    } else if (
      run.routeId === "R02"
      && run.day === 7
      && run.story.whiteFrost?.finaleStage === "blizzard"
    ) {
      run.story.whiteFrost.finaleStage = "clear";
      run.phase = "travel";
      run.activeEventId = "EV064";
      run.lastMessage = `${encounterMessage} ${rationMessage} 暴風雪已穿越；凍結轉轍等待 CLEAR。`;
    } else if (run.routeId === "R01" && run.day === 7 && run.story.finaleStage === "contact") {
      run.phase = "travel";
      run.activeEventId = "EV050";
      run.story.finaleStage = "contact";
      run.lastMessage = `${encounterMessage} ${rationMessage} 三波接觸結束，終點名冊等待查驗。`;
    } else {
      const dueStoryEvent = getDueStoryEvents(run.story, run.day, "aftermath")[0];
      if (dueStoryEvent) {
        run.story = consumeStoryEvent(run.story, dueStoryEvent.id);
        run.phase = "travel";
        run.activeEventId = dueStoryEvent.eventId;
        run.lastMessage = `${encounterMessage} ${rationMessage} 黎明紀錄等待確認。`;
      } else {
        run.phase = "aftermath";
        run.lastMessage = `${encounterMessage} ${rationMessage}`;
      }
    }
  }

  public continueAftermath(run: RunState): void {
    if (run.phase !== "aftermath" || run.ended) {
      run.lastMessage = "黎明結算已完成，不能重複推進日期。";
      return;
    }
    if (run.day >= run.maxDays) {
      if (run.routeId === "R02" && run.story.whiteFrost?.endingId) {
        run.phase = "ending";
        run.ended = true;
        run.outcome = "victory";
      } else if (run.routeId === "R01" && run.story.endingId) {
        run.phase = "ending";
        run.ended = true;
        run.outcome = "victory";
      } else {
        run.phase = "travel";
        if (run.routeId === "R02") {
          run.activeEventId = "EV063";
          if (run.story.whiteFrost) run.story.whiteFrost.finaleStage = "warm";
          run.lastMessage = "雪崩隧道終局尚未完成，必須先提交熱力配置。";
        } else {
          run.activeEventId = "EV050";
          run.story.finaleStage = "contact";
          run.lastMessage = "終點名冊尚未完成查驗，必須先做出終局決定。";
        }
      }
      return;
    }
    const cropReport = this.advanceCrops(run);
    run.day += 1;
    run.phase = "prep";
    run.actionPoints = run.survivor.sleep >= 75 ? 5 : run.survivor.sleep >= 45 ? 4 : 3;
    run.nightPowerDemand = 0;
    run.selectedRouteNodeId = undefined;
    run.survivor.wakeups = 0;
    run.activeEventId = undefined;
    run.lastMessage = `${cropReport} 第 ${run.day} 日整備開始。昨夜睡眠將影響今日行動。`;
    this.enterStoryPhase(run, "prep");
  }

  public buildModule(run: RunState, definitionId: string): boolean {
    if (run.phase !== "prep") {
      run.lastMessage = "只有整備階段能建造模組。";
      return false;
    }
    const definition = MODULES.find((candidate) => candidate.id === definitionId);
    if (!definition) return false;
    if (run.modules.some((module) => module.definitionId === definitionId)) {
      run.lastMessage = `${definition.name}已安裝，可在配電面板切換。`;
      return false;
    }
    if (run.actionPoints < 2) {
      run.lastMessage = "行動點不足；建造需要 2 AP。";
      return false;
    }
    if (run.resources.parts < definition.cost) {
      run.lastMessage = "零件不足，建造預覽已保留。";
      return false;
    }
    if (!this.applyResource(run, "parts", -definition.cost, `module.${definitionId}.build`)) {
      run.lastMessage = "零件不足，建造預覽已保留。";
      return false;
    }
    run.actionPoints -= 2;
    run.modules.push({ id: crypto.randomUUID(), definitionId, slotId: `${definition.slot}-${run.modules.length + 1}`, active: true, powered: true, durability: 100, mk: 1 });
    run.lastMessage = `${definition.name}已安裝；消耗 2 AP，今夜負載將增加。`;
    return true;
  }

  public toggleModule(run: RunState, definitionId: string): boolean {
    const instance = run.modules.find((module) => module.definitionId === definitionId);
    const definition = MODULES.find((module) => module.id === definitionId);
    if (!instance || !definition) {
      run.lastMessage = "該設備尚未安裝。";
      return false;
    }
    instance.active = !instance.active;
    instance.powered = instance.active;
    run.lastMessage = `${definition.name}已${instance.active ? "排入今夜配電" : "停用並釋放負載"}。`;
    return true;
  }

  public setRation(run: RunState, mode: RationMode): void {
    if (run.phase !== "prep") {
      run.lastMessage = "配餐必須在出發前完成。";
      return;
    }
    run.rationMode = mode;
    const labels: Record<RationMode, string> = { full: "安心餐", standard: "標準餐", strict: "節約餐" };
    run.lastMessage = `今夜配餐改為${labels[mode]}；效果會在黎明結算。`;
  }

  public plantCrop(run: RunState, plotId: CropPlotId, cropId: CropId): boolean {
    if (run.phase !== "prep") {
      run.lastMessage = "列車行進中無法播種。";
      return false;
    }
    const module = run.modules.find((instance) => instance.definitionId === "M003");
    const plot = run.crops.find((item) => item.id === plotId);
    const crop = CROPS.find((item) => item.id === cropId);
    if (!module?.active || !plot || !crop) {
      run.lastMessage = "垂直種植架未排入供電，無法播種。";
      return false;
    }
    if (plot.cropId) {
      run.lastMessage = "這個作物槽已有植物。";
      return false;
    }
    if (run.actionPoints < 1 || run.resources.water < 1) {
      run.lastMessage = run.actionPoints < 1 ? "播種需要 1 AP。" : "播種與首次灌溉需要 1 份水。";
      return false;
    }
    run.actionPoints -= 1;
    this.applyResource(run, "water", -1, `crop.${cropId}.plant`);
    plot.cropId = cropId;
    plot.stage = 1;
    plot.plantedDay = run.day;
    plot.wateredDay = run.day;
    plot.dryDays = 0;
    run.lastMessage = `${crop.name}已播入${plotId === "plot-a" ? "上層" : "下層"}槽；今夜供電後進入成長期。`;
    return true;
  }

  public waterCrops(run: RunState): boolean {
    const growing = run.crops.filter((plot) => plot.cropId && plot.stage < 3);
    if (run.phase !== "prep" || growing.length === 0) {
      run.lastMessage = growing.length === 0 ? "目前沒有需要灌溉的作物。" : "列車行進中無法灌溉。";
      return false;
    }
    if (growing.every((plot) => plot.wateredDay === run.day)) {
      run.lastMessage = "兩個作物槽今日水量充足。";
      return false;
    }
    if (!this.applyResource(run, "water", -1, "crop.rack.water")) {
      run.lastMessage = "飲水不足，水培循環無法啟動。";
      return false;
    }
    for (const plot of growing) plot.wateredDay = run.day;
    run.lastMessage = "水培架已灌溉；今晚需保持 3 電量供應才能生長。";
    return true;
  }

  public harvestCrop(run: RunState, plotId: CropPlotId): boolean {
    const plot = run.crops.find((item) => item.id === plotId);
    const crop = CROPS.find((item) => item.id === plot?.cropId);
    if (run.phase !== "prep" || !plot || !crop || plot.stage < 3) {
      run.lastMessage = "作物尚未成熟，不能收成。";
      return false;
    }
    if (run.actionPoints < 1 || run.resources.food >= BALANCE.max.food) {
      run.lastMessage = run.actionPoints < 1 ? "收成需要 1 AP。" : "食物儲存已滿。";
      return false;
    }
    run.actionPoints -= 1;
    const foodBefore = run.resources.food;
    this.applyResource(run, "food", crop.yield, `crop.${crop.id}.harvest`);
    const harvestedFood = run.resources.food - foodBefore;
    if (crop.id === "herb") this.applySurvivor(run, "stress", -4, "crop.herb.comfort");
    plot.cropId = undefined;
    plot.stage = 0;
    plot.plantedDay = undefined;
    plot.wateredDay = undefined;
    plot.dryDays = 0;
    run.lastMessage = `${crop.name}已收成：食物 +${harvestedFood}${crop.id === "herb" ? "、壓力 −4" : ""}。`;
    return true;
  }

  public collectWorkshopScrap(run: RunState): boolean {
    const flag = `workshop-scrap-${run.day}`;
    if (run.phase !== "prep" || run.flags.includes(flag) || run.actionPoints < 1) {
      run.lastMessage = run.flags.includes(flag) ? "今天的可用零件已整理完畢。" : "整理零件需要 1 AP。";
      return false;
    }
    run.actionPoints -= 1;
    this.applyResource(run, "parts", 1, "workshop.scrap");
    this.applyEnvironment(run, "noise", 4, "workshop.scrap");
    run.flags.push(flag);
    run.lastMessage = "工坊回收完成：零件 +1、噪音 +4。";
    return true;
  }

  public cookHotMeal(run: RunState): boolean {
    const flag = `hot-meal-${run.day}`;
    if (run.phase !== "prep" || run.flags.includes(flag) || run.actionPoints < 1) {
      run.lastMessage = run.flags.includes(flag) ? "今天已準備過熱食。" : "烹飪需要 1 AP。";
      return false;
    }
    if (run.resources.food < 1 || run.resources.water < 1 || run.resources.energy < 2) {
      run.lastMessage = "熱食需要食物 1、水 1、電量 2。";
      return false;
    }
    run.actionPoints -= 1;
    this.applyResource(run, "food", -1, "kitchen.hot-meal.food");
    this.applyResource(run, "water", -1, "kitchen.hot-meal.water");
    this.applyResource(run, "energy", -2, "kitchen.hot-meal.energy");
    this.applySurvivor(run, "stress", -8, "kitchen.hot-meal.stress");
    this.applySurvivor(run, "sleep", 10, "kitchen.hot-meal.sleep");
    run.flags.push(flag);
    run.lastMessage = "熱食完成：壓力 −8、睡眠 +10。";
    return true;
  }

  public comfortPassenger(run: RunState): boolean {
    if (run.phase !== "prep") {
      run.lastMessage = "守夜開始後無法執行安撫。";
      return false;
    }
    const flag = `comforted-${run.day}`;
    if (run.flags.includes(flag) || run.actionPoints < 1) {
      run.lastMessage = run.flags.includes(flag) ? "A-07 已經安定下來。" : "行動點不足。";
      return false;
    }
    run.actionPoints -= 1;
    this.applySurvivor(run, "stress", -8, "prep.comfort");
    this.applySurvivor(run, "trust", 2, "prep.comfort");
    run.flags.push(flag);
    run.lastMessage = "消耗 1 AP；A-07 壓力 −8、信任 +2。";
    return true;
  }

  public repairCarriage(run: RunState): boolean {
    if (run.phase !== "prep") {
      run.lastMessage = "列車行進中無法維修車體。";
      return false;
    }
    if (run.environment.hull >= 100) {
      run.lastMessage = "車體完整，無需維修。";
      return false;
    }
    if (run.actionPoints < 2 || run.resources.parts < 2) {
      run.lastMessage = run.actionPoints < 2 ? "維修需要 2 AP。" : "維修需要 2 個零件。";
      return false;
    }
    run.actionPoints -= 2;
    this.applyResource(run, "parts", -2, "prep.repair.parts");
    this.applyEnvironment(run, "hull", 14, "prep.repair.hull");
    run.lastMessage = "消耗 2 AP 與 2 零件；車體完整度 +14。";
    return true;
  }

  public unlockTech(run: RunState, techId: string): boolean {
    const node = TECH_NODES.find((candidate) => candidate.id === techId);
    if (!node || run.techOwned.includes(techId)) return false;
    if (!node.prerequisite.every((id) => run.techOwned.includes(id))) {
      run.lastMessage = "前置協定尚未解鎖。";
      return false;
    }
    if (!this.applyResource(run, "data", -node.cost, `tech.${techId}.unlock`)) {
      run.lastMessage = "協定資料不足。";
      return false;
    }
    run.techOwned.push(techId);
    run.lastMessage = `${node.name}已寫入下一局的科技快照。`;
    return true;
  }

  public getEvent(run: RunState) {
    return [...EVENTS, ...ALL_STORY_EVENTS].find((event) => event.id === run.activeEventId);
  }

  public getThreat(contact?: ThreatContact) {
    return THREATS.find((threat) => threat.id === contact?.definitionId);
  }

  private createNightContact(run: RunState, wave: number, totalWaves: number): ThreatContact {
    const frostT009 = run.routeId === "R02"
      && (
        (run.day === 7 && run.story.whiteFrost?.finaleStage === "blizzard")
        || (run.day === 4 && wave === totalWaves)
      );
    if (frostT009) {
      const threat = THREATS.find((candidate) => candidate.id === "T009")!;
      return {
        id: `contact-${run.day}-${wave}`,
        definitionId: threat.id,
        stage: "approach",
        secondsLeft: threat.warningSeconds,
        wave,
        totalWaves,
        interaction: this.createThreatInteraction(run, threat.id, wave),
      };
    }
    if (run.routeId === "R01" && run.day === 7 && wave === 3 && run.story.flags.day4Route) {
      const threatId = DAY4_BRANCH_DEFINITIONS[run.story.flags.day4Route].day7WaveThree.threatId;
      const threat = THREATS.find((candidate) => candidate.id === threatId) ?? THREATS[0]!;
      return {
        id: `contact-${run.day}-${wave}`,
        definitionId: threat.id,
        stage: "approach",
        secondsLeft: Math.max(7, threat.warningSeconds),
        wave,
        totalWaves,
        interaction: this.createThreatInteraction(run, threat.id, wave),
      };
    }
    const standardThreats = THREATS.filter((threat) =>
      run.routeId === "R02" ? threat.id === "T003" : threat.id === "T002" || threat.id === "T003",
    );
    const orderRng = createRng(run.seed, "threat-order");
    const offset = Math.floor(orderRng() * standardThreats.length);
    const threat = standardThreats[(offset + run.day + wave - 2) % standardThreats.length] ?? standardThreats[0]!;
    return {
      id: `contact-${run.day}-${wave}`,
      definitionId: threat.id,
      stage: "approach",
      secondsLeft: Math.max(7, threat.warningSeconds - Math.floor((run.day - 1) / 2)),
      wave,
      totalWaves,
    };
  }

  private createThreatInteraction(
    run: RunState,
    threatId: string,
    wave: number,
  ): ThreatInteractionState | undefined {
    const rng = createRng(run.seed, `threat-interaction:${run.day}:${wave}:${threatId}`);
    if (threatId === "T004") {
      const targetPlotId: CropPlotId = rng() < 0.5 ? "plot-a" : "plot-b";
      return {
        kind: "T004",
        targetPlotId,
        attempts: 0,
        targetRevealed: false,
      };
    }
    if (threatId === "T005") {
      const signals = T005_SIGNAL_CLUES.map((clue) => ({ ...clue }));
      const targetSignalId = signals[Math.floor(rng() * signals.length)]!.id;
      return {
        kind: "T005",
        signals,
        clues: signals.map((clue) => ({ ...clue })),
        targetSignalId,
        attempts: 0,
        wrongAttempts: 0,
        revealedClues: [],
        secondMissPenaltyApplied: false,
      };
    }
    if (threatId === "T006") {
      const cropPlots = run.crops.filter((plot) => Boolean(plot.cropId));
      if (cropPlots.length === 0) {
        return {
          kind: "T006",
          mode: "meter",
          traceTarget: "meter",
          attempts: 0,
        };
      }
      const targetPlotId = cropPlots[Math.floor(rng() * cropPlots.length)]!.id;
      return {
        kind: "T006",
        mode: "leaf",
        traceTarget: targetPlotId,
        targetPlotId,
        attempts: 0,
      };
    }
    if (threatId === "T009") {
      const rng = createRng(run.seed, `t009:${run.day}:${wave}`);
      const firstIndex = Math.floor(rng() * FROST_ZONES.length);
      let secondIndex = Math.floor(rng() * (FROST_ZONES.length - 1));
      if (secondIndex >= firstIndex) secondIndex += 1;
      const requiredZones: [FrostZone, FrostZone] = [
        FROST_ZONES[firstIndex] ?? "BERTH",
        FROST_ZONES[secondIndex] ?? "DEICER",
      ];
      const frost = run.story.whiteFrost;
      return {
        kind: "T009",
        requiredZones,
        inspectedZones: frost?.heatMapQuality === "full" ? [...requiredZones] : [],
        attempts: 0,
        firstMissRevealed: frost?.heatMapQuality === "full",
        freeMissUsed: false,
        manualFallbackAvailable: false,
      };
    }
    return undefined;
  }

  private interactT004(
    run: RunState,
    contact: ThreatContact,
    interaction: Extract<ThreatInteractionState, { kind: "T004" }>,
    command: ThreatInteractionCommand,
  ): ThreatInteractionResult {
    if (!command.startsWith("cutter:")) {
      return this.rejectThreatInteraction(run, "invalid", "霧噬藤只能用割具拖放到種植槽。");
    }
    const attemptedPlotId = command.slice("cutter:".length) as CropPlotId;
    interaction.attempts += 1;
    interaction.lastAttemptPlotId = attemptedPlotId;
    if (attemptedPlotId !== interaction.targetPlotId) {
      interaction.targetRevealed = true;
      const targetLabel = interaction.targetPlotId === "plot-a" ? "上層 plot-a" : "下層 plot-b";
      return this.rejectThreatInteraction(
        run,
        "incorrect",
        `割具落在錯誤槽位；藤蔓根節仍亮在${targetLabel}，可沿發光路徑重試。`,
        true,
      );
    }
    return this.resolveThreatInteraction(
      run,
      contact,
      command,
      "割具切斷正確槽位的藤蔓根節，霧噬藤已解除。",
    );
  }

  private interactT005(
    run: RunState,
    contact: ThreatContact,
    interaction: Extract<ThreatInteractionState, { kind: "T005" }>,
    command: ThreatInteractionCommand,
  ): ThreatInteractionResult {
    if (!command.startsWith("signal:")) {
      return this.rejectThreatInteraction(run, "invalid", "回聲乘客需要選擇一個可見訊號。");
    }
    const attemptedSignalId = command.slice("signal:".length);
    if (!interaction.clues.some((clue) => clue.id === attemptedSignalId)) {
      return this.rejectThreatInteraction(run, "invalid", "選到不存在的訊號。");
    }

    interaction.attempts += 1;
    interaction.lastAttemptSignalId = attemptedSignalId as typeof interaction.targetSignalId;
    if (attemptedSignalId === interaction.targetSignalId) {
      return this.resolveThreatInteraction(
        run,
        contact,
        command,
        "色、形與節拍完全吻合，回聲乘客已離開車窗。",
      );
    }

    interaction.wrongAttempts += 1;
    interaction.revealedClues = ["color", "shape", "rhythm"];
    const targetClue = interaction.clues.find((clue) => clue.id === interaction.targetSignalId)!;
    if (interaction.wrongAttempts === 1) {
      return this.rejectThreatInteraction(
        run,
        "incorrect",
        `第一次比對錯誤，不扣健康。目標線索已揭示：${targetClue.color}、${targetClue.shape}、${targetClue.rhythm}。`,
        true,
      );
    }

    let healthDelta = 0;
    if (!interaction.secondMissPenaltyApplied) {
      const healthBefore = run.survivor.health;
      this.applySurvivor(run, "health", -2, "threat.T005.second-miss");
      healthDelta = run.survivor.health - healthBefore;
      interaction.secondMissPenaltyApplied = true;
    }
    const result = this.rejectThreatInteraction(
      run,
      "incorrect",
      `第二次比對仍錯誤，健康 ${healthDelta}；目標仍是 ${targetClue.color}、${targetClue.shape}、${targetClue.rhythm}。`,
      true,
    );
    return { ...result, healthDelta };
  }

  private interactT006(
    run: RunState,
    contact: ThreatContact,
    interaction: Extract<ThreatInteractionState, { kind: "T006" }>,
    command: ThreatInteractionCommand,
  ): ThreatInteractionResult {
    if (command !== "trace:leaves" && command !== "trace:meter") {
      return this.rejectThreatInteraction(run, "invalid", "靜默群只能依葉片或電表判位。");
    }
    interaction.attempts += 1;
    interaction.lastAttempt = command === "trace:leaves" ? "leaves" : "meter";
    const correct = interaction.mode === "leaf"
      ? command === "trace:leaves"
      : command === "trace:meter";
    if (!correct) {
      const cue = interaction.mode === "leaf"
        ? `葉片震動集中在 ${interaction.traceTarget}，不是電表。`
        : "目前沒有作物；35% 強度的電表抖動仍是可完成線索。";
      return this.rejectThreatInteraction(run, "incorrect", `判位錯誤，靜默群未散。${cue}`, true);
    }
    const result = interaction.mode === "leaf"
      ? `已依 ${interaction.traceTarget} 的葉片震動確認方位，靜默群退開。`
      : "無作物備援成立；已依電表抖動確認方位，靜默群退開。";
    return this.resolveThreatInteraction(run, contact, command, result);
  }

  private interactT009(
    run: RunState,
    contact: ThreatContact,
    interaction: Extract<ThreatInteractionState, { kind: "T009" }>,
    command: ThreatInteractionCommand,
  ): ThreatInteractionResult {
    if (command.startsWith("frost:inspect:")) {
      const zone = command.slice("frost:inspect:".length) as FrostZone;
      if (!FROST_ZONES.includes(zone)) {
        return this.rejectThreatInteraction(run, "invalid", "選到不存在的霜區。");
      }
      if (!interaction.inspectedZones.includes(zone)) interaction.inspectedZones.push(zone);
      const severity = interaction.requiredZones.includes(zone) ? 2 : 0;
      const message = `${zone} 檢查完成；霜蝕嚴重度 ${severity}。重新配置後再確認。`;
      run.lastMessage = message;
      return { status: "accepted", accepted: true, resolved: false, healthDelta: 0, message };
    }
    if (command === "frost:manual-scrape") {
      if (!interaction.manualFallbackAvailable) {
        return this.rejectThreatInteraction(run, "invalid", "先檢查並嘗試一次熱力配置，才會啟用 MANUAL_SCRAPE。");
      }
      const hullCost = run.story.whiteFrost?.manualScrapeHullCost ?? 6;
      this.applyEnvironment(run, "hull", -hullCost, "threat.T009.manual-scrape");
      this.applySurvivor(run, "stress", 6, "threat.T009.manual-scrape");
      interaction.resolvedBy = "manual-scrape";
      return this.resolveThreatInteraction(
        run,
        contact,
        command,
        `手動刮冰解除暴風雪鎖定；車體 −${hullCost}、壓力 +6。`,
      );
    }
    if (command !== "frost:confirm") {
      return this.rejectThreatInteraction(run, "invalid", "暴風雪只能檢查霜區、確認熱力配置或手動刮冰。");
    }
    if (interaction.inspectedZones.length === 0) {
      return this.rejectThreatInteraction(run, "invalid", "至少先檢查一個霜區，再確認熱力配置。");
    }
    const frost = run.story.whiteFrost;
    if (!frost || !thermalRoutingIsValid(frost.thermal)) {
      interaction.manualFallbackAvailable = true;
      return this.rejectThreatInteraction(run, "invalid", "六枚熱能單元資料無效；可使用 MANUAL_SCRAPE。");
    }
    interaction.attempts += 1;
    const allocation = getThermalAllocation(frost.thermal.tokens);
    const correct = interaction.requiredZones.every(
      (zone) => interaction.inspectedZones.includes(zone) && allocation[zone] >= 2,
    );
    if (correct) {
      interaction.resolvedBy = "thermal";
      return this.resolveThreatInteraction(
        run,
        contact,
        command,
        `熱力配置成立：${interaction.requiredZones.join("＋")} 各至少兩枚，暴風雪已解除。`,
      );
    }
    interaction.manualFallbackAvailable = true;
    if (!interaction.freeMissUsed) {
      interaction.freeMissUsed = true;
      interaction.firstMissRevealed = true;
      return this.rejectThreatInteraction(
        run,
        "incorrect",
        `第一次錯配不扣資源或健康；必要霜區為 ${interaction.requiredZones[0]}◆2、${interaction.requiredZones[1]}◆2。`,
        true,
      );
    }
    this.applyEnvironment(run, "temperature", -2, "threat.T009.repeated-miss");
    this.applySurvivor(run, "stress", 2, "threat.T009.repeated-miss");
    return this.rejectThreatInteraction(
      run,
      "incorrect",
      `熱力仍未覆蓋必要霜區；溫度 −2、壓力 +2。需要 ${interaction.requiredZones.join("＋")} 各兩枚。`,
      true,
    );
  }

  private resolveThreatInteraction(
    run: RunState,
    contact: ThreatContact,
    resolvedBy: ThreatInteractionCommand,
    message: string,
  ): ThreatInteractionResult {
    contact.stage = "resolve";
    contact.resolvedBy = resolvedBy;
    this.advanceNightContactOrFinish(run, message);
    return {
      status: "resolved",
      accepted: true,
      resolved: true,
      healthDelta: 0,
      message: run.lastMessage ?? message,
    };
  }

  private rejectThreatInteraction(
    run: RunState,
    status: "incorrect" | "invalid" | "unsupported",
    message: string,
    accepted = false,
  ): ThreatInteractionResult {
    run.lastMessage = message;
    return {
      status,
      accepted,
      resolved: false,
      healthDelta: 0,
      message,
    };
  }

  private applyStandardBreachDamage(
    run: RunState,
    threat: { id: string; name: string; damage: number },
  ): boolean {
    const incomingDamage = threat.damage + (run.day - 1) * 2;
    const cropBuffer = run.day === 7
      ? Math.min(run.story.finaleHealthBuffer, Math.max(0, incomingDamage - 2))
      : 0;
    if (cropBuffer > 0) run.story.finaleHealthBuffer -= cropBuffer;
    this.applyEnvironment(run, "hull", -(incomingDamage - cropBuffer), `threat.${threat.id}.breach`);
    this.applySurvivor(run, "stress", 12, `threat.${threat.id}.breach`);
    this.applySurvivor(run, "sleep", -18, `threat.${threat.id}.breach`);
    run.lastMessage = `${threat.name}造成破口。損害已隔離，但乘客被驚醒。`;
    return this.endRunIfTerminal(run);
  }

  private advanceNightContactOrFinish(run: RunState, result: string): boolean {
    const contact = run.activeContact;
    const wave = contact?.wave ?? 1;
    const totalWaves = contact?.totalWaves ?? 1;
    if (this.endRunIfTerminal(run)) return true;
    if (
      run.routeId === "R02"
      && run.day === 7
      && contact?.definitionId === "T009"
      && run.story.whiteFrost?.finaleStage === "blizzard"
    ) {
      run.activeContact = undefined;
      run.phase = "travel";
      run.activeEventId = "EV064";
      run.story.whiteFrost.finaleStage = "clear";
      run.lastMessage = `${result} 暴風雪階段完成，現在必須清出轉轍。`;
      return true;
    }
    if (run.routeId === "R01" && run.day === 7) {
      run.story.completedContactWaves = Math.max(run.story.completedContactWaves, wave);
    }
    if (run.environment.hull > 0 && run.survivor.health > 0 && wave < totalWaves) {
      const nextWave = wave + 1;
      run.activeContact = this.createNightContact(run, nextWave, totalWaves);
      run.lastMessage = `${result} 下一次接觸逼近：${nextWave}/${totalWaves}。`;
      return true;
    }
    run.lastMessage = `${result} 今夜 ${totalWaves} 次接觸已結束。`;
    this.finishNight(run);
    return true;
  }

  private thermalResult(
    run: RunState,
    status: ThermalCommandResult["status"],
    accepted: boolean,
    settled: boolean,
    message: string,
    settlementId?: string,
  ): ThermalCommandResult {
    run.lastMessage = message;
    return { status, accepted, settled, message, ...(settlementId ? { settlementId } : {}) };
  }

  private applyWhiteFrostConsequence(run: RunState, consequence: WhiteFrostConsequence): void {
    let frost = run.story.whiteFrost;
    if (!frost) return;
    const set = consequence.set;
    if (set && Object.prototype.hasOwnProperty.call(set, "branch")) {
      if (set.branch) {
        frost = applyFrostBranch(frost, set.branch);
        run.story.whiteFrost = frost;
      }
      else frost.branch = null;
    }
    if (set) {
      const { branch: _branch, ...remaining } = set;
      Object.assign(frost, remaining);
    }
    if (consequence.moveToken) {
      const token = frost.thermal.tokens.find((candidate) => candidate.id === consequence.moveToken?.tokenId);
      if (token && token.zone !== consequence.moveToken.zone) {
        token.zone = consequence.moveToken.zone;
        frost.thermal.revision += 1;
        frost.thermal.selectedTokenId = null;
      }
    }
    if (typeof consequence.coldDebtDelta === "number") {
      frost.coldDebt = Math.max(0, frost.coldDebt + consequence.coldDebtDelta);
    }
    if (typeof consequence.jointTrustRequirementDelta === "number") {
      frost.jointTrustRequirement = Math.max(0, frost.jointTrustRequirement + consequence.jointTrustRequirementDelta);
    }
    if (typeof consequence.warmRequirementDiscountDelta === "number") {
      frost.warmRequirementDiscount = Math.max(0, frost.warmRequirementDiscount + consequence.warmRequirementDiscountDelta);
    }
    if (consequence.settleColdDebt && !frost.delayedConsequenceSettled) {
      const offset = consequence.settleColdDebt === "offset-two" ? 2 : 0;
      const settledPoints = Math.min(3, Math.max(0, frost.coldDebt - offset));
      if (frost.switchMethod === "ram") {
        this.applyEnvironment(run, "hull", -2, "story.R02.ram-crack");
      }
      if (settledPoints > 0) {
        this.applyEnvironment(run, "temperature", -settledPoints, "story.R02.cold-debt");
        this.applySurvivor(run, "health", -settledPoints, "story.R02.cold-debt");
      }
      frost.coldDebt = 0;
      frost.delayedConsequenceSettled = true;
    }
  }

  private recordBranchEvidence(run: RunState): void {
    switch (run.story.flags.day4Route) {
      case "GO":
        run.story.flags.isolationTraceCount = Math.min(2, run.story.flags.isolationTraceCount + 1);
        break;
      case "DETOUR":
        run.story.flags.routeSampleCount = Math.min(2, run.story.flags.routeSampleCount + 1);
        break;
      case "STOP":
        run.story.flags.manifestCrossChecks = Math.min(2, run.story.flags.manifestCrossChecks + 1);
        break;
      default:
        return;
    }
    run.story = refreshTrueRouteData(run.story);
  }

  private advanceCrops(run: RunState): string {
    const hydroponics = run.modules.find((instance) => instance.definitionId === "M003");
    const growing = run.crops.filter((plot) => plot.cropId && plot.stage < 3);
    if (growing.length === 0) return "水培槽目前空置。";
    let advanced = 0;
    let withered = 0;
    for (const plot of growing) {
      if (hydroponics?.active && hydroponics.powered && plot.wateredDay === run.day) {
        plot.stage = Math.min(3, plot.stage + 1) as 0 | 1 | 2 | 3;
        plot.dryDays = 0;
        advanced += 1;
      } else {
        plot.dryDays += 1;
        if (plot.dryDays >= 2) {
          plot.cropId = undefined;
          plot.stage = 0;
          plot.plantedDay = undefined;
          plot.wateredDay = undefined;
          plot.dryDays = 0;
          withered += 1;
        }
      }
    }
    if (withered > 0) return `${withered} 個作物槽因連續缺水或斷電枯萎。`;
    if (advanced > 0) return `${advanced} 個作物槽完成一夜生長。`;
    return "作物因缺水或種植架斷電而停止生長。";
  }

  private settleNightPower(run: RunState): string {
    const efficiencyDiscount = run.techOwned.includes("E1") ? 1 : 0;
    const ordered = run.modules
      .map((instance) => ({ instance, definition: MODULES.find((module) => module.id === instance.definitionId) }))
      .filter((item) => item.definition)
      .sort((left, right) => (right.definition?.priority ?? 0) - (left.definition?.priority ?? 0));
    let spent = 0;
    const offline: string[] = [];
    for (const { instance, definition } of ordered) {
      if (!definition || !instance.active) {
        instance.powered = false;
        continue;
      }
      const cost = Math.max(0, definition.activeCost - efficiencyDiscount);
      if (spent + cost <= run.resources.energy) {
        instance.powered = true;
        spent += cost;
      } else {
        instance.powered = false;
        offline.push(definition.name);
      }
    }
    if (spent > 0) this.applyResource(run, "energy", -spent, "night.power-grid");
    run.nightPowerDemand = spent;
    const heaterOnline = run.modules.some((instance) => instance.definitionId === "M002" && instance.active && instance.powered);
    this.applyEnvironment(run, "temperature", heaterOnline ? 1 : -3, "night.heating");
    return offline.length ? `今夜耗電 ${spent} E；斷載：${offline.join("、")}。` : `今夜耗電 ${spent} E；所有排程設備供電正常。`;
  }

  private settleRation(run: RunState): string {
    const plans: Record<RationMode, { food: number; water: number; sleep: number; stress: number; trust: number; label: string }> = {
      full: { food: 2, water: 2, sleep: 8, stress: -4, trust: 3, label: "安心餐" },
      standard: { food: 1, water: 1, sleep: 0, stress: 0, trust: 0, label: "標準餐" },
      strict: { food: 0, water: 1, sleep: -5, stress: 4, trust: -2, label: "節約餐" },
    };
    const plan = plans[run.rationMode];
    const shortage = run.resources.food < plan.food || run.resources.water < plan.water;
    const foodSpent = Math.min(run.resources.food, plan.food);
    const waterSpent = Math.min(run.resources.water, plan.water);
    if (foodSpent) this.applyResource(run, "food", -foodSpent, "aftermath.meal");
    if (waterSpent) this.applyResource(run, "water", -waterSpent, "aftermath.water");
    if (shortage) {
      this.applySurvivor(run, "health", -6, "aftermath.shortage");
      this.applySurvivor(run, "stress", 8, "aftermath.shortage");
      this.applySurvivor(run, "sleep", -10, "aftermath.shortage");
      return "配餐不足：健康 −6、壓力 +8。";
    }
    if (plan.sleep) this.applySurvivor(run, "sleep", plan.sleep, `aftermath.ration.${run.rationMode}`);
    if (plan.stress) this.applySurvivor(run, "stress", plan.stress, `aftermath.ration.${run.rationMode}`);
    if (plan.trust) this.applySurvivor(run, "trust", plan.trust, `aftermath.ration.${run.rationMode}`);
    return `${plan.label}已執行。`;
  }
}
