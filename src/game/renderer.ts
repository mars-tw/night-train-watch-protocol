import type { AppState } from "./types";

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
    const artKey: ArtKey = state?.screen === "menu" || state?.screen === "result" ? "menu" : phase === "night" ? "night" : "prep";
    if (!this.drawArt(artKey)) this.drawFallback(artKey, time);
    this.drawAtmosphere(time, phase === "night");
    if (phase === "night" && state?.run?.activeContact) this.drawThreat(state.run.activeContact.definitionId, time);
    if (!["carriage", "menu", "result"].includes(state?.screen ?? "")) {
      ctx.fillStyle = "rgba(9, 14, 18, 0.74)";
      ctx.fillRect(0, 0, 720, 1280);
    }
  }

  private drawArt(key: ArtKey): boolean {
    const image = this.images.get(key);
    if (!image?.complete || image.naturalWidth === 0) return false;
    const ratio = Math.max(720 / image.naturalWidth, 1280 / image.naturalHeight);
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

  private drawAtmosphere(time: number, night: boolean): void {
    const ctx = this.context;
    const pulse = (Math.sin(time * 0.002) + 1) * 0.5;
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

  private drawThreat(definitionId: string, time: number): void {
    const key: ArtKey = definitionId === "T003" ? "threat-clinger" : "threat-knocker";
    const image = this.images.get(key);
    const ctx = this.context;
    const pulse = 1 + Math.sin(time * 0.008) * 0.025;
    ctx.save();
    ctx.globalAlpha = 0.88;
    if (image?.complete && image.naturalWidth > 0) {
      const isClinger = key === "threat-clinger";
      const size = (isClinger ? 480 : 320) * pulse;
      const centerX = isClinger ? 500 : 560;
      const centerY = isClinger ? 350 : 330;
      ctx.drawImage(image, centerX - size / 2, centerY - size / 2, size, size);
    } else {
      ctx.fillStyle = "rgba(20, 24, 25, 0.88)";
      ctx.beginPath();
      ctx.arc(455, 250, 56 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(421, 290, 68, 180);
    }
    ctx.restore();
  }
}
