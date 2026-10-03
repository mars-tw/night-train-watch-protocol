import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "..");
const view = readFileSync(resolve(workspace, "src/ui/view.ts"), "utf8");

describe("v2.3 crop runtime wiring", () => {
  it("routes all crop stages to the 192px v2.3 WebP set", () => {
    expect(view).toContain("./assets/art/v23/crops/${cropId}-stage${Math.min(3, Math.max(0, stage))}.webp");
    expect(view).not.toContain("./assets/art/crops/${cropId}-${Math.min(3, Math.max(0, stage))}.png");
    for (const crop of ["lettuce", "tomato", "herb"]) {
      for (const stage of [0, 1, 2, 3]) {
        expect(existsSync(resolve(workspace, `public/assets/art/v23/crops/${crop}-stage${stage}.webp`))).toBe(true);
      }
    }
  });
});
