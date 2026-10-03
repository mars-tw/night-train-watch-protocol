import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  A07_ATLAS,
  A07_FRAME_CELLS,
  CARRIAGE_SCENES,
  COSMETIC_VISUALS,
  FACILITY_VISUALS,
  SCENE_STATE_COUNT,
  THREAT_RETREAT_DURATION_MS,
  a07PlaybackForRun,
  a07PlaybackForScene,
  threatClipForStage,
  updateThreatVisualLifecycle,
} from "../src/game/scene-manifest";
import { createRun } from "../src/game/model";
import type { ThreatContact } from "../src/game/types";

const workspace = resolve(import.meta.dirname, "..");
const artRoot = resolve(workspace, "public/assets/art/v2");
const report = JSON.parse(readFileSync(resolve(artRoot, "pipeline-report.json"), "utf8")) as {
  blenderVersion: string;
  sourceTool: string;
  sourceModelIdentifier: string | null;
  actualGeneratedImageCount: number;
  globalColorAssessment: {
    observedAverageWarmRatio: number;
    warmTargetPass: boolean;
    observedAveragePaletteCoverage: number;
    paletteCoveragePass: boolean;
  };
  assets: Array<{
    assetId: string;
    source: string;
    runtime: string;
    sourceSha256: string;
    runtimeSha256: string;
    warmColorRatio: number;
    runtimeSize: [number, number];
    frameCount?: number;
    occupancyByRow?: number[];
    removedSpillPixels?: number;
    frames?: Array<{ index: number; cell: [number, number, number, number]; opaquePixels: number }>;
    recognition64: { pass: boolean };
  }>;
};

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function pngSize(path: string): [number, number] {
  const png = readFileSync(path);
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

function decodeRgbaPng(path: string): { width: number; height: number; pixels: Buffer } {
  const png = readFileSync(path);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const bitDepth = png[24];
  const colorType = png[25];
  expect({ bitDepth, colorType }).toEqual({ bitDepth: 8, colorType: 6 });
  const idat: Buffer[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source++];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[source++]!;
      const left = x >= 4 ? pixels[y * stride + x - 4]! : 0;
      const above = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4]! : 0;
      let reconstructed = value;
      if (filter === 1) reconstructed += left;
      else if (filter === 2) reconstructed += above;
      else if (filter === 3) reconstructed += Math.floor((left + above) / 2);
      else if (filter === 4) {
        const estimate = left + above - upperLeft;
        const leftDistance = Math.abs(estimate - left);
        const aboveDistance = Math.abs(estimate - above);
        const diagonalDistance = Math.abs(estimate - upperLeft);
        reconstructed += leftDistance <= aboveDistance && leftDistance <= diagonalDistance
          ? left
          : aboveDistance <= diagonalDistance ? above : upperLeft;
      }
      pixels[y * stride + x] = reconstructed & 0xff;
    }
  }
  return { width, height, pixels };
}

function alphaCount(
  decoded: ReturnType<typeof decodeRgbaPng>,
  bounds: [number, number, number, number],
): number {
  const [left, top, width, height] = bounds;
  let count = 0;
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      if (decoded.pixels[(y * decoded.width + x) * 4 + 3]! > 12) count += 1;
    }
  }
  return count;
}

describe("v2 art runtime contract", () => {
  it("ships five independent 720x1280 carriage plates and preserves all six sources", () => {
    for (const carriageId of ["sleep", "defense", "workshop", "greenhouse", "kitchen"] as const) {
      const runtime = resolve(workspace, CARRIAGE_SCENES[carriageId].pngSource.replace(/^\.\//, "public/"));
      expect(existsSync(runtime), carriageId).toBe(true);
      expect(pngSize(runtime)).toEqual([720, 1280]);
      expect(existsSync(resolve(artRoot, `source/carriage-${carriageId}-source.png`))).toBe(true);
    }
    expect(existsSync(resolve(artRoot, "source/a07-atlas-source.png"))).toBe(true);
    expect(existsSync(resolve(artRoot, "v2-art-pipeline.blend"))).toBe(true);
  });

  it("records the real Blender run, exposed source tool, palette checks, and 64px checks", () => {
    expect(report.blenderVersion).toBe("5.2.0 LTS");
    expect(report.sourceTool).toBe("OpenAI built-in image generation tool");
    expect(report.sourceModelIdentifier).toBeNull();
    expect(report.actualGeneratedImageCount).toBe(12);
    expect(report.assets).toHaveLength(12);
    expect(report.assets.every((asset) => asset.recognition64.pass)).toBe(true);
    for (const asset of report.assets) {
      expect(asset.source).not.toContain("\\");
      expect(asset.runtime).not.toContain("\\");
      expect(sha256(resolve(workspace, "public", asset.source))).toBe(asset.sourceSha256);
      expect(sha256(resolve(workspace, "public", asset.runtime))).toBe(asset.runtimeSha256);
    }
    expect(report.globalColorAssessment).toMatchObject({
      warmTargetPass: true,
      paletteCoveragePass: true,
    });
    expect(report.globalColorAssessment.observedAverageWarmRatio).toBeGreaterThanOrEqual(0.6);
    expect(report.globalColorAssessment.observedAverageWarmRatio).toBeLessThanOrEqual(0.7);
    const carriages = report.assets.filter((asset) => asset.assetId.startsWith("v2.carriage."));
    expect(carriages.every((asset) => asset.warmColorRatio >= 0.6 && asset.warmColorRatio <= 0.7)).toBe(true);
  });

  it("keeps exactly 52 verified A-07 cells with transparent unused cells", () => {
    const atlasPath = resolve(artRoot, "characters/a07/atlas.png");
    const decoded = decodeRgbaPng(atlasPath);
    expect([decoded.width, decoded.height]).toEqual([A07_ATLAS.width, A07_ATLAS.height]);
    expect(A07_FRAME_CELLS).toHaveLength(52);
    const atlasReport = report.assets.find((asset) => asset.assetId === "v2.character.a07.atlas")!;
    expect(atlasReport).toMatchObject({
      frameCount: 52,
      occupancyByRow: [8, 8, 8, 8, 8, 6, 6],
    });
    expect(atlasReport.removedSpillPixels).toBeGreaterThan(0);
    expect(atlasReport.frames).toHaveLength(52);
    for (const frame of atlasReport.frames ?? []) {
      const [x, y, width, height] = frame.cell;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(decoded.width);
      expect(y + height).toBeLessThanOrEqual(decoded.height);
      expect(alphaCount(decoded, frame.cell)).toBeGreaterThan(64);
    }
    const emptyTop = Math.floor(6 * decoded.height / 7);
    for (const column of [6, 7]) {
      const left = Math.floor(column * decoded.width / 8);
      const right = Math.floor((column + 1) * decoded.width / 8);
      expect(alphaCount(decoded, [left, emptyTop, right - left, decoded.height - emptyTop])).toBe(0);
    }
    const corners: Array<[number, number]> = [[0, 0], [decoded.width - 1, 0], [0, decoded.height - 1], [decoded.width - 1, decoded.height - 1]];
    for (const [x, y] of corners) {
      expect(decoded.pixels[(y * decoded.width + x) * 4 + 3]).toBe(0);
    }
  });

  it("maps fifteen visible hit zones, twenty room states, eight facility visuals, and true frame clips", () => {
    expect(Object.values(CARRIAGE_SCENES).flatMap((scene) => scene.hotspots)).toHaveLength(15);
    expect(SCENE_STATE_COUNT).toBe(20);
    expect(FACILITY_VISUALS).toHaveLength(8);
    expect(Object.values(A07_ATLAS.clips).reduce((total, clip) => total + clip.frames, 0)).toBe(52);
    expect(Object.keys(A07_ATLAS.clips)).toEqual(["sleep", "turn", "listen", "startle", "sit", "drink", "settle"]);
    expect(A07_ATLAS.headAnchor).toEqual({ x: 0.58, y: 0.34 });
    const destinationPixels = {
      x: A07_ATLAS.destination.x * 720,
      y: A07_ATLAS.destination.y * 1280,
      width: A07_ATLAS.destination.width * 720,
      height: A07_ATLAS.destination.height * 1280,
    };
    expect(destinationPixels).toEqual({ x: 228, y: 318, width: 360, height: 360 });
    const sleepFaceWorld = {
      x: (destinationPixels.x + destinationPixels.width * 101 / 192) / 720,
      y: (destinationPixels.y + destinationPixels.height * 63 / 192) / 1280,
    };
    expect(sleepFaceWorld.x).toBeCloseTo(A07_ATLAS.headAnchor.x, 2);
    expect(sleepFaceWorld.y).toBeCloseTo(A07_ATLAS.headAnchor.y, 2);
    expect(COSMETIC_VISUALS).toHaveLength(8);
    expect(COSMETIC_VISUALS.every((visual) => visual.equipmentFrame >= 0 && visual.equipmentFrame < 50)).toBe(true);
  });

  it("ships five true 20-frame threat families and fifty equipment state cells", () => {
    const threats = report.assets.filter((asset) => asset.assetId.startsWith("v2.threat."));
    expect(threats).toHaveLength(5);
    for (const threat of threats) {
      expect(threat.frameCount).toBe(20);
      expect(threat.occupancyByRow).toEqual([4, 4, 4, 4, 4]);
      expect(threat.frames).toHaveLength(20);
      expect(threat.frames?.every((frame) => frame.opaquePixels > 64)).toBe(true);
    }
    const equipment = report.assets.find((asset) => asset.assetId === "v2.equipment.atlas")!;
    expect(equipment.frameCount).toBe(50);
    expect(equipment.occupancyByRow).toEqual([10, 10, 10, 10, 10]);
    expect(equipment.frames).toHaveLength(50);
  });

  it("selects A-07 clips from committed run state and freezes survivor loss", () => {
    const run = createRun("a07-clip-state");
    expect(a07PlaybackForRun(run).clipId).toBe("sleep");

    run.environment.temperature = 8;
    expect(a07PlaybackForRun(run).clipId).toBe("turn");
    run.environment.temperature = 18;
    run.phase = "night";
    run.voyage!.nightStartWakeups = 0;
    run.activeContact = { id: "warning", definitionId: "T002", stage: "warning", secondsLeft: 8 };
    expect(a07PlaybackForRun(run).clipId).toBe("listen");
    run.activeContact.stage = "attack";
    expect(a07PlaybackForRun(run).clipId).toBe("startle");
    run.activeContact = undefined;
    run.survivor.wakeups = 1;
    expect(a07PlaybackForRun(run).clipId).toBe("startle");

    run.phase = "aftermath";
    expect(a07PlaybackForRun(run).clipId).toBe("sit");
    expect(a07PlaybackForScene("menu", run)).toEqual({ clipId: "sleep", animationKey: "menu:sleep" });
    expect(a07PlaybackForScene("carriage", run).clipId).toBe("sit");
    run.phase = "prep";
    run.flags.push("comforted-1");
    run.ledger.push({ id: "comfort-ledger", at: 1, source: "prep.comfort", key: "stress", before: 20, delta: -8, after: 12 });
    expect(a07PlaybackForRun(run)).toMatchObject({ clipId: "settle", animationKey: "settle:comfort-ledger" });
    run.flags.push("hot-meal-1");
    run.ledger.push({ id: "meal-ledger", at: 2, source: "kitchen.hot-meal.sleep", key: "sleep", before: 90, delta: 10, after: 100 });
    expect(a07PlaybackForRun(run)).toMatchObject({ clipId: "drink", animationKey: "drink:meal-ledger" });

    run.ended = true;
    run.phase = "ending";
    run.outcome = "survivor-lost";
    expect(a07PlaybackForRun(run)).toMatchObject({ clipId: "sleep", freezeFrame: 0 });
  });

  it("keeps a resolved contact for one visual retreat without domain mutation", () => {
    const runId = "retreat-run";
    const contact: ThreatContact = { id: "contact-1", definitionId: "T002", stage: "attack", secondsLeft: 1 };
    let lifecycle = updateThreatVisualLifecycle({ runId: null }, runId, contact, 100);
    expect(lifecycle.retreat).toBeUndefined();
    contact.stage = "resolve";
    contact.resolvedBy = "close-shutter";
    const nextContact: ThreatContact = { id: "contact-2", definitionId: "T003", stage: "approach", secondsLeft: 10 };
    lifecycle = updateThreatVisualLifecycle(lifecycle, runId, nextContact, 200);
    expect(lifecycle.retreat).toMatchObject({ family: "knocker", startedAt: 200, contact: { id: "contact-1", resolvedBy: "close-shutter" } });
    expect(threatClipForStage("resolve")).toBe("resolve");
    lifecycle = updateThreatVisualLifecycle(lifecycle, runId, nextContact, 200 + THREAT_RETREAT_DURATION_MS - 1);
    expect(lifecycle.retreat).toBeDefined();
    lifecycle = updateThreatVisualLifecycle(lifecycle, runId, nextContact, 200 + THREAT_RETREAT_DURATION_MS);
    expect(lifecycle.retreat).toBeUndefined();
    expect(contact).toMatchObject({ stage: "resolve", resolvedBy: "close-shutter" });

    const unresolved: ThreatContact = { id: "contact-3", definitionId: "T002", stage: "attack", secondsLeft: 0 };
    lifecycle = updateThreatVisualLifecycle({ runId, activeRef: unresolved }, runId, undefined, 2000);
    expect(lifecycle.retreat).toBeUndefined();
    lifecycle = updateThreatVisualLifecycle({ runId, activeRef: contact }, "new-run", undefined, 2100);
    expect(lifecycle.retreat).toBeUndefined();
  });

  it("uses layered v2 rooms without loading full story threat plates as backgrounds", () => {
    const renderer = readFileSync(resolve(workspace, "src/game/renderer.ts"), "utf8");
    const runtimeSources = renderer.slice(renderer.indexOf("const ART_SOURCES"), renderer.indexOf("};", renderer.indexOf("const ART_SOURCES")) + 2);
    expect(runtimeSources).toContain("v2-carriage-sleep");
    for (const clip of ["sleep", "turn", "listen", "startle", "sit", "drink", "settle"]) {
      expect(runtimeSources).toContain(`a07-clip-${clip}`);
    }
    expect(runtimeSources).not.toContain('"a07-atlas"');
    expect(runtimeSources).toContain("equipment-atlas");
    expect(runtimeSources).toContain("v2-threat-knocker");
    expect(runtimeSources).not.toContain("assets/art/story");
    expect(renderer).toContain("drawA07Passenger");
    expect(renderer).toContain("drawFacilityLayers");
    expect(renderer).toContain("drawSelectedCosmetic");
    expect(renderer).toContain('flag.startsWith("cosmetic:")');
    expect(renderer).not.toContain("selectedCosmeticId");
    expect(renderer).toContain("threatFamilyForId");
    expect(renderer).toContain("drawThreatRetreat");
    expect(renderer).toContain('this.drawThreatAtlasFrame(retreat.family, "resolve"');
    expect(renderer).toContain('carriageId === "sleep"');
    expect(renderer).not.toContain("storyThreatArtKey");
  });
});
