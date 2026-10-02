import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.GAME_URL ?? "http://127.0.0.1:4177";
const evidenceRoot = resolve(process.env.EVIDENCE_DIR ?? "docs/evidence/v2");
const screenshotRoot = resolve(evidenceRoot, "screenshots");
const reportPath = resolve(evidenceRoot, "ui-qa.json");
await mkdir(screenshotRoot, { recursive: true });

const report = {
  status: "running",
  generatedAt: new Date().toISOString(),
  baseUrl,
  metadata: {
    scenario: "natural-fresh-r01",
    fixtureInjection: false,
    storageSetup: "new isolated browser context; settings changed only through visible UI",
    authority: "runtime UI and ntwp.v2.current readback",
    backgroundVisibility: "document visibilitychange event simulation; no save or game-state injection",
  },
  matrix: [],
  naturalFlow: { actions: [], assertions: [], evidence: {} },
  failures: [],
};

function assert(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
  report.naturalFlow.assertions.push(message);
}

function recordAction(label, details = {}) {
  report.naturalFlow.actions.push({ label, ...details });
}

async function clickAction(page, action, value) {
  const suffix = value === undefined ? "" : `[data-value="${value}"]`;
  const locator = page.locator(`[data-action="${action}"]${suffix}`).filter({ visible: true }).first();
  await locator.waitFor({ state: "visible", timeout: 10_000 });
  await locator.click();
  // The controller persists before re-rendering; wait past that async boundary.
  await page.waitForTimeout(100);
}

async function readEnvelope(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("ntwp.v2.current");
    return raw ? JSON.parse(raw) : null;
  });
}

async function waitForSave(page, predicate, description, argument) {
  await page.waitForFunction(
    ({ predicateSource, argument }) => {
      const raw = localStorage.getItem("ntwp.v2.current");
      if (!raw) return false;
      const envelope = JSON.parse(raw);
      return Function("envelope", "argument", `return (${predicateSource})(envelope, argument)`)(envelope, argument);
    },
    { predicateSource: predicate.toString(), argument },
    { timeout: 10_000 },
  );
  recordAction(description);
}

async function setTextScaleThroughUi(page, scale) {
  await clickAction(page, "settings");
  const clicks = scale === 120 ? 1 : scale === 140 ? 2 : 0;
  for (let index = 0; index < clicks; index += 1) {
    await clickAction(page, "cycle-text");
  }
  const label = await page.locator('[data-action="cycle-text"] b').textContent();
  assert(label?.trim() === `${scale}%`, `text scale ${scale}% is selected through settings`, { label });
  await clickAction(page, "menu");
}

async function measureLayout(page, viewport, textScale) {
  return page.evaluate(({ viewport, textScale }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const selector = document.querySelector(".carriage-selector")?.getBoundingClientRect();
    const toast = document.querySelector(".toast-message")?.getBoundingClientRect();
    const dock = document.querySelector(".carriage-dock")?.getBoundingClientRect();
    const sceneHeight = Math.max(0, (toast?.top ?? 0) - (selector?.bottom ?? 0));
    const newButtons = [...document.querySelectorAll(
      ".quest-ribbon, .scene-hotspots button, .crop-scene-plot, .crop-quick-picker button, .carriage-dock button",
    )].filter(visible);
    const hitResults = newButtons.map((button) => {
      const rect = button.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const top = document.elementFromPoint(x, y);
      return {
        action: button.getAttribute("data-action"),
        value: button.getAttribute("data-value"),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        centerClear: top === button || Boolean(top && button.contains(top)),
        top: top ? `${top.tagName.toLowerCase()}.${[...top.classList].join(".")}` : "none",
      };
    });
    return {
      viewport,
      textScale,
      sceneHeight: Math.round(sceneHeight),
      sceneRatio: Math.round((sceneHeight / viewport.height) * 1000) / 1000,
      selectorBottom: Math.round(selector?.bottom ?? 0),
      toastTop: Math.round(toast?.top ?? 0),
      dockBottom: Math.round(dock?.bottom ?? 0),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      minimumWidth: Math.min(...hitResults.map((item) => item.width)),
      minimumHeight: Math.min(...hitResults.map((item) => item.height)),
      blockedCenters: hitResults.filter((item) => !item.centerClear),
      undersized: hitResults.filter((item) => item.width < 44 || item.height < 44),
      primaryUndersized: hitResults.filter(
        (item) => ["preview-action", "route", "missions"].includes(item.action ?? "") &&
          (item.width < 48 || item.height < 48),
      ),
    };
  }, { viewport, textScale });
}

async function runLayoutMatrix(browser) {
  const viewports = [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1280, height: 640 },
    { width: 1366, height: 600 },
  ];
  const scales = [100, 120, 140];
  for (const viewport of viewports) {
    for (const textScale of scales) {
      const context = await browser.newContext({ viewport, locale: "zh-TW" });
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector(".screen--menu");
      await setTextScaleThroughUi(page, textScale);
      await clickAction(page, "new-game", "R01");
      await page.waitForFunction(() => Boolean(document.querySelector(".screen--carriage.is-prep")));
      // Measure the settled layout after the one-time entrance transform.
      await page.waitForTimeout(650);
      const metrics = await measureLayout(page, viewport, textScale);
      assert(metrics.sceneRatio >= 0.6, `${viewport.width}×${viewport.height} at ${textScale}% keeps at least 60% scene`, metrics);
      assert(metrics.horizontalOverflow <= 0, `${viewport.width}×${viewport.height} at ${textScale}% has no horizontal overflow`, metrics);
      assert(metrics.dockBottom <= viewport.height, `${viewport.width}×${viewport.height} at ${textScale}% keeps the command dock visible`, metrics);
      assert(metrics.undersized.length === 0, `${viewport.width}×${viewport.height} at ${textScale}% keeps new controls at least 44px`, metrics.undersized);
      assert(metrics.primaryUndersized.length === 0, `${viewport.width}×${viewport.height} at ${textScale}% keeps primary controls at least 48px`, metrics.primaryUndersized);
      assert(metrics.blockedCenters.length === 0, `${viewport.width}×${viewport.height} at ${textScale}% keeps button centers unobstructed`, metrics.blockedCenters);

      await clickAction(page, "preview-action", "plant-crop|plot-a:lettuce");
      const modal = await page.locator(".object-preview").boundingBox();
      const cancel = await page.locator('[data-action="cancel-object-action"]').boundingBox();
      const confirm = await page.locator('[data-action="confirm-object-action"]').boundingBox();
      assert(Boolean(modal && cancel && confirm), `${viewport.width}×${viewport.height} at ${textScale}% shows preview and fixed actions`);
      assert(
        cancel.y + cancel.height <= viewport.height && confirm.y + confirm.height <= viewport.height,
        `${viewport.width}×${viewport.height} at ${textScale}% keeps cancel and confirm visible without scrolling`,
        { modal, cancel, confirm },
      );
      await clickAction(page, "cancel-object-action");
      report.matrix.push(metrics);
      if (textScale === 140 || (viewport.width === 360 && textScale === 100)) {
        const name = `${viewport.width}x${viewport.height}-text${textScale}.png`;
        await page.screenshot({ path: resolve(screenshotRoot, name) });
      }
      await context.close();
    }
  }
}

async function resolveVisibleEvent(page, preferredValues = []) {
  await page.waitForSelector(".screen--event");
  await page.waitForTimeout(650);
  for (const value of preferredValues) {
    const choice = page.locator(`[data-action="event-choice"][data-value="${value}"]:not([disabled])`);
    if (await choice.count()) {
      await choice.first().click();
      return value;
    }
  }
  const choice = page.locator('[data-action="event-choice"]:not([disabled])').first();
  const value = await choice.getAttribute("data-value");
  await choice.click();
  return value;
}

function contactSeconds(text) {
  const match = text?.match(/(\d+)\s*秒|倒數(?:暫停)?・?(\d+)/);
  return Number(match?.[1] ?? match?.[2] ?? Number.NaN);
}

async function hideAndVerifyPause(context, page) {
  const alert = page.getByRole("alert");
  const beforeText = await alert.textContent();
  const before = contactSeconds(beforeText);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(2300);
  const whileHiddenText = await alert.textContent();
  const whileHidden = contactSeconds(whileHiddenText);
  const hiddenState = await page.evaluate(() => document.visibilityState);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(120);
  const afterText = await alert.textContent();
  const after = contactSeconds(afterText);
  const envelope = await readEnvelope(page);
  assert(hiddenState === "hidden", "background tab reports hidden visibility state", { hiddenState });
  assert(Number.isFinite(before) && whileHidden === before && after === before, "background visibility freezes the night countdown", { beforeText, whileHiddenText, afterText });
  assert(afterText?.includes("倒數暫停"), "returning from background stays paused until the player resumes", { afterText });
  assert(envelope?.run?.lastMessage?.includes("請手動繼續"), "background pause persists a clear resume message", { lastMessage: envelope?.run?.lastMessage });
  report.naturalFlow.evidence.backgroundPause = { beforeText, whileHiddenText, afterText, persistedMessage: envelope?.run?.lastMessage };
}

async function resolveNight(page, maxActions = 6) {
  for (let index = 0; index < maxActions; index += 1) {
    if (await page.locator(".screen--result").count()) return;
    await page.waitForSelector(".screen--carriage.is-night");
    const counter = page.locator('[data-action="counter"]:not([disabled])').first();
    if (await counter.count()) {
      const label = (await counter.textContent())?.trim();
      await counter.click();
      recordAction("night counter", { label });
      await page.waitForTimeout(80);
      continue;
    }
    const interaction = page.locator('[data-action="threat-interact"]:not([disabled])').first();
    if (await interaction.count()) {
      const value = await interaction.getAttribute("data-value");
      await interaction.click();
      recordAction("night interaction", { value });
      await page.waitForTimeout(80);
      continue;
    }
    throw new Error("Night contact has no enabled counter or interaction.");
  }
  await page.waitForSelector(".screen--result", { timeout: 10_000 });
}

async function runNaturalFlow(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-TW" });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".screen--menu");
  assert((await readEnvelope(page)) === null, "fresh browser context starts without a save fixture");
  await clickAction(page, "new-game", "R01");
  await page.waitForSelector(".screen--carriage.is-prep");
  let envelope = await readEnvelope(page);
  assert(envelope?.run?.day === 1 && envelope.run.routeId === "R01", "fresh UI starts a real Day 1 R01 run", { run: envelope?.run });
  recordAction("fresh R01 started", { runId: envelope.run.runId });

  // Mission paging and two-pin cap through visible controls.
  await clickAction(page, "missions");
  await page.waitForSelector(".screen--missions");
  await clickAction(page, "set-quest-filter", "tutorial");
  const pinButtons = page.locator('[data-action="toggle-quest-tracking"]:not([disabled])');
  await pinButtons.nth(0).click();
  await page.waitForTimeout(100);
  await page.locator('[data-action="toggle-quest-tracking"]:not([disabled])').nth(1).click();
  await page.waitForTimeout(100);
  await waitForSave(page, (saved) => saved.run.quests.trackedMissionIds.length === 2, "two missions pinned");
  await page.waitForFunction(() => document.querySelectorAll('[data-action="toggle-quest-tracking"]:disabled').length > 0);
  const cappedButtons = page.locator('[data-action="toggle-quest-tracking"]:disabled');
  const cappedLabels = await cappedButtons.allTextContents();
  assert(cappedLabels.some((label) => label.includes("已釘滿 2 項")), "third mission clearly shows the two-pin cap", { cappedLabels, tracked: (await readEnvelope(page)).run.quests.trackedMissionIds });
  await clickAction(page, "set-quest-filter", "all");
  await clickAction(page, "quest-page", "next");
  assert((await page.locator(".journal-pagination span").textContent())?.includes("第 2／"), "mission journal advances to the next four-item page");
  await clickAction(page, "quest-page", "previous");
  await page.locator('[data-action="carriage"]:not([disabled])').first().click();
  await page.waitForSelector(".screen--carriage.is-prep");

  // Two free observations must not spend AP.
  await clickAction(page, "select-carriage", "sleep");
  const sleepHotspots = await page.locator(".scene-hotspots button").evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const style = getComputedStyle(button);
      return {
        action: button.getAttribute("data-action"),
        value: button.getAttribute("data-value"),
        x: style.getPropertyValue("--x").trim(),
        y: style.getPropertyValue("--y").trim(),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        centerClear: top === button || Boolean(top && button.contains(top)),
      };
    }),
  );
  assert(sleepHotspots.every((hotspot) => hotspot.width >= 48 && hotspot.height >= 48 && hotspot.centerClear), "sleep observation, care and relationship hotspots remain directly tappable", sleepHotspots);
  assert(sleepHotspots.every((hotspot) => {
    const x = Number.parseFloat(hotspot.x);
    const y = Number.parseFloat(hotspot.y);
    return !(x >= 50 && x <= 70 && y >= 28 && y <= 48);
  }), "sleep hotspot labels stay outside the A-07 face anchor", sleepHotspots);
  report.naturalFlow.evidence.sleepHotspots = sleepHotspots;
  await page.screenshot({ path: resolve(screenshotRoot, "natural-sleep-hotspots.png") });
  const beforeInspect = await readEnvelope(page);
  await clickAction(page, "inspect-object", "passenger-breathing");
  await clickAction(page, "inspect-object", "window-silhouette");
  await waitForSave(page, (saved) => saved.run.voyage.inspectedIds.length >= 2, "two free observations persisted");
  envelope = await readEnvelope(page);
  assert(envelope.run.actionPoints === beforeInspect.run.actionPoints, "passenger and window inspection consume no AP", { before: beforeInspect.run.actionPoints, after: envelope.run.actionPoints });
  assert(envelope.run.quests.missions["TUT-01"].lifecycle === "completed", "two visible inspection points complete TUT-01", envelope.run.quests.missions["TUT-01"]);

  // Medicine is previewed and cancelled without a charge.
  const beforeMedicine = await readEnvelope(page);
  await clickAction(page, "preview-action", "use-medicine|");
  await page.waitForSelector(".object-preview");
  await clickAction(page, "cancel-object-action");
  const afterMedicine = await readEnvelope(page);
  assert(afterMedicine.run.actionPoints === beforeMedicine.run.actionPoints && afterMedicine.run.resources.medicine === beforeMedicine.run.resources.medicine, "cancelled medicine preview spends nothing");

  // Free power/ration configuration.
  await clickAction(page, "power");
  await clickAction(page, "toggle-power", "M003");
  await clickAction(page, "toggle-power", "M003");
  await clickAction(page, "meal");
  await clickAction(page, "select-ration", "full");
  envelope = await readEnvelope(page);
  assert(envelope.run.actionPoints === beforeInspect.run.actionPoints, "power and ration configuration do not spend AP", { ap: envelope.run.actionPoints });
  assert(envelope.run.quests.missions["TUT-02"].lifecycle === "completed", "visible power and ration controls complete TUT-02", envelope.run.quests.missions["TUT-02"]);

  // Cost preview cancel, then one confirmed crop action.
  await clickAction(page, "select-carriage", "greenhouse");
  const beforeCrop = await readEnvelope(page);
  await clickAction(page, "preview-action", "plant-crop|plot-a:lettuce");
  await clickAction(page, "cancel-object-action");
  let afterCrop = await readEnvelope(page);
  assert(afterCrop.run.actionPoints === beforeCrop.run.actionPoints && afterCrop.run.resources.water === beforeCrop.run.resources.water, "cancelled crop preview does not charge AP or water");
  await clickAction(page, "preview-action", "plant-crop|plot-a:lettuce");
  await clickAction(page, "confirm-object-action");
  await waitForSave(page, (saved) => saved.run.crops[0].stage === 1, "lettuce planted through confirm sheet");
  afterCrop = await readEnvelope(page);
  assert(afterCrop.run.actionPoints === beforeCrop.run.actionPoints - 1 && afterCrop.run.resources.water === beforeCrop.run.resources.water - 1, "confirmed crop preview charges exactly once", { before: beforeCrop.run, after: afterCrop.run });
  assert(afterCrop.run.quests.missions["TUT-03"].lifecycle === "completed", "confirmed planting completes TUT-03", afterCrop.run.quests.missions["TUT-03"]);

  // Workshop refill goes through its own cost preview.
  await clickAction(page, "select-carriage", "workshop");
  const beforeRefill = await readEnvelope(page);
  await clickAction(page, "open-refill", "workshop");
  await clickAction(page, "preview-action", "refill-supplies|refill-battery");
  await clickAction(page, "confirm-object-action");
  await waitForSave(page, (saved, expectedAp) => saved.run.actionPoints === expectedAp, "battery refill committed once", beforeRefill.run.actionPoints - 1);
  const afterRefill = await readEnvelope(page);
  assert(afterRefill.run.resources.parts === beforeRefill.run.resources.parts - 2 && afterRefill.run.resources.energy > beforeRefill.run.resources.energy, "refill visibly trades parts for energy", { before: beforeRefill.run.resources, after: afterRefill.run.resources });

  // Route cards preview tradeoffs without touching the save; RN01 then commits fuel 4.
  await clickAction(page, "route");
  await page.waitForSelector(".screen--route");
  const routePreviewBefore = JSON.stringify(await readEnvelope(page));
  await clickAction(page, "select-route", "RN03");
  assert((await page.locator(".route-summary").textContent())?.includes("燃料 −7"), "RN03 preview shows the authoritative 7 fuel cost");
  await clickAction(page, "select-route", "RN01");
  const routeSummary = await page.locator(".route-summary").textContent();
  assert(routeSummary?.includes("燃料 −4") && routeSummary.includes("優勢") && routeSummary.includes("代價"), "RN01 preview shows authoritative fuel, advantage and cost", { routeSummary });
  assert(JSON.stringify(await readEnvelope(page)) === routePreviewBefore, "switching route previews does not mutate the save");
  const fuelBefore = (await readEnvelope(page)).run.resources.fuel;
  await clickAction(page, "confirm-route", "RN01");
  await page.waitForSelector(".screen--event");
  await resolveVisibleEvent(page, ["partial", "wait", "record"]);
  await page.waitForSelector(".screen--carriage.is-night");
  envelope = await readEnvelope(page);
  assert(envelope.run.resources.fuel === fuelBefore - 4, "RN01 confirmation spends exactly the previewed 4 fuel", { before: fuelBefore, after: envelope.run.resources.fuel });
  assert(envelope.run.quests.missions["TUT-04"].lifecycle === "completed", "route confirmation completes TUT-04", envelope.run.quests.missions["TUT-04"]);

  await hideAndVerifyPause(context, page);
  await page.screenshot({ path: resolve(screenshotRoot, "natural-day1-night-paused.png") });
  await resolveNight(page);
  await page.waitForSelector(".screen--result");
  envelope = await readEnvelope(page);
  const day1History = envelope.run.quests.eventHistory;
  assert(day1History.some((event) => event.type === "night.resolved"), "Day 1 emits a deduplicated night.resolved quest event", { history: day1History });
  assert(envelope.run.quests.missions["TUT-05"].lifecycle === "completed", "counter plus dawn completes TUT-05", envelope.run.quests.missions["TUT-05"]);
  report.naturalFlow.evidence.day1QuestEvents = day1History;
  await page.screenshot({ path: resolve(screenshotRoot, "natural-day1-dawn.png") });

  // Enter Day 2, resolve its natural prep story, and verify one-night lettuce maturity.
  await clickAction(page, "next-day");
  if (await page.locator(".screen--event").count()) {
    await resolveVisibleEvent(page, ["keep", "partial"]);
  }
  await page.waitForSelector(".screen--carriage.is-prep");
  envelope = await readEnvelope(page);
  assert(envelope.run.day === 2, "natural flow reaches Day 2 preparation");
  assert(envelope.run.crops[0].stage === 3, "lettuce planted on Day 1 is mature after one powered night", envelope.run.crops[0]);

  // Claim one dawn reward, reload, and prove the receipt is not duplicated.
  await clickAction(page, "missions");
  await clickAction(page, "set-quest-filter", "completed");
  const starterClaim = page.locator('[data-action="claim-quest-rewards"][data-value="TUT-03"]:not([disabled])');
  const claim = (await starterClaim.count())
    ? starterClaim
    : page.locator('[data-action="claim-quest-rewards"]:not([disabled])').first();
  await claim.waitFor({ state: "visible" });
  const claimedMissionId = await claim.getAttribute("data-value");
  await claim.click();
  await waitForSave(page, (saved) => saved.profile.rewardReceipts.length > 0, "dawn mission reward saved to profile");
  const claimed = await readEnvelope(page);
  const receiptCount = claimed.profile.rewardReceipts.length;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".screen--menu");
  await clickAction(page, "continue");
  await page.waitForSelector(".screen--carriage.is-prep");
  const reloaded = await readEnvelope(page);
  assert(reloaded.profile.rewardReceipts.length === receiptCount, "reload preserves one reward receipt without duplication", { claimedMissionId, receipts: reloaded.profile.rewardReceipts });
  await clickAction(page, "missions");
  await clickAction(page, "set-quest-filter", "completed");
  const claimedCard = page.locator(`[data-mission-id="${claimedMissionId}"]`);
  assert(await claimedCard.getByText("獎勵已收進旅程檔案", { exact: true }).count() === 1 && await claimedCard.locator('[data-action="claim-quest-rewards"]').count() === 0, "claimed mission cannot be claimed again after reload");
  await claimedCard.locator('[data-action="carriage"]:not([disabled])').click();
  await page.waitForSelector(".screen--carriage.is-prep");

  // Day 2 relationship reply.
  await clickAction(page, "select-carriage", "sleep");
  await clickAction(page, "open-relationship", "A-07");
  const relationChoice = page.locator('[data-action="choose-relationship"]:not([disabled]), [data-action="preview-action"][data-value^="choose-relationship|"]:not([disabled])').first();
  const relationValue = await relationChoice.getAttribute("data-value");
  await relationChoice.click();
  if (await page.locator('.object-preview [data-action="confirm-object-action"]').count()) {
    await clickAction(page, "confirm-object-action");
  }
  await waitForSave(page, (saved) => Object.keys(saved.run.voyage.relationships).length > 0, "A-07 relationship reply committed");
  recordAction("A-07 relationship reply", { relationValue });

  // Day 2 facility branch through cost preview.
  await clickAction(page, "modules");
  await page.waitForSelector(".screen--modules");
  const facilityValue = "upgrade-facility|power-core:quiet-wiring";
  const facilityButton = page.locator(`[data-action="preview-action"][data-value="${facilityValue}"]`);
  await facilityButton.scrollIntoViewIfNeeded();
  await facilityButton.click();
  await clickAction(page, "confirm-object-action");
  await waitForSave(page, (saved) => saved.run.voyage.facilityChoices["core-output"] === "quiet", "quiet-wiring facility branch committed");
  await clickAction(page, "carriage");
  await page.waitForSelector(".screen--carriage.is-prep");

  // Day 2 three-node exploration ends by withdrawing with found loot; restart stays disabled.
  await clickAction(page, "route");
  await page.waitForSelector(".screen--route");
  await clickAction(page, "preview-action", "start-expedition|");
  await clickAction(page, "confirm-object-action");
  await page.waitForSelector(".expedition-card.is-active");
  await clickAction(page, "choose-expedition-step", "survey");
  await clickAction(page, "choose-expedition-step", "improvise");
  const beforeWithdraw = await readEnvelope(page);
  await clickAction(page, "withdraw-expedition");
  await waitForSave(page, (saved) => saved.run.voyage.expeditions.some((item) => item.status === "withdrawn"), "three-node expedition withdrawn");
  const afterWithdraw = await readEnvelope(page);
  const record = afterWithdraw.run.voyage.expeditions.at(-1);
  assert(record?.status === "withdrawn" && Object.keys(record.collected).length > 0, "withdraw preserves found expedition loot and fixed record", { before: beforeWithdraw.run.voyage.activeExpedition, record });
  assert(await page.locator('[data-action="preview-action"][data-value="start-expedition|"]:disabled').count() === 1, "withdrawn expedition cannot be rerolled or restarted that day");

  // Finish Day 2 naturally.
  await clickAction(page, "select-route", "RN01");
  await clickAction(page, "confirm-route", "RN01");
  if (await page.locator(".screen--event").count()) {
    await resolveVisibleEvent(page, ["keep", "partial", "wait"]);
  }
  await page.waitForSelector(".screen--carriage.is-night");
  const pause = page.locator('[data-action="pause"]:not([disabled])');
  if (await pause.count()) await pause.click();
  await resolveNight(page);
  await page.waitForSelector(".screen--result");
  envelope = await readEnvelope(page);
  assert(envelope.run.day === 2 && envelope.run.phase === "aftermath", "natural flow completes the second night", { day: envelope.run.day, phase: envelope.run.phase });
  await page.screenshot({ path: resolve(screenshotRoot, "natural-day2-dawn.png") });

  const tutorials = ["TUT-01", "TUT-02", "TUT-03", "TUT-04", "TUT-05"].map((id) => ({ id, ...envelope.run.quests.missions[id] }));
  assert(tutorials.every((mission) => ["completed", "claimed"].includes(mission.lifecycle)), "all five tutorial missions complete through the natural first-night flow", tutorials);
  report.naturalFlow.evidence.final = {
    runId: envelope.run.runId,
    day: envelope.run.day,
    phase: envelope.run.phase,
    resources: envelope.run.resources,
    tutorials,
    relationshipCount: Object.keys(envelope.run.voyage.relationships).length,
    facilityChoices: envelope.run.voyage.facilityChoices,
    expeditions: envelope.run.voyage.expeditions,
    profileReceiptCount: envelope.profile.rewardReceipts.length,
  };

  // Use the naturally claimed tutorial blueprint, prove selection leaves the
  // active run untouched, survives reload, and applies once to the next run.
  await clickAction(page, "next-day");
  if (await page.locator(".screen--event").count()) {
    await resolveVisibleEvent(page, ["partial", "keep", "wait"]);
  }
  await page.waitForSelector(".screen--carriage.is-prep");
  const activeBeforeLoadout = await readEnvelope(page);
  await clickAction(page, "missions");
  await clickAction(page, "set-mission-view", "profile");
  await page.waitForSelector(".screen--missions.is-profile");
  const starterSelection = page.locator('[data-action="select-profile-loadout"][data-value="blueprint|BP-STARTER-SEED-TRAY"]');
  await starterSelection.scrollIntoViewIfNeeded();
  await starterSelection.click();
  await waitForSave(page, (saved) => saved.profile.selectedBlueprintId === "BP-STARTER-SEED-TRAY", "claimed starter blueprint selected for next run");
  let selectedEnvelope = await readEnvelope(page);
  assert(JSON.stringify(selectedEnvelope.run.resources) === JSON.stringify(activeBeforeLoadout.run.resources), "selecting a loadout does not change current-run resources", { before: activeBeforeLoadout.run.resources, after: selectedEnvelope.run.resources });
  await page.reload({ waitUntil: "domcontentloaded" });
  await clickAction(page, "continue");
  await page.waitForSelector(".screen--carriage.is-prep");
  await clickAction(page, "missions");
  await clickAction(page, "set-mission-view", "profile");
  const selectedStarter = page.locator('[data-action="select-profile-loadout"][data-value="blueprint|BP-STARTER-SEED-TRAY"]:disabled');
  await selectedStarter.scrollIntoViewIfNeeded();
  assert((await selectedStarter.textContent())?.includes("已選用"), "selected blueprint remains selected after reload");
  const profileLayout100 = await page.evaluate(() => {
    const button = document.querySelector('[data-action="select-profile-loadout"][data-value="blueprint|BP-STARTER-SEED-TRAY"]');
    const rect = button?.getBoundingClientRect();
    const top = rect ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
    return {
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      buttonWidth: Math.round(rect?.width ?? 0),
      buttonHeight: Math.round(rect?.height ?? 0),
      centerClear: Boolean(button && top && (top === button || button.contains(top))),
    };
  });
  assert(profileLayout100.horizontalOverflow <= 0 && profileLayout100.buttonWidth >= 48 && profileLayout100.buttonHeight >= 48 && profileLayout100.centerClear, "profile loadout control is reachable at 390×844 and 100% text", profileLayout100);
  await page.screenshot({ path: resolve(screenshotRoot, "profile-loadout-390x844-text100.png") });

  await clickAction(page, "hub");
  await clickAction(page, "menu");
  await clickAction(page, "settings");
  await clickAction(page, "cycle-text");
  await clickAction(page, "cycle-text");
  await clickAction(page, "menu");
  await clickAction(page, "hub");
  await clickAction(page, "profile");
  await page.waitForSelector(".screen--missions.is-profile");
  const selectedStarter140 = page.locator('[data-action="select-profile-loadout"][data-value="blueprint|BP-STARTER-SEED-TRAY"]:disabled');
  await selectedStarter140.scrollIntoViewIfNeeded();
  const profileLayout140 = await page.evaluate(() => {
    const button = document.querySelector('[data-action="select-profile-loadout"][data-value="blueprint|BP-STARTER-SEED-TRAY"]');
    const rect = button?.getBoundingClientRect();
    const top = rect ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
    return {
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      buttonWidth: Math.round(rect?.width ?? 0),
      buttonHeight: Math.round(rect?.height ?? 0),
      centerClear: Boolean(button && top && (top === button || button.contains(top))),
    };
  });
  assert(profileLayout140.horizontalOverflow <= 0 && profileLayout140.buttonWidth >= 48 && profileLayout140.buttonHeight >= 48 && profileLayout140.centerClear, "profile loadout control is reachable at 390×844 and 140% text", profileLayout140);
  await page.screenshot({ path: resolve(screenshotRoot, "profile-loadout-390x844-text140.png") });
  await clickAction(page, "hub");
  await clickAction(page, "menu");
  const priorRunId = selectedEnvelope.run.runId;
  await clickAction(page, "new-game", "R01");
  await page.waitForSelector(".screen--carriage.is-prep");
  const loadedRun = await readEnvelope(page);
  assert(loadedRun.run.runId !== priorRunId, "loadout starts a distinct new run");
  assert(loadedRun.run.resources.food === 6 && loadedRun.run.resources.parts === 7, "starter blueprint applies its food-for-parts tradeoff once", loadedRun.run.resources);
  assert(loadedRun.run.flags.includes("starting-blueprint:BP-STARTER-SEED-TRAY"), "new run records the applied starting blueprint");

  await clickAction(page, "missions");
  await clickAction(page, "set-mission-view", "profile");
  const currentBeforeStandard = await readEnvelope(page);
  await clickAction(page, "select-profile-loadout", "blueprint|standard");
  await waitForSave(page, (saved) => !saved.profile.selectedBlueprintId, "profile returned to standard blueprint");
  selectedEnvelope = await readEnvelope(page);
  assert(JSON.stringify(selectedEnvelope.run.resources) === JSON.stringify(currentBeforeStandard.run.resources), "clearing the next-run blueprint does not retroactively change the active run");
  await clickAction(page, "hub");
  await clickAction(page, "menu");
  await clickAction(page, "new-game", "R01");
  await page.waitForSelector(".screen--carriage.is-prep");
  const standardRun = await readEnvelope(page);
  assert(standardRun.run.resources.food === 5 && standardRun.run.resources.parts === 8, "standard selection restores the route's normal new-run budget", standardRun.run.resources);
  assert(!standardRun.run.flags.some((flag) => flag.startsWith("starting-blueprint:")), "standard new run has no hidden blueprint stack");
  report.naturalFlow.evidence.profileLoadout = {
    selectedBlueprint: "初階種植盤",
    selectedRunResources: loadedRun.run.resources,
    standardRunResources: standardRun.run.resources,
    currentRunUnchanged: true,
    reloadPreservedSelection: true,
    layout100: profileLayout100,
    layout140: profileLayout140,
  };
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  if (process.env.QA_SKIP_MATRIX !== "1") await runLayoutMatrix(browser);
  await runNaturalFlow(browser);
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failures.push({
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    details: error?.details,
  });
  throw error;
} finally {
  report.generatedAt = new Date().toISOString();
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await browser.close();
}

console.log(`V2 UI QA passed: ${report.matrix.length} layout combinations and a fresh two-night R01 flow.`);
