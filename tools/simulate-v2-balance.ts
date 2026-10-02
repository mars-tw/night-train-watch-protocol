import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  CROPS,
  THREATS,
  type StoryContentChoice,
} from "../src/game/content";
import { createRun } from "../src/game/model";
import { RunService, counterReadiness } from "../src/game/services";
import {
  availableExpeditions,
  availableRelationships,
} from "../src/game/voyage/engine";
import type {
  EventChoice,
  GreenCycleZone,
  ResourceState,
  RunState,
  StoryRouteId,
} from "../src/game/types";

type StrategyId = "safe" | "production" | "exploration";
type SimulationOutcome = "victory" | "hull-lost" | "survivor-lost" | "stuck";

interface NumericSummary {
  min: number;
  p25: number;
  median: number;
  mean: number;
  p75: number;
  max: number;
}

interface DaySnapshot {
  day: number;
  resources: ResourceState;
  sleep: number;
  health: number;
  stress: number;
  infection: number;
  hull: number;
  noise: number;
  phase: string;
}

interface TradeoffEntry {
  kind:
    | "route"
    | "story-choice"
    | "crop-plant"
    | "crop-harvest"
    | "refill"
    | "expedition"
    | "facility"
    | "tech"
    | "repair"
    | "counter"
    | "fallback";
  value: string;
  day: number;
}

interface SimulationResult {
  seed: string;
  routeId: StoryRouteId;
  strategy: StrategyId;
  outcome: SimulationOutcome;
  day: number;
  phase: string;
  endingId: string | null;
  stuckReason?: string;
  lastMessage?: string;
  steps: number;
  snapshots: DaySnapshot[];
  tradeoffs: TradeoffEntry[];
}

interface StrategyDefinition {
  id: StrategyId;
  description: string;
  cropId: "lettuce" | "tomato" | "herb";
  plotCount: 1 | 2;
  preferredModule: "M008" | "M009" | "M004";
  preferredFacility: readonly [string, string];
}

const STRATEGIES: readonly StrategyDefinition[] = [
  {
    id: "safe",
    description:
      "保留生命維持備援、採一夜萵苣與低燃料路段；只在資源足夠時照護與建造。",
    cropId: "lettuce",
    plotCount: 1,
    preferredModule: "M008",
    preferredFacility: ["bedside-bay", "warmth"],
  },
  {
    id: "production",
    description:
      "投資工作台、雙槽番茄與補給支線；接受停車噪音以換取零件和水。",
    cropId: "tomato",
    plotCount: 2,
    preferredModule: "M009",
    preferredFacility: ["greenhouse-loop", "closed"],
  },
  {
    id: "exploration",
    description:
      "投資感測、使用早期遮蔽舊線並執行合法停站深潛；承擔固定 seed 風險。",
    cropId: "herb",
    plotCount: 1,
    preferredModule: "M004",
    preferredFacility: ["window-frame", "visible"],
  },
] as const;

const ROUTES: readonly StoryRouteId[] = ["R01", "R02", "R03"];
const RESOURCE_KEYS = [
  "energy",
  "fuel",
  "food",
  "water",
  "parts",
  "medicine",
  "data",
] as const satisfies readonly (keyof ResourceState)[];

const EXPLICIT_CHOICES: Partial<
  Record<string, Partial<Record<StrategyId, readonly string[]>>>
> = {
  EV044: {
    safe: ["GO"],
    production: ["DETOUR"],
    exploration: ["STOP"],
  },
  EV051: {
    safe: ["open"],
    production: ["open"],
    exploration: ["open"],
  },
  EV052: {
    safe: ["truth"],
    production: ["truth"],
    exploration: ["truth"],
  },
  EV057: {
    safe: ["CARE"],
    production: ["SUSTAIN"],
    exploration: ["CLEAR"],
  },
  EV064: {
    safe: ["manual", "deice", "ram"],
    production: ["deice", "manual", "ram"],
    exploration: ["deice", "manual", "ram"],
  },
  EV065: {
    safe: ["emergency-stop", "shield", "joint", "a07-plan"],
    production: ["shield", "emergency-stop", "joint", "a07-plan"],
    exploration: ["joint", "a07-plan", "emergency-stop", "shield"],
  },
  EV072: {
    safe: ["FILTER"],
    production: ["CULTIVATE"],
    exploration: ["PURGE"],
  },
  EV078: {
    safe: ["quarantine"],
    production: ["seedbank", "quarantine"],
    exploration: ["symbiosis", "quarantine"],
  },
};

function cloneResources(resources: ResourceState): ResourceState {
  return { ...resources };
}

function snapshot(run: RunState): DaySnapshot {
  return {
    day: run.day,
    resources: cloneResources(run.resources),
    sleep: run.survivor.sleep,
    health: run.survivor.health,
    stress: run.survivor.stress,
    infection: run.survivor.infection,
    hull: run.environment.hull,
    noise: run.environment.noise,
    phase: run.phase,
  };
}

function endingId(run: RunState): string | null {
  if (run.routeId === "R02") return run.story.whiteFrost?.endingId ?? null;
  if (run.routeId === "R03") return run.story.greenTide?.endingId ?? null;
  return run.story.endingId;
}

function stateSignature(run: RunState): string {
  return JSON.stringify({
    day: run.day,
    phase: run.phase,
    event: run.activeEventId,
    contact: run.activeContact
      ? {
          id: run.activeContact.id,
          stage: run.activeContact.stage,
          seconds: run.activeContact.secondsLeft,
          interaction: run.activeContact.interaction,
        }
      : null,
    ap: run.actionPoints,
    resources: run.resources,
    survivor: run.survivor,
    environment: run.environment,
    ending: endingId(run),
    ended: run.ended,
    expedition: run.voyage?.activeExpedition,
    thermalDay: run.story.whiteFrost?.thermal.committedDay,
    cycleDay: run.story.greenTide?.cycle.committedDay,
  });
}

function choiceScore(choice: EventChoice, strategy: StrategyId): number {
  const authored = choice as StoryContentChoice;
  const riskScore = { low: 5, medium: 2, high: -2, irreversible: -1 }[
    authored.risk ?? "medium"
  ];
  const resourceWeights: Record<keyof ResourceState, number> =
    strategy === "production"
      ? { energy: 1, fuel: 1, food: 4, water: 4, parts: 5, medicine: 2, data: 1 }
      : strategy === "exploration"
        ? { energy: 1, fuel: 1, food: 2, water: 2, parts: 3, medicine: 2, data: 6 }
        : { energy: 3, fuel: 4, food: 3, water: 3, parts: 2, medicine: 4, data: 1 };
  let score = riskScore;
  for (const key of RESOURCE_KEYS) {
    const delta = choice.deltas[key] ?? 0;
    score += delta >= 0
      ? delta * resourceWeights[key]
      : delta * resourceWeights[key] * (strategy === "safe" ? 2 : 1);
  }
  const survivor = choice.survivor ?? {};
  score += (survivor.health ?? 0) * 5;
  score -= (survivor.stress ?? 0) * 2;
  score -= (survivor.infection ?? 0) * 5;
  score += (survivor.sleep ?? 0) * 2;
  score += (survivor.trust ?? 0);
  score += (choice.environment?.hull ?? 0) * 5;
  score -= Math.max(0, choice.environment?.noise ?? 0);
  const tags = authored.tags?.join(" ") ?? "";
  if (strategy === "exploration" && /情報|資料|證據|掃描|查驗/.test(tags)) score += 8;
  if (strategy === "production" && /農業|水|食物|零件|維修|循環/.test(tags)) score += 8;
  if (strategy === "safe" && /照護|保暖|信任|安全|隔離/.test(tags)) score += 8;
  return score;
}

function orderedChoices(
  run: RunState,
  eventId: string,
  choices: readonly EventChoice[],
  strategy: StrategyId,
): EventChoice[] {
  const special = [...(EXPLICIT_CHOICES[eventId]?.[strategy] ?? [])];
  if (eventId === "EV063") {
    const committed = run.story.whiteFrost?.thermal.committedDay === 7;
    special.unshift(committed ? "warm" : "thermal-board");
    special.push("emergency-warm");
  }
  const rank = new Map(special.map((id, index) => [id, index]));
  return [...choices].sort((left, right) => {
    const leftRank = rank.get(left.id);
    const rightRank = rank.get(right.id);
    if (leftRank !== undefined || rightRank !== undefined)
      return (leftRank ?? 10_000) - (rightRank ?? 10_000);
    return choiceScore(right, strategy) - choiceScore(left, strategy);
  });
}

function resolveActiveEvent(
  run: RunState,
  service: RunService,
  strategy: StrategyId,
  tradeoffs: TradeoffEntry[],
): { ok: boolean; reason?: string } {
  const event = service.getEvent(run);
  if (!event || !run.activeEventId)
    return { ok: false, reason: `missing-event:${run.activeEventId ?? "none"}` };
  const eventId = run.activeEventId;
  const rejectionMessages: string[] = [];
  for (const choice of orderedChoices(run, eventId, event.choices, strategy)) {
    if (service.resolveEvent(run, choice)) {
      tradeoffs.push({ kind: "story-choice", value: `${eventId}:${choice.id}`, day: run.day });
      return { ok: true };
    }
    rejectionMessages.push(`${choice.id}=${run.lastMessage ?? "rejected"}`);
  }
  return {
    ok: false,
    reason: `event-no-legal-choice:${eventId}:${rejectionMessages.join("|")}`,
  };
}

function chooseRouteForStrategy(
  run: RunState,
  service: RunService,
  strategy: StrategyId,
  tradeoffs: TradeoffEntry[],
): { ok: boolean; reason?: string } {
  const preferred =
    strategy === "safe"
      ? ["RN01", "RN02", "RN03"]
      : strategy === "production"
        ? ["RN02", "RN01", "RN03"]
        : run.day <= 3
          ? ["RN03", "RN01", "RN02"]
          : ["RN01", "RN02", "RN03"];
  for (const nodeId of preferred) {
    const before = run.selectedRouteNodeId;
    service.chooseRoute(run, nodeId);
    if (run.activeEventId && run.phase === "route") return { ok: true };
    if (run.selectedRouteNodeId !== before && run.selectedRouteNodeId === nodeId) {
      tradeoffs.push({ kind: "route", value: nodeId, day: run.day });
      return { ok: true };
    }
  }
  if (service.emergencyRoute(run)) {
    tradeoffs.push({ kind: "fallback", value: "emergency-route", day: run.day });
    return { ok: true };
  }
  return { ok: false, reason: `route-deadlock:${run.lastMessage ?? "unknown"}` };
}

function runRelationshipChoices(run: RunState, service: RunService): void {
  for (const relationship of availableRelationships(run)) {
    const choice = relationship.choices.find((candidate) => candidate.available);
    if (choice) service.chooseRelationship(run, relationship.missionId, choice.id);
  }
}

function runExploration(
  run: RunState,
  service: RunService,
  strategy: StrategyId,
  tradeoffs: TradeoffEntry[],
): void {
  if (strategy !== "exploration" || run.actionPoints < 1) return;
  const site = availableExpeditions(run).find((candidate) => candidate.available);
  if (!site || !service.startExpedition(run, site.id)) return;
  if (!service.chooseExpeditionStep(run, "survey")) return;
  if (!service.chooseExpeditionStep(run, "proper-tool"))
    service.chooseExpeditionStep(run, "improvise");
  if (run.voyage?.activeExpedition?.nodeIndex === 2)
    service.chooseExpeditionStep(run, "deep-dive");
  const record = run.voyage?.expeditions.at(-1);
  if (record)
    tradeoffs.push({
      kind: "expedition",
      value: `${record.siteId}:${record.result}`,
      day: run.day,
    });
}

function runRefills(
  run: RunState,
  service: RunService,
  tradeoffs: TradeoffEntry[],
): void {
  const attempts: Array<[boolean, string]> = [
    [run.resources.energy <= 14 && run.resources.parts >= 2, "refill-battery"],
    [run.resources.water <= 2 && run.resources.energy >= 3, "refill-water"],
    [run.resources.food <= 1 && run.resources.water >= 1, "refill-rations"],
  ];
  for (const [needed, actionId] of attempts) {
    if (!needed || run.actionPoints < 1) continue;
    if (service.refillSupplies(run, actionId))
      tradeoffs.push({ kind: "refill", value: actionId, day: run.day });
  }
}

function runCropPlan(
  run: RunState,
  service: RunService,
  strategy: StrategyDefinition,
  tradeoffs: TradeoffEntry[],
): void {
  for (const plot of run.crops) {
    if (plot.cropId && plot.stage >= 3 && run.actionPoints >= 1) {
      const cropId = plot.cropId;
      if (service.harvestCrop(run, plot.id))
        tradeoffs.push({ kind: "crop-harvest", value: cropId, day: run.day });
    }
  }
  const growing = run.crops.filter((plot) => plot.cropId && plot.stage < 3);
  if (growing.some((plot) => plot.wateredDay !== run.day)) service.waterCrops(run);
  const targetPlots = run.crops.slice(0, strategy.plotCount);
  for (const plot of targetPlots) {
    if (plot.cropId || run.actionPoints < 1 || run.resources.water < 1) continue;
    if (service.plantCrop(run, plot.id, strategy.cropId))
      tradeoffs.push({ kind: "crop-plant", value: strategy.cropId, day: run.day });
  }
}

function runPrepPlan(
  run: RunState,
  service: RunService,
  strategy: StrategyDefinition,
  plannedDays: Set<number>,
  tradeoffs: TradeoffEntry[],
): void {
  if (plannedDays.has(run.day)) return;
  plannedDays.add(run.day);
  service.setRation(
    run,
    strategy.id === "production" && run.resources.food >= 4 && run.resources.water >= 4
      ? "full"
      : run.resources.water >= 1
        ? "standard"
        : "strict",
  );
  if (
    run.day === 1 &&
    !run.modules.some((module) => module.definitionId === strategy.preferredModule)
  ) {
    service.buildModule(run, strategy.preferredModule);
  }
  if (
    strategy.id !== "exploration" &&
    !run.techOwned.includes("D1") &&
    run.resources.data >= 1
  ) {
    if (service.unlockTech(run, "D1"))
      tradeoffs.push({ kind: "tech", value: "D1", day: run.day });
  } else if (
    strategy.id === "exploration" &&
    !run.techOwned.includes("I1") &&
    run.resources.data >= 1
  ) {
    if (service.unlockTech(run, "I1"))
      tradeoffs.push({ kind: "tech", value: "I1", day: run.day });
  }
  const workbench = run.modules.find(
    (module) => module.definitionId === "M009" && module.active,
  );
  if (workbench && !workbench.powered) {
    service.toggleModule(run, "M009");
    service.toggleModule(run, "M009");
  }
  if (
    run.environment.hull < 100 &&
    run.actionPoints >= 2 &&
    run.resources.parts >= 2
  ) {
    const beforeHull = run.environment.hull;
    if (service.repairCarriage(run))
      tradeoffs.push({
        kind: "repair",
        value: `${run.techOwned.includes("D1") ? "D1" : "base"}${run.modules.some((module) => module.definitionId === "M009" && module.active && module.powered) ? "+M009" : ""}:+${run.environment.hull - beforeHull}`,
        day: run.day,
      });
  }
  runCropPlan(run, service, strategy, tradeoffs);
  if (strategy.id === "safe" && run.actionPoints >= 1)
    service.comfortPassenger(run);
  const [facilityId, branchId] = strategy.preferredFacility;
  if (!run.voyage?.facilities[facilityId] && run.actionPoints >= 2) {
    if (service.upgradeFacility(run, facilityId, branchId))
      tradeoffs.push({ kind: "facility", value: `${facilityId}:${branchId}`, day: run.day });
  }
  runRelationshipChoices(run, service);
  runRefills(run, service, tradeoffs);
  runExploration(run, service, strategy.id, tradeoffs);
}

function settleThermalBoard(run: RunState, service: RunService): boolean {
  if (
    run.routeId !== "R02" ||
    run.day !== 7 ||
    run.story.whiteFrost?.finaleStage !== "warm" ||
    run.story.whiteFrost.thermal.committedDay === 7
  ) return false;
  const allocation = [
    ["H1", "BERTH"],
    ["H2", "BERTH"],
    ["H3", "DEICER"],
    ["H4", "DEICER"],
    ["H5", "LOOP"],
    ["H6", "LOOP"],
  ] as const;
  for (const [tokenId, zone] of allocation) {
    const token = run.story.whiteFrost.thermal.tokens.find(
      (candidate) => candidate.id === tokenId,
    );
    if (token?.zone !== zone)
      service.applyThermalCommand(run, `thermal:move:${tokenId}:${zone}`);
  }
  return service.applyThermalCommand(run, "thermal:commit").settled;
}

function solveGreenCycleThreat(
  run: RunState,
  service: RunService,
  tradeoffs: TradeoffEntry[],
): boolean {
  const interaction = run.activeContact?.interaction;
  const green = run.story.greenTide;
  if (interaction?.kind !== "T013" || !green) return false;
  for (const sampleId of interaction.contaminatedSampleIds)
    service.interactThreat(run, `cycle:inspect:${sampleId}`);
  let cleanIndex = 0;
  for (const sample of green.cycle.samples) {
    const zone: GreenCycleZone =
      sample.quality === "tainted"
        ? "FILTER"
        : cleanIndex++ === 0
          ? "GROW_A"
          : "GROW_B";
    service.interactThreat(run, `cycle:move:${sample.id}:${zone}`);
  }
  if (service.interactThreat(run, "cycle:commit").resolved) return true;
  for (const sample of green.cycle.samples)
    service.interactThreat(run, `cycle:move:${sample.id}:DRAIN`);
  if (service.interactThreat(run, "cycle:commit").resolved) {
    tradeoffs.push({ kind: "fallback", value: "cycle:all-drain", day: run.day });
    return true;
  }
  if (service.interactThreat(run, "cycle:manual-drain").resolved) {
    tradeoffs.push({ kind: "fallback", value: "cycle:manual-drain", day: run.day });
    return true;
  }
  return false;
}

function solveContact(
  run: RunState,
  service: RunService,
  strategy: StrategyId,
  tradeoffs: TradeoffEntry[],
): { ok: boolean; reason?: string } {
  const contact = run.activeContact;
  if (!contact) return { ok: false, reason: "night-without-contact" };
  const interaction = contact.interaction ?? service.ensureThreatInteraction(run);
  if (interaction?.kind === "T004")
    return service.interactThreat(run, `cutter:${interaction.targetPlotId}`).resolved
      ? { ok: true }
      : { ok: false, reason: "T004-cutter-rejected" };
  if (interaction?.kind === "T005")
    return service.interactThreat(run, `signal:${interaction.targetSignalId}`).resolved
      ? { ok: true }
      : { ok: false, reason: "T005-signal-rejected" };
  if (interaction?.kind === "T006") {
    const command = interaction.mode === "leaf" ? "trace:leaves" : "trace:meter";
    return service.interactThreat(run, command).resolved
      ? { ok: true }
      : { ok: false, reason: "T006-trace-rejected" };
  }
  if (interaction?.kind === "T008") {
    service.interactThreat(run, `lurker:inspect:${interaction.targetZone}`);
    return service.interactThreat(run, `lurker:mark:${interaction.targetZone}`).resolved
      ? { ok: true }
      : { ok: false, reason: "T008-mark-rejected" };
  }
  if (interaction?.kind === "T009") {
    for (const zone of interaction.requiredZones)
      service.interactThreat(run, `frost:inspect:${zone}`);
    if (service.interactThreat(run, "frost:confirm").resolved) return { ok: true };
    const fallback = service.interactThreat(run, "frost:manual-scrape");
    if (fallback.resolved) {
      tradeoffs.push({ kind: "fallback", value: "frost:manual-scrape", day: run.day });
      return { ok: true };
    }
    return { ok: false, reason: `T009-no-solution:${run.lastMessage ?? "unknown"}` };
  }
  if (interaction?.kind === "T013")
    return solveGreenCycleThreat(run, service, tradeoffs)
      ? { ok: true }
      : { ok: false, reason: `T013-no-solution:${run.lastMessage ?? "unknown"}` };

  const threat = THREATS.find((candidate) => candidate.id === contact.definitionId);
  const remainingRouteFuel = Math.max(0, 7 - run.day) * 4;
  const t003Order =
    strategy === "safe"
      ? ["roof-release", "emergency-boost"]
      : strategy === "production"
        ? run.resources.fuel - 4 >= remainingRouteFuel && run.resources.parts <= 4
          ? ["emergency-boost", "roof-release"]
          : ["roof-release", "emergency-boost"]
        : run.resources.parts >= 2 || run.resources.fuel <= remainingRouteFuel + 4
          ? ["roof-release", "emergency-boost"]
          : ["emergency-boost", "roof-release"];
  const preferred =
    threat?.id === "T002"
      ? ["close-shutter", "shock-window"]
      : threat?.id === "T003"
        ? t003Order
        : [...(threat?.counterIds ?? [])];
  for (const counterId of preferred) {
    if (!counterReadiness(run, counterId).available) continue;
    const beforeId = run.activeContact?.id;
    if (service.counterThreat(run, counterId) && run.activeContact?.id !== beforeId) {
      tradeoffs.push({ kind: "counter", value: counterId, day: run.day });
      return { ok: true };
    }
    if (!run.activeContact || run.activeContact.id !== beforeId) return { ok: true };
  }
  if (service.counterThreat(run, "brace-impact")) {
    tradeoffs.push({ kind: "fallback", value: "brace-impact", day: run.day });
    return { ok: true };
  }
  return { ok: false, reason: `counter-deadlock:${contact.definitionId}:${run.lastMessage ?? "unknown"}` };
}

function simulate(seed: string, routeId: StoryRouteId, strategy: StrategyDefinition): SimulationResult {
  const run = createRun(seed, routeId);
  const service = new RunService();
  const plannedDays = new Set<number>();
  const snapshots: DaySnapshot[] = [];
  const capturedDays = new Set<number>();
  const tradeoffs: TradeoffEntry[] = [];
  let stuckReason: string | undefined;
  let steps = 0;

  if (routeId !== "R01") service.enterStoryPhase(run, "prep");

  while (!run.ended && steps < 700) {
    steps += 1;
    const before = stateSignature(run);

    if (run.activeEventId) {
      const resolved = resolveActiveEvent(run, service, strategy.id, tradeoffs);
      if (!resolved.ok) stuckReason = resolved.reason;
    } else if (settleThermalBoard(run, service)) {
      tradeoffs.push({ kind: "story-choice", value: "thermal:commit", day: run.day });
    } else if (run.phase === "prep") {
      const openedPrep = routeId !== "R01" && service.enterStoryPhase(run, "prep");
      if (!openedPrep) {
        runPrepPlan(run, service, strategy, plannedDays, tradeoffs);
        const route = chooseRouteForStrategy(run, service, strategy.id, tradeoffs);
        if (!route.ok) stuckReason = route.reason;
      }
    } else if (run.phase === "route") {
      const route = chooseRouteForStrategy(run, service, strategy.id, tradeoffs);
      if (!route.ok) stuckReason = route.reason;
    } else if (run.phase === "night") {
      const solved = solveContact(run, service, strategy.id, tradeoffs);
      if (!solved.ok) stuckReason = solved.reason;
    } else if (run.phase === "aftermath") {
      if (!capturedDays.has(run.day)) {
        snapshots.push(snapshot(run));
        capturedDays.add(run.day);
      }
      service.continueAftermath(run);
    } else if (run.phase === "travel") {
      stuckReason = `travel-without-event:${run.lastMessage ?? "unknown"}`;
    } else {
      stuckReason = `unsupported-phase:${run.phase}`;
    }

    if (stuckReason) break;
    if (!run.ended && stateSignature(run) === before) {
      stuckReason = `no-progress:${run.phase}:${run.activeEventId ?? run.activeContact?.definitionId ?? "none"}`;
      break;
    }
  }

  if (!capturedDays.has(run.day)) snapshots.push(snapshot(run));
  if (!run.ended && !stuckReason)
    stuckReason = `step-limit:${run.phase}:${run.activeEventId ?? run.activeContact?.definitionId ?? "none"}`;
  const outcome: SimulationOutcome = run.ended
    ? run.outcome === "active"
      ? "stuck"
      : run.outcome
    : "stuck";
  return {
    seed,
    routeId,
    strategy: strategy.id,
    outcome,
    day: run.day,
    phase: run.phase,
    endingId: endingId(run),
    stuckReason,
    lastMessage: run.lastMessage,
    steps,
    snapshots,
    tradeoffs,
  };
}

function quantile(sorted: readonly number[], position: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight;
}

function summarize(values: readonly number[]): NumericSummary {
  const sorted = [...values].sort((left, right) => left - right);
  const mean = sorted.length
    ? sorted.reduce((total, value) => total + value, 0) / sorted.length
    : 0;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    min: round(sorted[0] ?? 0),
    p25: round(quantile(sorted, 0.25)),
    median: round(quantile(sorted, 0.5)),
    mean: round(mean),
    p75: round(quantile(sorted, 0.75)),
    max: round(sorted.at(-1) ?? 0),
  };
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => right[1] - left[1]),
  );
}

function aggregateGroup(results: readonly SimulationResult[]) {
  const perDay: Record<string, Record<string, NumericSummary>> = {};
  for (let day = 1; day <= 7; day += 1) {
    const snapshots = results
      .map((result) => result.snapshots.find((candidate) => candidate.day === day))
      .filter((candidate): candidate is DaySnapshot => candidate !== undefined);
    if (snapshots.length === 0) continue;
    perDay[String(day)] = {
      energy: summarize(snapshots.map((value) => value.resources.energy)),
      fuel: summarize(snapshots.map((value) => value.resources.fuel)),
      food: summarize(snapshots.map((value) => value.resources.food)),
      water: summarize(snapshots.map((value) => value.resources.water)),
      parts: summarize(snapshots.map((value) => value.resources.parts)),
      medicine: summarize(snapshots.map((value) => value.resources.medicine)),
      data: summarize(snapshots.map((value) => value.resources.data)),
      sleep: summarize(snapshots.map((value) => value.sleep)),
      health: summarize(snapshots.map((value) => value.health)),
      stress: summarize(snapshots.map((value) => value.stress)),
      infection: summarize(snapshots.map((value) => value.infection)),
      hull: summarize(snapshots.map((value) => value.hull)),
      noise: summarize(snapshots.map((value) => value.noise)),
    };
  }
  return {
    runs: results.length,
    outcomes: countBy(results.map((result) => result.outcome)),
    victoryRate: Math.round(
      (10000 * results.filter((result) => result.outcome === "victory").length) /
        Math.max(1, results.length),
    ) / 100,
    endingIds: countBy(results.map((result) => result.endingId ?? "none")),
    reachedDay: countBy(results.map((result) => String(result.day))),
    perDay,
    tradeoffs: countBy(
      results.flatMap((result) =>
        result.tradeoffs.map((tradeoff) => `${tradeoff.kind}:${tradeoff.value}`),
      ),
    ),
  };
}

function buildReport(results: readonly SimulationResult[], seeds: readonly string[], smoke: boolean) {
  const groups: Record<string, ReturnType<typeof aggregateGroup>> = {};
  for (const routeId of ROUTES) {
    for (const strategy of STRATEGIES) {
      const selected = results.filter(
        (result) => result.routeId === routeId && result.strategy === strategy.id,
      );
      groups[`${routeId}/${strategy.id}`] = aggregateGroup(selected);
    }
  }
  const stuck = results
    .filter((result) => result.outcome === "stuck")
    .map((result) => ({
      seed: result.seed,
      routeId: result.routeId,
      strategy: result.strategy,
      day: result.day,
      phase: result.phase,
      reason: result.stuckReason,
      lastMessage: result.lastMessage,
    }));
  const cropReadiness = CROPS.map((crop) => {
    const harvests = results.flatMap((result) =>
      result.tradeoffs.filter(
        (entry) => entry.kind === "crop-harvest" && entry.value === crop.id,
      ),
    );
    return {
      cropId: crop.id,
      configuredPoweredNights: crop.days,
      configuredFoodYield: crop.yield,
      foodPerAp: Math.round((crop.yield / 2) * 100) / 100,
      foodPerWater: Math.round((crop.yield / crop.days) * 100) / 100,
      slotNights: crop.days,
      additionalEffect: crop.id === "herb" ? "harvest stress -4" : "none",
      observedHarvests: harvests.length,
      observedHarvestDay: summarize(harvests.map((entry) => entry.day)),
    };
  });
  const repairObservations = results.flatMap((result) =>
    result.tradeoffs
      .filter((entry) => entry.kind === "repair")
      .map((entry) => entry.value),
  );
  const r01EvidenceStuck = stuck.filter(
    (entry) => entry.routeId === "R01" && entry.reason?.includes("EV048"),
  ).length;
  const r02HullLosses = results.filter(
    (result) => result.routeId === "R02" && result.outcome === "hull-lost",
  ).length;
  const r03Victories = results.filter(
    (result) => result.routeId === "R03" && result.outcome === "victory",
  ).length;
  const representativeRuns = Object.fromEntries(
    ROUTES.flatMap((routeId) =>
      STRATEGIES.map((strategy) => {
        const selected = results.find(
          (result) =>
            result.routeId === routeId && result.strategy === strategy.id,
        );
        return [`${routeId}/${strategy.id}`, selected ?? null] as const;
      }),
    ),
  );
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: smoke ? "smoke" : "full",
    methodology: {
      runs: results.length,
      fixedSeeds: seeds,
      routes: ROUTES,
      strategies: STRATEGIES.map(({ id, description }) => ({ id, description })),
      authority:
        "每局只以 createRun 正常起點與 public RunService 操作推進；沒有直接改資源、AP、phase、劇情 checkpoint 或終局 fixture。",
      puzzlePolicy:
        "反制只讀取 RunService 已建立的可見 interaction 線索，並用公開指令提交正確操作；資源不足才使用既有 fallback。",
      interpretation:
        "企劃中的成本與產量是待測示意值；本報告數據是目前 runtime 實際規則與此三種固定策略的結果，不代表玩家最佳解或承諾勝率。",
    },
    totals: {
      outcomes: countBy(results.map((result) => result.outcome)),
      victoryRate: Math.round(
        (10000 * results.filter((result) => result.outcome === "victory").length) /
          Math.max(1, results.length),
      ) / 100,
      stuck: stuck.length,
    },
    notableFindings: [
      `Forced main 停滯共 ${stuck.length} 局；其中 R01 Day 6 EV048 缺證據停滯 ${r01EvidenceStuck} 局。`,
      `R02 有 ${r02HullLosses}/${results.filter((result) => result.routeId === "R02").length} 局車體失守；策略會先用 counterReadiness 判斷 roof-release／emergency-boost，再於兩者都不可用時承傷。`,
      `R03 有 ${r03Victories}/${results.filter((result) => result.routeId === "R03").length} 局完成；污染循環在 FILTER 缺電時可用全排放或手動排放繼續。`,
      "作物參數實差：萵苣 1 夜／2 食、番茄 3 夜／4 食、香草 2 夜／1 食並減壓；報告另列每 AP、水與持槽效率及實際收成日。",
      "D1 的 runtime 實差為窗側傷害 -3、維修 +4；與 M009 同時生效時完整維修由 14 提升為 21。",
    ],
    readinessAudit: {
      crops: {
        interpretation:
          "播种与收成各花 1 AP；每个实际供电成长夜花 1 水。下列效率来自当前 CROPS 参数，并同时列出本批公开服务操作实际收成日。",
        entries: cropReadiness,
      },
      D1: {
        authoredText: "強化窗框：窗戶耐久與修理效率提高。",
        runtimeRule: "窗側傷害 -3；repairCarriage 基礎 14 之外再 +4。M009 同時供電時再 +3。",
        observedRepairDeltas: countBy(repairObservations),
        interpretation:
          "observedRepairDeltas 只統計自然資源與 AP 足夠時經 public repairCarriage 成功的實際 hull 差值。",
      },
    },
    groups,
    stuckReproductions: stuck,
    runIndex: results.map((result) => ({
      seed: result.seed,
      routeId: result.routeId,
      strategy: result.strategy,
      outcome: result.outcome,
      day: result.day,
      phase: result.phase,
      endingId: result.endingId,
      stuckReason: result.stuckReason,
    })),
    representativeRuns,
  };
}

function reportMarkdown(report: ReturnType<typeof buildReport>): string {
  const lines = [
    "# Reboot v2 balance simulation",
    "",
    `- 模式：${report.mode}`,
    `- 實際模擬：${report.methodology.runs} 局`,
    `- 勝率：${report.totals.victoryRate}%`,
    `- 停滯：${report.totals.stuck} 局`,
    "",
    "這是固定策略對目前 runtime 的量測，不把企劃示意值、測試 fixture 或補資源當作自然七夜證據。",
    "",
    "## 主要發現",
    "",
    ...report.notableFindings.map((finding) => `- ${finding}`),
    "",
    "## 分組結果",
    "",
    "| 路線／策略 | 勝率 | 勝利 | 車體失守 | 乘客失守 | 停滯 |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const [key, group] of Object.entries(report.groups)) {
    lines.push(
      `| ${key} | ${group.victoryRate}% | ${group.outcomes.victory ?? 0} | ${group.outcomes["hull-lost"] ?? 0} | ${group.outcomes["survivor-lost"] ?? 0} | ${group.outcomes.stuck ?? 0} |`,
    );
  }
  lines.push("", "完整每日分布、典型取捨與重現 seed 見 `balance-report.json`。", "");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const smoke = process.argv.includes("--smoke");
  const write = !process.argv.includes("--no-write");
  const verbose = process.argv.includes("--verbose");
  const seedCount = smoke ? 3 : 30;
  const seeds = Array.from(
    { length: seedCount },
    (_, index) => `v2-balance-${String(index).padStart(2, "0")}`,
  );
  const results: SimulationResult[] = [];
  for (const seed of seeds) {
    for (const routeId of ROUTES) {
      for (const strategy of STRATEGIES)
        results.push(simulate(`${seed}:${routeId}:${strategy.id}`, routeId, strategy));
    }
  }
  const report = buildReport(results, seeds, smoke);
  if (write) {
    const jsonPath = resolve(
      process.cwd(),
      smoke
        ? "docs/evidence/v2/balance-smoke.json"
        : "docs/evidence/v2/balance-report.json",
    );
    await mkdir(dirname(jsonPath), { recursive: true });
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (!smoke) {
      const markdownPath = resolve(process.cwd(), "docs/evidence/v2/balance-report.md");
      await writeFile(markdownPath, reportMarkdown(report), "utf8");
    }
  }
  const groupSummary = Object.fromEntries(
    Object.entries(report.groups).map(([key, group]) => [
      key,
      { victoryRate: group.victoryRate, outcomes: group.outcomes },
    ]),
  );
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        runs: report.methodology.runs,
        totals: report.totals,
        groups: groupSummary,
        stuck: report.stuckReproductions,
        ...(verbose
          ? {
              unsuccessfulRuns: results.filter(
                (result) => result.outcome !== "victory",
              ),
            }
          : {}),
      },
      null,
      2,
    ),
  );
}

await main();
