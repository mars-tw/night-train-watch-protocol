import { describe, expect, it } from "vitest";
import { createRun } from "../src/game/model";
import {
  applyDay4Route,
  cargoConversionForDay4Route,
  consumeStoryEvent,
  createDefaultStoryState,
  evaluateA07Consent,
  evaluateEnding,
  getDueStoryEvents,
  hasEarnedTrueRouteData,
  queueStoryEvent,
  refreshTrueRouteData,
  sortScheduledStoryEvents,
} from "../src/game/story";
import type { ScheduledStoryEvent, StoryDuePhase } from "../src/game/types";

function scheduledEvent(
  id: string,
  dueDay: number,
  duePhase: StoryDuePhase,
  eventId = `EV-${id}`,
): ScheduledStoryEvent {
  return {
    id,
    eventId,
    dueDay,
    duePhase,
    sourceEventId: "EV-source",
    sourceChoiceId: "choice-source",
  };
}

describe("story state defaults", () => {
  it("creates independent, JSON-serializable v2 R01-compatible state", () => {
    const first = createDefaultStoryState();
    const second = createDefaultStoryState();

    first.flags.extraBunk = true;
    first.queue.push(scheduledEvent("later", 2, "dawn"));

    expect(second.flags.extraBunk).toBe(false);
    expect(second.queue).toEqual([]);
    expect(JSON.parse(JSON.stringify(second))).toEqual(second);
    expect(second).toMatchObject({
      version: 2,
      cargoConversion: "none",
      finaleStage: "inactive",
      completedContactWaves: 0,
      finaleHealthBuffer: 0,
      finalDecision: null,
      endingId: null,
      whiteFrost: null,
    });
  });

  it("adds story defaults to every new run", () => {
    const run = createRun("story-default");

    expect(run.story).toEqual(createDefaultStoryState());
    expect(JSON.parse(JSON.stringify(run)).story).toEqual(run.story);
  });
});

describe("deterministic scheduled story events", () => {
  it("sorts by day, phase order, then id without mutating input", () => {
    const input = [
      scheduledEvent("z", 2, "dawn"),
      scheduledEvent("b", 1, "travel"),
      scheduledEvent("a", 1, "travel"),
      scheduledEvent("route", 1, "route"),
      scheduledEvent("prep", 1, "prep"),
      scheduledEvent("dawn", 1, "dawn"),
      scheduledEvent("aftermath", 1, "aftermath"),
    ];

    expect(sortScheduledStoryEvents(input).map((event) => event.id)).toEqual([
      "dawn",
      "prep",
      "route",
      "a",
      "b",
      "aftermath",
      "z",
    ]);
    expect(input.map((event) => event.id)).toEqual(["z", "b", "a", "route", "prep", "dawn", "aftermath"]);
  });

  it("queues immutably, remains idempotent, and rejects conflicting ids", () => {
    const story = createDefaultStoryState();
    const later = scheduledEvent("later", 3, "travel");
    const earlier = scheduledEvent("earlier", 2, "dawn");
    const queued = queueStoryEvent(queueStoryEvent(story, later), earlier);

    expect(story.queue).toEqual([]);
    expect(queued.queue.map((event) => event.id)).toEqual(["earlier", "later"]);
    expect(queueStoryEvent(queued, { ...earlier })).toBe(queued);
    expect(() =>
      queueStoryEvent(queued, {
        ...earlier,
        eventId: "EV-conflict",
      }),
    ).toThrow(/conflicting data/);
  });

  it("returns exact-phase and overdue events once they become eligible", () => {
    let story = createDefaultStoryState();
    story = queueStoryEvent(story, scheduledEvent("past-day", 1, "aftermath"));
    story = queueStoryEvent(story, scheduledEvent("earlier-phase", 2, "dawn"));
    story = queueStoryEvent(story, scheduledEvent("exact-phase", 2, "route"));
    story = queueStoryEvent(story, scheduledEvent("future-phase", 2, "travel"));
    story = queueStoryEvent(story, scheduledEvent("future-day", 3, "dawn"));

    expect(getDueStoryEvents(story, 2, "route").map((event) => event.id)).toEqual([
      "past-day",
      "earlier-phase",
      "exact-phase",
    ]);
    expect(getDueStoryEvents(story, 2, "travel").map((event) => event.id)).toEqual([
      "past-day",
      "earlier-phase",
      "exact-phase",
      "future-phase",
    ]);
  });

  it("consumes a scheduled event once and records the authored event id once", () => {
    const queued = queueStoryEvent(
      queueStoryEvent(createDefaultStoryState(), scheduledEvent("first", 2, "dawn", "EV042")),
      scheduledEvent("second", 3, "dawn", "EV042"),
    );
    const once = consumeStoryEvent(queued, "first");
    const twice = consumeStoryEvent(once, "second");

    expect(once.queue.map((event) => event.id)).toEqual(["second"]);
    expect(once.seenEventIds).toEqual(["EV042"]);
    expect(twice.queue).toEqual([]);
    expect(twice.seenEventIds).toEqual(["EV042"]);
    expect(consumeStoryEvent(twice, "missing")).toBe(twice);
  });
});

describe("A-07 consent", () => {
  it("grants direct consent at trust 60 or higher", () => {
    const run = createRun("consent-high");
    run.survivor.trust = 60;

    expect(evaluateA07Consent(run)).toMatchObject({
      status: "granted",
      consents: true,
      evidenceRequired: false,
      canOverride: false,
    });
  });

  it("grants evidence-backed consent at trust 40–59 when the author is known", () => {
    const run = createRun("consent-evidence");
    run.survivor.trust = 40;
    run.story.flags.authorKnown = true;

    expect(evaluateA07Consent(run)).toMatchObject({
      status: "granted-with-evidence",
      consents: true,
      evidenceRequired: true,
      canOverride: false,
    });
  });

  it("refuses otherwise and exposes override availability only for I2", () => {
    const run = createRun("consent-refused");
    run.survivor.trust = 59;

    expect(evaluateA07Consent(run)).toMatchObject({
      status: "refused",
      consents: false,
      canOverride: false,
    });

    run.techOwned.push("I2");
    expect(evaluateA07Consent(run)).toMatchObject({
      status: "refused",
      consents: false,
      canOverride: true,
    });
  });
});

describe("Day 4 branch helpers", () => {
  it("maps every route to its permanent cargo conversion", () => {
    expect(cargoConversionForDay4Route("GO")).toBe("isolation-bay");
    expect(cargoConversionForDay4Route("DETOUR")).toBe("battery-array");
    expect(cargoConversionForDay4Route("STOP")).toBe("sample-lab");
    expect(cargoConversionForDay4Route(null)).toBe("none");
  });

  it("requires two branch-specific data operations", () => {
    const story = createDefaultStoryState();

    story.flags.day4Route = "GO";
    story.flags.isolationTraceCount = 1;
    expect(hasEarnedTrueRouteData(story.flags)).toBe(false);
    story.flags.isolationTraceCount = 2;
    expect(hasEarnedTrueRouteData(story.flags)).toBe(true);

    story.flags.day4Route = "DETOUR";
    story.flags.routeSampleCount = 2;
    expect(hasEarnedTrueRouteData(story.flags)).toBe(true);

    story.flags.day4Route = "STOP";
    story.flags.manifestCrossChecks = 2;
    expect(hasEarnedTrueRouteData(story.flags)).toBe(true);
  });

  it("applies a route and refreshes true-route state immutably", () => {
    const story = createDefaultStoryState();
    story.flags.routeSampleCount = 2;
    const detour = applyDay4Route(story, "DETOUR");

    expect(story.flags.day4Route).toBeNull();
    expect(detour).toMatchObject({
      cargoConversion: "battery-array",
      flags: { day4Route: "DETOUR", trueRouteData: true },
    });

    detour.flags.routeSampleCount = 1;
    expect(refreshTrueRouteData(detour).flags.trueRouteData).toBe(false);
  });
});

describe("ending resolver", () => {
  it("resolves protocol termination", () => {
    const run = createRun("ending-terminate");
    run.story.flags.clause7Read = true;
    run.story.flags.overrideUsed = true;

    expect(evaluateEnding(run, "terminate").endingId).toBe("protocol-terminated");
  });

  it("resolves quarantine at all inclusive boundaries", () => {
    const run = createRun("ending-quarantine");
    run.story.flags.quarantinePrepared = true;
    run.story.completedContactWaves = 3;
    run.survivor.infection = 40;
    run.survivor.trust = 59;

    expect(evaluateEnding(run, "seal").endingId).toBe("quarantine");
  });

  it("resolves reroute for DETOUR or STOP with verified route data", () => {
    for (const route of ["DETOUR", "STOP"] as const) {
      const run = createRun(`ending-${route}`);
      run.story.flags.day4Route = route;
      run.story.flags.trueRouteData = true;
      run.survivor.infection = 50;

      expect(evaluateEnding(run, "reroute").endingId).toBe("reroute");
    }
  });

  it("resolves verified arrival when control conditions are satisfied", () => {
    const run = createRun("ending-arrival");
    run.story.flags.trueRouteData = true;
    run.survivor.trust = 60;
    run.survivor.infection = 30;

    expect(evaluateEnding(run, "open").endingId).toBe("arrival");

    run.story.flags.overrideUsed = true;
    expect(evaluateEnding(run, "open").endingId).toBe("arrival-unverified");
    run.story.flags.controlReturned = true;
    expect(evaluateEnding(run, "open").endingId).toBe("arrival");
  });

  it("falls back to unverified arrival", () => {
    const run = createRun("ending-fallback");

    expect(evaluateEnding(run, "open")).toMatchObject({
      endingId: "arrival-unverified",
      reasons: [expect.stringContaining("arrival-unverified")],
    });
  });

  it("uses fixed priority while preserving reasons for every matched ending", () => {
    const run = createRun("ending-priority");
    run.story.flags.clause7Read = true;
    run.story.flags.overrideUsed = true;
    run.story.flags.day4Route = "DETOUR";
    run.story.flags.trueRouteData = true;
    run.survivor.trust = 29;
    run.survivor.infection = 20;

    const evaluation = evaluateEnding(run, "reroute");

    expect(evaluation.endingId).toBe("protocol-terminated");
    expect(evaluation.reasons).toHaveLength(2);
    expect(evaluation.reasons[0]).toContain("protocol-terminated");
    expect(evaluation.reasons[1]).toContain("reroute");
  });

  it("keeps an already resolved ending locked", () => {
    const run = createRun("ending-locked");
    run.story.endingId = "quarantine";
    run.story.endingReasons = ["既有結局已鎖定"];
    run.story.flags.trueRouteData = true;
    run.survivor.trust = 100;

    expect(evaluateEnding(run, "open")).toEqual({
      endingId: "quarantine",
      reasons: ["既有結局已鎖定"],
    });
  });
});
