import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.GAME_URL ?? "http://127.0.0.1:4312";
const outputDirectory = resolve("output/playwright/button-audit");
const publicQaDirectory = resolve("public/assets/qa");
await Promise.all([
  mkdir(outputDirectory, { recursive: true }),
  mkdir(publicQaDirectory, { recursive: true }),
]);

const expectedActions = [
  "new-game", "continue", "menu", "hub", "settings", "carriage", "pause", "route", "modules", "modules-preview",
  "tech", "event-preview", "select-route", "confirm-route", "emergency-route", "event-choice", "counter", "next-day", "select-module",
  "select-module-category", "power", "meal", "toggle-module", "toggle-power", "select-ration", "build-module", "select-tech",
  "select-tech-branch", "unlock-tech", "comfort", "repair-hull", "cycle-text", "toggle-motion", "toggle-countdown",
  "toggle-speed", "toggle-sound", "decorate", "select-decoration", "move-decoration", "place-decoration", "reset-decor", "finish-decor",
  "select-carriage", "select-crop", "plant-crop", "water-crops", "harvest-crop", "workshop-scrap", "cook-meal",
  "swipe-carriage", "arm-threat-tool", "threat-interact", "thermal-select", "thermal-target", "thermal-reset", "thermal-commit",
];
const clickedActions = new Set();
const assertions = [];
const browserErrors = [];
let visualLayoutMetrics = null;
let compactLayoutMetrics = null;
let frostSupplementMetrics = null;

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

async function auditRenderedButtons(label, activePage = page) {
  const missingAction = await activePage.locator("button:not([data-action])").count();
  assert(missingAction === 0, `${label}: every button exposes a data-action`);
  const unknownActions = await activePage.locator("button[data-action]").evaluateAll((buttons, expected) => {
    const allow = new Set(expected);
    return [...new Set(buttons.map((button) => button.dataset.action).filter((action) => action && !allow.has(action)))];
  }, expectedActions);
  assert(unknownActions.length === 0, `${label}: every rendered action is part of the controller contract`);
  const obstructed = await activePage.locator("button[data-action]:not([disabled])").evaluateAll((buttons) => buttons.flatMap((button) => {
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

async function clickAction(action, value, activePage = page) {
  const suffix = value === undefined ? "" : `[data-value="${value}"]`;
  const selector = `[data-action="${action}"]${suffix}:not([disabled])`;
  let hitTest;
  let present = false;
  let clicked = false;
  let lastFailure = "target did not settle";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const target = activePage.locator(selector).first();
    try {
      if (await target.count() !== 1) {
        lastFailure = "target missing or disabled";
      } else {
        present = true;
        await target.scrollIntoViewIfNeeded();
        hitTest = await target.evaluate((button) => {
          const rect = button.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const top = document.elementFromPoint(x, y);
          return {
            clear: rect.width > 0 && rect.height > 0 && (top === button || Boolean(top && button.contains(top))),
            top: top ? `${top.tagName.toLowerCase()}.${[...top.classList].join(".")}` : "none",
            x,
            y,
          };
        });
        if (hitTest.clear) {
          await activePage.mouse.click(hitTest.x, hitTest.y);
          clicked = true;
          break;
        }
        lastFailure = `covered by ${hitTest.top}`;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await activePage.waitForTimeout(80);
  }
  assert(present, `${action}${value ? `:${value}` : ""} is present and enabled`);
  assert(
    clicked,
    `${action}${value ? `:${value}` : ""} can be hit at its visible center `
    + `(${Math.round(hitTest?.x ?? -1)},${Math.round(hitTest?.y ?? -1)}; ${lastFailure})`,
  );
  clickedActions.add(action);
  await activePage.waitForTimeout(await activePage.locator(".screen-enter").count() ? 560 : 60);
  await auditRenderedButtons(`after ${action}`, activePage);
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

async function readSavedRun(activePage) {
  return JSON.parse((await activePage.evaluate(() => localStorage.getItem("run.current"))) ?? "{}");
}

async function writeSavedRun(activePage, run) {
  const serialized = JSON.stringify(run);
  await activePage.evaluate(async (snapshot) => {
    localStorage.setItem("run.current", snapshot);
    await new Promise((resolveWrite) => {
      const request = indexedDB.open("night-train-save", 1);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("snapshots", "readwrite");
        transaction.objectStore("snapshots").put(snapshot, "run.current");
        transaction.oncomplete = () => {
          database.close();
          resolveWrite(undefined);
        };
        transaction.onerror = () => resolveWrite(undefined);
      };
      request.onerror = () => resolveWrite(undefined);
    });
  }, serialized);
  return serialized;
}

async function resumeInjectedRun(activePage, serialized) {
  await activePage.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await activePage.waitForSelector(".screen--menu");
  await activePage.evaluate(async (snapshot) => {
    localStorage.setItem("run.current", snapshot);
    await new Promise((resolveWrite) => {
      const request = indexedDB.open("night-train-save", 1);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("snapshots", "readwrite");
        transaction.objectStore("snapshots").put(snapshot, "run.current");
        transaction.oncomplete = () => {
          database.close();
          resolveWrite(undefined);
        };
        transaction.onerror = () => resolveWrite(undefined);
      };
      request.onerror = () => resolveWrite(undefined);
    });
  }, serialized);
  await clickAction("continue", undefined, activePage);
}

async function auditFrostControllerActions() {
  const frostActions = [
    "emergency-route",
    "arm-threat-tool",
    "threat-interact",
    "thermal-select",
    "thermal-target",
    "thermal-reset",
    "thermal-commit",
  ];
  const frostContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-TW" });
  const frostPage = await frostContext.newPage();
  frostPage.on("pageerror", (error) => browserErrors.push(`R02: ${error.message}`));
  frostPage.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`R02: ${message.text()}`);
  });

  try {
    await frostPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await frostPage.waitForSelector(".screen--menu");
    await frostPage.evaluate(async () => {
      localStorage.clear();
      await new Promise((resolveDelete) => {
        const request = indexedDB.deleteDatabase("night-train-save");
        request.onsuccess = () => resolveDelete(undefined);
        request.onerror = () => resolveDelete(undefined);
        request.onblocked = () => resolveDelete(undefined);
      });
      localStorage.setItem("settings", JSON.stringify({
        textScale: 100,
        reducedMotion: false,
        noCountdown: true,
        lowSpeed: false,
        sound: false,
      }));
    });
    await frostPage.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await frostPage.waitForSelector(".screen--menu");

    // Normal R02 opening: no story state is injected for the thermal controls.
    await clickAction("new-game", "R02", frostPage);
    await frostPage.waitForSelector('[data-event-id="EV053"]');
    await clickAction("event-choice", "a07-layout", frostPage);
    await frostPage.waitForSelector(".screen--carriage.is-prep");
    await clickAction("power", undefined, frostPage);
    await frostPage.waitForSelector('[data-testid="thermal-board"]');

    const thermalBefore = await readSavedRun(frostPage);
    const initialH1Zone = thermalBefore.story.whiteFrost.thermal.tokens
      .find((token) => token.id === "H1")?.zone;
    const initialRevision = thermalBefore.story.whiteFrost.thermal.revision;
    assert(initialH1Zone === "BERTH", "R02 normal opening starts H1 in BERTH");

    await clickAction("thermal-select", "H1", frostPage);
    const afterSelect = await readSavedRun(frostPage);
    assert(
      afterSelect.story.whiteFrost.thermal.selectedTokenId === "H1",
      "thermal-select visibly persists H1 as the selected token",
    );

    await clickAction("thermal-target", "LOOP", frostPage);
    const afterTarget = await readSavedRun(frostPage);
    assert(
      afterTarget.story.whiteFrost.thermal.tokens.find((token) => token.id === "H1")?.zone === "LOOP"
      && afterTarget.story.whiteFrost.thermal.selectedTokenId === null
      && afterTarget.story.whiteFrost.thermal.revision === initialRevision + 1,
      "thermal-target visibly moves H1 to LOOP and persists the revision",
    );

    await clickAction("thermal-reset", undefined, frostPage);
    const afterReset = await readSavedRun(frostPage);
    const resetAllocation = afterReset.story.whiteFrost.thermal.tokens.reduce((counts, token) => {
      counts[token.zone] = (counts[token.zone] ?? 0) + 1;
      return counts;
    }, {});
    assert(
      afterReset.story.whiteFrost.thermal.tokens.find((token) => token.id === "H1")?.zone === "BERTH"
      && resetAllocation.BERTH === 2
      && resetAllocation.DEICER === 2
      && resetAllocation.LOOP === 2
      && afterReset.story.whiteFrost.thermal.revision === initialRevision + 2,
      "thermal-reset visibly restores the committed 2/2/2 allocation",
    );

    const resourcesBeforeCommit = { ...afterReset.resources };
    await clickAction("thermal-commit", undefined, frostPage);
    const afterCommit = await readSavedRun(frostPage);
    assert(
      afterCommit.story.whiteFrost.thermal.committedDay === 1
      && afterCommit.story.whiteFrost.thermal.settlementIds.includes("thermal:R02:D1:UNSET"),
      "thermal-commit persists the Day 1 settlement exactly through the visible button",
    );
    assert(
      afterCommit.resources.energy === resourcesBeforeCommit.energy - 2
      && afterCommit.resources.fuel === resourcesBeforeCommit.fuel - 1
      && afterCommit.resources.water === resourcesBeforeCommit.water,
      "thermal-commit applies the visible 2 energy and 1 fuel cost once",
    );

    // Disclosed local fixture: isolate T004's tap fallback without replaying seven nights.
    const t004Fixture = structuredClone(afterCommit);
    t004Fixture.day = 3;
    t004Fixture.phase = "night";
    t004Fixture.activeEventId = undefined;
    t004Fixture.selectedRouteNodeId = "RN01";
    // The fixture jumps from Day 1 to Day 3. Mark the queued Day 1 ledger as
    // already seen so this check isolates T004 instead of opening an overdue
    // EV054 immediately after the contact resolves.
    t004Fixture.story.queue = t004Fixture.story.queue.filter((event) => event.eventId !== "EV054");
    t004Fixture.story.seenEventIds = [...new Set([
      ...t004Fixture.story.seenEventIds,
      "EV054",
    ])];
    t004Fixture.activeContact = {
      id: "button-audit-t004",
      definitionId: "T004",
      stage: "approach",
      secondsLeft: 10,
      wave: 1,
      totalWaves: 1,
      interaction: {
        kind: "T004",
        targetPlotId: "plot-a",
        attempts: 0,
        targetRevealed: false,
      },
    };
    const serializedT004Fixture = await writeSavedRun(frostPage, t004Fixture);
    await resumeInjectedRun(frostPage, serializedT004Fixture);
    await frostPage.waitForSelector('[data-testid="threat-interaction"][data-threat-id="T004"]');

    const cutter = frostPage.locator('[data-action="arm-threat-tool"][data-threat-tool="cutter"]').first();
    assert(await cutter.getAttribute("aria-pressed") === "false", "T004 cutter starts visibly unarmed");
    await clickAction("arm-threat-tool", undefined, frostPage);
    assert(
      await cutter.getAttribute("aria-pressed") === "true"
      && await frostPage.locator(".threat-interaction--vine.is-tool-armed").count() === 1,
      "arm-threat-tool visibly arms the cutter through a center-hit browser click",
    );

    await clickAction("threat-interact", "cutter:plot-a", frostPage);
    const afterThreatInteraction = await readSavedRun(frostPage);
    assert(
      afterThreatInteraction.phase === "aftermath"
      && !afterThreatInteraction.activeContact,
      "threat-interact resolves the disclosed T004 contact and persists aftermath state",
    );

    // Disclosed local fixture: no-countdown cannot wait for a breach, so the
    // zero-resource brace action must visibly apply breach costs and advance.
    const braceFixture = structuredClone(afterThreatInteraction);
    braceFixture.day = 3;
    braceFixture.phase = "night";
    braceFixture.resources.energy = 0;
    braceFixture.resources.fuel = 0;
    braceFixture.environment.hull = 100;
    braceFixture.survivor.sleep = 100;
    braceFixture.survivor.stress = 20;
    braceFixture.story.finaleHealthBuffer = 0;
    braceFixture.activeEventId = undefined;
    braceFixture.activeContact = {
      id: "button-audit-brace-impact",
      definitionId: "T003",
      stage: "approach",
      secondsLeft: 7,
      wave: 1,
      totalWaves: 2,
    };
    const serializedBraceFixture = await writeSavedRun(frostPage, braceFixture);
    await resumeInjectedRun(frostPage, serializedBraceFixture);
    await frostPage.waitForSelector('.screen--carriage.is-night[data-threat-id="T003"]');
    await clickAction("counter", "brace-impact", frostPage);
    const afterBraceImpact = await readSavedRun(frostPage);
    assert(
      afterBraceImpact.phase === "night"
      && afterBraceImpact.activeContact?.wave === 2
      && afterBraceImpact.activeContact?.totalWaves === 2,
      "brace-impact visibly advances a zero-resource T003 contact from wave 1 to wave 2",
    );
    assert(
      afterBraceImpact.environment.hull === 78
      && afterBraceImpact.survivor.sleep === 82
      && afterBraceImpact.survivor.stress === 32
      && afterBraceImpact.resources.energy === 0
      && afterBraceImpact.resources.fuel === 0,
      "brace-impact persists the Day 3 breach costs without creating energy or fuel",
    );

    // Disclosed local fixture: fuel-zero route deadlock recovery at authored baselines.
    const emergencyFixture = structuredClone(afterBraceImpact);
    emergencyFixture.day = 2;
    emergencyFixture.phase = "route";
    emergencyFixture.resources.fuel = 0;
    emergencyFixture.environment.hull = 100;
    emergencyFixture.environment.temperature = 12;
    emergencyFixture.survivor.sleep = 100;
    emergencyFixture.survivor.stress = 20;
    emergencyFixture.activeEventId = undefined;
    emergencyFixture.activeContact = undefined;
    emergencyFixture.selectedRouteNodeId = undefined;
    emergencyFixture.ended = false;
    emergencyFixture.outcome = "active";
    emergencyFixture.story.seenEventIds = [...new Set([
      ...emergencyFixture.story.seenEventIds,
      "EV055",
    ])];
    const serializedEmergencyFixture = await writeSavedRun(frostPage, emergencyFixture);
    await resumeInjectedRun(frostPage, serializedEmergencyFixture);
    await frostPage.waitForSelector(".screen--route.has-emergency-route");
    await clickAction("emergency-route", undefined, frostPage);
    const afterEmergencyRoute = await readSavedRun(frostPage);
    assert(
      afterEmergencyRoute.selectedRouteNodeId === "RN01"
      && afterEmergencyRoute.phase === "travel"
      && afterEmergencyRoute.resources.fuel === 0,
      "emergency-route visibly selects RN01 and advances to travel without creating fuel",
    );
    assert(
      afterEmergencyRoute.environment.hull === 94
      && afterEmergencyRoute.environment.temperature === 9
      && afterEmergencyRoute.survivor.sleep === 92
      && afterEmergencyRoute.survivor.stress === 28,
      "emergency-route persists hull 94, temperature 9, sleep 92 and stress 28",
    );

    for (const action of frostActions) {
      assert(clickedActions.has(action), `${action} was recorded only after its real center-hit browser click`);
    }
    return {
      actions: frostActions,
      normalR02Opening: {
        eventId: "EV053",
        choiceId: "a07-layout",
        thermalStartDay: thermalBefore.day,
      },
      thermal: {
        selectedToken: "H1",
        targetZone: "LOOP",
        resetAllocation,
        committedDay: afterCommit.story.whiteFrost.thermal.committedDay,
        settlementId: "thermal:R02:D1:UNSET",
        resourceDelta: {
          energy: afterCommit.resources.energy - resourcesBeforeCommit.energy,
          fuel: afterCommit.resources.fuel - resourcesBeforeCommit.fuel,
          water: afterCommit.resources.water - resourcesBeforeCommit.water,
        },
      },
      disclosedFixtures: {
        threat: {
          day: 3,
          phase: "night",
          threatId: "T004",
          targetPlotId: "plot-a",
          noCountdown: true,
          consumedOverdueEvent: "EV054",
        },
        braceImpact: {
          day: 3,
          phase: "night",
          threatId: "T003",
          energy: 0,
          fuel: 0,
          noCountdown: true,
        },
        emergencyRoute: {
          day: 2,
          phase: "route",
          fuel: 0,
          seenEventAdded: "EV055",
          baseline: { hull: 100, temperature: 12, sleep: 100, stress: 20 },
        },
      },
      t004Result: {
        resolvedContactId: "button-audit-t004",
        phase: afterThreatInteraction.phase,
        activeContact: afterThreatInteraction.activeContact ?? null,
      },
      braceImpactResult: {
        phase: afterBraceImpact.phase,
        wave: afterBraceImpact.activeContact?.wave,
        totalWaves: afterBraceImpact.activeContact?.totalWaves,
        energy: afterBraceImpact.resources.energy,
        fuel: afterBraceImpact.resources.fuel,
        hull: afterBraceImpact.environment.hull,
        sleep: afterBraceImpact.survivor.sleep,
        stress: afterBraceImpact.survivor.stress,
      },
      emergencyRouteResult: {
        selectedRouteNodeId: afterEmergencyRoute.selectedRouteNodeId,
        phase: afterEmergencyRoute.phase,
        fuel: afterEmergencyRoute.resources.fuel,
        hull: afterEmergencyRoute.environment.hull,
        temperature: afterEmergencyRoute.environment.temperature,
        sleep: afterEmergencyRoute.survivor.sleep,
        stress: afterEmergencyRoute.survivor.stress,
      },
    };
  } finally {
    await frostContext.close();
  }
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

  await clickAction("new-game", "R01");
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
  await clickAction("select-route", "RN02");
  assert((await page.locator(".route-summary").textContent())?.includes("2 波"), "medium-risk route visibly promises two night contacts");
  await clickAction("confirm-route", "RN02");
  await page.waitForSelector(".screen--event");
  await clickAction("event-choice", "full");
  await page.waitForSelector(".screen--carriage.is-night");

  const alert = page.getByRole("alert");
  assert((await alert.textContent())?.includes("接觸 1/2"), "medium-risk route begins at the first of two visible contacts");
  assert((await page.locator('[data-action="pause"]').textContent())?.includes("暫停"), "night control visibly says pause instead of looking like a speed indicator");
  assert((await page.locator('[data-action="pause"]').getAttribute("aria-label"))?.includes("暫停"), "night pause control exposes matching accessible language");
  await clickAction("pause");
  assert((await page.locator('[data-action="pause"]').textContent())?.includes("繼續"), "paused night control visibly changes to continue");
  const pausedAt = await alert.textContent();
  await page.waitForTimeout(1400);
  assert((await alert.textContent()) === pausedAt, "pause freezes the threat countdown");
  await clickAction("pause");
  assert((await page.locator('[data-action="pause"]').textContent())?.includes("暫停"), "resumed night control visibly returns to pause");
  await page.waitForTimeout(1200);
  assert((await alert.textContent()) !== pausedAt, "resume advances the threat countdown");
  const contactName = (await alert.textContent()) ?? "";
  await clickAction("counter", contactName.includes("攀附者") ? "emergency-boost" : "close-shutter");
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes("接觸 2/2"));
  assert((await alert.textContent())?.includes("接觸 2/2"), "successful first counter advances to the route's second contact instead of ending the night");
  await page.screenshot({ path: resolve(outputDirectory, "24-route-risk-waves.png"), fullPage: true });
  const secondContactName = (await alert.textContent()) ?? "";
  await clickAction("counter", secondContactName.includes("攀附者") ? "emergency-boost" : "close-shutter");
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
  await page.locator('[data-action="select-route"][data-value="RN03"]').click();
  await page.waitForSelector('[data-action="select-route"][data-value="RN03"].is-selected');
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
  await compactPage.locator('[data-action="new-game"][data-value="R01"]:not([disabled])').click();
  await compactPage.waitForSelector(".screen--carriage.is-observation-mode");
  // Measure the settled layout, not the 520ms panel-rise entrance transform.
  await compactPage.waitForTimeout(650);
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
      selectorLabelFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".carriage-selector button small")).fontSize),
      dockLabelFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".carriage-dock button b")).fontSize),
      cropInfoFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".crop-quick-picker em")).fontSize),
    };
  });
  assert(compactLayoutMetrics.uninterruptedSceneHeight >= 320, `360×640 view keeps a playable scene window (${compactLayoutMetrics.uninterruptedSceneHeight}px)`);
  assert(compactLayoutMetrics.dockBottom <= 640, `360×640 command dock remains inside the viewport (${compactLayoutMetrics.dockBottom}px)`);
  assert(compactLayoutMetrics.minimumTouchWidth >= 48 && compactLayoutMetrics.minimumTouchHeight >= 48, `360×640 targets remain at least 48px (${compactLayoutMetrics.minimumTouchWidth}×${compactLayoutMetrics.minimumTouchHeight})`);
  assert(compactLayoutMetrics.horizontalOverflow === 0, "360×640 viewport has no horizontal overflow");
  assert(compactLayoutMetrics.selectorLabelFontSize >= 9, `360×640 carriage labels remain readable (${compactLayoutMetrics.selectorLabelFontSize}px)`);
  assert(compactLayoutMetrics.dockLabelFontSize >= 10, `360×640 command labels remain readable (${compactLayoutMetrics.dockLabelFontSize}px)`);
  assert(compactLayoutMetrics.cropInfoFontSize >= 9, `360×640 crop information remains readable (${compactLayoutMetrics.cropInfoFontSize}px)`);
  await compactPage.screenshot({ path: resolve(outputDirectory, "20-compact-360x640.png"), fullPage: true });
  await compactContext.close();

  const frostOnlyActions = [
    "emergency-route",
    "arm-threat-tool",
    "threat-interact",
    "thermal-select",
    "thermal-target",
    "thermal-reset",
    "thermal-commit",
  ];
  const missingBeforeFrost = expectedActions.filter((action) => !clickedActions.has(action));
  assert(clickedActions.size === 49, `existing R01 flow still exercises exactly 49 controller actions (${clickedActions.size})`);
  assert(
    missingBeforeFrost.length === frostOnlyActions.length
    && frostOnlyActions.every((action) => missingBeforeFrost.includes(action)),
    "only the seven disclosed R02 controller actions remain after the existing R01 flow",
  );
  frostSupplementMetrics = await auditFrostControllerActions();
  assert(clickedActions.size === 56, `R01 plus R02 browser clicks exercise exactly 56 controller actions (${clickedActions.size})`);

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
    r01ActionCount: 49,
    frostSupplementMetrics,
    mobileGameFeel: {
      horizontalCarriageSwipe: true,
      firstUseSwipeGuidance: true,
      actionDeltaTickets: true,
      preparationApDial: true,
      hapticFeedbackWhenSupported: true,
      routeRiskNightWaves: true,
      distinctGptCarriageBackgrounds: true,
      semanticPauseControl: true,
    },
    browserErrors,
    generatedAt: new Date().toISOString(),
  };
  const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
  await Promise.all([
    writeFile(resolve(outputDirectory, "report.json"), serializedReport, "utf8"),
    writeFile(resolve(publicQaDirectory, "mobile-playability-report.json"), serializedReport, "utf8"),
  ]);
  console.log(
    `Button audit passed: ${report.actionCount} actions, ${report.assertions} assertions; `
    + `reports written to ${outputDirectory} and ${publicQaDirectory}`,
  );
} finally {
  await Promise.race([browser.close(), new Promise((resolveClose) => setTimeout(resolveClose, 5000))]);
}
