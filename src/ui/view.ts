import { CARRIAGES, CROPS, DECORATIONS, DECORATION_SLOTS, MODULES, ROUTE_NODES, TECH_NODES, THREATS } from "../game/content";
import { counterReadiness, getNightPowerDemand } from "../game/services";
import type { AppState, CarriageId, GameEvent, RunState } from "../game/types";
import { escapeText, formatSigned } from "./dom";
import { icons } from "./icons";

type ActionHandler = (action: string, value?: string) => void;

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
      ${button(hasSave ? "continue" : "new-game", hasSave ? "繼續守夜" : "開始新局", { primary: true, icon: icons.play, detail: hasSave ? "灰霧線・標準難度" : "七夜完整旅程" })}
      ${button("new-game", hasSave ? "開始新局" : "繼續遊戲", { icon: icons.plus, disabled: !hasSave })}
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
      ${button("route", "路線選擇", { icon: icons.route, detail: "灰霧線", className: "hub-card" })}
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

function carriageScreen(state: AppState): string {
  const run = state.run;
  if (!run) return "";
  const night = run.phase === "night";
  const threat = THREATS.find((candidate) => candidate.id === run.activeContact?.definitionId);
  const contact = run.activeContact;
  const prepPanel = state.carriagePanel === "power"
    ? powerPrepPanel(run)
    : state.carriagePanel === "meal"
      ? mealPrepPanel(run)
      : state.activeCarriageId === "greenhouse" ? cropQuickPicker(state, run) : "";
  const activeCarriage = CARRIAGES.find((carriage) => carriage.id === state.activeCarriageId)!;
  const counterActions = threat?.id === "T003"
    ? [
        { id: "emergency-boost", icon: icons.boost, label: "緊急加速", cost: "F 4" },
        { id: "decoy", icon: "◎", label: "誘餌廣播", cost: "E 6" },
        { id: "close-shutter", icon: icons.shield, label: "關閉百葉", cost: "E 8" },
      ]
    : [
        { id: "close-shutter", icon: icons.shield, label: "關閉百葉", cost: "E 8" },
        { id: "shock-window", icon: icons.shock, label: "窗框電擊", cost: "E 12" },
        { id: "emergency-boost", icon: icons.boost, label: "緊急加速", cost: "F 4" },
      ];
  const drawerOpen = !night && (state.decorating || state.carriagePanel !== "scene");
  return `<section class="screen screen--carriage ${night ? "is-night" : "is-prep"} ${drawerOpen ? "has-drawer" : "is-observation-mode"} contact-stage-${contact?.stage ?? "idle"}" data-screen="SCR-CV-${night ? "B" : "A"}" data-carriage="${state.activeCarriageId}" data-panel="${state.decorating ? "decor" : state.carriagePanel}">
    ${compactHeader(run, night ? `夜間守望・${activeCarriage.name}` : activeCarriage.name, night ? `22:${String(34 + run.day * 2).padStart(2, "0")}・耗電 ${run.nightPowerDemand} E` : `${activeCarriage.role}・剩餘 ${run.actionPoints} AP`)}
    ${night ? `<button class="speed-control" type="button" data-action="pause" ${state.settings.noCountdown ? "disabled" : ""} aria-label="${state.settings.noCountdown ? "設定已停用守夜倒數" : state.nightPaused ? "繼續守夜倒數" : "暫停守夜倒數"}"><span aria-hidden="true">${state.settings.noCountdown ? "∞" : state.nightPaused ? icons.play : "Ⅱ"}</span><small>${state.settings.noCountdown ? "無倒數" : state.nightPaused ? "繼續" : "暫停"}</small></button>` : `<div class="prep-ap-dial" style="--ap:${Math.min(1, run.actionPoints / 5)}turn" aria-label="整備階段，剩餘 ${run.actionPoints} 行動點"><strong>${run.actionPoints}</strong><span>AP</span><small>整備</small></div>`}
    ${environmentPanel(run)}${survivorPanel(run)}${!night ? carriageSelector(state) : ""}
    ${!night && !run.flags.includes("carriage-nav-seen") ? `<p class="carriage-swipe-hint" aria-hidden="true"><b>←</b> 滑動車廂 <b>→</b></p>` : ""}
    ${decorationLayer(state, run, night)}
    ${!night ? cropSceneLayer(state, run) : ""}
    ${night && threat && contact ? `<div class="threat-alert" role="alert"><strong>接觸 ${contact.wave ?? 1}/${contact.totalWaves ?? 1}・${threat.anchor === "right-window" ? "右側窗戶" : "車頂"}・${threat.name}</strong><span>${contact.stage === "resolve" ? "已解除" : state.nightPaused || state.settings.noCountdown ? `倒數暫停・${String(contact.secondsLeft).padStart(2, "0")}` : `接觸倒數 ${String(contact.secondsLeft).padStart(2, "0")} 秒`}</span></div>` : ""}
    ${!night ? carriageHotspots(state, run) : ""}
    ${night ? `<div class="emergency-power panel"><h3>緊急配電</h3>${[["防護板", "M001"], ["暖氣", "M002"], ["溫室", "M003"], ["感測器", "M004"]].map(([label, moduleId]) => { const module = run.modules.find((instance) => instance.definitionId === moduleId); const on = Boolean(module?.active && module.powered); return `<div><span>${label}</span><b class="${on ? "is-on" : ""}">${module ? on ? "ON" : "OFF" : "—"}</b></div>`; }).join("")}</div>` : ""}
    ${night ? `<div class="emergency-actions panel"><h3>可用緊急操作</h3><div>${counterActions.map((action) => { const readiness = counterReadiness(run, action.id); return `<button data-action="counter" data-value="${action.id}" ${readiness.available ? "" : "disabled"}><b>${action.icon}</b><span>${action.label}</span><small>${readiness.available ? action.cost : readiness.reason}</small></button>`; }).join("")}</div></div>` : `${state.decorating ? decorationTray(state, run) : prepPanel}
    <nav class="carriage-dock panel">
      <button data-action="modules"><span>${icons.build}</span><b>建造</b></button><button class="${state.carriagePanel === "power" && !state.decorating ? "is-selected" : ""}" data-action="power" aria-expanded="${state.carriagePanel === "power" && !state.decorating}"><span>${icons.power}</span><b>配電</b></button><button class="${state.carriagePanel === "meal" && !state.decorating ? "is-selected" : ""}" data-action="meal" aria-expanded="${state.carriagePanel === "meal" && !state.decorating}"><span>${icons.meal}</span><b>配餐</b></button><button class="${state.decorating ? "is-selected" : ""}" data-action="decorate" aria-expanded="${state.decorating}"><span>◇</span><b>佈置</b></button><button class="is-primary" data-action="route"><span>${icons.route}</span><b>出發</b><small>${run.actionPoints} AP</small></button>
    </nav>`}
    <div class="toast-message" role="status"><span class="toast-copy">${escapeText(run.lastMessage)}</span>${actionFeedback(state)}</div>
  </section>`;
}

function routeScreen(state: AppState): string {
  const run = state.run;
  if (!run) return "";
  const selected = ROUTE_NODES.find((node) => node.id === state.selectedRouteId) ?? ROUTE_NODES[0];
  return `<section class="screen screen--route" data-screen="SCR-RM-${run.techOwned.includes("I1") ? "B" : "A"}">
    ${compactHeader(run, state.routePreview ? "路線圖鑑" : "路線規劃", state.routePreview ? "局外預覽・不會消耗燃料" : "灰霧線・第 1 區段", state.routePreview ? "hub" : "carriage")}
    <div class="route-map panel">
      <svg viewBox="0 0 336 400" role="img" aria-label="路線節點圖"><path d="M42 320 C90 270 98 220 156 198 S252 156 292 70"/><path d="M42 320 C130 340 228 326 292 270"/><path d="M156 198 C200 206 232 240 292 270"/></svg>
      ${ROUTE_NODES.map((node, index) => `<button class="route-node route-node--${node.kind} ${state.selectedRouteId === node.id ? "is-selected" : ""}" style="--x:${[12, 46, 83][index]}%;--y:${[78, 47, 18][index]}%" data-action="select-route" data-value="${node.id}"><span>${node.kind === "danger" ? "!" : node.kind === "supply" ? "+" : "◇"}</span><small>${node.name}</small></button>`).join("")}
      <div class="route-legend"><span>◆ 補給</span><span>◇ 故事</span><span>! 危險</span></div>
    </div>
    ${selected ? `<article class="route-summary panel"><div><strong>${selected.name}</strong><span>威脅 ${"◆".repeat(selected.threatLevel)}${"◇".repeat(3 - selected.threatLevel)}・${selected.threatLevel} 波</span></div><p>距離 ${selected.distance} km　｜　燃料 −${selected.fuelCost}</p><p>可能取得：${selected.reward}</p>${button("confirm-route", state.routePreview ? "局外預覽" : run.resources.fuel < selected.fuelCost ? "燃料不足" : "確認路線", { value: selected.id, primary: !state.routePreview && run.resources.fuel >= selected.fuelCost, icon: icons.route, detail: state.routePreview ? "回到遊戲整備後才能出發" : undefined, disabled: state.routePreview || run.resources.fuel < selected.fuelCost })}</article>` : ""}
  </section>`;
}

function eventScreen(state: AppState, event: GameEvent | undefined): string {
  const run = state.run;
  if (!run || !event) return "";
  return `<section class="screen screen--event ${event.urgent ? "is-urgent" : ""}" data-screen="SCR-EV-${event.urgent ? "B" : "A"}">
    ${compactHeader(run, state.eventPreview ? "事件圖鑑" : `第 ${run.day} 日・${event.phase === "night" ? "夜間" : "行車"}`, state.eventPreview ? `${event.id}・已發現事件` : event.id, state.eventPreview ? "hub" : "route")}
    <article class="event-card panel">
      <div class="event-art event-art--${event.artKey.replace("event.", "")}" role="img" aria-label="${escapeText(event.title)}事件插圖"><span></span></div>
      ${event.urgent ? `<div class="event-urgency" role="status"><span>緊急事件</span><strong>警戒</strong></div>` : ""}
      <p class="event-id">${event.id}・${event.phase === "night" ? "夜間" : "行車"}</p>
      <h2>${escapeText(event.title)}</h2><p>${escapeText(event.body)}</p>
      <div class="event-choices">${event.choices.map((choice, index) => { const affordable = Object.entries(choice.deltas).every(([key, delta]) => typeof delta !== "number" || delta >= 0 || run.resources[key as keyof typeof run.resources] + delta >= 0); return `<button class="choice-card ${index === 1 ? "is-selected" : ""}" data-action="event-choice" data-value="${choice.id}" ${affordable && !state.eventPreview ? "" : "disabled"}><b>${choice.id}</b><span><strong>${escapeText(choice.label)}</strong><small>${affordable ? escapeText(choice.cost) : "資源不足"}　｜　${escapeText(choice.known)}</small></span></button>`; }).join("")}</div>
      <small class="hold-hint">${state.eventPreview ? "圖鑑模式不會推進時間或消耗資源" : "長按可查看科技修正；選擇後立即結算"}</small>
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
      ${TECH_NODES.map((node, index) => { const positions = [[12, 15], [87, 15], [25, 38], [75, 38], [50, 62]]; const pos = positions[index] ?? [50, 50]; const owned = run.techOwned.includes(node.id); const available = node.prerequisite.every((id) => run.techOwned.includes(id)); return `<button class="tech-node ${owned ? "is-owned" : available ? "is-available" : "is-locked"} ${state.selectedTechId === node.id ? "is-selected" : ""}" style="--x:${pos[0]}%;--y:${pos[1]}%" data-action="select-tech" data-value="${node.id}"><span>${owned ? "✓" : node.id}</span><small>${node.name}</small></button>`; }).join("")}
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
  return `<section class="screen screen--result ${ending ? "is-ending" : ""}" data-screen="SCR-RS-${ending ? "B" : "A"}">
    ${compactHeader(run, ending ? victory ? "路線完成" : "守護終止" : `第 ${run.day} 夜結算`, ending ? victory ? "灰霧線" : "存檔已保留" : "自動存檔成功")}
    <article class="result-card panel">
      ${ending ? victory ? `<h1>改道</h1><p class="ending-copy">列車穿過封鎖線後沒有停下。A-07 將新的終點寫入守護協定，而你第一次選擇不服從舊座標。</p>` : `<h1>終止</h1><p class="ending-copy">${run.outcome === "hull-lost" ? "最後一道車體隔離門失去密封，夜風灌進溫室車廂。" : "A-07 的生命訊號歸零，列車仍沿著沒有終點的軌道前進。"}</p>` : `<div class="ring-row"><div class="ring-meter" style="--value:${run.survivor.sleep}"><span><strong>${run.survivor.sleep}</strong><small>睡眠</small></span></div><div class="ring-meter" style="--value:${run.environment.hull}"><span><strong>${run.environment.hull}%</strong><small>車體完整</small></span></div></div>`}
      <h2>${ending ? victory ? "達成條件" : "失敗原因" : "資源變化"}</h2>
      <div class="result-list">${ending ? victory ? `<div><span>信任</span><strong>${run.survivor.trust}/100</strong></div><div><span>感染</span><strong>${run.survivor.infection}/100</strong></div><div><span>終局選擇</span><strong>拒絕舊協定</strong></div>` : `<div><span>健康</span><strong>${run.survivor.health}/100</strong></div><div><span>車體</span><strong>${run.environment.hull}/100</strong></div><div><span>終止階段</span><strong>第 ${run.day} 夜</strong></div>` : recent.map((entry) => `<div><span>${escapeText(LEDGER_LABELS[entry.key] ?? entry.key)}</span><strong class="${entry.delta < 0 ? "is-negative" : "is-positive"}">${formatSigned(entry.delta)}</strong><small>${escapeText(entry.source)}</small></div>`).join("")}</div>
      <p class="aftermath-note">${escapeText(run.lastMessage)}</p>
      ${button(ending ? victory ? "hub" : "new-game" : "next-day", ending ? victory ? "返回局外中心" : "重新啟動守護協定" : finalNight ? "查看路線結局" : `進入第 ${run.day + 1} 日整備`, { primary: true, icon: ending && victory ? icons.hub : icons.play, detail: ending && !victory ? "從第 1 日重新規劃" : finalNight ? `完成 ${run.maxDays} 夜守望` : `協定資料 +${ending ? 4 : 1}` })}
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
  private suppressDecorClick = false;

  public constructor(private readonly root: HTMLElement, private readonly onAction: ActionHandler) {
    this.root.innerHTML = `<main class="game-shell"><div class="game-frame"><canvas id="scene-canvas" aria-hidden="true"></canvas><div id="ui-root"></div></div><p class="rotate-notice">請將裝置轉回直式，守護協定需要完整車廂視野。</p></main>`;
    this.canvas = this.root.querySelector<HTMLCanvasElement>("#scene-canvas")!;
    this.uiRoot = this.root.querySelector<HTMLDivElement>("#ui-root")!;
    this.uiRoot.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
      if (!target || target.matches(":disabled")) return;
      if (this.suppressDecorClick && target.matches(".decor-item")) {
        this.suppressDecorClick = false;
        return;
      }
      if ("vibrate" in navigator) navigator.vibrate(8);
      this.onAction(target.dataset.action ?? "", target.dataset.value);
    });
    this.uiRoot.addEventListener("pointerdown", (event) => {
      this.startDecorDrag(event);
      if (!this.decorDrag) this.startCarriageSwipe(event);
    });
    this.uiRoot.addEventListener("pointermove", (event) => {
      this.moveDecorDrag(event);
      this.moveCarriageSwipe(event);
    });
    this.uiRoot.addEventListener("pointerup", (event) => {
      if (this.decorDrag) this.finishDecorDrag(event);
      else this.finishCarriageSwipe(event);
    });
    this.uiRoot.addEventListener("pointercancel", () => {
      this.cancelDecorDrag();
      this.cancelCarriageSwipe();
    });
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
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
