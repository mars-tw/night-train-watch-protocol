import rawCatalog from "../../../spec/reboot-v2/mission-catalog.json";
import type { QuestDefinition } from "./types";

const definitions = rawCatalog.missions as unknown as QuestDefinition[];
const definitionIds = new Set(definitions.map((definition) => definition.id));

if (definitions.length !== 56 || definitionIds.size !== definitions.length) {
  throw new Error("Invalid reboot-v2 mission catalog");
}

export const QUEST_CATALOG: readonly QuestDefinition[] = Object.freeze(definitions);

export function getQuestDefinition(id: string): QuestDefinition | undefined {
  return QUEST_CATALOG.find((definition) => definition.id === id);
}
