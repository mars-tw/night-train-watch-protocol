import { beforeEach, describe, expect, it } from "vitest";
import { createRun } from "../src/game/model";
import { createProfile } from "../src/game/profile";
import { claimQuestRewards, emitQuestEvent } from "../src/game/quests";
import { parseRun, SaveService, saveKeys } from "../src/game/save";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  public failOnceFor: string | null = null;

  public get length(): number { return this.values.size; }
  public clear(): void { this.values.clear(); }
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  public removeItem(key: string): void { this.values.delete(key); }
  public setItem(key: string, value: string): void {
    if (this.failOnceFor === key) {
      this.failOnceFor = null;
      throw new Error("injected write failure");
    }
    this.values.set(key, String(value));
  }
}

describe("schema v6 save envelope", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
    Object.defineProperty(globalThis, "indexedDB", { value: undefined, configurable: true });
  });

  it("migrates legacy v1-v5 runs and rejects unsupported schemas", () => {
    const legacy = JSON.parse(JSON.stringify(createRun("legacy-v5", "R02"))) as Record<string, unknown>;
    legacy.schemaVersion = 5;
    delete legacy.runId;
    delete legacy.quests;
    const migrated = parseRun(JSON.stringify(legacy));
    expect(migrated).toMatchObject({ schemaVersion: 6, routeId: "R02" });
    expect(migrated?.runId).toBe("legacy-R02-legacy-v5");
    expect(migrated?.quests.importedFromLegacy).toBe(true);
    expect(() => parseRun(JSON.stringify({ ...legacy, schemaVersion: 7 }))).toThrow(/Invalid save schema/);
  });

  it("repairs legacy crop growth history without assuming a mature tomato", () => {
    const legacy = JSON.parse(JSON.stringify(createRun("legacy-crop-growth"))) as Record<string, any>;
    legacy.schemaVersion = 5;
    delete legacy.runId;
    delete legacy.quests;
    legacy.crops[0] = { id: "plot-a", cropId: "tomato", stage: 3, dryDays: 0 };
    legacy.crops[1] = { id: "plot-b", cropId: "lettuce", stage: 1, dryDays: 0 };
    const migrated = parseRun(JSON.stringify(legacy));
    expect(migrated?.crops[0]?.poweredGrowthNights).toBe(2);
    expect(migrated?.crops[1]?.poweredGrowthNights).toBe(0);
  });

  it("saves run and profile in one v2 envelope and preserves settings", async () => {
    const saves = new SaveService();
    const run = createRun("v2-envelope");
    const profile = createProfile("profile-envelope", 1);
    saves.saveSettings({ textScale: 120, reducedMotion: true, noCountdown: false, lowSpeed: true, sound: false });
    await saves.save(run, profile);

    const raw = storage.getItem(saveKeys.current);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toMatchObject({ format: "ntwp.v2", run: { runId: run.runId }, profile: { profileId: "profile-envelope" } });
    const loaded = await saves.load();
    expect(loaded).toMatchObject({ recovered: false, run: { runId: run.runId }, profile: { profileId: "profile-envelope" } });
    expect(saves.loadSettings()).toMatchObject({ textScale: 120, reducedMotion: true });
  });

  it("initializes physical module slots and round-trips voyage facilities", async () => {
    const saves = new SaveService();
    const run = createRun("voyage-persistence");
    expect(run.modules.map((module) => [module.definitionId, module.slotId])).toEqual([
      ["M001", "defense-window"],
      ["M002", "sleep-floor"],
      ["M003", "greenhouse-wall"],
    ]);
    expect(run.voyage).toMatchObject({ version: 2, facilities: {}, settlementIds: [] });
    run.voyage!.facilityChoices["bedside-use"] = "warmth";
    run.voyage!.facilities["bedside-bay"] = {
      missionId: "FAC-07",
      facilityId: "bedside-bay",
      upgradeId: "warm-berth",
      branchGroup: "bedside-use",
      branchChoice: "warmth",
      sceneState: "bedside-warm-berth",
      settlementId: "facility:bedside-warm",
    };
    await saves.save(run, createProfile("voyage-profile", 1));
    const loaded = await saves.load();
    expect(loaded.run?.voyage?.facilities["bedside-bay"]).toMatchObject({
      upgradeId: "warm-berth",
      sceneState: "bedside-warm-berth",
    });
  });

  it("recovers the complete prior envelope when current is corrupt", async () => {
    const saves = new SaveService();
    const first = createRun("backup-first");
    const second = createRun("backup-second", "R02");
    await saves.save(first, createProfile("profile-first", 1));
    await saves.save(second, createProfile("profile-second", 2));
    storage.setItem(saveKeys.current, "{broken");

    const loaded = await saves.load();
    expect(loaded).toMatchObject({
      recovered: true,
      run: { runId: first.runId },
      profile: { profileId: "profile-first" },
    });
  });

  it("merges monotonic profile progress into a backup run only for the same profile", async () => {
    const saves = new SaveService();
    const first = createRun("monotonic-first");
    const second = createRun("monotonic-second", "R02");
    const firstProfile = createProfile("same-profile", 1);
    const latestProfile = createProfile("same-profile", 1);
    latestProfile.updatedAt = 2;
    latestProfile.routeUnlocks.push("R02");
    latestProfile.blueprints.push("BP-LATEST");
    latestProfile.rewardReceipts.push("same-profile:BP-LATEST");
    await saves.save(first, firstProfile);
    await saves.save(second, latestProfile);
    storage.setItem(saveKeys.current, "{broken");

    const loaded = await saves.load();
    expect(loaded.recovered).toBe(true);
    expect(loaded.run?.runId).toBe(first.runId);
    expect(loaded.profile).toMatchObject({ profileId: "same-profile", routeUnlocks: ["R01", "R02"] });
    expect(loaded.profile.blueprints).toContain("BP-LATEST");
    expect(loaded.profile.rewardReceipts).toContain("same-profile:BP-LATEST");
    expect(loaded.run?.quests.rewardReceipts).not.toContain("same-profile:BP-LATEST");
  });

  it("keeps a reward claim as a draft when the envelope write fails", async () => {
    const saves = new SaveService();
    const run = createRun("write-failure");
    const profile = createProfile("profile-write-failure", 1);
    await saves.save(run, profile);
    emitQuestEvent(run, "action.committed", {
      eventId: "plant-for-write-failure",
      transactionId: "plant-for-write-failure",
      operation: "crop.plant",
      targetId: "plot-a",
      result: "success",
    });
    const draft = claimQuestRewards(run, profile, "TUT-03");
    expect(draft.status).toBe("prepared");
    storage.failOnceFor = saveKeys.current;
    await expect(saves.save(draft.run, draft.profile)).rejects.toThrow(/injected write failure/);

    expect(run.quests.missions["TUT-03"]!.lifecycle).toBe("completed");
    expect(profile.blueprints).not.toContain("BP-STARTER-SEED-TRAY");
    const loaded = await saves.load();
    expect(loaded.run?.quests.missions["TUT-03"]?.lifecycle).not.toBe("claimed");
    expect(loaded.profile.blueprints).not.toContain("BP-STARTER-SEED-TRAY");
  });

  it("reads legacy localStorage fixtures from run.current", async () => {
    const legacy = JSON.parse(JSON.stringify(createRun("legacy-key"))) as Record<string, unknown>;
    legacy.schemaVersion = 4;
    delete legacy.runId;
    delete legacy.quests;
    storage.setItem(saveKeys.legacyCurrent, JSON.stringify(legacy));
    const loaded = await new SaveService().load();
    expect(loaded).toMatchObject({ recovered: false, run: { schemaVersion: 6, seed: "legacy-key" } });
    expect(loaded.profile.routeUnlocks).toEqual(["R01"]);
  });
});
