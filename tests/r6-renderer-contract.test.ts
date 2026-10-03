import { describe, expect, it, vi } from "vitest";
import { SceneRenderer } from "../src/game/renderer";
import { A07_CLIP_ATLASES, CARRIAGE_SCENES, MENU_HERO, sceneAssetPriority } from "../src/game/scene-manifest";

describe("v2.3 static menu renderer contract", () => {
  it("loads only the complete menu hero plate on menu, even when a run already exists", () => {
    expect(MENU_HERO.source).toBe("./assets/art/v23/menu/hero.webp");
    expect(sceneAssetPriority({
      screen: "menu",
      activeCarriageId: "greenhouse",
      activeThreatDefinitionId: "T004",
      retreatFamily: "crowd",
      a07ClipId: "startle",
      a07NextClipId: "sit",
    })).toEqual(["menu-hero"]);
  });

  it("draws the complete hero source once at the fixed logical canvas bounds", () => {
    const drawImage = vi.fn();
    const hero = {
      complete: true,
      naturalWidth: 360,
      naturalHeight: 640,
    } as HTMLImageElement;
    const renderer = Object.create(SceneRenderer.prototype) as {
      context: Pick<CanvasRenderingContext2D, "drawImage">;
      images: Map<string, HTMLImageElement>;
      imageLastUsed: Map<string, number>;
      drawMenuHero(): boolean;
    };
    renderer.context = { drawImage };
    renderer.images = new Map([["menu-hero", hero]]);
    renderer.imageLastUsed = new Map();

    expect(renderer.drawMenuHero()).toBe(true);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(hero, 0, 0, 360, 640, 0, 0, 720, 1280);
  });

  it("maps weather effects to the windows visible in each v2.3 carriage plate", () => {
    expect(CARRIAGE_SCENES.sleep.weatherWindows).toEqual([
      { x: 0.37, y: 0.1, width: 0.3, height: 0.18 },
      { x: 0.92, y: 0.13, width: 0.08, height: 0.29 },
    ]);
    expect(CARRIAGE_SCENES.defense.weatherWindows).toEqual([
      { x: 0.36, y: 0.1, width: 0.32, height: 0.26 },
      { x: 0.91, y: 0.14, width: 0.09, height: 0.29 },
    ]);
    expect(CARRIAGE_SCENES.workshop.weatherWindows).toEqual([
      { x: 0.36, y: 0.1, width: 0.32, height: 0.18 },
      { x: 0.92, y: 0.13, width: 0.08, height: 0.29 },
    ]);
    expect(CARRIAGE_SCENES.greenhouse.weatherWindows).toEqual([
      { x: 0.42, y: 0.11, width: 0.25, height: 0.22 },
      { x: 0.9, y: 0.13, width: 0.1, height: 0.29 },
    ]);
    expect(CARRIAGE_SCENES.kitchen.weatherWindows).toEqual([
      { x: 0.04, y: 0.17, width: 0.27, height: 0.19 },
      { x: 0.81, y: 0.14, width: 0.18, height: 0.29 },
    ]);
  });

  it("uses exact 192px cells from every v2.3 A-07 clip", () => {
    expect(Object.values(A07_CLIP_ATLASES).map(({ source, width, height, columns, frames }) => ({
      source, width, height, columns, frames,
    }))).toEqual([
      { source: "./assets/art/v23/a07-clips/sleep.webp", width: 1536, height: 192, columns: 8, frames: 8 },
      { source: "./assets/art/v23/a07-clips/turn.webp", width: 1536, height: 192, columns: 8, frames: 8 },
      { source: "./assets/art/v23/a07-clips/listen.webp", width: 1536, height: 192, columns: 8, frames: 8 },
      { source: "./assets/art/v23/a07-clips/startle.webp", width: 1536, height: 192, columns: 8, frames: 8 },
      { source: "./assets/art/v23/a07-clips/sit.webp", width: 1536, height: 192, columns: 8, frames: 8 },
      { source: "./assets/art/v23/a07-clips/drink.webp", width: 1536, height: 192, columns: 8, frames: 6 },
      { source: "./assets/art/v23/a07-clips/settle.webp", width: 1536, height: 192, columns: 8, frames: 6 },
    ]);
  });

  it("draws an in-game A-07 pose from the clip-local frame grid", () => {
    const drawImage = vi.fn();
    const sleep = { complete: true, naturalWidth: 1536, naturalHeight: 192 } as HTMLImageElement;
    const renderer = Object.create(SceneRenderer.prototype) as {
      context: Pick<CanvasRenderingContext2D, "drawImage" | "save" | "restore">;
      images: Map<string, HTMLImageElement>;
      imageLastUsed: Map<string, number>;
      state: null;
      a07AnimationKey: string;
      a07AnimationStartedAt: number;
      drawA07Passenger(time: number, reducedMotion: boolean): void;
    };
    renderer.context = { drawImage, save: vi.fn(), restore: vi.fn() };
    renderer.images = new Map([["a07-clip-sleep", sleep]]);
    renderer.imageLastUsed = new Map();
    renderer.state = null;
    renderer.a07AnimationKey = "menu:sleep";
    renderer.a07AnimationStartedAt = 0;

    renderer.drawA07Passenger(750, false);
    expect(drawImage).toHaveBeenCalledWith(sleep, 576, 0, 192, 192, 228, 318, 360, 360);
  });
});
