import { describe, expect, it } from "vitest";
import { MODULES, THREATS } from "../src/game/content";
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
    expect(run.modules.some((module) => module.definitionId === target.id)).toBe(true);
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

  it("uses the GDD threat identifiers for the playable contacts", () => {
    expect(THREATS.map((threat) => threat.id)).toEqual(["T002", "T003"]);
  });
});
