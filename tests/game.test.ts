import { describe, expect, it } from "vitest";
import { CARRIAGES, DECORATION_SLOTS, EVENTS, MODULES, ROUTE_EVENT_POOLS, ROUTE_NODES, THREATS } from "../src/game/content";
import { createRun } from "../src/game/model";
import { createRng } from "../src/game/rng";
import { RunService } from "../src/game/services";

describe("seeded streams", () => {
  it("replays the same values for the same seed and stream", () => {
    const first = createRng("night-7", "threat");
    const second = createRng("night-7", "threat");
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });

  it("keeps streams independent", () => {
    const route = createRng("night-7", "route");
    const event = createRng("night-7", "event");
    expect(route()).not.toBe(event());
  });
});

describe("authoritative run service", () => {
  it("rejects a resource cost that would become negative", () => {
    const run = createRun("fixed");
    const service = new RunService();
    run.resources.parts = 1;
    expect(service.applyResource(run, "parts", -2, "test")).toBe(false);
    expect(run.resources.parts).toBe(1);
    expect(run.ledger).toHaveLength(0);
  });

  it("records accepted resource changes in the ledger", () => {
    const run = createRun("fixed");
    const service = new RunService();
    expect(service.applyResource(run, "energy", -8, "counter.close-shutter")).toBe(true);
    expect(run.resources.energy).toBe(67);
    expect(run.ledger.at(-1)).toMatchObject({ key: "energy", before: 75, delta: -8, after: 67 });
  });

  it("prevents rapid route and next-day actions from charging or advancing twice", () => {
    const run = createRun("idempotent-actions");
    const service = new RunService();
    const fuelBefore = run.resources.fuel;

    service.chooseRoute(run, "RN01");
    service.chooseRoute(run, "RN01");
    expect(run.resources.fuel).toBe(fuelBefore - ROUTE_NODES.find((node) => node.id === "RN01")!.fuelCost);
    expect(run.ledger.filter((entry) => entry.source === "route.RN01")).toHaveLength(1);

    run.phase = "aftermath";
    run.activeEventId = undefined;
    service.continueAftermath(run);
    service.continueAftermath(run);
    expect(run.day).toBe(2);
  });

  it("enforces event-level technology, evidence, and ending requirements", () => {
    const run = createRun("event-requirements");
    const service = new RunService();

    run.day = 6;
    run.phase = "travel";
    run.activeEventId = "EV047";
    const clauseEvent = service.getEvent(run)!;
    expect(service.resolveEvent(run, clauseEvent.choices[0]!)).toBe(false);

    run.activeEventId = "EV048";
    const authorEvent = service.getEvent(run)!;
    expect(service.resolveEvent(run, authorEvent.choices[0]!)).toBe(false);

    run.day = 7;
    run.activeEventId = "EV052";
    const epilogueEvent = service.getEvent(run)!;
    expect(service.resolveEvent(run, epilogueEvent.choices[0]!)).toBe(false);
  });

  it("queues Day 5 aftermath evidence until after the night contact", () => {
    const run = createRun("day5-aftermath-order");
    const service = new RunService();
    run.day = 5;
    run.story.flags.day4Route = "DETOUR";
    run.story.cargoConversion = "battery-array";

    service.chooseRoute(run, "RN01");
    const rosterEvent = service.getEvent(run)!;
    expect(rosterEvent.id).toBe("EV045");
    expect(service.resolveEvent(run, rosterEvent.choices[0]!)).toBe(true);
    expect(run.phase).toBe("night");
    expect(run.activeEventId).toBeUndefined();
    expect(run.story.queue.map((entry) => entry.eventId)).toContain("EV046");

    const threat = service.getThreat(run.activeContact)!;
    const counter = threat.id === "T003" ? "emergency-boost" : "close-shutter";
    expect(service.counterThreat(run, counter)).toBe(true);
    expect(run.phase).toBe("travel");
    expect(run.activeEventId).toBe("EV046");
  });

  it("moves from route to event to a threat contact", () => {
    const run = createRun("fixed");
    const service = new RunService();
    service.chooseRoute(run, "RN02");
    expect(run.phase).toBe("travel");
    expect(run.activeEventId).toBe("EV041");
    const event = service.getEvent(run);
    expect(event).toBeDefined();
    expect(service.resolveEvent(run, event!.choices[1]!)).toBe(true);
    expect(run.phase).toBe("night");
    expect(run.activeContact?.stage).toBe("approach");
  });

  it("builds modules atomically and spends the configured cost", () => {
    const run = createRun("fixed");
    const service = new RunService();
    const target = MODULES[3]!;
    const before = run.resources.parts;
    expect(service.buildModule(run, target.id)).toBe(true);
    expect(run.resources.parts).toBe(before - target.cost);
    expect(run.actionPoints).toBe(3);
    expect(run.modules.some((module) => module.definitionId === target.id)).toBe(true);
  });

  it("runs the visible two-night sow, water, grow, and harvest loop", () => {
    const run = createRun("crop-loop");
    const service = new RunService();
    const before = { ap: run.actionPoints, food: run.resources.food, water: run.resources.water };

    expect(service.plantCrop(run, "plot-a", "lettuce")).toBe(true);
    expect(run.actionPoints).toBe(before.ap - 1);
    expect(run.resources.water).toBe(before.water - 1);
    expect(run.crops[0]).toMatchObject({ cropId: "lettuce", stage: 1, wateredDay: 1 });

    run.phase = "aftermath";
    service.continueAftermath(run);
    expect(run.crops[0]).toMatchObject({ cropId: "lettuce", stage: 2 });
    expect(service.waterCrops(run)).toBe(true);
    run.phase = "aftermath";
    service.continueAftermath(run);
    expect(run.crops[0]).toMatchObject({ cropId: "lettuce", stage: 3 });

    expect(service.harvestCrop(run, "plot-a")).toBe(true);
    expect(run.resources.food).toBe(before.food + 2);
    expect(run.crops[0]).toMatchObject({ stage: 0, dryDays: 0 });
    expect(run.crops[0]?.cropId).toBeUndefined();
  });

  it("allows prep sowing when the rack is scheduled after a previously shed night", () => {
    const run = createRun("crop-recovery");
    const service = new RunService();
    const rack = run.modules.find((module) => module.definitionId === "M003")!;
    rack.active = true;
    rack.powered = false;

    expect(service.plantCrop(run, "plot-b", "herb")).toBe(true);
    expect(run.crops[1]).toMatchObject({ cropId: "herb", stage: 1, wateredDay: 1 });
  });

  it("snaps decorations to compatible visible slots and rejects invalid placement", () => {
    const run = createRun("decor-loop");
    const service = new RunService();

    expect(run.decorations).toHaveLength(4);
    expect(service.moveDecoration(run, "radio", "workshop-bench")).toBe(true);
    expect(run.decorations.find((item) => item.id === "radio")).toMatchObject({ carriageId: "workshop", slotId: "workshop-bench", x: 20, y: 64 });
    expect(service.moveDecoration(run, "toolbox", "workshop-bench")).toBe(false);
    expect(run.lastMessage).toContain("已放置短波機");
    expect(service.moveDecoration(run, "fern", "workshop-bench")).toBe(false);
    expect(run.lastMessage).toContain("不適合");
    expect(service.moveDecoration(run, "radio", "sleep-bedside")).toBe(true);
    expect(run.decorations.find((item) => item.id === "radio")).toMatchObject({ carriageId: "sleep", slotId: "sleep-bedside", x: 70, y: 54 });
    service.resetDecorations(run);
    expect(run.decorations.find((item) => item.id === "radio")).toMatchObject({ carriageId: "workshop", slotId: "workshop-radio", x: 19, y: 34 });
  });

  it("ships five distinct carriage configurations with three authored placement slots each", () => {
    expect(CARRIAGES.map((carriage) => carriage.id)).toEqual(["sleep", "defense", "workshop", "greenhouse", "kitchen"]);
    expect(new Set(CARRIAGES.map((carriage) => carriage.art)).size).toBe(5);
    for (const carriage of CARRIAGES) expect(DECORATION_SLOTS.filter((slot) => slot.carriageId === carriage.id)).toHaveLength(3);
  });

  it("repairs breach damage and charges both AP and parts", () => {
    const run = createRun("repair-loop");
    const service = new RunService();
    run.environment.hull = 82;
    const before = { ap: run.actionPoints, parts: run.resources.parts };

    expect(service.repairCarriage(run)).toBe(true);
    expect(run.environment.hull).toBe(96);
    expect(run.actionPoints).toBe(before.ap - 2);
    expect(run.resources.parts).toBe(before.parts - 2);
  });

  it("keeps locked technology unchanged until its data cost is available", () => {
    const run = createRun("tech-buttons");
    const service = new RunService();

    expect(service.unlockTech(run, "E1")).toBe(false);
    expect(run.techOwned).toEqual([]);
    service.applyResource(run, "data", 1, "test.reward");
    expect(service.unlockTech(run, "E1")).toBe(true);
    expect(run.techOwned).toContain("E1");
    expect(run.resources.data).toBe(0);
  });

  it("spends night power and sheds lower-priority modules first", () => {
    const run = createRun("power-grid");
    const service = new RunService();
    run.resources.energy = 5;

    service.beginNight(run);

    expect(run.nightPowerDemand).toBe(4);
    expect(run.modules.find((module) => module.definitionId === "M002")?.powered).toBe(true);
    expect(run.modules.find((module) => module.definitionId === "M003")?.powered).toBe(false);
  });

  it("turns route threat level into deterministic night contact waves", () => {
    const first = createRun("route-waves");
    const second = createRun("route-waves");
    const firstService = new RunService();
    const secondService = new RunService();
    first.selectedRouteNodeId = "RN03";
    second.selectedRouteNodeId = "RN03";

    firstService.beginNight(first);
    secondService.beginNight(second);

    const firstOrder: string[] = [];
    const secondOrder: string[] = [];
    for (let wave = 1; wave <= 3; wave += 1) {
      firstOrder.push(first.activeContact!.definitionId);
      secondOrder.push(second.activeContact!.definitionId);
      expect(first.activeContact).toMatchObject({ wave, totalWaves: 3, stage: "approach" });
      const firstCounter = first.activeContact!.definitionId === "T003" ? "emergency-boost" : "close-shutter";
      const secondCounter = second.activeContact!.definitionId === "T003" ? "emergency-boost" : "close-shutter";
      expect(firstService.counterThreat(first, firstCounter)).toBe(true);
      expect(secondService.counterThreat(second, secondCounter)).toBe(true);
    }

    expect(firstOrder).toEqual(secondOrder);
    expect(first.phase).toBe("aftermath");
    expect(first.activeContact).toBeUndefined();
    expect(first.ledger.filter((entry) => entry.source === "aftermath.night-complete")).toHaveLength(1);
  });

  it("maps shipped route threat levels to one, two, and three contacts", () => {
    for (const [routeId, totalWaves] of [["RN01", 1], ["RN02", 2], ["RN03", 3]] as const) {
      const routeRun = createRun(`route-wave-${routeId}`);
      routeRun.selectedRouteNodeId = routeId;
      new RunService().beginNight(routeRun);
      expect(routeRun.activeContact).toMatchObject({ wave: 1, totalWaves });
    }
  });

  it("keeps the safe route at one contact and only finishes after that wave", () => {
    const run = createRun("safe-route-wave");
    const service = new RunService();
    run.selectedRouteNodeId = "RN01";

    service.beginNight(run);

    expect(run.activeContact).toMatchObject({ wave: 1, totalWaves: 1 });
    const counter = run.activeContact!.definitionId === "T003" ? "emergency-boost" : "close-shutter";
    expect(service.counterThreat(run, counter)).toBe(true);
    expect(run.phase).toBe("aftermath");
  });

  it("advances to the next route wave after each visible breach", () => {
    const run = createRun("breach-waves");
    const service = new RunService();
    run.selectedRouteNodeId = "RN03";

    service.beginNight(run);

    for (let wave = 1; wave <= 3; wave += 1) {
      run.activeContact!.secondsLeft = 1;
      service.tickNight(run);
      expect(run.activeContact).toMatchObject({ wave, totalWaves: 3, stage: "breach" });
      service.tickNight(run);
      if (wave < 3) {
        expect(run.phase).toBe("night");
        expect(run.activeContact).toMatchObject({ wave: wave + 1, totalWaves: 3, stage: "approach" });
      }
    }

    expect(run.phase).toBe("aftermath");
    expect(run.activeContact).toBeUndefined();
    expect(run.environment.hull).toBeLessThan(100);
  });

  it("applies the selected ration plan during dawn settlement", () => {
    const run = createRun("ration-plan");
    const service = new RunService();
    service.setRation(run, "full");
    const food = run.resources.food;
    const trust = run.survivor.trust;

    service.finishNight(run);

    expect(run.resources.food).toBe(food - 2);
    expect(run.survivor.trust).toBe(trust + 3);
  });

  it("blocks module-dependent counters when their equipment is off", () => {
    const run = createRun("counter-readiness");
    const service = new RunService();
    service.beginNight(run);
    service.toggleModule(run, "M001");

    expect(service.counterThreat(run, "close-shutter")).toBe(false);
    expect(run.lastMessage).toContain("未供電");
  });

  it("lets no-countdown runs accept a standard-threat breach when every proper counter is unavailable", () => {
    const run = createRun("brace-impact-fallback");
    const service = new RunService();
    run.day = 7;
    run.phase = "night";
    run.resources.energy = 0;
    run.resources.fuel = 0;
    run.environment.hull = 100;
    run.story.finaleStage = "contact";
    run.story.finaleHealthBuffer = 0;
    run.activeContact = {
      id: "brace-impact-wave-2",
      definitionId: "T003",
      stage: "approach",
      secondsLeft: 7,
      wave: 2,
      totalWaves: 3,
    };
    const sleepBefore = run.survivor.sleep;
    const stressBefore = run.survivor.stress;

    expect(service.counterThreat(run, "brace-impact")).toBe(true);
    expect(run.environment.hull).toBe(70);
    expect(run.survivor.sleep).toBe(sleepBefore - 18);
    expect(run.survivor.stress).toBe(stressBefore + 12);
    expect(run.resources.energy).toBe(0);
    expect(run.resources.fuel).toBe(0);
    expect(run.activeContact).toMatchObject({ wave: 3, totalWaves: 3, stage: "approach" });
    expect(run.lastMessage).toContain("列車帶傷繼續前進");
  });

  it("ends a brace-impact run before it can advance after lethal hull damage", () => {
    const run = createRun("brace-impact-terminal");
    const service = new RunService();
    run.day = 7;
    run.phase = "night";
    run.environment.hull = 20;
    run.story.finaleStage = "contact";
    run.activeContact = {
      id: "brace-impact-lethal",
      definitionId: "T003",
      stage: "approach",
      secondsLeft: 7,
      wave: 2,
      totalWaves: 3,
    };

    expect(service.counterThreat(run, "brace-impact")).toBe(true);
    expect(run.environment.hull).toBe(0);
    expect(run.ended).toBe(true);
    expect(run.phase).toBe("ending");
    expect(run.outcome).toBe("hull-lost");
    expect(run.activeContact).toBeUndefined();
  });

  it("preserves breach sleep damage in the dawn calculation", () => {
    const run = createRun("fixed");
    const service = new RunService();
    run.environment.hull = 82;
    run.survivor.sleep = 82;
    service.finishNight(run);
    expect(run.survivor.sleep).toBeLessThan(100);
    expect(run.phase).toBe("aftermath");
  });

  it("holds the breach stage for one visible simulation tick before aftermath", () => {
    const run = createRun("visible-breach");
    const service = new RunService();
    service.beginNight(run);
    run.activeContact!.secondsLeft = 1;

    service.tickNight(run);
    expect(run.phase).toBe("night");
    expect(run.activeContact?.stage).toBe("breach");

    service.tickNight(run);
    expect(run.phase).toBe("aftermath");
    expect(run.activeContact).toBeUndefined();
  });

  it("ends the run when the carriage loses structural integrity", () => {
    const run = createRun("terminal-hull");
    const service = new RunService();
    run.environment.hull = 0;

    service.finishNight(run);

    expect(run.phase).toBe("ending");
    expect(run.ended).toBe(true);
    expect(run.outcome).toBe("hull-lost");
  });

  it("uses the GDD threat identifiers for the playable contacts", () => {
    expect(THREATS.map((threat) => threat.id)).toEqual(["T002", "T003", "T004", "T005", "T006", "T009"]);
  });

  it("ships the twelve-module GDD catalogue", () => {
    expect(MODULES).toHaveLength(12);
  });

  it("makes every authored event reachable from a route rotation", () => {
    const reachable = new Set(Object.values(ROUTE_EVENT_POOLS).flat());
    expect(reachable).toEqual(new Set(EVENTS.map((event) => event.id)));
  });

  it("plays the full seven-night story through the Day 4 detour and reroute ending", () => {
    const run = createRun("seven-night-release");
    const service = new RunService();
    const contacts = new Set<string>();
    const storyChoices: Record<string, string> = {
      EV041: "full",
      EV042: "keep",
      EV043: "compare",
      EV044: "DETOUR",
      EV045: "verify",
      EV046: "scan",
      EV047: "read",
      EV048: "tell",
      EV049: "answer",
      EV050: "inspect",
      EV051: "reroute",
      EV052: "truth",
    };
    const counters: Record<string, string> = {
      T002: "close-shutter",
      T003: "emergency-boost",
    };
    run.resources.fuel = 200;
    run.resources.energy = 100;
    run.resources.parts = 20;
    run.resources.food = 30;
    run.resources.water = 30;
    service.toggleModule(run, "M002");
    service.toggleModule(run, "M003");

    while (!run.ended) {
      if (run.phase === "prep") service.chooseRoute(run, "RN01");
      while (run.phase === "travel" && run.activeEventId) {
        const event = service.getEvent(run);
        if (!event) throw new Error(`Expected story event ${run.activeEventId}`);
        const choiceId = storyChoices[event.id];
        const choice = event.choices.find((candidate) => candidate.id === choiceId) ?? event.choices[0]!;
        expect(service.resolveEvent(run, choice)).toBe(true);
      }
      while (run.phase === "night" && run.activeContact) {
        const contact = run.activeContact;
        const contactId = contact.definitionId;
        contacts.add(contactId);
        if (contact.interaction?.kind === "T004") {
          expect(service.interactThreat(run, `cutter:${contact.interaction.targetPlotId}`).resolved).toBe(true);
        } else if (contact.interaction?.kind === "T005") {
          expect(service.interactThreat(run, `signal:${contact.interaction.targetSignalId}`).resolved).toBe(true);
        } else if (contact.interaction?.kind === "T006") {
          const command = contact.interaction.mode === "leaf" ? "trace:leaves" : "trace:meter";
          expect(service.interactThreat(run, command).resolved).toBe(true);
        } else {
          expect(service.counterThreat(run, counters[contactId]!)).toBe(true);
        }
      }
      if (run.phase === "aftermath") service.continueAftermath(run);
    }

    expect(run.day).toBe(7);
    expect(run.phase).toBe("ending");
    expect(contacts).toEqual(new Set(["T002", "T003", "T004"]));
    expect(run.story.flags.day4Route).toBe("DETOUR");
    expect(run.story.flags.trueRouteData).toBe(true);
    expect(run.story.completedContactWaves).toBe(3);
    expect(run.story.endingId).toBe("reroute");
  });
});
