import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "..");
const viewport = readFileSync(resolve(workspace, "src/ui/viewport.ts"), "utf8");
const integration = readFileSync(resolve(workspace, "src/styles/integration.css"), "utf8");
const v2 = readFileSync(resolve(workspace, "src/styles/v2.css"), "utf8");

describe("scene viewport contract", () => {
  it("preserves the 720x1280 picture aspect and shares its rectangle with world layers", () => {
    expect(viewport).toContain("const sceneWidth = Math.min(shellWidth, height * 0.5625)");
    expect(viewport).toContain("const sceneHeight = sceneWidth / 0.5625");
    expect(integration).toMatch(/#scene-canvas \{[\s\S]*?width: var\(--scene-width, 100%\);[\s\S]*?height: var\(--scene-height, 100%\);/);
    expect(v2).toContain(".carriage-decor-layer, .crop-scene-layer, .scene-hotspots, .vine-scene-targets");
    expect(v2).toContain("inset: var(--scene-top, 0) auto auto var(--scene-left, 0) !important");
  });

  it("keeps the sleep onboarding card clear of the character face on short phones", () => {
    expect(v2).toContain('.screen--carriage[data-carriage="sleep"] .onboarding-cue');
    expect(v2).toContain("width: min(40%, 132px)");
    for (const width of [320, 360]) {
      const sceneWidth = Math.min(width, 640 * 0.5625);
      const sceneLeft = (width - sceneWidth) / 2;
      const headLeft = sceneLeft + sceneWidth * (321.75 / 720);
      const cueRight = 8 + Math.min(width * 0.4, 132);
      expect(cueRight).toBeLessThan(headLeft);
    }
    expect(v2).toMatch(/\.onboarding-cue__actions > button \{[\s\S]*?min-height: 48px;/);
  });
});
