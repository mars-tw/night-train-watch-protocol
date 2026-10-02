import type { AppState, CarriageId, ThreatContact } from "./types";
import {
  A07_ATLAS,
  A07_FRAME_CELLS,
  CARRIAGE_SCENES,
  COSMETIC_VISUALS,
  EQUIPMENT_ATLAS,
  SCENE_STATE_EQUIPMENT,
  THREAT_ATLASES,
  THREAT_RETREAT_DURATION_MS,
  a07PlaybackForRun,
  installedFacilityVisuals,
  sceneVisualState,
  threatFamilyForId,
  threatClipForStage,
  updateThreatVisualLifecycle,
  type FacilityVisual,
  type CosmeticVisual,
  type SceneVisualState,
  type ThreatFamilyId,
  type ThreatClipId,
  type ThreatRetreatVisual,
  type ThreatVisualLifecycle,
} from "./scene-manifest";

type CarriageArtKey = `v2-carriage-${CarriageId}`;
type ThreatArtKey = `v2-threat-${ThreatFamilyId}`;
type ArtKey = CarriageArtKey | ThreatArtKey | "a07-atlas" | "equipment-atlas" | "night" | "menu";

const ART_SOURCES: Record<ArtKey, string> = {
  "v2-carriage-sleep": CARRIAGE_SCENES.sleep.source,
  "v2-carriage-defense": CARRIAGE_SCENES.defense.source,
  "v2-carriage-workshop": CARRIAGE_SCENES.workshop.source,
  "v2-carriage-greenhouse": CARRIAGE_SCENES.greenhouse.source,
  "v2-carriage-kitchen": CARRIAGE_SCENES.kitchen.source,
  "a07-atlas": A07_ATLAS.source,
  "equipment-atlas": EQUIPMENT_ATLAS.source,
  "v2-threat-knocker": THREAT_ATLASES.knocker.source,
  "v2-threat-clinger": THREAT_ATLASES.clinger.source,
  "v2-threat-vine": THREAT_ATLASES.vine.source,
  "v2-threat-echo": THREAT_ATLASES.echo.source,
  "v2-threat-crowd": THREAT_ATLASES.crowd.source,
  night: "./assets/art/carriage-night.png",
  menu: "./assets/art/carriage-menu.png",
};

// Kept only as migration/provenance references. These full-scene plates are not
// loaded into ART_SOURCES and never replace a v2 carriage during a contact.
export const LEGACY_STORY_PLATE_REFERENCES = [
  "./assets/art/carriage-sleep.png",
  "./assets/art/carriage-defense.png",
  "./assets/art/carriage-workshop.png",
  "./assets/art/carriage-greenhouse.png",
  "./assets/art/carriage-kitchen.png",
  "./assets/art/threat-knocker.png",
  "./assets/art/threat-clinger.png",
  "./assets/art/story/threat-fog-vine-gpt-v1.png",
  "./assets/art/story/threat-echo-passenger-gpt-v1.png",
  "./assets/art/story/threat-silent-crowd-gpt-v1.png",
  "./assets/art/story/carriage-frostline-gpt-v1.png",
  "./assets/art/story/threat-blizzard-gpt-v1.png",
  "./assets/art/story/carriage-greentide-gpt-v1.png",
  "./assets/art/story/threat-t008-gpt-v1.png",
  "./assets/art/story/greentide-branch-equipment-gpt-v1.png",
] as const;

export class SceneRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly images = new Map<ArtKey, HTMLImageElement>();
  private animationFrame = 0;
  private state: AppState | null = null;
  private threatAnimationKey = "";
  private threatAnimationStartedAt = 0;
  private a07AnimationKey = "";
  private a07AnimationStartedAt = 0;
  private threatVisualLifecycle: ThreatVisualLifecycle = { runId: null };
  private lastDrawTime = 0;

  public constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.context = context;
    this.canvas.width = 720;
    this.canvas.height = 1280;
    this.context.imageSmoothingEnabled = false;
    for (const [key, source] of Object.entries(ART_SOURCES) as [ArtKey, string][]) {
      const image = new Image();
      image.decoding = "async";
      image.src = source;
      image.addEventListener("load", () => this.draw(performance.now()));
      this.images.set(key, image);
    }
  }

  public start(): void {
    const loop = (time: number) => {
      this.draw(time);
      this.animationFrame = requestAnimationFrame(loop);
    };
    this.animationFrame = requestAnimationFrame(loop);
  }

  public stop(): void {
    cancelAnimationFrame(this.animationFrame);
  }

  public render(state: AppState): void {
    this.state = state;
    this.draw(performance.now());
  }

  private draw(time: number): void {
    const { context: ctx } = this;
    const state = this.state;
    const elapsedSinceDraw = this.lastDrawTime > 0 ? Math.max(0, time - this.lastDrawTime) : 0;
    this.lastDrawTime = time;
    if (state?.nightPaused && elapsedSinceDraw > 0) {
      this.a07AnimationStartedAt += elapsedSinceDraw;
      this.threatAnimationStartedAt += elapsedSinceDraw;
      if (this.threatVisualLifecycle.retreat) {
        this.threatVisualLifecycle.retreat.startedAt += elapsedSinceDraw;
      }
    }
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const phase = state?.run?.phase;
    const contact = state?.run?.activeContact;
    this.threatVisualLifecycle = updateThreatVisualLifecycle(
      this.threatVisualLifecycle,
      state?.run?.runId ?? null,
      contact,
      time,
    );
    const whiteFrost = state?.run?.routeId === "R02";
    const greenTide = state?.run?.routeId === "R03";
    const reducedMotion = this.motionIsReduced();
    const carriageId: CarriageId = state?.screen === "menu" || state?.screen === "result"
      ? "sleep"
      : state?.activeCarriageId ?? "greenhouse";
    const carriageArtKey: CarriageArtKey = `v2-carriage-${carriageId}`;
    const artKey: ArtKey = carriageArtKey;

    ctx.save();
    const sway = reducedMotion ? { x: 0, y: 0 } : this.trainSway(time);
    const impact = reducedMotion ? { x: 0, y: 0 } : this.impactShake(contact, time);
    ctx.translate(sway.x + impact.x, sway.y + impact.y);
    if (!this.drawArt(artKey)) this.drawFallback(artKey, time, phase === "night");
    this.drawWindowMotion(carriageId, time, phase === "night", reducedMotion);
    if (state?.run) {
      this.drawSceneStateOverlay(carriageId, sceneVisualState(state.run, carriageId), time, reducedMotion);
      this.drawSceneStateEquipment(carriageId, sceneVisualState(state.run, carriageId));
      this.drawFacilityLayers(installedFacilityVisuals(state.run, carriageId));
      this.drawSelectedCosmetic(carriageId);
    }
    if (carriageId === "sleep") this.drawA07Passenger(time, reducedMotion);
    this.drawCarriageLife(time, phase === "night", reducedMotion);
    this.drawAtmosphere(time, phase === "night", reducedMotion);
    if (whiteFrost) this.drawWhiteFrostRoute(time, reducedMotion);
    if (greenTide) this.drawGreenTideRoute(time, reducedMotion);
    if (this.threatVisualLifecycle.retreat) {
      this.drawThreatRetreat(this.threatVisualLifecycle.retreat, time, reducedMotion);
    }
    if (phase === "night" && contact) {
      this.drawThreat(contact, time, reducedMotion);
      this.drawThreatImpact(contact, time, reducedMotion);
    }
    ctx.restore();

    if (!["carriage", "menu", "result"].includes(state?.screen ?? "")) {
      ctx.fillStyle = "rgba(9, 14, 18, 0.74)";
      ctx.fillRect(0, 0, 720, 1280);
    }
  }

  private drawWhiteFrostRoute(time: number, reducedMotion: boolean): void {
    const run = this.state?.run;
    if (!run?.story.whiteFrost) return;
    const ctx = this.context;
    const drift = reducedMotion ? 0 : time * 0.028;

    ctx.save();
    const coldVeil = ctx.createLinearGradient(0, 0, 720, 1280);
    coldVeil.addColorStop(0, "rgba(187, 220, 232, 0.18)");
    coldVeil.addColorStop(0.48, "rgba(105, 154, 174, 0.035)");
    coldVeil.addColorStop(1, "rgba(6, 20, 29, 0.22)");
    ctx.fillStyle = coldVeil;
    ctx.fillRect(0, 0, 720, 1280);

    ctx.strokeStyle = "rgba(220, 244, 249, 0.42)";
    ctx.lineCap = "round";
    for (let index = 0; index < 22; index += 1) {
      const x = (index * 89 + drift * (0.6 + (index % 4) * 0.18)) % 840 - 60;
      const y = 62 + ((index * 137 + drift * 1.35) % 1020);
      const length = 8 + (index % 5) * 4;
      ctx.lineWidth = index % 4 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - length * 0.55, y + length);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(220, 244, 249, 0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(18, 154);
    ctx.lineTo(64, 126);
    ctx.lineTo(92, 166);
    ctx.moveTo(622, 96);
    ctx.lineTo(666, 148);
    ctx.lineTo(706, 112);
    ctx.stroke();

    const branch = run.story.whiteFrost.branch;
    const activeCarriage = this.state?.activeCarriageId;
    const branchCarriage = branch === "CARE" ? "sleep" : branch === "CLEAR" ? "defense" : branch === "SUSTAIN" ? "greenhouse" : undefined;
    if (branch && activeCarriage === branchCarriage) {
      const branchColor = branch === "CARE" ? "226,168,93" : branch === "CLEAR" ? "137,183,199" : "126,165,122";
      const glow = ctx.createRadialGradient(360, 690, 20, 360, 690, 350);
      glow.addColorStop(0, `rgba(${branchColor}, 0.2)`);
      glow.addColorStop(1, `rgba(${branchColor}, 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 300, 720, 760);
      ctx.strokeStyle = `rgba(${branchColor}, 0.72)`;
      ctx.lineWidth = 5;
      if (branch === "CARE") {
        ctx.beginPath();
        ctx.roundRect(330, 532, 292, 278, 38);
        ctx.stroke();
        ctx.fillStyle = "rgba(226,168,93,0.18)";
        ctx.fillRect(352, 742, 238, 18);
      } else if (branch === "CLEAR") {
        ctx.strokeRect(505, 426, 118, 174);
        for (let row = 0; row < 3; row += 1) ctx.strokeRect(524, 448 + row * 47, 80, 28);
      } else {
        ctx.beginPath();
        ctx.arc(151, 658, 88, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(151, 658, 54, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawGreenTideRoute(time: number, reducedMotion: boolean): void {
    const run = this.state?.run;
    const greenTide = run?.story.greenTide;
    if (!run || !greenTide) return;
    const ctx = this.context;
    const activeCarriage = this.state?.activeCarriageId;
    const contact = run.activeContact;
    const contamination = Math.max(0, Math.min(100, greenTide.reservoirContamination));
    const pulse = reducedMotion ? 0.55 : (Math.sin((time / 180) * Math.PI * 2) + 1) * 0.5;

    if (activeCarriage === "greenhouse" && contact?.definitionId !== "T008") {
      this.drawGreenCarriageLayer();
    }

    ctx.save();
    const livingVeil = ctx.createLinearGradient(0, 0, 720, 1280);
    livingVeil.addColorStop(0, "rgba(126, 165, 122, 0.08)");
    livingVeil.addColorStop(0.55, `rgba(68, 112, 70, ${0.035 + contamination * 0.0007})`);
    livingVeil.addColorStop(1, "rgba(9, 14, 18, 0.18)");
    ctx.fillStyle = livingVeil;
    ctx.fillRect(0, 0, 720, 1280);

    const rootPath = () => {
      ctx.beginPath();
      ctx.moveTo(-12, 722);
      ctx.bezierCurveTo(108, 690, 136, 572, 244, 606);
      ctx.bezierCurveTo(344, 638, 380, 770, 492, 710);
      ctx.bezierCurveTo(586, 660, 628, 548, 742, 588);
      ctx.moveTo(244, 606);
      ctx.bezierCurveTo(286, 538, 330, 496, 346, 406);
      ctx.moveTo(492, 710);
      ctx.bezierCurveTo(528, 796, 588, 828, 650, 906);
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(9, 14, 18, 0.72)";
    ctx.lineWidth = 13;
    rootPath();
    ctx.stroke();
    ctx.strokeStyle = contamination >= 50 ? "rgba(194, 96, 78, 0.88)" : "rgba(126, 165, 122, 0.9)";
    ctx.lineWidth = 6;
    ctx.setLineDash(reducedMotion ? [] : [20, 13]);
    ctx.lineDashOffset = reducedMotion ? 0 : -(time * 0.055);
    rootPath();
    ctx.stroke();
    ctx.setLineDash([]);

    const nodes = [
      { x: 108, y: 674, symbol: "I" },
      { x: 244, y: 606, symbol: "F" },
      { x: 346, y: 406, symbol: "A" },
      { x: 492, y: 710, symbol: "B" },
      { x: 650, y: 906, symbol: "D" },
    ];
    for (const [index, node] of nodes.entries()) {
      const taintedNode = contamination > 0 && index % 2 === 1;
      const radius = 10 + (contact?.definitionId === "T008" ? pulse * 4 : 0);
      ctx.fillStyle = taintedNode ? "rgba(83, 28, 27, 0.94)" : "rgba(18, 43, 33, 0.94)";
      ctx.strokeStyle = taintedNode ? "#c2604e" : "#a7cda1";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f5e8d8";
      ctx.font = "800 13px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(taintedNode ? "×" : node.symbol, node.x, node.y + 0.5);
    }

    if (contact?.definitionId === "T013") {
      this.drawSporeContamination(time, reducedMotion);
    }
    ctx.restore();

    const branchCarriage = greenTide.branch === "CULTIVATE"
      ? "greenhouse"
      : greenTide.branch === "FILTER"
        ? "workshop"
        : greenTide.branch === "PURGE"
          ? "defense"
          : undefined;
    if (greenTide.branch && activeCarriage === branchCarriage) {
      if (!this.drawGreenBranchEquipmentLayer(greenTide.branch)) {
        this.drawGreenBranchEquipmentFallback(greenTide.branch, greenTide.branchOperationComplete);
      }
    }
  }

  private drawGreenCarriageLayer(): void {
    const ctx = this.context;
    ctx.save();
    const waterGlow = ctx.createRadialGradient(128, 760, 14, 128, 760, 230);
    waterGlow.addColorStop(0, "rgba(114, 180, 166, 0.2)");
    waterGlow.addColorStop(1, "rgba(114, 180, 166, 0)");
    ctx.fillStyle = waterGlow;
    ctx.fillRect(0, 500, 360, 500);
    ctx.restore();
  }

  private drawGreenBranchEquipmentLayer(_branch: "CULTIVATE" | "FILTER" | "PURGE"): boolean {
    // The legacy three-panel plate is intentionally not composited over the new room.
    // Until matching transparent equipment sprites ship, the state-specific fixture
    // drawing below keeps the authoritative branch visible in the same space.
    return false;
  }

  private drawGreenBranchEquipmentFallback(branch: "CULTIVATE" | "FILTER" | "PURGE", resolved: boolean): void {
    const ctx = this.context;
    ctx.save();
    ctx.strokeStyle = branch === "PURGE" ? "rgba(194, 96, 78, 0.86)" : branch === "FILTER" ? "rgba(137, 183, 199, 0.86)" : "rgba(226, 168, 93, 0.86)";
    ctx.fillStyle = branch === "PURGE" ? "rgba(74, 27, 25, 0.32)" : "rgba(60, 91, 59, 0.25)";
    ctx.lineWidth = resolved ? 7 : 4;
    if (branch === "CULTIVATE") {
      ctx.beginPath();
      ctx.arc(154, 628, 92, 0, Math.PI * 2);
      ctx.arc(154, 628, 57, 0, Math.PI * 2);
      ctx.fill("evenodd");
      ctx.stroke();
      ctx.fillStyle = "rgba(226, 168, 93, 0.22)";
      ctx.fillRect(48, 362, 252, 28);
    } else if (branch === "FILTER") {
      ctx.beginPath();
      ctx.roundRect(470, 356, 154, 332, 28);
      ctx.fill();
      ctx.stroke();
      for (let row = 0; row < 4; row += 1) ctx.strokeRect(492, 402 + row * 61, 110, 36);
      ctx.beginPath();
      ctx.moveTo(470, 520);
      ctx.bezierCurveTo(382, 506, 420, 720, 330, 724);
      ctx.stroke();
    } else {
      ctx.fillRect(58, 720, 576, 38);
      ctx.strokeRect(58, 720, 576, 38);
      for (let column = 0; column < 7; column += 1) {
        ctx.beginPath();
        ctx.moveTo(84 + column * 78, 720);
        ctx.lineTo(112 + column * 78, 758);
        ctx.stroke();
      }
      ctx.strokeRect(520, 314, 112, 286);
    }
    ctx.restore();
  }

  private drawSporeContamination(time: number, reducedMotion: boolean): void {
    const ctx = this.context;
    ctx.save();
    for (let index = 0; index < 34; index += 1) {
      const travel = reducedMotion ? 0 : time * (0.014 + (index % 4) * 0.003);
      const x = 34 + ((index * 83 + travel) % 670);
      const y = 236 + ((index * 127 + travel * 0.72) % 652);
      const radius = 3 + (index % 4);
      ctx.strokeStyle = index % 3 === 0 ? "rgba(194, 96, 78, 0.72)" : "rgba(151, 181, 124, 0.62)";
      ctx.lineWidth = index % 5 === 0 ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.moveTo(x - radius - 3, y);
      ctx.lineTo(x + radius + 3, y);
      ctx.moveTo(x, y - radius - 3);
      ctx.lineTo(x, y + radius + 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawArt(key: ArtKey): boolean {
    const image = this.images.get(key);
    if (!image?.complete || image.naturalWidth === 0) return false;
    const ratio = Math.max(720 / image.naturalWidth, 1280 / image.naturalHeight) * 1.012;
    const width = image.naturalWidth * ratio;
    const height = image.naturalHeight * ratio;
    this.context.drawImage(image, (720 - width) / 2, (1280 - height) / 2, width, height);
    return true;
  }

  private drawFallback(key: ArtKey, time: number, night = key === "night"): void {
    const ctx = this.context;
    const gradient = ctx.createLinearGradient(0, 0, 0, 1280);
    gradient.addColorStop(0, night ? "#16232b" : "#3c3329");
    gradient.addColorStop(0.45, night ? "#20292d" : "#6b4a29");
    gradient.addColorStop(1, "#15191c");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 720, 1280);
    ctx.fillStyle = night ? "#90aeb7" : "#a7c2c8";
    ctx.fillRect(210, 100, 300, 390);
    ctx.fillStyle = "#354149";
    for (let index = 0; index < 8; index += 1) {
      const y = 160 + index * 48 + Math.sin(time * 0.0005 + index) * 4;
      ctx.fillRect(236, y, 248, 8);
    }
    ctx.fillStyle = "#5e4635";
    ctx.fillRect(278, 520, 360, 480);
    ctx.fillStyle = "#d7c4a8";
    ctx.beginPath();
    ctx.roundRect(300, 580, 330, 350, 36);
    ctx.fill();
    ctx.fillStyle = "#2a2424";
    ctx.beginPath();
    ctx.arc(500, 615, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#81522c";
    ctx.fillRect(54, 560, 190, 360);
    ctx.fillStyle = "#466b45";
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 3; column += 1) ctx.fillRect(70 + column * 56, 585 + row * 60, 40, 28);
    }
  }

  private motionIsReduced(): boolean {
    const systemPreference = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    return Boolean(this.state?.settings.reducedMotion || systemPreference);
  }

  private trainSway(time: number): { x: number; y: number } {
    return {
      x: Math.sin(time * 0.0017) * 1.6 + Math.sin(time * 0.0041) * 0.55,
      y: Math.sin(time * 0.0032) * 1.1,
    };
  }

  private impactShake(contact: ThreatContact | undefined, time: number): { x: number; y: number } {
    if (!contact || !["attack", "breach"].includes(contact.stage)) return { x: 0, y: 0 };
    const intensity = contact.stage === "breach" ? 7 : 3.5;
    return {
      x: Math.sin(time * 0.071) * intensity,
      y: Math.cos(time * 0.083) * intensity * 0.55,
    };
  }

  private drawWindowMotion(carriageId: CarriageId, time: number, night: boolean, reducedMotion: boolean): void {
    const speed = reducedMotion ? 0 : night ? 0.085 : 0.055;
    const windows = CARRIAGE_SCENES[carriageId].weatherWindows;
    windows.forEach((bounds, index) => this.drawWindowWeather({
      x: bounds.x * 720,
      y: bounds.y * 1280,
      width: bounds.width * 720,
      height: bounds.height * 1280,
    }, time, speed * (1 + index * 0.18), night, index * 41));

    const ctx = this.context;
    const focusWindow = windows[0];
    if (!focusWindow) return;
    const focusX = focusWindow.x * 720;
    const focusY = focusWindow.y * 1280;
    const focusWidth = focusWindow.width * 720;
    const focusHeight = focusWindow.height * 1280;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(focusX, focusY, focusWidth, focusHeight, 24);
    ctx.clip();
    for (let index = 0; index < 7; index += 1) {
      const progress = ((index * 0.19 + time * speed * 0.00012) % 1 + 1) % 1;
      const y = focusY + focusHeight * (0.45 + progress * 0.5);
      const halfWidth = 8 + progress * focusWidth * 0.42;
      ctx.strokeStyle = `rgba(183, 211, 220, ${0.08 + progress * 0.22})`;
      ctx.lineWidth = 1 + progress * 3;
      ctx.beginPath();
      ctx.moveTo(focusX + focusWidth / 2 - halfWidth, y);
      ctx.lineTo(focusX + focusWidth / 2 + halfWidth, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawWindowWeather(
    windowBox: { x: number; y: number; width: number; height: number },
    time: number,
    speed: number,
    night: boolean,
    seedOffset: number,
  ): void {
    const ctx = this.context;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(windowBox.x, windowBox.y, windowBox.width, windowBox.height, 28);
    ctx.clip();

    const fogTravel = speed === 0 ? 0.42 : (time * speed * 0.008) % (windowBox.width + 160);
    const fog = ctx.createLinearGradient(windowBox.x + fogTravel - 160, 0, windowBox.x + fogTravel + 80, 0);
    fog.addColorStop(0, "rgba(184, 207, 214, 0)");
    fog.addColorStop(0.5, `rgba(184, 207, 214, ${night ? 0.1 : 0.16})`);
    fog.addColorStop(1, "rgba(184, 207, 214, 0)");
    ctx.fillStyle = fog;
    ctx.fillRect(windowBox.x, windowBox.y, windowBox.width, windowBox.height);

    for (let index = 0; index < 18; index += 1) {
      const x = windowBox.x + ((index * 47 + seedOffset * 13) % Math.max(1, windowBox.width));
      const distance = windowBox.height + 34;
      const y = windowBox.y + ((index * 83 + seedOffset + time * speed) % distance) - 24;
      const length = 7 + ((index * 11) % 17);
      ctx.strokeStyle = `rgba(206, 229, 236, ${0.16 + (index % 4) * 0.055})`;
      ctx.lineWidth = index % 5 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2, y + length);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawA07Passenger(time: number, reducedMotion: boolean): void {
    const run = this.state?.run;
    const image = this.images.get("a07-atlas");
    if (!image?.complete || image.naturalWidth === 0) return;
    const playback = run
      ? a07PlaybackForRun(run)
      : { clipId: "sleep" as const, animationKey: "menu:sleep" };
    const clipId = playback.clipId;
    const clip = A07_ATLAS.clips[clipId];
    if (playback.animationKey !== this.a07AnimationKey) {
      this.a07AnimationKey = playback.animationKey;
      this.a07AnimationStartedAt = time;
    }
    const speedFactor = this.state?.settings.lowSpeed ? 0.5 : 1;
    const elapsedFrame = reducedMotion ? 0 : Math.floor((time - this.a07AnimationStartedAt) * clip.fps * speedFactor / 1000);
    const offset = playback.freezeFrame !== undefined
      ? Math.min(clip.frames - 1, Math.max(0, playback.freezeFrame))
      : reducedMotion
        ? clip.keyFrame
        : clip.loop
          ? elapsedFrame % clip.frames
          : Math.min(clip.frames - 1, elapsedFrame);
    const frameIndex = clip.start + offset;
    const cell = A07_FRAME_CELLS[frameIndex];
    if (!cell) return;
    const sourceX = Math.floor(cell.column * image.naturalWidth / A07_ATLAS.columns);
    const sourceRight = Math.floor((cell.column + 1) * image.naturalWidth / A07_ATLAS.columns);
    const sourceY = Math.floor(cell.row * image.naturalHeight / A07_ATLAS.rows);
    const sourceBottom = Math.floor((cell.row + 1) * image.naturalHeight / A07_ATLAS.rows);
    const destination = A07_ATLAS.destination;
    this.context.save();
    this.context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceRight - sourceX,
      sourceBottom - sourceY,
      destination.x * 720,
      destination.y * 1280,
      destination.width * 720,
      destination.height * 1280,
    );
    this.context.restore();
  }

  private drawSceneStateOverlay(
    carriageId: CarriageId,
    visualState: SceneVisualState,
    time: number,
    reducedMotion: boolean,
  ): void {
    const ctx = this.context;
    const pulse = reducedMotion ? 0.5 : (Math.sin(time * 0.004) + 1) / 2;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;

    if (carriageId === "sleep") {
      if (visualState === "secure" || visualState === "restored") {
        const warmth = ctx.createRadialGradient(570, 610, 12, 570, 610, 260);
        warmth.addColorStop(0, `rgba(242,189,103,${0.12 + pulse * 0.04})`);
        warmth.addColorStop(1, "rgba(242,189,103,0)");
        ctx.fillStyle = warmth;
        ctx.fillRect(310, 330, 410, 560);
      } else if (visualState === "disturbed") {
        ctx.strokeStyle = "rgba(189,207,206,0.75)";
        for (let index = 0; index < 5; index += 1) {
          ctx.beginPath();
          ctx.moveTo(552 + index * 28, 430);
          ctx.lineTo(530 + index * 32, 510 + index * 9);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = "rgba(53,66,70,0.16)";
        ctx.fillRect(382, 438, 332, 388);
      }
    } else if (carriageId === "defense") {
      if (visualState === "breached") {
        ctx.strokeStyle = "rgba(196,106,82,0.9)";
        ctx.beginPath();
        ctx.moveTo(514, 304);
        ctx.lineTo(550, 350);
        ctx.lineTo(526, 396);
        ctx.lineTo(572, 445);
        ctx.stroke();
      } else {
        ctx.strokeStyle = visualState === "restored" ? "rgba(114,180,166,0.82)" : "rgba(99,113,109,0.82)";
        ctx.strokeRect(518, 335, 142, 174);
        if (visualState === "secure") {
          for (let row = 0; row < 4; row += 1) ctx.fillRect(532, 352 + row * 34, 114, 10);
        }
      }
    } else if (carriageId === "workshop") {
      ctx.strokeStyle = visualState === "overloaded" ? "rgba(196,106,82,0.9)" : "rgba(114,180,166,0.78)";
      for (let index = 0; index < (visualState === "active" ? 4 : 2); index += 1) {
        ctx.beginPath();
        ctx.arc(550, 480, 28 + index * 18, -0.9, 0.9);
        ctx.stroke();
      }
      if (visualState === "overloaded") {
        ctx.beginPath();
        ctx.moveTo(276, 492);
        ctx.lineTo(294, 458);
        ctx.lineTo(310, 502);
        ctx.lineTo(330, 468);
        ctx.stroke();
      }
    } else if (carriageId === "greenhouse") {
      if (visualState === "contaminated") {
        ctx.strokeStyle = "rgba(196,106,82,0.78)";
        for (let index = 0; index < 18; index += 1) {
          const x = 40 + (index * 83) % 260;
          const y = 430 + (index * 61) % 390;
          ctx.beginPath();
          ctx.arc(x, y, 4 + index % 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (visualState === "productive") {
        ctx.fillStyle = "rgba(170,193,138,0.42)";
        for (let index = 0; index < 12; index += 1) {
          ctx.beginPath();
          ctx.ellipse(68 + (index % 4) * 54, 448 + Math.floor(index / 4) * 88, 18, 8, -0.45, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      if (visualState === "prepared" || visualState === "restored") {
        ctx.strokeStyle = "rgba(239,226,196,0.55)";
        for (let index = 0; index < 4; index += 1) {
          ctx.beginPath();
          ctx.moveTo(170 + index * 28, 462);
          ctx.bezierCurveTo(154 + index * 28, 438, 192 + index * 28, 420, 174 + index * 28, 394);
          ctx.stroke();
        }
      } else if (visualState === "spoiled") {
        ctx.strokeStyle = "rgba(196,106,82,0.88)";
        ctx.beginPath();
        ctx.moveTo(472, 460);
        ctx.lineTo(596, 570);
        ctx.moveTo(596, 460);
        ctx.lineTo(472, 570);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(99,113,109,0.55)";
        ctx.strokeRect(42, 128, 188, 152);
      }
    }
    ctx.restore();
  }

  private drawFacilityLayers(visuals: readonly FacilityVisual[]): void {
    for (const visual of visuals) this.drawFacilityVisual(visual);
  }

  private drawSelectedCosmetic(carriageId: CarriageId): void {
    const run = this.state?.run;
    if (!run) return;
    const runSelection = run.flags.find((flag) => flag.startsWith("cosmetic:"))?.slice("cosmetic:".length);
    const visual = COSMETIC_VISUALS.find((candidate) =>
      candidate.id === runSelection && candidate.carriageIds.includes(carriageId),
    );
    if (!visual) return;
    const x = visual.anchor.x * 720;
    const y = visual.anchor.y * 1280;
    this.drawEquipmentFrame(visual.equipmentFrame, x, y, visual.size * 720, 0.96);
    this.drawCosmeticDetail(visual, x, y, visual.size * 720);
  }

  private drawCosmeticDetail(visual: CosmeticVisual, x: number, y: number, size: number): void {
    const ctx = this.context;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = visual.accent;
    ctx.fillStyle = `${visual.accent}DD`;
    ctx.lineWidth = Math.max(2, size * 0.025);
    if (visual.detail === "note" || visual.detail === "qsl") {
      ctx.rotate(visual.detail === "note" ? -0.12 : 0.08);
      ctx.fillRect(-size * 0.32, -size * 0.23, size * 0.64, size * 0.46);
      ctx.strokeRect(-size * 0.32, -size * 0.23, size * 0.64, size * 0.46);
      ctx.strokeStyle = "rgba(53,43,42,0.72)";
      for (let row = 0; row < 3; row += 1) {
        ctx.beginPath();
        ctx.moveTo(-size * 0.2, -size * 0.1 + row * size * 0.1);
        ctx.lineTo(size * 0.2, -size * 0.1 + row * size * 0.1);
        ctx.stroke();
      }
    } else if (visual.detail === "gauge") {
      ctx.fillStyle = "rgba(53,66,70,0.9)";
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(size * 0.14, -size * 0.11);
      ctx.stroke();
    } else if (visual.detail === "garden-label") {
      ctx.fillRect(-size * 0.28, size * 0.18, size * 0.56, size * 0.2);
      ctx.beginPath();
      ctx.moveTo(0, size * 0.18);
      ctx.lineTo(0, size * 0.48);
      ctx.stroke();
    } else if (visual.detail === "tool-wrap") {
      ctx.fillStyle = "rgba(112,80,61,0.82)";
      ctx.roundRect(-size * 0.38, size * 0.08, size * 0.76, size * 0.28, size * 0.06);
      ctx.fill();
      for (let column = 0; column < 4; column += 1) ctx.strokeRect(-size * 0.3 + column * size * 0.17, size * 0.1, size * 0.12, size * 0.22);
    } else if (visual.detail === "stamp") {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-size * 0.17, 0);
      ctx.lineTo(size * 0.17, 0);
      ctx.moveTo(0, -size * 0.17);
      ctx.lineTo(0, size * 0.17);
      ctx.stroke();
    } else if (visual.detail === "log-cover") {
      ctx.fillStyle = "rgba(53,43,42,0.9)";
      ctx.roundRect(-size * 0.34, -size * 0.28, size * 0.68, size * 0.56, size * 0.04);
      ctx.fill();
      ctx.stroke();
      ctx.strokeRect(-size * 0.24, -size * 0.12, size * 0.48, size * 0.24);
    } else if (visual.detail === "lamp") {
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, size * 0.55);
      glow.addColorStop(0, "rgba(255,233,173,0.62)");
      glow.addColorStop(1, "rgba(242,189,103,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(-size * 0.55, -size * 0.55, size * 1.1, size * 1.1);
    }
    ctx.restore();
  }

  private drawSceneStateEquipment(carriageId: CarriageId, visualState: SceneVisualState): void {
    const placement = SCENE_STATE_EQUIPMENT[carriageId][visualState];
    if (!placement) return;
    this.drawEquipmentFrame(
      placement.frame,
      placement.anchor.x * 720,
      placement.anchor.y * 1280,
      placement.size * 720,
      0.9,
    );
  }

  private drawEquipmentFrame(frame: number, centerX: number, centerY: number, size: number, alpha = 1): boolean {
    const image = this.images.get("equipment-atlas");
    if (!image?.complete || image.naturalWidth === 0 || frame < 0 || frame >= EQUIPMENT_ATLAS.frameCount) return false;
    const column = frame % EQUIPMENT_ATLAS.columns;
    const row = Math.floor(frame / EQUIPMENT_ATLAS.columns);
    const sourceX = Math.floor(column * image.naturalWidth / EQUIPMENT_ATLAS.columns);
    const sourceRight = Math.floor((column + 1) * image.naturalWidth / EQUIPMENT_ATLAS.columns);
    const sourceY = Math.floor(row * image.naturalHeight / EQUIPMENT_ATLAS.rows);
    const sourceBottom = Math.floor((row + 1) * image.naturalHeight / EQUIPMENT_ATLAS.rows);
    this.context.save();
    this.context.globalAlpha = alpha;
    this.context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceRight - sourceX,
      sourceBottom - sourceY,
      centerX - size / 2,
      centerY - size / 2,
      size,
      size,
    );
    this.context.restore();
    return true;
  }

  private drawFacilityVisual(visual: FacilityVisual): void {
    const ctx = this.context;
    const x = visual.anchor.x * 720;
    const y = visual.anchor.y * 1280;
    if (this.drawEquipmentFrame(visual.equipmentFrame, x, y, 170)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = visual.color;
    ctx.fillStyle = `${visual.color}33`;
    ctx.lineWidth = 6;
    if (visual.shape === "coil" || visual.shape === "loop") {
      ctx.beginPath();
      ctx.arc(0, 0, 62, 0, Math.PI * 2);
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.fill("evenodd");
      ctx.stroke();
    } else if (visual.shape === "cells" || visual.shape === "trays") {
      for (let row = 0; row < 2; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          ctx.fillRect(-74 + column * 52, -44 + row * 54, 42, 40);
          ctx.strokeRect(-74 + column * 52, -44 + row * 54, 42, 40);
        }
      }
    } else if (visual.shape === "shutter") {
      for (let row = 0; row < 5; row += 1) {
        ctx.fillRect(-72, -76 + row * 32, 144, 16);
        ctx.strokeRect(-72, -76 + row * 32, 144, 16);
      }
    } else if (visual.shape === "frame") {
      ctx.strokeRect(-76, -92, 152, 184);
      ctx.strokeRect(-60, -76, 120, 152);
    } else if (visual.shape === "heater") {
      ctx.roundRect(-82, -48, 164, 96, 16);
      ctx.fill();
      ctx.stroke();
      for (let column = 0; column < 5; column += 1) ctx.strokeRect(-62 + column * 28, -26, 14, 52);
    } else {
      ctx.roundRect(-68, -68, 136, 136, 18);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-42, 0);
      ctx.lineTo(42, 0);
      ctx.moveTo(0, -42);
      ctx.lineTo(0, 42);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawCarriageLife(time: number, night: boolean, reducedMotion: boolean): void {
    const ctx = this.context;
    const flicker = reducedMotion ? 0.5 : (Math.sin(time * 0.019) + Math.sin(time * 0.007) + 2) * 0.25;

    const lampGlow = ctx.createRadialGradient(552, 326, 8, 552, 326, 190);
    lampGlow.addColorStop(0, `rgba(244, 174, 91, ${night ? 0.17 + flicker * 0.08 : 0.08})`);
    lampGlow.addColorStop(1, "rgba(244, 174, 91, 0)");
    ctx.fillStyle = lampGlow;
    ctx.fillRect(352, 126, 400, 400);

    for (let index = 0; index < 9; index += 1) {
      const x = 48 + ((index * 97 + (reducedMotion ? 0 : time * 0.006)) % 620);
      const y = 180 + ((index * 137 + (reducedMotion ? 0 : time * 0.011)) % 770);
      ctx.fillStyle = `rgba(226, 194, 137, ${0.035 + (index % 3) * 0.018})`;
      ctx.fillRect(x, y, index % 3 === 0 ? 2 : 1, index % 3 === 0 ? 2 : 1);
    }
  }

  private drawAtmosphere(time: number, night: boolean, reducedMotion: boolean): void {
    const ctx = this.context;
    const pulse = reducedMotion ? 0.5 : (Math.sin(time * 0.002) + 1) * 0.5;
    const glow = ctx.createRadialGradient(120, 500, 10, 120, 500, 420);
    glow.addColorStop(0, `rgba(226,168,93,${night ? 0.08 : 0.18 + pulse * 0.03})`);
    glow.addColorStop(1, "rgba(226,168,93,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 720, 1280);
    if (night) {
      ctx.fillStyle = "rgba(8,20,29,0.25)";
      ctx.fillRect(0, 0, 720, 1280);
    }
  }

  private drawThreat(contact: ThreatContact, time: number, reducedMotion: boolean): void {
    // T009 and T013 remain environment contacts with frost/spore evidence layers.
    const family = threatFamilyForId(contact.definitionId);
    if (!family) return;
    const clipId = threatClipForStage(contact.stage);
    const animationKey = `${contact.id}:${contact.stage}`;
    if (animationKey !== this.threatAnimationKey) {
      this.threatAnimationKey = animationKey;
      this.threatAnimationStartedAt = time;
    }
    const speedFactor = this.state?.settings.lowSpeed ? 0.5 : 1;
    const elapsed = (time - this.threatAnimationStartedAt) * speedFactor;
    const alpha = family === "crowd" && contact.definitionId === "T008"
      ? 0.68
      : contact.stage === "approach" ? 0.78 : contact.stage === "resolve" ? 0.62 : 1;
    this.drawThreatAtlasFrame(family, clipId, elapsed, reducedMotion, alpha);
  }

  private drawThreatRetreat(retreat: ThreatRetreatVisual, time: number, reducedMotion: boolean): void {
    const elapsed = Math.max(0, time - retreat.startedAt);
    const progress = Math.min(1, elapsed / THREAT_RETREAT_DURATION_MS);
    this.drawThreatAtlasFrame(retreat.family, "resolve", elapsed, reducedMotion, 0.72 * (1 - progress * 0.55));
  }

  private drawThreatAtlasFrame(
    family: ThreatFamilyId,
    clipId: ThreatClipId,
    elapsedMs: number,
    reducedMotion: boolean,
    alpha: number,
  ): void {
    const manifest = THREAT_ATLASES[family];
    const key: ThreatArtKey = `v2-threat-${family}`;
    const image = this.images.get(key);
    if (!image?.complete || image.naturalWidth === 0) return;
    const clip = manifest.clips[clipId];
    const elapsedFrame = Math.floor(elapsedMs * clip.fps / 1000);
    const offset = reducedMotion ? clip.keyFrame : Math.min(clip.frames - 1, elapsedFrame);
    const frame = clip.start + offset;
    const column = frame % manifest.columns;
    const row = Math.floor(frame / manifest.columns);
    const sourceX = Math.floor(column * image.naturalWidth / manifest.columns);
    const sourceRight = Math.floor((column + 1) * image.naturalWidth / manifest.columns);
    const sourceY = Math.floor(row * image.naturalHeight / manifest.rows);
    const sourceBottom = Math.floor((row + 1) * image.naturalHeight / manifest.rows);
    const destination = manifest.destination;
    const ctx = this.context;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceRight - sourceX,
      sourceBottom - sourceY,
      destination.x * 720,
      destination.y * 1280,
      destination.width * 720,
      destination.height * 1280,
    );
    ctx.restore();
  }

  private drawThreatImpact(contact: ThreatContact, time: number, reducedMotion: boolean): void {
    if (!["warning", "attack", "breach"].includes(contact.stage)) return;
    if (["T004", "T005", "T006", "T008", "T009", "T013"].includes(contact.definitionId)) return;
    const ctx = this.context;
    const urgent = contact.stage === "attack" || contact.stage === "breach";
    const flash = reducedMotion ? 0.35 : (Math.sin(time * (urgent ? 0.018 : 0.008)) + 1) * 0.5;

    ctx.save();
    ctx.strokeStyle = `rgba(194, 96, 78, ${urgent ? 0.48 + flash * 0.35 : 0.2 + flash * 0.18})`;
    ctx.lineWidth = urgent ? 7 : 3;
    if (contact.definitionId === "T003") {
      for (let index = 0; index < 4; index += 1) {
        const x = 246 + index * 80;
        ctx.beginPath();
        ctx.moveTo(x, 52);
        ctx.lineTo(x - 18, 124 + index * 9);
        ctx.lineTo(x + 6, 174 + index * 7);
        ctx.stroke();
      }
    } else {
      const originX = 622;
      const originY = 386;
      for (let index = 0; index < 6; index += 1) {
        const angle = -1.5 + index * 0.56;
        const length = urgent ? 104 : 54;
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(originX + Math.cos(angle) * length, originY + Math.sin(angle) * length);
        ctx.stroke();
      }
    }
    if (urgent) {
      const danger = ctx.createRadialGradient(620, 365, 30, 620, 365, 430);
      danger.addColorStop(0, `rgba(194, 96, 78, ${0.08 + flash * 0.12})`);
      danger.addColorStop(1, "rgba(194, 96, 78, 0)");
      ctx.fillStyle = danger;
      ctx.fillRect(0, 0, 720, 900);
    }
    ctx.restore();
  }
}
