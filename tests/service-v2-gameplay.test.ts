import { describe, expect, it } from "vitest";
import { ALL_STORY_EVENTS, MODULES } from "../src/game/content";
import { createRun } from "../src/game/model";
import { createRng } from "../src/game/rng";
import { RunService } from "../src/game/services";
import type { ModuleInstance, RunState, StoryRouteId } from "../src/game/types";

function runFor(seed: string, routeId: StoryRouteId = "R01", day = 1): RunState {
  const run = createRun(seed, routeId);
  run.day = day;
  run.phase = "prep";
  run.story.seenEventIds = ALL_STORY_EVENTS.map((event) => event.id);
  return run;
}

function addModule(run: RunState, definitionId: string): ModuleInstance {
  const instance: ModuleInstance = {
    id: `service-${definitionId}-${run.modules.length}`,
    definitionId,
    slotId: `legacy-${definitionId}`,
    active: true,
    powered: true,
    durability: 100,
    mk: 1,
  };
  run.modules.push(instance);
  return instance;
}

function setContact(run: RunState, definitionId: string, secondsLeft = 1): void {
  run.phase = "night";
  run.activeContact = {
    id: `test-${definitionId}`,
    definitionId,
    stage: "attack",
    secondsLeft,
    wave: 1,
    totalWaves: 1,
  };
}

describe("RunService v2 atomic actions", () => {
  it("prevalidates AP and resource costs before adopting any voyage draft", () => {
    const service = new RunService();
    const run = runFor("atomic-voyage", "R01", 2);
    run.actionPoints = 0;
    const before = structuredClone(run);

    expect(service.startExpedition(run, "fog-relay")).toBe(false);
    expect(run.resources).toEqual(before.resources);
    expect(run.actionPoints).toBe(0);
    expect(run.voyage).toEqual(before.voyage);

    run.actionPoints = 5;
    run.resources.parts = 1;
    expect(service.refillSupplies(run, "refill-battery")).toBe(false);
    expect(run.resources.parts).toBe(1);
    expect(run.actionPoints).toBe(5);
  });

  it("commits expedition deltas, state, ledger, and quest event exactly once", () => {
    const service = new RunService();
    const run = runFor("service-expedition", "R01", 2);
    const ap = run.actionPoints;
    expect(service.startExpedition(run, "fog-relay")).toBe(true);
    expect(run.actionPoints).toBe(ap - 1);
    expect(run.voyage?.activeExpedition?.siteId).toBe("fog-relay");
    expect(run.quests.eventHistory.filter((event) => event.type === "expedition.started")).toHaveLength(1);

    expect(service.chooseExpeditionStep(run, "survey")).toBe(true);
    expect(run.resources.data).toBe(1);
    expect(run.ledger.filter((entry) => entry.key === "data")).toHaveLength(1);
    expect(service.withdrawExpedition(run)).toBe(true);
    expect(run.voyage?.expeditions[0]?.collected).toEqual({ data: 1 });
    expect(service.withdrawExpedition(run)).toBe(false);
    expect(run.quests.eventHistory.filter((event) => event.type === "expedition.resolved")).toHaveLength(1);
  });

  it("exposes playable relationship, inspection, and refill methods with dedupe", () => {
    const service = new RunService();
    const run = runFor("service-actions", "R01", 2);
    run.resources.energy = 20;
    expect(service.chooseRelationship(run, "A-07", "ask-details")).toBe(true);
    expect(service.chooseRelationship(run, "A-07", "ask-details")).toBe(false);
    expect(service.inspectObject(run, "sleep-bed")).toBe(true);
    expect(service.inspectObject(run, "passenger-breathing")).toBe(false);
    expect(service.inspectObject(run, "defense-window")).toBe(true);
    expect(run.quests.eventHistory.filter((event) => event.operation === "inspect")).toHaveLength(2);
    const ap = run.actionPoints;
    expect(service.refillSupplies(run, "refill-battery")).toBe(true);
    expect(run.actionPoints).toBe(ap - 1);
    expect(run.resources).toMatchObject({ energy: 35, parts: 6 });
    expect(service.refillSupplies(run, "refill-battery")).toBe(false);
  });
});

describe("RunService v2 module wiring", () => {
  it("uses E3 and M007 for a real 135 energy capacity and E2 for route recovery", () => {
    const service = new RunService();
    const run = runFor("energy-effects");
    run.techOwned.push("E2", "E3");
    addModule(run, "M007");
    run.resources.energy = 100;
    expect(service.applyResource(run, "energy", 50, "test.capacity")).toBe(true);
    expect(run.resources.energy).toBe(135);
    run.resources.energy = 50;
    service.chooseRoute(run, "RN01");
    expect(run.resources.energy).toBe(54);
    expect(run.resources.fuel).toBe(36);
  });

  it("allocates the 105-second night, applies M004 warning time, and blocks duplicate begin", () => {
    const service = new RunService();
    const run = runFor("night-duration");
    addModule(run, "M004");
    run.selectedRouteNodeId = "RN01";
    service.beginNight(run);
    expect(run.activeContact?.secondsLeft).toBe(33);
    const energy = run.resources.energy;
    const powerEntries = run.ledger.filter((entry) => entry.source === "night.power-grid").length;
    service.beginNight(run);
    expect(run.resources.energy).toBe(energy);
    expect(run.ledger.filter((entry) => entry.source === "night.power-grid")).toHaveLength(powerEntries);
  });

  it("uses M008 reserve for life support and M006 as a noisy four-second delay", () => {
    const service = new RunService();
    const reserveRun = runFor("reserve-grid");
    addModule(reserveRun, "M008");
    reserveRun.resources.energy = 0;
    reserveRun.selectedRouteNodeId = "RN01";
    service.beginNight(reserveRun);
    expect(reserveRun.modules.find((module) => module.definitionId === "M002")?.powered).toBe(true);
    expect(reserveRun.resources.energy).toBe(0);
    expect(reserveRun.lastMessage).toContain("備援 4 E");

    const decoyRun = runFor("decoy-delay");
    addModule(decoyRun, "M006");
    setContact(decoyRun, "T003", 10);
    const noise = decoyRun.environment.noise;
    const energy = decoyRun.resources.energy;
    expect(service.counterThreat(decoyRun, "decoy")).toBe(true);
    expect(decoyRun.activeContact).toMatchObject({ stage: "approach", secondsLeft: 14 });
    expect(decoyRun.environment.noise).toBe(noise + 6);
    expect(decoyRun.resources.energy).toBe(energy - 6);
  });

  it("makes M011, D1, and M012 materially reduce breach damage", () => {
    const service = new RunService();
    const windowRun = runFor("window-defense");
    windowRun.modules.find((module) => module.definitionId === "M001")!.powered = false;
    addModule(windowRun, "M011");
    windowRun.techOwned.push("D1");
    setContact(windowRun, "T002");
    service.tickNight(windowRun);
    expect(windowRun.environment.hull).toBe(97);

    const trapRun = runFor("trap-defense");
    addModule(trapRun, "M012");
    setContact(trapRun, "T003");
    const energy = trapRun.resources.energy;
    service.tickNight(trapRun);
    expect(trapRun.environment.hull).toBe(92);
    expect(trapRun.resources.energy).toBe(energy);
  });

  it("enforces functional slot capacity and applies M009 build and repair bonuses", () => {
    const service = new RunService();
    const run = runFor("functional-slots");
    run.resources.parts = 20;
    addModule(run, "M009");
    const parts = run.resources.parts;
    expect(service.buildModule(run, "M004")).toBe(true);
    expect(run.resources.parts).toBe(parts - (MODULES.find((module) => module.id === "M004")!.cost - 1));
    expect(run.modules.find((module) => module.definitionId === "M004")?.slotId).toBe("workshop-door");

    expect(service.buildModule(run, "M006")).toBe(true);
    const beforeRejected = { parts: run.resources.parts, ap: run.actionPoints };
    expect(service.buildModule(run, "M012")).toBe(false);
    expect({ parts: run.resources.parts, ap: run.actionPoints }).toEqual(beforeRejected);

    run.actionPoints = 5;
    run.environment.hull = 50;
    run.techOwned.push("D1");
    expect(service.repairCarriage(run)).toBe(true);
    expect(run.environment.hull).toBe(71);
  });

  it("settles M010 rain recovery once at dawn", () => {
    let seed = "rain-0";
    for (let index = 0; index < 200; index += 1) {
      const candidate = `rain-${index}`;
      if (createRng(candidate, "weather:D1")() < 0.46) {
        seed = candidate;
        break;
      }
    }
    const service = new RunService();
    const run = runFor(seed);
    addModule(run, "M010");
    run.resources.water = 3;
    service.finishNight(run);
    expect(run.resources.water).toBe(4);
    const recoveryEntries = run.ledger.filter((entry) => entry.source === "effect-rain-1");
    expect(recoveryEntries).toHaveLength(1);
    service.finishNight(run);
    expect(run.ledger.filter((entry) => entry.source === "effect-rain-1")).toHaveLength(1);
  });
});

describe("RunService v2 facility wiring", () => {
  it("makes quiet and burst core branches change noise and counter cost", () => {
    const quietService = new RunService();
    const quiet = runFor("facility-quiet", "R01", 2);
    quiet.resources.parts = 20;
    expect(quietService.upgradeFacility(quiet, "power-core", "quiet")).toBe(true);
    quiet.selectedRouteNodeId = "RN01";
    const noise = quiet.environment.noise;
    quietService.beginNight(quiet);
    expect(quiet.environment.noise).toBe(noise - 4);

    const burstService = new RunService();
    const burst = runFor("facility-burst", "R01", 2);
    burst.resources.parts = 20;
    expect(burstService.upgradeFacility(burst, "power-core", "burst")).toBe(true);
    setContact(burst, "T002", 10);
    const energy = burst.resources.energy;
    expect(burstService.counterThreat(burst, "shock-window")).toBe(true);
    expect(burst.resources.energy).toBe(energy - 10);
  });

  it("makes covered and visible window branches change protection, sight, and warning", () => {
    const coveredService = new RunService();
    const covered = runFor("facility-covered", "R01", 2);
    covered.resources.parts = 20;
    expect(coveredService.upgradeFacility(covered, "window-frame", "covered")).toBe(true);
    expect(covered.environment.visibility).toBe(34);
    setContact(covered, "T002");
    coveredService.tickNight(covered);
    expect(covered.environment.hull).toBe(95);

    const visibleService = new RunService();
    const visible = runFor("facility-visible", "R01", 2);
    visible.resources.parts = 20;
    expect(visibleService.upgradeFacility(visible, "window-frame", "visible")).toBe(true);
    expect(visible.environment.visibility).toBe(48);
    visible.selectedRouteNodeId = "RN01";
    visibleService.beginNight(visible);
    expect(visible.activeContact?.secondsLeft).toBe(108);
  });

  it("makes closed return save water with a pollution cost and isolated trays waive manual-drain water", () => {
    const closedService = new RunService();
    const closed = runFor("facility-closed", "R01", 3);
    closed.resources.parts = 20;
    expect(closedService.upgradeFacility(closed, "greenhouse-loop", "closed")).toBe(true);
    closed.crops[0] = { id: "plot-a", cropId: "tomato", stage: 1, plantedDay: 2, wateredDay: 2, poweredGrowthNights: 0, dryDays: 0 };
    const water = closed.resources.water;
    const infection = closed.survivor.infection;
    expect(closedService.waterCrops(closed)).toBe(true);
    expect(closed.resources.water).toBe(water);
    expect(closed.survivor.infection).toBe(infection + 2);

    const greenClosedService = new RunService();
    const greenClosed = runFor("facility-closed-green", "R03", 3);
    greenClosed.resources.parts = 20;
    expect(greenClosedService.upgradeFacility(greenClosed, "greenhouse-loop", "closed")).toBe(true);
    greenClosed.crops[0] = { id: "plot-a", cropId: "tomato", stage: 1, plantedDay: 2, wateredDay: 2, poweredGrowthNights: 0, dryDays: 0 };
    expect(greenClosedService.waterCrops(greenClosed)).toBe(true);
    expect(greenClosed.story.greenTide?.reservoirContamination).toBe(6);
    expect(greenClosed.story.greenTide?.plotContamination["plot-a"]).toBe(1);

    const plainService = new RunService();
    const plain = runFor("manual-drain-plain", "R03", 3);
    plain.resources.water = 0;
    expect(plainService.applyGreenCycleCommand(plain, "cycle:manual-drain").status).toBe("insufficient");

    const isolatedService = new RunService();
    const isolated = runFor("manual-drain-isolated", "R03", 3);
    isolated.resources.parts = 20;
    expect(isolatedService.upgradeFacility(isolated, "greenhouse-loop", "isolated")).toBe(true);
    isolated.resources.water = 0;
    expect(isolatedService.applyGreenCycleCommand(isolated, "cycle:manual-drain").status).toBe("resolved");
    expect(isolated.resources.water).toBe(0);
  });

  it("makes warm berth improve dawn sleep and medical berth plus M005 improve treatment", () => {
    const baseService = new RunService();
    const base = runFor("warm-base", "R01", 2);
    base.survivor.sleep = 50;
    baseService.finishNight(base);

    const warmService = new RunService();
    const warm = runFor("warm-facility", "R01", 2);
    warm.resources.parts = 20;
    expect(warmService.upgradeFacility(warm, "bedside-bay", "warmth")).toBe(true);
    warm.survivor.sleep = 50;
    warmService.finishNight(warm);
    expect(warm.survivor.sleep - base.survivor.sleep).toBe(6);

    const medicalService = new RunService();
    const medical = runFor("medical-facility", "R01", 2);
    medical.resources.parts = 20;
    medical.resources.medicine = 1;
    addModule(medical, "M005");
    expect(medicalService.upgradeFacility(medical, "bedside-bay", "medical")).toBe(true);
    medical.survivor.health = 50;
    medical.survivor.infection = 20;
    expect(medicalService.useMedicine(medical)).toBe(true);
    expect(medical.survivor.health).toBe(72);
    expect(medical.survivor.infection).toBe(10);
    expect(medical.resources.medicine).toBe(0);
  });
});

describe("RunService v2 crop timing", () => {
  it("matures lettuce in one powered night and tomato in three", () => {
    const lettuceService = new RunService();
    const lettuce = runFor("lettuce-growth");
    expect(lettuceService.plantCrop(lettuce, "plot-a", "lettuce")).toBe(true);
    lettuce.phase = "aftermath";
    lettuceService.continueAftermath(lettuce);
    expect(lettuce.crops[0]).toMatchObject({ stage: 3, poweredGrowthNights: 1 });

    const tomatoService = new RunService();
    const tomato = runFor("tomato-growth");
    expect(tomatoService.plantCrop(tomato, "plot-a", "tomato")).toBe(true);
    tomato.phase = "aftermath";
    tomatoService.continueAftermath(tomato);
    expect(tomato.crops[0]).toMatchObject({ stage: 1, poweredGrowthNights: 1 });
    expect(tomatoService.waterCrops(tomato)).toBe(true);
    tomato.phase = "aftermath";
    tomatoService.continueAftermath(tomato);
    expect(tomato.crops[0]).toMatchObject({ stage: 2, poweredGrowthNights: 2 });
    expect(tomatoService.waterCrops(tomato)).toBe(true);
    tomato.phase = "aftermath";
    tomatoService.continueAftermath(tomato);
    expect(tomato.crops[0]).toMatchObject({ stage: 3, poweredGrowthNights: 3 });
  });

  it("does not increase powered growth nights while water or rack power is missing", () => {
    const service = new RunService();
    const run = runFor("crop-no-free-time");
    expect(service.plantCrop(run, "plot-a", "tomato")).toBe(true);
    run.modules.find((module) => module.definitionId === "M003")!.powered = false;
    run.phase = "aftermath";
    service.continueAftermath(run);
    expect(run.crops[0]).toMatchObject({ stage: 1, poweredGrowthNights: 0, dryDays: 1 });
  });
});
