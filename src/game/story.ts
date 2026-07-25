import type {
  A07ConsentEvaluation,
  CargoConversion,
  Day4Route,
  EndingEvaluation,
  EndingId,
  FinalDecision,
  RunState,
  ScheduledStoryEvent,
  StoryDuePhase,
  StoryFlags,
  StoryState,
} from "./types";

const STORY_PHASE_ORDER: Record<StoryDuePhase, number> = {
  dawn: 0,
  prep: 1,
  route: 2,
  travel: 3,
  aftermath: 4,
};

export function createDefaultStoryState(): StoryState {
  return {
    version: 1,
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
  };
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
