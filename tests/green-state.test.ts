import { describe, expect, it } from "vitest";
import { createRun } from "../src/game/model";
import { parseRun } from "../src/game/save";
import {
  applyGreenBranch,
  createDefaultGreenTideState,
  evaluateGreenEnding,
} from "../src/game/story";
import type {
  GreenFinalDecision,
  GreenEndingId,
  ThreatContact,
} from "../src/game/types";

describe("R03 green-tide state", () => {
  it("creates independent schema-5 R03 runs without leaking R01 or R02 state", () => {
    const first = createRun("green-default-one", "R03");
    const second = createRun("green-default-two", "R03");

    expect(first).toMatchObject({
      schemaVersion: 5,
      routeId: "R03",
      resources: { water: 8 },
      story: {
        version: 3,
        whiteFrost: null,
        greenTide: {
          version: 1,
          branch: null,
          finaleStage: "inactive",
          seedStock: 4,
          reservoirContamination: 0,
          plotContamination: { "plot-a": 0, "plot-b": 0 },
          isolatedPlots: [],
          cycle: {
            selectedSampleId: null,
            committedDay: null,
            settlementIds: [],
            revision: 0,
            attempts: 0,
            firstMissRevealed: false,
            manualDrainAvailable: false,
          },
        },
      },
    });
    expect(first.story.greenTide?.cycle.samples).toEqual([
      { id: "S1", quality: "unknown", revealed: false, zone: "INTAKE" },
      { id: "S2", quality: "unknown", revealed: false, zone: "INTAKE" },
      { id: "S3", quality: "unknown", revealed: false, zone: "INTAKE" },
      { id: "S4", quality: "unknown", revealed: false, zone: "INTAKE" },
    ]);

    first.story.greenTide!.cycle.samples[0]!.zone = "FILTER";
    first.story.greenTide!.isolatedPlots.push("plot-a");
    expect(second.story.greenTide?.cycle.samples[0]?.zone).toBe("INTAKE");
    expect(second.story.greenTide?.isolatedPlots).toEqual([]);
    expect(() => JSON.stringify(first)).not.toThrow();
  });

  it("applies a permanent green branch immutably and resets its operation gate", () => {
    const original = createDefaultGreenTideState();
    original.branchOperationComplete = true;

    const branched = applyGreenBranch(original, "FILTER");
    expect(branched).not.toBe(original);
    expect(branched).toMatchObject({
      branch: "FILTER",
      branchOperationComplete: false,
    });
    expect(original).toMatchObject({
      branch: null,
      branchOperationComplete: true,
    });

    branched.branchOperationComplete = true;
    expect(applyGreenBranch(branched, "CULTIVATE")).toMatchObject({
      branch: "FILTER",
      branchOperationComplete: true,
    });
  });

  it("maps all four final decisions and preserves an already locked ending", () => {
    const endingByDecision: Record<GreenFinalDecision, GreenEndingId> = {
      seedbank: "green-seedbank",
      symbiosis: "green-symbiosis",
      firebreak: "green-firebreak",
      quarantine: "green-quarantine",
    };

    for (const [decision, endingId] of Object.entries(
      endingByDecision,
    ) as Array<[GreenFinalDecision, GreenEndingId]>) {
      const run = createRun(`green-ending-${decision}`, "R03");
      expect(evaluateGreenEnding(run, decision)).toMatchObject({ endingId });
    }

    const locked = createRun("green-ending-locked", "R03");
    locked.story.greenTide!.endingId = "green-quarantine";
    locked.story.greenTide!.endingReasons = [
      "locked ending remains authoritative",
    ];
    expect(evaluateGreenEnding(locked, "seedbank")).toEqual({
      endingId: "green-quarantine",
      reasons: ["locked ending remains authoritative"],
    });
  });

  it("deep-repairs corrupt R03 enums, bounds, samples and duplicate arrays", () => {
    const raw = JSON.parse(
      JSON.stringify(createRun("green-corrupt", "R03")),
    ) as Record<string, any>;
    Object.assign(raw.story.greenTide, {
      branch: "OVERGROW",
      finaleStage: "escape",
      seedStock: -8,
      reservoirContamination: 999,
      plotContamination: { "plot-a": -2, "plot-b": 140 },
      isolatedPlots: ["plot-a", "plot-a", "plot-c"],
      finalDecision: "abandon",
      endingId: "green-impossible",
    });
    Object.assign(raw.story.greenTide.cycle, {
      selectedSampleId: "S9",
      committedDay: 99,
      settlementIds: ["cycle:R03:D1:UNSET", "cycle:R03:D1:UNSET", 7],
      revision: -4,
      attempts: -2,
    });
    Object.assign(raw.story.greenTide.cycle.samples[0], {
      quality: "toxic",
      revealed: true,
      zone: "VOID",
    });

    const restored = parseRun(JSON.stringify(raw));
    expect(restored?.story.whiteFrost).toBeNull();
    expect(restored?.story.greenTide).toMatchObject({
      version: 1,
      branch: null,
      finaleStage: "inactive",
      seedStock: 0,
      reservoirContamination: 100,
      plotContamination: { "plot-a": 0, "plot-b": 100 },
      isolatedPlots: ["plot-a"],
      finalDecision: null,
      endingId: null,
      cycle: {
        selectedSampleId: null,
        committedDay: null,
        settlementIds: ["cycle:R03:D1:UNSET"],
        revision: 0,
        attempts: 0,
      },
    });
    expect(restored?.story.greenTide?.cycle.samples[0]).toEqual({
      id: "S1",
      quality: "unknown",
      revealed: false,
      zone: "INTAKE",
    });
  });

  it("round-trips T008 and T013 checkpoints and safely repairs invalid T008 zones", () => {
    const t008Run = createRun("green-t008-checkpoint", "R03");
    t008Run.activeContact = {
      id: "contact-4-2",
      definitionId: "T008",
      stage: "warning",
      secondsLeft: 7,
      interaction: {
        kind: "T008",
        targetZone: "UNDERBED",
        inspectedZones: ["CANOPY", "FILTER"],
        attempts: 1,
        firstMissRevealed: true,
        manualFallbackAvailable: true,
      },
    };
    expect(parseRun(JSON.stringify(t008Run))?.activeContact).toEqual(
      t008Run.activeContact,
    );

    const t013Run = createRun("green-t013-checkpoint", "R03");
    t013Run.activeContact = {
      id: "contact-7-1",
      definitionId: "T013",
      stage: "warning",
      secondsLeft: 8,
      interaction: {
        kind: "T013",
        contaminatedSampleIds: ["S2", "S4"],
        inspectedSampleIds: ["S2"],
        attempts: 1,
        firstMissRevealed: true,
        manualFallbackAvailable: true,
      },
    };
    expect(parseRun(JSON.stringify(t013Run))?.activeContact).toEqual(
      t013Run.activeContact,
    );

    const corrupt = JSON.parse(JSON.stringify(t008Run)) as Record<string, any>;
    Object.assign(corrupt.activeContact.interaction, {
      targetZone: "VOID",
      inspectedZones: ["FILTER", "FILTER", "VOID"],
      attempts: -4,
      resolvedBy: "teleport",
    });
    const repaired = parseRun(JSON.stringify(corrupt))?.activeContact as
      ThreatContact | undefined;
    expect(repaired?.interaction).toEqual({
      kind: "T008",
      targetZone: "CANOPY",
      inspectedZones: ["FILTER"],
      attempts: 0,
      firstMissRevealed: true,
      manualFallbackAvailable: true,
    });
  });

  it("normalizes stale route-specific substates to the selected route", () => {
    const r01 = createRun("green-stale-r01", "R01");
    r01.story.greenTide = createDefaultGreenTideState();
    r01.story.whiteFrost = createRun(
      "green-stale-frost",
      "R02",
    ).story.whiteFrost;
    expect(parseRun(JSON.stringify(r01))?.story).toMatchObject({
      whiteFrost: null,
      greenTide: null,
    });

    const r02 = createRun("green-stale-r02", "R02");
    r02.story.greenTide = createDefaultGreenTideState();
    expect(parseRun(JSON.stringify(r02))?.story).toMatchObject({
      whiteFrost: expect.any(Object),
      greenTide: null,
    });

    const r03 = createRun("green-stale-r03", "R03");
    r03.story.whiteFrost = createRun(
      "green-stale-r03-frost",
      "R02",
    ).story.whiteFrost;
    expect(parseRun(JSON.stringify(r03))?.story).toMatchObject({
      whiteFrost: null,
      greenTide: expect.any(Object),
    });
  });
});
