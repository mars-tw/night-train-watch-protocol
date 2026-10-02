import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "..");
const app = readFileSync(resolve(workspace, "src/app.ts"), "utf8");
const view = readFileSync(resolve(workspace, "src/ui/view.ts"), "utf8");
const css = readFileSync(resolve(workspace, "src/styles/v2.css"), "utf8");
const main = readFileSync(resolve(workspace, "src/main.ts"), "utf8");
const sceneManifest = readFileSync(
  resolve(workspace, "src/game/scene-manifest.ts"),
  "utf8",
);

describe("reboot v2 mobile UI contract", () => {
  it("ships mission and profile views backed by real run/profile state", () => {
    expect(view).toContain("listRunQuests(run, state.profile)");
    expect(view).toContain('data-screen="SCR-MSN-');
    expect(view).toContain("profile.routeUnlocks");
    expect(view).toContain("profile.blueprints");
    expect(view).toContain("profile.decorations");
    expect(view).toContain("profile.journal");
    expect(view).toContain('quest.lifecycle !== "retired"');
    expect(view).toContain('"另一改裝已採用"');
    expect(view).not.toContain("JSON.stringify");
  });

  it("supports categories, four-item pages, two pins and non-committing travel", () => {
    for (const category of [
      "main",
      "tutorial",
      "relationship",
      "facility",
      "exploration",
      "challenge",
      "completed",
    ]) {
      expect(view).toContain(`["${category}"`);
    }
    expect(view).toContain("visible.slice(page * 4, page * 4 + 4)");
    expect(view).toContain("trackedCount >= 2");
    expect(view).toContain('button("carriage", "前往車廂"');
    expect(app).toContain('case "toggle-quest-tracking"');
    expect(app).toContain('case "quest-page"');
  });

  it("adopts claimed rewards only after the run/profile envelope saves", () => {
    expect(app).toContain("const draft = claimQuestRewards");
    const save = app.indexOf("await this.saveService.save(draft.run, draft.profile)");
    const adoptRun = app.indexOf("this.state.run = draft.run", save);
    const adoptProfile = app.indexOf("this.state.profile = draft.profile", save);
    expect(save).toBeGreaterThan(0);
    expect(adoptRun).toBeGreaterThan(save);
    expect(adoptProfile).toBeGreaterThan(save);
    expect(app).toContain("保存失敗，這次沒有領取成果");
    expect(app).toContain("if (!this.actionInFlight) void this.persist()");
  });

  it("previews consumptive preparation and keeps free controls direct", () => {
    for (const action of [
      "comfort",
      "repair-hull",
      "workshop-scrap",
      "cook-meal",
      "plant-crop",
      "water-crops",
      "harvest-crop",
      "build-module",
      "unlock-tech",
      "upgrade-facility",
      "start-expedition",
      "refill-supplies",
      "use-medicine",
    ]) {
      expect(app).toContain(`action === "${action}"`);
    }
    expect(view).toContain('data-action="preview-action"');
    expect(view).toContain('data-action="confirm-object-action"');
    expect(view).toContain('data-action="cancel-object-action"');
    expect(view).toContain('data-action="select-ration"');
    expect(view).toContain('data-action="inspect-object"');
    expect(view).toContain('data-action="open-refill"');
    expect(app).toContain("if (this.actionInFlight) return");
  });

  it("exposes the three-node fixed-seed expedition and relationship replies", () => {
    for (const action of [
      "start-expedition",
      "choose-expedition-step",
      "withdraw-expedition",
      "choose-relationship",
      "inspect-object",
    ]) {
      expect(view).toContain(action);
      expect(app).toContain(`case "${action}"`);
    }
    for (const choice of [
      "survey",
      "proper-tool",
      "improvise",
      "withdraw",
      "deep-dive",
    ]) {
      expect(view).toContain(choice);
    }
    expect(view).toContain("讀檔不重抽");
    expect(view).toContain('data-value="A-07"');
    expect(view).toContain('data-value="xu"');
  });

  it("renders all eight mutually exclusive facility choices separately from decor", () => {
    expect(view).toContain("FACILITY_UPGRADES.map");
    expect(view).toContain("facilityChoices[upgrade.branchGroup]");
    expect(view).toContain("同組另一方向已完成");
    expect(view).toContain("facility-upgrades");
    expect(view).toContain("decorationTray");
  });

  it("keeps the scene dominant and controls reachable on target viewports", () => {
    expect(main).toContain('import "./styles/v2.css"');
    expect(css).toContain("--scene-min-height");
    expect(css).toContain("min-height: 48px");
    expect(css).toContain("@media (max-width: 370px) and (max-height: 700px)");
    expect(css).toContain("top: 154px; bottom: 78px");
    expect(css).toContain("@media (orientation: landscape) and (min-width: 741px)");
    expect(css).toContain("max-height: min(78svh, 620px)");
    expect(css).toContain("prefers-reduced-motion");
  });

  it("pauses and persists hidden nights without auto-resuming", () => {
    expect(app).toContain('document.visibilityState === "hidden"');
    expect(app).toContain("this.state.nightPaused = true");
    expect(app).toContain("請手動繼續");
    expect(app).toMatch(/else \{\s*this\.render\(\);\s*\}/);
  });

  it("adopts profile route unlocks only after an ended run saves", () => {
    expect(app).toContain("recordRunOutcome(this.state.profile, this.state.run)");
    const save = app.indexOf("await this.saveService.save(this.state.run, profileDraft)");
    const adopt = app.indexOf("this.state.profile = profileDraft", save);
    expect(save).toBeGreaterThan(0);
    expect(adopt).toBeGreaterThan(save);
    expect(view).toContain('state.profile.routeUnlocks.includes("R03")');
    expect(view).toContain("完成 5 項教學與任一七夜後正式解鎖");
  });

  it("saves a profile loadout draft before selection and passes it to a fresh run", () => {
    expect(app).toContain("prepareProfileLoadoutSelection");
    const save = app.indexOf("await this.saveService.save(run, draft.profile)");
    const adopt = app.indexOf("this.state.profile = draft.profile", save);
    expect(save).toBeGreaterThan(0);
    expect(adopt).toBeGreaterThan(save);
    expect(app).toContain("createRun(undefined, routeId, this.state.profile)");
    expect(view).toContain('data-action="select-profile-loadout"');
    expect(view).toContain("目前旅程物資不會改變");
  });

  it("exposes the finite T003 fallback and keeps EV048 evidence honest", () => {
    expect(view).toContain('id: "roof-release"');
    expect(view).toContain("切離攀附扣具");
    expect(view).toContain("噪音 +4・壓力 +2");
    expect(css).toContain('.screen--carriage[data-threat-id="T003"] .emergency-actions > div');
    expect(view).toContain('eventId === "EV048"');
    expect(view).toContain("作者證據尚未核實，可先保留疑問");
  });

  it("derives preparation previews from the same gameplay effect helpers", () => {
    for (const helper of [
      "getModuleBuildPartsCost",
      "getRepairHullAmount",
      "getFacilityEffects",
      "deriveGameplayEffects",
    ]) {
      expect(app).toContain(helper);
    }
    expect(view).toContain("getModuleBuildPartsCost(run, module.id)");
    expect(view).toContain("getRepairHullAmount(run)");
    expect(app).toContain("irrigationWaterDiscount");
    expect(app).toContain("contaminationOnIrrigation");
    expect(app).toContain("medicineHealthBonus");
  });

  it("derives crop and T004 target geometry from the shared greenhouse manifest", () => {
    expect(sceneManifest).toContain('id: "greenhouse-a"');
    expect(sceneManifest).toContain('id: "greenhouse-b"');
    expect(view).toContain("CARRIAGE_SCENES.greenhouse.hotspots.find");
    expect(view).toContain("greenhousePlotGeometry(plot.id)");
    expect(view).toContain("greenhousePlotGeometry(plotId)");
    expect(view).toContain("t004SceneTargets(contact)");
    expect(view).not.toContain("{ x: 18, y: 47 }");
    expect(view).not.toContain("{ x: 19, y: 73 }");
  });
});
