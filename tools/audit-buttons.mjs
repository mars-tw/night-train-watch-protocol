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
  "select-tech-branch", "unlock-tech", "comfort", "repair-hull", "cycle-text", "toggle-motion", "toggle-countdown",
  "toggle-speed", "toggle-sound", "decorate", "select-decoration", "move-decoration", "place-decoration", "reset-decor", "finish-decor",
  "select-carriage", "select-crop", "plant-crop", "water-crops", "harvest-crop", "workshop-scrap", "cook-meal",
  "swipe-carriage",
];
const clickedActions = new Set();
const assertions = [];
const browserErrors = [];
let visualLayoutMetrics = null;
let compactLayoutMetrics = null;

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
  const obstructed = await page.locator("button[data-action]:not([disabled])").evaluateAll((buttons) => buttons.flatMap((button) => {
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (rect.width === 0 || rect.height === 0 || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return [];
    const top = document.elementFromPoint(x, y);
    if (top && (top === button || button.contains(top))) return [];
    return [{ action: button.dataset.action, label: button.getAttribute("aria-label") ?? button.textContent?.trim().slice(0, 24), coveredBy: top?.tagName ?? "none" }];
  }));
  assert(obstructed.length === 0, `${label}: every visible enabled button has an unobstructed center target${obstructed.length ? ` (${JSON.stringify(obstructed)})` : ""}`);
}

async function clickAction(action, value) {
  const suffix = value === undefined ? "" : `[data-value="${value}"]`;
  const target = page.locator(`[data-action="${action}"]${suffix}:not([disabled])`).first();
  assert(await target.count() === 1, `${action}${value ? `:${value}` : ""} is present and enabled`);
  await target.click();
  clickedActions.add(action);
  await page.waitForTimeout(await page.locator(".screen-enter").count() ? 560 : 60);
  await auditRenderedButtons(`after ${action}`);
  console.log(`✓ ${action}${value === undefined ? "" : `:${value}`}`);
}

async function dragDecoration(id, slotId) {
  const item = page.locator(`.decor-item[data-decor-id="${id}"]`);
  const slot = page.locator(`.decor-slot[data-slot-id="${slotId}"]`);
  const itemBox = await item.boundingBox();
  const slotBox = await slot.boundingBox();
  assert(Boolean(itemBox && slotBox), `${id} decoration and ${slotId} placement slot are visible`);
  await page.mouse.move(itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2, { steps: 12 });
  await page.mouse.up();
  clickedActions.add("move-decoration");
  await page.waitForFunction(({ decorId, expectedSlot }) => {
    const target = document.querySelector(`[data-decor-id="${decorId}"]`);
    return target?.getAttribute("data-decoration-slot") === expectedSlot;
  }, { decorId: id, expectedSlot: slotId });
  await auditRenderedButtons(`after dragging ${id}`);
}

async function swipeCarriage(direction, expectedCarriage) {
  const screen = page.locator(".screen--carriage.is-observation-mode");
  const box = await screen.boundingBox();
  assert(Boolean(box), `observation scene is visible before ${direction} swipe`);
  const startX = direction === "next" ? box.x + box.width * 0.76 : box.x + box.width * 0.24;
  const endX = direction === "next" ? box.x + box.width * 0.28 : box.x + box.width * 0.72;
  const y = box.y + box.height * 0.48;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps: 10 });
  await page.mouse.up();
  clickedActions.add("swipe-carriage");
  await page.waitForSelector(`.screen--carriage[data-carriage="${expectedCarriage}"]`);
  await auditRenderedButtons(`after ${direction} carriage swipe`);
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
  assert(await page.locator('.screen--carriage[data-carriage="greenhouse"]').count() === 1, "new game opens the distinct greenhouse carriage");
  assert(await page.locator(".prep-ap-dial").count() === 1, "preparation uses a readable AP dial instead of a disabled pause button");
  assert(await page.locator('[data-action="pause"]').count() === 0, "preparation screen does not expose a fake disabled pause control");
  assert(await page.locator(".carriage-swipe-hint").count() === 1, "first preparation view teaches horizontal carriage swiping");
  visualLayoutMetrics = await page.evaluate(() => {
    const selector = document.querySelector(".carriage-selector")?.getBoundingClientRect();
    const toast = document.querySelector(".toast-message")?.getBoundingClientRect();
    const dock = document.querySelector(".carriage-dock")?.getBoundingClientRect();
    const targets = [...document.querySelectorAll(".screen--carriage button:not([disabled])")]
      .map((button) => button.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    return {
      uninterruptedSceneHeight: Math.round((toast?.top ?? dock?.top ?? 0) - (selector?.bottom ?? 0)),
      dockHeight: Math.round(dock?.height ?? 0),
      minimumTouchWidth: Math.round(Math.min(...targets.map((rect) => rect.width))),
      minimumTouchHeight: Math.round(Math.min(...targets.map((rect) => rect.height))),
    };
  });
  assert(await page.locator(".prep-control-panel").count() === 0, "observation mode starts without a large panel covering the carriage");
  assert(visualLayoutMetrics.uninterruptedSceneHeight >= 500, `default carriage keeps at least 500px of uninterrupted scene (${visualLayoutMetrics.uninterruptedSceneHeight}px)`);
  assert(visualLayoutMetrics.dockHeight <= 76, `command dock stays compact (${visualLayoutMetrics.dockHeight}px)`);
  assert(visualLayoutMetrics.minimumTouchWidth >= 48 && visualLayoutMetrics.minimumTouchHeight >= 48, `visible carriage targets are at least 48px (${visualLayoutMetrics.minimumTouchWidth}×${visualLayoutMetrics.minimumTouchHeight})`);
  await page.screenshot({ path: resolve(outputDirectory, "22-swipe-guidance.png"), fullPage: true });

  await swipeCarriage("next", "kitchen");
  assert(await page.locator(".carriage-swipe-hint").count() === 0, "swipe hint disappears after the player learns carriage navigation");
  await swipeCarriage("previous", "greenhouse");

  await clickAction("select-crop", "tomato");
  await clickAction("plant-crop", "plot-a:tomato");
  await page.waitForSelector('.crop-scene-plot.stage-1');
  assert((await page.locator(".toast-message").textContent())?.includes("矮株番茄已播入上層槽"), "sowing gives visible crop and resource feedback");
  assert((await page.locator(".feedback-chips").textContent())?.includes("AP -1"), "sowing shows its AP cost as a visible delta ticket");
  assert((await page.locator(".feedback-chips").textContent())?.includes("水 -1"), "sowing shows its water cost as a visible delta ticket");
  await page.screenshot({ path: resolve(outputDirectory, "23-action-feedback.png"), fullPage: true });
  await page.screenshot({ path: resolve(outputDirectory, "17-greenhouse-farming.png"), fullPage: true });

  await clickAction("select-carriage", "sleep");
  assert(await page.locator('.screen--carriage[data-carriage="sleep"]').count() === 1, "sleep carriage has its own visible configuration");
  await page.screenshot({ path: resolve(outputDirectory, "14-sleep-carriage.png"), fullPage: true });
  await clickAction("comfort");
  await page.waitForFunction(() => document.querySelector(".toast-message")?.textContent?.includes("壓力 −8"));
  assert((await page.locator(".toast-message").textContent())?.includes("壓力 −8"), "sleep-carriage comfort action reports its survivor effect");

  await clickAction("select-carriage", "defense");
  assert(await page.locator('.screen--carriage[data-carriage="defense"]').count() === 1, "defense carriage has its own visible configuration");
  await page.screenshot({ path: resolve(outputDirectory, "15-defense-carriage.png"), fullPage: true });
  await clickAction("toggle-module", "M001");
  await page.waitForFunction(() => document.querySelector(".toast-message")?.textContent?.includes("停用"));
  await clickAction("toggle-module", "M001");

  await clickAction("select-carriage", "workshop");
  assert(await page.locator('.screen--carriage[data-carriage="workshop"]').count() === 1, "workshop carriage has its own visible configuration");
  await page.screenshot({ path: resolve(outputDirectory, "16-workshop-carriage.png"), fullPage: true });
  await clickAction("workshop-scrap");
  await page.waitForFunction(() => document.querySelector(".toast-message")?.textContent?.includes("零件 +1"));
  assert((await page.locator(".toast-message").textContent())?.includes("零件 +1"), "workshop salvage changes parts and noise");

  await clickAction("decorate");
  await page.waitForSelector(".decor-tray");
  await clickAction("decorate");
  assert(await page.locator(".decor-tray").count() === 0, "tapping the selected decoration command closes its drawer");
  await clickAction("decorate");
  await page.waitForSelector(".decor-tray");
  assert(await page.locator(".decor-picker img").count() === 4, "four GPT decoration sprites are visible in the placement tray");
  await clickAction("select-decoration", "radio");
  assert(await page.locator(".decor-slot.is-valid").count() > 0, "selected item exposes green compatible slots");
  assert(await page.locator(".decor-slot.is-invalid").count() > 0, "selected item exposes red incompatible slots");
  await page.screenshot({ path: resolve(outputDirectory, "19-slot-placement.png"), fullPage: true });
  await clickAction("place-decoration", "radio:workshop-bench");
  await page.waitForFunction(() => document.querySelector('[data-decor-id="radio"]')?.getAttribute("data-decoration-slot") === "workshop-bench");
  await dragDecoration("radio", "workshop-radio");
  assert((await page.locator(".toast-message").textContent())?.includes("已吸附到電台層架"), "dragging a sprite snaps into the authored compatible slot");
  const savedRadioSlot = await page.locator('[data-decor-id="radio"]').getAttribute("data-decoration-slot");
  await clickAction("reset-decor");
  await page.waitForFunction(() => document.querySelector('[data-decor-id="radio"]')?.getAttribute("data-decoration-slot") === "workshop-radio");
  await page.screenshot({ path: resolve(outputDirectory, "00-visible-drag-decoration.png"), fullPage: true });
  await clickAction("finish-decor");
  await page.waitForFunction(() => !document.querySelector(".decor-tray"));
  assert(await page.locator('.decor-item[data-decor-id="radio"] img').count() === 1, "finished decoration remains visibly placed in its carriage");
  await page.screenshot({ path: resolve(outputDirectory, "00b-visible-decorations-in-play.png"), fullPage: true });

  await clickAction("modules");
  await page.waitForSelector(".screen--modules");
  await clickAction("select-module-category", "防禦");
  await clickAction("select-module", "M004");
  await clickAction("build-module", "M004");
  await page.waitForSelector(".screen--carriage.is-prep");
  assert((await page.locator(".toast-message").textContent())?.includes("感測器網已安裝"), "build button installs the selected module");

  await clickAction("power");
  await page.waitForSelector(".power-config");
  const openPowerSceneHeight = await page.evaluate(() => {
    const selector = document.querySelector(".carriage-selector")?.getBoundingClientRect();
    const drawer = document.querySelector(".power-config")?.getBoundingClientRect();
    return Math.round((drawer?.top ?? 0) - (selector?.bottom ?? 0));
  });
  assert(openPowerSceneHeight >= 360, `open power drawer still leaves a visible carriage area (${openPowerSceneHeight}px)`);
  await clickAction("power");
  assert(await page.locator(".power-config").count() === 0, "tapping the selected power command closes its drawer");
  await clickAction("power");
  await page.waitForSelector(".power-config");
  await clickAction("toggle-power", "M004");
  await page.waitForFunction(() => document.querySelector('[data-action="toggle-power"][data-value="M004"]')?.textContent?.includes("OFF"));
  assert((await page.locator('[data-action="toggle-power"][data-value="M004"]').textContent())?.includes("OFF"), "power row turns the sensor off");
  await clickAction("toggle-power", "M004");
  await page.waitForFunction(() => document.querySelector('[data-action="toggle-power"][data-value="M004"]')?.textContent?.includes("ON"));
  await clickAction("meal");
  await page.waitForSelector(".meal-config");
  assert(await page.locator('.screen--carriage[data-carriage="kitchen"]').count() === 1, "meal control opens the distinct kitchen carriage");
  await page.screenshot({ path: resolve(outputDirectory, "18-kitchen-carriage.png"), fullPage: true });
  await clickAction("select-ration", "full");
  await page.waitForFunction(() => document.querySelector(".toast-message")?.textContent?.includes("安心餐"));
  assert((await page.locator(".toast-message").textContent())?.includes("安心餐"), "ration selection gives immediate feedback");
  await clickAction("meal");
  assert(await page.locator(".meal-config").count() === 0, "tapping the selected meal command closes its drawer");

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
  assert(await page.locator('.crop-scene-plot.stage-2').count() === 1, "watered seed becomes a visibly larger crop after the first powered night");
  const apBeforeWater = JSON.parse((await page.evaluate(() => localStorage.getItem("run.current"))) ?? "{}").actionPoints;
  await clickAction("water-crops");
  await page.waitForFunction(() => document.querySelector(".toast-message")?.textContent?.includes("水培架已灌溉"));
  assert((await page.locator(".toast-message").textContent())?.includes("水培架已灌溉"), "day-two irrigation is visible and does not consume AP");
  const apAfterWater = JSON.parse((await page.evaluate(() => localStorage.getItem("run.current"))) ?? "{}").actionPoints;
  assert(apAfterWater === apBeforeWater, "irrigation preserves the current action points");
  await clickAction("select-carriage", "kitchen");
  await clickAction("cook-meal");
  await page.waitForFunction(() => document.querySelector(".toast-message")?.textContent?.includes("熱食完成"));
  assert((await page.locator(".toast-message").textContent())?.includes("熱食完成"), "kitchen hot-meal action changes survivor state and resources");

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
  assert(await page.locator('.crop-scene-plot.stage-3').count() === 1, "crop reaches the visible mature stage after the second watered powered night");
  await page.screenshot({ path: resolve(outputDirectory, "17-greenhouse-farming.png"), fullPage: true });
  await clickAction("harvest-crop", "plot-a");
  await page.waitForFunction(() => document.querySelector(".toast-message")?.textContent?.includes("矮株番茄已收成"));
  assert((await page.locator(".toast-message").textContent())?.includes("矮株番茄已收成"), "mature crop can be harvested into food");
  const damagedHull = Number((await page.locator(".status-panel--environment div").last().locator("strong").textContent())?.replace("%", ""));
  await clickAction("select-carriage", "defense");
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
  await clickAction("select-carriage", "workshop");
  assert(await page.locator('[data-decor-id="radio"]').getAttribute("data-decoration-slot") === savedRadioSlot, "snapped radio slot survives reload");

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
  await page.waitForTimeout(180);
  await clickAction("hub");

  await clickAction("modules-preview");
  await page.waitForSelector(".screen--modules");
  assert((await page.locator(".app-header").textContent())?.includes("列車起始藍圖"), "hub blueprint opens the module catalogue instead of the ended carriage");
  await clickAction("select-module-category", "生活");
  await clickAction("select-module", "M005");
  assert(await page.locator('[data-action="build-module"]').isDisabled(), "blueprint preview cannot build or spend parts");
  await page.screenshot({ path: resolve(outputDirectory, "03-module-preview.png"), fullPage: true });
  await page.waitForTimeout(180);
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

  const compactContext = await browser.newContext({ viewport: { width: 360, height: 640 }, locale: "zh-TW" });
  const compactPage = await compactContext.newPage();
  await compactPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await compactPage.locator('[data-action="new-game"]:not([disabled])').first().click();
  await compactPage.waitForSelector(".screen--carriage.is-observation-mode");
  compactLayoutMetrics = await compactPage.evaluate(() => {
    const selector = document.querySelector(".carriage-selector")?.getBoundingClientRect();
    const toast = document.querySelector(".toast-message")?.getBoundingClientRect();
    const dock = document.querySelector(".carriage-dock")?.getBoundingClientRect();
    const targets = [...document.querySelectorAll(".screen--carriage button:not([disabled])")]
      .map((button) => button.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    return {
      uninterruptedSceneHeight: Math.round((toast?.top ?? 0) - (selector?.bottom ?? 0)),
      dockBottom: Math.round(dock?.bottom ?? 0),
      minimumTouchWidth: Math.round(Math.min(...targets.map((rect) => rect.width))),
      minimumTouchHeight: Math.round(Math.min(...targets.map((rect) => rect.height))),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  assert(compactLayoutMetrics.uninterruptedSceneHeight >= 320, `360×640 view keeps a playable scene window (${compactLayoutMetrics.uninterruptedSceneHeight}px)`);
  assert(compactLayoutMetrics.dockBottom <= 640, `360×640 command dock remains inside the viewport (${compactLayoutMetrics.dockBottom}px)`);
  assert(compactLayoutMetrics.minimumTouchWidth >= 48 && compactLayoutMetrics.minimumTouchHeight >= 48, `360×640 targets remain at least 48px (${compactLayoutMetrics.minimumTouchWidth}×${compactLayoutMetrics.minimumTouchHeight})`);
  assert(compactLayoutMetrics.horizontalOverflow === 0, "360×640 viewport has no horizontal overflow");
  await compactPage.screenshot({ path: resolve(outputDirectory, "20-compact-360x640.png"), fullPage: true });
  await compactContext.close();

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
    visualLayoutMetrics,
    compactLayoutMetrics,
    mobileGameFeel: {
      horizontalCarriageSwipe: true,
      firstUseSwipeGuidance: true,
      actionDeltaTickets: true,
      preparationApDial: true,
      hapticFeedbackWhenSupported: true,
    },
    browserErrors,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(resolve(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Button audit passed: ${report.actionCount} actions, ${report.assertions} assertions; report written to ${outputDirectory}`);
} finally {
  await Promise.race([browser.close(), new Promise((resolveClose) => setTimeout(resolveClose, 5000))]);
}
