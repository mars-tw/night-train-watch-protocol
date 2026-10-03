import { describe, expect, it } from "vitest";
import { createAppState, createRun } from "../src/game/model";
import { createProfile } from "../src/game/profile";
import { emitQuestEvent } from "../src/game/quests";
import { deriveOnboardingCue } from "../src/ui/onboarding";

function freshState() {
  const state = createAppState();
  state.run = createRun("onboarding-proof", "R01", state.profile);
  state.screen = "carriage";
  return state;
}

describe("first-night onboarding cue", () => {
  it("starts with the free breathing inspection and never mutates progress or costs", () => {
    const state = freshState();
    state.activeCarriageId = "sleep";
    const before = JSON.stringify({ run: state.run, profile: state.profile });

    expect(deriveOnboardingCue(state)).toMatchObject({
      action: "inspect-object",
      value: "passenger-breathing",
      label: "查看呼吸",
    });
    expect(JSON.stringify({ run: state.run, profile: state.profile })).toBe(before);
  });

  it("keeps the mission journal available in prep but omits it in danger", () => {
    const state = freshState();
    expect(deriveOnboardingCue(state)).toMatchObject({ showMissions: true });

    state.run!.phase = "night";
    state.run!.activeContact = {
      id: "contact-proof",
      definitionId: "T002",
      stage: "warning",
      secondsLeft: 8,
      wave: 1,
      totalWaves: 1,
    };
    expect(deriveOnboardingCue(state)).toMatchObject({
      title: "關閉百葉・電量 8",
      showMissions: false,
    });
  });

  it("uses authoritative objective progress for safe power, meal, planting and route steps", () => {
    const state = freshState();
    const run = state.run!;
    emitQuestEvent(run, "action.committed", { operation: "inspect", targetId: "passenger-breathing", result: "success" });
    emitQuestEvent(run, "action.committed", { operation: "inspect", targetId: "window-silhouette", result: "success" });

    expect(deriveOnboardingCue(state)).toMatchObject({ action: "claim-quest-rewards", value: "TUT-01" });
    run.quests.missions["TUT-01"]!.lifecycle = "claimed";
    state.profile.milestones.push("mission:TUT-01:completed");
    expect(deriveOnboardingCue(state)).toMatchObject({ action: "power" });
    state.carriagePanel = "power";
    expect(deriveOnboardingCue(state)).toMatchObject({ action: "toggle-power", value: "M003" });
    expect(run.modules.find((item) => item.definitionId === "M001")?.active).toBe(true);
    run.modules.find((item) => item.definitionId === "M003")!.active = false;
    emitQuestEvent(run, "action.committed", { operation: "power.configure", result: "success" });
    expect(deriveOnboardingCue(state)).toMatchObject({ action: "toggle-power", value: "M003", label: "恢復設備供電" });
    run.modules.find((item) => item.definitionId === "M003")!.active = true;
    state.carriagePanel = "scene";
    expect(deriveOnboardingCue(state)).toMatchObject({ action: "meal" });
    emitQuestEvent(run, "action.committed", { operation: "ration.configure", result: "success" });
    expect(deriveOnboardingCue(state)).toMatchObject({ action: "claim-quest-rewards", value: "TUT-02" });
    run.quests.missions["TUT-02"]!.lifecycle = "claimed";
    state.profile.milestones.push("mission:TUT-02:completed");
    expect(deriveOnboardingCue(state)).toMatchObject({ action: "preview-action", value: "plant-crop|plot-a:lettuce" });
    emitQuestEvent(run, "action.committed", { operation: "crop.plant", targetId: "plot-a", result: "success" });
    expect(deriveOnboardingCue(state)).toMatchObject({ action: "claim-quest-rewards", value: "TUT-03" });
    run.quests.missions["TUT-03"]!.lifecycle = "claimed";
    state.profile.milestones.push("mission:TUT-03:completed");
    expect(deriveOnboardingCue(state)).toMatchObject({ action: "route" });
  });

  it("yields to player pins and stays gone for a profile that finished the guided set", () => {
    const state = freshState();
    state.run!.quests.trackedMissionIds.push("MAIN-R01-N01");
    expect(deriveOnboardingCue(state)).toBeNull();

    state.run!.quests.trackedMissionIds = [];
    state.profile = createProfile("returning", 1);
    for (const id of ["TUT-01", "TUT-02", "TUT-03", "TUT-04", "TUT-05"])
      state.profile.milestones.push(`mission:${id}:completed`);
    expect(deriveOnboardingCue(state)).toBeNull();
  });

  it("does not call five tutorials finished while planting is still missing", () => {
    const state = freshState();
    for (const id of ["TUT-01", "TUT-02", "TUT-04", "TUT-05"])
      state.profile.milestones.push(`mission:${id}:completed`);

    expect(deriveOnboardingCue(state)).toMatchObject({
      action: "preview-action",
      value: "plant-crop|plot-a:lettuce",
    });
  });

  it("points completed tutorials at the existing saved reward action", () => {
    const state = freshState();
    state.run!.quests.missions["TUT-01"]!.lifecycle = "completed";
    expect(deriveOnboardingCue(state)).toMatchObject({
      action: "claim-quest-rewards",
      value: "TUT-01",
    });
  });

  it("prioritizes a named, priced legal counter over rewards during a live contact", () => {
    const state = freshState();
    const run = state.run!;
    run.quests.missions["TUT-04"]!.lifecycle = "completed";
    run.phase = "night";
    run.activeContact = {
      id: "contact-proof",
      definitionId: "T002",
      stage: "warning",
      secondsLeft: 8,
      wave: 1,
      totalWaves: 1,
    };

    expect(deriveOnboardingCue(state)).toMatchObject({
      action: "counter",
      value: "close-shutter",
      title: "關閉百葉・電量 8",
      label: "執行關閉百葉",
    });
  });
});
