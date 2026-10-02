import { describe, expect, it } from "vitest";
import { createRun } from "../src/game/model";
import { cropStageForGrowthNights, CROPS } from "../src/game/content";
import {
  commitFacilityUpgrade,
  getFacilityEffects,
  moduleSlotCompatibility,
  previewFacilityUpgrade,
  repairFunctionalModuleSlots,
} from "../src/game/facility-slots";
import {
  CHALLENGE_SUMMARIES,
  FACILITY_UPGRADES,
  REFILL_ACTIONS,
  RELATIONSHIPS,
  RESOURCE_WARNING_RULES,
  ROUTE_TRADEOFFS,
} from "../src/game/voyage/content";
import {
  availableExpeditions,
  availableRefillActions,
  availableRelationships,
  chooseExpeditionStep,
  commitRefillAction,
  createVoyageState,
  getRouteTradeoff,
  recordInspectedId,
  recordNightStart,
  recordNightSummary,
  resourceWarnings,
  resolveRelationshipChoice,
  startExpedition,
  withdrawExpedition,
} from "../src/game/voyage/engine";
import type { VoyageRunInput, VoyageState } from "../src/game/voyage/types";

function input(seed = "voyage-v2", day = 2): VoyageRunInput {
  const run = createRun(seed, "R01");
  run.day = day;
  run.phase = "prep";
  return { ...run, voyage: createVoyageState() };
}

function adopt(run: VoyageRunInput, stateDraft: VoyageState): VoyageRunInput {
  return { ...run, voyage: stateDraft };
}

describe("v2 stop expeditions", () => {
  it("allows only one stop per day and fixes the seeded expedition identity", () => {
    const firstRun = input("fixed-stop", 2);
    const first = startExpedition(firstRun, "fog-relay");
    const replay = startExpedition(firstRun, "fog-relay");
    expect(first.ok).toBe(true);
    expect(first.eventPayload?.expeditionId).toBe(replay.eventPayload?.expeditionId);

    const adopted = adopt(firstRun, first.stateDraft);
    expect(startExpedition(adopted, "fog-service-siding").ok).toBe(false);
    expect(availableExpeditions(adopted).every((site) => !site.available)).toBe(true);
  });

  it("keeps found supplies on withdrawal and prevents a same-day reroll", () => {
    let run = input("withdraw-keeps-loot", 2);
    const started = startExpedition(run, "fog-relay");
    run = adopt(run, started.stateDraft);
    const observed = chooseExpeditionStep(run, "survey");
    expect(observed.resourceDelta).toEqual({ data: 1 });
    run = adopt(run, observed.stateDraft);
    const toolStep = chooseExpeditionStep(run, "improvise");
    expect(toolStep.resourceDelta).toEqual({ data: 1 });
    run = adopt(run, toolStep.stateDraft);
    const withdrawn = withdrawExpedition(run);

    expect(withdrawn.ok).toBe(true);
    expect(withdrawn.resourceDelta).toEqual({});
    expect(withdrawn.stateDraft.expeditions[0]?.collected).toEqual({ data: 2 });
    expect(withdrawn.eventPayload).toMatchObject({ result: "partial", status: "withdrawn" });
    expect(startExpedition(adopt(run, withdrawn.stateDraft), "fog-relay").ok).toBe(false);
  });

  it("settles deep-dive risk from the stored roll and cannot settle twice", () => {
    let run = input("deep-risk", 2);
    run = adopt(run, startExpedition(run, "fog-relay").stateDraft);
    run = adopt(run, chooseExpeditionStep(run, "survey").stateDraft);
    run = adopt(run, chooseExpeditionStep(run, "improvise").stateDraft);
    const settled = chooseExpeditionStep(run, "deep-dive");

    expect(settled.ok).toBe(true);
    expect(settled.eventPayload?.settlementId).toMatch(/^v2-/);
    expect(settled.stateDraft.expeditions).toHaveLength(1);
    expect(chooseExpeditionStep(adopt(run, settled.stateDraft), "deep-dive").ok).toBe(false);
  });
});

describe("v2 crop balance", () => {
  it("creates real one, three, and two-night crop tradeoffs", () => {
    expect(CROPS.map(({ id, days, yield: food }) => ({ id, days, food }))).toEqual([
      { id: "lettuce", days: 1, food: 2 },
      { id: "tomato", days: 3, food: 4 },
      { id: "herb", days: 2, food: 1 },
    ]);
    expect(cropStageForGrowthNights("lettuce", 1)).toBe(3);
    expect(cropStageForGrowthNights("tomato", 2)).toBe(2);
    expect(cropStageForGrowthNights("tomato", 3)).toBe(3);
    expect(cropStageForGrowthNights("herb", 2)).toBe(3);
  });
});

describe("v2 daily decision records", () => {
  it("keeps route, refill, and depletion choices materially different", () => {
    expect(ROUTE_TRADEOFFS).toHaveLength(3);
    expect(new Set(ROUTE_TRADEOFFS.map((route) => route.fuelCost)).size).toBe(3);
    expect(ROUTE_TRADEOFFS.find((route) => route.nodeId === "RN02")?.environmentDelta).toEqual({ noise: 6 });
    expect(REFILL_ACTIONS.every((action) => action.apCost > 0 && Object.values(action.cost).some((cost) => cost < 0))).toBe(true);
    expect(RESOURCE_WARNING_RULES.map((warning) => warning.key)).toContain("parts");
    expect(getRouteTradeoff("RN01", 2)?.contactDelta).toBe(0);
    expect(getRouteTradeoff("RN01", 3)?.contactDelta).toBe(1);
    const run = input("refill-action", 2);
    run.resources.energy = 10;
    expect(resourceWarnings(run)).toContain("繼續耗電可能失去生命維持與反制能力。");
    expect(availableRefillActions(run).find((action) => action.id === "refill-battery")?.available).toBe(true);
    const refill = commitRefillAction(run, "refill-battery");
    expect(refill).toMatchObject({ ok: true, apCost: 1, resourceDelta: { parts: -2, energy: 15 } });
    expect(commitRefillAction(adopt(run, refill.stateDraft), "refill-battery").ok).toBe(false);
  });

  it("persists night summaries and object inspection without duplicate settlement", () => {
    let voyage = recordNightStart(createVoyageState(), 2);
    voyage = recordNightSummary(voyage, {
      day: 2,
      wakeupsDelta: 0,
      passengerAlive: true,
      hullPositive: true,
      reservePositive: true,
      lifeSupportPowered: true,
      manualCounter: false,
    });
    voyage = recordNightSummary(voyage, {
      day: 2,
      wakeupsDelta: 4,
      passengerAlive: false,
      hullPositive: false,
      reservePositive: false,
      lifeSupportPowered: false,
      manualCounter: true,
    });
    voyage = recordInspectedId(recordInspectedId(voyage, "sleep:bed"), "sleep:bed");
    expect(voyage.nightSummaries).toHaveLength(1);
    expect(voyage.nightSummaries[0]?.wakeupsDelta).toBe(0);
    expect(voyage.lastSettledDay).toBe(2);
    expect(voyage.inspectedIds).toEqual(["sleep:bed"]);
  });
});

describe("v2 relationship and facility content", () => {
  it("ships five choices for each relationship chain without changing story consent", () => {
    expect(RELATIONSHIPS.filter((step) => step.npcId === "A-07")).toHaveLength(5);
    expect(RELATIONSHIPS.filter((step) => step.npcId === "xu")).toHaveLength(5);
    const run = input("a07-choice", 2);
    expect(availableRelationships(run).map((step) => step.npcId)).toEqual(["A-07", "xu"]);
    const resolved = resolveRelationshipChoice(run, "A-07", "ask-details");
    expect(resolved.ok).toBe(true);
    expect(resolved.eventPayload).toMatchObject({
      npcId: "A-07",
      result: "success",
      storyConsentChanged: false,
      mainStoryBranchChanged: false,
    });
  });

  it("commits one of each mutually exclusive facility pair with costs and scene state", () => {
    const run = input("facility-pair", 3);
    run.resources.parts = 20;
    expect(FACILITY_UPGRADES).toHaveLength(8);
    expect(previewFacilityUpgrade(run, "power-core", "quiet")).toMatchObject({ ok: true, partsCost: 4, apCost: 2 });
    const quiet = commitFacilityUpgrade(run, "power-core", "quiet");
    expect(quiet).toMatchObject({ ok: true, resourceDelta: { parts: -4 }, apCost: 2 });
    expect(quiet.eventPayload).toMatchObject({
      facilityId: "power-core",
      upgradeId: "quiet-wiring",
      branchGroup: "core-output",
      branchChoice: "quiet",
      sceneState: "power-core-quiet-wiring",
    });
    const incompatible = commitFacilityUpgrade(adopt(run, quiet.stateDraft), "power-core", "burst");
    expect(incompatible.ok).toBe(false);
    expect(incompatible.message).toContain("互斥");
    expect(getFacilityEffects(quiet.stateDraft).nightNoiseDelta).toBe(-4);
  });

  it("keeps functional module slots separate and preserves incompatible legacy modules", () => {
    expect(moduleSlotCompatibility("M002", "sleep-floor")).toBe(true);
    expect(moduleSlotCompatibility("M002", "defense-window")).toBe(false);
    const assignments = repairFunctionalModuleSlots([
      { id: "old-1", definitionId: "UNKNOWN", slotId: "decoration-shelf", active: true, powered: true, durability: 100, mk: 1 },
    ]);
    expect(assignments).toEqual([
      expect.objectContaining({ moduleId: "old-1", slotId: "decoration-shelf", legacy: true, compatible: false }),
    ]);
  });

  it("publishes all six challenge summaries", () => {
    expect(CHALLENGE_SUMMARIES.map((challenge) => challenge.id)).toEqual([
      "CH-01", "CH-02", "CH-03", "CH-04", "CH-05", "CH-06",
    ]);
  });
});
