import { describe, expect, it } from "vitest";
import {
  ALL_STORY_EVENTS,
  GREEN_BRANCH_DEFINITIONS,
  GREEN_DAY7_FINALE_SEQUENCE,
  GREEN_STORY_DAY_SCHEDULE,
  GREEN_STORY_EVENTS,
  GREEN_THREAT_DEFINITIONS,
  GREEN_THREAT_METADATA,
  STORY_DAY_SCHEDULE_BY_ROUTE,
  STORY_EVENT_ROUTE_OWNERSHIP,
  STORY_ROUTE_DEFINITIONS,
  STORY_ROUTE_RUNTIME_POLICIES,
  THREATS,
} from "../src/game/content";

const GREEN_EVENT_IDS = Array.from(
  { length: 13 },
  (_, index) => `EV${String(66 + index).padStart(3, "0")}`,
);

const REQUIRED_FALLBACKS: Record<string, string> = {
  EV066: "skim",
  EV067: "a07-choice",
  EV068: "skip",
  EV069: "canopy",
  EV070: "isolate",
  EV071: "endure",
  EV072: "CULTIVATE",
  EV073: "control",
  EV074: "hand-crank",
  EV075: "seal-ash",
  EV076: "tell-truth",
  EV077: "hand-winch",
  EV078: "quarantine",
};

function hanLength(value: string): number {
  return Array.from(value.matchAll(/\p{Script=Han}/gu)).length;
}

describe("R03 green-tide story content", () => {
  it("declares EV066-EV078 exactly once and preserves all prior story IDs", () => {
    expect(GREEN_STORY_EVENTS.map((event) => event.id)).toEqual(GREEN_EVENT_IDS);

    const allIds = ALL_STORY_EVENTS.map((event) => event.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds).toEqual(expect.arrayContaining(["EV041", "EV052", "EV053", "EV065", ...GREEN_EVENT_IDS]));

    for (const event of GREEN_STORY_EVENTS) {
      expect(event.forced, `${event.id} must stay forced`).toBe(true);
      expect(event.payoff, `${event.id} payoff`).not.toHaveLength(0);
      expect(event.choices.length, `${event.id} choices`).toBeGreaterThanOrEqual(3);
      for (const choice of event.choices) {
        expect(choice.visibleCost, `${event.id}/${choice.id} visible cost`).not.toHaveLength(0);
        expect(choice.permanentConsequence, `${event.id}/${choice.id} consequence`).not.toHaveLength(0);
        expect(choice.tags.length, `${event.id}/${choice.id} tags`).toBeGreaterThan(0);
        expect(choice.consequence.transition, `${event.id}/${choice.id} transition`).toBeTruthy();
      }
    }
  });

  it("schedules every R03 event once and derives strict event-route ownership", () => {
    const scheduledIds = Object.values(GREEN_STORY_DAY_SCHEDULE)
      .flatMap((entries) => entries.map((entry) => entry.eventId));

    expect(Object.keys(GREEN_STORY_DAY_SCHEDULE).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(scheduledIds).toHaveLength(GREEN_EVENT_IDS.length);
    expect(new Set(scheduledIds)).toEqual(new Set(GREEN_EVENT_IDS));
    expect(STORY_DAY_SCHEDULE_BY_ROUTE.R03).toEqual(GREEN_STORY_DAY_SCHEDULE);

    for (const eventId of GREEN_EVENT_IDS) {
      expect(STORY_EVENT_ROUTE_OWNERSHIP[eventId], eventId).toBe("R03");
    }
    expect(STORY_EVENT_ROUTE_OWNERSHIP.EV041).toBe("R01");
    expect(STORY_EVENT_ROUTE_OWNERSHIP.EV053).toBe("R02");
  });

  it("keeps all authored R03 edges inside the route and reaches every branch node", () => {
    const eventById = new Map(GREEN_STORY_EVENTS.map((event) => [event.id, event]));
    const reachable = new Set<string>(["EV066"]);
    const pending = ["EV066"];

    while (pending.length > 0) {
      const eventId = pending.shift()!;
      const event = eventById.get(eventId);
      expect(event, `${eventId} should exist`).toBeDefined();

      for (const choice of event?.choices ?? []) {
        const nextEventId = choice.consequence.nextEventId;
        if (!nextEventId) {
          expect(eventId, "only EV078 may end without another R03 event").toBe("EV078");
          continue;
        }
        expect(eventById.has(nextEventId), `${eventId}/${choice.id} points outside R03`).toBe(true);
        if (!reachable.has(nextEventId)) {
          reachable.add(nextEventId);
          pending.push(nextEventId);
        }
      }
    }

    expect(reachable).toEqual(new Set(GREEN_EVENT_IDS));
  });

  it("defines irreversible CULTIVATE, FILTER, and PURGE branches with permanent Day 5 operations", () => {
    const branchEvent = GREEN_STORY_EVENTS.find((event) => event.id === "EV072");
    expect(branchEvent?.choices.map((choice) => choice.id)).toEqual(["CULTIVATE", "FILTER", "PURGE"]);
    expect(Object.keys(GREEN_BRANCH_DEFINITIONS)).toEqual(["CULTIVATE", "FILTER", "PURGE"]);

    expect(
      Object.fromEntries(
        branchEvent?.choices.map((choice) => [choice.id, choice.consequence.nextEventId]) ?? [],
      ),
    ).toEqual({
      CULTIVATE: "EV073",
      FILTER: "EV074",
      PURGE: "EV075",
    });

    for (const [branchId, definition] of Object.entries(GREEN_BRANCH_DEFINITIONS)) {
      const choice = branchEvent?.choices.find((candidate) => candidate.id === branchId);
      expect(choice?.risk).toBe("irreversible");
      expect(choice?.consequence.greenTide?.set?.branch).toBe(branchId);
      expect(definition.visibleLayer).not.toHaveLength(0);
      expect(definition.day5Operation).not.toHaveLength(0);
      expect(definition.cycleModifier).not.toHaveLength(0);
      expect(definition.day7Advantage).not.toHaveLength(0);
      expect(STORY_EVENT_ROUTE_OWNERSHIP[definition.day5EventId]).toBe("R03");
    }
  });

  it("keeps a visible resource-independent fallback on every forced event", () => {
    expect(Object.keys(REQUIRED_FALLBACKS)).toEqual(GREEN_EVENT_IDS);

    for (const event of GREEN_STORY_EVENTS) {
      const fallbackId = REQUIRED_FALLBACKS[event.id]!;
      const fallback = event.choices.find((choice) => choice.id === fallbackId);
      expect(fallback, `${event.id}/${fallbackId} fallback`).toBeDefined();
      expect(fallback?.requirements?.minimum, `${event.id}/${fallbackId} global resources`).toBeUndefined();
      expect(fallback?.known, `${event.id}/${fallbackId} visibility`).toMatch(/永遠可選|取得|根脈|plot-a|維持目前污染/);
    }
  });

  it("defines R03 route policy without changing R01/R02 prep ownership", () => {
    expect(STORY_ROUTE_DEFINITIONS.R03).toEqual({
      id: "R03",
      name: "綠潮線",
      description: expect.stringContaining("封閉循環"),
      firstEventId: "EV066",
      finalEventId: "EV078",
    });

    expect(STORY_ROUTE_RUNTIME_POLICIES.R01.startsWithPrepStory).toBe(false);
    expect(STORY_ROUTE_RUNTIME_POLICIES.R02.startsWithPrepStory).toBe(true);
    expect(STORY_ROUTE_RUNTIME_POLICIES.R03).toMatchObject({
      id: "R03",
      initialCarriageId: "greenhouse",
      startsWithPrepStory: true,
      storyStateKey: "greenTide",
      standardThreatIds: ["T008", "T013"],
      completionLedgerSource: "story.R03.route-complete",
    });
  });

  it("adds T008 and T013 while keeping the published T006 definition unchanged", () => {
    expect(THREATS.find((threat) => threat.id === "T006")).toEqual({
      id: "T006",
      name: "靜默群",
      anchor: "roof",
      counterIds: ["trace-leaves", "trace-meter"],
      warningSeconds: 8,
      damage: 16,
      artKey: "threat.silent-crowd",
    });
    expect(GREEN_THREAT_DEFINITIONS.map((threat) => threat.id)).toEqual(["T008", "T013"]);
    expect(GREEN_THREAT_DEFINITIONS.every((threat) => threat.damage === 0)).toBe(true);

    expect(GREEN_THREAT_METADATA.T008.inspectZones).toEqual(["CANOPY", "FILTER", "UNDERBED"]);
    expect(GREEN_THREAT_METADATA.T008.firstMistakeEffects).toMatchObject({ infection: 0, stress: 0 });
    expect(GREEN_THREAT_METADATA.T008.secondMistakeEffects).toEqual({ infection: 4, stress: 3 });
    expect(GREEN_THREAT_METADATA.T008.manualFallback.effects).toEqual({ hull: -4, stress: 5 });

    expect(GREEN_THREAT_METADATA.T013.legacyGddId).toBe("T006");
    expect(GREEN_THREAT_METADATA.T013.legacyAliasEnabled).toBe(false);
    expect(GREEN_THREAT_METADATA.T013.contaminatedSampleCount).toBe(2);
    expect(GREEN_THREAT_METADATA.T013.secondMistakeEffects).toEqual({
      infection: 4,
      reservoirContamination: 15,
    });
    expect(GREEN_THREAT_METADATA.T013.genericHullDamage).toBe(false);
  });

  it("locks Day 7 to GATE, T013 then T008 CONTACT, and four visible endings within 210 seconds", () => {
    expect(GREEN_DAY7_FINALE_SEQUENCE.map((stage) => stage.stage)).toEqual([
      "gate",
      "contact",
      "decision",
    ]);
    expect(GREEN_DAY7_FINALE_SEQUENCE[1].threatIds).toEqual(["T013", "T008"]);
    expect(
      GREEN_DAY7_FINALE_SEQUENCE.reduce((total, stage) => total + stage.durationSeconds, 0),
    ).toBe(210);

    const endingEvent = GREEN_STORY_EVENTS.find((event) => event.id === "EV078");
    expect(endingEvent?.choices.map((choice) => choice.id)).toEqual([
      "seedbank",
      "symbiosis",
      "firebreak",
      "quarantine",
    ]);
    expect(endingEvent?.choices.map((choice) => choice.consequence.greenEndingId)).toEqual([
      "green-seedbank",
      "green-symbiosis",
      "green-firebreak",
      "green-quarantine",
    ]);
    expect(endingEvent?.choices.map((choice) => choice.consequence.greenFinalDecision)).toEqual([
      "seedbank",
      "symbiosis",
      "firebreak",
      "quarantine",
    ]);
    expect(endingEvent?.choices.find((choice) => choice.id === "quarantine")?.requirements).toBeUndefined();
  });

  it("keeps dedicated R03 night-facing lines concise and visible", () => {
    const entries = [
      ...GREEN_STORY_EVENTS.map((event) => `${event.id}:${event.nightLine}`),
      ...Object.values(GREEN_THREAT_METADATA).map((threat) => `${threat.id}:${threat.warningLine}`),
    ];

    for (const entry of entries) {
      const [, line = ""] = entry.split(":");
      expect(hanLength(line), `${entry} exceeds the 24-character budget`).toBeLessThanOrEqual(24);
      expect(hanLength(line), `${entry} needs visible Chinese text`).toBeGreaterThan(0);
    }
  });
});
