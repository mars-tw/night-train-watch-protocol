import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface CellEvidence {
  rgbaSha256: string;
}

interface ArtAssetEvidence {
  assetId: string;
  source: string;
  sourceSha256: string;
  processedPng: string;
  processedPngSha256: string;
  runtime: string;
  runtimeSha256: string;
  runtimeDimensions: [number, number];
  frameCount: number;
  allFrameHashesUnique: boolean;
  cells: CellEvidence[];
}

interface PlatformIconEvidence {
  source: string;
  sourceSha256: string;
  runtime: string;
  runtimeSha256: string;
  runtimeDimensions: [number, number];
}

interface PipelineReport {
  sourceModelIdentifier: null;
  runtimeBytes: number;
  runtimeLimitBytes: number;
  runtimeLimitPass: boolean;
  assets: ArtAssetEvidence[];
  platformIcons: PlatformIconEvidence[];
}

const repoRoot = resolve(import.meta.dirname, "..");
const artRoot = resolve(repoRoot, "public/assets/art/v21");
const report = JSON.parse(
  readFileSync(resolve(artRoot, "pipeline-report.json"), "utf8"),
) as PipelineReport;

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function expectPng(path: string, dimensions: [number, number]): void {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual(dimensions);
}

function expectWebp(path: string): void {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
}

describe("v2.1 raster asset integrity", () => {
  it("resolves every portable source and verifies source, PNG, and WebP hashes", () => {
    expect(report.sourceModelIdentifier).toBeNull();
    expect(report.runtimeLimitPass).toBe(true);
    expect(report.runtimeBytes).toBeLessThanOrEqual(report.runtimeLimitBytes);

    for (const asset of report.assets) {
      expect(asset.source).not.toMatch(/^(?:[A-Za-z]:|\/)/);
      const sourcePath = resolve(artRoot, asset.source);
      const processedPath = resolve(artRoot, asset.processedPng);
      const runtimePath = resolve(artRoot, asset.runtime);
      expect(existsSync(sourcePath), `${asset.assetId} source`).toBe(true);
      expect(existsSync(processedPath), `${asset.assetId} processed PNG`).toBe(true);
      expect(existsSync(runtimePath), `${asset.assetId} runtime WebP`).toBe(true);
      expect(sha256(sourcePath)).toBe(asset.sourceSha256);
      expect(sha256(processedPath)).toBe(asset.processedPngSha256);
      expect(sha256(runtimePath)).toBe(asset.runtimeSha256);
      expectPng(processedPath, asset.runtimeDimensions);
      expectWebp(runtimePath);
    }
  });

  it("proves every declared frame is real and unique within its atlas", () => {
    for (const asset of report.assets) {
      const hashes = asset.cells.map((cell) => cell.rgbaSha256);
      expect(hashes, asset.assetId).toHaveLength(asset.frameCount);
      expect(new Set(hashes).size, asset.assetId).toBe(asset.frameCount);
      expect(asset.allFrameHashesUnique, asset.assetId).toBe(true);
    }
  });

  it("uses hashed PNG platform icons and leaves no SVG runtime references", () => {
    for (const icon of report.platformIcons) {
      const sourcePath = resolve(artRoot, icon.source);
      const runtimePath = resolve(artRoot, icon.runtime);
      expect(sha256(sourcePath)).toBe(icon.sourceSha256);
      expect(sha256(runtimePath)).toBe(icon.runtimeSha256);
      expectPng(runtimePath, icon.runtimeDimensions);
    }

    const webManifest = readFileSync(resolve(repoRoot, "public/manifest.webmanifest"), "utf8");
    const indexHtml = readFileSync(resolve(repoRoot, "index.html"), "utf8");
    const sceneManifest = readFileSync(resolve(repoRoot, "src/game/scene-manifest.ts"), "utf8");
    const uiCss = readFileSync(resolve(repoRoot, "src/styles/v2.css"), "utf8");
    const runtimeReferences = `${webManifest}\n${indexHtml}\n${sceneManifest}\n${uiCss}`;
    expect(runtimeReferences).not.toMatch(/\.svg(?:["')?\s]|$)/i);
    expect(webManifest).toContain("app-icon-192.png");
    expect(webManifest).toContain("app-icon-512.png");
    expect(indexHtml).toContain('type="image/png"');

    for (const match of sceneManifest.matchAll(/pngSource:\s*"\.\/([^"?]+)"/g)) {
      const source = match[1];
      if (!source) throw new Error("Missing PNG source capture");
      expect(existsSync(resolve(repoRoot, "public", source)), source).toBe(true);
    }
  });
});
