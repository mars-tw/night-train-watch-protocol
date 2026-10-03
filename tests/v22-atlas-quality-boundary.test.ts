import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { A07_ATLAS, A07_CLIP_ATLASES, EQUIPMENT_ATLAS, THREAT_ATLASES } from "../src/game/scene-manifest";

const root = resolve(import.meta.dirname, "..");
const report = JSON.parse(readFileSync(resolve(root, "docs/reboot-v22/reports/ATLAS_LOSSY_BOUNDARY_REPORT.json"), "utf8")) as {
  gateMae255: number;
  transparentPixelsExcluded: boolean;
  trials: Array<{ quality: number; passesAlpha: boolean; passesFullVisibleAndOpaqueMae15: boolean; passesEveryFrame64VisibleAndOpaqueMae15: boolean; assets: Array<{ frames64px: unknown[] }> }>;
};
const clipManifest = JSON.parse(readFileSync(resolve(root, "public/assets/art/v22/a07-clips/manifest.json"), "utf8")) as {
  clips: Array<{ clipId: string; frameCount: number; width: number; height: number; frameBoxes: Array<{ clipBox: number[]; atlasBox: number[] }> }>;
};

describe("v22 atlas quality boundary", () => {
  it("preserves all 52 frames with original floor boundaries in local row zero", () => {
    const clips = Object.values(A07_CLIP_ATLASES);
    expect(clips.map((clip) => clip.frames)).toEqual([8, 8, 8, 8, 8, 6, 6]);
    expect(clips.reduce((total, clip) => total + clip.frames, 0)).toBe(52);
    expect(clips.map((clip) => clip.height)).toEqual([167, 168, 168, 167, 168, 168, 168]);
    expect(clipManifest.clips.map((clip) => clip.clipId)).toEqual(Object.keys(A07_CLIP_ATLASES));
    for (const [clipIndex, clip] of clips.entries()) {
      const asset = clipManifest.clips[clipIndex]!;
      expect(asset).toMatchObject({ frameCount: clip.frames, width: 1340, height: clip.height });
      expect(Math.floor(clip.sourceRow * A07_ATLAS.height / A07_ATLAS.rows)).toBe(
        [0, 167, 335, 503, 670, 838, 1006][clip.sourceRow],
      );
      for (let column = 0; column < clip.frames; column += 1) {
        const expectedColumns = [
          Math.floor(column * A07_ATLAS.width / A07_ATLAS.columns),
          Math.floor((column + 1) * A07_ATLAS.width / A07_ATLAS.columns),
        ];
        expect(expectedColumns).toEqual([
          [0, 167, 335, 502, 670, 837, 1005, 1172][column],
          [167, 335, 502, 670, 837, 1005, 1172, 1340][column],
        ]);
        expect(asset.frameBoxes[column]!.clipBox).toEqual([expectedColumns[0], 0, expectedColumns[1], clip.height]);
        expect(asset.frameBoxes[column]!.atlasBox).toEqual([
          expectedColumns[0],
          Math.floor(clip.sourceRow * A07_ATLAS.height / A07_ATLAS.rows),
          expectedColumns[1],
          Math.floor((clip.sourceRow + 1) * A07_ATLAS.height / A07_ATLAS.rows),
        ]);
      }
    }
  });

  it("records q98/q100 failure while preserving the lossless source and clip rows", () => {
    expect(report.gateMae255).toBe(1.5);
    expect(report.transparentPixelsExcluded).toBe(true);
    expect(report.trials.map((trial) => trial.quality)).toEqual([98, 100]);
    for (const trial of report.trials) {
      expect(trial.passesAlpha).toBe(true);
      expect(trial.passesFullVisibleAndOpaqueMae15).toBe(false);
      expect(trial.passesEveryFrame64VisibleAndOpaqueMae15).toBe(false);
      expect(trial.assets.every((asset) => asset.frames64px.length > 0)).toBe(true);
    }
    expect(A07_ATLAS.source).toBe("./assets/art/v2/characters/a07/atlas.webp");
    expect(Object.values(A07_CLIP_ATLASES).map((clip) => clip.source)).toEqual([
      "./assets/art/v22/a07-clips/sleep.webp",
      "./assets/art/v22/a07-clips/turn.webp",
      "./assets/art/v22/a07-clips/listen.webp",
      "./assets/art/v22/a07-clips/startle.webp",
      "./assets/art/v22/a07-clips/sit.webp",
      "./assets/art/v22/a07-clips/drink.webp",
      "./assets/art/v22/a07-clips/settle.webp",
    ]);
    expect(EQUIPMENT_ATLAS.source).toBe("./assets/art/v2/equipment/atlas.webp");
    expect(Object.values(THREAT_ATLASES).every((atlas) => atlas.source.startsWith("./assets/art/v2/threats/"))).toBe(true);
  });

  it("precaches seven lossless A-07 rows and excludes the original full character atlas", () => {
    const writer = readFileSync(resolve(root, "tools/write-precache.mjs"), "utf8");
    expect(writer).toContain("art\\/v2\\/(equipment|threats)");
    expect(writer).toContain("art\\/v22\\/a07-clips");
    expect(writer).not.toContain("art\\/v2\\/(characters|equipment|threats)");
    expect(writer).not.toContain("art\\/v22\\/atlases");
  });
});
