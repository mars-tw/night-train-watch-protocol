import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "..");
const view = readFileSync(resolve(workspace, "src/ui/view.ts"), "utf8");
const renderer = readFileSync(
  resolve(workspace, "src/game/renderer.ts"),
  "utf8",
);
const css = readFileSync(
  resolve(workspace, "src/styles/integration.css"),
  "utf8",
);

describe("R03 visible runtime contract", () => {
  it("renders a playable third route card with the formal unlock disclosure", () => {
    expect(view).toContain('"R03・綠潮線"');
    expect(view).toContain('value: "R03"');
    expect(view).toContain("可玩預覽・完成 5 項教學與任一七夜後正式解鎖");
    expect(view).toContain('state.profile.routeUnlocks.includes("R03")');
    expect(view).toContain("route-launch-card--green");
  });

  it("exposes tap and drag intents for every Cycle Board operation", () => {
    expect(view).toContain('data-testid="cycle-board"');
    for (const action of [
      "cycle-select",
      "cycle-inspect",
      "cycle-target",
      "cycle-move",
      "cycle-reset",
      "cycle-commit",
      "cycle-manual-drain",
    ]) {
      expect(view).toContain(action);
    }
    for (const command of [
      "cycle:select:",
      "cycle:inspect:",
      "cycle:target:",
      "cycle:move:",
      "cycle:reset",
      "cycle:commit",
      "cycle:manual-drain",
    ]) {
      expect(view).toContain(command);
    }
    for (const zone of ["INTAKE", "FILTER", "GROW_A", "GROW_B", "DRAIN"]) {
      expect(view).toContain(`${zone}: {`);
    }
  });

  it("keeps T008 physical inspection, marking and fallback visible", () => {
    expect(view).toContain('data-testid="t008-scene-targets"');
    expect(view).toContain('data-threat-id="T008"');
    for (const zone of ["CANOPY", "FILTER", "UNDERBED"]) {
      expect(view).toContain(`${zone}: {`);
    }
    expect(view).toContain("lurker:inspect:");
    expect(view).toContain("lurker:mark:");
    expect(view).toContain("lurker:manual-seal");
    expect(view).toContain("首次誤判免傷");
  });

  it("uses the same Cycle Board commands for the T013 encounter", () => {
    expect(view).toContain('data-threat-id="T013"');
    expect(view).toContain("T013・孢子者入侵");
    expect(view).toContain('mode === "threat"');
    expect(view).toContain(
      'mode === "drawer" && cycle.committedDay === run.day',
    );
    expect(view).toContain('action: "threat-interact"');
    expect(view).toContain("手動排空固定保底");
  });

  it("renders all branch equipment and all four green endings", () => {
    for (const branch of ["CULTIVATE", "FILTER", "PURGE"]) {
      expect(view).toContain(branch);
      expect(renderer).toContain(branch);
    }
    for (const ending of [
      "green-seedbank",
      "green-symbiosis",
      "green-firebreak",
      "green-quarantine",
    ]) {
      expect(view).toContain(ending);
    }
    expect(view).toContain('data-testid="green-result"');
  });

  it("wires the three planned GPT runtime paths without requiring placeholder files", () => {
    for (const asset of [
      "./assets/art/story/carriage-greentide-gpt-v1.png",
      "./assets/art/story/threat-t008-gpt-v1.png",
      "./assets/art/story/greentide-branch-equipment-gpt-v1.png",
    ]) {
      expect(renderer).toContain(asset);
    }
    expect(renderer).toContain("drawGreenTideRoute");
    expect(renderer).toContain("drawSporeContamination");
  });

  it("defines compact, accessible and reduced-motion visual equivalents", () => {
    for (const token of [
      "#090e12",
      "#192329",
      "#f5e8d8",
      "#e2a85d",
      "#7ea57a",
      "#c2604e",
    ]) {
      expect(css.toLowerCase()).toContain(token);
    }
    expect(css).toContain("greenRootGrow 420ms");
    expect(css).toContain("greenSamplePulse 180ms");
    expect(css).toContain("greenBranchResolve 360ms");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (max-width: 370px) and (max-height: 700px)");
    expect(css).toContain("max-height: 246px");
    expect(css).toContain("min-height: 48px");
    expect(css).toContain("bottom: max(26px, env(safe-area-inset-bottom))");
    expect(css).toMatch(
      /@media \(max-width: 370px\) and \(max-height: 700px\)[\s\S]*?\.green-cycle-actions\s*\{\s*position:\s*static;/,
    );
  });
});
