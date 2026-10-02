import { describe, expect, it } from "vitest";
import { createRun } from "../src/game/model";
import {
  MODULE_EFFECT_SUPPORT,
  TECH_EFFECT_SUPPORT,
  applyRainCollectionEffect,
  applyRouteCompletionEffects,
  getCounterEnergyCost,
  getEnergyCapacity,
  getRepairHullAmount,
  resolveIncomingHullDamage,
} from "../src/game/module-effects";
import { createVoyageState } from "../src/game/voyage/engine";
import type { VoyageRunInput } from "../src/game/voyage/types";

function effectRun(): VoyageRunInput {
  return { ...createRun("effect-v2"), voyage: createVoyageState() };
}

function addModule(run: VoyageRunInput, definitionId: string): void {
  run.modules.push({
    id: `test-${definitionId}`,
    definitionId,
    slotId: `test-${definitionId}`,
    active: true,
    powered: true,
    durability: 100,
    mk: 1,
  });
}

describe("v2 module and technology effects", () => {
  it("has an explicit supported rule for all 12 modules and 8 technologies", () => {
    expect(MODULE_EFFECT_SUPPORT).toHaveLength(12);
    expect(MODULE_EFFECT_SUPPORT.every((entry) => entry.supported && entry.rule.length > 0)).toBe(true);
    expect(TECH_EFFECT_SUPPORT).toHaveLength(8);
    expect(TECH_EFFECT_SUPPORT.every((entry) => entry.supported && entry.rule.length > 0)).toBe(true);
  });

  it("applies E2 route recovery and refuses the same settlement twice", () => {
    const run = effectRun();
    run.techOwned.push("E2");
    run.resources.energy = 50;
    const first = applyRouteCompletionEffects(run, "RN02");
    expect(first).toMatchObject({ ok: true, resourceDelta: { energy: 4 } });
    const second = applyRouteCompletionEffects({ ...run, voyage: first.stateDraft }, "RN02");
    expect(second.ok).toBe(false);
    expect(second.resourceDelta).toEqual({});
  });

  it("raises capacity through E3 and M007 and discounts low-reserve counters", () => {
    const run = effectRun();
    run.techOwned.push("E3");
    addModule(run, "M007");
    expect(getEnergyCapacity(run)).toBe(135);
    run.resources.energy = 20;
    expect(getCounterEnergyCost(run, 8)).toBe(6);
    run.modules.find((module) => module.definitionId === "M007")!.powered = false;
    expect(getEnergyCapacity(run)).toBe(120);
    expect(getCounterEnergyCost(run, 8)).toBe(8);
  });

  it("makes D1 and M011 materially reduce window damage", () => {
    const base = effectRun();
    base.modules.find((module) => module.definitionId === "M001")!.powered = false;
    const baseDamage = resolveIncomingHullDamage(base, { rawDamage: 20, anchor: "right-window", beforeAttackStage: false });
    const protectedRun = effectRun();
    protectedRun.modules.find((module) => module.definitionId === "M001")!.powered = false;
    protectedRun.techOwned.push("D1");
    addModule(protectedRun, "M011");
    const protectedDamage = resolveIncomingHullDamage(protectedRun, { rawDamage: 20, anchor: "right-window", beforeAttackStage: false });
    expect(baseDamage.finalDamage).toBeGreaterThan(protectedDamage.finalDamage);
    expect(protectedDamage).toMatchObject({ finalDamage: 9, prevented: 11 });
    expect(getRepairHullAmount(protectedRun)).toBe(18);
  });

  it("makes M010 recover rainwater once and a powered M012 blunt an attack", () => {
    const rainRun = effectRun();
    rainRun.resources.water = 3;
    addModule(rainRun, "M010");
    const rain = applyRainCollectionEffect(rainRun, "rain");
    expect(rain).toMatchObject({ ok: true, resourceDelta: { water: 2 } });
    expect(applyRainCollectionEffect({ ...rainRun, voyage: rain.stateDraft }, "storm").ok).toBe(false);

    const trapRun = effectRun();
    addModule(trapRun, "M012");
    const hit = resolveIncomingHullDamage(trapRun, { rawDamage: 18, anchor: "door", beforeAttackStage: true });
    expect(hit).toMatchObject({ finalDamage: 8, prevented: 10, resourceDelta: {}, environmentDelta: { hull: -8 } });
    expect(hit.sources).toContain("M012");
  });
});
