import type { ProfileState, RunState, StoryRouteId } from "./types";
import { getBlueprintLoadout, getCosmeticLoadout } from "./profile-loadouts";

let profileCounter = 0;

function uniqueId(prefix: string): string {
  const randomUUID = globalThis.crypto?.randomUUID?.();
  if (randomUUID) return `${prefix}-${randomUUID}`;
  profileCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${profileCounter.toString(36)}`;
}

function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))]
    : [];
}

function validRoutes(value: unknown): StoryRouteId[] {
  const routes = uniqueStrings(value).filter((route): route is StoryRouteId =>
    route === "R01" || route === "R02" || route === "R03",
  );
  return routes.includes("R01") ? routes : ["R01", ...routes];
}

export function createProfile(profileId = uniqueId("profile"), now = Date.now()): ProfileState {
  return {
    schemaVersion: 1,
    profileId,
    createdAt: now,
    updatedAt: now,
    routeUnlocks: ["R01"],
    blueprints: [],
    decorations: [],
    journal: [],
    milestones: [],
    rewardReceipts: [],
  };
}

export function repairProfile(value: unknown): ProfileState {
  if (!value || typeof value !== "object") return createProfile();
  const saved = value as Partial<ProfileState>;
  const profileId = typeof saved.profileId === "string" && saved.profileId.length > 0
    ? saved.profileId
    : uniqueId("profile");
  const createdAt = typeof saved.createdAt === "number" && Number.isFinite(saved.createdAt)
    ? saved.createdAt
    : Date.now();
  const updatedAt = typeof saved.updatedAt === "number" && Number.isFinite(saved.updatedAt)
    ? Math.max(createdAt, saved.updatedAt)
    : createdAt;
  const blueprints = uniqueStrings(saved.blueprints);
  const decorations = uniqueStrings(saved.decorations);
  const selectedBlueprintId =
    typeof saved.selectedBlueprintId === "string" &&
    blueprints.includes(saved.selectedBlueprintId) &&
    getBlueprintLoadout(saved.selectedBlueprintId)
      ? saved.selectedBlueprintId
      : undefined;
  const selectedCosmeticId =
    typeof saved.selectedCosmeticId === "string" &&
    decorations.includes(saved.selectedCosmeticId) &&
    getCosmeticLoadout(saved.selectedCosmeticId)
      ? saved.selectedCosmeticId
      : undefined;
  return {
    schemaVersion: 1,
    profileId,
    createdAt,
    updatedAt,
    routeUnlocks: validRoutes(saved.routeUnlocks),
    blueprints,
    decorations,
    journal: uniqueStrings(saved.journal),
    milestones: uniqueStrings(saved.milestones),
    rewardReceipts: uniqueStrings(saved.rewardReceipts),
    ...(selectedBlueprintId ? { selectedBlueprintId } : {}),
    ...(selectedCosmeticId ? { selectedCosmeticId } : {}),
  };
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

export function reconcileRouteUnlocks(profile: ProfileState): ProfileState {
  const next = repairProfile(JSON.parse(JSON.stringify(profile)) as ProfileState);
  const reachedSafeThirdNight = next.milestones.some((milestone) =>
    /^route:R0[123]:night-[3-7]-survived$/.test(milestone),
  );
  const routeVictory = next.milestones.some((milestone) => /^route:R0[123]:victory$/.test(milestone));
  if (reachedSafeThirdNight || routeVictory) addUnique(next.routeUnlocks, "R02");

  const allTutorialsComplete = ["TUT-01", "TUT-02", "TUT-03", "TUT-04", "TUT-05"]
    .every((id) => next.milestones.includes(`mission:${id}:completed`));
  const sevenNightJourney = next.milestones.some((milestone) => /^route:R0[123]:seven-nights$/.test(milestone));
  if (allTutorialsComplete && sevenNightJourney) addUnique(next.routeUnlocks, "R03");
  return next;
}

export function recordRunOutcome(profile: ProfileState, run: RunState, now = Date.now()): ProfileState {
  const next = repairProfile(JSON.parse(JSON.stringify(profile)) as ProfileState);
  if (!run.ended && run.outcome === "active") return next;

  addUnique(next.milestones, `run:${run.runId}:${run.outcome}`);
  const safeNightEvents = run.quests.eventHistory.filter((event) =>
    event.type === "night.resolved"
    && event.day >= 3
    && event.passengerAlive === true
    && event.hullPositive === true,
  );
  for (const event of safeNightEvents) addUnique(next.milestones, `route:${run.routeId}:night-${event.day}-survived`);

  if (run.outcome === "victory") addUnique(next.milestones, `route:${run.routeId}:victory`);
  const authoritativeDaySevenEnd = run.quests.eventHistory.some((event) =>
    event.type === "run.ended"
    && event.day === 7
    && event.finalDecisionRecorded === true
    && (event.outcome === "victory" || event.outcome === "hull-lost" || event.outcome === "survivor-lost"),
  );

  const endingId = run.routeId === "R02"
    ? run.story.whiteFrost?.endingId
    : run.routeId === "R03"
      ? run.story.greenTide?.endingId
      : run.story.endingId;
  const legacyProvenEnding = Boolean(endingId) && run.outcome === "victory";
  if ((run.outcome === "victory" && run.day === 7) || authoritativeDaySevenEnd || legacyProvenEnding) {
    addUnique(next.milestones, `route:${run.routeId}:seven-nights`);
  }
  if (endingId) addUnique(next.journal, `ending:${endingId}`);
  next.updatedAt = Math.max(next.updatedAt, now);
  return reconcileRouteUnlocks(next);
}
