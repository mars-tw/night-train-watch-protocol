import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "..");

describe("shipping art", () => {
  const assets = ["carriage-prep.png", "carriage-menu.png", "carriage-night.png", "threat-knocker.png", "threat-clinger.png"];
  const renderer = readFileSync(resolve(workspace, "src/game/renderer.ts"), "utf8");

  for (const asset of assets) {
    it(`${asset} exists and is referenced by the runtime renderer`, () => {
      expect(existsSync(resolve(workspace, "public/assets/art", asset))).toBe(true);
      expect(renderer).toContain(asset);
    });
  }

  it("wires the authored motion system into the shipping runtime", () => {
    const animationCss = readFileSync(resolve(workspace, "src/styles/animation.css"), "utf8");
    const main = readFileSync(resolve(workspace, "src/main.ts"), "utf8");
    const view = readFileSync(resolve(workspace, "src/ui/view.ts"), "utf8");

    expect(main).toContain('import "./styles/animation.css"');
    expect(renderer).toContain("drawWindowMotion");
    expect(renderer).toContain("drawCarriageLife");
    expect(renderer).toContain("drawThreatImpact");
    expect(animationCss).toContain("prefers-reduced-motion");
    expect(view).toContain("contact-stage-${contact?.stage");
  });
});
