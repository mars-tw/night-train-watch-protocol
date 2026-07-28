import { describe, expect, it } from "vitest";
import {
  ALL_STORY_EVENTS,
  FROST_BRANCH_DEFINITIONS,
  FROST_STORY_DAY_SCHEDULE,
  FROST_STORY_EVENTS,
  STORY_DAY_SCHEDULE,
  STORY_DAY_SCHEDULE_BY_ROUTE,
  STORY_EVENTS,
  THREATS,
} from "../src/game/content";

const R01_EVENT_IDS = Array.from(
  { length: 12 },
  (_, index) => `EV${String(41 + index).padStart(3, "0")}`,
);
const FROST_EVENT_IDS = Array.from(
  { length: 13 },
  (_, index) => `EV${String(53 + index).padStart(3, "0")}`,
);

describe("R02 white-frost story content", () => {
  it("adds EV053-EV065 exactly once without changing the R01 compatibility export", () => {
    expect(STORY_EVENTS.map((event) => event.id)).toEqual(R01_EVENT_IDS);
    expect(FROST_STORY_EVENTS.map((event) => event.id)).toEqual(FROST_EVENT_IDS);

    const allIds = ALL_STORY_EVENTS.map((event) => event.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds).toEqual(expect.arrayContaining([...R01_EVENT_IDS, ...FROST_EVENT_IDS]));
  });

  it("schedules every frost event once on R02 and leaves the R01 schedule unchanged", () => {
    const scheduledIds = Object.values(FROST_STORY_DAY_SCHEDULE)
      .flatMap((entries) => entries.map((entry) => entry.eventId));

    expect(Object.keys(FROST_STORY_DAY_SCHEDULE).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(scheduledIds).toHaveLength(FROST_EVENT_IDS.length);
    expect(new Set(scheduledIds)).toEqual(new Set(FROST_EVENT_IDS));
    expect(STORY_DAY_SCHEDULE_BY_ROUTE.R01).toEqual(STORY_DAY_SCHEDULE);
    expect(STORY_DAY_SCHEDULE_BY_ROUTE.R02).toEqual(FROST_STORY_DAY_SCHEDULE);
  });

  it("keeps every authored frost edge inside the route and makes all nodes reachable from EV053", () => {
    const eventById = new Map(FROST_STORY_EVENTS.map((event) => [event.id, event]));
    const reachable = new Set<string>(["EV053"]);
    const pending = ["EV053"];

    while (pending.length > 0) {
      const eventId = pending.shift()!;
      const event = eventById.get(eventId);
      expect(event, `${eventId} should exist`).toBeDefined();

      for (const choice of event?.choices ?? []) {
        const nextEventId = choice.consequence.nextEventId;
        if (!nextEventId) continue;
        expect(eventById.has(nextEventId), `${eventId}/${choice.id} points outside R02`).toBe(true);
        if (!reachable.has(nextEventId)) {
          reachable.add(nextEventId);
          pending.push(nextEventId);
        }
      }
    }

    expect(reachable).toEqual(new Set(FROST_EVENT_IDS));
  });

  it("defines CARE, CLEAR, and SUSTAIN as three irreversible EV057 branches", () => {
    const branchEvent = FROST_STORY_EVENTS.find((event) => event.id === "EV057");
    expect(branchEvent).toBeDefined();
    expect(Object.keys(FROST_BRANCH_DEFINITIONS)).toEqual(["CARE", "CLEAR", "SUSTAIN"]);
    expect(branchEvent?.choices.map((choice) => choice.id)).toEqual(["CARE", "CLEAR", "SUSTAIN"]);
    expect(
      Object.fromEntries(
        branchEvent?.choices.map((choice) => [choice.id, choice.consequence.nextEventId]) ?? [],
      ),
    ).toEqual({
      CARE: "EV058",
      CLEAR: "EV059",
      SUSTAIN: "EV060",
    });

    for (const choice of branchEvent?.choices ?? []) {
      expect(choice.risk, `${choice.id} should be irreversible`).toBe("irreversible");
      expect(choice.visibleCost, `${choice.id} should expose its cost`).not.toHaveLength(0);
      expect(choice.permanentConsequence, `${choice.id} should expose its consequence`).not.toHaveLength(0);
    }
  });

  it("preserves all shipped R01 threats while adding T009", () => {
    expect(THREATS.map((threat) => threat.id)).toEqual([
      "T002",
      "T003",
      "T004",
      "T005",
      "T006",
      "T009",
    ]);
  });
});
