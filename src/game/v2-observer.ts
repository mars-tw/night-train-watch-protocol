import { STORY_EVENT_ROUTE_OWNERSHIP } from "./content";
import { deriveGameplayEffects } from "./module-effects";
import { getFacilityEffects } from "./facility-slots";
import { emitQuestEvent, ensureQuestState, settleQuestDay } from "./quests";
import { recordNightStart, recordNightSummary, repairVoyageState } from "./voyage/engine";
import type { NightSummary } from "./voyage/types";
import type { RunService } from "./services";
import type { CropPlot, RunState, ThreatContact } from "./types";

// Observe committed service methods, including calls nested inside encounters.
// Night facts are flushed only after the outer counter has emitted its action.
const mutationDepth = new WeakMap<RunState, number>();
const pendingNights = new WeakMap<RunState, NightSummary>();

type ServiceMethod = (...args: unknown[]) => unknown;
interface Snapshot {
  day: number;
  phase: string;
  eventId?: string;
  contact?: ThreatContact;
  plot?: CropPlot;
  plotContamination?: number;
  selectedRoute?: string;
  medicine: number;
  health: number;
  sequence: number;
}

function storyResult(run: RunState) {
  if (run.routeId === "R02") return {
    ending: run.story.whiteFrost?.endingId,
    decision: run.story.whiteFrost?.finalDecision,
    reasons: run.story.whiteFrost?.endingReasons ?? [],
    branch: run.story.whiteFrost?.branch ?? undefined,
  };
  if (run.routeId === "R03") return {
    ending: run.story.greenTide?.endingId,
    decision: run.story.greenTide?.finalDecision,
    reasons: run.story.greenTide?.endingReasons ?? [],
    branch: run.story.greenTide?.branch ?? undefined,
  };
  return { ending: run.story.endingId, decision: run.story.finalDecision, reasons: run.story.endingReasons, branch: run.story.flags.day4Route ?? undefined };
}

function emitAction(run: RunState, method: string, before: Snapshot, payload: Record<string, unknown>): void {
  emitQuestEvent(run, "action.committed", {
    result: "success",
    day: before.day,
    transactionId: `${run.runId}:D${before.day}:${method}:${before.sequence + 1}`,
    ...payload,
  });
}

function prepare(run: RunState): void {
  ensureQuestState(run);
  run.voyage = repairVoyageState(run.voyage);
}

function nightSummary(run: RunState): NightSummary {
  const voyage = run.voyage!;
  return {
    day: run.day,
    wakeupsDelta: Math.max(0, run.survivor.wakeups - (voyage.nightStartWakeups ?? 0)),
    passengerAlive: run.survivor.health > 0,
    hullPositive: run.environment.hull > 0,
    reservePositive: run.resources.energy > 0 || deriveGameplayEffects(run).lifeSupportReserve > 0,
    lifeSupportPowered: run.modules.some(m => m.definitionId === "M002" && m.active && m.powered),
    manualCounter: run.quests.eventHistory.some(e => e.day === run.day && e.type === "action.committed" && e.operation === "counter.deploy" && (e.method === "manual" || e.method === "finite-tool")),
  };
}

function emitNightFact(run: RunState, summary: NightSummary): void {
  run.voyage = recordNightSummary(run.voyage, summary);
  emitQuestEvent(run, "night.resolved", {
    ...summary,
    transactionId: `${run.runId}:night:${summary.day}`,
  });
}

export function flushRunFacts(run: RunState): void {
  prepare(run);
  const final = storyResult(run);
  const pending = pendingNights.get(run);
  if (pending) {
    // Persist the summary even when Day 7 still has verification/consent work.
    run.voyage = recordNightSummary(run.voyage, pending);
    pendingNights.delete(run);
  }
  const summary = pending ?? run.voyage!.nightSummaries.find(s => s.day === run.day);
  if (summary) summary.manualCounter ||= run.quests.eventHistory.some(e => e.day === summary.day && e.type === "action.committed" && e.operation === "counter.deploy" && (e.method === "manual" || e.method === "finite-tool"));
  if (summary && (run.day < 7 || Boolean(final.ending && final.decision))) emitNightFact(run, summary);
  if (run.day === 7 && final.ending && final.decision) {
    emitQuestEvent(run, "story.milestone", {
      milestoneId: `${run.routeId}.N07`, result: "success", branchChoice: final.branch,
      transactionId: `${run.runId}:main:${run.routeId}:7`,
    });
  }
  if (run.ended) {
    emitQuestEvent(run, "run.ended", {
      outcome: run.outcome,
      finalDecisionRecorded: Boolean(final.decision),
      verifiedReasonPresent: final.reasons.length > 0,
      transactionId: `${run.runId}:ended`,
    });
    settleQuestDay(run);
  }
}

function afterCommit(service: RunService, name: string, run: RunState, args: unknown[], before: Snapshot, result: unknown): void {
  const accepted = result === true;
  if (name === "beginNight" && before.phase !== "night" && run.phase === "night") {
    run.voyage = recordNightStart(run.voyage, run.survivor.wakeups);
  }
  if (name === "finishNight") pendingNights.set(run, nightSummary(run));
  if (name === "continueAftermath" && run.day > before.day) ensureQuestState(run);
  if (name === "chooseRoute" && run.selectedRouteNodeId && run.selectedRouteNodeId !== before.selectedRoute) {
    emitAction(run, name, before, { operation: "route.confirm", targetId: run.selectedRouteNodeId, carriageId: "workshop" });
  }
  if (name === "setRation" && before.phase === "prep" && ["full", "standard", "strict"].includes(String(args[1]))) {
    emitAction(run, name, before, { operation: "ration.configure", carriageId: "kitchen" });
  }
  const actionMap: Record<string, { operation: string; carriageId: string }> = {
    toggleModule: { operation: "power.configure", carriageId: "workshop" },
    plantCrop: { operation: "crop.plant", carriageId: "greenhouse" },
    harvestCrop: { operation: "crop.harvest", carriageId: "greenhouse" },
    repairCarriage: { operation: "repair", carriageId: "workshop" },
    comfortPassenger: { operation: "comfort", carriageId: "sleep" },
    cookHotMeal: { operation: "cook", carriageId: "kitchen" },
    collectWorkshopScrap: { operation: "scrap.collect", carriageId: "workshop" },
  };
  if (accepted && actionMap[name]) {
    emitAction(run, name, before, {
      ...actionMap[name],
      targetId: typeof args[1] === "string" ? args[1] : undefined,
      ...(name === "harvestCrop" ? {
        growthProvenance: run.quests.eventHistory.some(e => e.type === "action.committed" && e.operation === "crop.plant" && e.targetId === before.plot?.id) ? "grown-in-this-run" : "imported",
        mature: (before.plot?.stage ?? 0) >= 3,
        healthy: (before.plotContamination ?? 0) === 0,
      } : {}),
    });
  }
  const interactionResolved = result && typeof result === "object" && "status" in result && result.status === "resolved";
  const realNightContact = before.phase === "night" && Boolean(before.contact);
  const contactResolved = realNightContact && (
    (name === "counterThreat" && accepted)
    || (name === "interactThreat" && interactionResolved)
    || (name === "applyGreenCycleCommand" && interactionResolved && before.contact?.interaction?.kind === "T013")
  );
  if (contactResolved) {
    const command = String(args[1] ?? "");
    const fallback = ["brace-impact", "frost:manual-scrape", "lurker:manual-seal", "cycle:manual-drain"].includes(command);
    emitAction(run, name, before, {
      operation: "counter.deploy", carriageId: "defense",
      targetId: before.contact?.definitionId,
      method: command.includes("cutter") || command === "roof-release" ? "finite-tool" : command.includes("manual") || command.includes("brace") || command.includes("trace") || command.includes("signal") ? "manual" : "powered",
      result: fallback ? "fallback" : "success",
      stableKey: `counter:${before.day}:${before.contact?.id ?? command}`,
    });
  }
  if (name === "resolveEvent" && accepted) {
    if (before.eventId && STORY_EVENT_ROUTE_OWNERSHIP[before.eventId] === run.routeId && before.day < 7) {
      const choice = args[1] as { id?: string } | undefined;
      const compromised = /skip|ignore|partial|bypass/.test(choice?.id ?? "");
      emitQuestEvent(run, "story.milestone", {
        day: before.day,
        milestoneId: `${run.routeId}.N${String(before.day).padStart(2, "0")}`,
        result: compromised ? "compromised" : "success",
        branchChoice: storyResult(run).branch,
        transactionId: `${run.runId}:main:${run.routeId}:${before.day}`,
      });
    }
    if (run.resources.medicine < before.medicine && run.survivor.health > before.health) {
      const module = deriveGameplayEffects(run);
      const facility = getFacilityEffects(run.voyage);
      const health = module.medicineHealthBonus + facility.medicineHealthBonus;
      const infection = module.medicineInfectionReduction + facility.medicineInfectionReduction;
      if (health) service.applySurvivor(run, "health", health, "v2.medical-care.health");
      if (infection) service.applySurvivor(run, "infection", -infection, "v2.medical-care.infection");
    }
  }
}

export function installV2Observers(service: RunService): void {
  const methods = service as unknown as Record<string, ServiceMethod>;
  for (const name of ["beginNight", "finishNight", "continueAftermath", "chooseRoute", "resolveEvent", "counterThreat", "interactThreat", "applyThermalCommand", "applyGreenCycleCommand", "plantCrop", "harvestCrop", "repairCarriage", "comfortPassenger", "cookHotMeal", "collectWorkshopScrap", "toggleModule", "setRation", "tickNight"]) {
    const original = methods[name];
    if (!original) continue;
    methods[name] = (...args: unknown[]) => {
      const run = args[0] as RunState | undefined;
      if (!run?.resources || !run.survivor) return original.apply(service, args);
      prepare(run);
      const before: Snapshot = {
        day: run.day, phase: run.phase, eventId: run.activeEventId,
        contact: run.activeContact,
        plot: name === "harvestCrop" ? { ...run.crops.find(p => p.id === args[1])! } : undefined,
        plotContamination: name === "harvestCrop" ? run.story.greenTide?.plotContamination[args[1] as "plot-a" | "plot-b"] ?? 0 : undefined,
        selectedRoute: run.selectedRouteNodeId,
        medicine: run.resources.medicine, health: run.survivor.health,
        sequence: run.quests.sequence,
      };
      mutationDepth.set(run, (mutationDepth.get(run) ?? 0) + 1);
      try {
        if (name === "continueAftermath" && run.phase === "aftermath" && !run.ended) {
          flushRunFacts(run);
          settleQuestDay(run);
        }
        const result = original.apply(service, args);
        afterCommit(service, name, run, args, before, result);
        return result;
      } finally {
        const depth = (mutationDepth.get(run) ?? 1) - 1;
        mutationDepth.set(run, depth);
        if (depth === 0) flushRunFacts(run);
      }
    };
  }
}
