import { CARRIAGES, CROPS, DECORATIONS, EVENTS, TECH_NODES } from "./game/content";
import { AudioService } from "./game/audio";
import { createAppState, createRun } from "./game/model";
import { SceneRenderer } from "./game/renderer";
import { SaveService } from "./game/save";
import { RunService } from "./game/services";
import type { AppState, CarriageId, CropId, CropPlotId, DecorationId, EventChoice, FeedbackTone, ModuleCategory, RationMode, RunState, ScreenId, TechBranch } from "./game/types";
import { GameView } from "./ui/view";

export class NightTrainApp {
  private readonly state: AppState = createAppState();
  private readonly runService = new RunService();
  private readonly saveService = new SaveService();
  private readonly audio = new AudioService();
  private readonly view: GameView;
  private readonly renderer: SceneRenderer;
  private hasSave = false;
  private nightTimer = 0;

  public constructor(root: HTMLElement) {
    this.view = new GameView(root, (action, value) => void this.handleAction(action, value));
    this.renderer = new SceneRenderer(this.view.getCanvas());
  }

  public async start(): Promise<void> {
    this.hasSave = await this.saveService.hasSave();
    const savedSettings = this.saveService.loadSettings();
    if (savedSettings) this.state.settings = savedSettings;
    this.renderer.start();
    this.render();
    window.addEventListener("pagehide", () => void this.persist());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void this.persist();
    });
  }

  private async handleAction(action: string, value?: string): Promise<void> {
    await this.audio.enable();
    if (this.state.settings.sound) this.audio.cue("tap");
    const run = this.state.run;
    const ledgerStart = run?.ledger.length ?? 0;
    const actionPointsBefore = run?.actionPoints;
    this.state.actionFeedback = [];
    switch (action) {
      case "new-game":
        this.state.run = createRun();
        this.state.screen = "carriage";
        this.state.carriagePanel = "scene";
        this.state.nightPaused = false;
        this.state.eventPreview = false;
        this.state.routePreview = false;
        this.state.modulePreview = false;
        this.state.decorating = false;
        this.state.activeCarriageId = "greenhouse";
        this.state.saveStatus = "saving";
        await this.persist();
        break;
      case "continue": {
        const loaded = await this.saveService.load();
        this.state.run = loaded.run;
        this.state.nightPaused = false;
        this.state.eventPreview = false;
        this.state.routePreview = false;
        this.state.modulePreview = false;
        this.state.decorating = false;
        this.state.saveStatus = loaded.recovered ? "recovered" : "saved";
        this.state.screen = this.screenForPhase();
        break;
      }
      case "menu":
        this.state.screen = "menu";
        this.state.eventPreview = false;
        this.state.routePreview = false;
        this.state.modulePreview = false;
        this.state.decorating = false;
        break;
      case "hub":
        if (!this.state.run) {
          const loaded = await this.saveService.load();
          this.state.run = loaded.run ?? createRun();
        }
        this.state.screen = "hub";
        this.state.eventPreview = false;
        this.state.routePreview = false;
        this.state.modulePreview = false;
        this.state.decorating = false;
        break;
      case "settings":
        this.state.screen = "settings";
        break;
      case "carriage":
        if (run?.phase === "route" && !this.state.routePreview) run.phase = "prep";
        this.state.screen = "carriage";
        this.state.carriagePanel = "scene";
        this.state.routePreview = false;
        this.state.modulePreview = false;
        this.state.decorating = false;
        break;
      case "pause":
        if (run?.phase === "night" && !this.state.settings.noCountdown) {
          this.state.nightPaused = !this.state.nightPaused;
          run.lastMessage = this.state.nightPaused ? "守夜倒數已暫停；方向警報仍保持顯示。" : "守夜倒數繼續。";
        }
        break;
      case "route":
        if (run && run.phase !== "night") {
          this.state.decorating = false;
          this.state.routePreview = this.state.screen === "hub" || run.ended;
          this.state.modulePreview = false;
          if (!this.state.routePreview) run.phase = "route";
          this.state.screen = "route";
        }
        break;
      case "modules":
        this.state.decorating = false;
        this.state.modulePreview = false;
        this.state.routePreview = false;
        this.state.screen = "modules";
        break;
      case "modules-preview":
        if (run) {
          this.state.decorating = false;
          this.state.modulePreview = true;
          this.state.routePreview = false;
          this.state.screen = "modules";
        }
        break;
      case "tech":
        this.state.decorating = false;
        this.state.routePreview = false;
        this.state.modulePreview = false;
        this.state.screen = "tech";
        break;
      case "event-preview":
        if (run) {
          this.state.decorating = false;
          this.state.eventPreview = true;
          this.state.routePreview = false;
          this.state.modulePreview = false;
          this.state.screen = "event";
        }
        break;
      case "select-route":
        if (value) this.state.selectedRouteId = value;
        break;
      case "confirm-route":
        if (run && value && !this.state.routePreview) {
          this.runService.chooseRoute(run, value);
          if (run.phase === "travel") {
            this.state.eventPreview = false;
            this.state.screen = "event";
          }
          await this.persist();
        }
        break;
      case "event-choice":
        if (run && value && !this.state.eventPreview) {
          const gameEvent = this.runService.getEvent(run);
          const choice = gameEvent?.choices.find((candidate) => candidate.id === value) as EventChoice | undefined;
          if (choice && this.runService.resolveEvent(run, choice)) {
            this.state.screen = "carriage";
            this.state.activeCarriageId = "defense";
            this.state.nightPaused = false;
            this.startNightTimer();
            if (this.state.settings.sound) this.audio.cue("warning");
            await this.persist();
          }
        }
        break;
      case "counter":
        if (run && value) {
          const resolved = this.runService.counterThreat(run, value);
          if (resolved) {
            this.state.nightPaused = false;
            if (run.phase === "night") {
              if (this.state.settings.sound) this.audio.cue("warning");
            } else {
              clearInterval(this.nightTimer);
              this.state.screen = "result";
              if (this.state.settings.sound) this.audio.cue("safe");
            }
            await this.persist();
          }
        }
        break;
      case "next-day":
        if (run) {
          this.runService.continueAftermath(run);
          this.state.screen = run.ended ? "result" : "carriage";
          this.state.carriagePanel = "scene";
          this.state.decorating = false;
          this.state.activeCarriageId = "greenhouse";
          this.state.nightPaused = false;
          await this.persist();
        }
        break;
      case "select-module":
        if (value) {
          this.state.decorating = false;
          this.state.selectedModuleId = value;
          this.state.carriagePanel = "scene";
        }
        break;
      case "select-module-category":
        if (value && ["全部", "防禦", "生產", "生活"].includes(value)) this.state.moduleCategory = value as ModuleCategory;
        break;
      case "power":
        if (run?.phase === "prep") {
          const closing = this.state.carriagePanel === "power" && !this.state.decorating;
          this.state.decorating = false;
          this.state.carriagePanel = closing ? "scene" : "power";
          run.lastMessage = closing ? "配電工具已收起，繼續查看車廂。" : "配電工具已打開；再次點擊「配電」可收起。";
        }
        break;
      case "meal":
        if (run?.phase === "prep") {
          const closing = this.state.carriagePanel === "meal" && !this.state.decorating;
          this.state.decorating = false;
          this.state.carriagePanel = closing ? "scene" : "meal";
          if (!closing) this.state.activeCarriageId = "kitchen";
          run.lastMessage = closing ? "配餐工具已收起，繼續查看炊事車廂。" : "配餐工具已打開；再次點擊「配餐」可收起。";
        }
        break;
      case "select-carriage":
        if (run?.phase === "prep" && value && CARRIAGES.some((carriage) => carriage.id === value)) {
          this.state.activeCarriageId = value as CarriageId;
          this.state.carriagePanel = "scene";
          if (!run.flags.includes("carriage-nav-seen")) run.flags.push("carriage-nav-seen");
          const carriage = CARRIAGES.find((item) => item.id === value)!;
          run.lastMessage = `已切換到${carriage.name}：${carriage.signature}。`;
        }
        break;
      case "swipe-carriage":
        if (run?.phase === "prep" && (value === "next" || value === "previous")) {
          const currentIndex = CARRIAGES.findIndex((carriage) => carriage.id === this.state.activeCarriageId);
          const nextIndex = currentIndex + (value === "next" ? 1 : -1);
          if (nextIndex < 0 || nextIndex >= CARRIAGES.length) {
            run.lastMessage = nextIndex < 0 ? "已到列車前端；往左滑可返回後方車廂。" : "已到列車尾端；往右滑可返回前方車廂。";
          } else {
            const carriage = CARRIAGES[nextIndex]!;
            this.state.activeCarriageId = carriage.id;
            this.state.carriagePanel = "scene";
            this.state.decorating = false;
            run.lastMessage = `滑入${carriage.name}：${carriage.role}。`;
          }
          if (!run.flags.includes("carriage-nav-seen")) run.flags.push("carriage-nav-seen");
        }
        break;
      case "decorate":
        if (run?.phase === "prep") {
          this.state.decorating = !this.state.decorating;
          this.state.carriagePanel = "scene";
          run.lastMessage = this.state.decorating ? "先選小物，再點相容槽；也可把場景中的小物拖到綠色槽位。" : "佈置工具已收起，小物會保留在車廂裡。";
        }
        break;
      case "select-decoration":
        if (run?.phase === "prep" && value && DECORATIONS.some((decoration) => decoration.id === value)) {
          this.state.selectedDecorationId = value as DecorationId;
          this.state.decorating = true;
          const decoration = DECORATIONS.find((item) => item.id === value)!;
          run.lastMessage = `${decoration.name}已選取；綠色槽可放、紅色斜線槽不相容。`;
        }
        break;
      case "move-decoration":
        if (run?.phase === "prep" && value) {
          const [id, slotId] = value.split(":");
          if (DECORATIONS.some((decoration) => decoration.id === id)) {
            this.state.selectedDecorationId = id as DecorationId;
            this.state.decorating = true;
            if (this.runService.moveDecoration(run, id as DecorationId, slotId ?? "")) await this.persist();
          }
        }
        break;
      case "place-decoration":
        if (run?.phase === "prep" && value) {
          const [id, slotId] = value.split(":");
          if (DECORATIONS.some((decoration) => decoration.id === id)) {
            this.state.selectedDecorationId = id as DecorationId;
            this.state.decorating = true;
            if (this.runService.moveDecoration(run, id as DecorationId, slotId ?? "")) await this.persist();
          }
        }
        break;
      case "reset-decor":
        if (run?.phase === "prep") {
          this.runService.resetDecorations(run);
          this.state.selectedDecorationId = "lantern";
          await this.persist();
        }
        break;
      case "finish-decor":
        if (run?.phase === "prep") {
          this.state.decorating = false;
          run.lastMessage = "五種車廂的槽位佈置已保存；守夜時會保留各自配置。";
          await this.persist();
        }
        break;
      case "toggle-module":
      case "toggle-power":
        if (run && value) {
          this.runService.toggleModule(run, value);
          await this.persist();
        }
        break;
      case "select-ration":
        if (run && value && ["full", "standard", "strict"].includes(value)) {
          this.runService.setRation(run, value as RationMode);
          await this.persist();
        }
        break;
      case "build-module":
        if (run && value && !this.state.modulePreview && this.runService.buildModule(run, value)) {
          this.state.screen = "carriage";
          await this.persist();
        }
        break;
      case "select-tech":
        if (value) this.state.selectedTechId = value;
        break;
      case "select-tech-branch":
        if (value && ["能源", "居住", "農業", "防禦", "情報"].includes(value)) {
          this.state.techBranch = value as TechBranch;
          const firstNode = TECH_NODES.find((node) => node.branch === value);
          if (firstNode) this.state.selectedTechId = firstNode.id;
        }
        break;
      case "unlock-tech":
        if (run && value) {
          this.runService.unlockTech(run, value);
          await this.persist();
        }
        break;
      case "select-crop":
        if (value && CROPS.some((crop) => crop.id === value)) this.state.selectedCropId = value as CropId;
        break;
      case "plant-crop":
        if (run && value) {
          const [plotId, cropId] = value.split(":");
          if (["plot-a", "plot-b"].includes(plotId ?? "") && CROPS.some((crop) => crop.id === cropId)) {
            this.runService.plantCrop(run, plotId as CropPlotId, cropId as CropId);
            await this.persist();
          }
        }
        break;
      case "water-crops":
        if (run) {
          this.runService.waterCrops(run);
          await this.persist();
        }
        break;
      case "harvest-crop":
        if (run && value && ["plot-a", "plot-b"].includes(value)) {
          this.runService.harvestCrop(run, value as CropPlotId);
          await this.persist();
        }
        break;
      case "workshop-scrap":
        if (run) {
          this.runService.collectWorkshopScrap(run);
          await this.persist();
        }
        break;
      case "cook-meal":
        if (run) {
          this.runService.cookHotMeal(run);
          await this.persist();
        }
        break;
      case "comfort":
        if (run) {
          this.runService.comfortPassenger(run);
          await this.persist();
        }
        break;
      case "repair-hull":
        if (run) {
          this.runService.repairCarriage(run);
          await this.persist();
        }
        break;
      case "cycle-text":
        this.state.settings.textScale = this.state.settings.textScale === 100 ? 120 : this.state.settings.textScale === 120 ? 140 : 100;
        this.persistSettings();
        break;
      case "toggle-motion":
        this.state.settings.reducedMotion = !this.state.settings.reducedMotion;
        this.persistSettings();
        break;
      case "toggle-countdown":
        this.state.settings.noCountdown = !this.state.settings.noCountdown;
        this.persistSettings();
        break;
      case "toggle-speed":
        this.state.settings.lowSpeed = !this.state.settings.lowSpeed;
        this.persistSettings();
        break;
      case "toggle-sound":
        this.state.settings.sound = !this.state.settings.sound;
        this.persistSettings();
        break;
      default:
        break;
    }
    const currentRun = this.state.run;
    if (run && currentRun === run) this.captureActionFeedback(run, ledgerStart, actionPointsBefore);
    this.render();
  }

  private captureActionFeedback(run: RunState, ledgerStart: number, actionPointsBefore?: number): void {
    const combined = new Map<string, number>();
    if (typeof actionPointsBefore === "number" && actionPointsBefore !== run.actionPoints) combined.set("AP", run.actionPoints - actionPointsBefore);
    for (const entry of run.ledger.slice(ledgerStart)) combined.set(entry.key, (combined.get(entry.key) ?? 0) + entry.delta);
    const labels: Record<string, string> = {
      energy: "電", fuel: "燃", food: "食", water: "水", parts: "零", medicine: "藥", data: "資",
      health: "健", stress: "壓", infection: "染", trust: "信", sleep: "眠", wakeups: "醒",
      temperature: "溫", noise: "噪", visibility: "視", hull: "體", weight: "重",
    };
    const reliefKeys = new Set(["stress", "infection", "noise", "wakeups", "weight"]);
    this.state.actionFeedback = [...combined.entries()]
      .filter(([, delta]) => delta !== 0)
      .slice(0, 3)
      .map(([key, delta]) => {
        let tone: FeedbackTone = "neutral";
        if (key === "AP") tone = "cost";
        else if (reliefKeys.has(key)) tone = delta < 0 ? "relief" : "cost";
        else if (key !== "temperature" && key !== "visibility") tone = delta > 0 ? "gain" : "cost";
        return { label: labels[key] ?? key, delta, tone };
      });
  }

  private startNightTimer(): void {
    clearInterval(this.nightTimer);
    const interval = this.state.settings.lowSpeed ? 1333 : 1000;
    this.nightTimer = window.setInterval(() => {
      const run = this.state.run;
      if (!run || run.phase !== "night" || this.state.settings.noCountdown || this.state.nightPaused) return;
      this.state.actionFeedback = [];
      this.runService.tickNight(run);
      const phaseAfterTick: string = run.phase;
      if (phaseAfterTick === "aftermath" || phaseAfterTick === "ending") {
        clearInterval(this.nightTimer);
        this.state.screen = "result";
        if (this.state.settings.sound) this.audio.cue("breach");
        void this.persist();
      }
      this.render();
    }, interval);
  }

  private screenForPhase(): ScreenId {
    const run = this.state.run;
    if (!run) return "menu";
    if (run.phase === "route") return "route";
    if (run.phase === "travel" && run.activeEventId) return "event";
    if (run.phase === "aftermath" || run.phase === "ending") return "result";
    if (run.phase === "night") this.startNightTimer();
    return "carriage";
  }

  private async persist(): Promise<void> {
    if (!this.state.run) return;
    try {
      this.state.saveStatus = "saving";
      await this.saveService.save(this.state.run);
      this.hasSave = true;
      this.state.saveStatus = "saved";
    } catch {
      this.state.saveStatus = "error";
    }
  }

  private persistSettings(): void {
    this.saveService.saveSettings(this.state.settings);
  }

  private render(): void {
    const activeEvent = this.state.eventPreview ? EVENTS.find((event) => event.id === "EV004") : this.state.run?.activeEventId ? EVENTS.find((event) => event.id === this.state.run?.activeEventId) : undefined;
    this.view.render(this.state, this.hasSave, activeEvent);
    this.renderer.render(this.state);
  }
}
