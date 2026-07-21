import { BALANCE, CROPS, DECORATIONS, DECORATION_SLOTS, EVENTS, MODULES, ROUTE_EVENT_POOLS, ROUTE_NODES, TECH_NODES, THREATS } from "./content";
import { createDecorationPlacements } from "./model";
import { createRng } from "./rng";
import type { CropId, CropPlotId, DecorationId, EnvironmentKey, EventChoice, RationMode, ResourceKey, RunState, SurvivorKey, ThreatContact } from "./types";

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
  public moveDecoration(run: RunState, id: DecorationId, slotId: string): boolean {
    const placement = run.decorations.find((item) => item.id === id);
    const definition = DECORATIONS.find((item) => item.id === id);
    const slot = DECORATION_SLOTS.find((item) => item.id === slotId);
    if (!placement || !definition) return false;
    if (!slot) {
      run.lastMessage = `${definition.name}沒有吸附到放置槽；請放到標示的掛鉤、檯面或層架。`;
      return false;
    }
    if (!slot.accepts.includes(id)) {
      run.lastMessage = `${slot.name}不適合${definition.name}；紅色斜線槽不能放置。`;
      return false;
    }
    const occupied = run.decorations.find((item) => item.id !== id && item.slotId === slot.id);
    if (occupied) {
      const occupiedName = DECORATIONS.find((item) => item.id === occupied.id)?.name ?? "其他物件";
      run.lastMessage = `${slot.name}已放置${occupiedName}；請先移到別的槽位。`;
      return false;
    }
    placement.carriageId = slot.carriageId;
    placement.slotId = slot.id;
    placement.x = slot.x;
    placement.y = slot.y;
    run.lastMessage = `${definition.name}已吸附到${slot.name}；位置已自動保存。`;
    return true;
  }

  public resetDecorations(run: RunState): void {
    run.decorations = createDecorationPlacements();
    run.lastMessage = "四件小物已回到各自相容的車廂槽位。";
  }

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
    const cropReport = this.advanceCrops(run);
    run.day += 1;
    run.phase = "prep";
    run.actionPoints = run.survivor.sleep >= 75 ? 5 : run.survivor.sleep >= 45 ? 4 : 3;
    run.nightPowerDemand = 0;
    run.selectedRouteNodeId = undefined;
    run.survivor.wakeups = 0;
    run.activeEventId = undefined;
    run.lastMessage = `${cropReport} 第 ${run.day} 日整備開始。昨夜睡眠將影響今日行動。`;
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

  public plantCrop(run: RunState, plotId: CropPlotId, cropId: CropId): boolean {
    if (run.phase !== "prep") {
      run.lastMessage = "列車行進中無法播種。";
      return false;
    }
    const module = run.modules.find((instance) => instance.definitionId === "M003");
    const plot = run.crops.find((item) => item.id === plotId);
    const crop = CROPS.find((item) => item.id === cropId);
    if (!module?.active || !plot || !crop) {
      run.lastMessage = "垂直種植架未排入供電，無法播種。";
      return false;
    }
    if (plot.cropId) {
      run.lastMessage = "這個作物槽已有植物。";
      return false;
    }
    if (run.actionPoints < 1 || run.resources.water < 1) {
      run.lastMessage = run.actionPoints < 1 ? "播種需要 1 AP。" : "播種與首次灌溉需要 1 份水。";
      return false;
    }
    run.actionPoints -= 1;
    this.applyResource(run, "water", -1, `crop.${cropId}.plant`);
    plot.cropId = cropId;
    plot.stage = 1;
    plot.plantedDay = run.day;
    plot.wateredDay = run.day;
    plot.dryDays = 0;
    run.lastMessage = `${crop.name}已播入${plotId === "plot-a" ? "上層" : "下層"}槽；今夜供電後進入成長期。`;
    return true;
  }

  public waterCrops(run: RunState): boolean {
    const growing = run.crops.filter((plot) => plot.cropId && plot.stage < 3);
    if (run.phase !== "prep" || growing.length === 0) {
      run.lastMessage = growing.length === 0 ? "目前沒有需要灌溉的作物。" : "列車行進中無法灌溉。";
      return false;
    }
    if (growing.every((plot) => plot.wateredDay === run.day)) {
      run.lastMessage = "兩個作物槽今日水量充足。";
      return false;
    }
    if (!this.applyResource(run, "water", -1, "crop.rack.water")) {
      run.lastMessage = "飲水不足，水培循環無法啟動。";
      return false;
    }
    for (const plot of growing) plot.wateredDay = run.day;
    run.lastMessage = "水培架已灌溉；今晚需保持 3 電量供應才能生長。";
    return true;
  }

  public harvestCrop(run: RunState, plotId: CropPlotId): boolean {
    const plot = run.crops.find((item) => item.id === plotId);
    const crop = CROPS.find((item) => item.id === plot?.cropId);
    if (run.phase !== "prep" || !plot || !crop || plot.stage < 3) {
      run.lastMessage = "作物尚未成熟，不能收成。";
      return false;
    }
    if (run.actionPoints < 1 || run.resources.food >= BALANCE.max.food) {
      run.lastMessage = run.actionPoints < 1 ? "收成需要 1 AP。" : "食物儲存已滿。";
      return false;
    }
    run.actionPoints -= 1;
    const foodBefore = run.resources.food;
    this.applyResource(run, "food", crop.yield, `crop.${crop.id}.harvest`);
    const harvestedFood = run.resources.food - foodBefore;
    if (crop.id === "herb") this.applySurvivor(run, "stress", -4, "crop.herb.comfort");
    plot.cropId = undefined;
    plot.stage = 0;
    plot.plantedDay = undefined;
    plot.wateredDay = undefined;
    plot.dryDays = 0;
    run.lastMessage = `${crop.name}已收成：食物 +${harvestedFood}${crop.id === "herb" ? "、壓力 −4" : ""}。`;
    return true;
  }

  public collectWorkshopScrap(run: RunState): boolean {
    const flag = `workshop-scrap-${run.day}`;
    if (run.phase !== "prep" || run.flags.includes(flag) || run.actionPoints < 1) {
      run.lastMessage = run.flags.includes(flag) ? "今天的可用零件已整理完畢。" : "整理零件需要 1 AP。";
      return false;
    }
    run.actionPoints -= 1;
    this.applyResource(run, "parts", 1, "workshop.scrap");
    this.applyEnvironment(run, "noise", 4, "workshop.scrap");
    run.flags.push(flag);
    run.lastMessage = "工坊回收完成：零件 +1、噪音 +4。";
    return true;
  }

  public cookHotMeal(run: RunState): boolean {
    const flag = `hot-meal-${run.day}`;
    if (run.phase !== "prep" || run.flags.includes(flag) || run.actionPoints < 1) {
      run.lastMessage = run.flags.includes(flag) ? "今天已準備過熱食。" : "烹飪需要 1 AP。";
      return false;
    }
    if (run.resources.food < 1 || run.resources.water < 1 || run.resources.energy < 2) {
      run.lastMessage = "熱食需要食物 1、水 1、電量 2。";
      return false;
    }
    run.actionPoints -= 1;
    this.applyResource(run, "food", -1, "kitchen.hot-meal.food");
    this.applyResource(run, "water", -1, "kitchen.hot-meal.water");
    this.applyResource(run, "energy", -2, "kitchen.hot-meal.energy");
    this.applySurvivor(run, "stress", -8, "kitchen.hot-meal.stress");
    this.applySurvivor(run, "sleep", 10, "kitchen.hot-meal.sleep");
    run.flags.push(flag);
    run.lastMessage = "熱食完成：壓力 −8、睡眠 +10。";
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

  private advanceCrops(run: RunState): string {
    const hydroponics = run.modules.find((instance) => instance.definitionId === "M003");
    const growing = run.crops.filter((plot) => plot.cropId && plot.stage < 3);
    if (growing.length === 0) return "水培槽目前空置。";
    let advanced = 0;
    let withered = 0;
    for (const plot of growing) {
      if (hydroponics?.active && hydroponics.powered && plot.wateredDay === run.day) {
        plot.stage = Math.min(3, plot.stage + 1) as 0 | 1 | 2 | 3;
        plot.dryDays = 0;
        advanced += 1;
      } else {
        plot.dryDays += 1;
        if (plot.dryDays >= 2) {
          plot.cropId = undefined;
          plot.stage = 0;
          plot.plantedDay = undefined;
          plot.wateredDay = undefined;
          plot.dryDays = 0;
          withered += 1;
        }
      }
    }
    if (withered > 0) return `${withered} 個作物槽因連續缺水或斷電枯萎。`;
    if (advanced > 0) return `${advanced} 個作物槽完成一夜生長。`;
    return "作物因缺水或種植架斷電而停止生長。";
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
