import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.GAME_URL ?? "http://127.0.0.1:4312";
const outputDirectory = resolve("output/playwright/button-audit");
await mkdir(outputDirectory, { recursive: true });

const expectedActions = [
  "new-game", "continue", "menu", "hub", "settings", "carriage", "pause", "route", "modules", "modules-preview",
  "tech", "event-preview", "select-route", "confirm-route", "event-choice", "counter", "next-day", "select-module",
  "select-module-category", "power", "meal", "toggle-module", "toggle-power", "select-ration", "build-module", "select-tech",
  "select-tech-branch", "unlock-tech", "harvest", "comfort", "repair-hull", "cycle-text", "toggle-motion", "toggle-countdown",
  "toggle-speed", "toggle-sound", "decorate", "select-decoration", "move-decoration", "reset-decor", "finish-decor",
];
const clickedActions = new Set();
const assertions = [];
const browserErrors = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
  assertions.push(message);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-TW" });
const page = await context.newPage();
page.on("pageerror", (error) => browserErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});

async function auditRenderedButtons(label) {
  const missingAction = await page.locator("button:not([data-action])").count();
  assert(missingAction === 0, `${label}: every button exposes a data-action`);
  const unknownActions = await page.locator("button[data-action]").evaluateAll((buttons, expected) => {
    const allow = new Set(expected);
    return [...new Set(buttons.map((button) => button.dataset.action).filter((action) => action && !allow.has(action)))];
  }, expectedActions);
  assert(unknownActions.length === 0, `${label}: every rendered action is part of the controller contract`);
}

async function clickAction(action, value) {
  const suffix = value === undefined ? "" : `[data-value="${value}"]`;
  const target = page.locator(`[data-action="${action}"]${suffix}:not([disabled])`).first();
  assert(await target.count() === 1, `${action}${value ? `:${value}` : ""} is present and enabled`);
  await target.click();
  clickedActions.add(action);
  await page.waitForTimeout(60);
  await auditRenderedButtons(`after ${action}`);
}

async function dragDecoration(id, targetX, targetY) {
  const item = page.locator(`.decor-item[data-decor-id="${id}"]`);
  const layer = page.locator(".carriage-decor-layer");
  const itemBox = await item.boundingBox();
  const layerBox = await layer.boundingBox();
  assert(Boolean(itemBox && layerBox), `${id} decoration and carriage placement area are visible`);
  await page.mouse.move(itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(layerBox.x + layerBox.width * targetX / 100, layerBox.y + layerBox.height * targetY / 100, { steps: 12 });
  await page.mouse.up();
  clickedActions.add("move-decoration");
  await page.waitForFunction(({ decorId, x, y }) => {
    const target = document.querySelector(`[data-decor-id="${decorId}"]`);
    return target && Math.abs(Number(target.getAttribute("data-decoration-x")) - x) < 2 && Math.abs(Number(target.getAttribute("data-decoration-y")) - y) < 2;
  }, { decorId: id, x: targetX, y: targetY });
  await auditRenderedButtons(`after dragging ${id}`);
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".screen--menu");
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolveDelete) => {
      const request = indexedDB.deleteDatabase("night-train-save");
      request.onsuccess = () => resolveDelete(undefined);
      request.onerror = () => resolveDelete(undefined);
      request.onblocked = () => resolveDelete(undefined);
    });
    localStorage.setItem("settings", JSON.stringify({ textScale: 100, reducedMotion: false, noCountdown: false, lowSpeed: false, sound: false }));
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".screen--menu");
  await auditRenderedButtons("fresh menu");

  await clickAction("settings");
  await page.waitForSelector(".screen--settings");
  await clickAction("cycle-text");
  assert((await page.locator('[data-action="cycle-text"] b').textContent()) === "120%", "text scale button cycles to 120%");
  await clickAction("toggle-motion");
  assert((await page.locator('[data-action="toggle-motion"] b').textContent()) === "ON", "reduced-motion button reports ON");
  await clickAction("toggle-countdown");
  assert((await page.locator('[data-action="toggle-countdown"] b').textContent()) === "ON", "no-countdown button reports ON");
  await clickAction("toggle-speed");
  assert((await page.locator('[data-action="toggle-speed"] b').textContent()) === "ON", "slow-speed button reports ON");
  await clickAction("toggle-sound");
  assert((await page.locator('[data-action="toggle-sound"] b').textContent()) === "ON", "sound button reports ON");
  await clickAction("toggle-motion");
  await clickAction("toggle-countdown");
  await clickAction("toggle-speed");
  await clickAction("toggle-sound");
  await clickAction("cycle-text");
  await clickAction("cycle-text");
  await clickAction("menu");
  await page.waitForSelector(".screen--menu");

  await clickAction("new-game");
  await page.waitForSelector(".screen--carriage.is-prep");
  assert((await page.locator(".app-header").textContent())?.includes("5 AP"), "new game starts with five action points");

  await clickAction("decorate");
  await page.waitForSelector(".decor-tray");
  assert(await page.locator(".decor-item img").count() === 4, "four GPT decoration sprites are visible inside the carriage");
  await clickAction("select-decoration", "radio");
  await dragDecoration("radio", 52, 40);
  assert((await page.locator(".toast-message").textContent())?.includes("短波機已移到新位置"), "dragging a sprite gives visible save feedback");
  await clickAction("reset-decor");
  await page.waitForFunction(() => document.querySelector('[data-decor-id="radio"]')?.getAttribute("data-decoration-x") === "68");
  await dragDecoration("radio", 68, 20);
  const savedRadioPosition = await page.locator('[data-decor-id="radio"]').evaluate((element) => ({ x: element.getAttribute("data-decoration-x"), y: element.getAttribute("data-decoration-y") }));
  await page.screenshot({ path: resolve(outputDirectory, "00-visible-drag-decoration.png"), fullPage: true });
  await clickAction("finish-decor");
  await page.waitForFunction(() => !document.querySelector(".decor-tray"));
  assert(await page.locator(".decor-item img").count() === 4, "finished decorations remain visibly placed in the carriage");
  await page.screenshot({ path: resolve(outputDirectory, "00b-visible-decorations-in-play.png"), fullPage: true });

  await clickAction("select-module", "M002");
  await clickAction("comfort");
  await page.waitForFunction(() => document.querySelector(".toast-message")?.textContent?.includes("壓力 −8"));
  assert((await page.locator(".toast-message").textContent())?.includes("壓力 −8"), "comfort reports its survivor effect");
  await clickAction("toggle-module", "M002");
  await page.waitForFunction(() => document.querySelector(".module-state")?.textContent?.includes("OFF"));
  assert((await page.locator(".module-state").textContent())?.includes("OFF"), "module detail toggle turns the heater off");
  await clickAction("toggle-module", "M002");
  await page.waitForFunction(() => document.querySelector(".module-state")?.textContent?.includes("ON"));
  await clickAction("select-module", "M003");
  await clickAction("harvest");
  await page.waitForFunction(() => document.querySelector('[data-action="harvest"]')?.hasAttribute("disabled"));
  assert(await page.locator('[data-action="harvest"]').isDisabled(), "harvest becomes disabled after its once-per-day use");

  await clickAction("modules");
  await page.waitForSelector(".screen--modules");
  await clickAction("select-module-category", "防禦");
  await clickAction("select-module", "M004");
  await clickAction("build-module", "M004");
  await page.waitForSelector(".screen--carriage.is-prep");
  assert((await page.locator(".toast-message").textContent())?.includes("感測器網已安裝"), "build button installs the selected module");

  await clickAction("power");
  await page.waitForSelector(".power-config");
  await clickAction("toggle-power", "M004");
  await page.waitForFunction(() => document.querySelector('[data-action="toggle-power"][data-value="M004"]')?.textContent?.includes("OFF"));
  assert((await page.locator('[data-action="toggle-power"][data-value="M004"]').textContent())?.includes("OFF"), "power row turns the sensor off");
  await clickAction("toggle-power", "M004");
  await page.waitForFunction(() => document.querySelector('[data-action="toggle-power"][data-value="M004"]')?.textContent?.includes("ON"));
  await clickAction("meal");
  await page.waitForSelector(".meal-config");
  await clickAction("select-ration", "full");
  await page.waitForFunction(() => document.querySelector(".toast-message")?.textContent?.includes("安心餐"));
  assert((await page.locator(".toast-message").textContent())?.includes("安心餐"), "ration selection gives immediate feedback");

  const fuelBeforeRouteBack = JSON.parse((await page.evaluate(() => localStorage.getItem("run.current"))) ?? "{}").resources.fuel;
  await clickAction("route");
  await page.waitForSelector(".screen--route");
  await clickAction("select-route", "RN01");
  await clickAction("carriage");
  await page.waitForSelector(".screen--carriage.is-prep");
  const fuelAfterRouteBack = JSON.parse((await page.evaluate(() => localStorage.getItem("run.current"))) ?? "{}").resources.fuel;
  assert(fuelAfterRouteBack === fuelBeforeRouteBack, "route back button does not spend fuel");

  await clickAction("route");
  await clickAction("select-route", "RN01");
  await clickAction("confirm-route", "RN01");
  await page.waitForSelector(".screen--event");
  await clickAction("event-choice", "B");
  await page.waitForSelector(".screen--carriage.is-night");

  const alert = page.getByRole("alert");
  await clickAction("pause");
  const pausedAt = await alert.textContent();
  await page.waitForTimeout(1400);
  assert((await alert.textContent()) === pausedAt, "pause freezes the threat countdown");
  await clickAction("pause");
  await page.waitForTimeout(1200);
  assert((await alert.textContent()) !== pausedAt, "resume advances the threat countdown");
  const contactName = (await alert.textContent()) ?? "";
  await clickAction("counter", contactName.includes("攀附者") ? "emergency-boost" : "close-shutter");
  await page.waitForSelector(".screen--result");
  await clickAction("next-day");
  await page.waitForSelector(".screen--carriage.is-prep");

  await clickAction("route");
  await clickAction("select-route", "RN01");
  await clickAction("confirm-route", "RN01");
  await page.waitForSelector(".screen--event");
  const safeChoice = await page.locator('[data-action="event-choice"]:not([disabled])').last().getAttribute("data-value");
  await clickAction("event-choice", safeChoice ?? "B");
  await page.waitForSelector(".screen--carriage.is-night");
  await page.waitForSelector(".screen--result", { timeout: 20000 });
  assert((await page.locator(".aftermath-note").textContent())?.includes("破口"), "unanswered threat reaches a visible breach result");
  await clickAction("next-day");
  await page.waitForSelector(".screen--carriage.is-prep");
  const damagedHull = Number((await page.locator(".status-panel--environment div").last().locator("strong").textContent())?.replace("%", ""));
  await clickAction("select-module", "M001");
  await clickAction("repair-hull");
  await page.waitForFunction((before) => Number(document.querySelector(".status-panel--environment div:last-child strong")?.textContent?.replace("%", "")) > before, damagedHull);
  const repairedHull = Number((await page.locator(".status-panel--environment div").last().locator("strong").textContent())?.replace("%", ""));
  assert(repairedHull > damagedHull, "repair button restores damaged hull");
  await page.screenshot({ path: resolve(outputDirectory, "01-repaired-carriage.png"), fullPage: true });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("run.current") ?? "{}").environment?.hull > 82);

  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".screen--menu");
  await clickAction("continue");
  await page.waitForSelector(".screen--carriage.is-prep");
  assert((await page.locator(".app-header").textContent())?.includes("第 3 日"), "continue restores the current preparation day");
  assert(await page.locator('[data-decor-id="radio"]').getAttribute("data-decoration-x") === savedRadioPosition.x, "dragged radio x position survives reload");
  assert(await page.locator('[data-decor-id="radio"]').getAttribute("data-decoration-y") === savedRadioPosition.y, "dragged radio y position survives reload");

  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".screen--menu");
  await clickAction("hub");
  await page.waitForSelector(".screen--hub");
  const saveBeforePreviews = await page.evaluate(() => localStorage.getItem("run.current"));

  await clickAction("route");
  await page.waitForSelector(".screen--route");
  assert((await page.locator(".app-header").textContent())?.includes("路線圖鑑"), "hub route opens in read-only preview mode");
  assert(await page.locator('[data-action="confirm-route"]').isDisabled(), "route preview cannot spend fuel or advance the run");
  await clickAction("select-route", "RN03");
  await page.screenshot({ path: resolve(outputDirectory, "02-route-preview.png"), fullPage: true });
  await clickAction("hub");

  await clickAction("modules-preview");
  await page.waitForSelector(".screen--modules");
  assert((await page.locator(".app-header").textContent())?.includes("列車起始藍圖"), "hub blueprint opens the module catalogue instead of the ended carriage");
  await clickAction("select-module-category", "生活");
  await clickAction("select-module", "M005");
  assert(await page.locator('[data-action="build-module"]').isDisabled(), "blueprint preview cannot build or spend parts");
  await page.screenshot({ path: resolve(outputDirectory, "03-module-preview.png"), fullPage: true });
  await clickAction("hub");

  await clickAction("event-preview");
  await page.waitForSelector(".screen--event");
  assert(await page.locator('[data-action="event-choice"]:not([disabled])').count() === 0, "event preview cannot consume resources or advance time");
  await clickAction("hub");
  assert((await page.evaluate(() => localStorage.getItem("run.current"))) === saveBeforePreviews, "all hub previews leave the saved run byte-for-byte unchanged");

  await clickAction("tech");
  await page.waitForSelector(".screen--tech");
  await clickAction("select-tech-branch", "防禦");
  await clickAction("select-tech", "D1");
  await clickAction("unlock-tech", "D1");
  await page.waitForFunction(() => document.querySelector('[data-action="unlock-tech"]')?.hasAttribute("disabled"));
  assert(await page.locator('[data-action="unlock-tech"]').isDisabled(), "successful tech unlock becomes an explicit disabled owned state");
  await clickAction("hub");
  await clickAction("menu");
  await page.waitForSelector(".screen--menu");

  const missingCoverage = expectedActions.filter((action) => !clickedActions.has(action));
  assert(missingCoverage.length === 0, `all ${expectedActions.length} controller actions were exercised`);
  assert(browserErrors.length === 0, "browser emitted no page or console errors");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "390px viewport has no horizontal overflow");

  const report = {
    status: "passed",
    baseUrl,
    viewport: "390x844",
    actionsExercised: [...clickedActions].sort(),
    actionCount: clickedActions.size,
    assertions: assertions.length,
    browserErrors,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(resolve(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Button audit passed: ${report.actionCount} actions, ${report.assertions} assertions; report written to ${outputDirectory}`);
} finally {
  await browser.close();
}
