import { describe, expect, it } from "vitest";
import {
  ALL_STORY_EVENTS,
  STORY_EVENT_ROUTE_OWNERSHIP,
} from "../src/game/content";
import { createRun } from "../src/game/model";
import { QUEST_CATALOG } from "../src/game/quests";
import { RunService } from "../src/game/services";
import { flushRunFacts } from "../src/game/v2-observer";
import type { RunState, ThreatInteractionState } from "../src/game/types";

function skipScheduledStory(run: RunState): void {
  run.story.seenEventIds = ALL_STORY_EVENTS.map((event) => event.id);
}

function eventTypes(run: RunState): string[] {
  return run.quests.eventHistory.map((event) => event.type);
}

describe("v2 observer through public RunService operations", () => {
  it("completes TUT-01 through TUT-05 and emits the counter before the nested night fact", () => {
    const service = new RunService();
    const run = createRun("observer-tutorials", "R01");
    skipScheduledStory(run);

    expect(service.inspectObject(run, "sleep-bed")).toBe(true);
    expect(service.inspectObject(run, "defense-window")).toBe(true);
    expect(service.toggleModule(run, "M001")).toBe(true);
    service.setRation(run, "standard");
    expect(service.plantCrop(run, "plot-a", "lettuce")).toBe(true);
    service.chooseRoute(run, "RN01");
    const travelEvent = service.getEvent(run);
    expect(travelEvent).toBeDefined();
    expect(service.resolveEvent(run, travelEvent!.choices[0]!)).toBe(true);

    const threatId = run.activeContact?.definitionId;
    expect(threatId === "T002" || threatId === "T003").toBe(true);
    const counterId = threatId === "T002" ? "shock-window" : "emergency-boost";
    expect(service.counterThreat(run, counterId)).toBe(true);

    for (const id of ["TUT-01", "TUT-02", "TUT-03", "TUT-04", "TUT-05"])
      expect(run.quests.missions[id]).toMatchObject({
        lifecycle: "completed",
        result: "completed",
      });
    const counterIndex = run.quests.eventHistory.findIndex(
      (event) =>
        event.type === "action.committed" && event.operation === "counter.deploy",
    );
    const nightIndex = run.quests.eventHistory.findIndex(
      (event) => event.type === "night.resolved" && event.day === 1,
    );
    expect(counterIndex).toBeGreaterThanOrEqual(0);
    expect(nightIndex).toBeGreaterThan(counterIndex);
  });

  it.each([
    ["R01", "EV041"],
    ["R02", "EV053"],
    ["R03", "EV066"],
  ] as const)("opens and resolves the natural first-night %s story phase", (routeId, eventId) => {
    const service = new RunService();
    const run = createRun(`observer-${routeId}`, routeId);
    if (routeId === "R01") service.chooseRoute(run, "RN01");
    else expect(service.enterStoryPhase(run, "prep")).toBe(true);
    expect(run.activeEventId).toBe(eventId);
    expect(STORY_EVENT_ROUTE_OWNERSHIP[eventId]).toBe(routeId);
    const event = service.getEvent(run);
    expect(event).toBeDefined();
    expect(service.resolveEvent(run, event!.choices[0]!)).toBe(true);
    expect(
      run.quests.eventHistory.some(
        (entry) =>
          entry.type === "story.milestone" &&
          entry.milestoneId === `${routeId}.N01`,
      ),
    ).toBe(true);
  });

  it("uses pre-harvest contamination and real planting history for CH-03", () => {
    const grownService = new RunService();
    const grown = createRun("observer-grown", "R01");
    skipScheduledStory(grown);
    expect(grownService.plantCrop(grown, "plot-a", "lettuce")).toBe(true);
    grown.phase = "aftermath";
    grownService.continueAftermath(grown);
    expect(grownService.harvestCrop(grown, "plot-a")).toBe(true);
    const grownEvent = [...grown.quests.eventHistory].reverse().find(
      (event) => event.operation === "crop.harvest",
    );
    expect(grownEvent).toMatchObject({
      growthProvenance: "grown-in-this-run",
      mature: true,
      healthy: true,
    });
    expect(grown.quests.missions["CH-03"]?.lifecycle).toBe("completed");

    // Canonical legacy fixture: a migrated mature plot has no committed plant event.
    const importedService = new RunService();
    const imported = createRun("observer-imported", "R01");
    imported.crops[0] = {
      id: "plot-a",
      cropId: "lettuce",
      stage: 3,
      plantedDay: 1,
      poweredGrowthNights: 1,
      wateredDay: 1,
      dryDays: 0,
    };
    expect(importedService.harvestCrop(imported, "plot-a")).toBe(true);
    expect(
      [...imported.quests.eventHistory].reverse().find(
        (event) => event.operation === "crop.harvest",
      ),
    ).toMatchObject({ growthProvenance: "imported" });
    expect(imported.quests.missions["CH-03"]?.lifecycle).not.toBe("completed");

    const taintedService = new RunService();
    const tainted = createRun("observer-tainted", "R03");
    skipScheduledStory(tainted);
    expect(taintedService.plantCrop(tainted, "plot-a", "lettuce")).toBe(true);
    tainted.phase = "aftermath";
    taintedService.continueAftermath(tainted);
    tainted.story.greenTide!.plotContamination["plot-a"] = 2;
    expect(taintedService.harvestCrop(tainted, "plot-a")).toBe(true);
    expect(
      [...tainted.quests.eventHistory].reverse().find(
        (event) => event.operation === "crop.harvest",
      ),
    ).toMatchObject({
      growthProvenance: "grown-in-this-run",
      healthy: false,
    });
    expect(tainted.story.greenTide!.plotContamination["plot-a"]).toBe(0);
    expect(tainted.quests.missions["CH-03"]?.lifecycle).not.toBe("completed");
  });

  it("records a successful manual counter before night resolution and completes CH-04", () => {
    const service = new RunService();
    const run = createRun("observer-manual", "R01");
    run.day = 2;
    run.phase = "night";
    run.activeContact = {
      id: "canonical-t006-contact",
      definitionId: "T006",
      stage: "approach",
      secondsLeft: 20,
      wave: 1,
      totalWaves: 1,
    };
    const interaction = service.ensureThreatInteraction(run) as Extract<
      ThreatInteractionState,
      { kind: "T006" }
    >;
    const command = interaction.mode === "leaf" ? "trace:leaves" : "trace:meter";
    expect(service.interactThreat(run, command).resolved).toBe(true);

    const counterEvent = run.quests.eventHistory.find(
      (event) => event.operation === "counter.deploy",
    );
    expect(counterEvent).toMatchObject({ method: "manual", result: "success" });
    expect(run.quests.missions["CH-04"]).toMatchObject({
      lifecycle: "completed",
      result: "completed",
    });
    const counterIndex = run.quests.eventHistory.indexOf(counterEvent!);
    const nightIndex = run.quests.eventHistory.findIndex(
      (event) => event.type === "night.resolved" && event.day === 2,
    );
    expect(nightIndex).toBeGreaterThan(counterIndex);
  });

  it("does not treat a prep-only greenhouse cycle settlement as a threat counter", () => {
    const service = new RunService();
    const run = createRun("observer-prep-cycle", "R03");
    run.phase = "prep";
    expect(service.applyGreenCycleCommand(run, "cycle:manual-drain").status).toBe(
      "resolved",
    );
    expect(
      run.quests.eventHistory.some(
        (event) =>
          event.type === "action.committed" &&
          event.operation === "counter.deploy",
      ),
    ).toBe(false);
    expect(run.quests.missions["TUT-05"]?.progress[0]?.count).toBe(0);
  });

  it("holds Day 7 facts until a final decision, then orders night, main, and end exactly once", () => {
    const service = new RunService();
    const run = createRun("observer-day-seven", "R01");

    // Canonical finale fixture: the prior six nights and the first two Day 7 waves
    // are complete; all remaining transitions use public RunService operations.
    run.day = 7;
    run.phase = "night";
    run.story.finaleStage = "contact";
    run.story.completedContactWaves = 2;
    run.activeContact = {
      id: "canonical-day7-wave3",
      definitionId: "T002",
      stage: "approach",
      secondsLeft: 20,
      wave: 3,
      totalWaves: 3,
    };
    run.voyage!.nightStartWakeups = run.survivor.wakeups;

    expect(service.counterThreat(run, "close-shutter")).toBe(true);
    expect(run.activeEventId).toBe("EV050");
    expect(eventTypes(run)).not.toContain("night.resolved");
    expect(eventTypes(run)).not.toContain("run.ended");

    const identityEvent = service.getEvent(run)!;
    expect(service.resolveEvent(run, identityEvent.choices.find((choice) => choice.id === "inspect")!)).toBe(true);
    expect(run.activeEventId).toBe("EV051");
    expect(eventTypes(run)).not.toContain("night.resolved");

    const decisionEvent = service.getEvent(run)!;
    expect(service.resolveEvent(run, decisionEvent.choices.find((choice) => choice.id === "open")!)).toBe(true);
    expect(run.story.finalDecision).toBe("open");
    expect(run.story.endingId).toBeTruthy();
    expect(run.activeEventId).toBe("EV052");
    expect(eventTypes(run)).toContain("night.resolved");
    expect(
      run.quests.eventHistory.some(
        (event) =>
          event.type === "story.milestone" && event.milestoneId === "R01.N07",
      ),
    ).toBe(true);
    expect(eventTypes(run)).not.toContain("run.ended");

    const epilogue = service.getEvent(run)!;
    expect(service.resolveEvent(run, epilogue.choices.find((choice) => choice.id === "truth")!)).toBe(true);
    expect(run).toMatchObject({ day: 7, ended: true, outcome: "victory" });
    const nightIndex = run.quests.eventHistory.findIndex(
      (event) => event.type === "night.resolved" && event.day === 7,
    );
    const mainIndex = run.quests.eventHistory.findIndex(
      (event) => event.type === "story.milestone" && event.milestoneId === "R01.N07",
    );
    const endIndex = run.quests.eventHistory.findIndex(
      (event) => event.type === "run.ended",
    );
    expect(nightIndex).toBeGreaterThanOrEqual(0);
    expect(mainIndex).toBeGreaterThan(nightIndex);
    expect(endIndex).toBeGreaterThan(mainIndex);
    expect(run.quests.missions["MAIN-R01-N07"]).toMatchObject({
      lifecycle: "completed",
      result: "completed",
    });
    const unfinishedAtOrBeforeDaySeven = QUEST_CATALOG.filter(
      (definition) =>
        definition.routes.includes("R01") &&
        definition.deadline.afterNight <= 7 &&
        ["locked", "available", "active"].includes(
          run.quests.missions[definition.id]!.lifecycle,
        ),
    );
    expect(unfinishedAtOrBeforeDaySeven).toEqual([]);

    const sequence = run.quests.sequence;
    flushRunFacts(run);
    flushRunFacts(run);
    expect(run.quests.sequence).toBe(sequence);
    expect(run.quests.eventHistory.filter((event) => event.type === "night.resolved" && event.day === 7)).toHaveLength(1);
    expect(run.quests.eventHistory.filter((event) => event.type === "run.ended")).toHaveLength(1);
  });
});
