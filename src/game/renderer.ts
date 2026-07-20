import type { AppState, ContactStage, ThreatContact } from "./types";

type ArtKey = "prep" | "night" | "menu" | "threat-knocker" | "threat-clinger";

const ART_SOURCES: Record<ArtKey, string> = {
  prep: "./assets/art/carriage-prep.png",
  night: "./assets/art/carriage-night.png",
  menu: "./assets/art/carriage-menu.png",
  "threat-knocker": "./assets/art/threat-knocker.png",
  "threat-clinger": "./assets/art/threat-clinger.png",
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
    const reducedMotion = this.motionIsReduced();
    const artKey: ArtKey = state?.screen === "menu" || state?.screen === "result" ? "menu" : phase === "night" ? "night" : "prep";

    ctx.save();
    const sway = reducedMotion ? { x: 0, y: 0 } : this.trainSway(time);
    const impact = reducedMotion ? { x: 0, y: 0 } : this.impactShake(contact, time);
    ctx.translate(sway.x + impact.x, sway.y + impact.y);
    if (!this.drawArt(artKey)) this.drawFallback(artKey, time);
    this.drawWindowMotion(time, phase === "night", reducedMotion);
    this.drawCarriageLife(time, phase === "night", reducedMotion);
    this.drawAtmosphere(time, phase === "night", reducedMotion);
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

  private drawArt(key: ArtKey): boolean {
    const image = this.images.get(key);
    if (!image?.complete || image.naturalWidth === 0) return false;
    const ratio = Math.max(720 / image.naturalWidth, 1280 / image.naturalHeight) * 1.012;
    const width = image.naturalWidth * ratio;
    const height = image.naturalHeight * ratio;
    this.context.drawImage(image, (720 - width) / 2, (1280 - height) / 2, width, height);
    return true;
  }

  private drawFallback(key: ArtKey, time: number): void {
    const ctx = this.context;
    const night = key === "night";
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
