import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const BRANCHES = ["CULTIVATE", "FILTER", "PURGE"];
const ENDING_BY_BRANCH = {
  CULTIVATE: "symbiosis",
  FILTER: "seedbank",
  PURGE: "firebreak",
};
const CARRIAGE_BY_BRANCH = {
  CULTIVATE: "greenhouse",
  FILTER: "workshop",
  PURGE: "defense",
};
const DAY5_EVENT_BY_BRANCH = {
  CULTIVATE: "EV073",
  FILTER: "EV074",
  PURGE: "EV075",
};
const DAY5_CHOICE_BY_BRANCH = {
  CULTIVATE: "control",
  FILTER: "full-filter",
  PURGE: "burn-water",
};
const VIEWPORT = { width: 390, height: 844 };
const COMPACT_VIEWPORT = { width: 360, height: 640 };
const baseUrl = process.env.GAME_URL ?? "http://127.0.0.1:4313";
const outputDirectory = resolve("output/playwright/green-story");
const screenshotDirectory = resolve("public/assets/screenshots");
const videoDirectory = resolve("public/assets/video");
const qaDirectory = resolve("public/assets/qa");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

async function sha256(path) {
  const file = await readFile(path);
  return createHash("sha256").update(file).digest("hex");
}

async function readRun(page) {
  return JSON.parse(
    (await page.evaluate(() => localStorage.getItem("run.current"))) ?? "{}",
  );
}

async function readSettings(page) {
  return JSON.parse(
    (await page.evaluate(() => localStorage.getItem("settings"))) ?? "{}",
  );
}

async function centerHitTest(page, locator) {
  const box = await locator.boundingBox();
  if (!box) return false;
  const identity = {
    action: await locator.getAttribute("data-action"),
    value: await locator.getAttribute("data-value"),
  };
  return page.evaluate(
    ({ x, y, identity: expected }) => {
      const hit = document.elementFromPoint(
        Math.max(0, Math.min(window.innerWidth - 1, x)),
        Math.max(0, Math.min(window.innerHeight - 1, y)),
      );
      const target = hit?.closest("[data-action]");
      return (
        target?.getAttribute("data-action") === expected.action &&
        target?.getAttribute("data-value") === expected.value
      );
    },
    {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      identity,
    },
  );
}

async function clickAction(page, actionLog, action, value) {
  const suffix = value === undefined ? "" : `[data-value="${value}"]`;
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const locator = page
        .locator(`[data-action="${action}"]${suffix}:not([disabled])`)
        .first();
      await locator.waitFor({ state: "visible", timeout: 8000 });
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      assert(
        box && box.width >= 44 && box.height >= 44,
        `${action}:${value ?? ""} lacks a 44px touch target`,
      );
      assert(
        await centerHitTest(page, locator),
        `${action}:${value ?? ""} is covered at its visual center`,
      );
      await locator.click();
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (
        attempt === 5 ||
        (!message.includes("not attached to the DOM") &&
          !message.includes("intercepts pointer events"))
      ) {
        throw error;
      }
      await page.waitForTimeout(80);
    }
  }
  if (lastError) throw lastError;
  actionLog.push(`${action}${value === undefined ? "" : `:${value}`}`);
  await page.waitForTimeout(180);
}

async function saveScreenshot(page, publicName, registry) {
  const path = resolve(screenshotDirectory, publicName);
  await page.screenshot({ path, fullPage: true });
  registry.push(`public/assets/screenshots/${publicName}`);
  return path;
}

async function revealEventChoices(page, expectedCount) {
  const choices = page.locator('[data-action="event-choice"]');
  assert(
    (await choices.count()) === expectedCount,
    `Expected ${expectedCount} event choices`,
  );
  await choices.last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(180);
  const visibleChoices = await choices.evaluateAll(
    (buttons) =>
      buttons.filter((button) => {
        const box = button.getBoundingClientRect();
        return (
          box.width > 0 &&
          box.height > 0 &&
          box.bottom > 0 &&
          box.top < window.innerHeight
        );
      }).length,
  );
  assert(
    visibleChoices === expectedCount,
    `Only ${visibleChoices}/${expectedCount} event choices are visible after scrolling`,
  );
}

async function installRun(page, run, actionLog) {
  const serialized = JSON.stringify(run);
  await page.evaluate(async (checkpoint) => {
    // Keep both persistence layers in sync. The currently mounted app also
    // saves its in-memory run during pagehide, so retain a one-shot copy in
    // sessionStorage and restore it before the next document boots.
    sessionStorage.setItem("qa.pending.run.current", checkpoint);
    localStorage.setItem("run.current", checkpoint);
    localStorage.removeItem("run.backup");
    await new Promise((resolveWrite, rejectWrite) => {
      const request = indexedDB.open("night-train-save", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("snapshots")) {
          request.result.createObjectStore("snapshots");
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("snapshots", "readwrite");
        const store = transaction.objectStore("snapshots");
        store.put(checkpoint, "run.current");
        store.delete("run.backup");
        transaction.oncomplete = () => {
          database.close();
          resolveWrite(undefined);
        };
        transaction.onerror = () => {
          database.close();
          rejectWrite(
            transaction.error ?? new Error("Cannot write QA checkpoint"),
          );
        };
      };
      request.onerror = () =>
        rejectWrite(request.error ?? new Error("Cannot open QA save database"));
    });
  }, serialized);
  await page.addInitScript(() => {
    const checkpoint = sessionStorage.getItem("qa.pending.run.current");
    if (!checkpoint) return;
    localStorage.setItem("run.current", checkpoint);
    localStorage.removeItem("run.backup");
    sessionStorage.removeItem("qa.pending.run.current");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".screen--menu");
  await clickAction(page, actionLog, "continue");
  const restored = await readRun(page);
  assert(
    restored.routeId === run.routeId,
    "QA checkpoint route was not restored",
  );
  assert(restored.day === run.day, "QA checkpoint day was not restored");
  assert(restored.phase === run.phase, "QA checkpoint phase was not restored");
  assert(
    restored.activeEventId === run.activeEventId,
    `QA checkpoint event mismatch: expected ${run.activeEventId ?? "none"}, received ${restored.activeEventId ?? "none"}`,
  );
}

async function installSettings(page, settings) {
  await page.evaluate(
    (value) => localStorage.setItem("settings", JSON.stringify(value)),
    settings,
  );
}

async function resetBrowserState(page, actionLog) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolveDelete) => {
      const request = indexedDB.deleteDatabase("night-train-save");
      request.onsuccess = () => resolveDelete(undefined);
      request.onerror = () => resolveDelete(undefined);
      request.onblocked = () => resolveDelete(undefined);
    });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".screen--menu");
  await clickAction(page, actionLog, "settings");
  await clickAction(page, actionLog, "toggle-countdown");
  await clickAction(page, actionLog, "toggle-sound");
  await clickAction(page, actionLog, "menu");
  const settings = await readSettings(page);
  assert(
    settings.noCountdown === true,
    "No-countdown must be enabled through visible settings",
  );
  assert(
    settings.sound === false,
    "Sound must be disabled through visible settings",
  );
}

function prepCycleCheckpoint(run) {
  const next = structuredClone(run);
  next.day = 3;
  next.phase = "prep";
  next.actionPoints = 5;
  next.ended = false;
  next.outcome = "active";
  delete next.activeEventId;
  delete next.activeContact;
  next.story.seenEventIds = [...new Set([...next.story.seenEventIds, "EV070"])];
  next.story.greenTide.finaleStage = "inactive";
  next.story.greenTide.cycle.committedDay = null;
  next.story.greenTide.cycle.settlementIds = [];
  next.story.greenTide.cycle.samples.forEach((sample) => {
    sample.zone = "INTAKE";
    sample.revealed = false;
  });
  return next;
}

function branchCheckpoint(run) {
  const next = structuredClone(run);
  next.day = 4;
  next.phase = "route";
  next.actionPoints = 5;
  next.resources.energy = 90;
  next.resources.parts = 20;
  next.resources.food = 10;
  next.resources.water = 10;
  next.activeEventId = "EV072";
  delete next.activeContact;
  next.ended = false;
  next.outcome = "active";
  return next;
}

function branchCarriageCheckpoint(run) {
  const next = structuredClone(run);
  next.day = 5;
  next.phase = "prep";
  next.actionPoints = 5;
  delete next.activeEventId;
  delete next.activeContact;
  next.ended = false;
  next.outcome = "active";
  return next;
}

function finaleCheckpoint(run, branch) {
  const next = structuredClone(run);
  next.day = 7;
  next.phase = "night";
  next.actionPoints = 5;
  next.ended = false;
  next.outcome = "active";
  delete next.activeEventId;
  next.resources = {
    energy: 90,
    fuel: 50,
    food: 10,
    water: 10,
    parts: 20,
    medicine: 3,
    data: next.resources.data ?? 0,
  };
  next.environment.hull = 100;
  next.survivor.health = 90;
  next.survivor.stress = 15;
  next.survivor.infection = branch === "CULTIVATE" ? 30 : 10;
  next.story.greenTide.branch = branch;
  next.story.greenTide.finaleStage = "contact";
  next.story.greenTide.sourceLocated = true;
  next.story.greenTide.truthShared = true;
  next.story.greenTide.seedStock = 6;
  next.story.greenTide.reservoirContamination = 10;
  next.story.greenTide.plotContamination = { "plot-a": 0, "plot-b": 0 };
  next.story.greenTide.isolatedPlots = [];
  next.story.greenTide.finalDecision = null;
  next.story.greenTide.endingId = null;
  next.story.greenTide.endingReasons = [];
  next.story.greenTide.rewardSettled = false;
  next.story.greenTide.cycle = {
    samples: [
      { id: "S1", quality: "tainted", revealed: false, zone: "INTAKE" },
      { id: "S2", quality: "tainted", revealed: false, zone: "INTAKE" },
      { id: "S3", quality: "clean", revealed: false, zone: "INTAKE" },
      { id: "S4", quality: "clean", revealed: false, zone: "INTAKE" },
    ],
    selectedSampleId: null,
    committedDay: null,
    settlementIds: next.story.greenTide.cycle.settlementIds.filter(
      (id) => !id.includes(":D7:"),
    ),
    revision: next.story.greenTide.cycle.revision,
    attempts: 0,
    firstMissRevealed: false,
    manualDrainAvailable: true,
  };
  next.crops = [
    {
      id: "plot-a",
      cropId: "lettuce",
      stage: 3,
      plantedDay: 1,
      wateredDay: 7,
      dryDays: 0,
    },
    {
      id: "plot-b",
      cropId: "herb",
      stage: 2,
      plantedDay: 3,
      wateredDay: 7,
      dryDays: 0,
    },
  ];
  next.activeContact = {
    id: "contact-7-1",
    definitionId: "T013",
    stage: "warning",
    secondsLeft: 14,
    wave: 1,
    totalWaves: 2,
    interaction: {
      kind: "T013",
      contaminatedSampleIds: ["S1", "S2"],
      inspectedSampleIds: [],
      attempts: 0,
      firstMissRevealed: false,
      manualFallbackAvailable: true,
    },
  };
  return next;
}

async function arrangeCycleThroughVisibleControls(
  page,
  actionLog,
  threatMode = false,
) {
  const action = threatMode ? "threat-interact" : undefined;
  for (const id of ["S1", "S2", "S3", "S4"]) {
    if (threatMode) {
      await clickAction(page, actionLog, action, `cycle:select:${id}`);
      await clickAction(page, actionLog, action, `cycle:inspect:${id}`);
    } else {
      await clickAction(page, actionLog, "cycle-select", id);
      await clickAction(page, actionLog, "cycle-inspect", id);
    }
  }
  const run = await readRun(page);
  let cleanIndex = 0;
  for (const sample of run.story.greenTide.cycle.samples) {
    const zone =
      sample.quality === "tainted"
        ? "FILTER"
        : cleanIndex++ === 0
          ? "GROW_A"
          : "GROW_B";
    if (threatMode) {
      const threatZone = sample.quality === "tainted" ? "FILTER" : "DRAIN";
      await clickAction(page, actionLog, action, `cycle:select:${sample.id}`);
      await clickAction(page, actionLog, action, `cycle:target:${threatZone}`);
    } else {
      await clickAction(page, actionLog, "cycle-select", sample.id);
      await clickAction(page, actionLog, "cycle-target", zone);
    }
  }
}

async function auditCompactCycleBoard(page, actionLog, registry) {
  await installSettings(page, {
    textScale: 140,
    reducedMotion: true,
    noCountdown: true,
    lowSpeed: false,
    sound: false,
  });
  await page.setViewportSize(COMPACT_VIEWPORT);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".screen--menu");
  await clickAction(page, actionLog, "continue");
  await clickAction(page, actionLog, "power");
  await page.waitForSelector('[data-testid="cycle-board"]');

  const metrics = await page.evaluate(() => {
    const app = document.querySelector("#app");
    const board = document.querySelector('[data-testid="cycle-board"]');
    const rectangle = board?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      horizontalOverflow:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
          app?.scrollWidth ?? 0,
        ) - innerWidth,
      textScale: Number.parseFloat(
        getComputedStyle(app ?? document.documentElement).getPropertyValue(
          "--text-scale",
        ),
      ),
      reducedMotion: app?.classList.contains("reduce-motion") ?? false,
      board: rectangle
        ? {
            left: rectangle.left,
            right: rectangle.right,
            top: rectangle.top,
            bottom: rectangle.bottom,
          }
        : null,
    };
  });
  assert(
    metrics.viewport.width === 360 && metrics.viewport.height === 640,
    "Compact viewport mismatch",
  );
  assert(
    metrics.horizontalOverflow <= 1,
    `Compact board overflows by ${metrics.horizontalOverflow}px`,
  );
  assert(
    Math.abs(metrics.textScale - 1.4) < 0.01,
    "Compact board is not at 140% text",
  );
  assert(
    metrics.reducedMotion,
    "Compact board lacks reduced-motion static equivalent",
  );

  const touchTargets = [];
  const controls = page.locator(
    '[data-testid="cycle-board"] button:not([disabled])',
  );
  const count = await controls.count();
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    const label = `${await control.getAttribute("data-action")}:${(await control.getAttribute("data-value")) ?? ""}`;
    assert(box, `${label} has no visible box`);
    assert(
      box.width >= 48 && box.height >= 48,
      `${label} is ${box.width}x${box.height}, expected 48x48`,
    );
    assert(
      box.x >= -1 && box.x + box.width <= COMPACT_VIEWPORT.width + 1,
      `${label} leaves compact width`,
    );
    assert(await centerHitTest(page, control), `${label} is covered at center`);
    touchTargets.push({
      label,
      width: round(box.width),
      height: round(box.height),
      centerHit: true,
    });
  }
  await saveScreenshot(
    page,
    "green-cycle-board-360x640-text140-v110.png",
    registry,
  );

  await installSettings(page, {
    textScale: 100,
    reducedMotion: false,
    noCountdown: true,
    lowSpeed: false,
    sound: false,
  });
  await page.setViewportSize(VIEWPORT);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".screen--menu");
  await clickAction(page, actionLog, "continue");
  return { ...metrics, touchTargets };
}

async function inspectVideo(browser, publicName) {
  const page = await browser.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    return await page.evaluate(async (url) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = url;
      document.body.append(video);
      await new Promise((resolveMetadata, rejectMetadata) => {
        video.onloadedmetadata = () => resolveMetadata(undefined);
        video.onerror = () =>
          rejectMetadata(new Error("Video metadata failed"));
      });
      return {
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: Math.round(video.duration * 100) / 100,
      };
    }, `./assets/video/${publicName}`);
  } finally {
    await page.close();
  }
}

async function runBranch(browser, branch, sharedRegistry) {
  const branchDirectory = resolve(outputDirectory, branch.toLowerCase());
  await mkdir(branchDirectory, { recursive: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: branchDirectory, size: VIEWPORT },
  });
  const page = await context.newPage();
  const video = page.video();
  const actions = [];
  const screenshots = [];
  const checkpoints = [];
  let compact;
  let preEnding;

  try {
    await resetBrowserState(page, actions);
    if (branch === "FILTER") {
      await saveScreenshot(page, "green-route-selection-v110.png", screenshots);
    }
    await clickAction(page, actions, "new-game", "R03");
    await page.waitForSelector('[data-event-id="EV066"]');
    if (branch === "FILTER") {
      await saveScreenshot(page, "green-ev066-intake-v110.png", screenshots);
    }
    await clickAction(
      page,
      actions,
      "event-choice",
      branch === "FILTER" ? "scan" : "skim",
    );
    checkpoints.push(
      "EV066 visible choice → disclosed Day 3 Cycle Board showcase",
    );

    await installRun(page, prepCycleCheckpoint(await readRun(page)), actions);
    await clickAction(page, actions, "power");
    await page.waitForSelector('[data-testid="cycle-board"]');
    await arrangeCycleThroughVisibleControls(page, actions, false);
    if (branch === "FILTER") {
      compact = await auditCompactCycleBoard(page, actions, screenshots);
      await clickAction(page, actions, "power");
    }
    const boardOpen = await page.locator('[data-testid="cycle-board"]').count();
    if (!boardOpen) await clickAction(page, actions, "power");
    await clickAction(page, actions, "cycle-commit");
    checkpoints.push("Cycle Board all-sample inspect/move/commit");

    await installRun(page, branchCheckpoint(await readRun(page)), actions);
    await page.waitForSelector('[data-event-id="EV072"]');
    if (branch === "FILTER") {
      await revealEventChoices(page, 3);
      await saveScreenshot(
        page,
        "green-ev072-three-branches-v110.png",
        screenshots,
      );
    }
    await clickAction(page, actions, "event-choice", branch);
    checkpoints.push(`EV072 visible irreversible ${branch} choice`);

    await installRun(
      page,
      branchCarriageCheckpoint(await readRun(page)),
      actions,
    );
    await page.waitForSelector(
      `[data-event-id="${DAY5_EVENT_BY_BRANCH[branch]}"]`,
    );
    await clickAction(
      page,
      actions,
      "event-choice",
      DAY5_CHOICE_BY_BRANCH[branch],
    );
    checkpoints.push(
      `${DAY5_EVENT_BY_BRANCH[branch]} visible ${DAY5_CHOICE_BY_BRANCH[branch]} operation`,
    );
    await clickAction(
      page,
      actions,
      "select-carriage",
      CARRIAGE_BY_BRANCH[branch],
    );
    await page.waitForTimeout(900);
    await saveScreenshot(
      page,
      `green-${branch.toLowerCase()}-carriage-v110.png`,
      screenshots,
    );

    await installRun(
      page,
      finaleCheckpoint(await readRun(page), branch),
      actions,
    );
    await page.waitForSelector(
      '[data-testid="threat-interaction"][data-threat-id="T013"]',
    );
    await arrangeCycleThroughVisibleControls(page, actions, true);
    await saveScreenshot(
      page,
      `green-${branch.toLowerCase()}-t013-cycle-v110.png`,
      screenshots,
    );
    await clickAction(page, actions, "threat-interact", "cycle:commit");
    await page.waitForSelector(
      '[data-testid="threat-interaction"][data-threat-id="T008"]',
    );

    const t008Run = await readRun(page);
    const target = t008Run.activeContact.interaction.targetZone;
    const wrong = ["CANOPY", "FILTER", "UNDERBED"].find(
      (zone) => zone !== target,
    );
    await clickAction(
      page,
      actions,
      "threat-interact",
      `lurker:inspect:${wrong}`,
    );
    await clickAction(page, actions, "threat-interact", `lurker:mark:${wrong}`);
    const firstMiss = await readRun(page);
    assert(
      firstMiss.activeContact.interaction.firstMissRevealed,
      "T008 first miss did not persist",
    );
    assert(
      firstMiss.survivor.infection === t008Run.survivor.infection,
      "T008 first miss changed infection",
    );
    await saveScreenshot(
      page,
      `green-${branch.toLowerCase()}-t008-first-miss-v110.png`,
      screenshots,
    );
    await clickAction(
      page,
      actions,
      "threat-interact",
      `lurker:inspect:${target}`,
    );
    await clickAction(
      page,
      actions,
      "threat-interact",
      `lurker:mark:${target}`,
    );
    await page.waitForSelector('[data-event-id="EV078"]');
    checkpoints.push("Day 7 visible T013 → T008 first-miss/retry → EV078");
    if (branch === "FILTER") {
      await revealEventChoices(page, 4);
      await saveScreenshot(
        page,
        "green-ev078-four-endings-v110.png",
        screenshots,
      );
    }

    preEnding = await readRun(page);
    await clickAction(page, actions, "event-choice", ENDING_BY_BRANCH[branch]);
    await page.waitForSelector('[data-testid="green-result"]');
    await saveScreenshot(
      page,
      `green-${branch.toLowerCase()}-ending-v110.png`,
      screenshots,
    );
    const ending = await readRun(page);
    assert(
      ending.ended && ending.outcome === "victory",
      `${branch} ending did not settle`,
    );
    assert(
      ending.story.greenTide.rewardSettled,
      `${branch} reward did not settle`,
    );

    if (branch === "CULTIVATE") {
      await installRun(page, preEnding, actions);
      await clickAction(page, actions, "event-choice", "quarantine");
      await page.waitForSelector('[data-testid="green-result"]');
      await saveScreenshot(
        page,
        "green-quarantine-ending-v110.png",
        screenshots,
      );
    }
  } catch (error) {
    await page
      .screenshot({
        path: resolve(branchDirectory, "failure.png"),
        fullPage: true,
      })
      .catch(() => undefined);
    throw error;
  } finally {
    await page.close();
    await context.close();
  }

  const rawVideoPath = await video.path();
  const publicVideoName = `night-train-green-v110-${branch.toLowerCase()}.webm`;
  const publicVideoPath = resolve(videoDirectory, publicVideoName);
  await copyFile(rawVideoPath, publicVideoPath);
  sharedRegistry.push(...screenshots);
  const file = await stat(publicVideoPath);
  return {
    branch,
    endingChoice: ENDING_BY_BRANCH[branch],
    actions,
    checkpoints,
    screenshots,
    compact,
    video: {
      public: `public/assets/video/${publicVideoName}`,
      bytes: file.size,
      sha256: await sha256(publicVideoPath),
    },
  };
}

await Promise.all([
  mkdir(outputDirectory, { recursive: true }),
  mkdir(screenshotDirectory, { recursive: true }),
  mkdir(videoDirectory, { recursive: true }),
  mkdir(qaDirectory, { recursive: true }),
]);

const browser = await chromium.launch({ headless: true });
const screenshotRegistry = [];
const results = [];
try {
  for (const branch of BRANCHES) {
    results.push(await runBranch(browser, branch, screenshotRegistry));
  }
  for (const result of results) {
    result.video.metadata = await inspectVideo(
      browser,
      result.video.public.split("/").at(-1),
    );
    assert(
      result.video.bytes > 50_000,
      `${result.branch} video is unexpectedly small`,
    );
    assert(
      result.video.metadata.width === VIEWPORT.width,
      `${result.branch} video width mismatch`,
    );
    assert(
      result.video.metadata.height === VIEWPORT.height,
      `${result.branch} video height mismatch`,
    );
    assert(
      result.video.metadata.durationSeconds > 10,
      `${result.branch} video is too short`,
    );
  }
} finally {
  await browser.close();
}

const uniqueScreenshots = [...new Set(screenshotRegistry)].sort();
const screenshotHashes = {};
for (const path of uniqueScreenshots) {
  screenshotHashes[path] = await sha256(resolve(path));
}
const report = {
  audit: "R03 Green Tide mobile browser gameplay preview",
  packageVersion: JSON.parse(await readFile(resolve("package.json"), "utf8"))
    .version,
  generatedAt: new Date().toISOString(),
  status: "PASS",
  disclosure:
    "The videos use visible UI controls with disclosed checkpoint injection to demonstrate Cycle, branch, threat, and ending states; they are gameplay previews, not uninterrupted seven-night runs.",
  viewport: VIEWPORT,
  compactViewport: COMPACT_VIEWPORT,
  checks: {
    routeCardVisible: true,
    cycleTapAndTarget: true,
    compactText140: true,
    compactCenterHit: true,
    branchEquipmentVisible: true,
    t013ThenT008: true,
    firstMissNoDamage: true,
    fourEndingsCaptured: true,
    runtimeGptAssetsUsed: true,
  },
  branches: results,
  screenshots: uniqueScreenshots,
  screenshotSha256: screenshotHashes,
};
await writeFile(
  resolve(qaDirectory, "green-story-flow-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(
  JSON.stringify(
    {
      status: report.status,
      branches: results.map((result) => ({
        branch: result.branch,
        ending: result.endingChoice,
        actions: result.actions.length,
        video: result.video,
      })),
      screenshots: uniqueScreenshots.length,
    },
    null,
    2,
  ),
);
