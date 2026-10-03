import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface V23Asset {
  assetId: string;
  role: "static-menu-composite" | "empty-gameplay-background";
  compositionAnchors: Record<string, [number, number]>;
  source: string;
  sourceSha256: string;
  processedPng: string;
  processedPngSha256: string;
  runtime: string;
  runtimeSha256: string;
  runtimeDimensions: [number, number];
  logicalDimensions: [number, number];
  runtimeScale: number;
  sampling: "Closest";
  webpEncoding: "lossless-libwebp-via-pillow";
  decodedPixelsExact: true;
  runtimeBytes: number;
}

interface V23Report {
  sourceTool: string;
  sourceModelIdentifier: string | null;
  processing: Record<string, string | number | boolean>;
  runtimeBytes: number;
  runtimeLimitBytes: number;
  runtimeLimitPass: boolean;
  assets: V23Asset[];
  a07GridContract: null | {
    grid: [8, 7];
    trueFrameCount: 52;
    allTrueFrameHashesUnique: true;
    unusedCells: [46, 47, 54, 55];
    frameDimensions: [number, number];
    clipDimensions: [number, number];
    sheetDimensions: [number, number];
    pivot: [number, number];
    bedAnchorPixels: [number, number];
    spillRemoval: { totalPixelsRemoved: number; visibleSpillPixelsAfter: number };
    headMeasurement: {
      sleepCommonFaceAnchorPixels: [number, number];
      sleepCommonFaceAnchorNormalized: [number, number];
      sleepFaceVarianceBefore: [number, number];
      sleepFaceVarianceAfter: [number, number];
    };
    clips: Array<{
      clipId: string;
      frameCount: number;
      columns: 8;
      frameDimensions: [number, number];
      dimensions: [number, number];
      processedPng: string;
      processedPngSha256: string;
      runtime: string;
      runtimeSha256: string;
      decodedPixelsExact: true;
      visibleSpill: { totalVisibleSpillPixels: number };
      unusedTransparentColumns: number[];
      frames: Array<{ frame: number; pixelTranslation: [number, number]; processedRgbaSha256: string }>;
    }>;
  };
}

const repoRoot = resolve(import.meta.dirname, "..");
const artRoot = resolve(repoRoot, "public/assets/art/v23");
const reportPath = resolve(artRoot, "pipeline-report.json");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function pngDimensions(path: string): [number, number] {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe("v2.3 authored raster integrity", () => {
  it("keeps six generated sources, Blender output, and lossless runtime files traceable", () => {
    expect(existsSync(reportPath)).toBe(true);
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as V23Report;
    expect(report.sourceTool).toBeTruthy();
    expect(report.assets).toHaveLength(6);
    expect(report.runtimeLimitPass).toBe(true);
    expect(report.runtimeBytes).toBeLessThanOrEqual(report.runtimeLimitBytes);
    expect(existsSync(resolve(artRoot, "v23-art-pipeline.blend"))).toBe(true);

    const ids = new Set(report.assets.map((asset) => asset.assetId));
    expect(ids).toEqual(new Set([
      "v23.menu.hero",
      "v23.carriages.sleep",
      "v23.carriages.kitchen",
      "v23.carriages.greenhouse",
      "v23.carriages.defense",
      "v23.carriages.workshop",
    ]));

    for (const asset of report.assets) {
      expect(asset.source).not.toMatch(/^(?:[A-Za-z]:|\/)/);
      expect(asset.runtimeDimensions).toEqual([720, 1280]);
      expect(asset.logicalDimensions).toEqual([360, 640]);
      expect(asset.runtimeScale).toBe(2);
      expect(asset.sampling).toBe("Closest");
      expect(asset.webpEncoding).toBe("lossless-libwebp-via-pillow");
      expect(asset.decodedPixelsExact).toBe(true);
      const source = resolve(artRoot, asset.source);
      const png = resolve(artRoot, asset.processedPng);
      const webp = resolve(artRoot, asset.runtime);
      expect(sha256(source)).toBe(asset.sourceSha256);
      expect(sha256(png)).toBe(asset.processedPngSha256);
      expect(sha256(webp)).toBe(asset.runtimeSha256);
      expect(pngDimensions(png)).toEqual([720, 1280]);
      const webpBytes = readFileSync(webp);
      expect(webpBytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(webpBytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    }

    expect(report.assets.find((asset) => asset.assetId === "v23.menu.hero")?.role)
      .toBe("static-menu-composite");
    expect(report.assets.find((asset) => asset.assetId === "v23.menu.hero")?.compositionAnchors)
      .toEqual({ head: [0.58, 0.34] });
    expect(report.assets.find((asset) => asset.assetId === "v23.carriages.sleep")?.compositionAnchors)
      .toEqual({ emptyPillow: [0.55, 0.35] });
    for (const asset of report.assets.filter((entry) => entry.assetId.includes(".carriages."))) {
      expect(asset.role).toBe("empty-gameplay-background");
    }
  });

  it("records a neutral, non-generative finishing pass", () => {
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as V23Report;
    expect(report.processing).toMatchObject({
      viewTransform: "Standard",
      look: "None",
      exposure: 0,
      gamma: 1,
      sampling: "Closest",
      pixelation: false,
      quantization: false,
      sharpening: false,
      dithering: false,
      denoising: false,
      artificialNoise: false,
    });
  });

  it("supports the exact optional A-07 8x7 / 52-frame contract", () => {
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as V23Report;
    if (report.a07GridContract === null) return;
    const grid = report.a07GridContract;
    expect(grid.grid).toEqual([8, 7]);
    expect(grid.trueFrameCount).toBe(52);
    expect(grid.allTrueFrameHashesUnique).toBe(true);
    expect(grid.unusedCells).toEqual([46, 47, 54, 55]);
    expect(grid.frameDimensions).toEqual([192, 192]);
    expect(grid.clipDimensions).toEqual([1536, 192]);
    expect(grid.sheetDimensions).toEqual([1536, 1344]);
    expect(grid.bedAnchorPixels).toEqual([96, 192]);
    expect(grid.pivot[0]).toBeGreaterThanOrEqual(0);
    expect(grid.pivot[0]).toBeLessThanOrEqual(1);
    expect(grid.pivot[1]).toBeGreaterThanOrEqual(0);
    expect(grid.pivot[1]).toBeLessThanOrEqual(1);
    expect(grid.spillRemoval.totalPixelsRemoved).toBeGreaterThan(0);
    expect(grid.spillRemoval.visibleSpillPixelsAfter).toBe(0);
    expect(grid.headMeasurement.sleepFaceVarianceAfter[0])
      .toBeLessThan(grid.headMeasurement.sleepFaceVarianceBefore[0]);
    expect(grid.headMeasurement.sleepFaceVarianceAfter[1])
      .toBeLessThan(grid.headMeasurement.sleepFaceVarianceBefore[1]);

    expect(grid.clips.map(({ clipId, frameCount }) => [clipId, frameCount])).toEqual([
      ["sleep", 8], ["turn", 8], ["listen", 8], ["startle", 8],
      ["sit", 8], ["drink", 6], ["settle", 6],
    ]);
    const frameHashes: string[] = [];
    for (const clip of grid.clips) {
      expect(clip.columns).toBe(8);
      expect(clip.frameDimensions).toEqual([192, 192]);
      expect(clip.dimensions).toEqual([1536, 192]);
      expect(clip.decodedPixelsExact).toBe(true);
      expect(clip.visibleSpill.totalVisibleSpillPixels).toBe(0);
      expect(clip.frames).toHaveLength(clip.frameCount);
      expect(sha256(resolve(artRoot, clip.processedPng))).toBe(clip.processedPngSha256);
      expect(sha256(resolve(artRoot, clip.runtime))).toBe(clip.runtimeSha256);
      expect(pngDimensions(resolve(artRoot, clip.processedPng))).toEqual([1536, 192]);
      frameHashes.push(...clip.frames.map((frame) => frame.processedRgbaSha256));
      expect(clip.unusedTransparentColumns).toEqual(clip.frameCount === 6 ? [6, 7] : []);
    }
    expect(frameHashes).toHaveLength(52);
    expect(new Set(frameHashes).size).toBe(52);
    expect(existsSync(resolve(artRoot, "v23-a07-pipeline.blend"))).toBe(true);
  });
});
