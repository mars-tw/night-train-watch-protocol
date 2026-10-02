import {
  CARRIAGES,
  CROPS,
  DECORATIONS,
  EVENTS,
  MODULES,
  STORY_ROUTE_RUNTIME_POLICIES,
  TECH_NODES,
} from "./game/content";
import {
  claimQuestRewards,
  settleQuestDay,
  toggleQuestTracking,
} from "./game/quests";
import {
  FACILITY_UPGRADES,
  REFILL_ACTIONS,
  RELATIONSHIPS,
} from "./game/voyage/content";
import { AudioService } from "./game/audio";
import { createAppState, createRun } from "./game/model";
import { recordRunOutcome } from "./game/profile";
import {
  prepareProfileLoadoutSelection,
  type ProfileLoadoutKind,
} from "./game/profile-loadouts";
import {
  deriveGameplayEffects,
  getModuleBuildPartsCost,
  getRepairHullAmount,
} from "./game/module-effects";
import { getFacilityEffects } from "./game/facility-slots";
import { SceneRenderer } from "./game/renderer";
import { SaveService } from "./game/save";
import { RunService } from "./game/services";
import type {
  AppState,
  CarriageId,
  CropId,
  CropPlotId,
  DecorationId,
  EventChoice,
  FeedbackTone,
  GreenCycleCommand,
  ModuleCategory,
  RationMode,
  RunState,
  ScreenId,
  StoryRouteId,
  TechBranch,
  ThermalCommand,
  ThreatInteractionCommand,
} from "./game/types";
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
  private actionInFlight = false;

  public constructor(root: HTMLElement) {
    this.view = new GameView(
      root,
      (action, value) => void this.handleAction(action, value),
    );
    this.renderer = new SceneRenderer(this.view.getCanvas());
  }

  public async start(): Promise<void> {
    this.hasSave = await this.saveService.hasSave();
    this.state.profile = await this.saveService.loadProfile();
    const savedSettings = this.saveService.loadSettings();
    if (savedSettings) this.state.settings = savedSettings;
    this.renderer.start();
    this.render();
    window.addEventListener("pagehide", () => {
      // An in-flight transaction owns its save. A second pagehide write could
      // otherwise overwrite a freshly claimed profile with the pre-action copy.
      if (!this.actionInFlight) void this.persist();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        if (this.state.run?.phase === "night") {
          this.state.nightPaused = true;
          this.state.run.lastMessage =
            "守夜已暫停並保存。回到列車後，請手動繼續。";
        }
        if (!this.actionInFlight) void this.persist();
      } else {
        this.render();
      }
    });
  }

  private async handleAction(action: string, value?: string): Promise<void> {
    if (this.actionInFlight) return;
    this.actionInFlight = true;
    try {
      await this.audio.enable();
      const run = this.state.run;
      // Keep this expression explicit: T006 is the GDD's intentionally silent encounter.
      const silentThreatAction = action === "threat-interact" && run?.activeContact?.definitionId === "T006";
      if (this.state.settings.sound && !silentThreatAction)
        this.audio.cue("tap");
      const ledgerStart = run?.ledger.length ?? 0;
      const actionPointsBefore = run?.actionPoints;
      this.state.actionFeedback = [];
      switch (action) {
        case "new-game":
          {
            const routeId: StoryRouteId =
              value === "R02" || value === "R03" ? value : "R01";
            const createdRun = createRun(undefined, routeId, this.state.profile);
            this.runService.enterStoryPhase(createdRun, "prep");
            this.state.run = createdRun;
            this.state.activeCarriageId =
              STORY_ROUTE_RUNTIME_POLICIES[routeId].initialCarriageId;
          }
          this.state.screen = this.state.run?.activeEventId
            ? "event"
            : "carriage";
          this.state.carriagePanel = "scene";
          this.state.nightPaused = false;
          this.state.eventPreview = false;
          this.state.routePreview = false;
          this.state.modulePreview = false;
          this.state.decorating = false;
          this.state.objectPreview = null;
          this.state.questFilter = "all";
          this.state.journalPage = 0;
          this.state.saveStatus = "saving";
          await this.persist();
          break;
        case "continue": {
          const loaded = await this.saveService.load();
          this.state.run = loaded.run;
          this.state.profile = loaded.profile;
          if (loaded.run) {
            this.runService.ensureThreatInteraction(loaded.run);
            if (loaded.run.phase === "prep")
              this.runService.enterStoryPhase(loaded.run, "prep");
            if (loaded.run.phase === "route")
              this.runService.enterStoryPhase(loaded.run, "route");
          }
          this.state.nightPaused = false;
          this.state.eventPreview = false;
          this.state.routePreview = false;
          this.state.modulePreview = false;
          this.state.decorating = false;
          this.state.objectPreview = null;
          this.state.saveStatus = loaded.recovered ? "recovered" : "saved";
          if (loaded.run) {
            this.state.activeCarriageId =
              STORY_ROUTE_RUNTIME_POLICIES[
                loaded.run.routeId
              ].initialCarriageId;
            if (this.state.settings.noCountdown)
              this.runService.enableNoCountdownFallback(loaded.run);
          }
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
            this.state.profile = loaded.profile;
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
        case "missions":
          if (!this.state.run) {
            const loaded = await this.saveService.load();
            this.state.run = loaded.run ?? createRun();
            this.state.profile = loaded.profile;
          }
          this.state.questFilter =
            this.state.questFilter === "profile"
              ? "all"
              : this.state.questFilter || "all";
          this.state.journalPage = 0;
          this.state.screen = "missions";
          break;
        case "profile":
          if (!this.state.run) {
            const loaded = await this.saveService.load();
            this.state.run = loaded.run ?? createRun();
            this.state.profile = loaded.profile;
          }
          this.state.questFilter = "profile";
          this.state.journalPage = 0;
          this.state.screen = "missions";
          break;
        case "set-mission-view":
          this.state.questFilter = value === "profile" ? "profile" : "all";
          this.state.journalPage = 0;
          break;
        case "select-profile-loadout":
          if (run && value) {
            const [kindValue, idValue] = value.split("|");
            if (kindValue === "blueprint" || kindValue === "cosmetic") {
              const kind = kindValue as ProfileLoadoutKind;
              const draft = prepareProfileLoadoutSelection(
                this.state.profile,
                kind,
                idValue === "standard" ? undefined : idValue,
              );
              if (draft.status === "prepared") {
                try {
                  this.state.saveStatus = "saving";
                  await this.saveService.save(run, draft.profile);
                  this.state.profile = draft.profile;
                  this.state.saveStatus = "saved";
                  this.hasSave = true;
                } catch {
                  this.state.saveStatus = "error";
                }
              }
            }
          }
          break;
        case "set-quest-filter":
          if (
            value &&
            [
              "all",
              "main",
              "tutorial",
              "relationship",
              "facility",
              "exploration",
              "challenge",
              "completed",
            ].includes(value)
          ) {
            this.state.questFilter = value;
            this.state.journalPage = 0;
          }
          break;
        case "quest-page":
          this.state.journalPage = Math.max(
            0,
            (this.state.journalPage ?? 0) + (value === "previous" ? -1 : 1),
          );
          break;
        case "toggle-quest-tracking":
          if (run && value) {
            const changed = toggleQuestTracking(run, value);
            run.lastMessage = changed
              ? run.quests.trackedMissionIds.includes(value)
                ? "任務已釘在車廂畫面；釘選不扣 AP 或物資。"
                : "已取消釘選，任務進度仍會保留。"
              : run.quests.trackedMissionIds.length >= 2
                ? "一次最多釘選 2 項任務。"
                : "這項任務目前不能釘選。";
            if (changed) await this.persist();
          }
          break;
        case "claim-quest-rewards":
          if (run && value) {
            const draft = claimQuestRewards(run, this.state.profile, value);
            if (draft.status === "prepared") {
              try {
                this.state.saveStatus = "saving";
                await this.saveService.save(draft.run, draft.profile);
                this.state.run = draft.run;
                this.state.profile = draft.profile;
                this.state.saveStatus = "saved";
                this.hasSave = true;
                this.state.run.lastMessage =
                  "任務成果已保存到旅程檔案。";
              } catch {
                this.state.saveStatus = "error";
                run.lastMessage =
                  "保存失敗，這次沒有領取成果；請清出儲存空間後重試。";
              }
            } else if (draft.status === "noop") {
              run.lastMessage = "這項任務成果已經領取。";
            } else {
              run.lastMessage = "任務尚未完成，現在不能領取成果。";
            }
          }
          break;
        case "carriage":
          if (
            run?.activeEventId &&
            "forced" in (this.runService.getEvent(run) ?? {})
          ) {
            this.state.screen = "event";
            break;
          }
          if (run?.phase === "route" && !this.state.routePreview)
            run.phase = "prep";
          this.state.screen = "carriage";
          this.state.carriagePanel = "scene";
          this.state.routePreview = false;
          this.state.modulePreview = false;
          this.state.decorating = false;
          break;
        case "pause":
          if (run?.phase === "night" && !this.state.settings.noCountdown) {
            this.state.nightPaused = !this.state.nightPaused;
            run.lastMessage = this.state.nightPaused
              ? "守夜倒數已暫停；方向警報仍保持顯示。"
              : "守夜倒數繼續。";
          }
          break;
        case "route":
          if (run && run.phase !== "night") {
            if (
              run.activeEventId &&
              "forced" in (this.runService.getEvent(run) ?? {})
            ) {
              this.state.screen = "event";
              break;
            }
            this.state.decorating = false;
            this.state.routePreview = this.state.screen === "hub" || run.ended;
            this.state.modulePreview = false;
            if (!this.state.routePreview) {
              run.phase = "route";
              this.runService.enterStoryPhase(run, "route");
            }
            this.state.screen = run.activeEventId ? "event" : "route";
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
            if (run.activeEventId) {
              this.state.eventPreview = false;
              this.state.screen = "event";
            }
            await this.persist();
          }
          break;
        case "start-expedition":
          if (run && this.runService.startExpedition(run)) await this.persist();
          break;
        case "choose-expedition-step":
          if (
            run &&
            value &&
            this.runService.chooseExpeditionStep(run, value)
          )
            await this.persist();
          break;
        case "withdraw-expedition":
          if (run && this.runService.withdrawExpedition(run))
            await this.persist();
          break;
        case "upgrade-facility":
          if (run && value) {
            const [facilityId, branchId] = value.split(":");
            if (
              facilityId &&
              branchId &&
              this.runService.upgradeFacility(run, facilityId, branchId)
            )
              await this.persist();
          }
          break;
        case "choose-relationship":
          if (run && value) {
            const [characterId, choiceId] = value.split(":");
            if (
              characterId &&
              choiceId &&
              this.runService.chooseRelationship(run, characterId, choiceId)
            ) {
              this.state.objectPreview = null;
              await this.persist();
            }
          }
          break;
        case "emergency-route":
          if (
            run &&
            !this.state.routePreview &&
            this.runService.emergencyRoute(run)
          ) {
            this.state.eventPreview = false;
            this.state.screen = this.screenForPhase();
            await this.persist();
          }
          break;
        case "event-choice":
          if (run && value && !this.state.eventPreview) {
            const gameEvent = this.runService.getEvent(run);
            const choice = gameEvent?.choices.find(
              (candidate) => candidate.id === value,
            ) as EventChoice | undefined;
            if (choice && this.runService.resolveEvent(run, choice)) {
              this.state.screen = this.screenForPhase();
              this.state.nightPaused = false;
              if (
                run.phase === "prep" &&
                run.routeId === "R02" &&
                run.day === 7 &&
                !run.activeEventId
              ) {
                this.state.carriagePanel = "power";
              } else if (run.phase === "night") {
                this.state.activeCarriageId =
                  run.routeId === "R03" ? "greenhouse" : "defense";
                if (this.state.settings.noCountdown)
                  this.runService.enableNoCountdownFallback(run);
                this.startNightTimer();
                if (this.state.settings.sound) this.audio.cue("warning");
              } else if (run.phase === "ending" && this.state.settings.sound) {
                this.audio.cue("safe");
              }
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
                if (
                  this.state.settings.sound &&
                  run.activeContact?.definitionId !== "T006"
                )
                  this.audio.cue("warning");
              } else {
                clearInterval(this.nightTimer);
                this.state.screen = this.screenForPhase();
                if (this.state.settings.sound) this.audio.cue("safe");
              }
              await this.persist();
            }
          }
          break;
        case "threat-interact":
          if (run && value) {
            if (this.state.settings.noCountdown)
              this.runService.enableNoCountdownFallback(run);
            const resolvedThreatId = run.activeContact?.definitionId;
            const result = this.runService.interactThreat(
              run,
              value as ThreatInteractionCommand,
            );
            if (result.accepted) await this.persist();
            if (result.resolved) {
              this.state.nightPaused = false;
              if (run.phase === "night") {
                if (
                  this.state.settings.sound &&
                  run.activeContact?.definitionId !== "T006"
                )
                  this.audio.cue("warning");
              } else {
                clearInterval(this.nightTimer);
                this.state.screen = this.screenForPhase();
                if (this.state.settings.sound && resolvedThreatId !== "T006")
                  this.audio.cue("safe");
              }
            }
          }
          break;
        case "thermal-select":
          if (run?.story.whiteFrost && value && /^H[1-6]$/.test(value)) {
            const result = this.runService.applyThermalCommand(
              run,
              `thermal:select:${value}` as ThermalCommand,
            );
            if (result.accepted) await this.persist();
          }
          break;
        case "thermal-target":
          if (
            run?.story.whiteFrost &&
            value &&
            ["BERTH", "DEICER", "LOOP"].includes(value)
          ) {
            const result = this.runService.applyThermalCommand(
              run,
              `thermal:target:${value}` as ThermalCommand,
            );
            if (result.accepted) await this.persist();
          }
          break;
        case "thermal-move":
          if (run?.story.whiteFrost && value) {
            const [tokenId, zone] = value.split(":");
            if (
              /^H[1-6]$/.test(tokenId ?? "") &&
              ["BERTH", "DEICER", "LOOP"].includes(zone ?? "")
            ) {
              const result = this.runService.applyThermalCommand(
                run,
                `thermal:move:${tokenId}:${zone}` as ThermalCommand,
              );
              if (result.accepted) await this.persist();
            }
          }
          break;
        case "thermal-reset":
        case "thermal-commit":
          if (run?.story.whiteFrost) {
            const result = this.runService.applyThermalCommand(
              run,
              `thermal:${action === "thermal-reset" ? "reset" : "commit"}` as ThermalCommand,
            );
            if (result.accepted) {
              if (
                action === "thermal-commit" &&
                run.phase === "travel" &&
                run.activeEventId
              ) {
                this.state.carriagePanel = "scene";
                this.state.screen = this.screenForPhase();
              }
              await this.persist();
            }
          }
          break;
        case "cycle-select":
          if (run?.story.greenTide && value && /^S[1-4]$/.test(value)) {
            const result = this.runService.applyGreenCycleCommand(
              run,
              `cycle:select:${value}` as GreenCycleCommand,
            );
            if (result.accepted) await this.persist();
          }
          break;
        case "cycle-inspect":
          if (run?.story.greenTide && value && /^S[1-4]$/.test(value)) {
            const result = this.runService.applyGreenCycleCommand(
              run,
              `cycle:inspect:${value}` as GreenCycleCommand,
            );
            if (result.accepted) await this.persist();
          }
          break;
        case "cycle-target":
          if (
            run?.story.greenTide &&
            value &&
            ["INTAKE", "FILTER", "GROW_A", "GROW_B", "DRAIN"].includes(value)
          ) {
            const result = this.runService.applyGreenCycleCommand(
              run,
              `cycle:target:${value}` as GreenCycleCommand,
            );
            if (result.accepted) await this.persist();
          }
          break;
        case "cycle-move":
          if (run?.story.greenTide && value) {
            const [sampleId, zone] = value.split(":");
            if (
              /^S[1-4]$/.test(sampleId ?? "") &&
              ["INTAKE", "FILTER", "GROW_A", "GROW_B", "DRAIN"].includes(
                zone ?? "",
              )
            ) {
              const result = this.runService.applyGreenCycleCommand(
                run,
                `cycle:move:${sampleId}:${zone}` as GreenCycleCommand,
              );
              if (result.accepted) await this.persist();
            }
          }
          break;
        case "cycle-reset":
        case "cycle-commit":
        case "cycle-manual-drain":
          if (run?.story.greenTide) {
            const command: GreenCycleCommand =
              action === "cycle-reset"
                ? "cycle:reset"
                : action === "cycle-commit"
                  ? "cycle:commit"
                  : "cycle:manual-drain";
            const result = this.runService.applyGreenCycleCommand(run, command);
            if (result.accepted) await this.persist();
          }
          break;
        case "arm-threat-tool":
          // GameView owns the transient cutter selection/drag state.
          break;
        case "next-day":
          if (run) {
            settleQuestDay(run);
            this.runService.continueAftermath(run);
            this.state.screen = this.screenForPhase();
            this.state.carriagePanel = "scene";
            this.state.decorating = false;
            this.state.activeCarriageId =
              STORY_ROUTE_RUNTIME_POLICIES[run.routeId].initialCarriageId;
            this.state.nightPaused = false;
            await this.persist();
          }
          break;
        case "preview-action":
          if (run && value) {
            const separator = value.indexOf("|");
            const operation = separator >= 0 ? value.slice(0, separator) : value;
            const operationValue = separator >= 0 ? value.slice(separator + 1) : undefined;
            this.state.objectPreview = this.describeObjectAction(
              run,
              operation,
              operationValue || undefined,
            );
          }
          break;
        case "cancel-object-action":
          this.state.objectPreview = null;
          break;
        case "confirm-object-action":
          if (run && this.state.objectPreview) {
            const preview = this.state.objectPreview;
            this.state.objectPreview = null;
            await this.executeObjectAction(run, preview.action, preview.value);
          }
          break;
        case "inspect-object":
          if (run) {
            this.runService.inspectObject(run, value);
            await this.persist();
          }
          break;
        case "open-relationship":
          if (run && (value === "A-07" || value === "xu")) {
            this.state.objectPreview = {
              action: "relationship-panel",
              value,
              title: value === "A-07" ? "回應 A-07" : "回應老許",
              costs: "查看與稍後再說都不消耗 AP",
            };
          }
          break;
        case "open-refill":
          if (run && (value === "workshop" || value === "kitchen")) {
            this.state.objectPreview = {
              action: "refill-panel",
              value,
              title: value === "workshop" ? "工坊補電" : "廚房補給",
              costs: "查看與關閉面板不會扣 AP 或物資",
            };
          }
          break;
        case "refill-supplies":
          if (run && value && this.runService.refillSupplies(run, value))
            await this.persist();
          break;
        case "use-medicine":
          if (run && this.runService.useMedicine(run)) await this.persist();
          break;
        case "select-module":
          if (value) {
            this.state.decorating = false;
            this.state.selectedModuleId = value;
            this.state.carriagePanel = "scene";
          }
          break;
        case "select-module-category":
          if (value && ["全部", "防禦", "生產", "生活"].includes(value))
            this.state.moduleCategory = value as ModuleCategory;
          break;
        case "power":
          if (run?.phase === "prep") {
            const closing =
              this.state.carriagePanel === "power" && !this.state.decorating;
            this.state.decorating = false;
            this.state.carriagePanel = closing ? "scene" : "power";
            const frostTool = run.routeId === "R02";
            run.lastMessage = closing
              ? `${frostTool ? "熱力分流板" : "配電工具"}已收起，繼續查看車廂。`
              : frostTool
                ? "熱力分流板已打開；六枚單元可拖曳，也可先點單元再點區域。"
                : "配電工具已打開；再次點擊「配電」可收起。";
          }
          break;
        case "meal":
          if (run?.phase === "prep") {
            const closing =
              this.state.carriagePanel === "meal" && !this.state.decorating;
            this.state.decorating = false;
            this.state.carriagePanel = closing ? "scene" : "meal";
            if (!closing) this.state.activeCarriageId = "kitchen";
            run.lastMessage = closing
              ? "配餐工具已收起，繼續查看炊事車廂。"
              : "配餐工具已打開；再次點擊「配餐」可收起。";
          }
          break;
        case "select-carriage":
          if (
            run?.phase === "prep" &&
            value &&
            CARRIAGES.some((carriage) => carriage.id === value)
          ) {
            this.state.activeCarriageId = value as CarriageId;
            this.state.carriagePanel = "scene";
            if (!run.flags.includes("carriage-nav-seen"))
              run.flags.push("carriage-nav-seen");
            const carriage = CARRIAGES.find((item) => item.id === value)!;
            run.lastMessage = `已切換到${carriage.name}：${carriage.signature}。`;
          }
          break;
        case "swipe-carriage":
          if (
            run?.phase === "prep" &&
            (value === "next" || value === "previous")
          ) {
            const currentIndex = CARRIAGES.findIndex(
              (carriage) => carriage.id === this.state.activeCarriageId,
            );
            const nextIndex = currentIndex + (value === "next" ? 1 : -1);
            if (nextIndex < 0 || nextIndex >= CARRIAGES.length) {
              run.lastMessage =
                nextIndex < 0
                  ? "已到列車前端；往左滑可返回後方車廂。"
                  : "已到列車尾端；往右滑可返回前方車廂。";
            } else {
              const carriage = CARRIAGES[nextIndex]!;
              this.state.activeCarriageId = carriage.id;
              this.state.carriagePanel = "scene";
              this.state.decorating = false;
              run.lastMessage = `滑入${carriage.name}：${carriage.role}。`;
            }
            if (!run.flags.includes("carriage-nav-seen"))
              run.flags.push("carriage-nav-seen");
          }
          break;
        case "decorate":
          if (run?.phase === "prep") {
            this.state.decorating = !this.state.decorating;
            this.state.carriagePanel = "scene";
            run.lastMessage = this.state.decorating
              ? "先選小物，再點相容槽；也可把場景中的小物拖到綠色槽位。"
              : "佈置工具已收起，小物會保留在車廂裡。";
          }
          break;
        case "select-decoration":
          if (
            run?.phase === "prep" &&
            value &&
            DECORATIONS.some((decoration) => decoration.id === value)
          ) {
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
              if (
                this.runService.moveDecoration(
                  run,
                  id as DecorationId,
                  slotId ?? "",
                )
              )
                await this.persist();
            }
          }
          break;
        case "place-decoration":
          if (run?.phase === "prep" && value) {
            const [id, slotId] = value.split(":");
            if (DECORATIONS.some((decoration) => decoration.id === id)) {
              this.state.selectedDecorationId = id as DecorationId;
              this.state.decorating = true;
              if (
                this.runService.moveDecoration(
                  run,
                  id as DecorationId,
                  slotId ?? "",
                )
              )
                await this.persist();
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
            run.lastMessage =
              "五種車廂的槽位佈置已保存；守夜時會保留各自配置。";
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
          if (
            run &&
            value &&
            !this.state.modulePreview &&
            this.runService.buildModule(run, value)
          ) {
            this.state.screen = "carriage";
            await this.persist();
          }
          break;
        case "select-tech":
          if (value) this.state.selectedTechId = value;
          break;
        case "select-tech-branch":
          if (
            value &&
            ["能源", "居住", "農業", "防禦", "情報"].includes(value)
          ) {
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
          if (value && CROPS.some((crop) => crop.id === value))
            this.state.selectedCropId = value as CropId;
          break;
        case "plant-crop":
          if (run && value) {
            const [plotId, cropId] = value.split(":");
            if (
              ["plot-a", "plot-b"].includes(plotId ?? "") &&
              CROPS.some((crop) => crop.id === cropId)
            ) {
              this.runService.plantCrop(
                run,
                plotId as CropPlotId,
                cropId as CropId,
              );
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
          this.state.settings.textScale =
            this.state.settings.textScale === 100
              ? 120
              : this.state.settings.textScale === 120
                ? 140
                : 100;
          this.persistSettings();
          break;
        case "toggle-motion":
          this.state.settings.reducedMotion =
            !this.state.settings.reducedMotion;
          this.persistSettings();
          break;
        case "toggle-countdown":
          this.state.settings.noCountdown = !this.state.settings.noCountdown;
          if (this.state.settings.noCountdown && run)
            this.runService.enableNoCountdownFallback(run);
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
      if (run && currentRun === run)
        this.captureActionFeedback(run, ledgerStart, actionPointsBefore);
      this.render();
    } finally {
      this.actionInFlight = false;
    }
  }

  private describeObjectAction(
    run: RunState,
    action: string,
    value?: string,
  ): NonNullable<AppState["objectPreview"]> {
    if (action === "build-module") {
      const module = MODULES.find((candidate) => candidate.id === value);
      const partsCost = value ? getModuleBuildPartsCost(run, value) : 0;
      return {
        action,
        value,
        title: module ? `安裝${module.name}` : "安裝列車模組",
        costs: module
          ? `2 AP、零件 ${partsCost}；今夜增加 ${module.activeCost} 電力負載`
          : "2 AP 與模組所需零件",
      };
    }
    if (action === "unlock-tech") {
      const tech = TECH_NODES.find((candidate) => candidate.id === value);
      return {
        action,
        value,
        title: tech ? `解鎖${tech.name}` : "解鎖科技",
        costs: `協定資料 ${tech?.cost ?? 0}`,
      };
    }
    if (action === "plant-crop") {
      const cropId = value?.split(":")[1];
      const crop = CROPS.find((candidate) => candidate.id === cropId);
      return {
        action,
        value,
        title: `播種${crop?.name ?? "作物"}`,
        costs: "1 AP、飲水 1；今晚需保持種植架供電",
      };
    }
    if (action === "harvest-crop")
      return {
        action,
        value,
        title: "收成這一槽作物",
        costs: "1 AP；收成後會清空作物槽",
      };
    if (action === "water-crops")
      {
        const facility = getFacilityEffects(run.voyage);
        const waterCost = Math.max(0, 1 - facility.irrigationWaterDiscount);
        const contaminationRisk = facility.contaminationOnIrrigation > 0
          ? run.routeId === "R03"
            ? "；封閉回水會使儲水污染 +6、供水槽污染各 +1"
            : "；封閉回水會使感染 +2"
          : "";
        return {
        action,
        value,
        title: "啟動水培循環",
        costs: `${waterCost > 0 ? `飲水 ${waterCost}` : "免飲水"}；所有未成熟作物同時灌溉${contaminationRisk}`,
      };
      }
    if (action === "comfort")
      return {
        action,
        value,
        title: "安撫 A-07",
        costs: "1 AP；壓力 −8、信任 +2",
      };
    if (action === "repair-hull")
      return {
        action,
        value,
        title: "修補車體破損",
        costs: `2 AP、零件 2；車體完整度 +${Math.min(100 - run.environment.hull, getRepairHullAmount(run))}`,
      };
    if (action === "workshop-scrap")
      return {
        action,
        value,
        title: "整理工坊回收件",
        costs: "1 AP；零件 +1、噪音 +4",
      };
    if (action === "cook-meal")
      return {
        action,
        value,
        title: "為 A-07 煮一份熱食",
        costs: "1 AP、食物 1、飲水 1、電量 2",
      };
    if (action === "upgrade-facility") {
      const [facilityId, upgradeId] = value?.split(":") ?? [];
      const upgrade = FACILITY_UPGRADES.find(
        (candidate) =>
          candidate.facilityId === facilityId &&
          candidate.upgradeId === upgradeId,
      );
      return {
        action,
        value,
        title: upgrade?.title ?? "確認設施改裝方向",
        costs: upgrade
          ? `${upgrade.apCost} AP、零件 ${upgrade.partsCost}；完成後關閉同組另一方向`
          : "採用後會鎖定同組另一條改裝；實際成本只結算一次",
      };
    }
    if (action === "choose-relationship") {
      const [missionId, choiceId] = value?.split(":") ?? [];
      const relationship = RELATIONSHIPS.find(
        (candidate) => candidate.missionId === missionId,
      );
      const choice = relationship?.choices.find(
        (candidate) => candidate.id === choiceId,
      );
      const costs = Object.entries(choice?.cost ?? {})
        .filter(([, amount]) => (amount ?? 0) < 0)
        .map(([key, amount]) => {
          const labels: Record<string, string> = {
            energy: "電量",
            fuel: "燃料",
            food: "食物",
            water: "飲水",
            parts: "零件",
            medicine: "藥品",
          };
          return `${labels[key] ?? key} ${Math.abs(amount ?? 0)}`;
        })
        .join("、");
      return {
        action,
        value,
        title: choice?.label ?? "確認這次回應",
        costs: costs || "不消耗 AP 或物資",
      };
    }
    if (action === "start-expedition")
      return {
        action,
        value,
        title: "派出檢修裝置探索",
        costs: "1 AP、使用當日停站機會；出發後仍可帶著已找到的物品撤回",
      };
    if (action === "refill-supplies") {
      const refill = REFILL_ACTIONS.find((candidate) => candidate.id === value);
      const cost = Object.entries(refill?.cost ?? {})
        .map(([key, amount]) => {
          const labels: Record<string, string> = {
            energy: "電量",
            water: "飲水",
            parts: "零件",
          };
          return `${labels[key] ?? key} ${Math.abs(amount)}`;
        })
        .join("、");
      const gain = Object.entries(refill?.gain ?? {})
        .map(([key, amount]) => {
          const labels: Record<string, string> = {
            energy: "電量",
            water: "飲水",
            food: "食物",
          };
          return `${labels[key] ?? key} +${amount}`;
        })
        .join("、");
      return {
        action,
        value,
        title: refill?.title ?? "確認補給",
        costs: refill ? `${refill.apCost} AP、${cost}；${gain}` : "1 AP",
      };
    }
    if (action === "use-medicine")
      {
        const moduleEffects = deriveGameplayEffects(run);
        const facilityEffects = getFacilityEffects(run.voyage);
        const healthGain = Math.min(
          100 - run.survivor.health,
          12 + moduleEffects.medicineHealthBonus + facilityEffects.medicineHealthBonus,
        );
        const infectionReduction = Math.min(
          run.survivor.infection,
          6 + moduleEffects.medicineInfectionReduction + facilityEffects.medicineInfectionReduction,
        );
        return {
        action,
        value,
        title: "使用臥室醫療盒",
        costs: `1 AP、藥品 1；健康 +${healthGain}、感染 −${infectionReduction}`,
      };
      }
    if (action === "choose-expedition-step")
      return {
        action,
        value,
        title: value === "deep-dive" ? "承擔風險深入" : "確認探索選擇",
        costs:
          value === "deep-dive"
            ? "可能損傷車體並提高噪音與壓力；固定結果不會因讀檔重抽"
            : "這一步不額外扣 AP",
      };
    return {
      action,
      value,
      title: "確認這次整備",
      costs: "依畫面列出的 AP 與物資結算一次",
    };
  }

  private async executeObjectAction(
    run: RunState,
    action: string,
    value?: string,
  ): Promise<void> {
    let accepted = false;
    switch (action) {
      case "build-module":
        accepted = Boolean(value && this.runService.buildModule(run, value));
        if (accepted) this.state.screen = "carriage";
        break;
      case "unlock-tech":
        accepted = Boolean(value && this.runService.unlockTech(run, value));
        break;
      case "plant-crop": {
        const [plotId, cropId] = value?.split(":") ?? [];
        accepted = Boolean(
          plotId &&
            cropId &&
            ["plot-a", "plot-b"].includes(plotId) &&
            CROPS.some((crop) => crop.id === cropId) &&
            this.runService.plantCrop(
              run,
              plotId as CropPlotId,
              cropId as CropId,
            ),
        );
        break;
      }
      case "water-crops":
        accepted = this.runService.waterCrops(run);
        break;
      case "harvest-crop":
        accepted = Boolean(
          value &&
            ["plot-a", "plot-b"].includes(value) &&
            this.runService.harvestCrop(run, value as CropPlotId),
        );
        break;
      case "workshop-scrap":
        accepted = this.runService.collectWorkshopScrap(run);
        break;
      case "cook-meal":
        accepted = this.runService.cookHotMeal(run);
        break;
      case "comfort":
        accepted = this.runService.comfortPassenger(run);
        break;
      case "repair-hull":
        accepted = this.runService.repairCarriage(run);
        break;
      case "upgrade-facility": {
        const [facilityId, branchId] = value?.split(":") ?? [];
        accepted = Boolean(
          facilityId &&
            branchId &&
            this.runService.upgradeFacility(run, facilityId, branchId),
        );
        break;
      }
      case "start-expedition":
        accepted = this.runService.startExpedition(run);
        break;
      case "choose-expedition-step":
        accepted = Boolean(
          value && this.runService.chooseExpeditionStep(run, value),
        );
        break;
      case "choose-relationship": {
        const [missionId, choiceId] = value?.split(":") ?? [];
        accepted = Boolean(
          missionId &&
            choiceId &&
            this.runService.chooseRelationship(run, missionId, choiceId),
        );
        break;
      }
      case "refill-supplies":
        accepted = Boolean(value && this.runService.refillSupplies(run, value));
        break;
      case "use-medicine":
        accepted = this.runService.useMedicine(run);
        break;
      default:
        run.lastMessage = "這項操作目前無法執行。";
    }
    if (accepted) await this.persist();
  }

  private captureActionFeedback(
    run: RunState,
    ledgerStart: number,
    actionPointsBefore?: number,
  ): void {
    const combined = new Map<string, number>();
    if (
      typeof actionPointsBefore === "number" &&
      actionPointsBefore !== run.actionPoints
    )
      combined.set("AP", run.actionPoints - actionPointsBefore);
    for (const entry of run.ledger.slice(ledgerStart))
      combined.set(entry.key, (combined.get(entry.key) ?? 0) + entry.delta);
    const labels: Record<string, string> = {
      energy: "電量",
      fuel: "燃料",
      food: "食物",
      water: "飲水",
      parts: "零件",
      medicine: "藥品",
      data: "資料",
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
    const reliefKeys = new Set([
      "stress",
      "infection",
      "noise",
      "wakeups",
      "weight",
    ]);
    this.state.actionFeedback = [...combined.entries()]
      .filter(([, delta]) => delta !== 0)
      .slice(0, 3)
      .map(([key, delta]) => {
        let tone: FeedbackTone = "neutral";
        if (key === "AP") tone = "cost";
        else if (reliefKeys.has(key)) tone = delta < 0 ? "relief" : "cost";
        else if (key !== "temperature" && key !== "visibility")
          tone = delta > 0 ? "gain" : "cost";
        return { label: labels[key] ?? key, delta, tone };
      });
  }

  private startNightTimer(): void {
    clearInterval(this.nightTimer);
    const interval = this.state.settings.lowSpeed ? 1333 : 1000;
    this.nightTimer = window.setInterval(() => {
      const run = this.state.run;
      if (
        !run ||
        run.phase !== "night" ||
        this.state.settings.noCountdown ||
        this.state.nightPaused
      )
        return;
      this.state.actionFeedback = [];
      const threatBeforeTick = run.activeContact?.definitionId;
      this.runService.tickNight(run);
      const phaseAfterTick: string = run.phase;
      if (
        phaseAfterTick === "aftermath" ||
        phaseAfterTick === "ending" ||
        (phaseAfterTick === "travel" && Boolean(run.activeEventId))
      ) {
        clearInterval(this.nightTimer);
        this.state.screen = this.screenForPhase();
        if (this.state.settings.sound && threatBeforeTick !== "T006")
          this.audio.cue("breach");
        void this.persist();
      }
      this.render();
    }, interval);
  }

  private screenForPhase(): ScreenId {
    const run = this.state.run;
    if (!run) return "menu";
    if (run.activeEventId && "forced" in (this.runService.getEvent(run) ?? {}))
      return "event";
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
      const profileDraft = this.state.run.ended
        ? recordRunOutcome(this.state.profile, this.state.run)
        : this.state.profile;
      await this.saveService.save(this.state.run, profileDraft);
      this.state.profile = profileDraft;
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
    const activeEvent = this.state.eventPreview
      ? EVENTS.find((event) => event.id === "EV004")
      : this.state.run?.activeEventId
        ? this.runService.getEvent(this.state.run)
        : undefined;
    this.view.render(this.state, this.hasSave, activeEvent);
    this.renderer.render(this.state);
  }
}
