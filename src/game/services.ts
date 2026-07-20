import { BALANCE, EVENTS, MODULES, ROUTE_EVENT_POOLS, ROUTE_NODES, TECH_NODES, THREATS } from "./content";
import { createRng } from "./rng";
import type { EnvironmentKey, EventChoice, RationMode, ResourceKey, RunState, SurvivorKey, ThreatContact } from "./types";

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export const COUNTER_COSTS: Record<string, Partial<Record<ResourceKey, number>>> = {
  "close-shutter": { energy: -8 },
  "shock-window": { energy: -12 },
  "emergency-boost": { fuel: -4 },
  decoy: { energy: -6 },
};

export function getNightPowerDemand(run: RunState): number {
  const efficiencyDiscount = run.techOwned.includes("E1") ? 1 : 0;
  return run.modules.reduce((total, instance) => {
    if (!instance.active) return total;
    const definition = MODULES.find((module) => module.id === instance.definitionId);
    return total + Math.max(0, (definition?.activeCost ?? 0) - efficiencyDiscount);
  }, 0);
}

export function counterReadiness(run: RunState, counterId: string): { available: boolean; reason: string } {
  const requiredModules: Record<string, string> = { "close-shutter": "M001", decoy: "M006" };
  const requiredModule = requiredModules[counterId];
  if (requiredModule) {
    const module = run.modules.find((instance) => instance.definitionId === requiredModule);
    if (!module) return { available: false, reason: "未安裝" };
    if (!module.active || !module.powered) return { available: false, reason: "未供電" };
  }
  for (const [key, delta] of Object.entries(COUNTER_COSTS[counterId] ?? {})) {
    if (typeof delta === "number" && run.resources[key as ResourceKey] + delta < 0) return { available: false, reason: `${key === "fuel" ? "燃料" : "電量"}不足` };
  }
  return { available: true, reason: "可用" };
}

export class RunService {
  public applyResource(run: RunState, key: ResourceKey, delta: number, source: string): boolean {
    const before = run.resources[key];
    const maximum = BALANCE.max[key];
    if (delta < 0 && before + delta < 0) return false;
    const after = clamp(before + delta, 0, maximum);
    run.resources[key] = after;
    run.ledger.push({ id: crypto.randomUUID(), at: Date.now(), source, key, before, delta: after - before, after });
    return true;
  }

  public applySurvivor(run: RunState, key: SurvivorKey, delta: number, source: string): void {
    const before = run.survivor[key];
    const maximum = key === "wakeups" ? 99 : 100;
    const after = clamp(before + delta, 0, maximum);
    run.survivor[key] = after;
    run.ledger.push({ id: crypto.randomUUID(), at: Date.now(), source, key, before, delta: after - before, after });
  }

  public applyEnvironment(run: RunState, key: EnvironmentKey, delta: number, source: string): void {
    const before = run.environment[key];
    const minimum = key === "temperature" ? -10 : 0;
    const maximum = key === "temperature" ? 35 : 100;
    const after = clamp(before + delta, minimum, maximum);
    run.environment[key] = after;
    run.ledger.push({ id: crypto.randomUUID(), at: Date.now(), source, key, before, delta: after - before, after });
  }

  public chooseRoute(run: RunState, nodeId: string): void {
    const node = ROUTE_NODES.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(`Unknown route node: ${nodeId}`);
    if (!this.applyResource(run, "fuel", -node.fuelCost, `route.${node.id}`)) {
      run.lastMessage = "燃料不足，請選擇較近的節點。";
      return;
    }
    run.selectedRouteNodeId = node.id;
    const eventPool = ROUTE_EVENT_POOLS[node.id] ?? [node.eventId];
    run.activeEventId = eventPool[(run.day - 1) % eventPool.length] ?? node.eventId;
    run.phase = "travel";
    run.lastMessage = `已鎖定 ${node.name}，預計消耗燃料 ${node.fuelCost}。`;
  }

  public resolveEvent(run: RunState, choice: EventChoice): boolean {
    for (const [key, delta] of Object.entries(choice.deltas)) {
      if (typeof delta === "number" && delta < 0 && run.resources[key as ResourceKey] + delta < 0) {
        run.lastMessage = `資源不足，無法執行「${choice.label}」。`;
        return false;
      }
    }
    for (const [key, delta] of Object.entries(choice.deltas)) {
      if (typeof delta === "number") this.applyResource(run, key as ResourceKey, delta, `event.${run.activeEventId}.${choice.id}`);
    }
    for (const [key, delta] of Object.entries(choice.survivor ?? {})) {
      if (typeof delta === "number") this.applySurvivor(run, key as SurvivorKey, delta, `event.${run.activeEventId}.${choice.id}`);
    }
    for (const [key, delta] of Object.entries(choice.environment ?? {})) {
      if (typeof delta === "number") this.applyEnvironment(run, key as EnvironmentKey, delta, `event.${run.activeEventId}.${choice.id}`);
    }
    run.lastMessage = choice.result;
    run.activeEventId = undefined;
    this.beginNight(run);
    return true;
  }

  public beginNight(run: RunState): void {
    const orderRng = createRng(run.seed, "threat-order");
    const offset = Math.floor(orderRng() * THREATS.length);
    const threat = THREATS[(offset + run.day - 1) % THREATS.length] ?? THREATS[0]!;
    const powerReport = this.settleNightPower(run);
    run.phase = "night";
    run.activeContact = {
      id: `contact-${run.day}`,
      definitionId: threat.id,
      stage: "approach",
      secondsLeft: Math.max(7, threat.warningSeconds - Math.floor((run.day - 1) / 2)),
    };
    run.lastMessage = `${powerReport} 遠距感測出現異常，等待方向確認。`;
  }

  public tickNight(run: RunState): void {
    const contact = run.activeContact;
    if (run.phase !== "night" || !contact || contact.stage === "resolve") return;
    if (contact.stage === "breach") {
      this.finishNight(run);
      return;
    }
    contact.secondsLeft -= 1;
    if (contact.secondsLeft > 0) {
      if (contact.stage === "approach" && contact.secondsLeft <= 6) contact.stage = "warning";
      if (contact.stage === "warning" && contact.secondsLeft <= 3) contact.stage = "attack";
      return;
    }
    const threat = THREATS.find((candidate) => candidate.id === contact.definitionId);
    if (!threat) return;
    contact.stage = "breach";
    this.applyEnvironment(run, "hull", -(threat.damage + (run.day - 1) * 2), `threat.${threat.id}.breach`);
    this.applySurvivor(run, "stress", 12, `threat.${threat.id}.breach`);
    this.applySurvivor(run, "sleep", -18, `threat.${threat.id}.breach`);
    run.lastMessage = `${threat.name}造成破口。損害已隔離，但乘客被驚醒。`;
  }

  public counterThreat(run: RunState, counterId: string): boolean {
    const contact = run.activeContact;
    if (!contact) return false;
    const threat = THREATS.find((candidate) => candidate.id === contact.definitionId);
    if (!threat) return false;
    const readiness = counterReadiness(run, counterId);
    if (!readiness.available) {
      run.lastMessage = `反制未啟動：${readiness.reason}。`;
      return false;
    }
    const cost = COUNTER_COSTS[counterId] ?? {};
    for (const [key, delta] of Object.entries(cost)) {
      if (typeof delta === "number") this.applyResource(run, key as ResourceKey, delta, `counter.${counterId}`);
    }
    const effective = threat.counterIds.includes(counterId);
    if (effective) {
      contact.stage = "resolve";
      contact.resolvedBy = counterId;
      run.lastMessage = `${threat.name}已離開接觸範圍。車廂重新安靜。`;
      this.finishNight(run);
      return true;
    }
    contact.secondsLeft = Math.max(1, contact.secondsLeft - 2);
    run.lastMessage = "反制無效，接觸仍在升級。";
    return false;
  }

  public finishNight(run: RunState): void {
    const encounterMessage = run.lastMessage ?? "守夜結束。";
    const rationMessage = this.settleRation(run);
    const comfort = run.environment.temperature >= 16 && run.environment.temperature <= 24 ? BALANCE.sleepComfort : 0;
    const sleep = clamp(run.survivor.sleep - 8 * run.survivor.wakeups - Math.max(0, run.environment.noise - 20) + comfort - (100 - run.environment.hull) * 0.2);
    run.survivor.sleep = Math.round(sleep);
    this.applyResource(run, "data", 1, "aftermath.night-complete");
    run.activeContact = undefined;
    if (run.environment.hull <= 0 || run.survivor.health <= 0) {
      run.phase = "ending";
      run.ended = true;
      run.outcome = run.environment.hull <= 0 ? "hull-lost" : "survivor-lost";
      run.lastMessage = run.environment.hull <= 0 ? "車體失去密封，守護協定被迫終止。" : "A-07 生命徵象消失，守護協定被迫終止。";
    } else {
      run.phase = "aftermath";
      run.lastMessage = `${encounterMessage} ${rationMessage}`;
    }
  }

  public continueAftermath(run: RunState): void {
    if (run.day >= run.maxDays) {
      run.phase = "ending";
      run.ended = true;
      run.outcome = "victory";
      run.lastMessage = "灰霧線完成。新的路線資料已寫入守護協定。";
      return;
    }
    run.day += 1;
    run.phase = "prep";
    run.actionPoints = run.survivor.sleep >= 75 ? 5 : run.survivor.sleep >= 45 ? 4 : 3;
    run.nightPowerDemand = 0;
    run.selectedRouteNodeId = undefined;
    run.survivor.wakeups = 0;
    run.activeEventId = undefined;
    run.lastMessage = `第 ${run.day} 日整備開始。昨夜睡眠將影響今日行動。`;
  }

  public buildModule(run: RunState, definitionId: string): boolean {
    if (run.phase !== "prep") {
      run.lastMessage = "只有整備階段能建造模組。";
      return false;
    }
    const definition = MODULES.find((candidate) => candidate.id === definitionId);
    if (!definition) return false;
    if (run.modules.some((module) => module.definitionId === definitionId)) {
      run.lastMessage = `${definition.name}已安裝，可在配電面板切換。`;
      return false;
    }
    if (run.actionPoints < 2) {
      run.lastMessage = "行動點不足；建造需要 2 AP。";
      return false;
    }
    if (run.resources.parts < definition.cost) {
      run.lastMessage = "零件不足，建造預覽已保留。";
      return false;
    }
    if (!this.applyResource(run, "parts", -definition.cost, `module.${definitionId}.build`)) {
      run.lastMessage = "零件不足，建造預覽已保留。";
      return false;
    }
    run.actionPoints -= 2;
    run.modules.push({ id: crypto.randomUUID(), definitionId, slotId: `${definition.slot}-${run.modules.length + 1}`, active: true, powered: true, durability: 100, mk: 1 });
    run.lastMessage = `${definition.name}已安裝；消耗 2 AP，今夜負載將增加。`;
    return true;
  }

  public toggleModule(run: RunState, definitionId: string): boolean {
    const instance = run.modules.find((module) => module.definitionId === definitionId);
    const definition = MODULES.find((module) => module.id === definitionId);
    if (!instance || !definition) {
      run.lastMessage = "該設備尚未安裝。";
      return false;
    }
    instance.active = !instance.active;
    instance.powered = instance.active;
    run.lastMessage = `${definition.name}已${instance.active ? "排入今夜配電" : "停用並釋放負載"}。`;
    return true;
  }

  public setRation(run: RunState, mode: RationMode): void {
    if (run.phase !== "prep") {
      run.lastMessage = "配餐必須在出發前完成。";
      return;
    }
    run.rationMode = mode;
    const labels: Record<RationMode, string> = { full: "安心餐", standard: "標準餐", strict: "節約餐" };
    run.lastMessage = `今夜配餐改為${labels[mode]}；效果會在黎明結算。`;
  }

  public harvest(run: RunState): boolean {
    if (run.phase !== "prep") {
      run.lastMessage = "列車行進中無法收成。";
      return false;
    }
    const flag = `harvested-${run.day}`;
    const module = run.modules.find((instance) => instance.definitionId === "M003");
    if (!module?.active || run.flags.includes(flag)) {
      run.lastMessage = run.flags.includes(flag) ? "本日作物已收成。" : "垂直種植架目前停用。";
      return false;
    }
    if (run.actionPoints < 1 || run.resources.water < 1 || run.resources.food >= BALANCE.max.food) {
      run.lastMessage = run.actionPoints < 1 ? "行動點不足。" : run.resources.water < 1 ? "飲水不足，無法灌溉收成。" : "食物儲存已滿。";
      return false;
    }
    run.actionPoints -= 1;
    this.applyResource(run, "water", -1, "prep.harvest.water");
    this.applyResource(run, "food", 2, "prep.harvest.food");
    run.flags.push(flag);
    run.lastMessage = "消耗 1 AP 與 1 飲水，收成 2 份葉菜。";
    return true;
  }

  public comfortPassenger(run: RunState): boolean {
    if (run.phase !== "prep") {
      run.lastMessage = "守夜開始後無法執行安撫。";
      return false;
    }
    const flag = `comforted-${run.day}`;
    if (run.flags.includes(flag) || run.actionPoints < 1) {
      run.lastMessage = run.flags.includes(flag) ? "A-07 已經安定下來。" : "行動點不足。";
      return false;
    }
    run.actionPoints -= 1;
    this.applySurvivor(run, "stress", -8, "prep.comfort");
    this.applySurvivor(run, "trust", 2, "prep.comfort");
    run.flags.push(flag);
    run.lastMessage = "消耗 1 AP；A-07 壓力 −8、信任 +2。";
    return true;
  }

  public repairCarriage(run: RunState): boolean {
    if (run.phase !== "prep") {
      run.lastMessage = "列車行進中無法維修車體。";
      return false;
    }
    if (run.environment.hull >= 100) {
      run.lastMessage = "車體完整，無需維修。";
      return false;
    }
    if (run.actionPoints < 2 || run.resources.parts < 2) {
      run.lastMessage = run.actionPoints < 2 ? "維修需要 2 AP。" : "維修需要 2 個零件。";
      return false;
    }
    run.actionPoints -= 2;
    this.applyResource(run, "parts", -2, "prep.repair.parts");
    this.applyEnvironment(run, "hull", 14, "prep.repair.hull");
    run.lastMessage = "消耗 2 AP 與 2 零件；車體完整度 +14。";
    return true;
  }

  public unlockTech(run: RunState, techId: string): boolean {
    const node = TECH_NODES.find((candidate) => candidate.id === techId);
    if (!node || run.techOwned.includes(techId)) return false;
    if (!node.prerequisite.every((id) => run.techOwned.includes(id))) {
      run.lastMessage = "前置協定尚未解鎖。";
      return false;
    }
    if (!this.applyResource(run, "data", -node.cost, `tech.${techId}.unlock`)) {
      run.lastMessage = "協定資料不足。";
      return false;
    }
    run.techOwned.push(techId);
    run.lastMessage = `${node.name}已寫入下一局的科技快照。`;
    return true;
  }

  public getEvent(run: RunState) {
    return EVENTS.find((event) => event.id === run.activeEventId) ?? EVENTS[0];
  }

  public getThreat(contact?: ThreatContact) {
    return THREATS.find((threat) => threat.id === contact?.definitionId);
  }

  private settleNightPower(run: RunState): string {
    const efficiencyDiscount = run.techOwned.includes("E1") ? 1 : 0;
    const ordered = run.modules
      .map((instance) => ({ instance, definition: MODULES.find((module) => module.id === instance.definitionId) }))
      .filter((item) => item.definition)
      .sort((left, right) => (right.definition?.priority ?? 0) - (left.definition?.priority ?? 0));
    let spent = 0;
    const offline: string[] = [];
    for (const { instance, definition } of ordered) {
      if (!definition || !instance.active) {
        instance.powered = false;
        continue;
      }
      const cost = Math.max(0, definition.activeCost - efficiencyDiscount);
      if (spent + cost <= run.resources.energy) {
        instance.powered = true;
        spent += cost;
      } else {
        instance.powered = false;
        offline.push(definition.name);
      }
    }
    if (spent > 0) this.applyResource(run, "energy", -spent, "night.power-grid");
    run.nightPowerDemand = spent;
    const heaterOnline = run.modules.some((instance) => instance.definitionId === "M002" && instance.active && instance.powered);
    this.applyEnvironment(run, "temperature", heaterOnline ? 1 : -3, "night.heating");
    return offline.length ? `今夜耗電 ${spent} E；斷載：${offline.join("、")}。` : `今夜耗電 ${spent} E；所有排程設備供電正常。`;
  }

  private settleRation(run: RunState): string {
    const plans: Record<RationMode, { food: number; water: number; sleep: number; stress: number; trust: number; label: string }> = {
      full: { food: 2, water: 2, sleep: 8, stress: -4, trust: 3, label: "安心餐" },
      standard: { food: 1, water: 1, sleep: 0, stress: 0, trust: 0, label: "標準餐" },
      strict: { food: 0, water: 1, sleep: -5, stress: 4, trust: -2, label: "節約餐" },
    };
    const plan = plans[run.rationMode];
    const shortage = run.resources.food < plan.food || run.resources.water < plan.water;
    const foodSpent = Math.min(run.resources.food, plan.food);
    const waterSpent = Math.min(run.resources.water, plan.water);
    if (foodSpent) this.applyResource(run, "food", -foodSpent, "aftermath.meal");
    if (waterSpent) this.applyResource(run, "water", -waterSpent, "aftermath.water");
    if (shortage) {
      this.applySurvivor(run, "health", -6, "aftermath.shortage");
      this.applySurvivor(run, "stress", 8, "aftermath.shortage");
      this.applySurvivor(run, "sleep", -10, "aftermath.shortage");
      return "配餐不足：健康 −6、壓力 +8。";
    }
    if (plan.sleep) this.applySurvivor(run, "sleep", plan.sleep, `aftermath.ration.${run.rationMode}`);
    if (plan.stress) this.applySurvivor(run, "stress", plan.stress, `aftermath.ration.${run.rationMode}`);
    if (plan.trust) this.applySurvivor(run, "trust", plan.trust, `aftermath.ration.${run.rationMode}`);
    return `${plan.label}已執行。`;
  }
}
