import { describe, expect, it } from "vitest";
import { createRun } from "../src/game/model";
import { RunService } from "../src/game/services";

describe("v2 evidence and fuel recovery", () => {
  it("allows an explicit missing-evidence continuation without inventing the author", () => {
    const service = new RunService();
    const run = createRun("missing-author-evidence");
    // Canonical Day 6 fixture isolates the optional-proof gate regression.
    run.day = 6;
    run.phase = "travel";
    run.activeEventId = "EV048";
    const event = service.getEvent(run)!;
    const tell = event.choices.find(choice => choice.id === "tell")!;
    const hide = event.choices.find(choice => choice.id === "hide")!;
    expect(service.resolveEvent(run, tell)).toBe(false);
    const trust = run.survivor.trust;
    expect(service.resolveEvent(run, hide)).toBe(true);
    expect(run.story.flags.authorKnown).toBe(false);
    expect(run.story.flags.a07IdentityKnown).toBe(false);
    expect(run.survivor.trust).toBe(trust - 2);
    expect(run.activeEventId).not.toBe("EV048");
  });

  it("releases a real clinger with a finite part while preserving scarce route fuel", () => {
    const service = new RunService();
    const run = createRun("white-frost-release", "R02");
    // Begin an ordinary public service encounter; no contact is hand-created.
    service.beginNight(run);
    expect(run.activeContact?.definitionId).toBe("T003");
    const before = { parts: run.resources.parts, fuel: run.resources.fuel, noise: run.environment.noise };
    expect(service.counterThreat(run, "roof-release")).toBe(true);
    expect(run.resources.parts).toBe(before.parts - 1);
    expect(run.resources.fuel).toBe(before.fuel);
    expect(run.environment.noise).toBe(before.noise + 4);
    expect(run.quests.eventHistory.some(event => event.type === "action.committed" && event.method === "finite-tool" && event.result === "success")).toBe(true);
    const parts = run.resources.parts;
    expect(service.counterThreat(run, "roof-release")).toBe(false);
    expect(run.resources.parts).toBe(parts);
  });
});
