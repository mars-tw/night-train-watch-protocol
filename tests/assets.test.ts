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
});
