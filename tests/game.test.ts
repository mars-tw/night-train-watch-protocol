import { describe, expect, it } from "vitest";
import { EVENTS, MODULES, ROUTE_EVENT_POOLS, THREATS } from "../src/game/content";
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

  it("moves from route to event to a threat contact", () => {
    const run = createRun("fixed");
    const service = new RunService();
    service.chooseRoute(run, "RN02");
    expect(run.phase).toBe("travel");
    expect(run.activeEventId).toBe("EV004");
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

  it("turns harvest into a once-per-day AP and water tradeoff", () => {
    const run = createRun("harvest-loop");
    const service = new RunService();
    const before = { ap: run.actionPoints, food: run.resources.food, water: run.resources.water };

    expect(service.harvest(run)).toBe(true);
    expect(run.actionPoints).toBe(before.ap - 1);
    expect(run.resources.food).toBe(before.food + 2);
    expect(run.resources.water).toBe(before.water - 1);
    expect(service.harvest(run)).toBe(false);
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
    expect(THREATS.map((threat) => threat.id)).toEqual(["T002", "T003"]);
  });

  it("ships the twelve-module GDD catalogue", () => {
    expect(MODULES).toHaveLength(12);
  });

  it("makes every authored event reachable from a route rotation", () => {
    const reachable = new Set(Object.values(ROUTE_EVENT_POOLS).flat());
    expect(reachable).toEqual(new Set(EVENTS.map((event) => event.id)));
  });

  it("rotates both threats and completes the full seven-night route", () => {
    const run = createRun("seven-night-release");
    const service = new RunService();
    const contacts = new Set<string>();
    run.resources.fuel = 60;
    service.toggleModule(run, "M002");
    service.toggleModule(run, "M003");

    while (!run.ended) {
      service.chooseRoute(run, "RN01");
      const event = service.getEvent(run);
      if (!event) throw new Error("Expected a route event");
      const safeChoice = event.choices.find((choice) => Object.values(choice.deltas).every((delta) => (delta ?? 0) >= 0)) ?? event.choices.at(-1)!;
      expect(service.resolveEvent(run, safeChoice)).toBe(true);
      const contactId = run.activeContact!.definitionId;
      contacts.add(contactId);
      const counter = contactId === "T003" ? "emergency-boost" : "close-shutter";
      expect(service.counterThreat(run, counter)).toBe(true);
      service.continueAftermath(run);
    }

    expect(run.day).toBe(7);
    expect(run.phase).toBe("ending");
    expect(contacts).toEqual(new Set(["T002", "T003"]));
  });
});
