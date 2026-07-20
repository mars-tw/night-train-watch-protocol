import { EVENTS } from "./game/content";
import { AudioService } from "./game/audio";
import { createAppState, createRun } from "./game/model";
import { SceneRenderer } from "./game/renderer";
import { SaveService } from "./game/save";
import { RunService } from "./game/services";
import type { AppState, EventChoice, ScreenId } from "./game/types";
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
        this.state.saveStatus = "saving";
        await this.persist();
        break;
      case "continue": {
        const loaded = await this.saveService.load();
        this.state.run = loaded.run;
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
        break;
      case "settings":
        this.state.screen = "settings";
        break;
      case "carriage":
        this.state.screen = "carriage";
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
          run.activeEventId = "EV004";
          this.state.screen = "event";
        }
        break;
      case "select-route":
        if (value) this.state.selectedRouteId = value;
        break;
      case "confirm-route":
        if (run && value) {
          this.runService.chooseRoute(run, value);
          if (run.phase === "travel") this.state.screen = "event";
          await this.persist();
        }
        break;
      case "event-choice":
        if (run && value) {
          const gameEvent = this.runService.getEvent(run);
          const choice = gameEvent?.choices.find((candidate) => candidate.id === value) as EventChoice | undefined;
          if (choice && this.runService.resolveEvent(run, choice)) {
            this.state.screen = "carriage";
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
          await this.persist();
        }
        break;
      case "select-module":
        if (value) this.state.selectedModuleId = value;
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
      case "unlock-tech":
        if (run && value) {
          this.runService.unlockTech(run, value);
          await this.persist();
        }
        break;
      case "harvest":
        if (run) {
          this.runService.applyResource(run, "food", 2, "module.M003.harvest");
          run.lastMessage = "收成 2 份葉菜；種植架進入下一輪生長。";
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
      if (!run || run.phase !== "night" || this.state.settings.noCountdown) return;
      this.runService.tickNight(run);
      const phaseAfterTick: string = run.phase;
      if (phaseAfterTick === "aftermath") {
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
    const activeEvent = this.state.run?.activeEventId ? EVENTS.find((event) => event.id === this.state.run?.activeEventId) : undefined;
    this.view.render(this.state, this.hasSave, activeEvent);
    this.renderer.render(this.state);
  }
}
