import { MODULES, ROUTE_NODES, TECH_NODES, THREATS } from "../game/content";
import type { AppState, GameEvent, RunState } from "../game/types";
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
      ${button("carriage", "起始藍圖", { icon: icons.build, detail: "溫室臥鋪", className: "hub-card" })}
    </div>
    <nav class="bottom-nav">${["中心", "路線", "科技", "圖鑑"].map((label, index) => `<button data-action="${["hub", "route", "tech", "event-preview"][index]}" class="${index === 0 ? "is-selected" : ""}"><span>${[icons.hub, icons.route, icons.tech, "記"][index]}</span>${label}</button>`).join("")}</nav>
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

function carriageScreen(state: AppState): string {
  const run = state.run;
  if (!run) return "";
  const night = run.phase === "night";
  const threat = THREATS.find((candidate) => candidate.id === run.activeContact?.definitionId);
  const contact = run.activeContact;
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
  return `<section class="screen screen--carriage ${night ? "is-night" : "is-prep"} contact-stage-${contact?.stage ?? "idle"}" data-screen="SCR-CV-${night ? "B" : "A"}">
    ${compactHeader(run, night ? "夜間守望" : "車廂整備", night ? `22:${String(34 + run.day * 2).padStart(2, "0")}` : `剩餘 ${Math.max(2, Math.floor(run.survivor.sleep / 30) + 2)} AP`)}
    <button class="speed-control" type="button" data-action="pause">${night ? "×1" : icons.pause}</button>
    ${environmentPanel(run)}${survivorPanel(run)}
    ${night && threat && contact ? `<div class="threat-alert" role="alert"><strong>${threat.anchor === "right-window" ? "右側窗戶" : "車頂"}・${threat.name}</strong><span>${contact.stage === "resolve" ? "已解除" : `接觸倒數 ${String(contact.secondsLeft).padStart(2, "0")} 秒`}</span></div>` : ""}
    ${!night ? `<div class="scene-hotspots" aria-label="車廂設備熱區">
      <button data-action="select-module" data-value="M003" style="--x:20%;--y:47%">種</button>
      <button data-action="select-module" data-value="M002" style="--x:52%;--y:62%">床</button>
      <button data-action="select-module" data-value="M001" style="--x:84%;--y:38%">窗</button>
    </div>` : ""}
    ${night ? `<div class="emergency-power panel"><h3>緊急配電</h3>${[["防護板", true], ["暖氣", true], ["溫室", false], ["照明", false]].map(([label, on]) => `<div><span>${label}</span><b class="${on ? "is-on" : ""}">${on ? "ON" : "OFF"}</b></div>`).join("")}</div>` : ""}
    ${night ? `<div class="emergency-actions panel"><h3>可用緊急操作</h3><div>${counterActions.map((action) => `<button data-action="counter" data-value="${action.id}"><b>${action.icon}</b><span>${action.label}</span><small>${action.cost}</small></button>`).join("")}</div></div>` : `<div class="module-detail panel"><h3>${escapeText(MODULES.find((module) => module.id === state.selectedModuleId)?.name ?? "垂直種植架")} Mk I</h3><p>狀態正常　｜　點擊設備查看詳細資料</p><div><button data-action="harvest">收成 2</button><button data-action="toggle-module">停用</button></div></div>
    <nav class="carriage-dock panel">
      <button data-action="modules"><span>${icons.build}</span>建造</button><button data-action="power"><span>${icons.power}</span>配電</button><button data-action="meal"><span>${icons.meal}</span>配餐</button><button class="is-primary" data-action="route"><span>${icons.route}</span>出發</button>
    </nav>`}
    <div class="toast-message" role="status">${escapeText(run.lastMessage)}</div>
  </section>`;
}

function routeScreen(state: AppState): string {
  const run = state.run;
  if (!run) return "";
  const selected = ROUTE_NODES.find((node) => node.id === state.selectedRouteId) ?? ROUTE_NODES[0];
  return `<section class="screen screen--route" data-screen="SCR-RM-${run.techOwned.includes("I1") ? "B" : "A"}">
    ${compactHeader(run, "路線規劃", "灰霧線・第 1 區段", "carriage")}
    <div class="route-map panel">
      <svg viewBox="0 0 336 400" role="img" aria-label="路線節點圖"><path d="M42 320 C90 270 98 220 156 198 S252 156 292 70"/><path d="M42 320 C130 340 228 326 292 270"/><path d="M156 198 C200 206 232 240 292 270"/></svg>
      ${ROUTE_NODES.map((node, index) => `<button class="route-node route-node--${node.kind} ${state.selectedRouteId === node.id ? "is-selected" : ""}" style="--x:${[12, 46, 83][index]}%;--y:${[78, 47, 18][index]}%" data-action="select-route" data-value="${node.id}"><span>${node.kind === "danger" ? "!" : node.kind === "supply" ? "+" : "◇"}</span><small>${node.name}</small></button>`).join("")}
      <div class="route-legend"><span>◆ 補給</span><span>◇ 故事</span><span>! 危險</span></div>
    </div>
    ${selected ? `<article class="route-summary panel"><div><strong>${selected.name}</strong><span>威脅 ${"◆".repeat(selected.threatLevel)}${"◇".repeat(3 - selected.threatLevel)}</span></div><p>距離 ${selected.distance} km　｜　燃料 −${selected.fuelCost}</p><p>可能取得：${selected.reward}</p>${button("confirm-route", "確認路線", { value: selected.id, primary: true, icon: icons.route })}</article>` : ""}
  </section>`;
}

function eventScreen(state: AppState, event: GameEvent | undefined): string {
  const run = state.run;
  if (!run || !event) return "";
  return `<section class="screen screen--event ${event.urgent ? "is-urgent" : ""}" data-screen="SCR-EV-${event.urgent ? "B" : "A"}">
    ${compactHeader(run, `第 ${run.day} 日・${event.phase === "night" ? "夜間" : "行車"}`, event.id, "route")}
    <article class="event-card panel">
      <div class="event-art event-art--${event.artKey.replace("event.", "")}" role="img" aria-label="${escapeText(event.title)}事件插圖"><span></span></div>
      ${event.urgent ? `<div class="event-urgency" role="status"><span>緊急事件</span><strong>警戒</strong></div>` : ""}
      <p class="event-id">${event.id}・${event.phase === "night" ? "夜間" : "行車"}</p>
      <h2>${escapeText(event.title)}</h2><p>${escapeText(event.body)}</p>
      <div class="event-choices">${event.choices.map((choice, index) => `<button class="choice-card ${index === 1 ? "is-selected" : ""}" data-action="event-choice" data-value="${choice.id}"><b>${choice.id}</b><span><strong>${escapeText(choice.label)}</strong><small>${escapeText(choice.cost)}　｜　${escapeText(choice.known)}</small></span></button>`).join("")}</div>
      <small class="hold-hint">長按可查看科技修正；選擇後立即結算</small>
    </article>
  </section>`;
}

function modulesScreen(state: AppState): string {
  const run = state.run;
  if (!run) return "";
  const selected = MODULES.find((module) => module.id === state.selectedModuleId) ?? MODULES[0];
  return `<section class="screen screen--modules" data-screen="SCR-MD-A">
    ${compactHeader(run, "建造與模組", `整備・剩餘 ${run.resources.parts} 零件`, "carriage")}
    <div class="bottom-sheet panel"><span class="drag-handle"></span><div class="category-tabs"><button class="is-selected">全部</button><button>防禦</button><button>生產</button><button>生活</button></div>
      <div class="module-grid">${MODULES.map((module) => `<button class="module-card ${module.id === state.selectedModuleId ? "is-selected" : ""}" data-action="select-module" data-value="${module.id}"><span>${module.slot === "window" ? icons.shield : module.slot === "floor" ? "暖" : module.slot === "wall" ? "芽" : "器"}</span><strong>${module.name}</strong><small>${module.slot}・零件 ${module.cost}</small></button>`).join("")}</div>
      ${selected ? `<article class="selected-module"><div><strong>${selected.name}</strong><small>${selected.description}</small></div><p>耗電 ${selected.activeCost}　｜　優先級 ${selected.priority}　｜　零件 ${selected.cost}</p>${button("build-module", "確認建造", { value: selected.id, primary: true, icon: icons.build, disabled: run.resources.parts < selected.cost })}</article>` : ""}
    </div>
  </section>`;
}

function techScreen(state: AppState): string {
  const run = state.run;
  if (!run) return "";
  const selected = TECH_NODES.find((node) => node.id === state.selectedTechId) ?? TECH_NODES[0];
  return `<section class="screen screen--tech" data-screen="SCR-TT-A">
    ${compactHeader(run, "科技樹", "協定資料解鎖永久規則", "hub")}
    <div class="protocol-data pill"><span>協定資料</span><strong>${run.resources.data}</strong></div>
    <div class="branch-tabs"><button class="is-selected">能源</button><button>居住</button><button>農業</button><button>防禦</button><button>情報</button></div>
    <div class="tech-tree panel"><svg viewBox="0 0 336 360"><path d="M42 64 L84 146 L168 222 L244 302"/><path d="M294 64 L252 146 L168 222"/><path d="M84 146 L252 146"/></svg>
      ${TECH_NODES.map((node, index) => { const positions = [[12, 15], [87, 15], [25, 38], [75, 38], [50, 62]]; const pos = positions[index] ?? [50, 50]; const owned = run.techOwned.includes(node.id); const available = node.prerequisite.every((id) => run.techOwned.includes(id)); return `<button class="tech-node ${owned ? "is-owned" : available ? "is-available" : "is-locked"} ${state.selectedTechId === node.id ? "is-selected" : ""}" style="--x:${pos[0]}%;--y:${pos[1]}%" data-action="select-tech" data-value="${node.id}"><span>${owned ? "✓" : node.id}</span><small>${node.name}</small></button>`; }).join("")}
    </div>
    ${selected ? `<article class="tech-detail panel"><div><strong>${selected.id}・${selected.name}</strong><span class="pill">${selected.branch}</span></div><p>${selected.description}</p><p>前置：${selected.prerequisite.length ? selected.prerequisite.join("＋") : "無"}　｜　成本 ${selected.cost}</p>${button("unlock-tech", run.techOwned.includes(selected.id) ? "已解鎖" : "解鎖節點", { value: selected.id, primary: !run.techOwned.includes(selected.id), icon: icons.tech, disabled: run.techOwned.includes(selected.id) })}</article>` : ""}
  </section>`;
}

function resultScreen(state: AppState): string {
  const run = state.run;
  if (!run) return "";
  const ending = run.phase === "ending" || run.ended;
  const finalNight = !ending && run.day >= run.maxDays;
  const recent = run.ledger.slice(-4);
  return `<section class="screen screen--result ${ending ? "is-ending" : ""}" data-screen="SCR-RS-${ending ? "B" : "A"}">
    ${compactHeader(run, ending ? "路線完成" : `第 ${run.day} 夜結算`, ending ? "灰霧線" : "自動存檔成功")}
    <article class="result-card panel">
      ${ending ? `<h1>改道</h1><p class="ending-copy">列車穿過封鎖線後沒有停下。A-07 將新的終點寫入守護協定，而你第一次選擇不服從舊座標。</p>` : `<div class="ring-row"><div class="ring-meter" style="--value:${run.survivor.sleep}"><span><strong>${run.survivor.sleep}</strong><small>睡眠</small></span></div><div class="ring-meter" style="--value:${run.environment.hull}"><span><strong>${run.environment.hull}%</strong><small>車體完整</small></span></div></div>`}
      <h2>${ending ? "達成條件" : "資源變化"}</h2>
      <div class="result-list">${ending ? `<div><span>信任</span><strong>${run.survivor.trust}/100</strong></div><div><span>感染</span><strong>${run.survivor.infection}/100</strong></div><div><span>終局選擇</span><strong>拒絕舊協定</strong></div>` : recent.map((entry) => `<div><span>${escapeText(LEDGER_LABELS[entry.key] ?? entry.key)}</span><strong class="${entry.delta < 0 ? "is-negative" : "is-positive"}">${formatSigned(entry.delta)}</strong><small>${escapeText(entry.source)}</small></div>`).join("")}</div>
      <p class="aftermath-note">${escapeText(run.lastMessage)}</p>
      ${button(ending ? "hub" : "next-day", ending ? "返回局外中心" : finalNight ? "查看路線結局" : `進入第 ${run.day + 1} 日整備`, { primary: true, icon: ending ? icons.hub : icons.play, detail: finalNight ? `完成 ${run.maxDays} 夜守望` : `協定資料 +${ending ? 4 : 1}` })}
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

  public constructor(private readonly root: HTMLElement, private readonly onAction: ActionHandler) {
    this.root.innerHTML = `<main class="game-shell"><div class="game-frame"><canvas id="scene-canvas" aria-hidden="true"></canvas><div id="ui-root"></div></div><p class="rotate-notice">請將裝置轉回直式，守護協定需要完整車廂視野。</p></main>`;
    this.canvas = this.root.querySelector<HTMLCanvasElement>("#scene-canvas")!;
    this.uiRoot = this.root.querySelector<HTMLDivElement>("#ui-root")!;
    this.uiRoot.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
      if (!target || target.matches(":disabled")) return;
      this.onAction(target.dataset.action ?? "", target.dataset.value);
    });
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
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
    this.root.style.setProperty("--text-scale", String(state.settings.textScale / 100));
    this.root.classList.toggle("reduce-motion", state.settings.reducedMotion);
    this.root.dataset.gameScreen = state.screen;
    this.root.dataset.phase = state.run?.phase ?? "none";
    this.root.dataset.contactStage = state.run?.activeContact?.stage ?? "idle";
  }
}
