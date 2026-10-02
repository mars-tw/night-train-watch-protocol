import { describe, expect, it } from "vitest";
import { createRun } from "../src/game/model";
import { createProfile, recordRunOutcome, repairProfile } from "../src/game/profile";
import { emitQuestEvent } from "../src/game/quests";

describe("reboot-v2 profile", () => {
  it("repairs malformed profile collections and keeps receipts unique", () => {
    const repaired = repairProfile({
      schemaVersion: 99,
      profileId: "kept-id",
      routeUnlocks: ["R02", "R02", "R99"],
      blueprints: ["BP-A", "BP-A", 1],
      decorations: ["COS-A", "COS-A"],
      journal: ["J-A", "J-A"],
      milestones: ["M-A", "M-A"],
      rewardReceipts: ["kept-id:R-A", "kept-id:R-A"],
    });
    expect(repaired).toMatchObject({
      schemaVersion: 1,
      profileId: "kept-id",
      routeUnlocks: ["R01", "R02"],
      blueprints: ["BP-A"],
      rewardReceipts: ["kept-id:R-A"],
    });
  });

  it("unlocks routes from milestones without carrying survival resources", () => {
    const profile = createProfile("profile-routes", 1);
    profile.milestones.push(...["TUT-01", "TUT-02", "TUT-03", "TUT-04", "TUT-05"].map((id) => `mission:${id}:completed`));
    const finished = createRun("finished-run", "R01");
    finished.day = 7;
    finished.ended = true;
    finished.outcome = "victory";
    const updated = recordRunOutcome(profile, finished, 2);
    expect(updated.routeUnlocks).toEqual(["R01", "R02", "R03"]);
    expect(updated.milestones).toContain("route:R01:seven-nights");

    finished.resources.food = 99;
    finished.survivor.infection = 88;
    const fresh = createRun("fresh-run", "R01");
    expect(fresh.resources.food).toBe(5);
    expect(fresh.survivor.infection).toBe(0);
  });

  it("requires an authoritative third-night settlement instead of the day counter", () => {
    const earlyDeath = createRun("early-day-three");
    earlyDeath.day = 3;
    earlyDeath.ended = true;
    earlyDeath.outcome = "hull-lost";
    expect(recordRunOutcome(createProfile("early-profile", 1), earlyDeath, 2).routeUnlocks).toEqual(["R01"]);

    const survived = createRun("settled-day-three");
    survived.day = 3;
    emitQuestEvent(survived, "night.resolved", {
      eventId: "settled-third-night",
      transactionId: "settled-third-night",
      day: 3,
      passengerAlive: true,
      hullPositive: true,
    });
    survived.ended = true;
    survived.outcome = "hull-lost";
    expect(recordRunOutcome(createProfile("settled-profile", 1), survived, 2).routeUnlocks).toContain("R02");
  });

  it("does not count entering day seven as seven completed nights", () => {
    const firstWaveDeath = createRun("day-seven-first-wave");
    firstWaveDeath.day = 7;
    firstWaveDeath.ended = true;
    firstWaveDeath.outcome = "hull-lost";
    const failed = recordRunOutcome(createProfile("failed-seven", 1), firstWaveDeath, 2);
    expect(failed.milestones).not.toContain("route:R01:seven-nights");

    const finalDecision = createRun("day-seven-final-decision");
    finalDecision.day = 7;
    emitQuestEvent(finalDecision, "run.ended", {
      eventId: "legitimate-day-seven-end",
      transactionId: "legitimate-day-seven-end",
      day: 7,
      outcome: "hull-lost",
      finalDecisionRecorded: true,
      verifiedReasonPresent: true,
    });
    finalDecision.ended = true;
    finalDecision.outcome = "hull-lost";
    const completed = recordRunOutcome(createProfile("complete-seven", 1), finalDecision, 2);
    expect(completed.milestones).toContain("route:R01:seven-nights");
  });

  it("accepts a legacy victory only when an actual story ending proves completion", () => {
    const legacyVictory = createRun("legacy-ending-proof");
    legacyVictory.day = 6;
    legacyVictory.ended = true;
    legacyVictory.outcome = "victory";
    legacyVictory.story.endingId = "arrival";
    const updated = recordRunOutcome(createProfile("legacy-proof", 1), legacyVictory, 2);
    expect(updated.milestones).toContain("route:R01:seven-nights");
  });
});
