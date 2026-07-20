import { BALANCE, EVENTS, MODULES, ROUTE_EVENT_POOLS, ROUTE_NODES, TECH_NODES, THREATS } from "./content";
import { createRng } from "./rng";
import type { EnvironmentKey, EventChoice, ResourceKey, RunState, SurvivorKey, ThreatContact } from "./types";

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

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
    run.phase = "night";
    run.activeContact = {
      id: `contact-${run.day}`,
      definitionId: threat.id,
      stage: "approach",
      secondsLeft: threat.warningSeconds,
    };
    run.lastMessage = "遠距感測出現異常。保持室內安靜，等待方向確認。";
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
    this.applyEnvironment(run, "hull", -threat.damage, `threat.${threat.id}.breach`);
    this.applySurvivor(run, "stress", 12, `threat.${threat.id}.breach`);
    this.applySurvivor(run, "sleep", -18, `threat.${threat.id}.breach`);
    run.lastMessage = `${threat.name}造成破口。損害已隔離，但乘客被驚醒。`;
  }

  public counterThreat(run: RunState, counterId: string): boolean {
    const contact = run.activeContact;
    if (!contact) return false;
    const threat = THREATS.find((candidate) => candidate.id === contact.definitionId);
    if (!threat) return false;
    const costs: Record<string, Partial<Record<ResourceKey, number>>> = {
      "close-shutter": { energy: -8 },
      "shock-window": { energy: -12 },
      "emergency-boost": { fuel: -4 },
      decoy: { energy: -6 },
    };
    const cost = costs[counterId] ?? {};
    for (const [key, delta] of Object.entries(cost)) {
      if (typeof delta === "number" && run.resources[key as ResourceKey] + delta < 0) {
        run.lastMessage = "資源不足，反制未啟動。";
        return false;
      }
    }
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
    const comfort = run.environment.temperature >= 16 && run.environment.temperature <= 24 ? BALANCE.sleepComfort : 0;
    const sleep = clamp(run.survivor.sleep - 8 * run.survivor.wakeups - Math.max(0, run.environment.noise - 20) + comfort - (100 - run.environment.hull) * 0.2);
    run.survivor.sleep = Math.round(sleep);
    this.applyResource(run, "food", -1, "aftermath.meal");
    this.applyResource(run, "water", -1, "aftermath.water");
    this.applyResource(run, "data", 1, "aftermath.night-complete");
    run.phase = "aftermath";
    run.activeContact = undefined;
  }

  public continueAftermath(run: RunState): void {
    if (run.day >= run.maxDays) {
      run.phase = "ending";
      run.ended = true;
      run.lastMessage = "灰霧線完成。新的路線資料已寫入守護協定。";
      return;
    }
    run.day += 1;
    run.phase = "prep";
    run.selectedRouteNodeId = undefined;
    run.survivor.wakeups = 0;
    run.activeEventId = undefined;
    run.lastMessage = `第 ${run.day} 日整備開始。昨夜睡眠將影響今日行動。`;
  }

  public buildModule(run: RunState, definitionId: string): boolean {
    const definition = MODULES.find((candidate) => candidate.id === definitionId);
    if (!definition) return false;
    if (!this.applyResource(run, "parts", -definition.cost, `module.${definitionId}.build`)) {
      run.lastMessage = "零件不足，建造預覽已保留。";
      return false;
    }
    if (!run.modules.some((module) => module.definitionId === definitionId)) {
      run.modules.push({ id: crypto.randomUUID(), definitionId, slotId: `${definition.slot}-${run.modules.length + 1}`, active: true, powered: true, durability: 100, mk: 1 });
    }
    run.lastMessage = `${definition.name}已安裝，配電需求立即更新。`;
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
}
