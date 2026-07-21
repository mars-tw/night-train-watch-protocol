import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "..");

describe("shipping art", () => {
  const assets = ["carriage-sleep.png", "carriage-defense.png", "carriage-workshop.png", "carriage-greenhouse.png", "carriage-kitchen.png", "carriage-menu.png", "carriage-night.png", "threat-knocker.png", "threat-clinger.png"];
  const renderer = readFileSync(resolve(workspace, "src/game/renderer.ts"), "utf8");
  const content = readFileSync(resolve(workspace, "src/game/content.ts"), "utf8");

  for (const asset of assets) {
    it(`${asset} exists and is referenced by the runtime renderer`, () => {
      expect(existsSync(resolve(workspace, "public/assets/art", asset))).toBe(true);
      expect(renderer).toContain(asset);
    });
  }

  it("ships GPT-authored movable decoration sprites and their reproducible chroma sources", () => {
    const decorations = ["lantern", "radio", "toolbox", "fern"];
    for (const decoration of decorations) {
      expect(existsSync(resolve(workspace, "public/assets/art/decor", `${decoration}.png`))).toBe(true);
      expect(existsSync(resolve(workspace, "public/assets/source", `decor-${decoration}-chroma.png`))).toBe(true);
      expect(content).toContain(`decor/${decoration}.png`);
    }
    expect(existsSync(resolve(workspace, "tools/process-decor-sprites.py"))).toBe(true);
  });

  it("ships five GPT-authored carriage configurations and twelve transparent crop stages", () => {
    const carriages = ["sleep", "defense", "workshop", "greenhouse", "kitchen"];
    for (const carriage of carriages) {
      expect(existsSync(resolve(workspace, "public/assets/art", `carriage-${carriage}.png`))).toBe(true);
      expect(existsSync(resolve(workspace, "public/assets/source/carriages", `carriage-${carriage}-gpt.png`))).toBe(true);
      expect(renderer).toContain(`carriage-${carriage}.png`);
    }
    for (const crop of ["lettuce", "tomato", "herb"]) {
      expect(existsSync(resolve(workspace, "public/assets/source/crops", `${crop}-growth-chroma.png`))).toBe(true);
      for (let stage = 0; stage <= 3; stage += 1) {
        expect(existsSync(resolve(workspace, "public/assets/art/crops", `${crop}-${stage}.png`))).toBe(true);
      }
    }
    expect(existsSync(resolve(workspace, "tools/process-crop-sheets.py"))).toBe(true);
  });

  it("commits the audited mobile gameplay previews to the open-source project", () => {
    const previews = ["09-repaired-carriage.png", "10-route-preview.png", "11-module-preview.png", "12-decor-placement.png", "13-decor-in-play.png", "14-sleep-carriage.png", "15-defense-carriage.png", "16-workshop-carriage.png", "17-greenhouse-farming.png", "18-kitchen-carriage.png", "19-slot-placement.png"];
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
    expect(serviceWorker).toContain('night-train-v0.5.0-five-carriages-farming');
  });

  it("wires every rendered button action to the application controller", () => {
    const view = readFileSync(resolve(workspace, "src/ui/view.ts"), "utf8");
    const app = readFileSync(resolve(workspace, "src/app.ts"), "utf8");
    const buttonTags = view.match(/<button\b[^>]*>/gs) ?? [];
    const actions = [
      "new-game", "continue", "menu", "hub", "settings", "carriage", "pause", "route", "modules", "modules-preview",
      "tech", "event-preview", "select-route", "confirm-route", "event-choice", "counter", "next-day", "select-module",
      "select-module-category", "power", "meal", "toggle-module", "toggle-power", "select-ration", "build-module", "select-tech",
      "select-tech-branch", "unlock-tech", "comfort", "repair-hull", "cycle-text", "toggle-motion", "toggle-countdown",
      "toggle-speed", "toggle-sound", "decorate", "select-decoration", "move-decoration", "place-decoration", "reset-decor", "finish-decor",
      "select-carriage", "select-crop", "plant-crop", "water-crops", "harvest-crop", "workshop-scrap", "cook-meal",
    ];

    expect(buttonTags.length).toBeGreaterThan(20);
    expect(buttonTags.filter((tag) => !tag.includes("data-action"))).toEqual([]);
    for (const action of actions) {
      expect(view, `${action} must be reachable from the UI`).toContain(`"${action}"`);
      expect(app, `${action} must have a controller case`).toContain(`case "${action}"`);
    }
  });
});
