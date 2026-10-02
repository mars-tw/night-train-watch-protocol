import { describe, expect, it } from "vitest";
import { createRun } from "../src/game/model";
import { createProfile } from "../src/game/profile";
import {
  QUEST_CATALOG,
  claimQuestRewards,
  emitQuestEvent,
  ensureQuestState,
  listRunQuests,
  settleQuestDay,
  toggleQuestTracking,
} from "../src/game/quests";

describe("reboot-v2 quest engine", () => {
  it("loads all 56 catalog missions into runtime state", () => {
    const run = createRun("quest-catalog", "R02");
    expect(QUEST_CATALOG).toHaveLength(56);
    expect(Object.keys(run.quests.missions)).toHaveLength(56);
    expect(listRunQuests(run).filter((quest) => quest.definition.category === "main")).toHaveLength(7);
  });

  it("deduplicates transaction retries and repeated object inspection", () => {
    const run = createRun("quest-dedup");
    const first = emitQuestEvent(run, "action.committed", {
      eventId: "inspect-passenger-1",
      transactionId: "inspect-tx-1",
      operation: "inspect",
      targetId: "passenger-breathing",
      result: "success",
    });
    const retriedTransaction = emitQuestEvent(run, "action.committed", {
      eventId: "inspect-passenger-retry",
      transactionId: "inspect-tx-1",
      operation: "inspect",
      targetId: "passenger-breathing",
      result: "success",
    });
    const refreshedObject = emitQuestEvent(run, "action.committed", {
      eventId: "inspect-passenger-refresh",
      transactionId: "inspect-tx-2",
      operation: "inspect",
      targetId: "passenger-breathing",
      result: "success",
    });
    const window = emitQuestEvent(run, "action.committed", {
      eventId: "inspect-window-1",
      transactionId: "inspect-tx-3",
      operation: "inspect",
      targetId: "window-silhouette",
      result: "success",
    });

    expect(first.accepted).toBe(true);
    expect(retriedTransaction).toMatchObject({ accepted: false, duplicate: true });
    expect(refreshedObject).toMatchObject({ accepted: false, duplicate: true });
    expect(window.completedMissionIds).toContain("TUT-01");
    expect(run.quests.sequence).toBe(2);
    expect(run.quests.missions["TUT-01"]).toMatchObject({ lifecycle: "completed", result: "completed" });
  });

  it("settles failed mainline and relationship windows as explicit fallbacks", () => {
    const run = createRun("quest-fallback", "R01");
    emitQuestEvent(run, "story.milestone", {
      eventId: "main-fallback",
      transactionId: "main-fallback",
      milestoneId: "R01.N01",
      result: "fallback",
    });
    emitQuestEvent(run, "night.resolved", {
      eventId: "night-one",
      transactionId: "night-one",
      day: 1,
    });
    expect(run.quests.missions["MAIN-R01-N01"]).toMatchObject({
      lifecycle: "resolved-fallback",
      result: "compromised",
    });

    settleQuestDay(run);
    run.day = 3;
    ensureQuestState(run);
    expect(run.quests.missions["REL-A07-01"]).toMatchObject({
      lifecycle: "resolved-fallback",
      result: "compromised",
    });
    expect(run.quests.missions["REL-A07-02"]).toMatchObject({
      lifecycle: "available",
      fallbackContext: true,
    });
  });

  it("retires the competing facility branch only after a successful upgrade event", () => {
    const run = createRun("quest-branch");
    run.day = 2;
    ensureQuestState(run);
    emitQuestEvent(run, "facility.upgraded", {
      eventId: "facility-quiet",
      transactionId: "facility-quiet",
      facilityId: "power-core",
      upgradeId: "quiet-wiring",
      branchGroup: "core-output",
      branchChoice: "quiet",
      result: "success",
    });
    expect(run.quests.missions["FAC-01"]!.lifecycle).toBe("completed");
    expect(run.quests.missions["FAC-02"]).toMatchObject({
      lifecycle: "retired",
      result: "expired",
      reason: "branch-superseded",
    });
  });

  it("caps pinned missions at two and exposes a readable next objective", () => {
    const run = createRun("quest-tracking");
    expect(toggleQuestTracking(run, "TUT-01")).toBe(true);
    expect(toggleQuestTracking(run, "TUT-02")).toBe(true);
    expect(toggleQuestTracking(run, "TUT-03")).toBe(false);
    expect(run.quests.trackedMissionIds).toEqual(["TUT-01", "TUT-02"]);
    const nextObjective = listRunQuests(run).find((quest) => quest.id === "TUT-01")?.nextObjective;
    expect(nextObjective).toBe("檢查乘客的呼吸是否安穩");
    expect(nextObjective).not.toMatch(/targetId|passenger-breathing|operation|sameNight/);
  });

  it("prepares immutable reward drafts and deduplicates claims", () => {
    const run = createRun("quest-claim");
    const profile = createProfile("profile-claim", 1);
    emitQuestEvent(run, "action.committed", {
      eventId: "plant-once",
      transactionId: "plant-once",
      operation: "crop.plant",
      targetId: "plot-a",
      result: "success",
    });
    const before = JSON.stringify({ run, profile });
    const draft = claimQuestRewards(run, profile, "TUT-03");
    expect(draft.status).toBe("prepared");
    expect(JSON.stringify({ run, profile })).toBe(before);
    expect(draft.run.quests.missions["TUT-03"]!.lifecycle).toBe("claimed");
    expect(draft.profile.blueprints).toContain("BP-STARTER-SEED-TRAY");

    const duplicate = claimQuestRewards(draft.run, draft.profile, "TUT-03");
    expect(duplicate.status).toBe("noop");
    expect(duplicate.profile.rewardReceipts).toEqual(draft.profile.rewardReceipts);
  });

  it("reconciles R03 immediately when the fifth tutorial reward is claimed", () => {
    const run = createRun("quest-profile-reconcile");
    const profile = createProfile("profile-reconcile", 1);
    profile.milestones.push(
      "route:R01:seven-nights",
      "mission:TUT-01:completed",
      "mission:TUT-02:completed",
      "mission:TUT-03:completed",
      "mission:TUT-04:completed",
    );
    emitQuestEvent(run, "action.committed", {
      eventId: "counter-tutorial",
      transactionId: "counter-tutorial",
      operation: "counter.deploy",
      result: "fallback",
    });
    emitQuestEvent(run, "night.resolved", {
      eventId: "counter-tutorial-night",
      transactionId: "counter-tutorial-night",
      passengerAlive: true,
      hullPositive: true,
    });
    const draft = claimQuestRewards(run, profile, "TUT-05");
    expect(draft.status).toBe("prepared");
    expect(draft.profile.routeUnlocks).toContain("R03");
  });
});
