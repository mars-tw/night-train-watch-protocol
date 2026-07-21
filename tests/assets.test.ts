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

  it("commits the audited mobile gameplay previews to the open-source project", () => {
    const previews = ["09-repaired-carriage.png", "10-route-preview.png", "11-module-preview.png"];
    for (const preview of previews) {
      expect(existsSync(resolve(workspace, "public/assets/screenshots", preview)), `${preview} should be public`).toBe(true);
    }
    const readme = readFileSync(resolve(workspace, "README.md"), "utf8");
    for (const preview of previews) expect(readme).toContain(preview);
  });

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

  it("bumps the offline cache so installed games receive the motion release", () => {
    const serviceWorker = readFileSync(resolve(workspace, "public/sw.js"), "utf8");
    expect(serviceWorker).toContain('night-train-v0.3.1-button-audit');
  });

  it("wires every rendered button action to the application controller", () => {
    const view = readFileSync(resolve(workspace, "src/ui/view.ts"), "utf8");
    const app = readFileSync(resolve(workspace, "src/app.ts"), "utf8");
    const buttonTags = view.match(/<button\b[^>]*>/gs) ?? [];
    const actions = [
      "new-game", "continue", "menu", "hub", "settings", "carriage", "pause", "route", "modules", "modules-preview",
      "tech", "event-preview", "select-route", "confirm-route", "event-choice", "counter", "next-day", "select-module",
      "select-module-category", "power", "meal", "toggle-module", "toggle-power", "select-ration", "build-module", "select-tech",
      "select-tech-branch", "unlock-tech", "harvest", "comfort", "repair-hull", "cycle-text", "toggle-motion", "toggle-countdown",
      "toggle-speed", "toggle-sound",
    ];

    expect(buttonTags.length).toBeGreaterThan(20);
    expect(buttonTags.filter((tag) => !tag.includes("data-action"))).toEqual([]);
    for (const action of actions) {
      expect(view, `${action} must be reachable from the UI`).toContain(`"${action}"`);
      expect(app, `${action} must have a controller case`).toContain(`case "${action}"`);
    }
  });
});
