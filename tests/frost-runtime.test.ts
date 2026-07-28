import { describe, expect, it } from "vitest";
import { FROST_STORY_EVENTS } from "../src/game/content";
import { createRun } from "../src/game/model";
import { parseRun } from "../src/game/save";
import { RunService } from "../src/game/services";
import type {
  FrostBranch,
  FrostZone,
  RunState,
  T004InteractionState,
  T009InteractionState,
  WhiteFrostState,
} from "../src/game/types";

const FROST_ZONES: FrostZone[] = ["BERTH", "DEICER", "LOOP"];

function whiteFrost(run: RunState): WhiteFrostState {
  if (!run.story.whiteFrost)
    throw new Error("Expected an R02 white-frost state");
  return run.story.whiteFrost;
}

function frozenState(run: RunState): unknown {
  return JSON.parse(
    JSON.stringify({
      resources: run.resources,
      survivor: run.survivor,
      environment: run.environment,
      crops: run.crops,
      ledger: run.ledger,
      whiteFrost: run.story.whiteFrost,
    }),
  );
}

function cloneRun(run: RunState): RunState {
  const cloned = parseRun(JSON.stringify(run));
  if (!cloned)
    throw new Error("Expected the test run to survive serialization");
  return cloned;
}

function forcedFrostEventAdvanced(eventId: string, run: RunState): boolean {
  if (run.ended) return true;
  switch (eventId) {
    case "EV059":
    case "EV060":
      return run.phase === "prep" && run.activeEventId === undefined;
    case "EV063":
      return (
        run.phase === "night" && run.activeContact?.definitionId === "T009"
      );
    case "EV064":
      return run.activeEventId === "EV065";
    case "EV065":
      return run.phase === "ending";
    default:
      return false;
  }
}

function continueIllegalFrostFinaleIfPossible(
  run: RunState,
  service: RunService,
): void {
  if (run.activeEventId === "EV064") {
    const clearChoice = service
      .getEvent(run)
      ?.choices.find((choice) => choice.id === "manual");
    if (clearChoice) service.resolveEvent(run, clearChoice);
  }
  if (run.activeEventId === "EV065") {
    const endingChoice = service
      .getEvent(run)
      ?.choices.find((choice) => choice.id === "emergency-stop");
    if (endingChoice) service.resolveEvent(run, endingChoice);
  }
}

function beginT009(seed: string): {
  run: RunState;
  service: RunService;
  interaction: T009InteractionState;
} {
  const run = createRun(seed, "R02");
  const service = new RunService();
  run.day = 7;
  whiteFrost(run).finaleStage = "blizzard";
  service.beginNight(run);

  const interaction = service.ensureThreatInteraction(run);
  if (interaction?.kind !== "T009")
    throw new Error("Expected a deterministic T009 contact");
  expect(run.activeContact?.definitionId).toBe("T009");
  return { run, service, interaction };
}

function reachR01T004(seed: string): {
  run: RunState;
  service: RunService;
  interaction: T004InteractionState;
} {
  const run = createRun(seed, "R01");
  const service = new RunService();
  run.day = 7;
  run.selectedRouteNodeId = "RN01";
  run.story.flags.day4Route = "DETOUR";
  run.resources.energy = 100;
  run.resources.fuel = 100;
  service.beginNight(run);

  for (let wave = 1; wave <= 2; wave += 1) {
    const threatId = run.activeContact?.definitionId;
    const counter = threatId === "T003" ? "emergency-boost" : "close-shutter";
    expect(service.counterThreat(run, counter)).toBe(true);
  }

  const interaction = service.ensureThreatInteraction(run);
  if (interaction?.kind !== "T004")
    throw new Error("Expected the R01 DETOUR T004 contact");
  return { run, service, interaction };
}

describe("route-aware run creation and migration", () => {
  it("keeps R01 as the default and creates an independent R02 thermal state on request", () => {
    const defaultRun = createRun("default-route");
    const frostRun = createRun("frost-route", "R02");
    const secondFrostRun = createRun("frost-route-two", "R02");

    expect(defaultRun).toMatchObject({
      schemaVersion: 5,
      routeId: "R01",
      resources: { energy: 75, fuel: 40 },
      environment: { temperature: 18 },
      story: { version: 3, whiteFrost: null },
    });
    expect(frostRun).toMatchObject({
      schemaVersion: 5,
      routeId: "R02",
      resources: { energy: 78, fuel: 44 },
      environment: { temperature: 12 },
      story: { version: 3 },
    });

    const frost = whiteFrost(frostRun);
    expect(frost.thermal.tokens).toEqual([
      { id: "H1", zone: "BERTH" },
      { id: "H2", zone: "BERTH" },
      { id: "H3", zone: "DEICER" },
      { id: "H4", zone: "DEICER" },
      { id: "H5", zone: "LOOP" },
      { id: "H6", zone: "LOOP" },
    ]);
    expect(frost.thermal).toMatchObject({
      selectedTokenId: null,
      committedAllocation: { BERTH: 2, DEICER: 2, LOOP: 2 },
      committedDay: null,
      settlementIds: [],
      revision: 0,
    });

    frost.thermal.tokens[0]!.zone = "LOOP";
    expect(whiteFrost(secondFrostRun).thermal.tokens[0]).toEqual({
      id: "H1",
      zone: "BERTH",
    });
    expect(JSON.parse(JSON.stringify(frostRun))).toEqual(frostRun);
  });

  it("migrates a schema-3 R01 contact without losing its state or specialized interaction", () => {
    const fixture = reachR01T004("schema3-r01-t004");
    const original = JSON.parse(JSON.stringify(fixture.run)) as Record<
      string,
      any
    >;
    original.schemaVersion = 3;
    delete original.routeId;
    original.story.version = 1;
    delete original.story.whiteFrost;

    const migrated = parseRun(JSON.stringify(original));
    expect(migrated).not.toBeNull();
    expect(migrated).toMatchObject({
      schemaVersion: 5,
      routeId: "R01",
      story: { version: 3, whiteFrost: null },
    });
    expect(migrated?.resources).toEqual(fixture.run.resources);
    expect(migrated?.crops).toEqual(fixture.run.crops);
    expect(migrated?.decorations).toEqual(fixture.run.decorations);
    expect(migrated?.activeContact).toEqual(fixture.run.activeContact);

    const restoredInteraction = migrated?.activeContact?.interaction;
    expect(restoredInteraction?.kind).toBe("T004");
    if (!migrated || restoredInteraction?.kind !== "T004") {
      throw new Error("Expected the migrated T004 interaction");
    }
    expect(
      fixture.service.interactThreat(
        migrated,
        `cutter:${restoredInteraction.targetPlotId}`,
      ).resolved,
    ).toBe(true);
  });
});

describe("authoritative R02 branches and thermal routing", () => {
  it.each([
    [
      "CARE",
      { stress: 5 },
      { fuel: 0, energy: 0, parts: 0, water: 0 },
      "EV058",
    ],
    ["CLEAR", {}, { fuel: 0, energy: -3, parts: -3, water: 0 }, "EV059"],
    ["SUSTAIN", {}, { fuel: 0, energy: -2, parts: -2, water: -1 }, "EV060"],
  ] as const)(
    "applies the %s branch through the public event resolver",
    (branch, survivorDelta, resourceDelta, nextEventId) => {
      const run = createRun(`branch-${branch}`, "R02");
      const service = new RunService();
      run.phase = "travel";
      run.day = 4;
      run.activeEventId = "EV057";
      run.resources.energy = 100;
      run.resources.fuel = 60;
      run.resources.parts = 20;
      run.resources.water = 8;
      for (const module of run.modules) {
        module.active = false;
        module.powered = false;
      }
      const before = {
        resources: { ...run.resources },
        survivor: { ...run.survivor },
      };
      const event = service.getEvent(run);
      const choice = event?.choices.find(
        (candidate) => candidate.id === branch,
      );
      expect(choice).toBeDefined();
      expect(service.resolveEvent(run, choice!)).toBe(true);

      expect(whiteFrost(run).branch).toBe(branch as FrostBranch);
      expect(run.story.seenEventIds).toContain("EV057");
      expect(
        FROST_STORY_EVENTS.find(
          (candidate) => candidate.id === "EV057",
        )?.choices.find((candidate) => candidate.id === branch)?.consequence
          .nextEventId,
      ).toBe(nextEventId);
      for (const [key, delta] of Object.entries(resourceDelta)) {
        expect(run.resources[key as keyof typeof run.resources]).toBe(
          before.resources[key as keyof typeof before.resources] + delta,
        );
      }
      for (const [key, delta] of Object.entries(survivorDelta)) {
        expect(run.survivor[key as keyof typeof run.survivor]).toBe(
          before.survivor[key as keyof typeof before.survivor] + delta,
        );
      }
    },
  );

  it("makes direct move and select-then-target produce the same authoritative allocation", () => {
    const direct = createRun("thermal-direct", "R02");
    const tapped = createRun("thermal-tap", "R02");
    const directService = new RunService();
    const tapService = new RunService();

    expect(
      directService.applyThermalCommand(direct, "thermal:move:H1:LOOP"),
    ).toMatchObject({
      status: "accepted",
      accepted: true,
    });
    expect(
      tapService.applyThermalCommand(tapped, "thermal:select:H1"),
    ).toMatchObject({
      status: "accepted",
      accepted: true,
    });
    expect(whiteFrost(tapped).thermal.selectedTokenId).toBe("H1");
    expect(
      tapService.applyThermalCommand(tapped, "thermal:target:LOOP"),
    ).toMatchObject({
      status: "accepted",
      accepted: true,
    });

    expect(whiteFrost(direct).thermal.tokens).toEqual(
      whiteFrost(tapped).thermal.tokens,
    );
    expect(whiteFrost(direct).thermal.revision).toBe(1);
    expect(whiteFrost(tapped).thermal.revision).toBe(1);
    expect(whiteFrost(tapped).thermal.selectedTokenId).toBeNull();
    expect(
      whiteFrost(direct).thermal.tokens.find((token) => token.id === "H1")
        ?.zone,
    ).toBe("LOOP");
  });

  it("settles a thermal commit once per day and makes a repeated commit state-idempotent", () => {
    const run = createRun("thermal-idempotent", "R02");
    const service = new RunService();
    const before = { energy: run.resources.energy, fuel: run.resources.fuel };

    expect(service.applyThermalCommand(run, "thermal:commit")).toMatchObject({
      status: "accepted",
      accepted: true,
      settled: true,
    });
    expect(run.resources.energy).toBe(before.energy - 2);
    expect(run.resources.fuel).toBe(before.fuel - 1);
    expect(whiteFrost(run).thermal).toMatchObject({
      committedAllocation: { BERTH: 2, DEICER: 2, LOOP: 2 },
      committedDay: 1,
    });
    expect(whiteFrost(run).thermal.settlementIds).toHaveLength(1);
    const afterFirst = frozenState(run);

    expect(service.applyThermalCommand(run, "thermal:commit")).toMatchObject({
      status: "duplicate",
      accepted: false,
      settled: false,
    });
    expect(frozenState(run)).toEqual(afterFirst);
  });

  it.each([
    ["EV059", 5, "CLEAR", "inactive"],
    ["EV060", 5, "SUSTAIN", "inactive"],
    ["EV063", 7, "CARE", "warm"],
    ["EV064", 7, "CARE", "clear"],
    ["EV065", 7, "CARE", "accelerate"],
  ] as const)(
    "keeps at least one advancing %s choice executable after global resources are exhausted",
    (eventId, day, branch, finaleStage) => {
      const base = createRun(`low-resource-${eventId}`, "R02");
      const frost = whiteFrost(base);
      base.day = day;
      base.phase = "travel";
      base.activeEventId = eventId;
      base.resources = {
        energy: 0,
        fuel: 0,
        food: 0,
        water: 0,
        parts: 0,
        medicine: 0,
        data: 0,
      };
      frost.branch = branch;
      frost.finaleStage = finaleStage;
      if (eventId === "EV063") {
        frost.thermal.committedDay = 7;
        frost.thermal.committedAllocation = { BERTH: 2, DEICER: 2, LOOP: 2 };
      }

      const choices = new RunService().getEvent(base)?.choices ?? [];
      const attempts = choices.map((choice) => {
        const candidate = cloneRun(base);
        const service = new RunService();
        const accepted = service.resolveEvent(candidate, choice);
        return {
          choiceId: choice.id,
          accepted,
          advanced: accepted && forcedFrostEventAdvanced(eventId, candidate),
          phase: candidate.phase,
          activeEventId: candidate.activeEventId,
          ended: candidate.ended,
        };
      });

      expect(
        attempts.some((attempt) => attempt.advanced),
        `${eventId} has no advancing low-resource fallback: ${JSON.stringify(attempts)}`,
      ).toBe(true);
    },
  );

  it.each([
    ["EV053", 1, null, "inactive"],
    ["EV054", 1, null, "inactive"],
    ["EV055", 2, null, "inactive"],
    ["EV056", 3, null, "inactive"],
    ["EV057", 4, null, "inactive"],
    ["EV058", 5, "CARE", "inactive"],
    ["EV059", 5, "CLEAR", "inactive"],
    ["EV060", 5, "SUSTAIN", "inactive"],
    ["EV061", 6, "CARE", "inactive"],
    ["EV062", 6, "CARE", "inactive"],
    ["EV063", 7, "CARE", "warm"],
    ["EV064", 7, "CARE", "clear"],
    ["EV065", 7, "CARE", "accelerate"],
  ] as const)(
    "keeps forced event %s resolvable through a visible no-resource fallback",
    (eventId, day, branch, finaleStage) => {
      const base = createRun(`all-forced-fallback-${eventId}`, "R02");
      base.day = day;
      base.phase = "travel";
      base.activeEventId = eventId;
      base.resources = {
        energy: 0,
        fuel: 0,
        food: 0,
        water: 0,
        parts: 0,
        medicine: 0,
        data: 0,
      };
      const frost = whiteFrost(base);
      frost.branch = branch;
      frost.finaleStage = finaleStage;
      if (eventId === "EV063") frost.thermal.committedDay = 7;

      const choices = new RunService().getEvent(base)?.choices ?? [];
      const attempts = choices.map((choice) => {
        const candidate = cloneRun(base);
        const accepted = new RunService().resolveEvent(candidate, choice);
        return {
          choiceId: choice.id,
          accepted,
          advanced:
            accepted &&
            (candidate.ended ||
              candidate.activeEventId !== eventId ||
              candidate.phase !== "travel"),
        };
      });

      expect(
        attempts.some((attempt) => attempt.advanced),
        `${eventId} lacks a no-resource progression path: ${JSON.stringify(attempts)}`,
      ).toBe(true);
    },
  );
});

describe("R02 authored phase scheduling and delayed consequences", () => {
  it("surfaces prep and route events before fuel is spent, while travel events follow route confirmation", () => {
    const service = new RunService();
    const dayOne = createRun("phase-day-one", "R02");

    expect(service.enterStoryPhase(dayOne, "prep")).toBe(true);
    expect(dayOne).toMatchObject({ phase: "prep", activeEventId: "EV053" });
    const layout = service
      .getEvent(dayOne)
      ?.choices.find((choice) => choice.id === "a07-layout");
    expect(layout).toBeDefined();
    expect(service.resolveEvent(dayOne, layout!)).toBe(true);
    expect(dayOne).toMatchObject({ phase: "prep", activeEventId: undefined });
    expect(dayOne.story.queue).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "EV054",
          dueDay: 1,
          duePhase: "aftermath",
        }),
      ]),
    );

    const dayTwo = createRun("phase-day-two", "R02");
    dayTwo.day = 2;
    const dayTwoFuel = dayTwo.resources.fuel;
    service.chooseRoute(dayTwo, "RN01");
    expect(dayTwo.resources.fuel).toBeLessThan(dayTwoFuel);
    expect(dayTwo).toMatchObject({ phase: "travel", activeEventId: "EV055" });

    const dayFour = createRun("phase-day-four", "R02");
    dayFour.day = 4;
    const dayFourFuel = dayFour.resources.fuel;
    expect(service.enterStoryPhase(dayFour, "route")).toBe(true);
    expect(dayFour).toMatchObject({ phase: "route", activeEventId: "EV057" });
    expect(dayFour.resources.fuel).toBe(dayFourFuel);
    const care = service
      .getEvent(dayFour)
      ?.choices.find((choice) => choice.id === "CARE");
    expect(care).toBeDefined();
    expect(service.resolveEvent(dayFour, care!)).toBe(true);
    expect(dayFour).toMatchObject({ phase: "route", activeEventId: undefined });
    service.chooseRoute(dayFour, "RN01");
    expect(dayFour.resources.fuel).toBeLessThan(dayFourFuel);
    expect(dayFour.activeEventId).not.toBe("EV057");
  });

  it("activates the next day's prep event during aftermath progression", () => {
    const run = createRun("phase-next-day", "R02");
    const service = new RunService();
    run.day = 2;
    run.phase = "aftermath";

    service.continueAftermath(run);

    expect(run).toMatchObject({
      day: 3,
      phase: "prep",
      activeEventId: "EV056",
    });
  });

  it("offers a terminal-safe emergency drift when every route is unaffordable", () => {
    const service = new RunService();
    const run = createRun("emergency-route", "R02");
    run.day = 2;
    run.phase = "route";
    run.resources.fuel = 0;
    whiteFrost(run).pendingRouteFuelPenalty = 3;

    expect(service.emergencyRoute(run)).toBe(true);
    expect(run).toMatchObject({
      phase: "travel",
      activeEventId: "EV055",
      selectedRouteNodeId: "RN01",
      resources: { fuel: 0 },
      environment: { hull: 94, temperature: 9 },
      survivor: { sleep: 92, stress: 28 },
    });
    expect(whiteFrost(run).pendingRouteFuelPenalty).toBe(0);

    const lethal = createRun("emergency-route-lethal", "R02");
    lethal.day = 2;
    lethal.phase = "route";
    lethal.resources.fuel = 0;
    lethal.environment.hull = 6;
    expect(service.emergencyRoute(lethal)).toBe(true);
    expect(lethal).toMatchObject({
      phase: "ending",
      ended: true,
      outcome: "hull-lost",
      activeEventId: undefined,
    });
  });

  it("consumes the Day 2 deicer discount and differentiates consent-aware heater repair", () => {
    const service = new RunService();
    const deicerRun = createRun("delayed-deicer", "R02");
    deicerRun.day = 2;
    deicerRun.phase = "travel";
    deicerRun.activeEventId = "EV055";
    const deicer = service
      .getEvent(deicerRun)
      ?.choices.find((choice) => choice.id === "deicer");
    expect(deicer).toBeDefined();
    expect(service.resolveEvent(deicerRun, deicer!)).toBe(true);
    expect(whiteFrost(deicerRun).switchMethod).toBe("deicer");

    deicerRun.day = 7;
    deicerRun.phase = "travel";
    deicerRun.activeContact = undefined;
    deicerRun.activeEventId = "EV064";
    deicerRun.resources.energy = 2;
    whiteFrost(deicerRun).branch = "CLEAR";
    whiteFrost(deicerRun).finaleStage = "clear";
    const finalDeice = service
      .getEvent(deicerRun)
      ?.choices.find((choice) => choice.id === "deice");
    expect(finalDeice).toBeDefined();
    expect(service.resolveEvent(deicerRun, finalDeice!)).toBe(true);
    expect(deicerRun).toMatchObject({
      activeEventId: "EV065",
      resources: { energy: 0 },
    });

    const asked = createRun("heater-asked", "R02");
    asked.day = 3;
    asked.phase = "travel";
    asked.activeEventId = "EV056";
    const askRepair = service
      .getEvent(asked)
      ?.choices.find((choice) => choice.id === "ask-repair");
    expect(service.resolveEvent(asked, askRepair!)).toBe(true);
    expect(whiteFrost(asked).jointTrustRequirement).toBe(50);

    const overridden = createRun("heater-overridden", "R02");
    overridden.day = 3;
    overridden.phase = "travel";
    overridden.activeEventId = "EV056";
    const override = service
      .getEvent(overridden)
      ?.choices.find((choice) => choice.id === "override");
    expect(service.resolveEvent(overridden, override!)).toBe(true);
    expect(whiteFrost(overridden).jointTrustRequirement).toBe(60);
  });

  it("only unlocks quiet scraping after the Day 2 manual repair and applies its reduced hull cost", () => {
    const service = new RunService();
    const repaired = createRun("switch-repaired", "R02");
    repaired.day = 2;
    repaired.phase = "travel";
    repaired.activeEventId = "EV055";
    const repair = service
      .getEvent(repaired)
      ?.choices.find((choice) => choice.id === "repair");
    expect(service.resolveEvent(repaired, repair!)).toBe(true);
    expect(whiteFrost(repaired).switchMethod).toBe("repair");

    repaired.day = 5;
    repaired.phase = "travel";
    repaired.activeContact = undefined;
    repaired.activeEventId = "EV059";
    repaired.resources.parts = 1;
    whiteFrost(repaired).branch = "CLEAR";
    const scrape = service
      .getEvent(repaired)
      ?.choices.find((choice) => choice.id === "scrape");
    expect(service.resolveEvent(repaired, scrape!)).toBe(true);
    expect(whiteFrost(repaired).manualScrapeHullCost).toBe(4);

    const notRepaired = createRun("switch-not-repaired", "R02");
    notRepaired.day = 5;
    notRepaired.phase = "travel";
    notRepaired.activeEventId = "EV059";
    notRepaired.resources.parts = 1;
    whiteFrost(notRepaired).branch = "CLEAR";
    whiteFrost(notRepaired).switchMethod = "deicer";
    const unavailableScrape = service
      .getEvent(notRepaired)
      ?.choices.find((choice) => choice.id === "scrape");
    expect(service.resolveEvent(notRepaired, unavailableScrape!)).toBe(false);
    expect(notRepaired.activeEventId).toBe("EV059");
  });

  it("enforces the dynamic joint-control trust boundary at EV065", () => {
    const service = new RunService();
    const run = createRun("joint-trust-boundary", "R02");
    run.day = 7;
    run.phase = "travel";
    run.activeEventId = "EV065";
    run.resources.energy = 2;
    run.resources.fuel = 3;
    const frost = whiteFrost(run);
    frost.consent = "shared";
    frost.coauthorEvidence = true;
    frost.finaleStage = "accelerate";
    frost.jointTrustRequirement = 50;
    const joint = service
      .getEvent(run)
      ?.choices.find((choice) => choice.id === "joint");

    run.survivor.trust = 49;
    expect(service.resolveEvent(run, joint!)).toBe(false);
    expect(run.activeEventId).toBe("EV065");

    run.survivor.trust = 50;
    expect(service.resolveEvent(run, joint!)).toBe(true);
    expect(run).toMatchObject({
      phase: "ending",
      ended: true,
      outcome: "victory",
    });
  });

  it.each([0, 1, 2] as const)(
    "keeps shield selectable with %i fuel and consumes at most the remaining two units",
    (fuel) => {
      const run = createRun(`shield-fuel-${fuel}`, "R02");
      const service = new RunService();
      run.day = 7;
      run.phase = "travel";
      run.activeEventId = "EV065";
      run.resources.fuel = fuel;
      whiteFrost(run).finaleStage = "accelerate";
      const shield = service
        .getEvent(run)
        ?.choices.find((choice) => choice.id === "shield");

      expect(service.resolveEvent(run, shield!)).toBe(true);
      expect(run).toMatchObject({
        phase: "ending",
        ended: true,
        outcome: "victory",
        resources: { fuel: 0 },
      });
      expect(
        run.ledger.filter(
          (entry) =>
            entry.source === "event.EV065.shield" && entry.key === "fuel",
        ),
      ).toHaveLength(1);
    },
  );

  it("settles ram damage and lethal cold debt once, before any story progression", () => {
    const service = new RunService();
    const rammed = createRun("ram-debt", "R02");
    rammed.day = 6;
    rammed.phase = "travel";
    rammed.activeEventId = "EV062";
    rammed.environment.hull = 50;
    const frost = whiteFrost(rammed);
    frost.switchMethod = "ram";
    frost.coldDebt = 1;
    const settle = service
      .getEvent(rammed)
      ?.choices.find((choice) => choice.id === "settle");
    expect(service.resolveEvent(rammed, settle!)).toBe(true);
    expect(rammed.environment.hull).toBe(48);
    expect(
      rammed.ledger.filter((entry) => entry.source === "story.R02.ram-crack"),
    ).toHaveLength(1);

    const lethal = createRun("lethal-cold-debt", "R02");
    lethal.day = 6;
    lethal.phase = "travel";
    lethal.activeEventId = "EV062";
    lethal.survivor.health = 1;
    whiteFrost(lethal).coldDebt = 1;
    const lethalSettle = service
      .getEvent(lethal)
      ?.choices.find((choice) => choice.id === "settle");
    expect(service.resolveEvent(lethal, lethalSettle!)).toBe(true);
    expect(lethal).toMatchObject({
      phase: "ending",
      ended: true,
      outcome: "survivor-lost",
      activeEventId: undefined,
    });
  });

  it("ends a lethal BERTH-zero thermal settlement before reopening the Day 7 finale", () => {
    const run = createRun("lethal-thermal", "R02");
    const service = new RunService();
    run.day = 7;
    run.phase = "prep";
    run.survivor.health = 3;
    for (const token of whiteFrost(run).thermal.tokens)
      token.zone = token.id <= "H3" ? "DEICER" : "LOOP";

    expect(service.applyThermalCommand(run, "thermal:commit")).toMatchObject({
      accepted: true,
      settled: true,
    });
    expect(run).toMatchObject({
      phase: "ending",
      ended: true,
      outcome: "survivor-lost",
      activeEventId: undefined,
    });
    expect(whiteFrost(run).thermal.committedDay).toBe(7);
    expect(whiteFrost(run).thermal.settlementIds).toHaveLength(1);
  });
});

describe("authoritative T009 interaction", () => {
  it("makes an uninspected confirm invalid, then reveals a cost-free first miss and allows retry", () => {
    const { run, service, interaction } = beginT009("t009-first-miss");

    expect(service.interactThreat(run, "frost:confirm")).toMatchObject({
      status: "invalid",
      accepted: false,
      resolved: false,
    });
    expect(interaction.attempts).toBe(0);

    const wrongZone = FROST_ZONES.find(
      (zone) => !interaction.requiredZones.includes(zone),
    )!;
    expect(
      service.interactThreat(run, `frost:inspect:${wrongZone}`),
    ).toMatchObject({
      status: "accepted",
      accepted: true,
      resolved: false,
    });
    const beforeMiss = {
      resources: { ...run.resources },
      health: run.survivor.health,
      stress: run.survivor.stress,
      temperature: run.environment.temperature,
      hull: run.environment.hull,
    };

    expect(service.interactThreat(run, "frost:confirm")).toMatchObject({
      status: "incorrect",
      accepted: true,
      resolved: false,
      healthDelta: 0,
    });
    expect(run.activeContact?.definitionId).toBe("T009");
    expect(interaction).toMatchObject({
      attempts: 1,
      firstMissRevealed: true,
      manualFallbackAvailable: true,
    });
    expect(run.resources).toEqual(beforeMiss.resources);
    expect(run.survivor.health).toBe(beforeMiss.health);
    expect(run.survivor.stress).toBe(beforeMiss.stress);
    expect(run.environment.temperature).toBe(beforeMiss.temperature);
    expect(run.environment.hull).toBe(beforeMiss.hull);

    for (const zone of interaction.requiredZones) {
      expect(
        service.interactThreat(run, `frost:inspect:${zone}`).accepted,
      ).toBe(true);
    }
    expect(service.interactThreat(run, "frost:confirm")).toMatchObject({
      status: "resolved",
      accepted: true,
      resolved: true,
    });
    expect(interaction.resolvedBy).toBe("thermal");
    expect(run.activeContact).toBeUndefined();
  });

  it("settles manual scrape exactly once after a revealed miss", () => {
    const { run, service, interaction } = beginT009("t009-manual");
    const wrongZone = FROST_ZONES.find(
      (zone) => !interaction.requiredZones.includes(zone),
    )!;
    service.interactThreat(run, `frost:inspect:${wrongZone}`);
    service.interactThreat(run, "frost:confirm");
    expect(interaction.manualFallbackAvailable).toBe(true);
    const before = { hull: run.environment.hull, stress: run.survivor.stress };

    expect(service.interactThreat(run, "frost:manual-scrape")).toMatchObject({
      status: "resolved",
      accepted: true,
      resolved: true,
    });
    expect(interaction.resolvedBy).toBe("manual-scrape");
    expect(run.environment.hull).toBe(before.hull - 6);
    expect(run.survivor.stress).toBe(before.stress + 6);
    const after = { hull: run.environment.hull, stress: run.survivor.stress };

    expect(service.interactThreat(run, "frost:manual-scrape")).toMatchObject({
      accepted: false,
      resolved: false,
    });
    expect({ hull: run.environment.hull, stress: run.survivor.stress }).toEqual(
      after,
    );
  });

  it("denies legacy one-click counters without spending resources or removing T009", () => {
    const { run, service } = beginT009("t009-legacy-denial");
    const resources = { ...run.resources };

    expect(service.counterThreat(run, "close-shutter")).toBe(false);
    expect(run.resources).toEqual(resources);
    expect(run.activeContact?.definitionId).toBe("T009");
    expect(run.activeContact?.interaction?.kind).toBe("T009");
  });

  it("keeps the first full-map mismatch cost-free instead of treating revealed clues as a spent grace attempt", () => {
    const run = createRun("t009-full-map-first-miss", "R02");
    const service = new RunService();
    const frost = whiteFrost(run);
    run.day = 7;
    frost.finaleStage = "blizzard";
    frost.heatMapQuality = "full";
    service.beginNight(run);

    const interaction = service.ensureThreatInteraction(run);
    if (interaction?.kind !== "T009")
      throw new Error("Expected a full-map T009 interaction");
    const targetZone = interaction.requiredZones[0];
    const otherZone = FROST_ZONES.find(
      (zone) => !interaction.requiredZones.includes(zone),
    )!;
    const token = frost.thermal.tokens.find(
      (candidate) => candidate.zone === targetZone,
    );
    if (!token) throw new Error(`Expected a token in ${targetZone}`);
    expect(
      service.applyThermalCommand(run, `thermal:move:${token.id}:${otherZone}`)
        .accepted,
    ).toBe(true);

    const before = {
      resources: { ...run.resources },
      health: run.survivor.health,
      stress: run.survivor.stress,
      temperature: run.environment.temperature,
      hull: run.environment.hull,
    };
    const clueWasAlreadyRevealed = interaction.firstMissRevealed;
    const firstMissWasAlreadySpent = interaction.freeMissUsed;
    const result = service.interactThreat(run, "frost:confirm");

    expect({
      firstMissWasAlreadySpent,
      clueWasAlreadyRevealed,
      result,
      resources: run.resources,
      health: run.survivor.health,
      stress: run.survivor.stress,
      temperature: run.environment.temperature,
      hull: run.environment.hull,
      attempts: interaction.attempts,
      firstMissRevealed: interaction.firstMissRevealed,
      freeMissUsed: interaction.freeMissUsed,
      manualFallbackAvailable: interaction.manualFallbackAvailable,
    }).toMatchObject({
      firstMissWasAlreadySpent: false,
      clueWasAlreadyRevealed: true,
      result: {
        status: "incorrect",
        accepted: true,
        resolved: false,
        healthDelta: 0,
      },
      resources: before.resources,
      health: before.health,
      stress: before.stress,
      temperature: before.temperature,
      hull: before.hull,
      attempts: 1,
      firstMissRevealed: true,
      freeMissUsed: true,
      manualFallbackAvailable: true,
    });
  });

  it("does not pre-open MANUAL_SCRAPE merely because the contact starts with a wrong allocation", () => {
    const seed = "t009-manual-not-preopened";
    const scout = beginT009(seed);
    const requiredZones = [...scout.interaction.requiredZones] as [
      FrostZone,
      FrostZone,
    ];
    const nonRequiredZone = FROST_ZONES.find(
      (zone) => !requiredZones.includes(zone),
    )!;

    const run = createRun(seed, "R02");
    const service = new RunService();
    const frost = whiteFrost(run);
    run.day = 7;
    frost.finaleStage = "blizzard";
    const token = frost.thermal.tokens.find(
      (candidate) => candidate.zone === requiredZones[0],
    );
    if (!token) throw new Error(`Expected a token in ${requiredZones[0]}`);
    expect(
      service.applyThermalCommand(
        run,
        `thermal:move:${token.id}:${nonRequiredZone}`,
      ).accepted,
    ).toBe(true);
    service.beginNight(run);

    const interaction = service.ensureThreatInteraction(run);
    if (interaction?.kind !== "T009")
      throw new Error("Expected a deterministic T009 interaction");
    expect(interaction.requiredZones).toEqual(requiredZones);
    const availableBeforeInspection = interaction.manualFallbackAvailable;
    expect(
      service.interactThreat(run, `frost:inspect:${nonRequiredZone}`).accepted,
    ).toBe(true);
    expect(service.interactThreat(run, "frost:confirm")).toMatchObject({
      status: "incorrect",
      accepted: true,
      resolved: false,
    });

    expect({
      availableBeforeInspection,
      attempts: interaction.attempts,
      manualFallbackAvailable: interaction.manualFallbackAvailable,
    }).toEqual({
      availableBeforeInspection: false,
      attempts: 1,
      manualFallbackAvailable: true,
    });
  });

  it("ends with hull-lost when a lethal Day 7 manual scrape resolves T009", () => {
    const { run, service, interaction } = beginT009("t009-lethal-manual");
    run.environment.hull = 5;
    const wrongZone = FROST_ZONES.find(
      (zone) => !interaction.requiredZones.includes(zone),
    )!;
    service.interactThreat(run, `frost:inspect:${wrongZone}`);
    service.interactThreat(run, "frost:confirm");
    expect(interaction.manualFallbackAvailable).toBe(true);

    expect(service.interactThreat(run, "frost:manual-scrape")).toMatchObject({
      status: "resolved",
      accepted: true,
      resolved: true,
    });
    const enteredEv064 = run.activeEventId === "EV064";
    continueIllegalFrostFinaleIfPossible(run, service);

    expect({
      enteredEv064,
      ended: run.ended,
      outcome: run.outcome,
      activeEventId: run.activeEventId,
      hull: run.environment.hull,
    }).toEqual({
      enteredEv064: false,
      ended: true,
      outcome: "hull-lost",
      activeEventId: undefined,
      hull: 0,
    });
  });

  it("ends with survivor-lost when a lethal Day 7 T009 timeout reaches breach", () => {
    const { run, service } = beginT009("t009-lethal-timeout");
    run.environment.temperature = 4;
    run.survivor.health = 4;
    if (!run.activeContact) throw new Error("Expected an active T009 contact");
    run.activeContact.secondsLeft = 1;

    service.tickNight(run);
    expect(run.survivor.health).toBe(0);
    service.tickNight(run);
    const enteredEv064 = run.activeEventId === "EV064";
    continueIllegalFrostFinaleIfPossible(run, service);

    expect({
      enteredEv064,
      ended: run.ended,
      outcome: run.outcome,
      activeEventId: run.activeEventId,
      health: run.survivor.health,
    }).toEqual({
      enteredEv064: false,
      ended: true,
      outcome: "survivor-lost",
      activeEventId: undefined,
      health: 0,
    });
  });
});

describe("R02 avalanche finale progression", () => {
  it("returns from the thermal drawer and advances WARM → T009 → CLEAR → ACCELERATE exactly once", () => {
    const run = createRun("frost-finale-progression", "R02");
    const service = new RunService();
    const frost = whiteFrost(run);
    run.day = 7;
    run.phase = "travel";
    run.activeEventId = "EV063";
    run.resources.energy = 100;
    run.resources.fuel = 60;
    run.resources.parts = 20;
    frost.branch = "SUSTAIN";

    const thermalChoice = service
      .getEvent(run)
      ?.choices.find((choice) => choice.id === "thermal-board");
    expect(thermalChoice).toBeDefined();
    expect(service.resolveEvent(run, thermalChoice!)).toBe(true);
    expect(run).toMatchObject({ phase: "prep", activeEventId: undefined });

    expect(service.applyThermalCommand(run, "thermal:commit")).toMatchObject({
      accepted: true,
      settled: true,
    });
    expect(run).toMatchObject({ phase: "travel", activeEventId: "EV063" });

    const warmChoice = service
      .getEvent(run)
      ?.choices.find((choice) => choice.id === "warm");
    expect(warmChoice).toBeDefined();
    expect(service.resolveEvent(run, warmChoice!)).toBe(true);
    expect(run.phase).toBe("night");
    expect(run.activeContact?.definitionId).toBe("T009");

    const interaction = service.ensureThreatInteraction(run);
    expect(interaction?.kind).toBe("T009");
    if (interaction?.kind !== "T009")
      throw new Error("Expected the finale T009 interaction");
    for (const zone of interaction.requiredZones) {
      expect(
        service.interactThreat(run, `frost:inspect:${zone}`).accepted,
      ).toBe(true);
    }
    expect(service.interactThreat(run, "frost:confirm")).toMatchObject({
      status: "resolved",
      resolved: true,
    });
    expect(run).toMatchObject({ phase: "travel", activeEventId: "EV064" });
    expect(frost.finaleStage).toBe("clear");

    const clearChoice = service
      .getEvent(run)
      ?.choices.find((choice) => choice.id === "deice");
    expect(clearChoice).toBeDefined();
    expect(service.resolveEvent(run, clearChoice!)).toBe(true);
    expect(run).toMatchObject({ phase: "travel", activeEventId: "EV065" });
    expect(frost.finaleStage).toBe("accelerate");

    const shieldChoice = service
      .getEvent(run)
      ?.choices.find((choice) => choice.id === "shield");
    expect(shieldChoice).toBeDefined();
    expect(service.resolveEvent(run, shieldChoice!)).toBe(true);
    expect(run).toMatchObject({
      phase: "ending",
      ended: true,
      outcome: "victory",
    });
    expect(frost).toMatchObject({
      finaleStage: "resolved",
      finalDecision: "shield",
      endingId: "frost-guarded-arrival",
      rewardSettled: true,
    });
    const rewardEntries = run.ledger.filter(
      (entry) => entry.source === "story.R02.route-complete",
    );
    expect(rewardEntries).toHaveLength(1);
    expect(service.resolveEvent(run, shieldChoice!)).toBe(false);
    expect(
      run.ledger.filter((entry) => entry.source === "story.R02.route-complete"),
    ).toHaveLength(1);
  });
});

describe("R01 public behavior regression", () => {
  it("keeps default resources and the standard one-wave counter loop intact", () => {
    const run = createRun("r01-regression");
    const service = new RunService();
    run.selectedRouteNodeId = "RN01";

    expect(run).toMatchObject({
      routeId: "R01",
      resources: { energy: 75, fuel: 40 },
      environment: { temperature: 18 },
      story: { whiteFrost: null },
    });
    service.beginNight(run);
    expect(run.activeContact).toMatchObject({ wave: 1, totalWaves: 1 });
    const counter =
      run.activeContact?.definitionId === "T003"
        ? "emergency-boost"
        : "close-shutter";
    expect(service.counterThreat(run, counter)).toBe(true);
    expect(run.phase).toBe("aftermath");
    expect(run.activeContact).toBeUndefined();
    expect(run.story.whiteFrost).toBeNull();
  });
});
