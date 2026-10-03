import type { AppState, CarriageId, ThreatContact } from "./types";
import { BoundedLoadQueue } from "./scene-loader";
import {
  A07_ATLAS,
  A07_CLIP_ATLASES,
  CARRIAGE_SCENES,
  COSMETIC_VISUALS,
  EFFECT_ATLAS,
  EQUIPMENT_ATLAS,
  PROP_ATLAS,
  SCENE_STATE_EQUIPMENT,
  THREAT_ATLASES,
  THREAT_RETREAT_DURATION_MS,
  a07PlaybackForScene,
  installedFacilityVisuals,
  nextA07ClipId,
  sceneVisualState,
  sceneAssetPriority,
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
  type SceneAssetKey,
  type A07ClipId,
} from "./scene-manifest";

type CarriageArtKey = `v2-carriage-${CarriageId}`;
type ThreatArtKey = `v2-threat-${ThreatFamilyId}`;
type ArtKey = SceneAssetKey;

const ART_SOURCES: Record<ArtKey, string> = {
  "v2-carriage-sleep": CARRIAGE_SCENES.sleep.source,
  "v2-carriage-defense": CARRIAGE_SCENES.defense.source,
  "v2-carriage-workshop": CARRIAGE_SCENES.workshop.source,
  "v2-carriage-greenhouse": CARRIAGE_SCENES.greenhouse.source,
  "v2-carriage-kitchen": CARRIAGE_SCENES.kitchen.source,
  "a07-clip-sleep": A07_CLIP_ATLASES.sleep.source,
  "a07-clip-turn": A07_CLIP_ATLASES.turn.source,
  "a07-clip-listen": A07_CLIP_ATLASES.listen.source,
  "a07-clip-startle": A07_CLIP_ATLASES.startle.source,
  "a07-clip-sit": A07_CLIP_ATLASES.sit.source,
  "a07-clip-drink": A07_CLIP_ATLASES.drink.source,
  "a07-clip-settle": A07_CLIP_ATLASES.settle.source,
  "equipment-atlas": EQUIPMENT_ATLAS.source,
  "prop-atlas": PROP_ATLAS.source,
  "effect-atlas": EFFECT_ATLAS.source,
  "v2-threat-knocker": THREAT_ATLASES.knocker.source,
  "v2-threat-clinger": THREAT_ATLASES.clinger.source,
  "v2-threat-vine": THREAT_ATLASES.vine.source,
  "v2-threat-echo": THREAT_ATLASES.echo.source,
  "v2-threat-crowd": THREAT_ATLASES.crowd.source,
};

// Kept only as migration/provenance references. These full-scene plates are not
// loaded into ART_SOURCES and never replace a v2 carriage during a contact.
export const LEGACY_STORY_PLATE_REFERENCES = [
  "./assets/art/carriage-menu.png",
  "./assets/art/carriage-night.png",
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
  private static readonly MAX_RESIDENT_PIXELS = 10_000_000;
  private readonly context: CanvasRenderingContext2D;
  private readonly images = new Map<ArtKey, HTMLImageElement>();
  private readonly imageLastUsed = new Map<ArtKey, number>();
  private readonly loadQueue: BoundedLoadQueue<ArtKey>;
  private pinnedAssets = new Set<ArtKey>();
  private prioritySignature = "";
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
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = "high";
    this.loadQueue = new BoundedLoadQueue(
      (key, attempt) => this.loadImage(key, attempt),
      {
        concurrency: 2,
        maxAttempts: 3,
        onLoaded: (key) => {
          this.imageLastUsed.set(key, performance.now());
          this.enforceResidentBudget();
          this.draw(performance.now());
        },
        onFailed: (key) => {
          const image = this.images.get(key);
          if (image) image.src = "";
          this.images.delete(key);
          this.imageLastUsed.delete(key);
        },
      },
    );
    this.updateAssetPriority(null);
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
    this.updateAssetPriority(state);
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

  private updateAssetPriority(state: AppState | null): void {
    const a07ClipId = a07PlaybackForScene(state?.screen ?? "menu", state?.run ?? undefined).clipId;
    const priority = sceneAssetPriority({
      screen: state?.screen ?? "menu",
      activeCarriageId: state?.activeCarriageId ?? "sleep",
      activeThreatDefinitionId: state?.run?.activeContact?.definitionId,
      retreatFamily: this.threatVisualLifecycle.retreat?.family,
      a07ClipId,
      a07NextClipId: nextA07ClipId(a07ClipId),
    });
    const signature = priority.join("|");
    this.pinnedAssets = new Set(priority);
    if (signature !== this.prioritySignature) {
      this.prioritySignature = signature;
      this.loadQueue.setPriority(priority);
    }
    this.enforceResidentBudget();
  }

  private loadImage(key: ArtKey, _attempt: number): Promise<void> {
    const source = ART_SOURCES[key];
    let image = this.images.get(key);
    if (!image) {
      image = new Image();
      image.decoding = "async";
      this.images.set(key, image);
    }
    image.onload = null;
    image.onerror = null;
    image.src = "";
    return new Promise((resolve, reject) => {
      image!.onload = () => {
        void image!.decode().then(resolve, reject);
      };
      image!.onerror = () => reject(new Error(`Cannot load scene asset ${key}`));
      queueMicrotask(() => {
        image!.src = source;
      });
    });
  }

  private touchImage(key: ArtKey): HTMLImageElement | undefined {
    const image = this.images.get(key);
    if (!image?.complete || image.naturalWidth === 0) return undefined;
    this.imageLastUsed.set(key, performance.now());
    return image;
  }

  private enforceResidentBudget(): void {
    let residentPixels = 0;
    const candidates: Array<{ key: ArtKey; pixels: number; used: number }> = [];
    for (const [key, image] of this.images) {
      if (!image.complete || image.naturalWidth === 0) continue;
      const pixels = image.naturalWidth * image.naturalHeight;
      residentPixels += pixels;
      if (!this.pinnedAssets.has(key) && !this.loadQueue.isLoading(key)) {
        candidates.push({ key, pixels, used: this.imageLastUsed.get(key) ?? 0 });
      }
    }
    candidates.sort((left, right) => left.used - right.used);
    for (const candidate of candidates) {
      if (residentPixels <= SceneRenderer.MAX_RESIDENT_PIXELS) break;
      const image = this.images.get(candidate.key);
      if (image) image.src = "";
      this.images.delete(candidate.key);
      this.imageLastUsed.delete(candidate.key);
      this.loadQueue.evict(candidate.key);
      residentPixels -= candidate.pixels;
    }
  }

  private drawWhiteFrostRoute(_time: number, _reducedMotion: boolean): void {
    const whiteFrost = this.state?.run?.story.whiteFrost;
    if (!whiteFrost) return;
    const carriageId = this.state?.activeCarriageId ?? "sleep";
    for (const bounds of CARRIAGE_SCENES[carriageId].weatherWindows) {
      const ctx = this.context;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(bounds.x * 720, bounds.y * 1280, bounds.width * 720, bounds.height * 1280, 24);
      ctx.clip();
      this.drawAtlasFrameRect("effect-atlas", EFFECT_ATLAS, EFFECT_ATLAS.frames.frost,
        bounds.x * 720, bounds.y * 1280, bounds.width * 720, bounds.height * 1280, 0.44);
      ctx.restore();
    }
    const branch = whiteFrost.branch;
    const branchCarriage = branch === "CARE" ? "sleep" : branch === "CLEAR" ? "defense"
      : branch === "SUSTAIN" ? "greenhouse" : undefined;
    if (branch && carriageId === branchCarriage) {
      const frame = branch === "CARE" ? PROP_ATLAS.frames.firstaid
        : branch === "CLEAR" ? PROP_ATLAS.frames.toolbox : PROP_ATLAS.frames.heater;
      this.drawAtlasFrame("prop-atlas", PROP_ATLAS, frame, branch === "SUSTAIN" ? 160 : 550, 620, 220, 0.9);
    }
  }

  private drawGreenTideRoute(time: number, reducedMotion: boolean): void {
    const run = this.state?.run;
    const greenTide = run?.story.greenTide;
    if (!run || !greenTide) return;
    const activeCarriage = this.state?.activeCarriageId;
    const contact = run.activeContact;
    const contamination = Math.max(0, Math.min(100, greenTide.reservoirContamination));

    if (activeCarriage === "greenhouse") {
      this.drawGreenCarriageLayer();
      const still = reducedMotion || this.state?.nightPaused;
      const leaf = EFFECT_ATLAS.frames.leaf;
      const frame = leaf.start + (still ? 0 : Math.floor(time * leaf.fps / 1000) % leaf.frames);
      this.drawAtlasFrame("effect-atlas", EFFECT_ATLAS, frame, 190, 580, 360, 0.4);
      if (contamination > 0 || contact?.definitionId === "T013") this.drawSporeContamination(time, reducedMotion);
    }
    const branchCarriage = greenTide.branch === "CULTIVATE" ? "greenhouse"
      : greenTide.branch === "FILTER" ? "workshop" : greenTide.branch === "PURGE" ? "defense" : undefined;
    if (greenTide.branch && activeCarriage === branchCarriage) {
      this.drawGreenBranchEquipmentLayer(greenTide.branch);
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

  private drawGreenBranchEquipmentLayer(branch: "CULTIVATE" | "FILTER" | "PURGE"): void {
    const resolved = Boolean(this.state?.run?.story.greenTide?.branchOperationComplete);
    const frame = branch === "CULTIVATE" ? PROP_ATLAS.frames.seedbox
      : branch === "FILTER" ? PROP_ATLAS.frames.waterfilter : PROP_ATLAS.frames.toolbox;
    const anchor = branch === "CULTIVATE" ? { x: 154, y: 628, size: 228 }
      : branch === "FILTER" ? { x: 548, y: 520, size: 232 } : { x: 560, y: 500, size: 210 };
    this.drawAtlasFrame("prop-atlas", PROP_ATLAS, frame, anchor.x, anchor.y, anchor.size, resolved ? 1 : 0.86);
  }

  private drawSporeContamination(time: number, reducedMotion: boolean): void {
    const drift = reducedMotion || this.state?.nightPaused ? 0 : Math.sin(time * 0.00045) * 18;
    this.drawAtlasFrame("effect-atlas", EFFECT_ATLAS, EFFECT_ATLAS.frames.spores, 360 + drift, 570, 610, 0.38);
  }

  private drawArt(key: ArtKey): boolean {
    const image = this.touchImage(key);
    if (!image) return false;
    const ratio = Math.max(720 / image.naturalWidth, 1280 / image.naturalHeight) * 1.012;
    const width = image.naturalWidth * ratio;
    const height = image.naturalHeight * ratio;
    this.context.drawImage(image, (720 - width) / 2, (1280 - height) / 2, width, height);
    return true;
  }

  private drawFallback(_key: ArtKey, _time: number, night = false): void {
    const ctx = this.context;
    const gradient = ctx.createLinearGradient(0, 0, 0, 1280);
    gradient.addColorStop(0, night ? "#16232b" : "#3c3329");
    gradient.addColorStop(0.45, night ? "#20292d" : "#6b4a29");
    gradient.addColorStop(1, "#15191c");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 720, 1280);
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

    const paused = speed === 0 || this.state?.nightPaused;
    const drift = paused ? 0 : ((time * speed * 0.025 + seedOffset) % 24) - 12;
    this.drawAtlasFrameRect("effect-atlas", EFFECT_ATLAS, EFFECT_ATLAS.frames.mist,
      windowBox.x + drift, windowBox.y, windowBox.width, windowBox.height, night ? 0.22 : 0.16);
    this.drawAtlasFrameRect("effect-atlas", EFFECT_ATLAS, EFFECT_ATLAS.frames.rain,
      windowBox.x, windowBox.y + drift * 0.5, windowBox.width, windowBox.height, night ? 0.42 : 0.32);
    ctx.restore();
  }

  private drawA07Passenger(time: number, reducedMotion: boolean): void {
    const playback = a07PlaybackForScene(this.state?.screen ?? "menu", this.state?.run ?? undefined);
    const clipId = playback.clipId;
    const clip = A07_CLIP_ATLASES[clipId];
    const key: `a07-clip-${A07ClipId}` = `a07-clip-${clipId}`;
    const image = this.touchImage(key);
    if (!image) return;
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
    const sourceX = Math.floor(offset * A07_ATLAS.width / A07_ATLAS.columns);
    const sourceRight = Math.floor((offset + 1) * A07_ATLAS.width / A07_ATLAS.columns);
    const sourceY = 0;
    const sourceBottom = image.naturalHeight;
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
    const still = reducedMotion || this.state?.nightPaused;
    const animatedFrame = (clip: { start: number; frames: number; fps: number }) =>
      clip.start + (still ? 0 : Math.floor(time * clip.fps / 1000) % clip.frames);
    if (carriageId === "sleep") {
      const frame = visualState === "secure" || visualState === "restored"
        ? PROP_ATLAS.frames.blanket : PROP_ATLAS.frames.lantern;
      const foldedQuilt = visualState === "secure" || visualState === "restored";
      this.drawAtlasFrame("prop-atlas", PROP_ATLAS, frame,
        foldedQuilt ? 560 : 108, foldedQuilt ? 994 : 810,
        foldedQuilt ? 148 : 110, 0.86);
    } else if (carriageId === "defense") {
      const frame = visualState === "breached" ? PROP_ATLAS.frames.toolbox : PROP_ATLAS.frames.storage;
      this.drawAtlasFrame("prop-atlas", PROP_ATLAS, frame, 585, 430, 190, 0.74);
    } else if (carriageId === "workshop") {
      const frame = visualState === "overloaded" ? PROP_ATLAS.frames.battery : PROP_ATLAS.frames.radio;
      this.drawAtlasFrame("prop-atlas", PROP_ATLAS, frame, 550, 480, 190, 0.76);
    } else if (carriageId === "greenhouse") {
      if (visualState === "contaminated") {
        this.drawAtlasFrame("effect-atlas", EFFECT_ATLAS, EFFECT_ATLAS.frames.spores, 210, 610, 360, 0.3);
      } else if (visualState === "productive" || visualState === "restored") {
        this.drawAtlasFrame("effect-atlas", EFFECT_ATLAS, animatedFrame(EFFECT_ATLAS.frames.leaf), 190, 575, 330, 0.48);
      }
    } else if (visualState === "prepared" || visualState === "restored") {
      this.drawAtlasFrame("effect-atlas", EFFECT_ATLAS, animatedFrame(EFFECT_ATLAS.frames.steam), 205, 430, 230, 0.52);
    } else if (visualState === "spoiled") {
      this.drawAtlasFrame("effect-atlas", EFFECT_ATLAS, EFFECT_ATLAS.frames.mist, 520, 510, 290, 0.28);
    }
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
    if (visual.detail !== "lamp") return;
    ctx.save();
    ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, size * 0.55);
    glow.addColorStop(0, "rgba(255,233,173,0.38)");
    glow.addColorStop(1, "rgba(242,189,103,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-size * 0.55, -size * 0.55, size * 1.1, size * 1.1);
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
    const image = this.touchImage("equipment-atlas");
    if (!image || frame < 0 || frame >= EQUIPMENT_ATLAS.frameCount) return false;
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

  private drawAtlasFrame(
    key: ArtKey,
    atlas: { columns: number; rows: number; frameCount: number },
    frame: number,
    centerX: number,
    centerY: number,
    size: number,
    alpha = 1,
  ): boolean {
    return this.drawAtlasFrameRect(key, atlas, frame, centerX - size / 2, centerY - size / 2, size, size, alpha);
  }

  private drawAtlasFrameRect(
    key: ArtKey,
    atlas: { columns: number; rows: number; frameCount: number },
    frame: number,
    x: number,
    y: number,
    width: number,
    height: number,
    alpha = 1,
  ): boolean {
    const image = this.touchImage(key);
    if (!image || frame < 0 || frame >= atlas.frameCount) return false;
    const column = frame % atlas.columns;
    const row = Math.floor(frame / atlas.columns);
    const sourceX = Math.floor(column * image.naturalWidth / atlas.columns);
    const sourceRight = Math.floor((column + 1) * image.naturalWidth / atlas.columns);
    const sourceY = Math.floor(row * image.naturalHeight / atlas.rows);
    const sourceBottom = Math.floor((row + 1) * image.naturalHeight / atlas.rows);
    this.context.save();
    this.context.globalAlpha = alpha;
    this.context.drawImage(image, sourceX, sourceY, sourceRight - sourceX, sourceBottom - sourceY, x, y, width, height);
    this.context.restore();
    return true;
  }

  private drawFacilityVisual(visual: FacilityVisual): void {
    const x = visual.anchor.x * 720;
    const y = visual.anchor.y * 1280;
    this.drawEquipmentFrame(visual.equipmentFrame, x, y, 170);
  }

  private drawCarriageLife(time: number, night: boolean, reducedMotion: boolean): void {
    const ctx = this.context;
    const still = reducedMotion || this.state?.nightPaused;
    const flicker = still ? 0.5 : (Math.sin(time * 0.019) + Math.sin(time * 0.007) + 2) * 0.25;

    const lampGlow = ctx.createRadialGradient(552, 326, 8, 552, 326, 190);
    lampGlow.addColorStop(0, `rgba(244, 174, 91, ${night ? 0.1 + flicker * 0.045 : 0.045})`);
    lampGlow.addColorStop(1, "rgba(244, 174, 91, 0)");
    ctx.fillStyle = lampGlow;
    ctx.fillRect(352, 126, 400, 400);

    const carriageId = this.state?.activeCarriageId;
    const clip = carriageId === "greenhouse" ? EFFECT_ATLAS.frames.leaf
      : carriageId === "kitchen" ? EFFECT_ATLAS.frames.flame : undefined;
    if (clip) {
      const frame = clip.start + (still ? 0 : Math.floor(time * clip.fps / 1000) % clip.frames);
      const x = carriageId === "greenhouse" ? 180 : 190;
      const y = carriageId === "greenhouse" ? 570 : 510;
      this.drawAtlasFrame("effect-atlas", EFFECT_ATLAS, frame, x, y, 190, 0.32);
    }
  }

  private drawAtmosphere(time: number, night: boolean, reducedMotion: boolean): void {
    const ctx = this.context;
    const pulse = reducedMotion ? 0.5 : (Math.sin(time * 0.002) + 1) * 0.5;
    const glow = ctx.createRadialGradient(120, 500, 10, 120, 500, 420);
    glow.addColorStop(0, `rgba(226,168,93,${night ? 0.035 : 0.075 + pulse * 0.015})`);
    glow.addColorStop(1, "rgba(226,168,93,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 720, 1280);
    if (night) {
      ctx.fillStyle = "rgba(8,20,29,0.11)";
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
    const image = this.touchImage(key);
    if (!image) return;
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
