import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "..");

describe("shipping art", () => {
  const assets = [
    "carriage-sleep.png",
    "carriage-defense.png",
    "carriage-workshop.png",
    "carriage-greenhouse.png",
    "carriage-kitchen.png",
    "carriage-menu.png",
    "carriage-night.png",
    "threat-knocker.png",
    "threat-clinger.png",
  ];
  const renderer = readFileSync(
    resolve(workspace, "src/game/renderer.ts"),
    "utf8",
  );
  const content = readFileSync(
    resolve(workspace, "src/game/content.ts"),
    "utf8",
  );

  for (const asset of assets) {
    it(`${asset} exists and is referenced by the runtime renderer`, () => {
      expect(existsSync(resolve(workspace, "public/assets/art", asset))).toBe(
        true,
      );
      expect(renderer).toContain(asset);
    });
  }

  it("ships GPT-authored movable decoration sprites and their reproducible chroma sources", () => {
    const decorations = ["lantern", "radio", "toolbox", "fern"];
    for (const decoration of decorations) {
      expect(
        existsSync(
          resolve(workspace, "public/assets/art/decor", `${decoration}.png`),
        ),
      ).toBe(true);
      expect(
        existsSync(
          resolve(
            workspace,
            "public/assets/source",
            `decor-${decoration}-chroma.png`,
          ),
        ),
      ).toBe(true);
      expect(content).toContain(`decor/${decoration}.png`);
    }
    expect(
      existsSync(resolve(workspace, "tools/process-decor-sprites.py")),
    ).toBe(true);
  });

  it("ships five GPT-authored carriage configurations and twelve transparent crop stages", () => {
    const carriages = ["sleep", "defense", "workshop", "greenhouse", "kitchen"];
    for (const carriage of carriages) {
      expect(
        existsSync(
          resolve(workspace, "public/assets/art", `carriage-${carriage}.png`),
        ),
      ).toBe(true);
      expect(
        existsSync(
          resolve(
            workspace,
            "public/assets/source/carriages",
            `carriage-${carriage}-gpt.png`,
          ),
        ),
      ).toBe(true);
      expect(renderer).toContain(`carriage-${carriage}.png`);
    }
    for (const crop of ["lettuce", "tomato", "herb"]) {
      expect(
        existsSync(
          resolve(
            workspace,
            "public/assets/source/crops",
            `${crop}-growth-chroma.png`,
          ),
        ),
      ).toBe(true);
      for (let stage = 0; stage <= 3; stage += 1) {
        expect(
          existsSync(
            resolve(
              workspace,
              "public/assets/art/crops",
              `${crop}-${stage}.png`,
            ),
          ),
        ).toBe(true);
      }
    }
    expect(existsSync(resolve(workspace, "tools/process-crop-sheets.py"))).toBe(
      true,
    );
  });

  it("ships three GPT-authored story threat scenes and wires each into the runtime renderer", () => {
    const storyThreats = [
      "threat-fog-vine-gpt-v1.png",
      "threat-echo-passenger-gpt-v1.png",
      "threat-silent-crowd-gpt-v1.png",
    ];
    for (const asset of storyThreats) {
      expect(
        existsSync(resolve(workspace, "public/assets/art/story", asset)),
      ).toBe(true);
      expect(renderer).toContain(asset);
    }
  });

  it("ships only the approved R02 GPT plates and wires both into the runtime renderer", () => {
    const frostAssets = [
      "carriage-frostline-gpt-v1.png",
      "threat-blizzard-gpt-v1.png",
    ];
    for (const asset of frostAssets) {
      expect(
        existsSync(resolve(workspace, "public/assets/art/story", asset)),
      ).toBe(true);
      expect(renderer).toContain(asset);
    }
    const promptRecord = readFileSync(
      resolve(workspace, "docs/WHITE_FROST_ASSET_PROMPTS.md"),
      "utf8",
    );
    for (const asset of frostAssets) expect(promptRecord).toContain(asset);
  });

  it("ships and visibly audits all three GPT-authored R03 production plates", () => {
    const greenAssets = [
      "carriage-greentide-gpt-v1.png",
      "greentide-branch-equipment-gpt-v1.png",
      "threat-t008-gpt-v1.png",
    ];
    const promptRecord = readFileSync(
      resolve(workspace, "docs/GREEN_TIDE_ASSET_PROMPTS.md"),
      "utf8",
    );
    for (const asset of greenAssets) {
      expect(
        existsSync(resolve(workspace, "public/assets/art/story", asset)),
      ).toBe(true);
      expect(renderer).toContain(asset);
      expect(promptRecord).toContain(asset);
    }
    expect(renderer).toContain("this.drawGreenCarriageLayer()");
    expect(renderer).toContain(
      "this.drawGreenBranchEquipmentLayer(greenTide.branch)",
    );
  });

  it("commits the R03 screenshots, gameplay previews, and passed audit report", () => {
    const screenshots = [
      "green-cultivate-carriage-v110.png",
      "green-cultivate-ending-v110.png",
      "green-cultivate-t008-first-miss-v110.png",
      "green-cultivate-t013-cycle-v110.png",
      "green-cycle-board-360x640-text140-v110.png",
      "green-ev066-intake-v110.png",
      "green-ev072-three-branches-v110.png",
      "green-ev078-four-endings-v110.png",
      "green-filter-carriage-v110.png",
      "green-filter-ending-v110.png",
      "green-filter-t008-first-miss-v110.png",
      "green-filter-t013-cycle-v110.png",
      "green-purge-carriage-v110.png",
      "green-purge-ending-v110.png",
      "green-purge-t008-first-miss-v110.png",
      "green-purge-t013-cycle-v110.png",
      "green-quarantine-ending-v110.png",
      "green-route-selection-v110.png",
    ];
    const videos = [
      "night-train-green-v110-cultivate.webm",
      "night-train-green-v110-filter.webm",
      "night-train-green-v110-purge.webm",
    ];
    const reportPath = resolve(
      workspace,
      "public/assets/qa/green-story-flow-report.json",
    );
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      status: string;
      disclosure: string;
      screenshots: string[];
      branches: Array<{ video: { public: string; bytes: number } }>;
    };
    const readme = readFileSync(resolve(workspace, "README.md"), "utf8");

    expect(report.status).toBe("PASS");
    expect(report.disclosure).toContain("checkpoint injection");
    expect(report.screenshots).toEqual(
      expect.arrayContaining(
        screenshots.map((name) => `public/assets/screenshots/${name}`),
      ),
    );
    for (const screenshot of screenshots) {
      expect(
        existsSync(resolve(workspace, "public/assets/screenshots", screenshot)),
      ).toBe(true);
    }
    for (const video of videos) {
      const path = resolve(workspace, "public/assets/video", video);
      expect(existsSync(path)).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(50_000);
      expect(readme).toContain(video);
    }
    expect(readme).toContain("green-story-flow-report.json");
    expect(report.branches).toHaveLength(3);
  });

  it("commits the audited mobile gameplay previews to the open-source project", () => {
    const previews = [
      "09-repaired-carriage.png",
      "10-route-preview.png",
      "11-module-preview.png",
      "12-decor-placement.png",
      "13-decor-in-play.png",
      "14-sleep-carriage.png",
      "15-defense-carriage.png",
      "16-workshop-carriage.png",
      "17-greenhouse-farming.png",
      "18-kitchen-carriage.png",
      "19-slot-placement.png",
      "20-compact-observation.png",
      "21-collapsible-power.png",
      "22-swipe-guidance.png",
      "23-action-feedback.png",
      "24-route-risk-waves.png",
      "28-story-t004-fog-vine.png",
      "29-story-t005-echo-passenger.png",
      "30-story-t006-silent-crowd.png",
    ];
    for (const preview of previews) {
      expect(
        existsSync(resolve(workspace, "public/assets/screenshots", preview)),
        `${preview} should be public`,
      ).toBe(true);
    }
    const readme = readFileSync(resolve(workspace, "README.md"), "utf8");
    for (const preview of previews) expect(readme).toContain(preview);
    for (const video of [
      "night-train-story-v090.webm",
      "night-train-story-v090-detour.webm",
      "night-train-story-v090-stop.webm",
    ]) {
      expect(existsSync(resolve(workspace, "public/assets/video", video))).toBe(
        true,
      );
      expect(readme).toContain(video);
    }
    expect(
      existsSync(
        resolve(workspace, "public/assets/qa/mobile-playability-report.json"),
      ),
    ).toBe(true);
  });

  it("wires the authored motion system into the shipping runtime", () => {
    const animationCss = readFileSync(
      resolve(workspace, "src/styles/animation.css"),
      "utf8",
    );
    const main = readFileSync(resolve(workspace, "src/main.ts"), "utf8");
    const view = readFileSync(resolve(workspace, "src/ui/view.ts"), "utf8");

    expect(main).toContain('import "./styles/animation.css"');
    expect(renderer).toContain("drawWindowMotion");
    expect(renderer).toContain("drawCarriageLife");
    expect(renderer).toContain("drawThreatImpact");
    expect(animationCss).toContain("prefers-reduced-motion");
    expect(view).toContain("contact-stage-${contact?.stage");
  });

  it("keeps the silent crowd encounter free of tap and wave-warning audio cues", () => {
    const app = readFileSync(resolve(workspace, "src/app.ts"), "utf8");
    expect(app).toContain(
      'action === "threat-interact" && run?.activeContact?.definitionId === "T006"',
    );
    expect(app).toContain('run.activeContact?.definitionId !== "T006"');
    expect(app).toContain('resolvedThreatId !== "T006"');
    expect(app).toContain('threatBeforeTick !== "T006"');
  });

  it("ships visible mobile game-feel feedback instead of code-only controls", () => {
    const view = readFileSync(resolve(workspace, "src/ui/view.ts"), "utf8");
    const app = readFileSync(resolve(workspace, "src/app.ts"), "utf8");
    const integrationCss = readFileSync(
      resolve(workspace, "src/styles/integration.css"),
      "utf8",
    );

    expect(view).toContain("prep-ap-dial");
    expect(view).toContain("carriage-swipe-hint");
    expect(view).toContain("feedback-chips");
    expect(view).toContain("crop-scene-layer");
    expect(view).toContain("contact.wave");
    expect(app).toContain('case "swipe-carriage"');
    expect(integrationCss).toContain("touch-action: pan-y");
    for (const carriage of ["defense", "workshop", "greenhouse", "kitchen"]) {
      expect(
        existsSync(
          resolve(
            workspace,
            "public/assets/source/carriages",
            `carriage-${carriage}-gpt-v2.png`,
          ),
        ),
      ).toBe(true);
    }
  });

  it("bumps the offline cache so installed games receive the green-tide story", () => {
    const serviceWorker = readFileSync(
      resolve(workspace, "public/sw.js"),
      "utf8",
    );
    expect(serviceWorker).toContain("night-train-v1.1.0-green-tide-r1");
  });

  it("wires every rendered button action to the application controller", () => {
    const view = readFileSync(resolve(workspace, "src/ui/view.ts"), "utf8");
    const app = readFileSync(resolve(workspace, "src/app.ts"), "utf8");
    const buttonTags = view.match(/<button\b[^>]*>/gs) ?? [];
    const actions = [
      "new-game",
      "continue",
      "menu",
      "hub",
      "settings",
      "carriage",
      "pause",
      "route",
      "modules",
      "modules-preview",
      "tech",
      "event-preview",
      "select-route",
      "confirm-route",
      "emergency-route",
      "event-choice",
      "counter",
      "next-day",
      "select-module",
      "select-module-category",
      "power",
      "meal",
      "toggle-module",
      "toggle-power",
      "select-ration",
      "build-module",
      "select-tech",
      "select-tech-branch",
      "unlock-tech",
      "comfort",
      "repair-hull",
      "cycle-text",
      "toggle-motion",
      "toggle-countdown",
      "toggle-speed",
      "toggle-sound",
      "decorate",
      "select-decoration",
      "move-decoration",
      "place-decoration",
      "reset-decor",
      "finish-decor",
      "select-carriage",
      "select-crop",
      "plant-crop",
      "water-crops",
      "harvest-crop",
      "workshop-scrap",
      "cook-meal",
      "arm-threat-tool",
      "threat-interact",
      "thermal-select",
      "thermal-target",
      "thermal-reset",
      "thermal-commit",
      "cycle-select",
      "cycle-inspect",
      "cycle-target",
      "cycle-move",
      "cycle-reset",
      "cycle-commit",
      "cycle-manual-drain",
    ];

    expect(buttonTags.length).toBeGreaterThan(20);
    expect(buttonTags.filter((tag) => !tag.includes("data-action"))).toEqual(
      [],
    );
    for (const action of actions) {
      expect(view, `${action} must be reachable from the UI`).toContain(
        `"${action}"`,
      );
      expect(app, `${action} must have a controller case`).toContain(
        `case "${action}"`,
      );
    }
  });
});
