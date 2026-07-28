import type { AppState, CarriageId, ContactStage, ThreatContact } from "./types";

type CarriageArtKey = `carriage-${CarriageId}`;
type StoryThreatArtKey = "threat-t004-scene" | "threat-t005-scene" | "threat-t006-scene" | "threat-t008-scene" | "threat-t009-scene";
type GreenArtKey = "carriage-greentide" | "greentide-branch-equipment";
type ArtKey = CarriageArtKey | StoryThreatArtKey | GreenArtKey | "carriage-frostline" | "night" | "menu" | "threat-knocker" | "threat-clinger";

const ART_SOURCES: Record<ArtKey, string> = {
  "carriage-sleep": "./assets/art/carriage-sleep.png",
  "carriage-defense": "./assets/art/carriage-defense.png",
  "carriage-workshop": "./assets/art/carriage-workshop.png",
  "carriage-greenhouse": "./assets/art/carriage-greenhouse.png",
  "carriage-kitchen": "./assets/art/carriage-kitchen.png",
  night: "./assets/art/carriage-night.png",
  menu: "./assets/art/carriage-menu.png",
  "threat-knocker": "./assets/art/threat-knocker.png",
  "threat-clinger": "./assets/art/threat-clinger.png",
  "threat-t004-scene": "./assets/art/story/threat-fog-vine-gpt-v1.png",
  "threat-t005-scene": "./assets/art/story/threat-echo-passenger-gpt-v1.png",
  "threat-t006-scene": "./assets/art/story/threat-silent-crowd-gpt-v1.png",
  "carriage-frostline": "./assets/art/story/carriage-frostline-gpt-v1.png",
  "threat-t009-scene": "./assets/art/story/threat-blizzard-gpt-v1.png",
  "carriage-greentide": "./assets/art/story/carriage-greentide-gpt-v1.png",
  "threat-t008-scene": "./assets/art/story/threat-t008-gpt-v1.png",
  "greentide-branch-equipment": "./assets/art/story/greentide-branch-equipment-gpt-v1.png",
};

export class SceneRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly images = new Map<ArtKey, HTMLImageElement>();
  private animationFrame = 0;
  private state: AppState | null = null;

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
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const phase = state?.run?.phase;
    const contact = state?.run?.activeContact;
    const whiteFrost = state?.run?.routeId === "R02";
    const greenTide = state?.run?.routeId === "R03";
    const reducedMotion = this.motionIsReduced();
    const carriageArtKey: CarriageArtKey = `carriage-${state?.activeCarriageId ?? "greenhouse"}`;
    const storyThreatArtKey = this.storyThreatArtKey(contact);
    const artKey: ArtKey = state?.screen === "menu" || state?.screen === "result"
      ? "menu"
      : phase === "night" && storyThreatArtKey
        ? storyThreatArtKey
        : whiteFrost && state?.activeCarriageId === "defense"
          ? "carriage-frostline"
          : carriageArtKey;

    ctx.save();
    const sway = reducedMotion ? { x: 0, y: 0 } : this.trainSway(time);
    const impact = reducedMotion ? { x: 0, y: 0 } : this.impactShake(contact, time);
    ctx.translate(sway.x + impact.x, sway.y + impact.y);
    if (!this.drawArt(artKey)) this.drawFallback(artKey, time, phase === "night");
    this.drawWindowMotion(time, phase === "night", reducedMotion);
    this.drawCarriageLife(time, phase === "night", reducedMotion);
    this.drawAtmosphere(time, phase === "night", reducedMotion);
    if (whiteFrost) this.drawWhiteFrostRoute(time, reducedMotion);
    if (greenTide) this.drawGreenTideRoute(time, reducedMotion);
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

  private storyThreatArtKey(contact: ThreatContact | undefined): StoryThreatArtKey | undefined {
    if (!contact || !["T004", "T005", "T006", "T008", "T009"].includes(contact.definitionId)) return undefined;
    return `threat-${contact.definitionId.toLowerCase()}-scene` as StoryThreatArtKey;
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
    const image = this.images.get("carriage-greentide");
    if (!image?.complete || image.naturalWidth === 0) return;
    const ratio = Math.max(720 / image.naturalWidth, 1280 / image.naturalHeight);
    const width = image.naturalWidth * ratio;
    const height = image.naturalHeight * ratio;
    const ctx = this.context;
    ctx.save();
    ctx.globalAlpha = 0.58;
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(image, (720 - width) / 2, (1280 - height) / 2, width, height);
    ctx.restore();
  }

  private drawGreenBranchEquipmentLayer(branch: "CULTIVATE" | "FILTER" | "PURGE"): boolean {
    const image = this.images.get("greentide-branch-equipment");
    if (!image?.complete || image.naturalWidth === 0) return false;
    const branchIndex = branch === "CULTIVATE" ? 0 : branch === "FILTER" ? 1 : 2;
    const sourceWidth = image.naturalWidth / 3;
    const ctx = this.context;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(image, sourceWidth * branchIndex, 0, sourceWidth, image.naturalHeight, 0, 0, 720, 1280);
    ctx.restore();
    return true;
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

  private drawWindowMotion(time: number, night: boolean, reducedMotion: boolean): void {
    const speed = reducedMotion ? 0 : night ? 0.085 : 0.055;
    this.drawWindowWeather({ x: 276, y: 218, width: 181, height: 238 }, time, speed, night, 0);
    this.drawWindowWeather({ x: 602, y: 198, width: 128, height: 396 }, time, speed * 1.18, night, 41);

    const ctx = this.context;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(284, 220, 166, 235, 32);
    ctx.clip();
    for (let index = 0; index < 7; index += 1) {
      const progress = ((index * 0.19 + time * speed * 0.00012) % 1 + 1) % 1;
      const y = 330 + progress * 142;
      const halfWidth = 12 + progress * 72;
      ctx.strokeStyle = `rgba(183, 211, 220, ${0.08 + progress * 0.22})`;
      ctx.lineWidth = 1 + progress * 3;
      ctx.beginPath();
      ctx.moveTo(366 - halfWidth, y);
      ctx.lineTo(366 + halfWidth, y);
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

  private drawCarriageLife(time: number, night: boolean, reducedMotion: boolean): void {
    const ctx = this.context;
    const pulse = reducedMotion ? 0.45 : (Math.sin(time * 0.0024) + 1) * 0.5;
    const flicker = reducedMotion ? 0.5 : (Math.sin(time * 0.019) + Math.sin(time * 0.007) + 2) * 0.25;

    const lampGlow = ctx.createRadialGradient(552, 326, 8, 552, 326, 190);
    lampGlow.addColorStop(0, `rgba(244, 174, 91, ${night ? 0.17 + flicker * 0.08 : 0.08})`);
    lampGlow.addColorStop(1, "rgba(244, 174, 91, 0)");
    ctx.fillStyle = lampGlow;
    ctx.fillRect(352, 126, 400, 400);

    const breathY = 580 - pulse * 7;
    ctx.strokeStyle = `rgba(221, 235, 235, ${night ? 0.04 + pulse * 0.08 : 0.025})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(428, breathY, 18 + pulse * 7, Math.PI * 1.1, Math.PI * 1.78);
    ctx.stroke();

    const blanketGlow = ctx.createRadialGradient(473, 675, 10, 473, 675, 155);
    blanketGlow.addColorStop(0, `rgba(226, 168, 93, ${night ? 0.018 + pulse * 0.026 : 0.012})`);
    blanketGlow.addColorStop(1, "rgba(226, 168, 93, 0)");
    ctx.fillStyle = blanketGlow;
    ctx.fillRect(300, 510, 350, 330);

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
    // Story threats use scene plates or the R03 procedural spore layer with readable HTML interaction zones.
    if (this.storyThreatArtKey(contact) || contact.definitionId === "T013") return;
    const key: ArtKey = contact.definitionId === "T003" ? "threat-clinger" : "threat-knocker";
    const image = this.images.get(key);
    const ctx = this.context;
    const stage = this.threatStageMotion(contact.stage, time, reducedMotion);
    ctx.save();
    ctx.globalAlpha = stage.alpha;
    if (image?.complete && image.naturalWidth > 0) {
      const isClinger = key === "threat-clinger";
      const size = (isClinger ? 520 : 390) * stage.scale;
      const centerX = (isClinger ? 465 : 590) + stage.offsetX;
      const centerY = (isClinger ? 265 : 376) + stage.offsetY;
      ctx.drawImage(image, centerX - size / 2, centerY - size / 2, size, size);
    } else {
      ctx.fillStyle = "rgba(20, 24, 25, 0.88)";
      ctx.beginPath();
      ctx.arc(455, 250, 56 * stage.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(421, 290, 68, 180);
    }
    ctx.restore();
  }

  private threatStageMotion(stage: ContactStage, time: number, reducedMotion: boolean): { alpha: number; scale: number; offsetX: number; offsetY: number } {
    const drift = reducedMotion ? 0 : Math.sin(time * 0.0034);
    const lunge = reducedMotion ? 0 : Math.max(0, Math.sin(time * 0.013));
    switch (stage) {
      case "approach":
        return { alpha: 0.3, scale: 0.58 + drift * 0.015, offsetX: 72, offsetY: -36 + drift * 7 };
      case "warning":
        return { alpha: 0.74, scale: 0.82 + drift * 0.025, offsetX: 24, offsetY: drift * 7 };
      case "attack":
        return { alpha: 0.96, scale: 1.03 + lunge * 0.09, offsetX: -8 - lunge * 14, offsetY: lunge * 9 };
      case "breach":
        return { alpha: 1, scale: 1.13 + lunge * 0.05, offsetX: -28, offsetY: 24 };
      case "resolve":
        return { alpha: 0.24, scale: 0.88, offsetX: 88, offsetY: -30 };
    }
  }

  private drawThreatImpact(contact: ThreatContact, time: number, reducedMotion: boolean): void {
    if (!["warning", "attack", "breach"].includes(contact.stage)) return;
    if (contact.definitionId === "T008" || contact.definitionId === "T013") return;
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
