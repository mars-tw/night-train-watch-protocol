import { beforeEach, describe, expect, it } from "vitest";
import { createRun } from "../src/game/model";
import { createProfile, repairProfile } from "../src/game/profile";
import {
  applyProfileLoadout,
  BLUEPRINT_LOADOUTS,
  COSMETIC_LOADOUTS,
  prepareProfileLoadoutSelection,
} from "../src/game/profile-loadouts";
import { claimQuestRewards, emitQuestEvent } from "../src/game/quests";
import { SaveService } from "../src/game/save";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  public get length(): number { return this.values.size; }
  public clear(): void { this.values.clear(); }
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  public removeItem(key: string): void { this.values.delete(key); }
  public setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

describe("profile loadouts", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
    Object.defineProperty(globalThis, "indexedDB", { value: undefined, configurable: true });
  });

  it("defines all nine budgeted blueprints and eight cosmetic-only rewards", () => {
    expect(BLUEPRINT_LOADOUTS).toHaveLength(9);
    expect(COSMETIC_LOADOUTS).toHaveLength(8);
    expect(new Set(BLUEPRINT_LOADOUTS.map((item) => item.id)).size).toBe(9);
    expect(new Set(COSMETIC_LOADOUTS.map((item) => item.id)).size).toBe(8);
    expect(BLUEPRINT_LOADOUTS.every((item) => item.tradeoff.length > 0)).toBe(true);
  });

  it("rejects unowned selections and prepares an immutable owned draft", () => {
    const profile = createProfile("loadout-owner", 1);
    const activeRun = createRun("already-running");
    const activeResources = structuredClone(activeRun.resources);
    const denied = prepareProfileLoadoutSelection(profile, "blueprint", "BP-BURST-BUFFER", 2);
    expect(denied).toMatchObject({ status: "ineligible", profile });

    profile.blueprints.push("BP-BURST-BUFFER");
    const selected = prepareProfileLoadoutSelection(profile, "blueprint", "BP-BURST-BUFFER", 3);
    expect(selected.status).toBe("prepared");
    expect(selected.profile).not.toBe(profile);
    expect(selected.profile.selectedBlueprintId).toBe("BP-BURST-BUFFER");
    expect(profile.selectedBlueprintId).toBeUndefined();
    expect(activeRun.resources).toEqual(activeResources);

    const standard = prepareProfileLoadoutSelection(selected.profile, "blueprint", undefined, 4);
    expect(standard).toMatchObject({ status: "prepared" });
    expect(standard.profile.selectedBlueprintId).toBeUndefined();
  });

  it("repairs selections unless the known reward is still owned", () => {
    const kept = repairProfile({
      ...createProfile("kept-loadout", 1),
      blueprints: ["BP-QUIET-WIRING"],
      decorations: ["COS-TRAIN-STAMP"],
      selectedBlueprintId: "BP-QUIET-WIRING",
      selectedCosmeticId: "COS-TRAIN-STAMP",
    });
    expect(kept).toMatchObject({
      selectedBlueprintId: "BP-QUIET-WIRING",
      selectedCosmeticId: "COS-TRAIN-STAMP",
    });

    const repaired = repairProfile({
      ...kept,
      blueprints: [],
      decorations: ["COS-NOT-REAL"],
    });
    expect(repaired.selectedBlueprintId).toBeUndefined();
    expect(repaired.selectedCosmeticId).toBeUndefined();
  });

  it.each([
    ["BP-STARTER-SEED-TRAY", { food: 6, parts: 7 }, {}],
    ["BP-QUIET-WIRING", { energy: 70 }, { noise: 10 }],
    ["BP-BURST-BUFFER", { energy: 85, parts: 6 }, {}],
    ["BP-BLACKOUT-SHUTTER", {}, { noise: 10, visibility: 36 }],
    ["BP-OBSERVATION-FRAME", { data: 1, energy: 70 }, {}],
    ["BP-CLOSED-RETURN", { water: 7, parts: 7 }, {}],
    ["BP-ISOLATED-TRAYS", { water: 7, fuel: 38 }, {}],
    ["BP-WARM-BERTH", { energy: 70 }, { temperature: 20 }],
    ["BP-MEDICAL-BERTH", { medicine: 2, parts: 6 }, {}],
  ] as const)("applies %s once with its visible tradeoff", (id, resources, environment) => {
    const profile = createProfile(`profile-${id}`, 1);
    profile.blueprints.push(id);
    profile.selectedBlueprintId = id;
    const run = createRun(`run-${id}`, "R01", profile);
    expect(run.resources).toMatchObject(resources);
    expect(run.environment).toMatchObject(environment);
    expect(run.flags).toContain(`starting-blueprint:${id}`);

    const reapplied = applyProfileLoadout(run, profile);
    expect(reapplied.resources).toEqual(run.resources);
    expect(reapplied.environment).toEqual(run.environment);
    expect(reapplied.flags.filter((flag) => flag === `starting-blueprint:${id}`)).toHaveLength(1);
  });

  it.each([
    ["BP-CLOSED-RETURN", { energy: 80, water: 8, parts: 7 }],
    ["BP-ISOLATED-TRAYS", { energy: 80, water: 8, fuel: 38 }],
  ] as const)("uses the declared energy fallback for capped R03 water on %s", (id, expected) => {
    const profile = createProfile(`r03-${id}`, 1);
    profile.blueprints.push(id);
    profile.selectedBlueprintId = id;
    const run = createRun(`r03-run-${id}`, "R03", profile);
    expect(run.resources).toMatchObject(expected);
    expect(run.flags).toContain("starting-blueprint-fallback:energy");
  });

  it("applies a cosmetic flag without changing any run number", () => {
    const standard = createRun("standard-cosmetic");
    const profile = createProfile("cosmetic-profile", 1);
    profile.decorations.push("COS-TRAIN-STAMP");
    profile.selectedCosmeticId = "COS-TRAIN-STAMP";
    const styled = createRun("styled-cosmetic", "R01", profile);
    expect(styled.resources).toEqual(standard.resources);
    expect(styled.environment).toEqual(standard.environment);
    expect(styled.survivor).toEqual(standard.survivor);
    expect(styled.flags).toContain("cosmetic:COS-TRAIN-STAMP");
  });

  it("starts every new run from its route budget without carrying the prior run", () => {
    const profile = createProfile("repeat-profile", 1);
    profile.blueprints.push("BP-BURST-BUFFER");
    profile.selectedBlueprintId = "BP-BURST-BUFFER";
    const first = createRun("first-loadout", "R01", profile);
    first.resources.energy = 1;
    first.resources.food = 99;
    first.techOwned.push("E1");
    const second = createRun("second-loadout", "R01", profile);
    expect(second.resources).toMatchObject({ energy: 85, food: 5, parts: 6 });
    expect(second.techOwned).toEqual([]);
    expect(second.quests.runId).toBe(second.runId);
    expect(second.runId).not.toBe(first.runId);
  });

  it("persists claim, selection and reload before applying the next run", async () => {
    const saves = new SaveService();
    const run = createRun("claim-select-run");
    const profile = createProfile("claim-select-profile", 1);
    emitQuestEvent(run, "action.committed", {
      eventId: "claim-select-plant",
      transactionId: "claim-select-plant",
      operation: "crop.plant",
      targetId: "plot-a",
      result: "success",
    });
    const claim = claimQuestRewards(run, profile, "TUT-03");
    expect(claim.status).toBe("prepared");
    const selection = prepareProfileLoadoutSelection(
      claim.profile,
      "blueprint",
      "BP-STARTER-SEED-TRAY",
      2,
    );
    expect(selection.status).toBe("prepared");
    await saves.save(claim.run, selection.profile);

    const loaded = await saves.load();
    expect(loaded.profile.selectedBlueprintId).toBe("BP-STARTER-SEED-TRAY");
    const nextRun = createRun("claim-selected-next", "R01", loaded.profile);
    expect(nextRun.resources).toMatchObject({ food: 6, parts: 7 });
    expect(nextRun.flags).toContain("starting-blueprint:BP-STARTER-SEED-TRAY");
  });
});
