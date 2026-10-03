import { describe, expect, it, vi } from "vitest";
import { installAppViewport } from "../src/ui/viewport";

class FakeViewport extends EventTarget {
  width = 390;
  height = 844;
  offsetTop = 0;
  scale = 1;
}

describe("app viewport", () => {
  it("tracks the visual viewport through browser-bar resize and rotation", () => {
    const viewport = new FakeViewport();
    const style = { setProperty: vi.fn() };
    const dataset: Record<string, string> = {};
    const win = Object.assign(new EventTarget(), {
      innerWidth: 390,
      innerHeight: 844,
      document: { documentElement: { style, dataset } },
      visualViewport: viewport,
    }) as unknown as Window;

    const controller = installAppViewport(win);
    expect(style.setProperty).toHaveBeenCalledWith("--app-height", "844px");
    expect(style.setProperty).toHaveBeenCalledWith("--scene-width", "390px");
    expect(style.setProperty).toHaveBeenCalledWith("--scene-height", `${390 / 0.5625}px`);
    expect(dataset.viewportOrientation).toBe("portrait");

    viewport.width = 844;
    viewport.height = 390;
    viewport.offsetTop = 18;
    viewport.dispatchEvent(new Event("resize"));
    expect(style.setProperty).toHaveBeenCalledWith("--app-width", "844px");
    expect(style.setProperty).toHaveBeenCalledWith("--app-height", "390px");
    expect(style.setProperty).toHaveBeenCalledWith("--app-viewport-top", "18px");
    expect(dataset.viewportOrientation).toBe("landscape");

    viewport.scale = 2;
    viewport.width = 422;
    viewport.height = 195;
    viewport.offsetTop = 64;
    viewport.dispatchEvent(new Event("scroll"));
    expect(style.setProperty).toHaveBeenCalledWith("--app-width", "390px");
    expect(style.setProperty).toHaveBeenCalledWith("--app-height", "844px");
    expect(style.setProperty).toHaveBeenCalledWith("--app-viewport-top", "64px");
    expect(style.setProperty).toHaveBeenLastCalledWith("--scene-top", `${(844 - (390 / 0.5625)) / 2}px`);
    expect(dataset.viewportZoomed).toBe("true");
    controller.destroy();
  });
});
