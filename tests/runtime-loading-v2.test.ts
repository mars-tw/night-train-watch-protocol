import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { BoundedLoadQueue } from "../src/game/scene-loader";
import {
  A07_ATLAS,
  A07_CLIP_ATLASES,
  CARRIAGE_SCENES,
  EFFECT_ATLAS,
  EQUIPMENT_ATLAS,
  PROP_ATLAS,
  THREAT_ATLASES,
  sceneAssetPriority,
} from "../src/game/scene-manifest";

const workspace = resolve(import.meta.dirname, "..");
const artRoot = resolve(workspace, "public/assets/art/v2");
const renderer = readFileSync(resolve(workspace, "src/game/renderer.ts"), "utf8");
const compressionScript = readFileSync(resolve(workspace, "tools/compress-v2-runtime.py"), "utf8");
const compression = JSON.parse(readFileSync(resolve(artRoot, "compression-report.json"), "utf8")) as {
  codec: string;
  pillowVersion: string;
  settings: { lossless: boolean; quality: number; method: number; exact: boolean };
  sourceTool: string;
  sourceModelIdentifier: string | null;
  assetCount: number;
  pngBytes: number;
  webpBytes: number;
  savedBytes: number;
  pngMiB: number;
  webpMiB: number;
  firstMenu: { assets: string[]; bytes: number; miB: number };
  allDimensionsExact: boolean;
  allAlphaExact: boolean;
  allVisibleRgbExact: boolean;
  allIccExact: boolean;
  assets: Array<{
    png: string;
    webp: string;
    pngBytes: number;
    webpBytes: number;
    pngSha256: string;
    webpSha256: string;
    alphaExact: boolean;
    visibleRgbExact: boolean;
    alphaMismatches: number;
    visibleRgbMismatches: number;
    width: number;
    height: number;
    pngIccBytes: number;
    webpIccBytes: number;
    iccExact: boolean;
    pngGamma: number | null;
    pngSrgbIntent: number | null;
  }>;
};

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("v2 lossless runtime loading", () => {
  it("ships twelve verified lossless WebPs while preserving every PNG", () => {
    expect(compression).toMatchObject({
      codec: "Pillow lossless WebP",
      settings: { lossless: true, quality: 100, method: 6, exact: true },
      sourceTool: "OpenAI built-in image generation tool",
      sourceModelIdentifier: null,
      assetCount: 12,
      allDimensionsExact: true,
      allAlphaExact: true,
      allVisibleRgbExact: true,
      allIccExact: true,
    });
    expect(compression.webpBytes).toBeLessThan(compression.pngBytes);
    expect(compression.savedBytes).toBe(compression.pngBytes - compression.webpBytes);
    expect(compression.webpMiB).toBeLessThan(compression.pngMiB);
    expect(compression.firstMenu).toEqual({
      assets: ["carriages/sleep.webp", "characters/a07/atlas.webp"],
      bytes: 1_915_444,
      miB: 1.827,
    });
    expect(compression.firstMenu.miB).toBeLessThanOrEqual(6);
    let pngTotal = 0;
    let webpTotal = 0;
    for (const asset of compression.assets) {
      const png = resolve(artRoot, asset.png);
      const webp = resolve(artRoot, asset.webp);
      expect(existsSync(png)).toBe(true);
      expect(existsSync(webp)).toBe(true);
      expect(statSync(png).size).toBe(asset.pngBytes);
      expect(statSync(webp).size).toBe(asset.webpBytes);
      expect(sha256(png)).toBe(asset.pngSha256);
      expect(sha256(webp)).toBe(asset.webpSha256);
      expect(readFileSync(webp).subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(readFileSync(webp).subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(asset).toMatchObject({ alphaExact: true, visibleRgbExact: true, alphaMismatches: 0, visibleRgbMismatches: 0 });
      expect(asset.iccExact).toBe(true);
      expect(asset.webpIccBytes).toBe(asset.pngIccBytes);
      expect(asset.pngGamma).toBeCloseTo(0.45455, 5);
      expect(asset.pngSrgbIntent).toBe(3);
      expect(asset.width).toBeGreaterThan(0);
      expect(asset.height).toBeGreaterThan(0);
      pngTotal += asset.pngBytes;
      webpTotal += asset.webpBytes;
    }
    expect(pngTotal).toBe(compression.pngBytes);
    expect(webpTotal).toBe(compression.webpBytes);
    expect(compressionScript).toContain('"lossless": True');
    expect(compressionScript).toContain('"quality": 100');
    expect(compressionScript).toContain('"method": 6');
  });

  it("audits same-origin browser Canvas color and bounds semi-alpha rounding to one display level", async () => {
    const server = createServer((request, response) => {
      const rawPath = request.url === "/" ? "/index.html" : request.url ?? "/index.html";
      if (rawPath === "/index.html") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end("<!doctype html><canvas></canvas>");
        return;
      }
      const relative = decodeURIComponent(rawPath.replace(/^\//, ""));
      const absolute = resolve(artRoot, relative);
      if (!absolute.startsWith(artRoot) || !existsSync(absolute)) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, {
        "Content-Type": relative.endsWith(".webp") ? "image/webp" : "image/png",
        "Cache-Control": "no-store",
      });
      response.end(readFileSync(absolute));
    });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing browser color audit port");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${address.port}/`);
      const results = await page.evaluate(async (assets) => {
        const load = (source: string): Promise<HTMLImageElement> => new Promise((resolveImage, rejectImage) => {
          const image = new Image();
          image.onload = () => resolveImage(image);
          image.onerror = () => rejectImage(new Error(`Cannot load ${source}`));
          image.src = source;
        });
        const output: Array<{
          png: string;
          alphaMismatches: number;
          opaqueRgbMismatches: number;
          semiTransparentRgbMismatches: number;
          maxRawChannelDelta: number;
          composites: Array<{ background: string; mismatchPixels: number; maxChannelDelta: number }>;
        }> = [];
        for (const asset of assets) {
          const [png, webp] = await Promise.all([load(asset.png), load(asset.webp)]);
          const canvas = document.createElement("canvas");
          canvas.width = png.naturalWidth;
          canvas.height = png.naturalHeight;
          const context = canvas.getContext("2d", { willReadFrequently: true })!;
          context.drawImage(png, 0, 0);
          const pngPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(webp, 0, 0);
          const webpPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let alphaMismatches = 0;
          let opaqueRgbMismatches = 0;
          let semiTransparentRgbMismatches = 0;
          let maxRawChannelDelta = 0;
          for (let index = 0; index < pngPixels.length; index += 4) {
            if (pngPixels[index + 3] !== webpPixels[index + 3]) alphaMismatches += 1;
            if (pngPixels[index + 3]! > 0) {
              let different = false;
              for (let channel = 0; channel < 3; channel += 1) {
                const delta = Math.abs(pngPixels[index + channel]! - webpPixels[index + channel]!);
                if (delta > 0) different = true;
                maxRawChannelDelta = Math.max(maxRawChannelDelta, delta);
              }
              if (different && pngPixels[index + 3] === 255) opaqueRgbMismatches += 1;
              else if (different) semiTransparentRgbMismatches += 1;
            }
          }
          const composites = [];
          for (const background of ["#000000", "#efe2c4", "#9ab6b7"]) {
            context.fillStyle = background;
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(png, 0, 0);
            const pngComposite = context.getImageData(0, 0, canvas.width, canvas.height).data;
            context.fillStyle = background;
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(webp, 0, 0);
            const webpComposite = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let mismatchPixels = 0;
            let maxChannelDelta = 0;
            for (let index = 0; index < pngComposite.length; index += 4) {
              let different = false;
              for (let channel = 0; channel < 4; channel += 1) {
                const delta = Math.abs(pngComposite[index + channel]! - webpComposite[index + channel]!);
                if (delta > 0) different = true;
                maxChannelDelta = Math.max(maxChannelDelta, delta);
              }
              if (different) mismatchPixels += 1;
            }
            composites.push({ background, mismatchPixels, maxChannelDelta });
          }
          output.push({
            png: asset.png,
            alphaMismatches,
            opaqueRgbMismatches,
            semiTransparentRgbMismatches,
            maxRawChannelDelta,
            composites,
          });
        }
        return output;
      }, compression.assets.map((asset) => ({ png: asset.png, webp: asset.webp })));
      expect(results).toHaveLength(12);
      expect(results.every((result) => result.alphaMismatches === 0)).toBe(true);
      expect(results.every((result) => result.opaqueRgbMismatches === 0)).toBe(true);
      expect(results.slice(0, 5).every((result) =>
        result.semiTransparentRgbMismatches === 0 && result.maxRawChannelDelta === 0,
      )).toBe(true);
      expect(results.slice(5).every((result) =>
        result.semiTransparentRgbMismatches > 0 && result.maxRawChannelDelta <= 64,
      ), JSON.stringify(results)).toBe(true);
      expect(results.every((result) => result.composites.every((composite) =>
        composite.maxChannelDelta <= 1,
      )), JSON.stringify(results)).toBe(true);
    } finally {
      await browser.close();
      await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
    }
  }, 30_000);

  it("routes every runtime manifest URL to WebP and retains PNG audit URLs", () => {
    for (const scene of Object.values(CARRIAGE_SCENES)) {
      expect(scene.source).toMatch(/\.webp$/);
      expect(scene.pngSource).toMatch(/\.png$/);
    }
    expect(A07_ATLAS.source).toMatch(/\.webp$/);
    expect(A07_ATLAS.pngSource).toMatch(/\.png$/);
    expect(Object.values(A07_CLIP_ATLASES).every((clip) => clip.source.endsWith(".webp"))).toBe(true);
    expect(EQUIPMENT_ATLAS.source).toMatch(/\.webp$/);
    expect(EQUIPMENT_ATLAS.pngSource).toMatch(/\.png$/);
    for (const threat of Object.values(THREAT_ATLASES)) {
      expect(threat.source).toMatch(/\.webp$/);
      expect(threat.pngSource).toMatch(/\.png$/);
    }
  });

  it("keeps first menu to one complete static plate, then prioritizes only relevant neighbors and threats", () => {
    expect(sceneAssetPriority({ screen: "menu", activeCarriageId: "greenhouse" })).toEqual([
      "menu-hero",
    ]);
    const greenhouse = sceneAssetPriority({ screen: "carriage", activeCarriageId: "greenhouse" });
    expect(greenhouse[0]).toBe("v2-carriage-greenhouse");
    expect(greenhouse).toEqual([
      "v2-carriage-greenhouse",
      "prop-atlas",
      "equipment-atlas",
      "effect-atlas",
      "v2-carriage-workshop",
      "v2-carriage-kitchen",
      "a07-clip-sleep",
    ]);
    const contact = sceneAssetPriority({
      screen: "carriage",
      activeCarriageId: "defense",
      activeThreatDefinitionId: "T002",
      retreatFamily: "clinger",
    });
    expect(contact.slice(0, 3)).toEqual([
      "v2-carriage-defense",
      "v2-threat-knocker",
      "v2-threat-clinger",
    ]);
    expect(contact.filter((key) => key.startsWith("v2-threat-"))).toHaveLength(2);

    const animated = sceneAssetPriority({
      screen: "carriage",
      activeCarriageId: "sleep",
      a07ClipId: "listen",
      a07NextClipId: "startle",
    });
    expect(animated.filter((key) => key.startsWith("a07-clip-"))).toEqual([
      "a07-clip-listen",
      "a07-clip-startle",
    ]);
    expect(animated).not.toContain("a07-atlas");
  });

  it("maps the v21 prop and natural-effect atlases in authored frame order", () => {
    expect(PROP_ATLAS.source).toBe("./assets/art/v21/props/atlas.webp");
    expect(Object.values(PROP_ATLAS.frames)).toEqual(Array.from({ length: 16 }, (_, index) => index));
    expect(EFFECT_ATLAS.source).toBe("./assets/art/v21/effects/atlas.webp");
    expect(EFFECT_ATLAS.frames).toMatchObject({
      rain: 0,
      frost: 1,
      mist: 2,
      spores: 3,
      steam: { start: 4, frames: 4 },
      flame: { start: 8, frames: 4 },
      leaf: { start: 12, frames: 4 },
    });
    expect(renderer).toContain("imageSmoothingEnabled = false");
    expect(renderer).not.toContain("imageSmoothingQuality");
    expect(renderer).not.toContain("drawGreenBranchEquipmentFallback");
  });

  it("deduplicates work, holds concurrency at two, and bounds same-key retries at three", async () => {
    let active = 0;
    let maximumActive = 0;
    const calls = new Map<string, number>();
    const queue = new BoundedLoadQueue<string>(async (key, attempt) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      calls.set(key, (calls.get(key) ?? 0) + 1);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      if (key === "retry" && attempt < 3) throw new Error("retry");
      if (key === "dead") throw new Error("dead");
    }, { concurrency: 2, maxAttempts: 3 });
    queue.setPriority(["retry", "dead", "ok", "ok"]);
    await queue.whenIdle();
    const snapshot = queue.snapshot();
    expect(maximumActive).toBeLessThanOrEqual(2);
    expect(calls.get("ok")).toBe(1);
    expect(calls.get("retry")).toBe(3);
    expect(calls.get("dead")).toBe(3);
    expect(snapshot.status.get("retry")).toBe("loaded");
    expect(snapshot.status.get("dead")).toBe("failed");
    expect(snapshot.attempts.get("dead")).toBe(3);
  });

  it("can requeue an asset that a rapid priority change previously canceled", async () => {
    let releaseActive = (): void => undefined;
    const activeGate = new Promise<void>((resolve) => {
      releaseActive = resolve;
    });
    const calls: string[] = [];
    const queue = new BoundedLoadQueue<string>(async (key) => {
      calls.push(key);
      if (key === "active-a") await activeGate;
    }, { concurrency: 1, maxAttempts: 3 });

    queue.setPriority(["active-a", "queued-b"]);
    expect(queue.snapshot().status.get("queued-b")).toBe("queued");
    queue.setPriority(["priority-c"]);
    expect(queue.snapshot().status.has("queued-b")).toBe(false);
    queue.setPriority(["queued-b"]);
    expect(queue.snapshot().status.get("queued-b")).toBe("queued");
    releaseActive();
    await queue.whenIdle();
    expect(calls).toEqual(["active-a", "queued-b"]);
    expect(queue.snapshot().status.get("queued-b")).toBe("loaded");
  });

  it("retries a failed asset after leaving and returning without looping in the same scene", async () => {
    let fail = true;
    const attempts: number[] = [];
    const queue = new BoundedLoadQueue<string>(async (_key, attempt) => {
      attempts.push(attempt);
      if (fail) throw new Error("temporary offline");
    }, { concurrency: 1, maxAttempts: 3 });
    queue.setPriority(["room"]);
    await queue.whenIdle();
    queue.setPriority(["room"]);
    await queue.whenIdle();
    expect(attempts).toEqual([1, 2, 3]);
    queue.setPriority([]);
    fail = false;
    queue.setPriority(["room"]);
    await queue.whenIdle();
    expect(attempts).toEqual([1, 2, 3, 1]);
    expect(queue.snapshot().status.get("room")).toBe("loaded");
  });

  it("does not eagerly instantiate legacy or all v2 art and retries the identical cacheable URL", () => {
    const sources = renderer.slice(
      renderer.indexOf("const ART_SOURCES"),
      renderer.indexOf("};", renderer.indexOf("const ART_SOURCES")) + 2,
    );
    expect(sources).not.toContain("carriage-night.png");
    expect(sources).not.toContain("carriage-menu.png");
    expect(renderer).not.toContain("Object.entries(ART_SOURCES)");
    expect(renderer).toContain("new BoundedLoadQueue");
    expect(renderer).toContain("concurrency: 2");
    expect(renderer).toContain("maxAttempts: 3");
    expect(renderer).toContain('image.src = ""');
    expect(renderer).toContain("image!.src = source");
    expect(renderer).not.toMatch(/source\s*\+\s*[`'\"]\?/);
    expect(renderer).toContain("MAX_RESIDENT_PIXELS");
  });
});
