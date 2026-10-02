import type {
  EnvironmentState,
  ProfileState,
  ResourceState,
  RunState,
} from "./types";

export type BlueprintLoadoutId =
  | "BP-STARTER-SEED-TRAY"
  | "BP-QUIET-WIRING"
  | "BP-BURST-BUFFER"
  | "BP-BLACKOUT-SHUTTER"
  | "BP-OBSERVATION-FRAME"
  | "BP-CLOSED-RETURN"
  | "BP-ISOLATED-TRAYS"
  | "BP-WARM-BERTH"
  | "BP-MEDICAL-BERTH";

export type CosmeticLoadoutId =
  | "COS-A07-NOTE"
  | "COS-XU-QSL"
  | "COS-QUIET-LAMP"
  | "COS-RESERVE-GAUGE"
  | "COS-GARDEN-LABEL"
  | "COS-TOOL-WRAP"
  | "COS-TRAIN-STAMP"
  | "COS-FINAL-LOG";

export interface BlueprintLoadoutDefinition {
  id: BlueprintLoadoutId;
  title: string;
  description: string;
  tradeoff: string;
  resourceDelta?: Partial<ResourceState>;
  environmentDelta?: Partial<EnvironmentState>;
  saturatedWaterFallbackEnergy?: number;
}

export interface CosmeticLoadoutDefinition {
  id: CosmeticLoadoutId;
  title: string;
  description: string;
  preview: string;
}

export const BLUEPRINT_LOADOUTS: readonly BlueprintLoadoutDefinition[] = [
  {
    id: "BP-STARTER-SEED-TRAY",
    title: "初階種植盤",
    description: "多帶一份容易照料的起始糧種。",
    tradeoff: "食物 +1；零件 −1",
    resourceDelta: { food: 1, parts: -1 },
  },
  {
    id: "BP-QUIET-WIRING",
    title: "低噪配線",
    description: "出發前先降低核心配線的環境噪音。",
    tradeoff: "噪音 −4；電量 −5",
    resourceDelta: { energy: -5 },
    environmentDelta: { noise: -4 },
  },
  {
    id: "BP-BURST-BUFFER",
    title: "峰值緩衝",
    description: "拆出兩份零件，換成更多起始備援電量。",
    tradeoff: "電量 +10；零件 −2",
    resourceDelta: { energy: 10, parts: -2 },
  },
  {
    id: "BP-BLACKOUT-SHUTTER",
    title: "遮光百葉",
    description: "出發時先壓低聲響，也犧牲部分窗外視野。",
    tradeoff: "噪音 −4；能見度 −6",
    environmentDelta: { noise: -4, visibility: -6 },
  },
  {
    id: "BP-OBSERVATION-FRAME",
    title: "觀測窗框",
    description: "用一部分起始電量換取一份已整理的沿線資料。",
    tradeoff: "資料 +1；電量 −5",
    resourceDelta: { data: 1, energy: -5 },
  },
  {
    id: "BP-CLOSED-RETURN",
    title: "封閉回水",
    description: "把一份零件改作起始回水儲備。綠潮線已滿水時改存備援電。",
    tradeoff: "飲水 +1；零件 −1。滿水時改為電量 +5",
    resourceDelta: { water: 1, parts: -1 },
    saturatedWaterFallbackEnergy: 5,
  },
  {
    id: "BP-ISOLATED-TRAYS",
    title: "隔離培育",
    description: "多帶一份起始培育用水，但必須減少繞行燃料。綠潮線已滿水時改存備援電。",
    tradeoff: "飲水 +1；燃料 −2。滿水時改為電量 +5",
    resourceDelta: { water: 1, fuel: -2 },
    saturatedWaterFallbackEnergy: 5,
  },
  {
    id: "BP-WARM-BERTH",
    title: "保暖床邊",
    description: "出發時先加熱臥鋪，換取較少的起始電量。",
    tradeoff: "溫度 +2；電量 −5",
    resourceDelta: { energy: -5 },
    environmentDelta: { temperature: 2 },
  },
  {
    id: "BP-MEDICAL-BERTH",
    title: "急救床邊",
    description: "把兩份維修零件換成一份起始藥品。",
    tradeoff: "藥品 +1；零件 −2",
    resourceDelta: { medicine: 1, parts: -2 },
  },
] as const;

export const COSMETIC_LOADOUTS: readonly CosmeticLoadoutDefinition[] = [
  { id: "COS-A07-NOTE", title: "A-07 的床頭便條", description: "把她留下的便條掛回臥鋪床緣。", preview: "床頭掛牌" },
  { id: "COS-XU-QSL", title: "老許的通聯卡", description: "把最後一次通聯卡放在工坊收音機旁。", preview: "工坊卡片" },
  { id: "COS-QUIET-LAMP", title: "柔光燈罩", description: "替生活燈換上較柔和的旅程款式。", preview: "燈罩款式" },
  { id: "COS-RESERVE-GAUGE", title: "復古電表刻度", description: "在備援電表留下舊式刻度盤。", preview: "電表面板" },
  { id: "COS-GARDEN-LABEL", title: "手寫菜牌", description: "在溫室種植槽掛上手寫菜牌。", preview: "溫室掛牌" },
  { id: "COS-TOOL-WRAP", title: "帆布工具套", description: "在工坊工具架掛上耐磨帆布套。", preview: "工具架小物" },
  { id: "COS-TRAIN-STAMP", title: "五車廂圖章", description: "把五節車廂圖章印在守夜帳本封面。", preview: "旅程徽章" },
  { id: "COS-FINAL-LOG", title: "封存日誌封面", description: "使用完成七夜後留下的日誌封面。", preview: "帳本封面" },
] as const;

export type ProfileLoadoutKind = "blueprint" | "cosmetic";

export interface ProfileLoadoutSelectionDraft {
  status: "prepared" | "noop" | "ineligible";
  profile: ProfileState;
  kind: ProfileLoadoutKind;
  id?: string;
  message: string;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getBlueprintLoadout(id: unknown): BlueprintLoadoutDefinition | undefined {
  return typeof id === "string"
    ? BLUEPRINT_LOADOUTS.find((definition) => definition.id === id)
    : undefined;
}

export function getCosmeticLoadout(id: unknown): CosmeticLoadoutDefinition | undefined {
  return typeof id === "string"
    ? COSMETIC_LOADOUTS.find((definition) => definition.id === id)
    : undefined;
}

export function prepareProfileLoadoutSelection(
  profile: ProfileState,
  kind: ProfileLoadoutKind,
  requestedId?: string,
  now = Date.now(),
): ProfileLoadoutSelectionDraft {
  const current = kind === "blueprint" ? profile.selectedBlueprintId : profile.selectedCosmeticId;
  if (!requestedId) {
    if (!current) return { status: "noop", profile, kind, message: "已使用標準配置。" };
    const next = clone(profile);
    if (kind === "blueprint") delete next.selectedBlueprintId;
    else delete next.selectedCosmeticId;
    next.updatedAt = Math.max(next.updatedAt, now);
    return { status: "prepared", profile: next, kind, message: kind === "blueprint" ? "下局改用標準起始配置。" : "下局不使用旅程外觀。" };
  }

  const definition = kind === "blueprint"
    ? getBlueprintLoadout(requestedId)
    : getCosmeticLoadout(requestedId);
  const owned = kind === "blueprint"
    ? profile.blueprints.includes(requestedId)
    : profile.decorations.includes(requestedId);
  if (!definition || !owned) {
    return { status: "ineligible", profile, kind, id: requestedId, message: "這項配置尚未解鎖，不能選用。" };
  }
  if (current === requestedId) {
    return { status: "noop", profile, kind, id: requestedId, message: "這項配置已選為下局使用。" };
  }
  const next = clone(profile);
  if (kind === "blueprint") next.selectedBlueprintId = requestedId;
  else next.selectedCosmeticId = requestedId;
  next.updatedAt = Math.max(next.updatedAt, now);
  return {
    status: "prepared",
    profile: next,
    kind,
    id: requestedId,
    message: `${definition.title}已選為下局使用；目前旅程不會改變。`,
  };
}

function applyDeltas<T extends object>(
  target: T,
  deltas: Partial<Record<keyof T, number>> | undefined,
): void {
  for (const [rawKey, delta] of Object.entries(deltas ?? {})) {
    if (typeof delta !== "number") continue;
    const key = rawKey as keyof T;
    const current = target[key];
    if (typeof current !== "number") continue;
    target[key] = Math.max(0, current + delta) as T[keyof T];
  }
}

export function applyProfileLoadout(run: RunState, profile?: ProfileState): RunState {
  const next = clone(run);
  const blueprint = profile?.blueprints.includes(profile.selectedBlueprintId ?? "")
    ? getBlueprintLoadout(profile.selectedBlueprintId)
    : undefined;
  const cosmetic = profile?.decorations.includes(profile.selectedCosmeticId ?? "")
    ? getCosmeticLoadout(profile.selectedCosmeticId)
    : undefined;

  if (blueprint && !next.flags.some((flag) => flag.startsWith("starting-blueprint:"))) {
    const resourceDelta = { ...(blueprint.resourceDelta ?? {}) };
    const waterGain = resourceDelta.water ?? 0;
    if (
      waterGain > 0 &&
      next.resources.water >= 8 &&
      blueprint.saturatedWaterFallbackEnergy
    ) {
      delete resourceDelta.water;
      resourceDelta.energy =
        (resourceDelta.energy ?? 0) + blueprint.saturatedWaterFallbackEnergy;
      next.flags.push("starting-blueprint-fallback:energy");
    }
    applyDeltas(next.resources, resourceDelta);
    applyDeltas(next.environment, blueprint.environmentDelta);
    next.flags.push(`starting-blueprint:${blueprint.id}`);
    next.lastMessage = `${next.lastMessage ?? "守護協定已啟動。"} 起始藍圖「${blueprint.title}」已套用一次。`;
  }

  if (cosmetic && !next.flags.some((flag) => flag.startsWith("cosmetic:"))) {
    next.flags.push(`cosmetic:${cosmetic.id}`);
  }
  return next;
}
