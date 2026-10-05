import { describe, expect, it, vi } from "vitest";
import { SceneRenderer } from "../src/game/renderer";
import { sceneAssetPriority } from "../src/game/scene-manifest";

describe("fixed menu and result backgrounds", () => {
  it("does not follow uncommitted mutations of the app's screen or carriage", () => {
    const renderer = Object.create(SceneRenderer.prototype) as any;
    renderer.context = { clearRect: vi.fn() };
    renderer.canvas = { width: 720, height: 1280 };
    renderer.updateAssetPriority = vi.fn();
    renderer.drawMenuHero = vi.fn(() => true);
    renderer.drawA07Passenger = vi.fn(() => { throw new Error("Uncommitted scene leaked into the menu"); });
    const state = { screen: "menu", activeCarriageId: "greenhouse", run: { phase: "aftermath" } };
    renderer.render(state);
    state.screen = "carriage";
    state.activeCarriageId = "sleep";
    renderer.draw(1000);
    expect(renderer.state.screen).toBe("menu");
    expect(renderer.state.activeCarriageId).toBe("greenhouse");
    expect(renderer.drawMenuHero).toHaveBeenCalledTimes(2);
    expect(renderer.drawA07Passenger).not.toHaveBeenCalled();
  });
  for (const screen of ["menu", "result"] as const) {
    it(`${screen} never selects a live pose or threat from the saved run`, () => {
      expect(sceneAssetPriority({ screen, activeCarriageId: "sleep", activeThreatDefinitionId: "T002", retreatFamily: "knocker", a07ClipId: "sit", a07NextClipId: "drink" })).toEqual(["menu-hero"]);
    });

    it(`${screen} ignores the animation clock through the real draw entry point`, () => {
      const renderer = Object.create(SceneRenderer.prototype) as any;
      renderer.context = { clearRect: vi.fn() };
      renderer.canvas = { width: 720, height: 1280 };
      renderer.state = { screen, run: { phase: "aftermath", activeContact: { stage: "attack" } } };
      renderer.updateAssetPriority = vi.fn();
      renderer.drawMenuHero = vi.fn(() => true);
      renderer.drawA07Passenger = vi.fn(() => { throw new Error("Live pose escaped into a fixed screen"); });
      renderer.drawFallback = vi.fn();
      for (const time of [0, 16, 50, 320, 800, 1600, 5000]) renderer.draw(time);
      expect(renderer.drawMenuHero).toHaveBeenCalledTimes(7);
      expect(renderer.drawA07Passenger).not.toHaveBeenCalled();
      expect(renderer.drawFallback).not.toHaveBeenCalled();
    });
  }
});
