import { describe, expect, it } from "vitest";
import { createRun } from "../src/game/model";
import { RunService } from "../src/game/services";
import type {
  Day4Route,
  RunState,
  T004InteractionState,
  T005InteractionState,
  T006InteractionState,
  ThreatSignalId,
} from "../src/game/types";

function reachBranchThreat(
  route: Day4Route,
  seed: string,
  prepare?: (run: RunState) => void,
): { run: RunState; service: RunService } {
  const run = createRun(seed);
  const service = new RunService();
  run.day = 7;
  run.selectedRouteNodeId = "RN01";
  run.story.flags.day4Route = route;
  run.resources.energy = 100;
  run.resources.fuel = 60;
  prepare?.(run);

  service.beginNight(run);
  for (let wave = 1; wave <= 2; wave += 1) {
    const threatId = run.activeContact?.definitionId;
    const counter = threatId === "T003" ? "emergency-boost" : "close-shutter";
    expect(service.counterThreat(run, counter)).toBe(true);
  }
  expect(run.activeContact).toMatchObject({ wave: 3, totalWaves: 3 });
  return { run, service };
}

describe("authoritative T004 interaction", () => {
  it("deterministically locks one crop plot when the contact is created", () => {
    const first = reachBranchThreat("DETOUR", "t004-lock");
    const second = reachBranchThreat("DETOUR", "t004-lock");
    const firstState = first.run.activeContact?.interaction as T004InteractionState;
    const secondState = second.run.activeContact?.interaction as T004InteractionState;

    expect(first.run.activeContact?.definitionId).toBe("T004");
    expect(firstState.kind).toBe("T004");
    expect(["plot-a", "plot-b"]).toContain(firstState.targetPlotId);
    expect(firstState.targetPlotId).toBe(secondState.targetPlotId);
    expect(JSON.parse(JSON.stringify(firstState))).toEqual(firstState);
  });

  it("keeps the contact active after a wrong slot and exposes a fair correction", () => {
    const { run, service } = reachBranchThreat("DETOUR", "t004-wrong");
    const state = run.activeContact!.interaction as T004InteractionState;
    const wrongPlot = state.targetPlotId === "plot-a" ? "plot-b" : "plot-a";

    const result = service.interactThreat(run, `cutter:${wrongPlot}`);

    expect(result).toMatchObject({ status: "incorrect", accepted: true, resolved: false, healthDelta: 0 });
    expect(run.activeContact?.definitionId).toBe("T004");
    expect(run.activeContact?.stage).not.toBe("resolve");
    expect(state).toMatchObject({
      attempts: 1,
      lastAttemptPlotId: wrongPlot,
      targetRevealed: true,
    });
    expect(result.message).toContain(state.targetPlotId);
  });

  it("resolves only when the cutter reaches the locked plot", () => {
    const { run, service } = reachBranchThreat("DETOUR", "t004-correct");
    const state = run.activeContact!.interaction as T004InteractionState;

    const result = service.interactThreat(run, "cutter", state.targetPlotId);

    expect(result).toMatchObject({ status: "resolved", accepted: true, resolved: true });
    expect(run.activeContact).toBeUndefined();
    expect(run.story.completedContactWaves).toBe(3);
  });
});

describe("authoritative T005 interaction", () => {
  it("creates exactly two visible, deterministic signals and persists the target", () => {
    const first = reachBranchThreat("STOP", "t005-signals");
    const second = reachBranchThreat("STOP", "t005-signals");
    const firstState = first.run.activeContact!.interaction as T005InteractionState;
    const secondState = second.run.activeContact!.interaction as T005InteractionState;

    expect(first.run.activeContact?.definitionId).toBe("T005");
    expect(firstState.clues.map((clue) => clue.id)).toEqual(["sig-a", "sig-b"]);
    expect(firstState.targetSignalId).toBe(secondState.targetSignalId);
    expect(firstState.attempts).toBe(0);
    expect(firstState.revealedClues).toEqual([]);
    expect(JSON.parse(JSON.stringify(firstState))).toEqual(firstState);
  });

  it("reveals color, shape, and rhythm on the first miss without damage", () => {
    const { run, service } = reachBranchThreat("STOP", "t005-first-miss");
    const state = run.activeContact!.interaction as T005InteractionState;
    const wrongSignal: ThreatSignalId = state.targetSignalId === "sig-a" ? "sig-b" : "sig-a";
    const healthBefore = run.survivor.health;

    const result = service.interactThreat(run, `signal:${wrongSignal}`);

    expect(result).toMatchObject({ status: "incorrect", resolved: false, healthDelta: 0 });
    expect(run.survivor.health).toBe(healthBefore);
    expect(state).toMatchObject({
      attempts: 1,
      wrongAttempts: 1,
      lastAttemptSignalId: wrongSignal,
      secondMissPenaltyApplied: false,
    });
    expect(state.revealedClues).toEqual(["color", "shape", "rhythm"]);
    const targetClue = state.clues.find((clue) => clue.id === state.targetSignalId)!;
    expect(result.message).toContain(targetClue.color);
    expect(result.message).toContain(targetClue.shape);
    expect(result.message).toContain(targetClue.rhythm);
  });

  it("applies health minus two only on the second miss, then still requires the correct signal", () => {
    const { run, service } = reachBranchThreat("STOP", "t005-second-miss");
    const state = run.activeContact!.interaction as T005InteractionState;
    const wrongSignal: ThreatSignalId = state.targetSignalId === "sig-a" ? "sig-b" : "sig-a";
    const healthBefore = run.survivor.health;

    service.interactThreat(run, `signal:${wrongSignal}`);
    const second = service.interactThreat(run, "signal", wrongSignal);
    const third = service.interactThreat(run, `signal:${wrongSignal}`);

    expect(second).toMatchObject({ status: "incorrect", resolved: false, healthDelta: -2 });
    expect(third).toMatchObject({ status: "incorrect", resolved: false, healthDelta: 0 });
    expect(run.survivor.health).toBe(healthBefore - 2);
    expect(state).toMatchObject({
      attempts: 3,
      wrongAttempts: 3,
      secondMissPenaltyApplied: true,
    });
    expect(run.ledger.filter((entry) => entry.source === "threat.T005.second-miss")).toHaveLength(1);
    expect(run.activeContact?.definitionId).toBe("T005");

    const correct = service.interactThreat(run, `signal:${state.targetSignalId}`);
    expect(correct.status).toBe("resolved");
    expect(run.activeContact).toBeUndefined();
  });
});

describe("authoritative T006 interaction", () => {
  it("targets a planted leaf slot and rejects the meter shortcut", () => {
    const { run, service } = reachBranchThreat("GO", "t006-leaf", (fixture) => {
      fixture.crops[0]!.cropId = "lettuce";
      fixture.crops[0]!.stage = 2;
    });
    const state = run.activeContact!.interaction as T006InteractionState;

    expect(run.activeContact?.definitionId).toBe("T006");
    expect(state).toMatchObject({
      kind: "T006",
      mode: "leaf",
      traceTarget: "plot-a",
      targetPlotId: "plot-a",
      attempts: 0,
    });

    const wrong = service.interactThreat(run, "trace:meter");
    expect(wrong).toMatchObject({ status: "incorrect", resolved: false });
    expect(run.activeContact?.definitionId).toBe("T006");
    expect(state.attempts).toBe(1);
    expect(state.lastAttempt).toBe("meter");

    const correct = service.interactThreat(run, "trace", "leaves");
    expect(correct.status).toBe("resolved");
    expect(run.activeContact).toBeUndefined();
  });

  it("falls back to a solvable meter target when every crop plot is empty", () => {
    const { run, service } = reachBranchThreat("GO", "t006-meter");
    const state = run.activeContact!.interaction as T006InteractionState;

    expect(state).toMatchObject({
      kind: "T006",
      mode: "meter",
      traceTarget: "meter",
      attempts: 0,
    });
    expect(state.targetPlotId).toBeUndefined();

    const wrong = service.interactThreat(run, "trace:leaves");
    expect(wrong).toMatchObject({ status: "incorrect", resolved: false });
    expect(wrong.message).toContain("35%");
    expect(run.activeContact?.definitionId).toBe("T006");
    expect(state.lastAttempt).toBe("leaves");

    const correct = service.interactThreat(run, "trace:meter");
    expect(correct.status).toBe("resolved");
    expect(run.activeContact).toBeUndefined();
  });

  it("locks one of the planted plots deterministically when both contain crops", () => {
    const prepare = (run: RunState) => {
      run.crops[0]!.cropId = "lettuce";
      run.crops[1]!.cropId = "tomato";
    };
    const first = reachBranchThreat("GO", "t006-two-crops", prepare);
    const second = reachBranchThreat("GO", "t006-two-crops", prepare);
    const firstState = first.run.activeContact!.interaction as T006InteractionState;
    const secondState = second.run.activeContact!.interaction as T006InteractionState;

    expect(["plot-a", "plot-b"]).toContain(firstState.traceTarget);
    expect(firstState.traceTarget).toBe(secondState.traceTarget);
  });
});

describe("standard threat regression", () => {
  it("repairs an older v0.9 save that entered a specialized contact before interaction state existed", () => {
    const { run, service } = reachBranchThreat("DETOUR", "legacy-specialized-save");
    const original = run.activeContact!.interaction as T004InteractionState;
    const originalTarget = original.targetPlotId;
    delete run.activeContact!.interaction;

    const repaired = service.ensureThreatInteraction(run) as T004InteractionState;

    expect(repaired).toMatchObject({ kind: "T004", targetPlotId: originalTarget, attempts: 0 });
    expect(run.activeContact?.interaction).toBe(repaired);
    expect(service.interactThreat(run, `cutter:${repaired.targetPlotId}`).resolved).toBe(true);
  });

  it("does not let legacy counterThreat bypass specialized interactions", () => {
    const { run, service } = reachBranchThreat("DETOUR", "specialized-no-bypass");
    const state = run.activeContact!.interaction as T004InteractionState;

    expect(service.counterThreat(run, "drag-cutter")).toBe(false);
    expect(service.counterThreat(run, "brace-impact")).toBe(false);
    expect(run.activeContact?.definitionId).toBe("T004");
    expect(state.attempts).toBe(0);
  });

  it("keeps T002 and T003 counter costs and resolution behavior intact", () => {
    for (const seed of ["standard-a", "standard-b"]) {
      const run = createRun(seed);
      const service = new RunService();
      run.selectedRouteNodeId = "RN01";
      const before = { energy: run.resources.energy, fuel: run.resources.fuel };

      service.beginNight(run);
      const threatId = run.activeContact!.definitionId;
      const counter = threatId === "T003" ? "emergency-boost" : "close-shutter";

      expect(service.counterThreat(run, counter)).toBe(true);
      expect(run.activeContact).toBeUndefined();
      if (threatId === "T003") expect(run.resources.fuel).toBe(before.fuel - 4);
      else expect(run.resources.energy).toBeLessThan(before.energy);
    }
  });
});
