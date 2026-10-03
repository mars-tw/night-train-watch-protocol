import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface CropAsset {
  assetId: string;
  crop: "lettuce" | "tomato" | "herb";
  stage: 0 | 1 | 2 | 3;
  sourceCell: [number, number];
  sourceBox: [number, number, number, number];
  processedPng: string;
  processedPngSha256: string;
  runtime: string;
  runtimeSha256: string;
  runtimeDimensions: [192, 192];
  sampling: "Closest";
  decodedPixelsExact: true;
  runtimeBytes: number;
}

interface CropReport {
  combinedV23RuntimeBytes: number;
  combinedRuntimeLimitBytes: number;
  combinedRuntimeLimitPass: boolean;
  sourceTool: "image_gen";
  sourceModelIdentifier: null;
  source: string;
  sourceSha256: string;
  sourceDimensions: [number, number];
  grid: [4, 3];
  order: { rows: ["lettuce", "tomato", "herb"]; columns: [0, 1, 2, 3] };
  processing: {
    sampling: "Closest";
    smoothing: false;
    quantization: false;
    artificialNoise: false;
    paletteSpillRemoval: string;
  };
  assetCount: 12;
  runtimeBytes: number;
  assets: CropAsset[];
}

const repoRoot = resolve(import.meta.dirname, "..");
const artRoot = resolve(repoRoot, "public/assets/art/v23");
const report = JSON.parse(
  readFileSync(resolve(artRoot, "crops/pipeline-report.json"), "utf8"),
) as CropReport;

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

function pngDimensions(path: string): [number, number] {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe("v2.3 crop sprite integrity", () => {
  it("keeps the generated 4x3 source and all twelve Blender outputs traceable", () => {
    expect(report).toMatchObject({
      sourceTool: "image_gen",
      sourceModelIdentifier: null,
      grid: [4, 3],
      assetCount: 12,
      order: { rows: ["lettuce", "tomato", "herb"], columns: [0, 1, 2, 3] },
    });
    expect(report.source).not.toMatch(/^(?:[A-Za-z]:|\/)/);
    expect(sha256(resolve(artRoot, report.source))).toBe(report.sourceSha256);
    expect(existsSync(resolve(artRoot, "v23-crops-pipeline.blend"))).toBe(true);
    expect(report.runtimeBytes).toBeLessThan(2 * 1024 * 1024);
    expect(report.combinedRuntimeLimitPass).toBe(true);
    expect(report.combinedV23RuntimeBytes).toBeLessThanOrEqual(report.combinedRuntimeLimitBytes);

    const expectedIds = new Set(
      ["lettuce", "tomato", "herb"].flatMap((crop) =>
        [0, 1, 2, 3].map((stage) => `v23.crops.${crop}.stage${stage}`),
      ),
    );
    expect(new Set(report.assets.map((asset) => asset.assetId))).toEqual(expectedIds);

    let bytes = 0;
    for (const asset of report.assets) {
      const png = resolve(artRoot, asset.processedPng);
      const webp = resolve(artRoot, asset.runtime);
      expect(asset.sourceCell).toEqual([asset.stage, ["lettuce", "tomato", "herb"].indexOf(asset.crop)]);
      const [sourceWidth, sourceHeight] = report.sourceDimensions;
      expect(asset.sourceBox).toEqual([
        Math.floor(asset.stage * sourceWidth / 4),
        Math.floor(asset.sourceCell[1] * sourceHeight / 3),
        Math.floor((asset.stage + 1) * sourceWidth / 4),
        Math.floor((asset.sourceCell[1] + 1) * sourceHeight / 3),
      ]);
      expect(asset.runtimeDimensions).toEqual([192, 192]);
      expect(asset.sampling).toBe("Closest");
      expect(asset.decodedPixelsExact).toBe(true);
      expect(sha256(png)).toBe(asset.processedPngSha256);
      expect(sha256(webp)).toBe(asset.runtimeSha256);
      expect(pngDimensions(png)).toEqual([192, 192]);
      const webpBytes = readFileSync(webp);
      expect(webpBytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(webpBytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      bytes += asset.runtimeBytes;
    }
    expect(bytes).toBe(report.runtimeBytes);
  });

  it("records the colour-preserving nearest-neighbour finish", () => {
    expect(report.processing).toMatchObject({
      sampling: "Closest",
      smoothing: false,
      quantization: false,
      artificialNoise: false,
    });
    expect(report.processing.paletteSpillRemoval).toContain("none");
  });
});
