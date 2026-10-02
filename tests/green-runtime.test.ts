import { describe, expect, it } from "vitest";
import { createRun } from "../src/game/model";
import { parseRun } from "../src/game/save";
import { RunService } from "../src/game/services";
import type {
  GreenCycleZone,
  GreenSampleId,
  GreenTideState,
  LurkerZone,
  RunState,
} from "../src/game/types";

function greenTide(run: RunState): GreenTideState {
  if (!run.story.greenTide) throw new Error("Expected an R03 green-tide state");
  return run.story.greenTide;
}

function inspectAllSamples(run: RunState, service: RunService): void {
  for (const sampleId of ["S1", "S2", "S3", "S4"] as GreenSampleId[]) {
    expect(
      service.applyGreenCycleCommand(run, `cycle:inspect:${sampleId}`).accepted,
    ).toBe(true);
  }
}

function routeSamplesSafely(run: RunState, service: RunService): void {
  let cleanIndex = 0;
  for (const sample of greenTide(run).cycle.samples) {
    const zone: GreenCycleZone =
      sample.quality === "tainted"
        ? "FILTER"
        : cleanIndex++ === 0
          ? "GROW_A"
          : "GROW_B";
    expect(
      service.applyGreenCycleCommand(run, `cycle:move:${sample.id}:${zone}`)
        .accepted,
    ).toBe(true);
  }
}

describe("authoritative R03 cycle board", () => {
  it("creates a route-local state with deterministic hidden samples", () => {
    const first = createRun("green-state", "R03");
    const second = createRun("green-state", "R03");
    const service = new RunService();

    expect(first).toMatchObject({
      schemaVersion: 6,
      routeId: "R03",
      resources: { water: 8 },
      story: { version: 3, whiteFrost: null },
    });
    expect(greenTide(first)).toMatchObject({
      branch: null,
      seedStock: 4,
      reservoirContamination: 0,
      finalDecision: null,
    });

    inspectAllSamples(first, service);
    inspectAllSamples(second, service);
    expect(greenTide(first).cycle.samples).toEqual(
      greenTide(second).cycle.samples,
    );
    expect(
      greenTide(first).cycle.samples.filter(
        (sample) => sample.quality === "tainted",
      ),
    ).toHaveLength(2);
    expect(
      greenTide(first).cycle.samples.filter(
        (sample) => sample.quality === "clean",
      ),
    ).toHaveLength(2);
  });

  it("supports direct drag and select-then-target through the same validator", () => {
    const direct = createRun("green-move", "R03");
    const tapped = createRun("green-move", "R03");
    const directService = new RunService();
    const tappedService = new RunService();

    expect(
      directService.applyGreenCycleCommand(direct, "cycle:move:S1:FILTER")
        .accepted,
    ).toBe(true);
    expect(
      tappedService.applyGreenCycleCommand(tapped, "cycle:select:S1").accepted,
    ).toBe(true);
    expect(
      tappedService.applyGreenCycleCommand(tapped, "cycle:target:FILTER")
        .accepted,
    ).toBe(true);

    expect(greenTide(direct).cycle.samples).toEqual(
      greenTide(tapped).cycle.samples,
    );
    expect(greenTide(direct).cycle.revision).toBe(1);
    expect(greenTide(tapped).cycle.revision).toBe(1);
  });

  it("reveals the first unsafe submission, penalizes the second, and keeps a fallback", () => {
    const run = createRun("green-first-miss", "R03");
    const service = new RunService();
    const before = {
      infection: run.survivor.infection,
      contamination: greenTide(run).reservoirContamination,
    };

    expect(service.applyGreenCycleCommand(run, "cycle:commit")).toMatchObject({
      status: "revealed",
      accepted: true,
      settled: false,
    });
    expect(run.survivor.infection).toBe(before.infection);
    expect(greenTide(run).reservoirContamination).toBe(before.contamination);
    expect(greenTide(run).cycle.manualDrainAvailable).toBe(true);

    expect(service.applyGreenCycleCommand(run, "cycle:commit")).toMatchObject({
      status: "invalid",
      accepted: true,
      settled: false,
    });
    expect(run.survivor.infection).toBe(before.infection + 2);
    expect(greenTide(run).reservoirContamination).toBe(
      before.contamination + 5,
    );
  });

  it("settles a safe configuration exactly once", () => {
    const run = createRun("green-idempotent", "R03");
    const service = new RunService();
    inspectAllSamples(run, service);
    routeSamplesSafely(run, service);

    const first = service.applyGreenCycleCommand(run, "cycle:commit");
    expect(first).toMatchObject({
      status: "resolved",
      accepted: true,
      settled: true,
    });
    expect(first.settlementId).toBe("cycle:R03:D1:UNSET");
    const afterFirst = JSON.stringify({
      resources: run.resources,
      survivor: run.survivor,
      green: run.story.greenTide,
      crops: run.crops,
      ledger: run.ledger,
    });

    expect(service.applyGreenCycleCommand(run, "cycle:commit")).toMatchObject({
      status: "duplicate",
      accepted: false,
      settled: false,
    });
    expect(
      JSON.stringify({
        resources: run.resources,
        survivor: run.survivor,
        green: run.story.greenTide,
        crops: run.crops,
        ledger: run.ledger,
      }),
    ).toBe(afterFirst);
  });

  it("keeps manual drain resource-independent and once-only", () => {
    const run = createRun("green-manual", "R03");
    const service = new RunService();
    run.crops[0]!.cropId = "lettuce";
    run.crops[0]!.stage = 2;
    const stressBefore = run.survivor.stress;

    expect(
      service.applyGreenCycleCommand(run, "cycle:manual-drain"),
    ).toMatchObject({
      status: "resolved",
      settled: true,
    });
    expect(
      greenTide(run).cycle.samples.every((sample) => sample.zone === "DRAIN"),
    ).toBe(true);
    expect(run.crops[0]!.stage).toBe(1);
    expect(run.survivor.stress).toBe(stressBefore + 5);

    const stageAfter = run.crops[0]!.stage;
    const stressAfter = run.survivor.stress;
    expect(
      service.applyGreenCycleCommand(run, "cycle:manual-drain").status,
    ).toBe("duplicate");
    expect(run.crops[0]!.stage).toBe(stageAfter);
    expect(run.survivor.stress).toBe(stressAfter);
  });

  it("does not restore the free first miss when T013 is reset", () => {
    const run = createRun("green-t013-reset-guard", "R03");
    const service = new RunService();
    run.day = 7;
    greenTide(run).finaleStage = "contact";
    service.beginNight(run);
    expect(run.activeContact?.definitionId).toBe("T013");
    const before = {
      infection: run.survivor.infection,
      contamination: greenTide(run).reservoirContamination,
    };

    expect(service.interactThreat(run, "cycle:commit")).toMatchObject({
      status: "accepted",
      accepted: true,
      resolved: false,
    });
    expect(run.survivor.infection).toBe(before.infection);
    expect(greenTide(run).reservoirContamination).toBe(before.contamination);
    expect(service.interactThreat(run, "cycle:reset").accepted).toBe(true);

    expect(service.interactThreat(run, "cycle:commit")).toMatchObject({
      status: "invalid",
      accepted: true,
      resolved: false,
    });
    expect(run.survivor.infection).toBe(before.infection + 4);
    expect(greenTide(run).reservoirContamination).toBe(
      before.contamination + 15,
    );
    expect(greenTide(run).cycle.attempts).toBe(2);
  });
});

describe("R03 threats, branch, and finale", () => {
  it("keeps T013 independently playable after a Day 7 preparation settlement", () => {
    const run = createRun("green-day7-prep-then-t013", "R03");
    const service = new RunService();
    run.day = 7;
    run.phase = "prep";
    inspectAllSamples(run, service);
    routeSamplesSafely(run, service);
    expect(service.applyGreenCycleCommand(run, "cycle:commit")).toMatchObject({
      status: "resolved",
      settled: true,
      settlementId: "cycle:R03:D7:UNSET",
    });

    greenTide(run).finaleStage = "contact";
    service.beginNight(run);
    expect(run.activeContact?.definitionId).toBe("T013");
    const interaction = service.ensureThreatInteraction(run);
    if (interaction?.kind !== "T013") throw new Error("Expected T013");
    expect(
      greenTide(run).cycle.samples.filter(
        (sample) => sample.quality === "tainted",
      ),
    ).toHaveLength(2);

    for (const sampleId of interaction.contaminatedSampleIds) {
      expect(
        service.interactThreat(run, `cycle:inspect:${sampleId}`).accepted,
      ).toBe(true);
    }
    for (const sample of greenTide(run).cycle.samples) {
      const zone = sample.quality === "tainted" ? "FILTER" : "DRAIN";
      expect(
        service.interactThreat(run, `cycle:move:${sample.id}:${zone}`).accepted,
      ).toBe(true);
    }
    const threatSettlement = service.interactThreat(run, "cycle:commit");
    expect(threatSettlement).toMatchObject({ accepted: true, resolved: true });
    expect(run.activeContact?.definitionId).toBe("T008");
    expect(
      greenTide(run).cycle.settlementIds.some((id) =>
        id.startsWith("cycle:R03:D7:UNSET:T013:contact-7-1"),
      ),
    ).toBe(true);
  });

  it("runs the fixed Day 7 T013 then T008 sequence into the four-choice event", () => {
    const run = createRun("green-finale-sequence", "R03");
    const service = new RunService();
    run.day = 7;
    greenTide(run).finaleStage = "contact";
    service.beginNight(run);

    expect(run.activeContact?.definitionId).toBe("T013");
    const t013 = service.ensureThreatInteraction(run);
    if (t013?.kind !== "T013") throw new Error("Expected T013 first");

    for (const sampleId of t013.contaminatedSampleIds) {
      expect(
        service.interactThreat(run, `cycle:inspect:${sampleId}`).accepted,
      ).toBe(true);
    }
    for (const sample of greenTide(run).cycle.samples) {
      const zone = sample.quality === "tainted" ? "FILTER" : "DRAIN";
      expect(
        service.interactThreat(run, `cycle:move:${sample.id}:${zone}`).accepted,
      ).toBe(true);
    }
    expect(service.interactThreat(run, "cycle:commit").resolved).toBe(true);
    expect(run.activeContact?.definitionId).toBe("T008");

    const t008 = service.ensureThreatInteraction(run);
    if (t008?.kind !== "T008") throw new Error("Expected T008 second");
    expect(
      service.interactThreat(run, `lurker:inspect:${t008.targetZone}`).accepted,
    ).toBe(true);
    expect(
      service.interactThreat(run, `lurker:mark:${t008.targetZone}`).resolved,
    ).toBe(true);

    expect(run.phase).toBe("travel");
    expect(run.activeEventId).toBe("EV078");
    expect(greenTide(run).finaleStage).toBe("decision");
    expect(service.getEvent(run)?.choices.map((choice) => choice.id)).toEqual([
      "seedbank",
      "symbiosis",
      "firebreak",
      "quarantine",
    ]);
  });

  it("makes the first T008 wrong mark harmless and enables the visible manual seal", () => {
    const run = createRun("green-lurker-miss", "R03");
    const service = new RunService();
    run.day = 7;
    greenTide(run).finaleStage = "contact";
    service.beginNight(run);
    run.activeContact = {
      id: "contact-7-2",
      definitionId: "T008",
      stage: "warning",
      secondsLeft: 10,
      wave: 2,
      totalWaves: 2,
    };
    const interaction = service.ensureThreatInteraction(run);
    if (interaction?.kind !== "T008") throw new Error("Expected T008");
    const wrongZone = (["CANOPY", "FILTER", "UNDERBED"] as LurkerZone[]).find(
      (zone) => zone !== interaction.targetZone,
    )!;
    const before = {
      infection: run.survivor.infection,
      stress: run.survivor.stress,
      hull: run.environment.hull,
    };

    service.interactThreat(run, `lurker:inspect:${wrongZone}`);
    expect(
      service.interactThreat(run, `lurker:mark:${wrongZone}`),
    ).toMatchObject({
      status: "incorrect",
      accepted: true,
      resolved: false,
    });
    expect(run.survivor.infection).toBe(before.infection);
    expect(run.survivor.stress).toBe(before.stress);
    expect(interaction.manualFallbackAvailable).toBe(true);

    expect(service.interactThreat(run, "lurker:manual-seal").resolved).toBe(
      true,
    );
    expect(run.environment.hull).toBe(before.hull - 4);
    expect(run.survivor.stress).toBe(before.stress + 5);
    expect(run.activeEventId).toBe("EV078");
  });

  it("applies an irreversible branch and settles the quarantine ending once", () => {
    const run = createRun("green-branch-ending", "R03");
    const service = new RunService();
    run.day = 4;
    run.phase = "route";
    run.activeEventId = "EV072";
    const branchChoice = service
      .getEvent(run)
      ?.choices.find((choice) => choice.id === "FILTER");
    expect(service.resolveEvent(run, branchChoice!)).toBe(true);
    expect(greenTide(run).branch).toBe("FILTER");
    const resourcesAfterBranch = { ...run.resources };
    run.activeEventId = "EV072";
    const overwriteChoice = service
      .getEvent(run)
      ?.choices.find((choice) => choice.id === "CULTIVATE");
    expect(service.resolveEvent(run, overwriteChoice!)).toBe(false);
    expect(greenTide(run).branch).toBe("FILTER");
    expect(run.resources).toEqual(resourcesAfterBranch);

    run.day = 7;
    run.phase = "travel";
    run.activeEventId = "EV078";
    greenTide(run).finaleStage = "decision";
    greenTide(run).sourceLocated = true;
    greenTide(run).branchOperationComplete = true;
    const endingChoice = service
      .getEvent(run)
      ?.choices.find((choice) => choice.id === "quarantine");
    expect(service.resolveEvent(run, endingChoice!)).toBe(true);
    expect(run).toMatchObject({
      phase: "ending",
      ended: true,
      outcome: "victory",
    });
    expect(greenTide(run)).toMatchObject({
      finalDecision: "quarantine",
      endingId: "green-quarantine",
      rewardSettled: true,
    });
    expect(
      run.ledger.filter((entry) => entry.source === "story.R03.route-complete"),
    ).toHaveLength(1);
    expect(service.resolveEvent(run, endingChoice!)).toBe(false);
    expect(
      run.ledger.filter((entry) => entry.source === "story.R03.route-complete"),
    ).toHaveLength(1);
  });

  it("rejects a schema 6 save that injects EV078 before the Day 7 lifecycle", () => {
    const forged = createRun("green-forged-ending", "R03");
    forged.phase = "travel";
    forged.activeEventId = "EV078";
    const run = parseRun(JSON.stringify(forged));
    if (!run) throw new Error("Expected parsed run");
    const service = new RunService();
    const choice = service
      .getEvent(run)
      ?.choices.find((candidate) => candidate.id === "quarantine");

    expect(service.resolveEvent(run, choice!)).toBe(false);
    expect(run.ended).toBe(false);
    expect(greenTide(run)).toMatchObject({
      finaleStage: "inactive",
      finalDecision: null,
      rewardSettled: false,
    });
    expect(
      run.ledger.filter((entry) => entry.source === "story.R03.route-complete"),
    ).toHaveLength(0);
  });
});
