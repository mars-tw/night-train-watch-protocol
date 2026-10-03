import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.GAME_URL ?? "http://127.0.0.1:4177";
const evidenceRoot = resolve("docs/evidence/v22");
const screenshotRoot = resolve(evidenceRoot, "onboarding-screenshots");
const reportPath = resolve(evidenceRoot, "onboarding-qa.json");
await mkdir(screenshotRoot, { recursive: true });

const report = {
  status: "running",
  generatedAt: new Date().toISOString(),
  baseUrl,
  metadata: {
    scenario: "fresh-r01-five-tutorial-onboarding",
    viewport: { width: 390, height: 844 },
    fixtureInjection: false,
    authority: "visible UI actions and read-only ntwp.v2.current evidence",
    synchronization: "visible screen/cue transitions and persisted quest events; no fixed transaction sleeps",
  },
  actions: [],
  assertions: [],
  evidence: {},
  screenshots: [],
  failures: [],
};

function assert(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
  report.assertions.push(message);
}

async function screenshot(page, name) {
  const path = resolve(screenshotRoot, `${name}.png`);
  await page.screenshot({ path });
  report.screenshots.push(`onboarding-screenshots/${name}.png`);
}

async function envelope(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("ntwp.v2.current");
    return raw ? JSON.parse(raw) : null;
  });
}

async function waitForEnvelope(page, predicate, argument, description) {
  await page.waitForFunction(
    ({ predicateSource, argument }) => {
      const raw = localStorage.getItem("ntwp.v2.current");
      if (!raw) return false;
      const saved = JSON.parse(raw);
      return Function("saved", "argument", `return (${predicateSource})(saved, argument)`)(saved, argument);
    },
    { predicateSource: predicate.toString(), argument },
    { timeout: 15_000 },
  );
  report.actions.push(description);
}

async function click(page, action, value) {
  const suffix = value === undefined ? "" : `[data-value="${value}"]`;
  const target = page.locator(`[data-action="${action}"]${suffix}`).filter({ visible: true }).first();
  await target.waitFor({ state: "visible", timeout: 15_000 });
  await target.click();
}

async function waitCue(page, title) {
  await page.locator(".onboarding-cue", { hasText: title }).waitFor({ state: "visible", timeout: 15_000 });
}

async function claimCue(page, missionId) {
  await page.locator(`.onboarding-cue [data-action="claim-quest-rewards"][data-value="${missionId}"]`).click();
  await waitForEnvelope(
    page,
    (saved, id) => saved.profile.milestones.includes(`mission:${id}:completed`),
    missionId,
    `${missionId} reward saved through the coach`,
  );
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: report.metadata.viewport, locale: "zh-TW" });
const page = await context.newPage();

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator(".screen--menu").waitFor();
  await click(page, "settings");
  await click(page, "toggle-countdown");
  await click(page, "menu");
  await click(page, "new-game", "R01");
  await waitCue(page, "先去看看 A-07");
  await screenshot(page, "01-fresh-coach");

  // The journal remains reachable, and an explicit player pin owns the ribbon.
  await click(page, "missions");
  await page.locator('.mission-card[data-mission-id="MAIN-R01-N01"] [data-action="toggle-quest-tracking"]').click();
  await waitForEnvelope(page, (saved) => saved.run.quests.trackedMissionIds.includes("MAIN-R01-N01"), null, "main mission pinned through the journal");
  await page.locator('.mission-card[data-mission-id="MAIN-R01-N01"] [data-action="carriage"]').click();
  await page.locator(".quest-ribbon").waitFor();
  assert(await page.locator(".onboarding-cue").count() === 0, "player pin makes the coach yield");
  await screenshot(page, "02-player-pin-owns-ribbon");
  await page.locator(".quest-ribbon").click();
  await page.locator('.mission-card[data-mission-id="MAIN-R01-N01"] [data-action="toggle-quest-tracking"]').click();
  await waitForEnvelope(page, (saved) => saved.run.quests.trackedMissionIds.length === 0, null, "main mission unpinned through the journal");
  await page.locator('.mission-card[data-mission-id="MAIN-R01-N01"] [data-action="carriage"]').click();
  await waitCue(page, "先去看看 A-07");
  assert(await page.locator('.onboarding-cue [data-action="missions"]').isVisible(), "coach returns with a 48px mission entry after unpinning");

  // TUT-01: both inspections are free and progress only through their real actions.
  const beforeFree = await envelope(page);
  await click(page, "select-carriage", "sleep");
  await waitCue(page, "確認她的呼吸");
  await click(page, "inspect-object", "passenger-breathing");
  await waitCue(page, "再看一眼冷窗");
  await click(page, "inspect-object", "window-silhouette");
  await page.locator('.onboarding-cue [data-action="claim-quest-rewards"][data-value="TUT-01"]').waitFor();
  const afterFree = await envelope(page);
  for (const key of ["actionPoints"]) assert(afterFree.run[key] === beforeFree.run[key], `free inspections keep ${key} unchanged`, { before: beforeFree.run[key], after: afterFree.run[key] });
  for (const key of ["energy", "fuel", "food", "water", "parts", "medicine"])
    assert(afterFree.run.resources[key] === beforeFree.run.resources[key], `free inspections keep ${key} unchanged`, { before: beforeFree.run.resources[key], after: afterFree.run.resources[key] });
  await claimCue(page, "TUT-01");

  // TUT-02: M003 is restored before rationing; M001 never turns off.
  await waitCue(page, "打開今晚的配電");
  await click(page, "power");
  await waitCue(page, "試切一項非防護設備");
  await click(page, "toggle-power", "M003");
  await waitForEnvelope(page, (saved) => saved.run.modules.find((item) => item.definitionId === "M003")?.active === false, null, "M003 disabled through the visible power control");
  await waitCue(page, "先恢復剛才的供電");
  let saved = await envelope(page);
  assert(saved.run.modules.find((item) => item.definitionId === "M001")?.active === true, "M001 remains active during the power lesson");
  await click(page, "toggle-power", "M003");
  await waitForEnvelope(page, (value) => value.run.modules.find((item) => item.definitionId === "M003")?.active === true, null, "M003 restored before leaving the power lesson");
  await waitCue(page, "查看今晚的配餐");
  await click(page, "meal");
  await waitCue(page, "確認你的配餐方式");
  await click(page, "select-ration", "standard");
  await page.locator('.onboarding-cue [data-action="claim-quest-rewards"][data-value="TUT-02"]').waitFor();
  await claimCue(page, "TUT-02");

  // TUT-03: cancellation is free; one confirmation charges exactly once.
  await click(page, "select-carriage", "greenhouse");
  await waitCue(page, "預覽第一株作物");
  const beforePlant = await envelope(page);
  await click(page, "preview-action", "plant-crop|plot-a:lettuce");
  await page.locator(".object-preview").waitFor();
  await screenshot(page, "03-plant-cost-preview");
  await click(page, "cancel-object-action");
  await page.locator(".object-preview").waitFor({ state: "hidden" });
  const afterCancel = await envelope(page);
  assert(afterCancel.run.actionPoints === beforePlant.run.actionPoints && afterCancel.run.resources.water === beforePlant.run.resources.water, "plant preview cancellation keeps AP and water unchanged", { before: { ap: beforePlant.run.actionPoints, water: beforePlant.run.resources.water }, after: { ap: afterCancel.run.actionPoints, water: afterCancel.run.resources.water } });
  await click(page, "preview-action", "plant-crop|plot-a:lettuce");
  await click(page, "confirm-object-action");
  await waitForEnvelope(page, (value) => value.run.crops.find((plot) => plot.id === "plot-a")?.cropId === "lettuce", null, "one lettuce planted through preview confirmation");
  const afterPlant = await envelope(page);
  assert(afterPlant.run.actionPoints === beforePlant.run.actionPoints - 1, "plant confirmation charges AP exactly once", { before: beforePlant.run.actionPoints, after: afterPlant.run.actionPoints });
  assert(afterPlant.run.resources.water === beforePlant.run.resources.water - 1, "plant confirmation charges water exactly once", { before: beforePlant.run.resources.water, after: afterPlant.run.resources.water });
  await claimCue(page, "TUT-03");

  // TUT-04 and the required story decision use their normal route UI.
  await waitCue(page, "準備好就查看路線");
  await click(page, "route");
  await page.locator(".screen--route").waitFor();
  await click(page, "confirm-route");
  await page.locator(".screen--event").waitFor();
  await click(page, "event-choice", "partial");

  // TUT-05: live counter displays the exact operation and cost before charging.
  await page.locator(".screen--carriage.is-night").waitFor();
  const nightCue = page.locator(".onboarding-cue.is-night-cue");
  await nightCue.waitFor({ state: "visible", timeout: 15_000 });
  const counterButton = nightCue.locator('[data-action="counter"]');
  const counterId = await counterButton.getAttribute("data-value");
  const counterTitle = (await nightCue.locator(":scope > strong").textContent())?.trim() ?? "";
  const expectedCounter = {
    "close-shutter": { key: "energy", amount: 8, title: "關閉百葉・電量 8" },
    "shock-window": { key: "energy", amount: 12, title: "窗框電擊・電量 12" },
    "emergency-boost": { key: "fuel", amount: 4, title: "緊急加速・燃料 4" },
    "roof-release": { key: "parts", amount: 1, title: "切離攀附扣具・零件 1・噪音 +4・壓力 +2" },
  }[counterId];
  assert(Boolean(expectedCounter), "live coach selects a known legal counter", { counterId, counterTitle });
  assert(counterTitle === expectedCounter.title, "live coach shows the exact counter name and cost", { counterId, counterTitle });
  await screenshot(page, "04-live-counter-cost");
  const beforeCounter = await envelope(page);
  await click(page, "counter", counterId);
  await waitForEnvelope(page, (value, expected) =>
    value.run.resources[expected.key] === expected.before - expected.amount &&
    value.run.quests.eventHistory.filter((event) => event.operation === "counter.deploy").length > expected.counterEvents,
  { key: expectedCounter.key, before: beforeCounter.run.resources[expectedCounter.key], amount: expectedCounter.amount, counterEvents: beforeCounter.run.quests.eventHistory.filter((event) => event.operation === "counter.deploy").length },
  `priced ${counterId} counter committed through the coach`);
  const afterCounter = await envelope(page);
  assert(afterCounter.run.resources[expectedCounter.key] === beforeCounter.run.resources[expectedCounter.key] - expectedCounter.amount, "shown counter cost matches the committed resource delta", { key: expectedCounter.key, before: beforeCounter.run.resources[expectedCounter.key], after: afterCounter.run.resources[expectedCounter.key] });
  let resolvedContactId = beforeCounter.run.activeContact?.id;
  for (let remaining = 3; remaining > 0 && await page.locator(".screen--result").count() === 0; remaining -= 1) {
    await page.waitForFunction((priorId) => {
      if (document.querySelector(".screen--result")) return true;
      const raw = localStorage.getItem("ntwp.v2.current");
      if (!raw) return false;
      const run = JSON.parse(raw).run;
      return run.activeContact?.id && run.activeContact.id !== priorId && run.activeContact.stage !== "resolve";
    }, resolvedContactId, { timeout: 15_000 });
    if (await page.locator(".screen--result").count() > 0) break;
    const current = await envelope(page);
    const currentId = current.run.activeContact?.id;
    const fallbackCounter = page.locator('.emergency-actions [data-action="counter"]:not(:disabled)').first();
    await fallbackCounter.waitFor({ state: "visible", timeout: 15_000 });
    await fallbackCounter.click();
    resolvedContactId = currentId;
  }
  await page.locator(".screen--result").waitFor({ timeout: 15_000 });
  await screenshot(page, "05-dawn-five-tutorials");
  await click(page, "next-day");
  await page.locator(".screen--carriage.is-prep").waitFor();
  await claimCue(page, "TUT-04");
  await claimCue(page, "TUT-05");

  saved = await envelope(page);
  const tutorialIds = ["TUT-01", "TUT-02", "TUT-03", "TUT-04", "TUT-05"];
  const tutorialEvidence = Object.fromEntries(tutorialIds.map((id) => [id, {
    lifecycle: saved.run.quests.missions[id]?.lifecycle,
    result: saved.run.quests.missions[id]?.result,
    profileMilestone: saved.profile.milestones.includes(`mission:${id}:completed`),
    progress: saved.run.quests.missions[id]?.progress.map((item) => item.count),
  }]));
  assert(tutorialIds.every((id) => tutorialEvidence[id].profileMilestone), "all five tutorials are completed and saved to the profile", tutorialEvidence);
  assert(saved.run.modules.find((item) => item.definitionId === "M001")?.active === true, "M001 is active at the end of onboarding");
  assert(saved.run.modules.find((item) => item.definitionId === "M003")?.active === true, "M003 is restored at the end of onboarding");
  report.evidence = {
    pinGiveWay: { pinnedThenYielded: true, unpinnedThenReturned: true },
    freeInspection: { before: { ap: beforeFree.run.actionPoints, resources: beforeFree.run.resources }, after: { ap: afterFree.run.actionPoints, resources: afterFree.run.resources } },
    power: { M001: true, M003Restored: true },
    planting: { before: { ap: beforePlant.run.actionPoints, water: beforePlant.run.resources.water }, afterCancel: { ap: afterCancel.run.actionPoints, water: afterCancel.run.resources.water }, afterConfirm: { ap: afterPlant.run.actionPoints, water: afterPlant.run.resources.water } },
    counter: { id: counterId, label: counterTitle, resource: expectedCounter.key, before: beforeCounter.run.resources[expectedCounter.key], after: afterCounter.run.resources[expectedCounter.key] },
    dawn: { day: saved.run.day, tutorialEvidence },
  };
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failures.push({ message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined, details: error?.details });
  try { await screenshot(page, "failure"); } catch { /* preserve the original failure */ }
} finally {
  report.completedAt = new Date().toISOString();
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await browser.close();
}

if (report.status !== "passed") process.exitCode = 1;
else console.log(`Onboarding audit passed: ${reportPath}`);
