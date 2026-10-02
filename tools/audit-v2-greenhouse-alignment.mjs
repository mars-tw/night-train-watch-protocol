import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.GAME_URL ?? "http://127.0.0.1:4177";
const evidenceRoot = resolve("docs/evidence/v2");
const screenshotRoot = resolve(evidenceRoot, "screenshots");
const reportPath = resolve(evidenceRoot, "greenhouse-alignment-qa.json");
await mkdir(screenshotRoot, { recursive: true });

const report = {
  status: "running",
  generatedAt: new Date().toISOString(),
  baseUrl,
  metadata: {
    fixtureInjection: false,
    source: "fresh R01 browser context; two lettuce plots matured through one real night",
    geometryAuthority: "CARRIAGE_SCENES.greenhouse.hotspots",
  },
  viewports: [],
  failures: [],
};

function assert(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

async function clickAction(page, action, value) {
  const suffix = value === undefined ? "" : `[data-value="${value}"]`;
  const locator = page.locator(`[data-action="${action}"]${suffix}:not([disabled])`).filter({ visible: true }).first();
  await locator.waitFor({ state: "visible", timeout: 10_000 });
  await locator.click();
  await page.waitForTimeout(120);
}

async function resolveEvent(page, preferred = []) {
  await page.waitForSelector(".screen--event");
  await page.waitForTimeout(650);
  for (const value of preferred) {
    const choice = page.locator(`[data-action="event-choice"][data-value="${value}"]:not([disabled])`);
    if (await choice.count()) {
      await choice.first().click();
      await page.waitForTimeout(120);
      return;
    }
  }
  const choice = page.locator('[data-action="event-choice"]:not([disabled])').first();
  await choice.click();
  await page.waitForTimeout(120);
}

async function matureTwoPlots(page) {
  await clickAction(page, "settings");
  await clickAction(page, "toggle-countdown");
  await clickAction(page, "toggle-sound");
  await clickAction(page, "menu");
  await clickAction(page, "new-game", "R01");
  await page.waitForSelector(".screen--carriage.is-prep");
  for (const plotId of ["plot-a", "plot-b"]) {
    await clickAction(page, "preview-action", `plant-crop|${plotId}:lettuce`);
    await clickAction(page, "confirm-object-action");
  }
  await clickAction(page, "route");
  await page.waitForSelector(".screen--route");
  await clickAction(page, "select-route", "RN01");
  await clickAction(page, "confirm-route", "RN01");
  if (await page.locator(".screen--event").count())
    await resolveEvent(page, ["partial", "wait"]);
  await page.waitForSelector(".screen--carriage.is-night");
  for (let index = 0; index < 4 && !(await page.locator(".screen--result").count()); index += 1) {
    const roof = page.locator('[data-action="counter"][data-value="roof-release"]:not([disabled])');
    const counter = await roof.count()
      ? roof.first()
      : page.locator('[data-action="counter"]:not([disabled])').first();
    await counter.click();
    await page.waitForTimeout(120);
  }
  await page.waitForSelector(".screen--result");
  await clickAction(page, "next-day");
  if (await page.locator(".screen--event").count()) await resolveEvent(page, ["keep"]);
  await page.waitForSelector(".screen--carriage.is-prep");
  await clickAction(page, "select-carriage", "greenhouse");
  await page.waitForSelector('.crop-scene-plot.stage-3[data-scene-hotspot="greenhouse-a"]');
  await page.waitForSelector('.crop-scene-plot.stage-3[data-scene-hotspot="greenhouse-b"]');
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    const context = await browser.newContext({ viewport, locale: "zh-TW" });
    const page = await context.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await matureTwoPlots(page);
      await page.waitForTimeout(650);
      const metrics = await page.locator(".crop-scene-layer").evaluate((layer) => {
        const buttons = [...layer.querySelectorAll(".crop-scene-plot")].map((button) => {
          const rect = button.getBoundingClientRect();
          const style = getComputedStyle(button);
          const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return {
            hotspot: button.getAttribute("data-scene-hotspot"),
            x: Number.parseFloat(style.getPropertyValue("--x")),
            y: Number.parseFloat(style.getPropertyValue("--y")),
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            centerClear: top === button || Boolean(top && button.contains(top)),
            imageVisible: Boolean(button.querySelector("img")?.getBoundingClientRect().width),
          };
        });
        const [a, b] = buttons;
        const overlapWidth = a && b ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) : 0;
        const overlapHeight = a && b ? Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0;
        return {
          buttons,
          overlapArea: Math.round(overlapWidth * overlapHeight * 10) / 10,
          horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      assert(metrics.buttons.length === 2, `${viewport.width}×${viewport.height} renders both mature plots`, metrics);
      assert(
        metrics.buttons[0].hotspot === "greenhouse-a" &&
          metrics.buttons[1].hotspot === "greenhouse-b" &&
          metrics.buttons[0].x === 20.5 &&
          metrics.buttons[0].y === 36.5 &&
          metrics.buttons[1].x === 22 &&
          metrics.buttons[1].y === 54,
        `${viewport.width}×${viewport.height} uses manifest-derived plot centers`,
        metrics,
      );
      assert(metrics.overlapArea === 0, `${viewport.width}×${viewport.height} mature plot hit rectangles do not overlap`, metrics);
      assert(metrics.buttons.every((button) => button.width >= 48 && button.height >= 48 && button.centerClear && button.imageVisible), `${viewport.width}×${viewport.height} mature plot images and click centers remain usable`, metrics);
      assert(metrics.horizontalOverflow <= 0, `${viewport.width}×${viewport.height} greenhouse has no horizontal overflow`, metrics);
      const screenshot = `greenhouse-alignment-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path: resolve(screenshotRoot, screenshot) });
      report.viewports.push({ ...viewport, ...metrics, screenshot });
    } catch (error) {
      report.failures.push({
        viewport,
        message: error instanceof Error ? error.message : String(error),
        details: error?.details,
      });
    } finally {
      await context.close();
    }
  }
  report.status = report.failures.length === 0 ? "passed" : "failed";
} finally {
  report.generatedAt = new Date().toISOString();
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await browser.close();
}

if (report.status !== "passed") {
  throw new Error(`Greenhouse alignment QA failed: ${report.failures.map((failure) => failure.message).join(" | ")}`);
}
console.log("Greenhouse alignment QA passed for 360×640, 390×844 and 430×932.");
