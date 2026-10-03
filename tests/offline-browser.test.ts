import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";
import { build as viteBuild } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dist = join(process.cwd(), "dist");
const swTemplate = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
const runFile = promisify(execFile);
let baseManifest: { files: string[] } = { files: [] };
const mime: Record<string, string> = {
  ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".vtt": "text/vtt",
};

describe("production offline lifecycle", () => {
  let build = "browser-v1";
  let breakInstall = false;
  let origin = "";
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname === "/sw.js") {
      response.setHeader("content-type", "text/javascript");
      response.setHeader("cache-control", "no-store");
      response.end(swTemplate.replaceAll("__NTWP_BUILD__", build).replaceAll("__NTWP_VERSION__", build));
      return;
    }
    if (pathname === "/precache.json") {
      const files = breakInstall ? [...baseManifest.files, "missing-install-asset.bin"] : baseManifest.files;
      response.setHeader("content-type", "application/json");
      response.setHeader("cache-control", "no-store");
      response.end(JSON.stringify({ build, files }));
      return;
    }
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = normalize(join(dist, relative));
    if (!file.startsWith(normalize(dist))) {
      response.writeHead(403).end();
      return;
    }
    try {
      response.setHeader("content-type", mime[extname(file)] ?? "application/octet-stream");
      response.end(readFileSync(file));
    } catch {
      response.writeHead(404).end("missing");
    }
  });

  beforeAll(async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await viteBuild({ logLevel: "silent", mode: "production" });
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
    await runFile(process.execPath, [join(process.cwd(), "tools", "write-precache.mjs")], { cwd: process.cwd() });
    baseManifest = JSON.parse(readFileSync(join(dist, "precache.json"), "utf8")) as { files: string[] };
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not start");
    origin = `http://127.0.0.1:${address.port}`;
  }, 30_000);
  afterAll(() => server.close());

  it("precaches all 45 runtime files with seven v2.3 A-07 clips and no full character atlas", () => {
    expect(baseManifest.files).toHaveLength(45);
    const a07Files = baseManifest.files.filter((file) => file.startsWith("assets/art/v23/a07-clips/"));
    expect(a07Files).toEqual([
      "assets/art/v23/a07-clips/drink.webp",
      "assets/art/v23/a07-clips/listen.webp",
      "assets/art/v23/a07-clips/settle.webp",
      "assets/art/v23/a07-clips/sit.webp",
      "assets/art/v23/a07-clips/sleep.webp",
      "assets/art/v23/a07-clips/startle.webp",
      "assets/art/v23/a07-clips/turn.webp",
    ]);
    expect(baseManifest.files).not.toContain("assets/art/v2/characters/a07/atlas.webp");
    const crops = baseManifest.files.filter(file => file.startsWith("assets/art/v23/crops/"));
    expect(crops).toHaveLength(12);
    for (const crop of ["lettuce", "tomato", "herb"]) {
      for (let stage = 0; stage < 4; stage++) {
        expect(crops).toContain(`assets/art/v23/crops/${crop}-stage${stage}.webp`);
      }
    }
    expect(baseManifest.files.some(file => file.startsWith("assets/art/crops/"))).toBe(false);
  });

  it("keeps the playable version through a failed update and announces the repaired update", async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: "allow", viewport: { width: 320, height: 568 } });
    const page = await context.newPage();
    try {
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      await expect.poll(() => page.locator(".offline-status").getAttribute("data-state"), { timeout: 15_000 }).toBe("ready");
      const viewports = [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }, { width: 1280, height: 640 }, { width: 1366, height: 600 }];
      for (const textScale of [100, 120, 140]) {
        if (textScale > 100) {
          await page.locator('[data-action="settings"]').click();
          await expect.poll(() => page.locator(".screen--settings").count()).toBe(1);
          await page.locator('[data-action="cycle-text"]').click();
          await expect.poll(() => page.locator('[data-action="cycle-text"] b').textContent()).toBe(`${textScale}%`);
          await page.locator('[data-action="menu"][aria-label="返回"]').click();
          await expect.poll(() => page.locator(".screen--menu").count()).toBe(1);
        }
        for (const viewport of viewports) {
          await page.setViewportSize(viewport);
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          const layout = await page.evaluate(() => {
            const status = document.querySelector(".offline-status")?.getBoundingClientRect();
            if (!status) return { inViewport: false, overlaps: true, scrollY: window.scrollY, invalidControls: ["missing status"] };
            const overlaps = [...document.querySelectorAll(".brand-lockup, .menu-actions button, .menu-footer")].some(element => {
              const rect = element.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && status.left < rect.right && status.right > rect.left && status.top < rect.bottom && status.bottom > rect.top;
            });
            const invalidControls = [...document.querySelectorAll<HTMLElement>(".menu-actions button, .menu-footer a, .menu-footer button")].flatMap((element, index) => {
              const rect = element.getBoundingClientRect();
              const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
              const valid = rect.top >= 0 && rect.bottom <= window.innerHeight && rect.height >= 44 && (center === element || element.contains(center));
              return valid ? [] : [`${index}:${Math.round(rect.top)}-${Math.round(rect.bottom)}:${Math.round(rect.height)}`];
            });
            return {
              inViewport: status.top >= 0 && status.bottom <= window.innerHeight,
              overlaps,
              scrollY: window.scrollY,
              invalidControls,
            };
          });
          expect(layout, `${viewport.width}x${viewport.height} at ${textScale}%`).toEqual({ inViewport: true, overlaps: false, scrollY: 0, invalidControls: [] });
        }
      }
      await page.setViewportSize({ width: 320, height: 568 });

      await page.locator('[data-action="new-game"][data-value="R01"]').click();
      await expect.poll(() => page.locator(".screen--menu").count()).toBe(0);
      expect(await page.locator(".offline-status").isHidden()).toBe(true);
      await expect.poll(async () => {
        if (await page.locator(".screen--missions").count()) return 1;
        await page.locator('[data-action="missions"]:visible').first().click({ timeout: 2_000 }).catch(() => undefined);
        return page.locator(".screen--missions").count();
      }).toBe(1);
      await expect.poll(async () => {
        if (await page.locator(".screen--hub").count()) return 1;
        await page.locator('[data-action="hub"][aria-label="返回"]').click({ timeout: 2_000 }).catch(() => undefined);
        return page.locator(".screen--hub").count();
      }).toBe(1);
      await expect.poll(async () => {
        if (await page.locator(".screen--menu").count()) return 1;
        await page.locator('[data-action="menu"][aria-label="返回"]').click({ timeout: 2_000 }).catch(() => undefined);
        return page.locator(".screen--menu").count();
      }).toBe(1);
      await expect.poll(() => page.locator(".offline-status").isVisible()).toBe(true);

      breakInstall = true;
      build = "browser-v2-broken";
      const scrollBeforeFailure = await page.evaluate(() => window.scrollY);
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
      await expect.poll(() => page.locator(".offline-status").getAttribute("data-state"), { timeout: 15_000 }).toBe("failed");
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        const retryLayout = await page.evaluate(() => {
          const status = document.querySelector(".offline-status")!.getBoundingClientRect();
          const retry = document.querySelector(".offline-status__retry")!.getBoundingClientRect();
          const centerTarget = document.elementFromPoint(retry.left + retry.width / 2, retry.top + retry.height / 2);
          const overlaps = [...document.querySelectorAll(".brand-lockup, .menu-actions button, .menu-footer")].some(element => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && status.left < rect.right && status.right > rect.left && status.top < rect.bottom && status.bottom > rect.top;
          });
          return {
            statusInViewport: status.top >= 0 && status.bottom <= window.innerHeight,
            retryInViewport: retry.top >= 0 && retry.bottom <= window.innerHeight,
            retryHeight: retry.height,
            overlaps,
            centerClear: Boolean(centerTarget?.closest(".offline-status__retry")),
            scrollY: window.scrollY,
          };
        });
        expect(retryLayout, `failed at ${viewport.width}x${viewport.height}`).toEqual({ statusInViewport: true, retryInViewport: true, retryHeight: 48, overlaps: false, centerClear: true, scrollY: 0 });
      }
      expect(scrollBeforeFailure).toBe(0);
      await page.setViewportSize({ width: 320, height: 568 });

      await context.setOffline(true);
      await page.reload({ waitUntil: "domcontentloaded" });
      expect(await page.locator("#app").isVisible()).toBe(true);
      await context.setOffline(false);

      breakInstall = false;
      build = "browser-v3-repaired";
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
      await expect.poll(() => page.locator(".offline-status").getAttribute("data-state"), { timeout: 15_000 }).toBe("update-ready");
    } finally {
      await context.close();
      await browser.close();
    }
  }, 45_000);
});
