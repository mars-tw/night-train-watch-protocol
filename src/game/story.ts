import type {
  A07ConsentEvaluation,
  CargoConversion,
  Day4Route,
  EndingEvaluation,
  EndingId,
  FinalDecision,
  FrostBranch,
  FrostEndingEvaluation,
  FrostFinalDecision,
  FrostZone,
  HeatTokenState,
  RunState,
  ScheduledStoryEvent,
  StoryRouteId,
  StoryDuePhase,
  StoryFlags,
  StoryState,
  ThermalRoutingState,
  WhiteFrostState,
} from "./types";

const STORY_PHASE_ORDER: Record<StoryDuePhase, number> = {
  dawn: 0,
  prep: 1,
  route: 2,
  travel: 3,
  aftermath: 4,
};

const FROST_ZONES: readonly FrostZone[] = ["BERTH", "DEICER", "LOOP"];

export function createDefaultThermalRoutingState(): ThermalRoutingState {
  return {
    tokens: [
      { id: "H1", zone: "BERTH" },
      { id: "H2", zone: "BERTH" },
      { id: "H3", zone: "DEICER" },
      { id: "H4", zone: "DEICER" },
      { id: "H5", zone: "LOOP" },
      { id: "H6", zone: "LOOP" },
    ],
    selectedTokenId: null,
    committedAllocation: { BERTH: 2, DEICER: 2, LOOP: 2 },
    committedDay: null,
    settlementIds: [],
    revision: 0,
  };
}

export function createDefaultWhiteFrostState(): WhiteFrostState {
  return {
    version: 1,
    branch: null,
    finaleStage: "inactive",
    consent: "unknown",
    heatMapQuality: "partial",
    switchCleared: false,
    switchMethod: null,
    heaterPatched: false,
    coauthorEvidence: false,
    branchOperationComplete: false,
    delayedConsequenceSettled: false,
    finalDecision: null,
    endingId: null,
    endingReasons: [],
    rewardSettled: false,
    thermal: createDefaultThermalRoutingState(),
    coldDebt: 0,
    pendingRouteFuelPenalty: 0,
    frostRisk: 0,
    manualScrapeHullCost: 6,
    jointTrustRequirement: 55,
    warmRequirementDiscount: 0,
    recordCalibrated: false,
  };
}

export function createDefaultStoryState(routeId: StoryRouteId = "R01"): StoryState {
  return {
    version: 2,
    flags: {
      signalSampleQuality: "none",
      extraBunk: false,
      duplicateCoordinate: false,
      day4Route: null,
      rosterGap: false,
      rosterMatch: "unchecked",
      a07IdentityKnown: false,
      clause7Read: false,
      authorKnown: false,
      trueRouteData: false,
      routeSampleCount: 0,
      manifestCrossChecks: 0,
      isolationTraceCount: 0,
      hailed: false,
      quarantinePrepared: false,
      overrideUsed: false,
      controlReturned: false,
      toldTruth: false,
      decoderInstalled: false,
      decoderCalibrated: false,
      a07MovedObject: false,
      badgePocketed: false,
      overrideTechUnlocked: false,
      identityMismatchVerified: false,
    },
    cargoConversion: "none",
    finaleStage: "inactive",
    completedContactWaves: 0,
    finaleHealthBuffer: 0,
    finalDecision: null,
    queue: [],
    seenEventIds: [],
    endingId: null,
    endingReasons: [],
    dawnLogIds: [],
    whiteFrost: routeId === "R02" ? createDefaultWhiteFrostState() : null,
  };
}

export function getThermalAllocation(tokens: readonly HeatTokenState[]): Record<FrostZone, number> {
  const allocation: Record<FrostZone, number> = { BERTH: 0, DEICER: 0, LOOP: 0 };
  for (const token of tokens) {
    if (FROST_ZONES.includes(token.zone)) allocation[token.zone] += 1;
  }
  return allocation;
}

export function thermalRoutingIsValid(thermal: ThermalRoutingState): boolean {
  const expectedIds = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
  const actualIds = thermal.tokens.map((token) => token.id);
  return (
    thermal.tokens.length === 6
    && new Set(actualIds).size === 6
    && actualIds.every((id) => expectedIds.has(id))
    && thermal.tokens.every((token) => FROST_ZONES.includes(token.zone))
    && Object.values(getThermalAllocation(thermal.tokens)).reduce((total, count) => total + count, 0) === 6
  );
}

export function effectiveFrostAllocation(whiteFrost: WhiteFrostState): Record<FrostZone, number> {
  const allocation = getThermalAllocation(whiteFrost.thermal.tokens);
  if (whiteFrost.branch === "CARE") allocation.BERTH += 1;
  if (whiteFrost.branch === "CLEAR") allocation.DEICER += 1;
  if (whiteFrost.branch === "SUSTAIN") allocation.LOOP += 1;
  return allocation;
}

export function frostWarmRequirement(whiteFrost: WhiteFrostState): number {
  const base = whiteFrost.branch === "CLEAR" ? 3 : whiteFrost.branch === "CARE" ? 1 : 2;
  return Math.max(1, base - whiteFrost.warmRequirementDiscount);
}

export function frostClearRequirement(whiteFrost: WhiteFrostState): number {
  if (whiteFrost.branch === "CARE") return 3;
  if (whiteFrost.branch === "CLEAR") return 1;
  return 2;
}

export function applyFrostBranch(whiteFrost: WhiteFrostState, branch: FrostBranch): WhiteFrostState {
  return {
    ...whiteFrost,
    branch,
    branchOperationComplete: false,
  };
}

export function tokensForCommittedAllocation(
  allocation: Record<FrostZone, number>,
): HeatTokenState[] {
  const tokenIds: HeatTokenState["id"][] = ["H1", "H2", "H3", "H4", "H5", "H6"];
  const zones = FROST_ZONES.flatMap((zone) =>
    Array.from({ length: Math.max(0, Math.floor(allocation[zone] ?? 0)) }, () => zone),
  ).slice(0, 6);
  while (zones.length < 6) zones.push("LOOP");
  return tokenIds.map((id, index) => ({ id, zone: zones[index] ?? "LOOP" }));
}

const FROST_ENDING_REASONS: Record<FrostFinalDecision, FrostEndingEvaluation> = {
  joint: {
    endingId: "frost-shared-arrival",
    reasons: ["A-07 與守護 AI 共同配置熱流並署名通過雪崩隧道。"],
  },
  shield: {
    endingId: "frost-guarded-arrival",
    reasons: ["列車封艙保護 A-07，帶著仍待協商的控制權抵達。"],
  },
  "a07-plan": {
    endingId: "frost-chosen-detour",
    reasons: ["列車依 A-07 參與設計的撤回方案轉入避難岔線。"],
  },
  "emergency-stop": {
    endingId: "frost-emergency-shelter",
    reasons: ["列車停入維修洞保住乘客，白霜線在未完成中暫時安定。"],
  },
};

export function evaluateFrostEnding(
  state: Pick<RunState, "story">,
  finalDecision: FrostFinalDecision,
): FrostEndingEvaluation {
  const whiteFrost = state.story.whiteFrost;
  if (whiteFrost?.endingId) {
    return {
      endingId: whiteFrost.endingId,
      reasons: whiteFrost.endingReasons.length > 0
        ? [...whiteFrost.endingReasons]
        : [...FROST_ENDING_REASONS[finalDecision].reasons],
    };
  }
  const result = FROST_ENDING_REASONS[finalDecision];
  return { endingId: result.endingId, reasons: [...result.reasons] };
}

function compareScheduledStoryEvents(left: ScheduledStoryEvent, right: ScheduledStoryEvent): number {
  return (
    left.dueDay - right.dueDay ||
    STORY_PHASE_ORDER[left.duePhase] - STORY_PHASE_ORDER[right.duePhase] ||
    left.id.localeCompare(right.id)
  );
}

export function sortScheduledStoryEvents(events: readonly ScheduledStoryEvent[]): ScheduledStoryEvent[] {
  return events.map((event) => ({ ...event })).sort(compareScheduledStoryEvents);
}

function scheduledEventsMatch(left: ScheduledStoryEvent, right: ScheduledStoryEvent): boolean {
  return (
    left.id === right.id &&
    left.eventId === right.eventId &&
    left.dueDay === right.dueDay &&
    left.duePhase === right.duePhase &&
    left.sourceEventId === right.sourceEventId &&
    left.sourceChoiceId === right.sourceChoiceId
  );
}

export function queueStoryEvent(story: StoryState, event: ScheduledStoryEvent): StoryState {
  const existing = story.queue.find((candidate) => candidate.id === event.id);
  if (existing) {
    if (!scheduledEventsMatch(existing, event)) {
      throw new Error(`Scheduled story event "${event.id}" has conflicting data.`);
    }
    return story;
  }

  return {
    ...story,
    queue: sortScheduledStoryEvents([...story.queue, event]),
  };
}

export function getDueStoryEvents(
  story: StoryState,
  day: number,
  phase: StoryDuePhase,
): ScheduledStoryEvent[] {
  const currentPhaseOrder = STORY_PHASE_ORDER[phase];
  return sortScheduledStoryEvents(
    story.queue.filter(
      (event) =>
        event.dueDay < day ||
        (event.dueDay === day && STORY_PHASE_ORDER[event.duePhase] <= currentPhaseOrder),
    ),
  );
}

export function consumeStoryEvent(story: StoryState, scheduledEventId: string): StoryState {
  const consumed = story.queue.find((event) => event.id === scheduledEventId);
  if (!consumed) return story;

  return {
    ...story,
    queue: story.queue.filter((event) => event.id !== scheduledEventId),
    seenEventIds: story.seenEventIds.includes(consumed.eventId)
      ? [...story.seenEventIds]
      : [...story.seenEventIds, consumed.eventId],
  };
}

export function evaluateA07Consent(
  state: Pick<RunState, "survivor" | "story" | "techOwned">,
): A07ConsentEvaluation {
  if (state.survivor.trust >= 60) {
    return {
      status: "granted",
      consents: true,
      evidenceRequired: false,
      canOverride: false,
      reason: "A-07 信任足夠，直接同意終局操作。",
    };
  }

  if (state.survivor.trust >= 40 && state.story.flags.authorKnown) {
    return {
      status: "granted-with-evidence",
      consents: true,
      evidenceRequired: true,
      canOverride: false,
      reason: "A-07 要求出示作者證據後同意終局操作。",
    };
  }

  return {
    status: "refused",
    consents: false,
    evidenceRequired: false,
    canOverride: state.techOwned.includes("I2"),
    reason: state.techOwned.includes("I2")
      ? "A-07 拒絕；玩家可使用 I2 覆寫權杖。"
      : "A-07 拒絕，且尚未取得 I2 覆寫權杖。",
  };
}

export function cargoConversionForDay4Route(route: Day4Route | null): CargoConversion {
  switch (route) {
    case "GO":
      return "isolation-bay";
    case "DETOUR":
      return "battery-array";
    case "STOP":
      return "sample-lab";
    default:
      return "none";
  }
}

export function hasEarnedTrueRouteData(flags: StoryFlags): boolean {
  switch (flags.day4Route) {
    case "GO":
      return flags.isolationTraceCount >= 2;
    case "DETOUR":
      return flags.routeSampleCount >= 2;
    case "STOP":
      return flags.manifestCrossChecks >= 2;
    default:
      return false;
  }
}

export function applyDay4Route(story: StoryState, route: Day4Route): StoryState {
  const flags = { ...story.flags, day4Route: route };
  flags.trueRouteData = hasEarnedTrueRouteData(flags);
  return {
    ...story,
    flags,
    cargoConversion: cargoConversionForDay4Route(route),
  };
}

export function refreshTrueRouteData(story: StoryState): StoryState {
  return {
    ...story,
    flags: {
      ...story.flags,
      trueRouteData: hasEarnedTrueRouteData(story.flags),
    },
  };
}

const ENDING_REASON: Record<EndingId, string> = {
  "protocol-terminated": "protocol-terminated：已讀第七條、使用覆寫，且信任過低或選擇終止。",
  quarantine: "quarantine：已完成封鎖準備、三波接觸，且感染與信任落在隔離區間。",
  reroute: "reroute：分支具改道資格、持有真實路線資料，且感染未失控。",
  arrival: "arrival：真實路線已驗證，A-07 信任及感染狀態符合開門條件。",
  "arrival-unverified": "arrival-unverified：未滿足其他正式結局條件。",
};

export function evaluateEnding(state: RunState, finalDecision: FinalDecision): EndingEvaluation {
  if (state.story.endingId) {
    return {
      endingId: state.story.endingId,
      reasons:
        state.story.endingReasons.length > 0
          ? [...state.story.endingReasons]
          : [ENDING_REASON[state.story.endingId]],
    };
  }

  const { flags, completedContactWaves } = state.story;
  const { trust, infection } = state.survivor;
  const matches: EndingId[] = [];

  if (flags.clause7Read && flags.overrideUsed && (trust <= 29 || finalDecision === "terminate")) {
    matches.push("protocol-terminated");
  }
  if (
    flags.quarantinePrepared &&
    infection >= 40 &&
    completedContactWaves >= 3 &&
    trust >= 30 &&
    trust <= 59 &&
    finalDecision === "seal"
  ) {
    matches.push("quarantine");
  }
  if (
    (flags.day4Route === "DETOUR" || flags.day4Route === "STOP") &&
    flags.trueRouteData &&
    infection <= 50 &&
    finalDecision === "reroute"
  ) {
    matches.push("reroute");
  }
  if (
    flags.trueRouteData &&
    trust >= 60 &&
    infection <= 30 &&
    finalDecision === "open" &&
    (!flags.overrideUsed || flags.controlReturned)
  ) {
    matches.push("arrival");
  }

  const endingId = matches[0] ?? "arrival-unverified";
  return {
    endingId,
    reasons: matches.length > 0 ? matches.map((matched) => ENDING_REASON[matched]) : [ENDING_REASON[endingId]],
  };
}
