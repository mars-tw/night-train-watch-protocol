import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.GAME_URL ?? "http://127.0.0.1:4312";
const outputDirectory = resolve("output/playwright/story-flow");
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "zh-TW",
  recordVideo: { dir: outputDirectory, size: { width: 390, height: 844 } },
});
const page = await context.newPage();
const storyVideo = page.video();
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function clickAction(action, value) {
  const suffix = value === undefined ? "" : `[data-value="${value}"]`;
  const target = page.locator(`[data-action="${action}"]${suffix}:not([disabled])`).first();
  await target.waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
  assert(await target.count() === 1, `Missing enabled action ${action}${value ? `:${value}` : ""}`);
  await target.click();
  await page.waitForTimeout(90);
}

const dayChoices = {
  1: ["partial"],
  2: ["keep"],
  3: ["delay"],
  4: ["GO"],
  5: ["verify"],
  6: ["read"],
  7: ["silent"],
};

const aftermathChoices = {
  5: "scan",
  6: "tell",
};

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolveDelete) => {
      const request = indexedDB.deleteDatabase("night-train-save");
      request.onsuccess = () => resolveDelete(undefined);
      request.onerror = () => resolveDelete(undefined);
      request.onblocked = () => resolveDelete(undefined);
    });
    localStorage.setItem("settings", JSON.stringify({
      textScale: 100,
      reducedMotion: true,
      noCountdown: true,
      lowSpeed: false,
      sound: false,
    }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await clickAction("new-game");
  await clickAction("power");
  await clickAction("toggle-power", "M002");
  await clickAction("toggle-power", "M003");
  await clickAction("power");
  await page.evaluate(async () => {
    const run = JSON.parse(localStorage.getItem("run.current") ?? "{}");
    Object.assign(run.resources, { energy: 100, fuel: 60, food: 8, water: 8, parts: 20 });
    for (const module of run.modules ?? []) {
      if (module.definitionId === "M002" || module.definitionId === "M003") {
        module.active = false;
        module.powered = false;
      }
    }
    const serialized = JSON.stringify(run);
    localStorage.setItem("run.current", serialized);
    await new Promise((resolveWrite) => {
      const request = indexedDB.open("night-train-save", 1);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("snapshots", "readwrite");
        transaction.objectStore("snapshots").put(serialized, "run.current");
        transaction.oncomplete = () => {
          database.close();
          resolveWrite(undefined);
        };
        transaction.onerror = () => resolveWrite(undefined);
      };
      request.onerror = () => resolveWrite(undefined);
    });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await clickAction("continue");

  const encounteredThreats = new Set();
  for (let day = 1; day <= 7; day += 1) {
    await page.waitForSelector(".screen--carriage.is-prep");
    await clickAction("route");
    await clickAction("select-route", "RN01");
    await clickAction("confirm-route", "RN01");
    await page.waitForSelector(".screen--event");

    for (const choiceId of dayChoices[day]) {
      if (day === 4) {
        assert(await page.locator('[data-action="event-choice"]').count() === 3, "Day 4 must show three permanent branches");
        await page.screenshot({ path: resolve(outputDirectory, "day4-three-branches.png"), fullPage: true });
      }
      await clickAction("event-choice", choiceId);
    }

    await page.waitForSelector(".screen--carriage.is-night");
    while (await page.locator(".screen--carriage.is-night").count()) {
      const alert = page.getByRole("alert");
      if (await alert.count() === 0) {
        await page.waitForTimeout(150);
        continue;
      }
      const alertText = (await alert.textContent({ timeout: 500 }).catch(() => "")) ?? "";
      if (!alertText) {
        await page.waitForTimeout(150);
        continue;
      }
      const threatId = await page.locator(".screen--carriage.is-night").getAttribute("data-threat-id", { timeout: 500 }).catch(() => null);
      if (threatId) encounteredThreats.add(threatId);
      let counter = page.locator('.emergency-actions [data-action="counter"]:not([disabled])').first();
      if (await counter.count() === 0) {
        await page.waitForTimeout(650);
        if (await page.locator(".screen--carriage.is-night").count() === 0) break;
        counter = page.locator('.emergency-actions [data-action="counter"]:not([disabled])').first();
      }
      assert(await counter.count() === 1, `Night ${day} must expose a clickable counter`);
      await counter.click();
      await page.waitForTimeout(120);
    }

    const aftermathChoice = aftermathChoices[day];
    if (aftermathChoice) {
      await page.waitForSelector(".screen--event");
      await clickAction("event-choice", aftermathChoice);
    }
    if (day < 7) {
      await page.waitForSelector(".screen--result");
      await clickAction("next-day");
    }
  }

  await page.waitForSelector(".screen--event");
  await clickAction("event-choice", "inspect");
  await page.waitForSelector('[data-event-id="EV051"]');
  assert(await page.locator('[data-action="event-choice"]').count() === 4, "Finale must show four visible decisions");
  assert(await page.locator('[data-action="event-choice"][data-value="open"]:not([disabled])').count() === 1, "Open finale decision must remain usable");
  await page.screenshot({ path: resolve(outputDirectory, "day7-four-decisions.png"), fullPage: true });
  await clickAction("event-choice", "open");
  await page.waitForSelector('[data-event-id="EV052"]');
  await clickAction("event-choice", "truth");
  await page.waitForSelector(".screen--result");

  const savedRun = JSON.parse((await page.evaluate(() => localStorage.getItem("run.current"))) ?? "{}");
  assert(savedRun.day === 7 && savedRun.ended === true, "Browser flow must finish on Day 7");
  assert(savedRun.story.flags.day4Route === "GO", "Browser flow must preserve the Day 4 branch");
  assert(savedRun.story.completedContactWaves === 3, "Browser flow must complete all three finale contacts");
  assert(savedRun.story.finalDecision === "open", "Browser flow must preserve the visible finale decision");
  assert(savedRun.story.endingId, "Browser flow must lock exactly one ending");
  assert(browserErrors.length === 0, `Browser errors: ${browserErrors.join(" | ")}`);
  await page.screenshot({ path: resolve(outputDirectory, "day7-ending.png"), fullPage: true });

  const report = {
    status: "passed",
    viewport: { width: 390, height: 844 },
    day: savedRun.day,
    day4Route: savedRun.story.flags.day4Route,
    completedContactWaves: savedRun.story.completedContactWaves,
    finalDecision: savedRun.story.finalDecision,
    endingId: savedRun.story.endingId,
    encounteredThreats: [...encounteredThreats],
    screenshots: 3,
    videos: 1,
  };
  const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(resolve(outputDirectory, "story-flow-report.json"), serializedReport, "utf8");
  await writeFile(resolve("public/assets/qa/story-flow-report.json"), serializedReport, "utf8");
  console.log(serializedReport);
  await page.close();
  await storyVideo?.saveAs(resolve(outputDirectory, "day1-7-story-playthrough.webm"));
} finally {
  await browser.close();
}
