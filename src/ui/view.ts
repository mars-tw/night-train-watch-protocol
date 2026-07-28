import { CARRIAGES, CROPS, DECORATIONS, DECORATION_SLOTS, MODULES, ROUTE_NODES, TECH_NODES, THREATS } from "../game/content";
import { counterReadiness, getNightPowerDemand } from "../game/services";
import { frostClearRequirement, frostWarmRequirement, getThermalAllocation } from "../game/story";
import type { AppState, CarriageId, FrostBranch, FrostSwitchMethod, FrostZone, GameEvent, HeatTokenId, RunState, ThreatContact, ThreatSignal, ThreatSignalRhythm, WhiteFrostState } from "../game/types";
import { escapeText, formatSigned } from "./dom";
import { icons } from "./icons";

type ActionHandler = (action: string, value?: string) => void;

type StoryChoicePresentation = {
  risk?: "low" | "medium" | "high" | "irreversible";
  tags?: string[];
  visibleCost?: string;
  permanentConsequence?: string;
  disabledReason?: string;
  unavailableReason?: string;
  available?: boolean;
  requirement?: { minimum?: Record<string, number> };
  requirements?: {
    allFlags?: string[];
    minimum?: Record<string, number>;
    a07ConsentOrTech?: string;
    frostBranch?: FrostBranch;
    frostSwitchMethod?: FrostSwitchMethod;
    frostConsent?: string;
    frostCoauthorEvidence?: boolean;
    frostThermal?: "day7-committed" | "warm-ready" | "clear-ready";
  };
  consequence?: {
    resourceDelta?: Record<string, number>;
    survivorDelta?: Record<string, number>;
  };
};

type StoryEventPresentation = {
  forced?: boolean;
  forceResolution?: boolean;
};

type StoryResultSnapshot = {
  flags: {
    day4Route: "GO" | "DETOUR" | "STOP" | null;
  };
  finalDecision: "open" | "seal" | "reroute" | "terminate" | null;
  endingId: "arrival" | "quarantine" | "reroute" | "protocol-terminated" | "arrival-unverified" | null;
  endingReasons: string[];
  whiteFrost?: WhiteFrostState | null;
};

const LEDGER_LABELS: Record<string, string> = {
  energy: "電量",
  fuel: "燃料",
  food: "食物",
  water: "飲水",
  parts: "零件",
  medicine: "藥品",
  data: "協定資料",
  health: "健康",
  stress: "壓力",
  infection: "感染",
  trust: "信任",
  sleep: "睡眠",
  wakeups: "驚醒",
  temperature: "溫度",
  noise: "噪音",
  visibility: "能見度",
  hull: "車體",
  weight: "負重",
};

const STORY_RISK_LABELS: Record<NonNullable<StoryChoicePresentation["risk"]>, string> = {
  low: "低風險",
  medium: "中風險",
  high: "高風險",
  irreversible: "不可逆",
};

const DAY4_CHOICE_SUMMARIES: Record<string, { carriage: string; data: string; wave: string }> = {
  GO: { carriage: "隔離間", data: "逆向定位 2 次", wave: "W3・靜默群 T006" },
  DETOUR: { carriage: "電池陣", data: "路線抽樣 2 次", wave: "W3・霧噬藤 T004" },
  STOP: { carriage: "採樣室", data: "名冊交叉比對 2 次", wave: "W3・回聲乘客 T005" },
};

const FROST_CHOICE_SUMMARIES: Record<string, { carriage: string; data: string; wave: string }> = {
  CARE: { carriage: "臥鋪保暖區", data: "BERTH 有效熱能 +1", wave: "Day 5・照護艙保溫" },
  CLEAR: { carriage: "牽引除冰台", data: "DEICER 有效熱能 +1", wave: "Day 5・轉轍清障" },
  SUSTAIN: { carriage: "循環維生環", data: "LOOP 有效熱能 +1", wave: "Day 5・水培防凍" },
};

const DAY4_RESULT_LABELS: Record<string, string> = {
  GO: "沿線前進・隔離間",
  DETOUR: "改道搜索・電池陣",
  STOP: "停車查證・採樣室",
};

const FROST_BRANCH_LABELS: Record<FrostBranch, string> = {
  CARE: "照護優先・臥鋪保暖",
  CLEAR: "清障優先・牽引除冰",
  SUSTAIN: "維生優先・循環防凍",
};

const FINAL_DECISION_LABELS: Record<string, string> = {
  open: "交還控制並開門",
  seal: "啟動封鎖",
  reroute: "改寫目的地",
  terminate: "終止守夜協定",
  joint: "共同確認熱路",
  shield: "守護 A-07 的選擇",
  "a07-plan": "採用 A-07 改道方案",
  "emergency-stop": "緊急停車避難",
};

const STORY_ENDING_TITLES: Record<string, string> = {
  arrival: "共同抵達",
  quarantine: "封鎖月台",
  reroute: "改寫終點",
  "protocol-terminated": "協定終止",
  "arrival-unverified": "未確認抵達",
  "frost-shared-arrival": "共享熱源抵達",
  "frost-guarded-arrival": "守護式抵達",
  "frost-chosen-detour": "共同選擇改道",
  "frost-emergency-shelter": "雪崩避難",
};

const FROST_ZONE_PRESENTATION: Record<FrostZone, { label: string; short: string; icon: string; effect: string }> = {
  BERTH: { label: "臥鋪保暖", short: "臥鋪", icon: "眠", effect: "守住溫度與睡眠" },
  DEICER: { label: "牽引除冰", short: "除冰", icon: "軌", effect: "清除凍結轉轍" },
  LOOP: { label: "循環維生", short: "循環", icon: "芽", effect: "保住水與作物" },
};

function storyChoiceReason(run: RunState, eventId: string, choice: GameEvent["choices"][number]): string | undefined {
  const presentation = choice as GameEvent["choices"][number] & StoryChoicePresentation;
  if (presentation.disabledReason) return presentation.disabledReason;
  if (presentation.unavailableReason) return presentation.unavailableReason;
  const requirements = presentation.requirements;
  const storyFlags = ((run as RunState & { story?: StoryResultSnapshot }).story?.flags ?? {}) as unknown as Record<string, unknown>;
  const missingFlags = requirements?.allFlags?.filter((flag) => !storyFlags[flag]) ?? [];
  if (missingFlags.length > 0) {
    const labels: Record<string, string> = {
      quarantinePrepared: "尚未建立隔離封鎖",
      trueRouteData: "尚未取得真實路線資料",
      clause7Read: "尚未讀完第七條",
    };
    return missingFlags.map((flag) => labels[flag] ?? `缺少 ${flag}`).join("、");
  }
  if (requirements?.a07ConsentOrTech) {
    const authorKnown = Boolean(storyFlags.authorKnown);
    const consentGranted = run.survivor.trust >= 60 || (run.survivor.trust >= 40 && authorKnown);
    if (!consentGranted && !run.techOwned.includes(requirements.a07ConsentOrTech)) {
      return `A-07 尚未同意；需要 ${requirements.a07ConsentOrTech} 覆寫`;
    }
  }
  const whiteFrost = run.story.whiteFrost;
  if (requirements?.frostBranch && whiteFrost?.branch !== requirements.frostBranch) {
    return `僅限 ${requirements.frostBranch} 分支`;
  }
  if (requirements?.frostSwitchMethod && whiteFrost?.switchMethod !== requirements.frostSwitchMethod) {
    return `需要 Day 2 採用 ${requirements.frostSwitchMethod} 清障`;
  }
  if (requirements?.frostConsent && whiteFrost?.consent !== requirements.frostConsent) {
    return `需要 A-07 同意狀態：${requirements.frostConsent}`;
  }
  if (requirements?.frostCoauthorEvidence && !whiteFrost?.coauthorEvidence) {
    return "尚未取得 A-07 共同署名證據";
  }
  if (eventId === "EV065" && choice.id === "joint" && whiteFrost && run.survivor.trust < whiteFrost.jointTrustRequirement) {
    return `共同控制需要信任 ${whiteFrost.jointTrustRequirement}`;
  }
  if (requirements?.frostThermal) {
    if (!whiteFrost) return "白霜熱力資料尚未建立";
    const allocation = getThermalAllocation(whiteFrost.thermal.tokens);
    if (requirements.frostThermal === "day7-committed" && whiteFrost.thermal.committedDay !== 7) {
      return "尚未提交 Day 7 熱力配置";
    }
    if (requirements.frostThermal === "warm-ready" && allocation.BERTH < frostWarmRequirement(whiteFrost)) {
      return `臥鋪需要 ${frostWarmRequirement(whiteFrost)} 枚熱能`;
    }
    if (requirements.frostThermal === "clear-ready" && allocation.DEICER < frostClearRequirement(whiteFrost)) {
      return `除冰區需要 ${frostClearRequirement(whiteFrost)} 枚熱能`;
    }
  }
  const minimum = { ...(requirements?.minimum ?? presentation.requirement?.minimum ?? {}) };
  if (eventId === "EV064" && choice.id === "deice" && whiteFrost?.switchMethod === "deicer") {
    minimum.energy = 2;
  }
  if (minimum) {
    const current: Record<string, number> = { ...run.resources, ...run.survivor };
    const missing = Object.entries(minimum)
      .filter(([key, value]) => (current[key] ?? 0) < value)
      .map(([key, value]) => `${LEDGER_LABELS[key] ?? key} ${value}`);
    if (missing.length > 0) return `條件不足：${missing.join("、")}`;
  }
  let resourceDelta = presentation.consequence?.resourceDelta ?? choice.deltas;
  if (eventId === "EV064" && choice.id === "deice" && whiteFrost?.switchMethod === "deicer") {
    resourceDelta = { ...resourceDelta, energy: -2 };
  }
  if (eventId === "EV056" && choice.id === "override" && whiteFrost?.recordCalibrated) {
    resourceDelta = { ...resourceDelta, energy: -2 };
  }
  if (eventId === "EV065" && choice.id === "shield") {
    resourceDelta = { ...resourceDelta, fuel: -Math.min(2, run.resources.fuel) };
  }
  const unaffordable = Object.entries(resourceDelta ?? {}).find(([key, delta]) => typeof delta === "number" && delta < 0 && run.resources[key as keyof typeof run.resources] + delta < 0);
  if (unaffordable) return `${LEDGER_LABELS[unaffordable[0]] ?? unaffordable[0]}不足`;
  if (presentation.available === false) return "條件尚未完成";
  return undefined;
}

function day4ChoiceSummary(eventId: string, choice: GameEvent["choices"][number]): string {
  if (eventId !== "EV044" && eventId !== "EV057") return "";
  const summary = eventId === "EV057" ? FROST_CHOICE_SUMMARIES[choice.id] : DAY4_CHOICE_SUMMARIES[choice.id];
  if (!summary) return "";
  return `<span class="choice-permanent">
    <b>永久車廂・${escapeText(summary.carriage)}</b>
    <small>資料取得・${escapeText(summary.data)}</small>
    <small>${escapeText(summary.wave)}</small>
  </span>`;
}

function storyChoiceCard(run: RunState, event: GameEvent, choice: GameEvent["choices"][number], preview: boolean): string {
  const presentation = choice as GameEvent["choices"][number] & StoryChoicePresentation;
  const reason = storyChoiceReason(run, event.id, choice);
  const disabled = preview || Boolean(reason);
  const risk = presentation.risk;
  const tags = presentation.tags ?? [];
  const visibleCost = event.id === "EV064"
    && choice.id === "deice"
    && run.story.whiteFrost?.switchMethod === "deicer"
    ? "電量 −2（Day 2 融冰折扣 −1）；DEICER 達分支門檻"
    : event.id === "EV056"
      && choice.id === "override"
      && run.story.whiteFrost?.recordCalibrated
      ? "電量 −2（校對回收 1）；信任 −4；溫度 +2"
    : event.id === "EV065" && choice.id === "shield"
      ? `燃料 −${Math.min(2, run.resources.fuel)}（最多 2）；壓力 +4`
    : presentation.visibleCost ?? choice.cost ?? "無直接成本";
  const known = choice.known ?? presentation.permanentConsequence ?? "選擇後立即結算";
  const classes = [
    "choice-card",
    risk ? `risk-${risk}` : "",
    reason ? "is-unavailable" : "",
  ].filter(Boolean).join(" ");
  return `<button class="${classes}" data-action="event-choice" data-value="${escapeText(choice.id)}" ${disabled ? "disabled" : ""} ${reason ? `aria-describedby="choice-reason-${escapeText(event.id)}-${escapeText(choice.id)}"` : ""}>
    <span class="choice-card__index" aria-hidden="true">${escapeText(choice.id)}</span>
    <span class="choice-card__content">
      <span class="choice-card__heading"><strong>${escapeText(choice.label)}</strong>${risk ? `<em class="risk-badge">${escapeText(STORY_RISK_LABELS[risk])}</em>` : ""}</span>
      ${tags.length > 0 ? `<span class="choice-tags" aria-label="分類標籤">${tags.map((tag) => `<i>${escapeText(tag)}</i>`).join("")}</span>` : ""}
      <span class="choice-visible-cost"><b>直接成本</b>${escapeText(visibleCost)}</span>
      <small class="choice-known">${escapeText(known)}</small>
      ${day4ChoiceSummary(event.id, choice)}
      ${reason ? `<span class="choice-disabled-reason" id="choice-reason-${escapeText(event.id)}-${escapeText(choice.id)}"><b>目前不可選</b>${escapeText(reason)}</span>` : ""}
      ${preview ? `<span class="choice-disabled-reason"><b>圖鑑模式</b>不會推進或消耗資源</span>` : ""}
    </span>
  </button>`;
}

function button(action: string, label: string, options: { value?: string; primary?: boolean; disabled?: boolean; icon?: string; detail?: string; className?: string } = {}): string {
  const classes = ["action-button", options.primary ? "action-button--primary" : "", options.className ?? ""].filter(Boolean).join(" ");
  return `<button class="${classes}" type="button" data-action="${action}" ${options.value ? `data-value="${escapeText(options.value)}"` : ""} ${options.disabled ? "disabled" : ""}>
    <span class="action-button__icon" aria-hidden="true">${escapeText(options.icon ?? "◇")}</span>
    <span class="action-button__copy"><strong>${escapeText(label)}</strong>${options.detail ? `<small>${escapeText(options.detail)}</small>` : ""}</span>
    <span class="action-button__chevron" aria-hidden="true">›</span>
  </button>`;
}

function compactHeader(run: RunState, title: string, subtitle: string, backAction?: string): string {
  return `<header class="app-header">
    <div class="app-header__title">
      ${backAction ? `<button class="icon-button" data-action="${backAction}" aria-label="返回">${icons.back}</button>` : `<span class="day-mark">第 ${run.day} 日</span>`}
      <div><strong>${escapeText(title)}</strong><small>${escapeText(subtitle)}</small></div>
    </div>
    <div class="resource-bar" aria-label="核心資源">
      <span><b>${icons.power}</b><i><em style="--meter:${run.resources.energy}%"></em></i><strong>${run.resources.energy}/100</strong></span>
      <span><b>${icons.fuel}</b><i><em style="--meter:${Math.round((run.resources.fuel / 60) * 100)}%"></em></i><strong>${run.resources.fuel}/60</strong></span>
    </div>
  </header>`;
}

function statusPill(state: AppState): string {
  const labels = { none: "未偵測到存檔", saved: "本機存檔完成", saving: "正在保存", recovered: "已從備份修復", error: "存檔失敗" };
  return `<div class="save-status save-status--${state.saveStatus}" role="status">${labels[state.saveStatus]}</div>`;
}

function menuScreen(state: AppState, hasSave: boolean): string {
  return `<section class="screen screen--menu" data-screen="SCR-MM-${hasSave ? "A" : "B"}">
    <div class="brand-lockup" aria-label="夜行列車：守夜協定">
      <span class="brand-rails" aria-hidden="true"><i></i><i></i><i></i></span>
      <h1>夜行列車</h1><p>守 夜 協 定</p>
    </div>
    ${statusPill({ ...state, saveStatus: hasSave ? state.saveStatus === "recovered" ? "recovered" : "saved" : "none" })}
    <nav class="menu-actions" aria-label="主選單">
      ${hasSave ? button("continue", "繼續守夜", { primary: true, icon: icons.play, detail: "載入本機保存的路線與操作進度" }) : ""}
      <div class="route-launch-grid" aria-label="選擇七夜故事路線">
        ${button("new-game", "R02・白霜線", { value: "R02", primary: !hasSave, icon: "霜", detail: "熱力分流・暴風雪・照護抉擇", className: "route-launch-card route-launch-card--frost" })}
        ${button("new-game", "R01・灰霧線", { value: "R01", icon: "霧", detail: "訊號辨識・感染與封鎖", className: "route-launch-card" })}
      </div>
      ${hasSave ? button("hub", "局外中心", { icon: icons.hub }) : ""}
      ${button("settings", "設定與無障礙", { icon: icons.settings })}
    </nav>
    <footer class="menu-footer"><span>● 離線可玩</span><span>雲端存檔：未連線</span></footer>
  </section>`;
}

function hubScreen(state: AppState): string {
  const run = state.run;
  if (!run) return "";
  const milestones = Math.min(5, 1 + run.techOwned.length);
  return `<section class="screen screen--hub" data-screen="SCR-MH-A">
    ${compactHeader(run, "局外中心", "守護協定與列車藍圖", "menu")}
    <div class="protocol-data pill"><span>協定資料</span><strong>${run.resources.data}</strong></div>
    <article class="blueprint-card panel">
      <div class="section-heading"><span>列車藍圖</span><small>七夜旅程配置</small></div>
      <div class="train-blueprint" aria-label="列車配置進度">${["核心", "臥鋪", "工坊", "溫室", "貨艙"].map((label, index) => `<span class="${index < milestones ? "is-owned" : "is-locked"}"><i></i>${label}</span>`).join("")}</div>
      <div class="milestone-row"><span>下一里程碑：科技 3</span><b>${run.techOwned.length}/3</b></div>
    </article>
    <div class="hub-grid">
      ${button("tech", "科技樹", { icon: icons.tech, detail: "新規則與藍圖", className: "hub-card is-selected" })}
      ${button("route", "路線選擇", { icon: icons.route, detail: run.routeId === "R02" ? "白霜線・熱力分流" : "灰霧線", className: "hub-card" })}
      ${button("event-preview", "事件圖鑑", { icon: "記", detail: "已發現 3/8", className: "hub-card" })}
      ${button("modules-preview", "起始藍圖", { icon: icons.build, detail: "查看模組，不消耗資源", className: "hub-card" })}
    </div>
    <nav class="bottom-nav">${["中心", "路線", "科技", "圖鑑"].map((label, index) => `<button data-action="${["hub", "route", "tech", "event-preview"][index]}" class="${index === 0 ? "is-selected" : ""}" ${index === 0 ? 'disabled aria-current="page"' : ""}><span>${[icons.hub, icons.route, icons.tech, "記"][index]}</span>${label}</button>`).join("")}</nav>
  </section>`;
}

function environmentPanel(run: RunState): string {
  return `<aside class="status-panel status-panel--environment panel">
    <div><b>${icons.temperature}</b><span>溫度</span><strong>${run.environment.temperature}°C</strong></div>
    <div><b>${icons.noise}</b><span>噪音</span><strong>${run.environment.noise}</strong></div>
    <div><b>${icons.hull}</b><span>車體</span><strong>${run.environment.hull}%</strong></div>
  </aside>`;
}

function survivorPanel(run: RunState): string {
  return `<aside class="status-panel status-panel--survivor panel"><b>A-07</b>
    <div><span>健康</span><strong>${run.survivor.health}</strong></div>
    <div><span>壓力</span><strong>${run.survivor.stress}</strong></div>
    <div><span>感染</span><strong>${String(run.survivor.infection).padStart(2, "0")}</strong></div>
  </aside>`;
}

function cropAsset(cropId: string, stage: number): string {
  return `./assets/art/crops/${cropId}-${Math.min(3, Math.max(0, stage))}.png`;
}

function cropQuickPicker(state: AppState, run: RunState): string {
  const selected = CROPS.find((crop) => crop.id === state.selectedCropId)!;
  return `<aside class="crop-quick-picker panel" aria-label="選擇要播種的作物">
    <span>播種</span>
    ${CROPS.map((crop) => `<button class="${state.selectedCropId === crop.id ? "is-selected" : ""}" data-action="select-crop" data-value="${crop.id}" aria-pressed="${state.selectedCropId === crop.id}" aria-label="選擇${crop.name}"><img src="${cropAsset(crop.id, 3)}" alt=""><small>${crop.name}</small></button>`).join("")}
    <em>${selected.name}<b>水 ${run.resources.water}</b></em>
  </aside>`;
}

function powerPrepPanel(run: RunState): string {
  const rows = run.modules.map((instance) => {
    const definition = MODULES.find((module) => module.id === instance.definitionId);
    if (!definition) return "";
    return `<button class="power-row ${instance.active ? "is-on" : ""}" data-action="toggle-power" data-value="${definition.id}" aria-pressed="${instance.active}"><span><strong>${escapeText(definition.name)}</strong><small>P${definition.priority}・今夜 ${definition.activeCost} E</small></span><b>${instance.active ? "ON" : "OFF"}</b></button>`;
  }).join("");
  return `<div class="prep-control-panel power-config panel"><div class="prep-panel-heading"><h3>今夜配電</h3><strong>${getNightPowerDemand(run)} E</strong></div><p>電量不足時依 P3 → P1 保留高優先設備。</p><div class="power-list">${rows}</div></div>`;
}

function mealPrepPanel(run: RunState): string {
  const plans = [
    { id: "full", name: "安心餐", cost: "食 2・水 2", effect: "睡眠 +8／信任 +3" },
    { id: "standard", name: "標準餐", cost: "食 1・水 1", effect: "維持狀態" },
    { id: "strict", name: "節約餐", cost: "食 0・水 1", effect: "睡眠 −5／壓力 +4" },
  ];
  return `<div class="prep-control-panel meal-config panel"><div class="prep-panel-heading"><h3>今夜配餐</h3><strong>黎明結算</strong></div><div class="ration-grid">${plans.map((plan) => `<button class="${run.rationMode === plan.id ? "is-selected" : ""}" data-action="select-ration" data-value="${plan.id}" aria-pressed="${run.rationMode === plan.id}"><strong>${plan.name}</strong><small>${plan.cost}</small><em>${plan.effect}</em></button>`).join("")}</div></div>`;
}

function decorationLayer(state: AppState, run: RunState, night: boolean): string {
  const activeSlots = DECORATION_SLOTS.filter((slot) => slot.carriageId === state.activeCarriageId);
  const items = DECORATIONS.map((decoration) => {
    const placement = run.decorations.find((item) => item.id === decoration.id);
    if (!placement || placement.carriageId !== state.activeCarriageId) return "";
    const style = `--x:${placement.x}%;--y:${placement.y}%;--decor-size:${decoration.size}px`;
    if (night || !state.decorating) return `<span class="decor-item ${night ? "decor-item--night" : "decor-item--display"}" data-decor-id="${decoration.id}" data-decoration-slot="${placement.slotId}" style="${style}" aria-hidden="true"><img src="${decoration.asset}" alt=""></span>`;
    return `<button class="decor-item ${state.selectedDecorationId === decoration.id ? "is-selected" : ""}" type="button" data-action="select-decoration" data-value="${decoration.id}" data-decor-id="${decoration.id}" data-decoration-slot="${placement.slotId}" style="${style}" aria-label="移動${decoration.name}"><img src="${decoration.asset}" alt="" draggable="false"><span aria-hidden="true">拖</span></button>`;
  }).join("");
  const slots = state.decorating ? activeSlots.map((slot) => {
    const compatible = slot.accepts.includes(state.selectedDecorationId);
    const occupied = run.decorations.find((placement) => placement.slotId === slot.id && placement.id !== state.selectedDecorationId);
    const selectedHere = run.decorations.some((placement) => placement.id === state.selectedDecorationId && placement.slotId === slot.id);
    const classes = ["decor-slot", compatible ? "is-valid" : "is-invalid", occupied ? "is-occupied" : "", selectedHere ? "is-current" : ""].filter(Boolean).join(" ");
    const stateLabel = selectedHere ? "目前位置" : occupied ? `已放${DECORATIONS.find((item) => item.id === occupied.id)?.name ?? "物件"}` : compatible ? "可放" : "不相容";
    return `<button class="${classes}" type="button" data-action="place-decoration" data-value="${state.selectedDecorationId}:${slot.id}" data-slot-id="${slot.id}" data-slot-x="${slot.x}" data-slot-y="${slot.y}" style="--x:${slot.x}%;--y:${slot.y}%" aria-label="${slot.name}，${stateLabel}" ${selectedHere || occupied ? "disabled" : ""}><span>${slot.kind}</span><small>${slot.name}<b>${stateLabel}</b></small></button>`;
  }).join("") : "";
  return `<div class="carriage-decor-layer ${state.decorating ? "is-editing" : ""}" aria-label="可移動車廂小物">
    ${state.decorating ? `<p class="decor-instruction">綠色可放・紅色不相容・放開吸附</p>${slots}` : ""}${items}
  </div>`;
}

function decorationTray(state: AppState, run: RunState): string {
  const active = CARRIAGES.find((carriage) => carriage.id === state.activeCarriageId)!;
  return `<section class="decor-tray prep-control-panel panel" aria-label="車廂佈置工具">
    <div class="prep-panel-heading"><h3>${active.name}佈置</h3><strong>槽位吸附</strong></div>
    <div class="decor-picker">${DECORATIONS.map((decoration) => { const placement = run.decorations.find((item) => item.id === decoration.id); const location = CARRIAGES.find((carriage) => carriage.id === placement?.carriageId)?.short ?? "—"; return `<button class="${state.selectedDecorationId === decoration.id ? "is-selected" : ""}" type="button" data-action="select-decoration" data-value="${decoration.id}" aria-pressed="${state.selectedDecorationId === decoration.id}"><img src="${decoration.asset}" alt=""><span>${decoration.name}</span><small>目前：${location}</small></button>`; }).join("")}</div>
    <div class="decor-tray-actions"><button type="button" data-action="reset-decor">重設位置</button><button class="is-primary" type="button" data-action="finish-decor">完成佈置</button></div>
  </section>`;
}

function carriageSelector(state: AppState): string {
  return `<nav class="carriage-selector panel" aria-label="切換五種車廂">${CARRIAGES.map((carriage) => `<button class="${state.activeCarriageId === carriage.id ? "is-selected" : ""}" data-action="select-carriage" data-value="${carriage.id}" aria-pressed="${state.activeCarriageId === carriage.id}"><span>${carriage.short}</span><small>${carriage.name.replace("車廂", "")}</small></button>`).join("")}</nav>`;
}

function cropSceneLayer(state: AppState, run: RunState): string {
  if (state.activeCarriageId !== "greenhouse" || state.decorating || state.carriagePanel !== "scene") return "";
  const positions = [{ x: 18, y: 47 }, { x: 19, y: 73 }];
  return `<div class="crop-scene-layer" aria-label="可操作水培槽">${run.crops.map((plot, index) => {
    const crop = CROPS.find((item) => item.id === plot.cropId);
    const action = !crop ? "plant-crop" : plot.stage === 3 ? "harvest-crop" : "water-crops";
    const value = !crop ? `${plot.id}:${state.selectedCropId}` : plot.stage === 3 ? plot.id : undefined;
    const label = !crop ? `${plot.id === "plot-a" ? "上層" : "下層"}空槽，播種${CROPS.find((item) => item.id === state.selectedCropId)?.name}` : plot.stage === 3 ? `${crop.name}成熟，點擊收成` : `${crop.name}${plot.wateredDay === run.day ? "已灌溉" : "需要灌溉"}`;
    return `<button class="crop-scene-plot stage-${plot.stage}" data-action="${action}" ${value ? `data-value="${value}"` : ""} style="--x:${positions[index]?.x ?? 18}%;--y:${positions[index]?.y ?? 60}%" aria-label="${label}"><img src="${cropAsset(crop?.id ?? state.selectedCropId, crop ? plot.stage : 0)}" alt=""><span>${plot.stage === 3 ? "收" : !crop ? "種" : plot.wateredDay === run.day ? "✓" : "水"}</span></button>`;
  }).join("")}</div>`;
}

function carriageHotspots(state: AppState, run: RunState): string {
  if (state.decorating || state.carriagePanel !== "scene" || state.activeCarriageId === "greenhouse") return "";
  const hotspot = {
    sleep: `<button data-action="comfort" style="--x:58%;--y:58%" aria-label="安撫 A-07，消耗 1 AP" ${run.flags.includes(`comforted-${run.day}`) || run.actionPoints < 1 ? "disabled" : ""}><b>撫</b><span>${run.flags.includes(`comforted-${run.day}`) ? "已安撫" : "安撫"}</span><small>1 AP</small></button>`,
    defense: `<button data-action="toggle-module" data-value="M001" style="--x:82%;--y:36%" aria-label="切換防護百葉"><b>百</b><span>百葉</span><small>ON / OFF</small></button><button data-action="repair-hull" style="--x:19%;--y:56%" aria-label="維修車體，消耗 2 AP 與 2 零件" ${run.environment.hull >= 100 || run.actionPoints < 2 || run.resources.parts < 2 ? "disabled" : ""}><b>修</b><span>${run.environment.hull >= 100 ? "車體完整" : "維修"}</span><small>${run.environment.hull >= 100 ? "無需維修" : "2 AP・零 2"}</small></button>`,
    workshop: `<button data-action="workshop-scrap" style="--x:20%;--y:62%" aria-label="整理回收零件，消耗 1 AP" ${run.flags.includes(`workshop-scrap-${run.day}`) || run.actionPoints < 1 ? "disabled" : ""}><b>整</b><span>${run.flags.includes(`workshop-scrap-${run.day}`) ? "已整理" : "回收"}</span><small>1 AP</small></button>`,
    kitchen: `<button data-action="cook-meal" style="--x:20%;--y:62%" aria-label="烹煮熱食，消耗 1 AP、食物 1、飲水 1、電量 2" ${run.flags.includes(`hot-meal-${run.day}`) || run.actionPoints < 1 || run.resources.food < 1 || run.resources.water < 1 || run.resources.energy < 2 ? "disabled" : ""}><b>煮</b><span>${run.flags.includes(`hot-meal-${run.day}`) ? "已烹飪" : "熱食"}</span><small>1 AP・食水電</small></button>`,
  }[state.activeCarriageId];
  return `<div class="scene-hotspots" aria-label="${CARRIAGES.find((carriage) => carriage.id === state.activeCarriageId)?.name}設備熱區">${hotspot}</div>`;
}

function actionFeedback(state: AppState): string {
  if (state.actionFeedback.length === 0) return "";
  return `<span class="feedback-chips" aria-label="本次數值變化">${state.actionFeedback.map((entry) => `<b class="feedback-chip is-${entry.tone}">${escapeText(entry.label)} ${formatSigned(entry.delta)}</b>`).join("")}</span>`;
}

function thermalCost(whiteFrost: WhiteFrostState): { energy: number; fuel: number; water: number } {
  const loopTokens = whiteFrost.thermal.tokens.filter((token) => token.zone === "LOOP").length;
  const effectiveLoop = loopTokens + (whiteFrost.branch === "SUSTAIN" ? 1 : 0);
  return {
    energy: 2 + (whiteFrost.branch === "SUSTAIN" ? 2 : 0) + (effectiveLoop >= 3 ? 1 : 0),
    fuel: 1 + (whiteFrost.branch === "CARE" ? 1 : 0),
    water: effectiveLoop === 0 ? 2 : effectiveLoop === 1 ? 1 : 0,
  };
}

function thermalTokenButton(tokenId: HeatTokenId, selected: boolean): string {
  return `<button class="heat-token ${selected ? "is-selected" : ""}" type="button" data-action="thermal-select" data-value="${tokenId}" data-heat-token="${tokenId}" aria-pressed="${selected}" aria-label="熱能單元 ${tokenId}；${selected ? "已選取，可拖曳或點區域移動" : "點選後再點目標區，或直接拖曳"}">
    <span aria-hidden="true">◈</span><strong>${tokenId}</strong>
  </button>`;
}

function thermalZones(
  whiteFrost: WhiteFrostState,
  options: { inspectedZones?: FrostZone[]; revealedZones?: FrostZone[]; inspectable?: boolean } = {},
): string {
  const selectedTokenId = whiteFrost.thermal.selectedTokenId;
  const inspected = new Set(options.inspectedZones ?? []);
  const revealed = new Set(options.revealedZones ?? []);
  return (Object.keys(FROST_ZONE_PRESENTATION) as FrostZone[]).map((zone) => {
    const presentation = FROST_ZONE_PRESENTATION[zone];
    const tokens = whiteFrost.thermal.tokens.filter((token) => token.zone === zone);
    const isInspected = inspected.has(zone);
    const isRevealed = revealed.has(zone);
    return `<section class="thermal-zone ${isInspected ? "is-inspected" : ""} ${isRevealed ? "is-required" : ""}" data-thermal-zone="${zone}" data-zone="${zone}" aria-label="${presentation.label}，目前 ${tokens.length} 枚熱能">
      <header><span aria-hidden="true">${presentation.icon}</span><div><strong>${presentation.short}</strong><small>${presentation.effect}</small></div><b>${tokens.length}</b></header>
      <div class="heat-token-rack" aria-label="${presentation.label}熱能單元">${tokens.map((token) => thermalTokenButton(token.id, selectedTokenId === token.id)).join("") || `<span class="thermal-empty">0</span>`}</div>
      <div class="thermal-zone-actions">
        ${options.inspectable ? `<button class="thermal-zone-action frost-inspect-action ${isInspected ? "is-inspected" : ""}" type="button" data-action="threat-interact" data-value="frost:inspect:${zone}"><span>${isInspected ? "✓" : "⌕"}</span><strong>${isInspected ? "已檢查" : "檢查霜區"}</strong>${isRevealed ? "<small>必要區・嚴重 2</small>" : "<small>讀取結霜紋路</small>"}</button>` : ""}
        <button class="thermal-zone-action" type="button" data-action="thermal-target" data-value="${zone}"><span>→</span><strong>${selectedTokenId ? `移入 ${selectedTokenId}` : "移至此區"}</strong><small>${selectedTokenId ? "點一下完成配置" : "先選熱能單元"}</small></button>
      </div>
    </section>`;
  }).join("");
}

function thermalBoard(run: RunState, mode: "drawer" | "threat" = "drawer"): string {
  const whiteFrost = run.story.whiteFrost;
  if (!whiteFrost) return "";
  const cost = thermalCost(whiteFrost);
  const settledToday = whiteFrost.thermal.committedDay === run.day;
  const insufficient = run.resources.energy < cost.energy || run.resources.fuel < cost.fuel || run.resources.water < cost.water;
  const branchLabel = whiteFrost.branch ? FROST_BRANCH_LABELS[whiteFrost.branch] : "尚未鎖定 Day 4 分支";
  return `<section class="thermal-board ${mode === "threat" ? "thermal-board--threat" : "prep-control-panel panel"}" data-testid="thermal-board" data-thermal-revision="${whiteFrost.thermal.revision}" aria-labelledby="thermal-board-title">
    <header class="thermal-board__header">
      <span><small>R02・熱力分流</small><strong id="thermal-board-title">六枚熱能單元</strong></span>
      <b>電 ${run.resources.energy}・燃 ${run.resources.fuel}・水 ${run.resources.water}</b>
      ${mode === "drawer" ? `<button type="button" data-action="power" aria-label="收起熱力分流板">×</button>` : ""}
    </header>
    <p class="thermal-board__instruction">拖動 H1–H6 到區域；或先點單元，再點「移至此區」。</p>
    <div class="thermal-zone-grid">${thermalZones(whiteFrost)}</div>
    <p class="thermal-branch-cue"><b>${escapeText(branchLabel)}</b><span>成本：電 ${cost.energy}・燃 ${cost.fuel}${cost.water ? `・水 ${cost.water}` : ""}</span></p>
    <div class="thermal-board__actions">
      <button type="button" data-action="thermal-reset"><span>↶</span><strong>還原配置</strong><small>回到上次提交</small></button>
      <button class="is-primary" type="button" data-action="thermal-commit" ${settledToday || insufficient ? "disabled" : ""}><span>✓</span><strong>${settledToday ? "今日已提交" : insufficient ? "資源不足" : "提交熱力"}</strong><small>${settledToday ? `Day ${run.day} 已結算` : `電 ${cost.energy}・燃 ${cost.fuel}${cost.water ? `・水 ${cost.water}` : ""}`}</small></button>
    </div>
  </section>`;
}

const SIGNAL_COLOR_LABELS = {
  amber: "琥珀",
  cyan: "青藍",
  red: "警戒紅",
} as const;

const SIGNAL_SHAPE_LABELS = {
  diamond: "菱形",
  circle: "圓環",
  triangle: "三角",
} as const;

const SIGNAL_RHYTHM_LABELS: Record<ThreatSignalRhythm, string> = {
  "short-short-long": "短・短・長",
  "long-short-short": "長・短・短",
  "short-long-short": "短・長・短",
};

function rhythmBars(rhythm: ThreatSignalRhythm): string {
  return rhythm.split("-").map((beat) => `<i class="is-${beat}" aria-hidden="true"></i>`).join("");
}

function signalCard(signal: ThreatSignal, index: number, revealedClues: Set<string>, lastAttemptSignalId?: string): string {
  const colorVisible = revealedClues.has("color");
  const shapeVisible = revealedClues.has("shape");
  const rhythmVisible = revealedClues.has("rhythm");
  const revealClass = revealedClues.size === 0 ? "is-obscured" : "has-clues";
  const clueLabels = [
    colorVisible ? `色 ${SIGNAL_COLOR_LABELS[signal.color]}` : "色 未解析",
    shapeVisible ? `形 ${SIGNAL_SHAPE_LABELS[signal.shape]}` : "形 未解析",
    rhythmVisible ? `拍 ${SIGNAL_RHYTHM_LABELS[signal.rhythm]}` : "拍 未解析",
  ];
  return `<button class="echo-signal-card ${lastAttemptSignalId === signal.id ? "was-wrong" : ""} ${revealClass}" type="button" data-action="threat-interact" data-value="signal:${signal.id}" aria-label="選擇訊號 ${index + 1}；${clueLabels.join("，")}">
    <span class="echo-signal-card__number">訊號 ${String(index + 1).padStart(2, "0")}</span>
    <span class="echo-signal-card__scope is-${signal.color}" aria-hidden="true"><i class="signal-shape is-${signal.shape}"></i></span>
    <span class="signal-rhythm" aria-label="節拍 ${SIGNAL_RHYTHM_LABELS[signal.rhythm]}">${rhythmBars(signal.rhythm)}</span>
    <span class="signal-traits">${clueLabels.map((label) => `<small>${escapeText(label)}</small>`).join("")}</span>
    ${lastAttemptSignalId === signal.id ? `<b class="signal-miss">上次誤判</b>` : ""}
  </button>`;
}

function t004InteractionPanel(contact: ThreatContact): string {
  const interaction = contact.interaction?.kind === "T004" ? contact.interaction : undefined;
  const targetRevealed = interaction?.targetRevealed ?? false;
  const attempts = interaction?.attempts ?? 0;
  const targetPlotId = interaction?.targetPlotId;
  const plots = (["plot-a", "plot-b"] as const).map((plotId, index) => {
    const isRevealedTarget = targetRevealed && targetPlotId === plotId;
    const wasAttempted = interaction?.lastAttemptPlotId === plotId;
    return `<button class="vine-plot ${isRevealedTarget ? "is-root-target" : ""} ${wasAttempted ? "was-attempted" : ""}" type="button" data-action="threat-interact" data-value="cutter:${plotId}" data-threat-target="${plotId}" data-requires-tool="cutter" aria-label="${index === 0 ? "左側" : "右側"}種植槽${isRevealedTarget ? "，已確認根節" : "，藤蔓纏繞"}">
      <span class="vine-plot__bed"><i></i><i></i><i></i><b class="vine-root" aria-hidden="true">◆</b></span>
      <strong>${index === 0 ? "槽 A" : "槽 B"}</strong>
      <small>${isRevealedTarget ? "根節已顯影・拖入割具" : wasAttempted ? "切割無效・路徑已顯示" : "受感染・等待切割"}</small>
    </button>`;
  }).join("");
  return `<section class="threat-interaction-panel threat-interaction--vine panel" data-testid="threat-interaction" data-threat-id="T004" data-threat-interaction="T004" data-contact-id="${escapeText(contact.id)}" aria-labelledby="threat-operation-title">
    <header class="threat-operation-header">
      <span><small>霧藤根節處置</small><strong id="threat-operation-title">保住兩個種植槽</strong></span>
      <b class="threat-attempts">嘗試 ${attempts}</b>
    </header>
    <p class="threat-operation-instruction">拖曳割具到槽位；或先點割具，再點目標槽。</p>
    <div class="vine-operation">
      <button class="vine-cutter" type="button" data-action="arm-threat-tool" data-threat-tool="cutter" aria-pressed="false" aria-label="割具；可拖曳，或點一下拿起">
        <span aria-hidden="true">✂</span><strong>割具</strong><small>拖曳／點選</small>
      </button>
      <div class="vine-plots" aria-label="感染種植槽">${plots}</div>
    </div>
    <p class="threat-tool-status" role="status">${targetRevealed ? "錯誤路徑已標記；發光根節就是切割目標。" : "兩槽都被霧藤覆蓋，先用割具確認根節。"}</p>
  </section>`;
}

function t005InteractionPanel(contact: ThreatContact): string {
  const interaction = contact.interaction?.kind === "T005" ? contact.interaction : undefined;
  const fallbackSignals: ThreatSignal[] = [
    { id: "sig-a", color: "amber", shape: "diamond", rhythm: "short-short-long" },
    { id: "sig-b", color: "cyan", shape: "circle", rhythm: "short-long-short" },
  ];
  const signals = interaction?.signals?.length === 2 ? interaction.signals : fallbackSignals;
  const attempts = interaction?.attempts ?? 0;
  const wrongAttempts = interaction?.wrongAttempts ?? 0;
  const revealedClues = new Set(interaction?.revealedClues ?? []);
  const resultLine = wrongAttempts === 0
    ? "兩個求救訊號近乎相同；選出與原始呼叫吻合的一張。"
    : wrongAttempts === 1
      ? "首次誤判未扣健康；色、形、節拍線索已全部展開。"
      : interaction?.secondMissPenaltyApplied
        ? "第二次誤判：健康 −2。"
        : "再次核對已揭露線索。";
  return `<section class="threat-interaction-panel threat-interaction--echo panel" data-testid="threat-interaction" data-threat-id="T005" data-threat-interaction="T005" data-contact-id="${escapeText(contact.id)}" aria-labelledby="threat-operation-title">
    <header class="threat-operation-header">
      <span><small>回聲比對台</small><strong id="threat-operation-title">辨認真正的求救訊號</strong></span>
      <b class="threat-attempts">辨識 ${attempts}/2</b>
    </header>
    <p class="threat-operation-instruction">比較色光、輪廓與三拍脈衝，再點選訊號卡。</p>
    <div class="echo-signal-grid">${signals.map((signal, index) => signalCard(signal, index, revealedClues, interaction?.lastAttemptSignalId)).join("")}</div>
    <p class="echo-result ${wrongAttempts > 0 ? "has-warning" : ""}" role="status">${resultLine}</p>
  </section>`;
}

function t006InteractionPanel(contact: ThreatContact): string {
  const interaction = contact.interaction?.kind === "T006" ? contact.interaction : undefined;
  const mode = interaction?.mode ?? "leaf";
  const targetPlotId = interaction?.targetPlotId ?? "plot-a";
  const attempts = interaction?.attempts ?? 0;
  const rootSide = targetPlotId === "plot-b" ? "right" : "left";
  const leafZones = (["plot-a", "plot-b"] as const).map((plotId, index) => {
    const active = mode === "leaf" && plotId === targetPlotId;
    return `<span class="leaf-observation-zone ${active ? "is-trembling" : "is-still"}" aria-label="${index === 0 ? "左側" : "右側"}葉片${active ? "持續晃動" : "靜止"}">
      <i class="leaf leaf-a" aria-hidden="true">◆</i><i class="leaf leaf-b" aria-hidden="true">◆</i>
      <b>${index === 0 ? "左葉區" : "右葉區"}</b><small>${active ? "晃動 ▲" : "靜止 ━"}</small>
    </span>`;
  }).join("");
  const meterAngle = mode === "meter" ? (rootSide === "left" ? "-38deg" : "38deg") : "0deg";
  return `<section class="threat-interaction-panel threat-interaction--silent panel" data-testid="threat-interaction" data-threat-id="T006" data-threat-interaction="T006" data-contact-id="${escapeText(contact.id)}" data-sensor-mode="${mode}" aria-labelledby="threat-operation-title">
    <header class="threat-operation-header">
      <span><small>靜默根源感測</small><strong id="threat-operation-title">用無聲線索判位</strong></span>
      <b class="threat-attempts">判讀 ${attempts}</b>
    </header>
    <p class="threat-operation-instruction">沒有敲窗聲。觀察葉片晃動或錶針偏轉，選一種線索追蹤。</p>
    <div class="silent-sensor-grid">
      <button class="silent-sensor-card leaf-sensor" type="button" data-action="threat-interact" data-value="trace:leaves" aria-label="循葉片晃動追蹤根源">
        <span class="leaf-observation-grid">${leafZones}</span>
        <strong>循葉片找根源</strong><small>${mode === "leaf" ? `${rootSide === "left" ? "左" : "右"}側晃動較強` : "葉片訊號微弱"}</small>
      </button>
      <button class="silent-sensor-card meter-sensor" type="button" data-action="threat-interact" data-value="trace:meter" aria-label="用根部電表偏轉追蹤根源">
        <span class="root-meter" style="--meter-angle:${meterAngle}" aria-hidden="true"><i class="meter-tick tick-left"></i><i class="meter-tick tick-right"></i><b></b><em>V</em></span>
        <strong>讀取根部電表</strong><small>${mode === "meter" ? `錶針向${rootSide === "left" ? "左" : "右"}偏轉` : "電表維持中線"}</small>
      </button>
    </div>
    <p class="silent-static-cue" role="status"><span aria-hidden="true">${mode === "leaf" ? "葉" : "錶"}</span>${mode === "leaf" ? `${rootSide === "left" ? "左" : "右"}葉區 ▲` : `錶針 ${rootSide === "left" ? "←" : "→"}`}・減少動態時以此符號判讀</p>
  </section>`;
}

function t009InteractionPanel(run: RunState, contact: ThreatContact): string {
  const interaction = contact.interaction?.kind === "T009" ? contact.interaction : undefined;
  const whiteFrost = run.story.whiteFrost;
  if (!interaction || !whiteFrost) return "";
  const revealedZones = interaction.firstMissRevealed ? interaction.requiredZones : [];
  const inspectedLabels = interaction.inspectedZones.map((zone) => FROST_ZONE_PRESENTATION[zone].short);
  const result = interaction.firstMissRevealed
    ? `必要霜區：${interaction.requiredZones.map((zone) => `${FROST_ZONE_PRESENTATION[zone].short} 2+`).join("・")}。先重配熱能，再確認。`
    : interaction.inspectedZones.length > 0
      ? `已檢查：${inspectedLabels.join("、")}。可繼續檢查或直接確認。`
      : "先檢查至少一個霜區；第一次錯配只揭露線索，不扣資源。";
  return `<section class="threat-interaction-panel threat-interaction--frost panel" data-testid="threat-interaction" data-threat-id="T009" data-threat-interaction="T009" data-contact-id="${escapeText(contact.id)}" aria-labelledby="threat-operation-title">
    <header class="threat-operation-header">
      <span><small>暴風雪・熱路檢修</small><strong id="threat-operation-title">找出兩個活動霜區</strong></span>
      <b class="threat-attempts">確認 ${interaction.attempts}</b>
    </header>
    <p class="threat-operation-instruction">檢查霜紋，再把六枚熱能重配到必要區；支援拖曳與點選。</p>
    <div class="thermal-zone-grid thermal-zone-grid--threat">${thermalZones(whiteFrost, {
      inspectedZones: interaction.inspectedZones,
      revealedZones,
      inspectable: true,
    })}</div>
    <p class="frost-static-cue ${interaction.firstMissRevealed ? "has-reveal" : ""}" role="status"><span aria-hidden="true">❄</span>${escapeText(result)}</p>
    <div class="frost-confirm-actions">
      <button class="is-primary" type="button" data-action="threat-interact" data-value="frost:confirm"><span>✓</span><strong>確認熱路</strong><small>必要區各至少 2 枚</small></button>
      <button class="is-danger" type="button" data-action="threat-interact" data-value="frost:manual-scrape" ${interaction.manualFallbackAvailable ? "" : "disabled"}><span>刮</span><strong>人工刮冰</strong><small>${interaction.manualFallbackAvailable ? `車體 −${whiteFrost.manualScrapeHullCost}・壓力 +6` : "首次錯配後開放"}</small></button>
    </div>
  </section>`;
}

function threatInteractionPanel(run: RunState, contact: ThreatContact): string {
  if (contact.definitionId === "T004") return t004InteractionPanel(contact);
  if (contact.definitionId === "T005") return t005InteractionPanel(contact);
  if (contact.definitionId === "T006") return t006InteractionPanel(contact);
  if (contact.definitionId === "T009") return t009InteractionPanel(run, contact);
  return "";
}

function frostBranchOverlay(run: RunState, activeCarriageId: CarriageId): string {
  const whiteFrost = run.story.whiteFrost;
  if (!whiteFrost) return "";
  const branchCarriage: Partial<Record<FrostBranch, CarriageId>> = {
    CARE: "sleep",
    CLEAR: "defense",
    SUSTAIN: "greenhouse",
  };
  const activeBranch = whiteFrost.branch && branchCarriage[whiteFrost.branch] === activeCarriageId
    ? whiteFrost.branch
    : undefined;
  const label = activeBranch ? FROST_BRANCH_LABELS[activeBranch] : "白霜線・熱路監測";
  const detail = activeBranch === "CARE"
    ? "床側暖帶已接入 BERTH"
    : activeBranch === "CLEAR"
      ? "轉轍除冰台已接入 DEICER"
      : activeBranch === "SUSTAIN"
        ? "水培保溫環已接入 LOOP"
        : "點「熱力」調整 H1–H6";
  return `<div class="frost-route-overlay ${activeBranch ? `is-${activeBranch.toLowerCase()}` : ""}" data-frost-branch="${activeBranch ?? "UNSET"}" aria-label="${escapeText(label)}">
    <span class="frost-route-overlay__equipment" aria-hidden="true">${activeBranch === "CARE" ? "暖" : activeBranch === "CLEAR" ? "軌" : activeBranch === "SUSTAIN" ? "環" : "霜"}</span>
    <p><strong>${escapeText(label)}</strong><small>${escapeText(detail)}</small></p>
  </div>`;
}

function carriageScreen(state: AppState): string {
  const run = state.run;
  if (!run) return "";
  const night = run.phase === "night";
  const threat = THREATS.find((candidate) => candidate.id === run.activeContact?.definitionId);
  const contact = run.activeContact;
  const frostRoute = run.routeId === "R02" && Boolean(run.story.whiteFrost);
  const prepPanel = state.carriagePanel === "power"
    ? frostRoute ? thermalBoard(run) : powerPrepPanel(run)
    : state.carriagePanel === "meal"
      ? mealPrepPanel(run)
      : state.activeCarriageId === "greenhouse" ? cropQuickPicker(state, run) : "";
  const activeCarriage = CARRIAGES.find((carriage) => carriage.id === state.activeCarriageId)!;
  const counterActions = {
    T003: [
      { id: "emergency-boost", icon: icons.boost, label: "緊急加速", cost: "F 4" },
      { id: "decoy", icon: "◎", label: "誘餌廣播", cost: "E 6" },
      { id: "brace-impact", icon: "▰", label: "承受撞擊", cost: "車體受損・強制推進" },
    ],
    T004: [
      { id: "drag-cutter", icon: "剪", label: "拖動割具斷藤", cost: "點按割除根節" },
      { id: "close-door", icon: "門", label: "關閉貨艙門", cost: "無法清除根節" },
      { id: "feed-power", icon: icons.power, label: "水培槽增壓", cost: "可能加速蔓延" },
    ],
    T005: [
      { id: "match-echo", icon: "≋", label: "比對色形節拍", cost: "選出相同回聲" },
      { id: "invert-signal", icon: "⇄", label: "反轉訊號", cost: "可能誤判" },
      { id: "open-hatch", icon: "門", label: "打開觀測窗", cost: "可能誤判" },
    ],
    T006: [
      { id: "trace-leaves", icon: "葉", label: "循落葉找根源", cost: "沿溫室痕跡定位" },
      { id: "trace-meter", icon: "錶", label: "讀取根部電表", cost: "以耗電異常定位" },
      { id: "flood-light", icon: "光", label: "開啟探照燈", cost: "群體不受光線影響" },
    ],
  }[threat?.id ?? ""] ?? [
    { id: "close-shutter", icon: icons.shield, label: "關閉百葉", cost: "E 8" },
    { id: "shock-window", icon: icons.shock, label: "窗框電擊", cost: "E 12" },
    { id: "brace-impact", icon: "▰", label: "承受撞擊", cost: "車體受損・強制推進" },
  ];
  const visibleThreatInteraction = night && contact ? threatInteractionPanel(run, contact) : "";
  const drawerOpen = !night && (state.decorating || state.carriagePanel !== "scene");
  return `<section class="screen screen--carriage ${night ? "is-night" : "is-prep"} ${drawerOpen ? "has-drawer" : "is-observation-mode"} contact-stage-${contact?.stage ?? "idle"}" data-screen="SCR-CV-${night ? "B" : "A"}" data-carriage="${state.activeCarriageId}" data-panel="${state.decorating ? "decor" : state.carriagePanel}" data-threat-id="${threat?.id ?? ""}">
    ${compactHeader(run, night ? `夜間守望・${activeCarriage.name}` : activeCarriage.name, night ? `${frostRoute ? "白霜線" : "灰霧線"}・22:${String(34 + run.day * 2).padStart(2, "0")}・耗電 ${run.nightPowerDemand} E` : `${frostRoute ? "白霜線" : activeCarriage.role}・剩餘 ${run.actionPoints} AP`)}
    ${night ? `<button class="speed-control" type="button" data-action="pause" ${state.settings.noCountdown ? "disabled" : ""} aria-label="${state.settings.noCountdown ? "設定已停用守夜倒數" : state.nightPaused ? "繼續守夜倒數" : "暫停守夜倒數"}"><span aria-hidden="true">${state.settings.noCountdown ? "∞" : state.nightPaused ? icons.play : "Ⅱ"}</span><small>${state.settings.noCountdown ? "無倒數" : state.nightPaused ? "繼續" : "暫停"}</small></button>` : `<div class="prep-ap-dial" style="--ap:${Math.min(1, run.actionPoints / 5)}turn" aria-label="整備階段，剩餘 ${run.actionPoints} 行動點"><strong>${run.actionPoints}</strong><span>AP</span><small>整備</small></div>`}
    ${environmentPanel(run)}${survivorPanel(run)}${!night ? carriageSelector(state) : ""}
    ${!night && !run.flags.includes("carriage-nav-seen") ? `<p class="carriage-swipe-hint" aria-hidden="true"><b>←</b> 滑動車廂 <b>→</b></p>` : ""}
    ${decorationLayer(state, run, night)}
    ${frostRoute ? frostBranchOverlay(run, state.activeCarriageId) : ""}
    ${!night ? cropSceneLayer(state, run) : ""}
    ${night && threat && contact ? `<div class="threat-alert" role="alert"><strong>接觸 ${contact.wave ?? 1}/${contact.totalWaves ?? 1}・${threat.anchor === "right-window" ? "右側窗戶" : "車頂"}・${threat.name}</strong><span>${contact.stage === "resolve" ? "已解除" : state.nightPaused || state.settings.noCountdown ? `倒數暫停・${String(contact.secondsLeft).padStart(2, "0")}` : `接觸倒數 ${String(contact.secondsLeft).padStart(2, "0")} 秒`}</span></div>` : ""}
    ${!night ? carriageHotspots(state, run) : ""}
    ${night ? `<div class="emergency-power panel"><h3>緊急配電</h3>${[["防護板", "M001"], ["暖氣", "M002"], ["溫室", "M003"], ["感測器", "M004"]].map(([label, moduleId]) => { const module = run.modules.find((instance) => instance.definitionId === moduleId); const on = Boolean(module?.active && module.powered); return `<div><span>${label}</span><b class="${on ? "is-on" : ""}">${module ? on ? "ON" : "OFF" : "—"}</b></div>`; }).join("")}</div>` : ""}
    ${night ? visibleThreatInteraction || `<div class="emergency-actions panel"><h3>可用緊急操作</h3><div>${counterActions.map((action) => { const readiness = counterReadiness(run, action.id); return `<button data-action="counter" data-value="${action.id}" ${readiness.available ? "" : "disabled"}><b>${action.icon}</b><span>${action.label}</span><small>${readiness.available ? action.cost : readiness.reason}</small></button>`; }).join("")}</div></div>` : `${state.decorating ? decorationTray(state, run) : prepPanel}
    <nav class="carriage-dock panel">
      <button data-action="modules"><span>${icons.build}</span><b>建造</b></button><button class="${state.carriagePanel === "power" && !state.decorating ? "is-selected" : ""}" data-action="power" aria-expanded="${state.carriagePanel === "power" && !state.decorating}"><span>${frostRoute ? "◈" : icons.power}</span><b>${frostRoute ? "熱力" : "配電"}</b></button><button class="${state.carriagePanel === "meal" && !state.decorating ? "is-selected" : ""}" data-action="meal" aria-expanded="${state.carriagePanel === "meal" && !state.decorating}"><span>${icons.meal}</span><b>配餐</b></button><button class="${state.decorating ? "is-selected" : ""}" data-action="decorate" aria-expanded="${state.decorating}"><span>◇</span><b>佈置</b></button><button class="is-primary" data-action="route"><span>${icons.route}</span><b>出發</b><small>${run.actionPoints} AP</small></button>
    </nav>`}
    <div class="toast-message" role="status"><span class="toast-copy">${escapeText(run.lastMessage)}</span>${actionFeedback(state)}</div>
  </section>`;
}

function routeScreen(state: AppState): string {
  const run = state.run;
  if (!run) return "";
  const selected = ROUTE_NODES.find((node) => node.id === state.selectedRouteId) ?? ROUTE_NODES[0];
  const frostPenalty = run.routeId === "R02" ? run.story.whiteFrost?.pendingRouteFuelPenalty ?? 0 : 0;
  const selectedFuelCost = (selected?.fuelCost ?? 0) + frostPenalty;
  const cheapestFuelCost = Math.min(...ROUTE_NODES.map((node) => node.fuelCost + frostPenalty));
  const emergencyAvailable = !state.routePreview && run.resources.fuel < cheapestFuelCost;
  return `<section class="screen screen--route ${emergencyAvailable ? "has-emergency-route" : ""}" data-screen="SCR-RM-${run.techOwned.includes("I1") ? "B" : "A"}">
    ${compactHeader(run, state.routePreview ? "路線圖鑑" : "路線規劃", state.routePreview ? `局外預覽・${run.routeId === "R02" ? "白霜線" : "灰霧線"}` : `${run.routeId === "R02" ? "白霜線・凍結區段" : "灰霧線・第 1 區段"}`, state.routePreview ? "hub" : "carriage")}
    <div class="route-map panel">
      <svg viewBox="0 0 336 400" role="img" aria-label="路線節點圖"><path d="M42 320 C90 270 98 220 156 198 S252 156 292 70"/><path d="M42 320 C130 340 228 326 292 270"/><path d="M156 198 C200 206 232 240 292 270"/></svg>
      ${ROUTE_NODES.map((node, index) => `<button class="route-node route-node--${node.kind} ${state.selectedRouteId === node.id ? "is-selected" : ""}" style="--x:${[12, 46, 83][index]}%;--y:${[78, 47, 18][index]}%" data-action="select-route" data-value="${node.id}"><span>${node.kind === "danger" ? "!" : node.kind === "supply" ? "+" : "◇"}</span><small>${node.name}</small></button>`).join("")}
      <div class="route-legend"><span>◆ 補給</span><span>◇ 故事</span><span>! 危險</span></div>
    </div>
    ${selected ? `<article class="route-summary panel"><div><strong>${selected.name}</strong><span>威脅 ${"◆".repeat(selected.threatLevel)}${"◇".repeat(3 - selected.threatLevel)}・${selected.threatLevel} 波</span></div><p>距離 ${selected.distance} km　｜　燃料 −${selectedFuelCost}${frostPenalty > 0 ? `（積冰 +${frostPenalty}）` : ""}</p><p>可能取得：${selected.reward}</p>${button("confirm-route", state.routePreview ? "局外預覽" : run.resources.fuel < selectedFuelCost ? "燃料不足" : "確認路線", { value: selected.id, primary: !state.routePreview && run.resources.fuel >= selectedFuelCost, icon: icons.route, detail: state.routePreview ? "回到遊戲整備後才能出發" : undefined, disabled: state.routePreview || run.resources.fuel < selectedFuelCost })}</article>` : ""}
    ${emergencyAvailable ? `<article class="route-emergency panel" role="alert"><div><strong>所有常規路線都缺燃料</strong><p>可用車體與保暖代價滑向最近月台，避免卡死在路線圖。</p></div>${button("emergency-route", "啟動慣性滑行", { primary: true, icon: "↘", detail: "車體 −6・溫度 −3・睡眠 −8・壓力 +8" })}</article>` : ""}
  </section>`;
}

function eventScreen(state: AppState, event: GameEvent | undefined): string {
  const run = state.run;
  if (!run || !event) return "";
  const presentation = event as GameEvent & StoryEventPresentation;
  const forced = Boolean(presentation.forced ?? presentation.forceResolution);
  const finalChoice = event.id === "EV051" || event.id === "EV065";
  const day4Branch = event.id === "EV044" || event.id === "EV057";
  const backAction = state.eventPreview ? "hub" : forced ? undefined : "route";
  const screenClasses = ["screen", "screen--event", event.urgent ? "is-urgent" : "", forced ? "is-forced-story" : "", finalChoice ? "is-final-choice" : "", day4Branch ? "is-day4-branch" : ""].filter(Boolean).join(" ");
  return `<section class="${screenClasses}" data-screen="SCR-EV-${event.urgent ? "B" : "A"}" data-event-id="${escapeText(event.id)}" data-forced="${forced}">
    ${compactHeader(run, state.eventPreview ? "事件圖鑑" : `第 ${run.day} 日・${event.phase === "night" ? "夜間" : "行車"}`, state.eventPreview ? `${event.id}・已發現事件` : forced ? `${event.id}・必須決定` : event.id, backAction)}
    <article class="event-card panel">
      <div class="event-art event-art--${event.artKey.replace("event.", "")}" role="img" aria-label="${escapeText(event.title)}事件插圖"><span></span></div>
      ${event.urgent ? `<div class="event-urgency" role="status"><span>緊急事件</span><strong>警戒</strong></div>` : ""}
      ${forced && !state.eventPreview ? `<div class="forced-story-notice" role="status"><b>路線鎖定</b><span>完成這項決定後才能繼續行車</span></div>` : ""}
      <p class="event-id">${event.id}・${event.phase === "night" ? "夜間" : "行車"}</p>
      <h2>${escapeText(event.title)}</h2><p>${escapeText(event.body)}</p>
      ${finalChoice ? `<p class="final-choice-guide"><b>${event.id === "EV065" ? "白霜終局" : "終局操作"}</b>四個決定只會確認一次；未達條件的選項仍列出原因。</p>` : ""}
      ${finalChoice || day4Branch ? `<p class="choice-scroll-cue" role="note">↓ 向下滑動查看全部 ${event.choices.length} 個選項</p>` : ""}
      <div class="event-choices" aria-label="${finalChoice ? "四項終局決定" : day4Branch ? event.id === "EV057" ? "三項白霜熱路分支" : "三項永久路線分支" : "事件選項"}">${event.choices.map((choice) => storyChoiceCard(run, event, choice, state.eventPreview)).join("")}</div>
      <small class="hold-hint">${state.eventPreview ? "圖鑑模式不會推進時間或消耗資源" : forced ? "這是必要故事節點；確認前請核對直接成本與永久後果" : "長按可查看科技修正；選擇後立即結算"}</small>
    </article>
  </section>`;
}

function modulesScreen(state: AppState): string {
  const run = state.run;
  if (!run) return "";
  const moduleCategory = (id: string): "防禦" | "生產" | "生活" => ["M001", "M004", "M006", "M011", "M012"].includes(id) ? "防禦" : ["M003", "M010"].includes(id) ? "生產" : "生活";
  const visibleModules = state.moduleCategory === "全部" ? MODULES : MODULES.filter((module) => moduleCategory(module.id) === state.moduleCategory);
  const selected = visibleModules.find((module) => module.id === state.selectedModuleId) ?? visibleModules[0];
  return `<section class="screen screen--modules" data-screen="SCR-MD-A">
    ${compactHeader(run, state.modulePreview ? "列車起始藍圖" : "建造與模組", state.modulePreview ? "局外預覽・不會消耗資源" : `整備・${run.actionPoints} AP・${run.resources.parts} 零件`, state.modulePreview ? "hub" : "carriage")}
    <div class="bottom-sheet panel"><span class="drag-handle"></span><div class="category-tabs">${["全部", "防禦", "生產", "生活"].map((category) => `<button class="${state.moduleCategory === category ? "is-selected" : ""}" data-action="select-module-category" data-value="${category}">${category}</button>`).join("")}</div>
      <div class="module-grid">${visibleModules.map((module) => `<button class="module-card ${module.id === selected?.id ? "is-selected" : ""}" data-action="select-module" data-value="${module.id}"><span>${module.slot === "window" ? icons.shield : module.slot === "floor" ? "暖" : module.slot === "wall" ? "芽" : "器"}</span><strong>${module.name}</strong><small>${module.slot}・零件 ${module.cost}</small></button>`).join("")}</div>
      ${selected ? `<article class="selected-module"><div><strong>${selected.name}</strong><small>${selected.description}</small></div><p>耗電 ${selected.activeCost}　｜　優先級 P${selected.priority}　｜　零件 ${selected.cost}・2 AP</p>${button("build-module", state.modulePreview ? "局外預覽" : run.modules.some((module) => module.definitionId === selected.id) ? "已安裝" : run.resources.parts < selected.cost ? "零件不足" : run.actionPoints < 2 ? "AP 不足" : "確認建造", { value: selected.id, primary: !state.modulePreview && !run.modules.some((module) => module.definitionId === selected.id) && run.resources.parts >= selected.cost && run.actionPoints >= 2, icon: icons.build, detail: state.modulePreview ? "回到遊戲整備後才能建造" : undefined, disabled: state.modulePreview || run.resources.parts < selected.cost || run.actionPoints < 2 || run.modules.some((module) => module.definitionId === selected.id) })}</article>` : ""}
    </div>
  </section>`;
}

function techScreen(state: AppState): string {
  const run = state.run;
  if (!run) return "";
  const selected = TECH_NODES.find((node) => node.id === state.selectedTechId) ?? TECH_NODES[0];
  const selectedOwned = selected ? run.techOwned.includes(selected.id) : false;
  const selectedReady = selected ? selected.prerequisite.every((id) => run.techOwned.includes(id)) : false;
  const selectedAffordable = selected ? run.resources.data >= selected.cost : false;
  return `<section class="screen screen--tech" data-screen="SCR-TT-A">
    ${compactHeader(run, "科技樹", "協定資料解鎖永久規則", "hub")}
    <div class="protocol-data pill"><span>協定資料</span><strong>${run.resources.data}</strong></div>
    <div class="branch-tabs">${["能源", "居住", "農業", "防禦", "情報"].map((branch) => { const available = TECH_NODES.some((node) => node.branch === branch); return `<button class="${state.techBranch === branch ? "is-selected" : ""}" data-action="select-tech-branch" data-value="${branch}" ${available ? "" : "disabled"}>${branch}</button>`; }).join("")}</div>
    <div class="tech-tree panel"><svg viewBox="0 0 336 360"><path d="M42 64 L84 146 L168 222 L244 302"/><path d="M294 64 L252 146 L168 222"/><path d="M84 146 L252 146"/></svg>
      ${TECH_NODES.map((node, index) => { const positions = [[15, 14], [50, 14], [85, 14], [15, 41], [50, 41], [85, 41], [32, 70], [68, 70]]; const pos = positions[index] ?? [50, 88]; const owned = run.techOwned.includes(node.id); const available = node.prerequisite.every((id) => run.techOwned.includes(id)); return `<button class="tech-node ${owned ? "is-owned" : available ? "is-available" : "is-locked"} ${state.selectedTechId === node.id ? "is-selected" : ""}" style="--x:${pos[0]}%;--y:${pos[1]}%" data-action="select-tech" data-value="${node.id}"><span>${owned ? "✓" : node.id}</span><small>${node.name}</small></button>`; }).join("")}
    </div>
    ${selected ? `<article class="tech-detail panel"><div><strong>${selected.id}・${selected.name}</strong><span class="pill">${selected.branch}</span></div><p>${selected.description}</p><p>前置：${selected.prerequisite.length ? selected.prerequisite.join("＋") : "無"}　｜　成本 ${selected.cost}</p>${button("unlock-tech", selectedOwned ? "已解鎖" : !selectedReady ? "前置未解鎖" : !selectedAffordable ? "資料不足" : "解鎖節點", { value: selected.id, primary: !selectedOwned && selectedReady && selectedAffordable, icon: icons.tech, disabled: selectedOwned || !selectedReady || !selectedAffordable })}</article>` : ""}
  </section>`;
}

function resultScreen(state: AppState): string {
  const run = state.run;
  if (!run) return "";
  const ending = run.phase === "ending" || run.ended;
  const victory = run.outcome === "victory" || (ending && run.outcome === "active");
  const finalNight = !ending && run.day >= run.maxDays;
  const recent = run.ledger.slice(-4);
  const story = (run as RunState & { story?: StoryResultSnapshot }).story;
  const frost = story?.whiteFrost;
  const storyResult = ending && Boolean(story);
  const mechanicalFailure = run.outcome === "hull-lost" || run.outcome === "survivor-lost";
  const routeName = run.routeId === "R02" ? "白霜線" : "灰霧線";
  const resolvedEndingId = frost?.endingId ?? story?.endingId;
  const storyTitle = resolvedEndingId ? STORY_ENDING_TITLES[resolvedEndingId] ?? `${routeName}結局` : mechanicalFailure ? "守護終止" : `${routeName}結局`;
  const storyBranch = frost?.branch
    ? FROST_BRANCH_LABELS[frost.branch]
    : story?.flags.day4Route
      ? DAY4_RESULT_LABELS[story.flags.day4Route] ?? story.flags.day4Route
      : "尚未選擇永久分支";
  const storyReasons = frost?.endingReasons.length
    ? frost.endingReasons
    : story?.endingReasons.length
      ? story.endingReasons
    : [run.outcome === "hull-lost" ? "車體完整度歸零" : run.outcome === "survivor-lost" ? "A-07 生命訊號歸零" : "終局條件已鎖定"];
  const returnToHub = storyResult ? !mechanicalFailure : victory;
  return `<section class="screen screen--result ${ending ? "is-ending" : ""}" data-screen="SCR-RS-${ending ? "B" : "A"}">
    ${compactHeader(run, storyResult ? storyTitle : ending ? victory ? "路線完成" : "守護終止" : `第 ${run.day} 夜結算`, storyResult ? `${routeName}・${storyBranch}` : ending ? victory ? routeName : "存檔已保留" : "自動存檔成功")}
    <article class="result-card panel">
      ${storyResult ? `<div class="story-ending-mark"><span>${escapeText(resolvedEndingId ?? "mechanical-stop")}</span><b>第 ${run.day} 日・${routeName}</b></div><h1>${escapeText(storyTitle)}</h1><p class="ending-copy">${escapeText(run.lastMessage ?? "列車已完成本局最後一次守護判定。")}</p>` : ending ? victory ? `<h1>改道</h1><p class="ending-copy">列車穿過封鎖線後沒有停下。A-07 將新的終點寫入守護協定，而你第一次選擇不服從舊座標。</p>` : `<h1>終止</h1><p class="ending-copy">${run.outcome === "hull-lost" ? "最後一道車體隔離門失去密封，夜風灌進溫室車廂。" : "A-07 的生命訊號歸零，列車仍沿著沒有終點的軌道前進。"}</p>` : `<div class="ring-row"><div class="ring-meter" style="--value:${run.survivor.sleep}"><span><strong>${run.survivor.sleep}</strong><small>睡眠</small></span></div><div class="ring-meter" style="--value:${run.environment.hull}"><span><strong>${run.environment.hull}%</strong><small>車體完整</small></span></div></div>`}
      <h2>${storyResult ? "結局成立原因" : ending ? victory ? "達成條件" : "失敗原因" : "資源變化"}</h2>
      ${storyResult ? `<ol class="ending-reasons">${storyReasons.map((reason) => `<li>${escapeText(reason)}</li>`).join("")}</ol><div class="story-result-facts"><div><span>Day 4 永久分支</span><strong>${escapeText(storyBranch)}</strong></div><div><span>終局操作</span><strong>${escapeText((frost?.finalDecision ?? story?.finalDecision) ? FINAL_DECISION_LABELS[frost?.finalDecision ?? story?.finalDecision ?? ""] ?? frost?.finalDecision ?? story?.finalDecision ?? "" : "未完成")}</strong></div><div><span>${run.routeId === "R02" ? "信任／溫度" : "信任／感染"}</span><strong>${run.survivor.trust}／${run.routeId === "R02" ? `${run.environment.temperature}°C` : run.survivor.infection}</strong></div></div>` : `<div class="result-list">${ending ? victory ? `<div><span>信任</span><strong>${run.survivor.trust}/100</strong></div><div><span>感染</span><strong>${run.survivor.infection}/100</strong></div><div><span>終局選擇</span><strong>拒絕舊協定</strong></div>` : `<div><span>健康</span><strong>${run.survivor.health}/100</strong></div><div><span>車體</span><strong>${run.environment.hull}/100</strong></div><div><span>終止階段</span><strong>第 ${run.day} 夜</strong></div>` : recent.map((entry) => `<div><span>${escapeText(LEDGER_LABELS[entry.key] ?? entry.key)}</span><strong class="${entry.delta < 0 ? "is-negative" : "is-positive"}">${formatSigned(entry.delta)}</strong><small>${escapeText(entry.source)}</small></div>`).join("")}</div>`}
      <p class="aftermath-note">${escapeText(run.lastMessage ?? "")}</p>
      ${button(ending ? returnToHub ? "hub" : "new-game" : "next-day", ending ? returnToHub ? "返回局外中心" : "重新啟動守護協定" : finalNight ? "查看路線結局" : `進入第 ${run.day + 1} 日整備`, { primary: true, icon: ending && returnToHub ? icons.hub : icons.play, detail: ending && !returnToHub ? "從第 1 日重新規劃" : finalNight ? `完成 ${run.maxDays} 夜守望` : `協定資料 +${ending ? 4 : 1}` })}
    </article>
  </section>`;
}

function settingsScreen(state: AppState): string {
  const { settings } = state;
  return `<section class="screen screen--settings"><header class="simple-header"><button class="icon-button" data-action="menu">${icons.back}</button><h1>設定與無障礙</h1></header><div class="settings-list panel">
    <button data-action="cycle-text"><span><strong>文字大小</strong><small>所有流程支援 100／120／140%</small></span><b>${settings.textScale}%</b></button>
    <button data-action="toggle-motion"><span><strong>減少動態</strong><small>以靜態輪廓取代警報閃爍</small></span><b>${settings.reducedMotion ? "ON" : "OFF"}</b></button>
    <button data-action="toggle-countdown"><span><strong>事件無倒數</strong><small>緊急事件改為完全暫停</small></span><b>${settings.noCountdown ? "ON" : "OFF"}</b></button>
    <button data-action="toggle-speed"><span><strong>慢速守夜</strong><small>夜間模擬降至 0.75×</small></span><b>${settings.lowSpeed ? "ON" : "OFF"}</b></button>
    <button data-action="toggle-sound"><span><strong>音效</strong><small>關鍵警報仍保留方向文字</small></span><b>${settings.sound ? "ON" : "OFF"}</b></button>
  </div></section>`;
}

export class GameView {
  private readonly canvas: HTMLCanvasElement;
  private readonly uiRoot: HTMLDivElement;
  private previousScreenKey = "";
  private previousCarriageId?: CarriageId;
  private carriageSwipe: { target: HTMLElement; pointerId: number; startX: number; startY: number; x: number; y: number } | null = null;
  private decorDrag: { target: HTMLElement; id: string; bounds: DOMRect; startX: number; startY: number; x: number; y: number; moved: boolean; nearestSlotId?: string } | null = null;
  private threatToolDrag: { target: HTMLElement; pointerId: number; startX: number; startY: number; moved: boolean; dropTarget?: HTMLElement } | null = null;
  private thermalDrag: { target: HTMLElement; pointerId: number; tokenId: string; startX: number; startY: number; moved: boolean; dropTarget?: HTMLElement } | null = null;
  private suppressDecorClick = false;
  private suppressThreatToolClick = false;
  private suppressThermalClick = false;
  private threatToolArmed = false;
  private threatContactId = "";

  public constructor(private readonly root: HTMLElement, private readonly onAction: ActionHandler) {
    this.root.innerHTML = `<main class="game-shell"><div class="game-frame"><canvas id="scene-canvas" aria-hidden="true"></canvas><div id="ui-root"></div></div><p class="rotate-notice">請將裝置轉回直式，守護協定需要完整車廂視野。</p></main>`;
    this.canvas = this.root.querySelector<HTMLCanvasElement>("#scene-canvas")!;
    this.uiRoot = this.root.querySelector<HTMLDivElement>("#ui-root")!;
    this.uiRoot.addEventListener("click", (event) => {
      const threatTool = (event.target as HTMLElement).closest<HTMLElement>("[data-threat-tool]");
      if (threatTool) {
        if (this.suppressThreatToolClick) {
          this.suppressThreatToolClick = false;
          return;
        }
        this.threatToolArmed = !this.threatToolArmed;
        this.applyThreatToolArmedState();
        if ("vibrate" in navigator) navigator.vibrate(this.threatToolArmed ? 12 : 6);
        return;
      }
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
      if (!target || target.matches(":disabled")) return;
      if (this.suppressThermalClick && target.matches("[data-heat-token]")) {
        this.suppressThermalClick = false;
        return;
      }
      if (this.suppressDecorClick && target.matches(".decor-item")) {
        this.suppressDecorClick = false;
        return;
      }
      if (target.dataset.requiresTool === "cutter") {
        if (!this.threatToolArmed) {
          const panel = target.closest<HTMLElement>(".threat-interaction--vine");
          panel?.classList.add("is-tool-required");
          const status = panel?.querySelector<HTMLElement>(".threat-tool-status");
          if (status) status.textContent = "先點選割具，再點種植槽；也可以直接把割具拖進槽內。";
          if ("vibrate" in navigator) navigator.vibrate([10, 30, 10]);
          return;
        }
        this.threatToolArmed = false;
      }
      if ("vibrate" in navigator) navigator.vibrate(8);
      this.onAction(target.dataset.action ?? "", target.dataset.value);
    });
    this.uiRoot.addEventListener("pointerdown", (event) => {
      this.startThermalDrag(event);
      if (!this.thermalDrag) this.startThreatToolDrag(event);
      if (!this.thermalDrag && !this.threatToolDrag) this.startDecorDrag(event);
      if (!this.thermalDrag && !this.threatToolDrag && !this.decorDrag) this.startCarriageSwipe(event);
    });
    this.uiRoot.addEventListener("pointermove", (event) => {
      if (this.thermalDrag) this.moveThermalDrag(event);
      else if (this.threatToolDrag) this.moveThreatToolDrag(event);
      else {
        this.moveDecorDrag(event);
        this.moveCarriageSwipe(event);
      }
    });
    this.uiRoot.addEventListener("pointerup", (event) => {
      if (this.thermalDrag) this.finishThermalDrag(event);
      else if (this.threatToolDrag) this.finishThreatToolDrag(event);
      else if (this.decorDrag) this.finishDecorDrag(event);
      else this.finishCarriageSwipe(event);
    });
    this.uiRoot.addEventListener("pointercancel", () => {
      this.cancelThermalDrag();
      this.cancelThreatToolDrag();
      this.cancelDecorDrag();
      this.cancelCarriageSwipe();
    });
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  private startThermalDrag(event: PointerEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-heat-token]");
    if (!target || !target.closest(".thermal-board, .threat-interaction--frost")) return;
    target.setPointerCapture(event.pointerId);
    this.thermalDrag = {
      target,
      pointerId: event.pointerId,
      tokenId: target.dataset.heatToken ?? "",
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    target.classList.add("is-grabbed");
  }

  private moveThermalDrag(event: PointerEvent): void {
    const drag = this.thermalDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (!drag.moved) return;
    drag.target.style.setProperty("--thermal-drag-x", `${dx}px`);
    drag.target.style.setProperty("--thermal-drag-y", `${dy}px`);
    let dropTarget: HTMLElement | undefined;
    for (const zone of this.uiRoot.querySelectorAll<HTMLElement>("[data-thermal-zone]")) {
      const rect = zone.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      zone.classList.toggle("is-drop-target", inside);
      if (inside) dropTarget = zone;
    }
    drag.dropTarget = dropTarget;
    event.preventDefault();
  }

  private finishThermalDrag(event: PointerEvent): void {
    const drag = this.thermalDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const zone = drag.dropTarget?.dataset.zone;
    this.resetThermalDrag();
    this.thermalDrag = null;
    if (!drag.moved) return;
    this.suppressThermalClick = true;
    window.setTimeout(() => { this.suppressThermalClick = false; }, 0);
    if (zone) {
      if ("vibrate" in navigator) navigator.vibrate(16);
      this.onAction("thermal-move", `${drag.tokenId}:${zone}`);
    }
    event.preventDefault();
  }

  private cancelThermalDrag(): void {
    this.resetThermalDrag();
    this.thermalDrag = null;
  }

  private resetThermalDrag(): void {
    const target = this.thermalDrag?.target;
    target?.classList.remove("is-grabbed");
    target?.style.removeProperty("--thermal-drag-x");
    target?.style.removeProperty("--thermal-drag-y");
    this.uiRoot.querySelectorAll(".thermal-zone.is-drop-target").forEach((zone) => zone.classList.remove("is-drop-target"));
  }

  private startThreatToolDrag(event: PointerEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-threat-tool='cutter']");
    if (!target || !target.closest(".threat-interaction--vine")) return;
    target.setPointerCapture(event.pointerId);
    this.threatToolDrag = { target, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    target.classList.add("is-grabbed");
  }

  private moveThreatToolDrag(event: PointerEvent): void {
    const drag = this.threatToolDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    if (!drag.moved) return;
    drag.target.style.setProperty("--drag-x", `${dx}px`);
    drag.target.style.setProperty("--drag-y", `${dy}px`);
    let activeTarget: HTMLElement | undefined;
    for (const plot of this.uiRoot.querySelectorAll<HTMLElement>(".vine-plot[data-threat-target]")) {
      const rect = plot.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      plot.classList.toggle("is-drop-target", inside);
      if (inside) activeTarget = plot;
    }
    drag.dropTarget = activeTarget;
    event.preventDefault();
  }

  private finishThreatToolDrag(event: PointerEvent): void {
    const drag = this.threatToolDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const actionValue = drag.dropTarget?.dataset.value;
    this.resetThreatToolDrag();
    this.threatToolDrag = null;
    if (!drag.moved) return;
    this.suppressThreatToolClick = true;
    window.setTimeout(() => { this.suppressThreatToolClick = false; }, 0);
    this.threatToolArmed = false;
    if (actionValue) {
      if ("vibrate" in navigator) navigator.vibrate(18);
      this.onAction("threat-interact", actionValue);
    } else {
      const status = this.uiRoot.querySelector<HTMLElement>(".threat-tool-status");
      if (status) status.textContent = "割具未落在槽位內；可重拖一次，或點割具後再點槽位。";
    }
    event.preventDefault();
  }

  private cancelThreatToolDrag(): void {
    this.resetThreatToolDrag();
    this.threatToolDrag = null;
  }

  private resetThreatToolDrag(): void {
    const target = this.threatToolDrag?.target;
    target?.classList.remove("is-grabbed");
    target?.style.removeProperty("--drag-x");
    target?.style.removeProperty("--drag-y");
    this.uiRoot.querySelectorAll(".vine-plot.is-drop-target").forEach((plot) => plot.classList.remove("is-drop-target"));
  }

  private applyThreatToolArmedState(): void {
    const panel = this.uiRoot.querySelector<HTMLElement>(".threat-interaction--vine");
    const cutter = panel?.querySelector<HTMLElement>("[data-threat-tool='cutter']");
    panel?.classList.toggle("is-tool-armed", this.threatToolArmed);
    panel?.classList.remove("is-tool-required");
    cutter?.setAttribute("aria-pressed", String(this.threatToolArmed));
    const status = panel?.querySelector<HTMLElement>(".threat-tool-status");
    if (status && this.threatToolArmed) status.textContent = "割具已拿起；現在點選要切割的種植槽。";
  }

  private startDecorDrag(event: PointerEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>(".decor-item[data-decor-id]");
    const layer = target?.closest<HTMLElement>(".carriage-decor-layer");
    if (!target || !layer) return;
    target.setPointerCapture(event.pointerId);
    this.decorDrag = { target, id: target.dataset.decorId ?? "", bounds: layer.getBoundingClientRect(), startX: event.clientX, startY: event.clientY, x: Number(target.dataset.decorationX), y: Number(target.dataset.decorationY), moved: false };
    target.classList.add("is-dragging");
    event.preventDefault();
  }

  private moveDecorDrag(event: PointerEvent): void {
    const drag = this.decorDrag;
    if (!drag) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;
    drag.x = Math.min(92, Math.max(8, ((event.clientX - drag.bounds.left) / drag.bounds.width) * 100));
    drag.y = Math.min(92, Math.max(8, ((event.clientY - drag.bounds.top) / drag.bounds.height) * 100));
    drag.target.style.setProperty("--x", `${drag.x}%`);
    drag.target.style.setProperty("--y", `${drag.y}%`);
    let nearest: { element: HTMLElement; distance: number } | undefined;
    for (const element of this.uiRoot.querySelectorAll<HTMLElement>(".decor-slot[data-slot-id]")) {
      const rect = element.getBoundingClientRect();
      const distance = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
      if (!nearest || distance < nearest.distance) nearest = { element, distance };
      element.classList.remove("is-targeted");
    }
    if (nearest && nearest.distance <= 96) {
      nearest.element.classList.add("is-targeted");
      drag.nearestSlotId = nearest.element.dataset.slotId;
    } else {
      drag.nearestSlotId = undefined;
    }
    event.preventDefault();
  }

  private finishDecorDrag(event: PointerEvent): void {
    const drag = this.decorDrag;
    if (!drag) return;
    drag.target.classList.remove("is-dragging");
    if (drag.moved) {
      this.suppressDecorClick = true;
      window.setTimeout(() => { this.suppressDecorClick = false; }, 0);
      this.onAction("move-decoration", `${drag.id}:${drag.nearestSlotId ?? "invalid"}`);
    }
    this.uiRoot.querySelectorAll(".decor-slot.is-targeted").forEach((slot) => slot.classList.remove("is-targeted"));
    this.decorDrag = null;
    event.preventDefault();
  }

  private cancelDecorDrag(): void {
    this.decorDrag?.target.classList.remove("is-dragging");
    this.uiRoot.querySelectorAll(".decor-slot.is-targeted").forEach((slot) => slot.classList.remove("is-targeted"));
    this.decorDrag = null;
  }

  private startCarriageSwipe(event: PointerEvent): void {
    const source = event.target as HTMLElement;
    const screen = source.closest<HTMLElement>(".screen--carriage.is-prep.is-observation-mode");
    if (!screen || source.closest("button, [data-action], .panel, .toast-message, .carriage-swipe-hint")) return;
    const selectorBottom = this.uiRoot.querySelector(".carriage-selector")?.getBoundingClientRect().bottom ?? 0;
    const toastTop = this.uiRoot.querySelector(".toast-message")?.getBoundingClientRect().top ?? innerHeight;
    if (event.clientY < selectorBottom || event.clientY > toastTop) return;
    screen.setPointerCapture(event.pointerId);
    this.carriageSwipe = { target: screen, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY };
  }

  private moveCarriageSwipe(event: PointerEvent): void {
    const swipe = this.carriageSwipe;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    swipe.x = event.clientX;
    swipe.y = event.clientY;
    const dx = swipe.x - swipe.startX;
    const dy = swipe.y - swipe.startY;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      const dragOffset = Math.max(-28, Math.min(28, dx * 0.16));
      this.canvas.style.transform = `translateX(${dragOffset}px) scale(1.012)`;
      this.canvas.style.opacity = String(1 - Math.min(0.16, Math.abs(dx) / 700));
      event.preventDefault();
    }
  }

  private finishCarriageSwipe(event: PointerEvent): void {
    const swipe = this.carriageSwipe;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const dx = event.clientX - swipe.startX;
    const dy = event.clientY - swipe.startY;
    this.resetCarriageCanvasDrag();
    this.carriageSwipe = null;
    if (Math.abs(dx) >= 58 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if ("vibrate" in navigator) navigator.vibrate(12);
      this.onAction("swipe-carriage", dx < 0 ? "next" : "previous");
      event.preventDefault();
    }
  }

  private cancelCarriageSwipe(): void {
    this.resetCarriageCanvasDrag();
    this.carriageSwipe = null;
  }

  private resetCarriageCanvasDrag(): void {
    this.canvas.style.removeProperty("transform");
    this.canvas.style.removeProperty("opacity");
  }

  public render(state: AppState, hasSave: boolean, activeEvent?: GameEvent): void {
    this.cancelThermalDrag();
    this.cancelThreatToolDrag();
    const activeThreatContactId = state.run?.activeContact?.id ?? "";
    if (activeThreatContactId !== this.threatContactId) this.threatToolArmed = false;
    this.threatContactId = activeThreatContactId;
    const screen = {
      menu: () => menuScreen(state, hasSave),
      hub: () => hubScreen(state),
      carriage: () => carriageScreen(state),
      route: () => routeScreen(state),
      event: () => eventScreen(state, activeEvent),
      modules: () => modulesScreen(state),
      tech: () => techScreen(state),
      result: () => resultScreen(state),
      settings: () => settingsScreen(state),
    }[state.screen];
    this.uiRoot.innerHTML = screen();
    if (this.threatToolArmed) this.applyThreatToolArmedState();
    const screenKey = [state.screen, state.run?.phase ?? "", state.run?.activeEventId ?? "", state.run?.activeContact?.id ?? ""].join(":");
    if (screenKey !== this.previousScreenKey) this.uiRoot.querySelector(".screen")?.classList.add("screen-enter");
    this.previousScreenKey = screenKey;
    if (state.screen === "carriage") {
      if (this.previousCarriageId && this.previousCarriageId !== state.activeCarriageId) {
        const previousIndex = CARRIAGES.findIndex((carriage) => carriage.id === this.previousCarriageId);
        const currentIndex = CARRIAGES.findIndex((carriage) => carriage.id === state.activeCarriageId);
        const motionClass = currentIndex > previousIndex ? "carriage-shift-next" : "carriage-shift-previous";
        this.canvas.classList.remove("carriage-shift-next", "carriage-shift-previous");
        void this.canvas.offsetWidth;
        this.canvas.classList.add(motionClass);
        window.setTimeout(() => this.canvas.classList.remove(motionClass), 320);
      }
      this.previousCarriageId = state.activeCarriageId;
    }
    this.root.style.setProperty("--text-scale", String(state.settings.textScale / 100));
    this.root.classList.toggle("reduce-motion", state.settings.reducedMotion);
    this.root.dataset.gameScreen = state.screen;
    this.root.dataset.phase = state.run?.phase ?? "none";
    this.root.dataset.contactStage = state.run?.activeContact?.stage ?? "idle";
  }
}
