import { EVENTS, TECH_NODES } from "./game/content";
import { AudioService } from "./game/audio";
import { createAppState, createRun } from "./game/model";
import { SceneRenderer } from "./game/renderer";
import { SaveService } from "./game/save";
import { RunService } from "./game/services";
import type { AppState, EventChoice, ModuleCategory, RationMode, ScreenId, TechBranch } from "./game/types";
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
    switch (action) {
      case "new-game":
        this.state.run = createRun();
        this.state.screen = "carriage";
        this.state.carriagePanel = "module";
        this.state.nightPaused = false;
        this.state.eventPreview = false;
        this.state.saveStatus = "saving";
        await this.persist();
        break;
      case "continue": {
        const loaded = await this.saveService.load();
        this.state.run = loaded.run;
        this.state.nightPaused = false;
        this.state.eventPreview = false;
        this.state.saveStatus = loaded.recovered ? "recovered" : "saved";
        this.state.screen = this.screenForPhase();
        break;
      }
      case "menu":
        this.state.screen = "menu";
        break;
      case "hub":
        if (!this.state.run) {
          const loaded = await this.saveService.load();
          this.state.run = loaded.run ?? createRun();
        }
        this.state.screen = "hub";
        this.state.eventPreview = false;
        break;
      case "settings":
        this.state.screen = "settings";
        break;
      case "carriage":
        if (run?.phase === "route") run.phase = "prep";
        this.state.screen = "carriage";
        break;
      case "pause":
        if (run?.phase === "night" && !this.state.settings.noCountdown) {
          this.state.nightPaused = !this.state.nightPaused;
          run.lastMessage = this.state.nightPaused ? "守夜倒數已暫停；方向警報仍保持顯示。" : "守夜倒數繼續。";
        }
        break;
      case "route":
        if (run && run.phase !== "night") {
          run.phase = "route";
          this.state.screen = "route";
        }
        break;
      case "modules":
        this.state.screen = "modules";
        break;
      case "tech":
        this.state.screen = "tech";
        break;
      case "event-preview":
        if (run) {
          this.state.eventPreview = true;
          this.state.screen = "event";
        }
        break;
      case "select-route":
        if (value) this.state.selectedRouteId = value;
        break;
      case "confirm-route":
        if (run && value) {
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
            clearInterval(this.nightTimer);
            this.state.nightPaused = false;
            this.state.screen = "result";
            if (this.state.settings.sound) this.audio.cue("safe");
            await this.persist();
          }
        }
        break;
      case "next-day":
        if (run) {
          this.runService.continueAftermath(run);
          this.state.screen = run.ended ? "result" : "carriage";
          this.state.carriagePanel = "module";
          this.state.nightPaused = false;
          await this.persist();
        }
        break;
      case "select-module":
        if (value) {
          this.state.selectedModuleId = value;
          this.state.carriagePanel = "module";
        }
        break;
      case "select-module-category":
        if (value && ["全部", "防禦", "生產", "生活"].includes(value)) this.state.moduleCategory = value as ModuleCategory;
        break;
      case "power":
        if (run?.phase === "prep") this.state.carriagePanel = "power";
        break;
      case "meal":
        if (run?.phase === "prep") this.state.carriagePanel = "meal";
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
        if (run && value && this.runService.buildModule(run, value)) {
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
      case "harvest":
        if (run) {
          this.runService.harvest(run);
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
    this.render();
  }

  private startNightTimer(): void {
    clearInterval(this.nightTimer);
    const interval = this.state.settings.lowSpeed ? 1333 : 1000;
    this.nightTimer = window.setInterval(() => {
      const run = this.state.run;
      if (!run || run.phase !== "night" || this.state.settings.noCountdown || this.state.nightPaused) return;
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
