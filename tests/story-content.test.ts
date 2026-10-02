import { describe, expect, it } from "vitest";
import {
  DAY4_BRANCH_DEFINITIONS,
  DAY7_FINALE_SEQUENCE,
  ENDING_DEFINITIONS,
  EVENTS,
  STORY_DAY_SCHEDULE,
  STORY_EVENTS,
  STORY_THREAT_METADATA,
  TECH_NODES,
  THREATS,
} from "../src/game/content";

const requiredStoryEventIds = Array.from({ length: 12 }, (_, index) => `EV${String(41 + index).padStart(3, "0")}`);
const nonFallbackEndingIds = new Set(["arrival", "quarantine", "reroute", "protocol-terminated"]);

function hanLength(value: string): number {
  return Array.from(value.matchAll(/\p{Script=Han}/gu)).length;
}

describe("v0.9 greyline story content", () => {
  it("keeps old content IDs and adds every new ID exactly once", () => {
    const eventIds = [...EVENTS, ...STORY_EVENTS].map((event) => event.id);
    const threatIds = THREATS.map((threat) => threat.id);
    const techIds = TECH_NODES.map((tech) => tech.id);

    expect(EVENTS.map((event) => event.id)).toEqual(expect.arrayContaining(["EV001", "EV004", "EV006", "EV012", "EV020", "EV024", "EV031", "EV040"]));
    expect(THREATS.slice(0, 2).map((threat) => threat.id)).toEqual(["T002", "T003"]);
    expect(techIds).toEqual(expect.arrayContaining(["E1", "E2", "E3", "D1", "I1"]));

    expect(STORY_EVENTS.map((event) => event.id)).toEqual(requiredStoryEventIds);
    expect(threatIds).toEqual(expect.arrayContaining(["T004", "T005", "T006"]));
    expect(techIds).toEqual(expect.arrayContaining(["E4", "D2", "I2"]));
    expect(new Set(eventIds).size).toBe(eventIds.length);
    expect(new Set(threatIds).size).toBe(threatIds.length);
    expect(new Set(techIds).size).toBe(techIds.length);
  });

  it("gives every story choice visible risk, tags, cost, and permanent consequences", () => {
    for (const event of STORY_EVENTS) {
      expect(event.forced, `${event.id} should be forced`).toBe(true);
      expect(event.payoff, `${event.id} should name its payoff`).not.toHaveLength(0);
      for (const choice of event.choices) {
        expect(choice.id, `${event.id} choice id`).not.toHaveLength(0);
        expect(choice.label, `${event.id}/${choice.id} label`).not.toHaveLength(0);
        expect(choice.cost, `${event.id}/${choice.id} legacy cost`).not.toHaveLength(0);
        expect(choice.known, `${event.id}/${choice.id} legacy known result`).not.toHaveLength(0);
        expect(choice.deltas, `${event.id}/${choice.id} legacy deltas`).toBeTypeOf("object");
        expect(choice.result, `${event.id}/${choice.id} legacy result`).not.toHaveLength(0);
        expect(["low", "medium", "high", "irreversible"]).toContain(choice.risk);
        expect(choice.tags.length, `${event.id}/${choice.id} tags`).toBeGreaterThan(0);
        expect(choice.visibleCost, `${event.id}/${choice.id} visible cost`).not.toHaveLength(0);
        expect(choice.permanentConsequence, `${event.id}/${choice.id} permanent consequence`).not.toHaveLength(0);
        expect(choice.consequence.transition, `${event.id}/${choice.id} transition`).toBeTruthy();
      }
    }
  });

  it("forces every story event through the Day 1-7 schedule and keeps next-event edges reachable", () => {
    expect(Object.keys(STORY_DAY_SCHEDULE).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7]);

    const scheduledIds = Object.values(STORY_DAY_SCHEDULE).flatMap((entries) => entries.map((entry) => entry.eventId));
    expect(scheduledIds).toEqual(requiredStoryEventIds);
    expect(new Set(scheduledIds)).toEqual(new Set(STORY_EVENTS.map((event) => event.id)));

    const storyIds = new Set(STORY_EVENTS.map((event) => event.id));
    for (const event of STORY_EVENTS) {
      for (const choice of event.choices) {
        if (choice.consequence.nextEventId) {
          expect(storyIds.has(choice.consequence.nextEventId), `${event.id}/${choice.id} next event`).toBe(true);
        } else {
          expect(event.id, "only EV052 may end without a next event").toBe("EV052");
        }
      }
    }
  });

  it("data-defines all irreversible Day 4 branches and fair true-route acquisition", () => {
    expect(Object.keys(DAY4_BRANCH_DEFINITIONS)).toEqual(["GO", "DETOUR", "STOP"]);
    expect(DAY4_BRANCH_DEFINITIONS.GO.day7WaveThree.threatId).toBe("T006");
    expect(DAY4_BRANCH_DEFINITIONS.DETOUR.day7WaveThree.threatId).toBe("T004");
    expect(DAY4_BRANCH_DEFINITIONS.STOP.day7WaveThree.threatId).toBe("T005");

    const day4Event = STORY_EVENTS.find((event) => event.id === "EV044");
    expect(day4Event?.choices.map((choice) => choice.id)).toEqual(["GO", "DETOUR", "STOP"]);

    for (const branch of Object.values(DAY4_BRANCH_DEFINITIONS)) {
      expect(branch.trueRouteDataOperation.requiredCount).toBe(2);
      expect(branch.trueRouteDataOperation.grantsFlag).toBe("trueRouteData");
      expect(branch.permanentConsequence).not.toHaveLength(0);
      expect(branch.day5Operation).not.toHaveLength(0);
      expect(branch.day6Effect).not.toHaveLength(0);
      expect(branch.day7WaveThree.modifier).not.toHaveLength(0);
      expect(branch.reachableEndingIds.filter((endingId) => nonFallbackEndingIds.has(endingId)).length).toBeGreaterThanOrEqual(2);

      const matchingChoice = day4Event?.choices.find((choice) => choice.id === branch.id);
      expect(matchingChoice?.risk).toBe("irreversible");
      expect(matchingChoice?.consequence.day4Route).toBe(branch.id);
      expect(matchingChoice?.consequence.cargoConversion).toBe(branch.cargoConversion);
      expect(matchingChoice?.permanentConsequence).toContain(branch.cargoConversion === "isolation-bay" ? "隔離間" : branch.cargoConversion === "battery-array" ? "電池陣" : "採樣室");
    }
  });

  it("maps only EV051 to one of four final decisions", () => {
    const decisionChoices = STORY_EVENTS.flatMap((event) =>
      event.choices
        .filter((choice) => choice.consequence.finalDecision !== undefined)
        .map((choice) => ({ eventId: event.id, mapped: choice.mapsToFinalDecision, final: choice.consequence.finalDecision })),
    );

    expect(decisionChoices.map((choice) => choice.eventId)).toEqual(["EV051", "EV051", "EV051", "EV051"]);
    expect(decisionChoices.map((choice) => choice.mapped)).toEqual(["open", "seal", "reroute", "terminate"]);
    expect(decisionChoices.map((choice) => choice.final)).toEqual(["open", "seal", "reroute", "terminate"]);
    expect(new Set(decisionChoices.map((choice) => choice.final)).size).toBe(4);
  });

  it("keeps ending definitions unique and in deterministic resolver priority", () => {
    expect(ENDING_DEFINITIONS.map((ending) => ending.id)).toEqual([
      "protocol-terminated",
      "quarantine",
      "reroute",
      "arrival",
      "arrival-unverified",
    ]);
    expect(ENDING_DEFINITIONS.map((ending) => ending.priority)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(ENDING_DEFINITIONS.map((ending) => ending.id)).size).toBe(ENDING_DEFINITIONS.length);
    expect(ENDING_DEFINITIONS.at(-1)?.kind).toBe("fallback");
  });

  it("keeps the three-stage finale within 210 seconds", () => {
    expect(DAY7_FINALE_SEQUENCE.map((stage) => stage.stage)).toEqual(["arrival", "contact", "decision"]);
    expect(DAY7_FINALE_SEQUENCE.reduce((total, stage) => total + stage.durationSeconds, 0)).toBe(210);
    expect(DAY7_FINALE_SEQUENCE[1].durationSeconds).toBe(120);
  });

  it("defines visible non-damage operations for all new threats", () => {
    expect(STORY_THREAT_METADATA.T004.requiredDragItem).toBe("cutter");
    expect(STORY_THREAT_METADATA.T004.lockedSystem).toBe("crop-plot");
    expect(STORY_THREAT_METADATA.T005.firstMistakeDamage).toBe(0);
    expect(STORY_THREAT_METADATA.T005.secondMistakeDamage).toBe(2);
    expect(STORY_THREAT_METADATA.T006.audioCue).toBe(false);
    expect(STORY_THREAT_METADATA.T006.knockAnimation).toBe(false);
    expect(STORY_THREAT_METADATA.T006.warningSeconds).toBe(8);
    expect(STORY_THREAT_METADATA.T006.rootSensorHints.noCropMeterStrength).toBe(0.35);
  });

  it("keeps every dedicated night-facing sentence within 24 Chinese characters", () => {
    const lines = [
      ...STORY_EVENTS.map((event) => `${event.id}:${event.nightLine}`),
      ...Object.values(STORY_THREAT_METADATA).map((threat) => `${threat.id}:${threat.warningLine}`),
    ];

    for (const entry of lines) {
      const [, line = ""] = entry.split(":");
      expect(hanLength(line), `${entry} exceeds the 24-character night budget`).toBeLessThanOrEqual(24);
      expect(hanLength(line), `${entry} should contain a visible Chinese sentence`).toBeGreaterThan(0);
    }
  });
});
