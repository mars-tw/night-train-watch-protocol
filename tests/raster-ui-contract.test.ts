import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const icons = readFileSync(resolve(root, "src/ui/icons.ts"), "utf8");
const view = readFileSync(resolve(root, "src/ui/view.ts"), "utf8");
const css = readFileSync(resolve(root, "src/styles/v2.css"), "utf8");

describe("v2.1 raster UI contract", () => {
  it("maps all 32 atlas cells and keeps a text fallback", () => {
    for (const name of ["play", "build", "hub", "settings", "power", "fuel", "temperature", "noise", "hull", "meal", "route", "back", "pause", "scan", "danger", "tech", "shield", "shock", "boost", "sleep", "defense", "workshop", "greenhouse", "kitchen", "water", "medicine", "repair", "comfort", "seed", "harvest", "quest", "journal"]) {
      expect(icons).toContain(`${name}:`);
      expect(css).toContain(`.ui-icon--${name}`);
    }
    expect(icons).toContain("ui-icon-fallback");
    expect(icons).toContain("initializeRasterIcons");
    expect(icons).toContain("escapeIconText");
    expect(icons).toContain("LEGACY_ICON_ALIASES");
    for (const glyph of ["▶", "E", "F", "◇", "▰", "剪", "門", "葉", "錶", "光"]) {
      expect(icons).toContain(glyph);
    }
    expect(css).toContain("icon-atlas.webp");
    expect(css).toContain("background-size: 400% 800%");
    expect(css).toContain("var(--icon-col) * 33.3333%");
    expect(css).toContain("var(--icon-row) * 14.2857%");
    expect(css).toContain(".raster-icons-ready .ui-icon > span");
  });

  it("uses raster route and technology maps without inline SVG", () => {
    expect(view).toContain("map-art--route");
    expect(view).toContain("map-art--tech");
    expect(view).not.toContain("<svg");
    expect(view).toContain("carriageIcon(carriage.id)");
    for (const glyph of ["窗", "看", "話", "醫", "撫", "百", "修", "聽", "許", "補", "整", "煮"]) {
      expect(view).not.toContain(`<b>${glyph}</b>`);
    }
    expect(view).toContain('data-value="window-silhouette"');
    expect(view).toContain("iconMarkup(icons.medicine)");
    expect(view).toContain("iconMarkup(icons.repair)");
    expect(view).toContain("iconMarkup(icons.meal)");
    expect(css).toContain("maps.webp");
    expect(css).toContain("background-size: 200% 100%");
    expect(css).toContain("min-width: 48px");
  });
});
