import { describe, expect, it } from "vitest";
import { createRun } from "../src/game/model";
import { parseRun } from "../src/game/save";

describe("story save migration", () => {
  it("upgrades a schema 2 run without story data and preserves gameplay state", () => {
    const legacy = createRun("legacy-v2") as unknown as Record<string, unknown>;
    legacy.schemaVersion = 2;
    delete legacy.story;
    const migrated = parseRun(JSON.stringify(legacy));

    expect(migrated).not.toBeNull();
    expect(migrated?.schemaVersion).toBe(3);
    expect(migrated?.seed).toBe("legacy-v2");
    expect(migrated?.resources).toEqual(legacy.resources);
    expect(migrated?.story).toMatchObject({
      version: 1,
      cargoConversion: "none",
      finaleStage: "inactive",
      endingId: null,
    });
  });

  it("deep-merges newly added story flags into an older partial story save", () => {
    const legacy = createRun("partial-story") as unknown as Record<string, unknown>;
    legacy.schemaVersion = 2;
    const story = legacy.story as Record<string, unknown>;
    story.flags = { day4Route: "STOP", manifestCrossChecks: 1 };
    const migrated = parseRun(JSON.stringify(legacy));

    expect(migrated?.story.flags.day4Route).toBe("STOP");
    expect(migrated?.story.flags.manifestCrossChecks).toBe(1);
    expect(migrated?.story.flags.decoderInstalled).toBe(false);
    expect(migrated?.story.flags.identityMismatchVerified).toBe(false);
  });

  it("restores an interrupted Day 7 decision without duplicating its result", () => {
    const run = createRun("day7-resume");
    run.day = 7;
    run.phase = "travel";
    run.activeEventId = "EV051";
    run.story.finaleStage = "decision";
    run.story.completedContactWaves = 3;
    run.story.flags.day4Route = "DETOUR";
    run.story.flags.trueRouteData = true;
    const restored = parseRun(JSON.stringify(run));

    expect(restored).toMatchObject({
      schemaVersion: 3,
      day: 7,
      phase: "travel",
      activeEventId: "EV051",
    });
    expect(restored?.story).toMatchObject({
      finaleStage: "decision",
      completedContactWaves: 3,
      finalDecision: null,
      endingId: null,
    });
  });

  it("rejects unsupported save schemas", () => {
    const run = createRun("future");
    const raw = JSON.stringify({ ...run, schemaVersion: 99 });
    expect(() => parseRun(raw)).toThrow(/Invalid save schema/);
  });
});
