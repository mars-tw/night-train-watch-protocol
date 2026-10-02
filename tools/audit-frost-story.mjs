import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const BRANCHES = ["CARE", "CLEAR", "SUSTAIN"];
const STANDARD_VIEWPORT = { width: 390, height: 844 };
const COMPACT_VIEWPORT = { width: 360, height: 640 };
const COMPACT_TEXT_SCALE = 140;
const FROST_ZONES = ["BERTH", "DEICER", "LOOP"];
const baseUrl = process.env.GAME_URL ?? "http://127.0.0.1:4312";
const outputDirectory = resolve("output/playwright/frost-story");
const publicScreenshotDirectory = resolve("public/assets/screenshots");
const publicVideoDirectory = resolve("public/assets/video");
const publicQaDirectory = resolve("public/assets/qa");

const prepEventIds = {
  1: "EV053",
  3: "EV056",
  5: {
    CARE: "EV058",
    CLEAR: "EV059",
    SUSTAIN: "EV060",
  },
  6: "EV061",
};

const prepStoryChoices = {
  1: "a07-layout",
  3: "ask-repair",
  5: {
    CARE: "open",
    CLEAR: "scrape",
    SUSTAIN: "share-berth",
  },
  6: {
    CARE: "shared",
    CLEAR: "protected",
    SUSTAIN: "a07-plan",
  },
};

const genericTravelEvents = {
  1: { eventId: "EV001", choiceId: "B" },
  3: { eventId: "EV024", choiceId: "B" },
  4: { eventId: "EV001", choiceId: "B" },
  5: { eventId: "EV012", choiceId: "B" },
  6: { eventId: "EV024", choiceId: "B" },
};

const endingChoices = {
  CARE: "joint",
  CLEAR: "shield",
  SUSTAIN: "a07-plan",
};

const branchCarriages = {
  CARE: "sleep",
  CLEAR: "defense",
  SUSTAIN: "greenhouse",
};

const day7Allocations = {
  CARE: { BERTH: 2, DEICER: 3, LOOP: 1 },
  CLEAR: { BERTH: 3, DEICER: 2, LOOP: 1 },
  SUSTAIN: { BERTH: 2, DEICER: 2, LOOP: 2 },
};

const day4ResolutionModes = {
  CARE: "wrong-reveal-retry",
  CLEAR: "wrong-reveal-manual",
  SUSTAIN: "wrong-reveal-retry",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function readOption(name) {
  const inlinePrefix = `${name}=`;
  const inline = process.argv.slice(2).find((argument) => argument.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requestedBranches() {
  const requested = readOption("--branches")
    ?? readOption("--branch")
    ?? process.env.FROST_BRANCHES
    ?? BRANCHES.join(",");
  const branches = [...new Set(requested.split(",").map((branch) => branch.trim().toUpperCase()).filter(Boolean))];
  assert(branches.length > 0, "At least one R02 branch is required");
  for (const branch of branches) {
    assert(BRANCHES.includes(branch), `Unsupported R02 branch ${branch}`);
  }
  return branches;
}

async function retryDomAction(label, action) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const message = errorMessage(error);
      if (
        attempt === 5
        || (!message.includes("not attached to the DOM") && !message.includes("intercepts pointer events"))
      ) {
        throw error;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 60));
    }
  }
  throw lastError ?? new Error(`${label} failed`);
}

async function readSavedRun(page) {
  return JSON.parse((await page.evaluate(() => localStorage.getItem("run.current"))) ?? "{}");
}

async function readSettings(page) {
  return JSON.parse((await page.evaluate(() => localStorage.getItem("settings"))) ?? "{}");
}

async function centerHitTest(page, locator) {
  const box = await locator.boundingBox();
  if (!box) return false;
  const identity = {
    action: await locator.getAttribute("data-action"),
    value: await locator.getAttribute("data-value"),
    heatToken: await locator.getAttribute("data-heat-token"),
  };
  return page.evaluate(({ x, y, identity: expected }) => {
    const hit = document.elementFromPoint(
      Math.max(0, Math.min(window.innerWidth - 1, x)),
      Math.max(0, Math.min(window.innerHeight - 1, y)),
    );
    const actionTarget = hit?.closest("[data-action]");
    if (!actionTarget) return false;
    return (
      actionTarget.getAttribute("data-action") === expected.action
      && actionTarget.getAttribute("data-value") === expected.value
      && actionTarget.getAttribute("data-heat-token") === expected.heatToken
    );
  }, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    identity,
  });
}

async function clickAction(page, actionLog, action, value) {
  const suffix = value === undefined ? "" : `[data-value="${value}"]`;
  const selector = `[data-action="${action}"]${suffix}:not([disabled])`;
  await retryDomAction(`${action}${value ? `:${value}` : ""}`, async () => {
    const target = page.locator(selector).first();
    await target.waitFor({ state: "visible", timeout: 6000 });
    await target.scrollIntoViewIfNeeded();
    assert(await centerHitTest(page, target), `${action}${value ? `:${value}` : ""} is covered at its visual center`);
    await target.click();
  });
  actionLog.push(`${action}${value === undefined ? "" : `:${value}`}`);
  await page.waitForTimeout(120);
}

async function saveScreenshot(page, branchDirectory, outputName, publicName, registry) {
  const outputPath = resolve(branchDirectory, outputName);
  await page.screenshot({ path: outputPath, fullPage: true });
  if (publicName) {
    const publicPath = resolve(publicScreenshotDirectory, publicName);
    await copyFile(outputPath, publicPath);
    registry.push(`public/assets/screenshots/${publicName}`);
  }
  return outputPath;
}

async function auditPrimaryFrostCard(page) {
  const card = page.locator('[data-action="new-game"][data-value="R02"]').first();
  await card.waitFor({ state: "visible", timeout: 5000 });
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  assert(box && box.width >= 48 && box.height >= 48, "R02 primary route card needs a usable touch target");
  assert(await centerHitTest(page, card), "R02 primary route card is covered at its visual center");
  const styles = await card.evaluate((element) => {
    const style = getComputedStyle(element);
    const strong = element.querySelector("strong");
    const detail = element.querySelector("small");
    const relativeLuminance = (rgb) => {
      const channels = rgb.map((value) => {
        const normalized = value / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const light = relativeLuminance([244, 251, 253]);
    const dark = relativeLuminance([9, 14, 18]);
    return {
      className: element.className,
      color: style.color,
      borderColor: style.borderColor,
      backgroundImage: style.backgroundImage,
      textShadow: style.textShadow,
      titleColor: strong ? getComputedStyle(strong).color : undefined,
      detailColor: detail ? getComputedStyle(detail).color : undefined,
      declaredDarkBackdropContrast: (light + 0.05) / (dark + 0.05),
    };
  });
  assert(styles.className.includes("action-button--primary"), "R02 no-save route card must render as the primary action");
  assert(styles.backgroundImage.includes("linear-gradient"), "R02 primary route card needs a dark readability scrim");
  assert(styles.textShadow !== "none", "R02 primary route copy needs a text shadow over artwork");
  assert(styles.declaredDarkBackdropContrast >= 7, "R02 primary route declared foreground/backdrop contrast is below 7:1");
  return {
    ...styles,
    touchTarget: { width: box.width, height: box.height },
    centerHit: true,
  };
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
  assert(settings.textScale === 100, "Baseline text scale must be 100%");
  assert(settings.reducedMotion === false, "Baseline reduced-motion must start disabled");
  assert(settings.noCountdown === true, "No-countdown must be enabled through the settings UI");
  assert(settings.sound === false, "Sound must be disabled through the settings UI");
}

async function waitForInitialNewGameSave(page, timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await page.evaluate(async () => {
      const serialized = await new Promise((resolveRead) => {
        const request = indexedDB.open("night-train-save", 1);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("snapshots", "readonly");
          const read = transaction.objectStore("snapshots").get("run.current");
          read.onsuccess = () => {
            database.close();
            resolveRead(read.result);
          };
          read.onerror = () => {
            database.close();
            resolveRead(undefined);
          };
        };
        request.onerror = () => resolveRead(undefined);
      });
      return typeof serialized === "string" ? JSON.parse(serialized) : serialized;
    });
    if (snapshot?.routeId === "R02" && snapshot?.day === 1 && snapshot?.phase === "prep") {
      return Date.now() - startedAt;
    }
    await page.waitForTimeout(80);
  }
  throw new Error("Initial R02 new-game save did not settle before the disclosed QA fixture");
}

async function waitForEventResolutionSave(page, eventId, timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await page.evaluate(async () => {
      const local = JSON.parse(localStorage.getItem("run.current") ?? "null");
      const indexed = await new Promise((resolveRead) => {
        const request = indexedDB.open("night-train-save", 1);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("snapshots", "readonly");
          const read = transaction.objectStore("snapshots").get("run.current");
          read.onsuccess = () => {
            database.close();
            resolveRead(typeof read.result === "string" ? JSON.parse(read.result) : read.result);
          };
          read.onerror = () => {
            database.close();
            resolveRead(undefined);
          };
        };
        request.onerror = () => resolveRead(undefined);
      });
      return { local, indexed };
    });
    const isResolved = (run) => (
      run?.routeId === "R02"
      && run?.phase === "prep"
      && !run?.activeEventId
      && run?.story?.seenEventIds?.includes(eventId)
    );
    if (isResolved(snapshot.local) && isResolved(snapshot.indexed)) return Date.now() - startedAt;
    await page.waitForTimeout(80);
  }
  throw new Error(`${eventId} resolution did not settle in localStorage and IndexedDB`);
}

async function captureSavedEventCheckpoint(page, eventId, timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await page.evaluate(async (expectedEventId) => {
      const localSerialized = localStorage.getItem("run.current");
      const indexedSerialized = await new Promise((resolveRead) => {
        const request = indexedDB.open("night-train-save", 1);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("snapshots", "readonly");
          const read = transaction.objectStore("snapshots").get("run.current");
          read.onsuccess = () => {
            database.close();
            resolveRead(read.result);
          };
          read.onerror = () => {
            database.close();
            resolveRead(undefined);
          };
        };
        request.onerror = () => resolveRead(undefined);
      });
      const local = typeof localSerialized === "string" ? JSON.parse(localSerialized) : undefined;
      const indexed = typeof indexedSerialized === "string" ? JSON.parse(indexedSerialized) : indexedSerialized;
      return {
        expectedEventId,
        localSerialized,
        indexedSerialized,
        local,
        indexed,
      };
    }, eventId);
    const isCheckpoint = (run) => (
      run?.routeId === "R02"
      && run?.day === 7
      && run?.activeEventId === eventId
      && run?.ended === false
      && !run?.story?.whiteFrost?.finalDecision
      && !run?.story?.whiteFrost?.endingId
    );
    if (
      isCheckpoint(snapshot.local)
      && isCheckpoint(snapshot.indexed)
      && snapshot.localSerialized === snapshot.indexedSerialized
    ) {
      return snapshot.localSerialized;
    }
    await page.waitForTimeout(80);
  }
  throw new Error(`${eventId} pre-decision checkpoint did not settle identically in localStorage and IndexedDB`);
}

async function applyLongRunFixture(page) {
  await page.evaluate(async () => {
    const run = JSON.parse(localStorage.getItem("run.current") ?? "{}");
    Object.assign(run.resources, {
      energy: 100,
      fuel: 60,
      food: 8,
      water: 8,
      parts: 20,
      medicine: 5,
    });
    Object.assign(run.survivor, {
      health: 100,
      sleep: 100,
    });
    Object.assign(run.environment, {
      hull: 100,
      temperature: 18,
    });
    for (const module of run.modules ?? []) {
      module.active = false;
      module.powered = false;
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
}

async function reloadAndContinue(page, actionLog) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".screen--menu", { timeout: 6000 });
  await clickAction(page, actionLog, "continue");
}

async function reloadAndContinueWithInjectedSnapshot(page, actionLog) {
  const injectedSnapshot = await page.evaluate(() => localStorage.getItem("run.current"));
  assert(injectedSnapshot, "Injected QA snapshot is missing before reload");
  await page.evaluate((serialized) => {
    sessionStorage.setItem("qa.pending.run.current", serialized);
  }, injectedSnapshot);
  await page.addInitScript(() => {
    const serialized = sessionStorage.getItem("qa.pending.run.current");
    if (!serialized) return;
    // The app correctly persists its current in-memory object during unload.
    // Restore the disclosed storage-only QA fixture before the next document's
    // application code starts, then remove this one-shot handoff.
    localStorage.setItem("run.current", serialized);
    sessionStorage.removeItem("qa.pending.run.current");
  });
  await reloadAndContinue(page, actionLog);
}

async function installRunCheckpoint(page, serialized) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(async (checkpoint) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("run.current", checkpoint);
    await new Promise((resolveWrite) => {
      const request = indexedDB.open("night-train-save", 1);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("snapshots", "readwrite");
        transaction.objectStore("snapshots").put(checkpoint, "run.current");
        transaction.oncomplete = () => {
          database.close();
          resolveWrite(undefined);
        };
        transaction.onerror = () => resolveWrite(undefined);
      };
      request.onerror = () => resolveWrite(undefined);
    });
  }, serialized);
  const written = await page.evaluate(async () => {
    const local = localStorage.getItem("run.current");
    const indexed = await new Promise((resolveRead) => {
      const request = indexedDB.open("night-train-save", 1);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("snapshots", "readonly");
        const read = transaction.objectStore("snapshots").get("run.current");
        read.onsuccess = () => {
          database.close();
          resolveRead(read.result);
        };
        read.onerror = () => {
          database.close();
          resolveRead(undefined);
        };
      };
      request.onerror = () => resolveRead(undefined);
    });
    return { local, indexed };
  });
  assert(
    written.local === serialized && written.indexed === serialized,
    "Alternate ending checkpoint was not written identically to localStorage and IndexedDB",
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".screen--menu", { timeout: 6000 });
}

function thermalAllocation(run) {
  const allocation = { BERTH: 0, DEICER: 0, LOOP: 0 };
  for (const token of run.story?.whiteFrost?.thermal?.tokens ?? []) {
    if (token.zone in allocation) allocation[token.zone] += 1;
  }
  return allocation;
}

async function moveThermalTokenByTap(page, actionLog, tokenId, targetZone) {
  await clickAction(page, actionLog, "thermal-select", tokenId);
  await clickAction(page, actionLog, "thermal-target", targetZone);
  const run = await readSavedRun(page);
  const token = run.story?.whiteFrost?.thermal?.tokens?.find((candidate) => candidate.id === tokenId);
  assert(token?.zone === targetZone, `${tokenId} tap move to ${targetZone} did not persist`);
}

async function setExactAllocation(page, actionLog, desired) {
  assert(Object.values(desired).reduce((total, value) => total + value, 0) === 6, "Thermal target must total six tokens");
  for (let move = 0; move < 12; move += 1) {
    const run = await readSavedRun(page);
    const current = thermalAllocation(run);
    if (FROST_ZONES.every((zone) => current[zone] === desired[zone])) return current;
    const target = FROST_ZONES.find((zone) => current[zone] < desired[zone]);
    const donor = FROST_ZONES.find((zone) => current[zone] > desired[zone]);
    assert(target && donor, `Cannot rebalance thermal tokens: ${JSON.stringify({ current, desired })}`);
    const token = run.story.whiteFrost.thermal.tokens.find((candidate) => candidate.zone === donor);
    assert(token, `No ${donor} token available for ${target}`);
    await moveThermalTokenByTap(page, actionLog, token.id, target);
  }
  throw new Error(`Thermal allocation did not converge to ${JSON.stringify(desired)}`);
}

async function dragThermalToken(page, actionLog, tokenId, targetZone) {
  let lastError;
  await page.waitForTimeout(260);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const token = page.locator(`[data-heat-token="${tokenId}"]`).first();
      const zone = page.locator(`[data-thermal-zone="${targetZone}"]`).first();
      await token.waitFor({ state: "visible", timeout: 5000 });
      await zone.waitFor({ state: "visible", timeout: 5000 });
      await token.scrollIntoViewIfNeeded();
      const freshToken = page.locator(`[data-heat-token="${tokenId}"]`).first();
      const freshZone = page.locator(`[data-thermal-zone="${targetZone}"]`).first();
      const tokenBox = await freshToken.boundingBox();
      const zoneBox = await freshZone.boundingBox();
      assert(tokenBox && zoneBox, "Pointer drag requires visible token and zone hit boxes");
      const start = { x: tokenBox.x + tokenBox.width / 2, y: tokenBox.y + tokenBox.height / 2 };
      const end = { x: zoneBox.x + zoneBox.width / 2, y: zoneBox.y + zoneBox.height / 2 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 8 });
      await page.mouse.move(end.x, end.y, { steps: 8 });
      await page.mouse.up();
      await page.waitForFunction(({ expectedToken, expectedZone }) => {
        const run = JSON.parse(localStorage.getItem("run.current") ?? "{}");
        return run.story?.whiteFrost?.thermal?.tokens
          ?.find((candidate) => candidate.id === expectedToken)?.zone === expectedZone;
      }, { expectedToken: tokenId, expectedZone: targetZone }, { timeout: 5000 });
      actionLog.push(`pointer-drag:${tokenId}:${targetZone}`);
      return {
        tokenId,
        targetZone,
        start,
        end,
        attempts: attempt,
        persisted: true,
      };
    } catch (error) {
      lastError = error;
      const run = await readSavedRun(page).catch(() => undefined);
      const zone = run?.story?.whiteFrost?.thermal?.tokens
        ?.find((candidate) => candidate.id === tokenId)?.zone;
      if (zone === targetZone) {
        actionLog.push(`pointer-drag:${tokenId}:${targetZone}`);
        return { tokenId, targetZone, attempts: attempt, persisted: true };
      }
      await page.mouse.up().catch(() => undefined);
      if (attempt < 5) await page.waitForTimeout(140);
    }
  }
  throw lastError ?? new Error(`${tokenId} pointer drag to ${targetZone} failed`);
}

async function openThermalDrawer(page, actionLog) {
  const open = page.locator('.screen--carriage.is-prep[data-panel="power"] [data-testid="thermal-board"]').first();
  if (await open.count()) return;
  await clickAction(page, actionLog, "power");
  await page.waitForSelector('.screen--carriage.is-prep[data-panel="power"] [data-testid="thermal-board"]');
}

async function closeThermalDrawer(page, actionLog) {
  if (await page.locator('.screen--carriage.is-prep[data-panel="power"]').count()) {
    await clickAction(page, actionLog, "power");
  }
}

async function chooseEvent(page, actionLog, eventId, choiceId) {
  await page.waitForSelector(`[data-event-id="${eventId}"]`, { timeout: 7000 });
  const enabled = page.locator(
    `[data-event-id="${eventId}"] [data-action="event-choice"][data-value="${choiceId}"]:not([disabled])`,
  );
  assert(await enabled.count() === 1, `${eventId}:${choiceId} must be visibly enabled`);
  await clickAction(page, actionLog, "event-choice", choiceId);
}

async function waitForContactAdvance(page, contactId) {
  await page.waitForFunction((previousContactId) => {
    const run = JSON.parse(localStorage.getItem("run.current") ?? "{}");
    return run.phase !== "night" || !run.activeContact || run.activeContact.id !== previousContactId;
  }, contactId, { timeout: 7000 });
}

async function resolveStandardContact(page, actionLog, evidence) {
  const before = await readSavedRun(page);
  const contact = before.activeContact;
  assert(contact, "Night contact is missing");
  const button = page.locator('.emergency-actions [data-action="counter"]:not([disabled])').first();
  await button.waitFor({ state: "visible", timeout: 5000 });
  const value = await button.getAttribute("data-value");
  assert(value, `${contact.definitionId} has no usable visible counter value`);
  await clickAction(page, actionLog, "counter", value);
  await waitForContactAdvance(page, contact.id);
  evidence.push({
    day: before.day,
    wave: contact.wave,
    totalWaves: contact.totalWaves,
    threatId: contact.definitionId,
    action: value,
  });
}

async function setCompactAccessibilityFromMenu(page, actionLog) {
  await clickAction(page, actionLog, "settings");
  await clickAction(page, actionLog, "cycle-text");
  await clickAction(page, actionLog, "cycle-text");
  await clickAction(page, actionLog, "toggle-motion");
  await clickAction(page, actionLog, "menu");
  const settings = await readSettings(page);
  assert(settings.textScale === COMPACT_TEXT_SCALE, "Compact checkpoint must use 140% text");
  assert(settings.reducedMotion === true, "Compact checkpoint must enable reduced-motion");
}

async function restoreStandardAccessibilityFromMenu(page, actionLog) {
  await clickAction(page, actionLog, "settings");
  await clickAction(page, actionLog, "cycle-text");
  await clickAction(page, actionLog, "toggle-motion");
  await clickAction(page, actionLog, "menu");
  const settings = await readSettings(page);
  assert(settings.textScale === 100, "Standard checkpoint must restore 100% text");
  assert(settings.reducedMotion === false, "Standard checkpoint must restore motion");
}

async function auditCompactThermalDrawer(page, actionLog, branchDirectory, screenshotRegistry) {
  await page.setViewportSize(COMPACT_VIEWPORT);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".screen--menu");
  await setCompactAccessibilityFromMenu(page, actionLog);
  await clickAction(page, actionLog, "continue");
  await page.waitForSelector(".screen--carriage.is-prep");
  await openThermalDrawer(page, actionLog);

  const metrics = await page.evaluate(() => {
    const app = document.querySelector("#app");
    const board = document.querySelector('.screen--carriage.is-prep [data-testid="thermal-board"]');
    const actionBar = board?.querySelector(".thermal-board__actions");
    const boardRectangle = board?.getBoundingClientRect();
    const actionStyle = actionBar ? getComputedStyle(actionBar) : undefined;
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      textScale: Number.parseFloat(getComputedStyle(app ?? document.documentElement).getPropertyValue("--text-scale")),
      horizontalOverflow: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
        app?.scrollWidth ?? 0,
      ) - window.innerWidth,
      reducedMotionClass: app?.classList.contains("reduce-motion") ?? false,
      boardBounds: boardRectangle
        ? { left: boardRectangle.left, right: boardRectangle.right, width: boardRectangle.width }
        : undefined,
      actionBarPosition: actionStyle?.position,
      actionBarBottom: actionStyle?.bottom,
      actionBarZIndex: actionStyle?.zIndex,
    };
  });
  assert(metrics.viewport.width === 360 && metrics.viewport.height === 640, "Compact thermal drawer viewport must be 360x640");
  assert(Math.abs(metrics.textScale - 1.4) < 0.01, "Compact thermal drawer must render at 140% text");
  assert(metrics.horizontalOverflow <= 1, `Compact thermal drawer has ${metrics.horizontalOverflow}px horizontal overflow`);
  assert(metrics.reducedMotionClass, "Compact thermal drawer must retain reduced-motion");
  assert(
    metrics.boardBounds && metrics.boardBounds.left >= -1 && metrics.boardBounds.right <= COMPACT_VIEWPORT.width + 1,
    "Compact thermal drawer extends outside the viewport",
  );
  assert(metrics.actionBarPosition === "sticky", `Thermal reset/commit bar must be sticky, received ${metrics.actionBarPosition}`);

  const controls = [];
  for (const action of ["thermal-reset", "thermal-commit"]) {
    const target = page.locator(`[data-testid="thermal-board"] [data-action="${action}"]:not([disabled])`).first();
    await target.waitFor({ state: "visible", timeout: 5000 });
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    assert(box, `${action} has no compact hit box`);
    assert(box.width >= 48 && box.height >= 48, `${action} is ${box.width}x${box.height}; expected at least 48x48`);
    assert(box.x >= -1 && box.x + box.width <= COMPACT_VIEWPORT.width + 1, `${action} extends outside compact width`);
    assert(box.y >= -1 && box.y + box.height <= COMPACT_VIEWPORT.height + 1, `${action} is hidden behind the bottom dock`);
    assert(await centerHitTest(page, target), `${action} is covered at its compact visual center`);
    controls.push({
      action,
      width: Math.round(box.width * 100) / 100,
      height: Math.round(box.height * 100) / 100,
      bounds: box,
      centerHit: true,
    });
  }
  await saveScreenshot(
    page,
    branchDirectory,
    "day1-thermal-drawer-360x640-text140.png",
    "frost-thermal-drawer-360x640-text140-v100.png",
    screenshotRegistry,
  );
  await closeThermalDrawer(page, actionLog);
  await page.setViewportSize(STANDARD_VIEWPORT);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".screen--menu");
  await restoreStandardAccessibilityFromMenu(page, actionLog);
  await clickAction(page, actionLog, "continue");
  await page.waitForSelector(".screen--carriage.is-prep");
  return { ...metrics, controls };
}

async function auditCompactT009(page) {
  const metrics = await page.evaluate(() => {
    const app = document.querySelector("#app");
    const root = document.querySelector('[data-testid="threat-interaction"][data-threat-id="T009"]');
    const cue = root?.querySelector(".frost-static-cue.has-reveal");
    const cueStyle = cue ? getComputedStyle(cue) : undefined;
    const token = root?.querySelector(".heat-token");
    const tokenStyle = token ? getComputedStyle(token) : undefined;
    const horizontalOverflow = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
      app?.scrollWidth ?? 0,
    ) - window.innerWidth;
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      textScale: Number.parseFloat(getComputedStyle(app ?? document.documentElement).getPropertyValue("--text-scale")),
      horizontalOverflow,
      reducedMotionClass: app?.classList.contains("reduce-motion") ?? false,
      revealCue: Boolean(cue),
      revealedZoneCount: root?.querySelectorAll(".thermal-zone.is-required").length ?? 0,
      cueOutlineStyle: cueStyle?.outlineStyle,
      cueOutlineWidth: cueStyle?.outlineWidth,
      tokenTransitionDuration: tokenStyle?.transitionDuration,
      rootBounds: root ? (() => {
        const rectangle = root.getBoundingClientRect();
        return { left: rectangle.left, right: rectangle.right, width: rectangle.width };
      })() : undefined,
    };
  });
  assert(metrics.viewport.width === 360 && metrics.viewport.height === 640, "Compact T009 viewport must be 360x640");
  assert(Math.abs(metrics.textScale - 1.4) < 0.01, "Compact T009 must render at 140% text scale");
  assert(metrics.horizontalOverflow <= 1, `Compact T009 has ${metrics.horizontalOverflow}px horizontal overflow`);
  assert(metrics.reducedMotionClass, "Compact T009 is missing the reduced-motion class");
  assert(metrics.revealCue && metrics.revealedZoneCount === 2, "Compact T009 must retain its static first-miss reveal");
  assert(metrics.cueOutlineStyle !== "none" && metrics.cueOutlineWidth !== "0px", "Reduced-motion T009 needs a static outline cue");
  assert(metrics.tokenTransitionDuration === "0s", "Reduced-motion thermal tokens must not animate");
  assert(
    metrics.rootBounds && metrics.rootBounds.left >= -1 && metrics.rootBounds.right <= COMPACT_VIEWPORT.width + 1,
    "Compact T009 panel extends outside the viewport",
  );

  const targets = page.locator('[data-testid="threat-interaction"][data-threat-id="T009"] button:not([disabled])');
  const targetCount = await targets.count();
  const touchTargets = [];
  for (let index = 0; index < targetCount; index += 1) {
    const target = targets.nth(index);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    const label = `${await target.getAttribute("data-action")}:${await target.getAttribute("data-value") ?? index}`;
    assert(box, `${label} has no compact hit box`);
    assert(box.width >= 48 && box.height >= 48, `${label} is ${box.width}x${box.height}; expected at least 48x48`);
    assert(box.x >= -1 && box.x + box.width <= COMPACT_VIEWPORT.width + 1, `${label} is outside compact viewport width`);
    assert(await centerHitTest(page, target), `${label} is covered at its compact visual center`);
    touchTargets.push({
      label,
      width: Math.round(box.width * 100) / 100,
      height: Math.round(box.height * 100) / 100,
      centerHit: true,
    });
  }
  return { ...metrics, touchTargets };
}

async function reloadAfterFirstMiss(page, actionLog, branch, contactBefore, branchDirectory, screenshotRegistry) {
  if (branch === "CARE") await page.setViewportSize(COMPACT_VIEWPORT);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".screen--menu");
  if (branch === "CARE") await setCompactAccessibilityFromMenu(page, actionLog);
  await clickAction(page, actionLog, "continue");
  await page.waitForSelector('[data-testid="threat-interaction"][data-threat-id="T009"]');

  const afterReload = await readSavedRun(page);
  const interaction = afterReload.activeContact?.interaction;
  assert(afterReload.activeContact?.id === contactBefore.id, "T009 contact changed across first-miss reload");
  assert(interaction?.firstMissRevealed === true && interaction.attempts === 1, "T009 first miss did not persist across reload");

  let compact;
  if (branch === "CARE") {
    compact = await auditCompactT009(page);
    await saveScreenshot(
      page,
      branchDirectory,
      "day4-t009-first-miss-360x640-text140.png",
      "frost-t009-first-miss-360x640-text140-v100.png",
      screenshotRegistry,
    );
    await page.setViewportSize(STANDARD_VIEWPORT);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".screen--menu");
    await restoreStandardAccessibilityFromMenu(page, actionLog);
    await clickAction(page, actionLog, "continue");
    await page.waitForSelector('[data-testid="threat-interaction"][data-threat-id="T009"]');
  }
  return {
    checkpoint: "T009-first-miss",
    contactId: contactBefore.id,
    attempts: 1,
    revealPersisted: true,
    fastReloadAfterUi: true,
    compact,
  };
}

async function resolveDay4T009(page, actionLog, branch, branchDirectory, screenshotRegistry) {
  const run = await readSavedRun(page);
  const contact = run.activeContact;
  assert(contact?.definitionId === "T009", `Day 4 ${branch} must expose T009`);
  const requiredZones = contact.interaction?.requiredZones ?? [];
  assert(requiredZones.length === 2, "Day 4 T009 must persist two required zones");
  const nonRequired = FROST_ZONES.find((zone) => !requiredZones.includes(zone));
  assert(nonRequired, "Day 4 T009 must have a non-required inspection target");

  await clickAction(page, actionLog, "threat-interact", `frost:inspect:${nonRequired}`);
  await clickAction(page, actionLog, "threat-interact", "frost:confirm");
  const firstMissRun = await readSavedRun(page);
  const firstMiss = firstMissRun.activeContact?.interaction;
  assert(firstMiss?.firstMissRevealed === true, "Day 4 T009 wrong route must reveal the required zones");
  assert(firstMiss?.attempts === 1, "Day 4 T009 first miss must count exactly once");
  assert(firstMissRun.environment.hull === run.environment.hull, "First miss must not damage hull");
  assert(firstMissRun.survivor.health === run.survivor.health, "First miss must not damage survivor health");
  await saveScreenshot(
    page,
    branchDirectory,
    "day4-t009-first-miss.png",
    `frost-${branch.toLowerCase()}-t009-first-miss-v100.png`,
    screenshotRegistry,
  );

  const reloadCheckpoint = await reloadAfterFirstMiss(
    page,
    actionLog,
    branch,
    contact,
    branchDirectory,
    screenshotRegistry,
  );
  const mode = day4ResolutionModes[branch];
  const beforeResolution = await readSavedRun(page);
  if (mode === "wrong-reveal-manual") {
    await clickAction(page, actionLog, "threat-interact", "frost:manual-scrape");
  } else {
    for (const zone of requiredZones) {
      await clickAction(page, actionLog, "threat-interact", `frost:inspect:${zone}`);
    }
    await clickAction(page, actionLog, "threat-interact", "frost:confirm");
  }
  await waitForContactAdvance(page, contact.id);
  const afterResolution = await readSavedRun(page);
  assert(afterResolution.phase !== "night", `Day 4 ${branch} T009 did not resolve through visible controls`);
  return {
    day: 4,
    threatId: "T009",
    contactId: contact.id,
    requiredZones,
    wrongInspection: nonRequired,
    firstMiss: {
      attempts: 1,
      reveal: true,
      hullDelta: firstMissRun.environment.hull - run.environment.hull,
      healthDelta: firstMissRun.survivor.health - run.survivor.health,
    },
    mode,
    resolvedBy: mode.endsWith("manual") ? "manual-scrape" : "thermal",
    manualHullDelta: afterResolution.environment.hull - beforeResolution.environment.hull,
    reloadCheckpoint,
  };
}

async function resolveDay7T009(page, actionLog) {
  const before = await readSavedRun(page);
  const contact = before.activeContact;
  assert(contact?.definitionId === "T009", "Day 7 finale must expose T009");
  const requiredZones = contact.interaction?.requiredZones ?? [];
  assert(requiredZones.length === 2, "Day 7 T009 must persist two required zones");
  for (const zone of requiredZones) {
    await clickAction(page, actionLog, "threat-interact", `frost:inspect:${zone}`);
  }
  const allocation = await setExactAllocation(page, actionLog, { BERTH: 2, DEICER: 2, LOOP: 2 });
  await clickAction(page, actionLog, "threat-interact", "frost:confirm");
  await waitForContactAdvance(page, contact.id);
  const after = await readSavedRun(page);
  assert(after.phase === "travel" && after.activeEventId === "EV064", "Day 7 T009 must advance visibly to EV064");
  return {
    day: 7,
    threatId: "T009",
    contactId: contact.id,
    requiredZones,
    inspectedZones: requiredZones,
    allocation,
    resolvedBy: "thermal",
  };
}

async function resolveNight(
  page,
  actionLog,
  branch,
  day,
  branchDirectory,
  screenshotRegistry,
  contactEvidence,
) {
  let day4T009;
  let day7T009;
  while (true) {
    const run = await readSavedRun(page);
    if (run.phase !== "night") break;
    const contact = run.activeContact;
    assert(contact, `Day ${day} night is missing an active contact`);
    if (contact.definitionId === "T009" && day === 4) {
      day4T009 = await resolveDay4T009(
        page,
        actionLog,
        branch,
        branchDirectory,
        screenshotRegistry,
      );
      contactEvidence.push(day4T009);
    } else if (contact.definitionId === "T009" && day === 7) {
      day7T009 = await resolveDay7T009(page, actionLog);
      contactEvidence.push(day7T009);
    } else {
      await resolveStandardContact(page, actionLog, contactEvidence);
    }
  }
  return { day4T009, day7T009 };
}

async function reloadAfterBranchChoice(page, actionLog, branch) {
  const before = await readSavedRun(page);
  assert(before.story.whiteFrost.branch === branch, `${branch} was not persisted after EV057`);
  assert(before.phase === "route", `EV057 ${branch} must visibly return to Day 4 route selection`);
  assert(!before.activeEventId, `EV057 ${branch} must clear its active event before route selection`);
  assert(!before.activeContact, `EV057 ${branch} must not start a night contact before a route is chosen`);
  await reloadAndContinue(page, actionLog);
  await page.waitForSelector(".screen--route", { timeout: 7000 });
  const after = await readSavedRun(page);
  assert(after.story.whiteFrost.branch === branch, `${branch} changed across EV057 reload`);
  assert(after.phase === "route", `EV057 ${branch} reload must resume on route selection`);
  assert(!after.activeEventId, `EV057 ${branch} reload unexpectedly reactivated EV057`);
  assert(!after.activeContact, `EV057 ${branch} reload unexpectedly started a night contact`);
  return {
    checkpoint: "EV057",
    branch,
    phase: after.phase,
    fastReloadAfterUi: true,
    persisted: true,
  };
}

async function captureBranchCarriage(page, actionLog, branch, branchDirectory, screenshotRegistry) {
  const carriage = branchCarriages[branch];
  await clickAction(page, actionLog, "select-carriage", carriage);
  const overlay = page.locator(`.frost-route-overlay[data-frost-branch="${branch}"]`);
  await overlay.waitFor({ state: "visible", timeout: 5000 });
  const screenCarriage = await page.locator(".screen--carriage").getAttribute("data-carriage");
  assert(screenCarriage === carriage, `${branch} overlay must be visible in ${carriage}`);
  await saveScreenshot(
    page,
    branchDirectory,
    `day5-${branch.toLowerCase()}-carriage.png`,
    `frost-${branch.toLowerCase()}-carriage-v100.png`,
    screenshotRegistry,
  );
}

async function prepareDay7Thermal(page, actionLog, branch, branchDirectory, screenshotRegistry) {
  await clickAction(page, actionLog, "route");
  await clickAction(page, actionLog, "select-route", "RN01");
  await clickAction(page, actionLog, "confirm-route", "RN01");
  await page.waitForSelector('[data-event-id="EV063"]', { timeout: 7000 });
  await chooseEvent(page, actionLog, "EV063", "thermal-board");
  await page.waitForSelector(
    '.screen--carriage.is-prep[data-panel="power"] [data-testid="thermal-board"]',
    { timeout: 7000 },
  );
  const returnedToBoard = await readSavedRun(page);
  assert(returnedToBoard.phase === "prep" && !returnedToBoard.activeEventId, `${branch} EV063 must visibly return to prep thermal board`);
  const allocation = await setExactAllocation(page, actionLog, day7Allocations[branch]);
  await saveScreenshot(
    page,
    branchDirectory,
    `day7-${branch.toLowerCase()}-thermal.png`,
    `frost-${branch.toLowerCase()}-thermal-day7-v100.png`,
    screenshotRegistry,
  );
  await clickAction(page, actionLog, "thermal-commit");
  const committed = await readSavedRun(page);
  assert(committed.story.whiteFrost.thermal.committedDay === 7, `${branch} Day 7 thermal commit did not persist`);
  assert(committed.phase === "travel" && committed.activeEventId === "EV063", `${branch} Day 7 commit must open EV063`);
  await page.waitForSelector('[data-event-id="EV063"]', { timeout: 7000 });
  return {
    allocation,
    returnedToBoardViaEventChoice: true,
    returnedToEventAfterCommit: true,
    committedDay: committed.story.whiteFrost.thermal.committedDay,
    settlementIds: committed.story.whiteFrost.thermal.settlementIds,
  };
}

async function inspectVideo(browser, publicName) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    const metadata = await page.evaluate(async (url) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = url;
      document.body.append(video);
      await new Promise((resolveMetadata, rejectMetadata) => {
        const timeout = window.setTimeout(() => rejectMetadata(new Error("video metadata timeout")), 15000);
        video.addEventListener("loadedmetadata", () => {
          window.clearTimeout(timeout);
          resolveMetadata(undefined);
        }, { once: true });
        video.addEventListener("error", () => {
          window.clearTimeout(timeout);
          rejectMetadata(new Error(`video error ${video.error?.code ?? "unknown"}`));
        }, { once: true });
      });
      return {
        durationSeconds: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
    }, `${baseUrl}/assets/video/${publicName}`);
    assert(metadata.durationSeconds > 0, `${publicName} has no playable duration`);
    assert(metadata.width > 0 && metadata.height > 0, `${publicName} has no video dimensions`);
    return metadata;
  } finally {
    await context.close();
  }
}

function rectanglesOverlap(left, right) {
  return (
    left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
  );
}

async function auditEmergencyRouteViewport(page, actionLog, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(220);
  await page.waitForSelector(".screen--route.has-emergency-route", { timeout: 7000 });
  const routeMap = page.locator(".route-map").first();
  const routeSummary = page.locator(".route-summary").first();
  const routeEmergency = page.locator(".route-emergency").first();
  const nodeEvidence = [];

  for (const nodeId of ["RN01", "RN02", "RN03"]) {
    const node = page.locator(`[data-action="select-route"][data-value="${nodeId}"]`).first();
    await node.waitFor({ state: "visible", timeout: 5000 });
    await node.scrollIntoViewIfNeeded();
    const nodeBox = await node.boundingBox();
    const mapBox = await routeMap.boundingBox();
    const summaryBox = await routeSummary.boundingBox();
    const emergencyBox = await routeEmergency.boundingBox();
    assert(nodeBox, `${nodeId} has no visible route-node rectangle at ${viewport.width}x${viewport.height}`);
    assert(mapBox, `Route map has no rectangle at ${viewport.width}x${viewport.height}`);
    assert(summaryBox, `Route summary has no rectangle at ${viewport.width}x${viewport.height}`);
    assert(emergencyBox, `Emergency route panel has no rectangle at ${viewport.width}x${viewport.height}`);
    assert(
      nodeBox.width >= 48 && nodeBox.height >= 48,
      `${nodeId} is ${nodeBox.width}x${nodeBox.height} at ${viewport.width}x${viewport.height}; expected at least 48x48`,
    );
    assert(
      nodeBox.x >= mapBox.x
      && nodeBox.y >= mapBox.y
      && nodeBox.x + nodeBox.width <= mapBox.x + mapBox.width
      && nodeBox.y + nodeBox.height <= mapBox.y + mapBox.height,
      `${nodeId} is clipped by route-map at ${viewport.width}x${viewport.height}`,
    );
    assert(
      !rectanglesOverlap(nodeBox, summaryBox),
      `${nodeId} overlaps route-summary at ${viewport.width}x${viewport.height}`,
    );
    assert(
      !rectanglesOverlap(nodeBox, emergencyBox),
      `${nodeId} overlaps route-emergency at ${viewport.width}x${viewport.height}`,
    );
    assert(
      await centerHitTest(page, node),
      `${nodeId} is covered at its visual center at ${viewport.width}x${viewport.height}`,
    );

    const expectedSummary = (await node.locator("small").textContent())?.trim();
    assert(expectedSummary, `${nodeId} is missing its visible route label`);
    await clickAction(page, actionLog, "select-route", nodeId);
    const actualSummary = (await routeSummary.locator(":scope > div > strong").textContent())?.trim();
    assert(
      actualSummary === expectedSummary,
      `${nodeId} summary did not update after visible click at ${viewport.width}x${viewport.height}`,
    );
    const confirmation = page.locator(
      `[data-action="confirm-route"][data-value="${nodeId}"]`,
    ).first();
    await confirmation.waitFor({ state: "visible", timeout: 5000 });
    assert(await confirmation.isDisabled(), `${nodeId} confirm must be disabled at fuel 0`);
    nodeEvidence.push({
      nodeId,
      label: expectedSummary,
      summary: actualSummary,
      disabled: true,
      centerHit: true,
      width: nodeBox.width,
      height: nodeBox.height,
      overlapsSummary: false,
      overlapsEmergency: false,
    });
  }

  const layout = await page.evaluate(() => {
    const app = document.querySelector("#app");
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      horizontalOverflow: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
        app?.scrollWidth ?? 0,
      ) - window.innerWidth,
    };
  });
  assert(
    layout.viewport.width === viewport.width && layout.viewport.height === viewport.height,
    `Emergency route audit viewport expected ${viewport.width}x${viewport.height}`,
  );
  assert(layout.horizontalOverflow <= 1, `Emergency route UI has ${layout.horizontalOverflow}px horizontal overflow`);

  const emergencyButton = page.locator('[data-action="emergency-route"]:not([disabled])').first();
  await emergencyButton.waitFor({ state: "visible", timeout: 5000 });
  await emergencyButton.scrollIntoViewIfNeeded();
  const emergencyButtonBox = await emergencyButton.boundingBox();
  assert(emergencyButtonBox, `Emergency route button has no hit box at ${viewport.width}x${viewport.height}`);
  assert(
    emergencyButtonBox.width >= 48 && emergencyButtonBox.height >= 48,
    `Emergency route button is ${emergencyButtonBox.width}x${emergencyButtonBox.height}; expected at least 48x48`,
  );
  assert(
    await centerHitTest(page, emergencyButton),
    `Emergency route button is covered at its visual center at ${viewport.width}x${viewport.height}`,
  );

  return {
    ...layout,
    textScale: (await readSettings(page)).textScale,
    nodes: nodeEvidence,
    emergencyButton: {
      centerHit: true,
      width: emergencyButtonBox.width,
      height: emergencyButtonBox.height,
    },
  };
}

async function runEmergencyRouteAudit(browser) {
  const auditDirectory = resolve(outputDirectory, "emergency-route");
  await mkdir(auditDirectory, { recursive: true });
  const actionLog = [];
  const screenshotRegistry = [];
  const browserErrors = [];
  const context = await browser.newContext({
    viewport: COMPACT_VIEWPORT,
    locale: "zh-TW",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });

  try {
    await resetBrowserState(page, actionLog);
    await setCompactAccessibilityFromMenu(page, actionLog);
    await clickAction(page, actionLog, "new-game", "R02");
    await waitForInitialNewGameSave(page);
    await chooseEvent(page, actionLog, "EV053", "a07-layout");
    await page.waitForSelector(".screen--carriage.is-prep", { timeout: 7000 });
    await waitForEventResolutionSave(page, "EV053");

    await page.evaluate(async () => {
      const run = JSON.parse(localStorage.getItem("run.current") ?? "{}");
      run.day = 2;
      run.phase = "route";
      run.resources.fuel = 0;
      run.environment.hull = 100;
      run.environment.temperature = 12;
      run.survivor.sleep = 100;
      run.survivor.stress = 20;
      run.activeEventId = undefined;
      run.activeContact = undefined;
      run.selectedRouteNodeId = undefined;
      run.ended = false;
      run.outcome = "active";
      run.story.seenEventIds = [...new Set([...(run.story.seenEventIds ?? []), "EV055"])];
      run.lastMessage = "QA：低燃料路線真點驗收。";
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

    await reloadAndContinueWithInjectedSnapshot(page, actionLog);
    await page.waitForSelector(".screen--route.has-emergency-route", { timeout: 7000 });
    const injectedRun = await readSavedRun(page);
    assert(
      injectedRun.day === 2
      && injectedRun.phase === "route"
      && injectedRun.resources.fuel === 0
      && !injectedRun.activeEventId,
      "Low-fuel route fixture did not resume in the disclosed Day 2 route state",
    );

    const compactLayout = await auditEmergencyRouteViewport(page, actionLog, COMPACT_VIEWPORT);
    await saveScreenshot(
      page,
      auditDirectory,
      "frost-emergency-route-360x640-v100.png",
      "frost-emergency-route-360x640-v100.png",
      screenshotRegistry,
    );
    const standardLayout = await auditEmergencyRouteViewport(page, actionLog, STANDARD_VIEWPORT);
    await saveScreenshot(
      page,
      auditDirectory,
      "frost-emergency-route-390x844-v100.png",
      undefined,
      screenshotRegistry,
    );

    await clickAction(page, actionLog, "emergency-route");
    await page.waitForFunction(() => {
      const run = JSON.parse(localStorage.getItem("run.current") ?? "{}");
      return run.phase === "travel" && run.selectedRouteNodeId === "RN01";
    }, undefined, { timeout: 7000 });
    const after = await readSavedRun(page);
    assert(after.resources.fuel === 0, "Emergency route must not create or spend fuel");
    assert(after.environment.hull === 94, `Emergency route hull expected 94, received ${after.environment.hull}`);
    assert(after.environment.temperature === 9, `Emergency route temperature expected 9, received ${after.environment.temperature}`);
    assert(after.survivor.sleep === 92, `Emergency route sleep expected 92, received ${after.survivor.sleep}`);
    assert(after.survivor.stress === 28, `Emergency route stress expected 28, received ${after.survivor.stress}`);
    assert(browserErrors.length === 0, `Emergency route browser errors: ${browserErrors.join(" | ")}`);

    return {
      status: "passed",
      disclosedFixture: {
        day: 2,
        phase: "route",
        fuel: 0,
        activeEventId: null,
        seenEventAdded: "EV055",
        baseline: { hull: 100, temperature: 12, sleep: 100, stress: 20 },
      },
      viewports: [compactLayout, standardLayout],
      result: {
        selectedRouteNodeId: after.selectedRouteNodeId,
        phase: after.phase,
        fuel: after.resources.fuel,
        hull: after.environment.hull,
        temperature: after.environment.temperature,
        sleep: after.survivor.sleep,
        stress: after.survivor.stress,
      },
      actionLog,
      browserErrors,
      screenshots: screenshotRegistry,
    };
  } catch (error) {
    const failure = {
      status: "failed",
      error: errorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      url: page.url(),
      actionLog,
      browserErrors,
      run: await readSavedRun(page).catch(() => undefined),
      diagnosticDirectory: "output/playwright/frost-story/emergency-route",
    };
    await page.screenshot({ path: resolve(auditDirectory, "failure.png"), fullPage: true }).catch(() => undefined);
    await writeFile(
      resolve(auditDirectory, "failure-state.json"),
      `${JSON.stringify(failure, null, 2)}\n`,
      "utf8",
    );
    return failure;
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function auditEmergencyShelterAlternate(
  browser,
  serializedCheckpoint,
  branchDirectory,
  screenshotRegistry,
) {
  const actionLog = [];
  const browserErrors = [];
  const context = await browser.newContext({
    viewport: STANDARD_VIEWPORT,
    locale: "zh-TW",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });

  try {
    const checkpoint = JSON.parse(serializedCheckpoint);
    const checkpointRewardEntries = checkpoint.ledger
      .filter((entry) => entry.source === "story.R02.route-complete").length;
    assert(checkpoint.routeId === "R02", "Alternate ending checkpoint must remain on R02");
    assert(checkpoint.day === 7 && checkpoint.activeEventId === "EV065", "Alternate ending checkpoint must be the natural Day 7 EV065 decision");
    assert(checkpoint.story.whiteFrost.branch === "CARE", "Alternate ending checkpoint must originate from the CARE branch");
    assert(!checkpoint.story.whiteFrost.finalDecision, "Alternate ending checkpoint already has a final decision");
    assert(!checkpoint.story.whiteFrost.endingId && checkpoint.ended === false, "Alternate ending checkpoint is already ended");
    assert(checkpointRewardEntries === 0, "Alternate ending checkpoint already contains a route completion reward");

    await installRunCheckpoint(page, serializedCheckpoint);
    await clickAction(page, actionLog, "continue");
    await page.waitForSelector('[data-event-id="EV065"]', { timeout: 7000 });
    const restored = await readSavedRun(page);
    assert(
      JSON.stringify(restored) === JSON.stringify(checkpoint),
      "Fresh alternate context changed the authoritative EV065 checkpoint before the visible choice",
    );

    await chooseEvent(page, actionLog, "EV065", "emergency-stop");
    await page.waitForSelector(".screen--result.is-ending", { timeout: 7000 });
    const endingBeforeReload = await readSavedRun(page);
    const rewardEntriesBeforeReload = endingBeforeReload.ledger
      .filter((entry) => entry.source === "story.R02.route-complete").length;
    assert(endingBeforeReload.routeId === "R02" && endingBeforeReload.day === 7, "Emergency shelter ending left R02 Day 7");
    assert(endingBeforeReload.story.whiteFrost.branch === "CARE", "Emergency shelter ending changed the CARE branch");
    assert(
      endingBeforeReload.story.whiteFrost.finalDecision === "emergency-stop",
      "Emergency shelter alternate choice did not persist finalDecision=emergency-stop",
    );
    assert(
      endingBeforeReload.story.whiteFrost.endingId === "frost-emergency-shelter",
      "Emergency shelter alternate choice did not persist endingId=frost-emergency-shelter",
    );
    assert(endingBeforeReload.ended === true, "Emergency shelter alternate choice did not end the run");
    assert(rewardEntriesBeforeReload === 1, "Emergency shelter completion reward must settle exactly once");

    await reloadAndContinue(page, actionLog);
    await page.waitForSelector(".screen--result.is-ending", { timeout: 7000 });
    const endingAfterReload = await readSavedRun(page);
    const rewardEntriesAfterReload = endingAfterReload.ledger
      .filter((entry) => entry.source === "story.R02.route-complete").length;
    assert(
      endingAfterReload.story.whiteFrost.finalDecision === "emergency-stop"
      && endingAfterReload.story.whiteFrost.endingId === "frost-emergency-shelter"
      && endingAfterReload.ended === true,
      "Emergency shelter ending changed across reload",
    );
    assert(
      rewardEntriesAfterReload === 1 && rewardEntriesAfterReload === rewardEntriesBeforeReload,
      "Emergency shelter ending reload duplicated the route reward",
    );
    assert(browserErrors.length === 0, `Emergency shelter browser errors: ${browserErrors.join(" | ")}`);

    const publicScreenshot = "public/assets/screenshots/frost-emergency-shelter-ending-v100.png";
    await saveScreenshot(
      page,
      branchDirectory,
      "day7-care-emergency-shelter-ending.png",
      "frost-emergency-shelter-ending-v100.png",
      screenshotRegistry,
    );

    return {
      status: "passed",
      viewport: STANDARD_VIEWPORT,
      alternateChoiceCheckpoint: {
        source: "CARE natural Day 7 EV065 pre-decision save",
        eventId: "EV065",
        storage: [
          "localStorage:run.current",
          "IndexedDB:night-train-save/snapshots/run.current",
        ],
        serializedBytes: Buffer.byteLength(serializedCheckpoint, "utf8"),
        authoritativeValuesChangedBeforeChoice: false,
        copiedWithoutMutation: true,
      },
      finalDecision: endingAfterReload.story.whiteFrost.finalDecision,
      endingId: endingAfterReload.story.whiteFrost.endingId,
      ended: endingAfterReload.ended,
      rewardEntriesBeforeReload,
      rewardEntriesAfterReload,
      rewardSettledExactlyOnce: rewardEntriesAfterReload === 1,
      actionLog,
      browserErrors,
      screenshot: publicScreenshot,
    };
  } catch (error) {
    await page.screenshot({
      path: resolve(branchDirectory, "failure-emergency-shelter-alternate.png"),
      fullPage: true,
    }).catch(() => undefined);
    throw new Error(`CARE emergency-shelter alternate audit failed: ${errorMessage(error)}`);
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function runBranch(browser, branch) {
  const branchDirectory = resolve(outputDirectory, branch.toLowerCase());
  await mkdir(branchDirectory, { recursive: true });
  const actionLog = [];
  const screenshotRegistry = [];
  const contactEvidence = [];
  const storyPhaseEvidence = [];
  const browserErrors = [];
  const reloadCheckpoints = [];
  const context = await browser.newContext({
    viewport: STANDARD_VIEWPORT,
    locale: "zh-TW",
    recordVideo: { dir: branchDirectory, size: STANDARD_VIEWPORT },
  });
  const page = await context.newPage();
  const storyVideo = page.video();
  const outputVideoName = `${branch.toLowerCase()}-r02-seven-night-playthrough.webm`;
  const publicVideoName = `night-train-frost-v100-${branch.toLowerCase()}.webm`;
  let branchReport;
  let fixtureSetup;
  let alternateEndingCheckpoint;
  let alternateEndingAudit;

  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });

  try {
    await resetBrowserState(page, actionLog);
    const primaryFrostCard = await auditPrimaryFrostCard(page);
    if (branch === "CARE") {
      await saveScreenshot(
        page,
        branchDirectory,
        "r02-route-selection.png",
        "frost-route-selection-v100.png",
        screenshotRegistry,
      );
    }
    await clickAction(page, actionLog, "new-game", "R02");
    const initialSaveSettledMs = await waitForInitialNewGameSave(page);
    await page.waitForSelector('[data-event-id="EV053"]', { timeout: 7000 });
    const day1PrepStory = await readSavedRun(page);
    assert(
      day1PrepStory.day === 1
      && day1PrepStory.phase === "prep"
      && day1PrepStory.activeEventId === "EV053",
      "R02 must visibly begin with Day 1 prep story EV053",
    );
    storyPhaseEvidence.push({ day: 1, eventId: "EV053", duePhase: "prep" });
    await chooseEvent(page, actionLog, "EV053", "a07-layout");
    await page.waitForSelector(".screen--carriage.is-prep", { timeout: 7000 });
    const day1StorySaveSettledMs = await waitForEventResolutionSave(page, "EV053");
    await applyLongRunFixture(page);
    // Resume through the real Continue control so the app's in-memory run
    // adopts the disclosed long-run fixture before resource-consuming play.
    await reloadAndContinueWithInjectedSnapshot(page, actionLog);
    const fixtureRun = await readSavedRun(page);
    assert(fixtureRun.routeId === "R02" && fixtureRun.day === 1 && fixtureRun.phase === "prep", "R02 fixture must resume on Day 1 prep");
    assert(
      fixtureRun.resources.energy === 100
      && fixtureRun.resources.fuel === 60
      && fixtureRun.resources.food === 8
      && fixtureRun.resources.water === 8
      && fixtureRun.resources.parts === 20
      && fixtureRun.resources.medicine === 5,
      "Long-run fixture resource caps were overwritten before the browser resumed",
    );
    assert(
      fixtureRun.modules.every((module) => module.active === false && module.powered === false),
      "Long-run fixture module state was overwritten before the browser resumed",
    );
    fixtureSetup = {
      initialSaveSettledMs,
      day1StorySaveSettledMs,
      verifiedAfterVisibleResume: true,
      resumedThroughContinueAfterGuardedReload: true,
      legalResourceCaps: true,
      modulesOff: true,
    };

    await page.waitForSelector(".screen--carriage.is-prep", { timeout: 7000 });

    let compactThermalDrawer;
    if (branch === "CARE") {
      compactThermalDrawer = await auditCompactThermalDrawer(
        page,
        actionLog,
        branchDirectory,
        screenshotRegistry,
      );
    }

    await clickAction(page, actionLog, "meal");
    await clickAction(page, actionLog, "select-ration", "strict");
    await clickAction(page, actionLog, "meal");

    await openThermalDrawer(page, actionLog);
    await moveThermalTokenByTap(page, actionLog, "H1", "LOOP");
    await moveThermalTokenByTap(page, actionLog, "H1", "BERTH");
    let pointerDrag;
    if (branch === "CARE") {
      pointerDrag = await dragThermalToken(page, actionLog, "H2", "LOOP");
      await moveThermalTokenByTap(page, actionLog, "H2", "BERTH");
      await saveScreenshot(
        page,
        branchDirectory,
        "day1-thermal-pointer-drag.png",
        "frost-thermal-pointer-drag-v100.png",
        screenshotRegistry,
      );
    }
    await closeThermalDrawer(page, actionLog);

    let day4T009;
    let day7T009;
    for (let day = 1; day <= 6; day += 1) {
      if (day !== 1 && prepEventIds[day]) {
        const prepEventId = typeof prepEventIds[day] === "string"
          ? prepEventIds[day]
          : prepEventIds[day]?.[branch];
        const prepChoiceId = typeof prepStoryChoices[day] === "string"
          ? prepStoryChoices[day]
          : prepStoryChoices[day]?.[branch];
        assert(prepEventId && prepChoiceId, `No prep story choice configured for Day ${day} ${branch}`);
        await page.waitForSelector(`[data-event-id="${prepEventId}"]`, { timeout: 7000 });
        const prepStoryRun = await readSavedRun(page);
        assert(
          prepStoryRun.day === day
          && prepStoryRun.phase === "prep"
          && prepStoryRun.activeEventId === prepEventId,
          `${prepEventId} must be visibly due during Day ${day} prep`,
        );
        storyPhaseEvidence.push({ day, eventId: prepEventId, duePhase: "prep" });
        await chooseEvent(page, actionLog, prepEventId, prepChoiceId);
      }

      await page.waitForSelector(".screen--carriage.is-prep", { timeout: 7000 });
      const prepRun = await readSavedRun(page);
      assert(prepRun.day === day, `Expected Day ${day} prep, received Day ${prepRun.day}`);

      if (day === 4) {
        await openThermalDrawer(page, actionLog);
        await setExactAllocation(page, actionLog, { BERTH: 2, DEICER: 2, LOOP: 2 });
        await closeThermalDrawer(page, actionLog);
      }
      if (day === 5) {
        await captureBranchCarriage(page, actionLog, branch, branchDirectory, screenshotRegistry);
      }

      await clickAction(page, actionLog, "route");
      if (day === 4) {
        await page.waitForSelector('[data-event-id="EV057"]', { timeout: 7000 });
        assert(
          await page.locator('[data-event-id="EV057"] [data-action="event-choice"]').count() === 3,
          "EV057 must be visibly due before Day 4 route selection",
        );
        storyPhaseEvidence.push({
          day: 4,
          eventId: "EV057",
          duePhase: "route",
          evidence: "visible forced-event DOM before route-node selection",
        });
        if (branch === "CARE") {
          assert(
            await page.locator('[data-event-id="EV057"] [data-action="event-choice"]').count() === 3,
            "EV057 must visibly expose CARE, CLEAR and SUSTAIN",
          );
          await saveScreenshot(
            page,
            branchDirectory,
            "day4-ev057-three-branches.png",
            "frost-ev057-three-branches-v100.png",
            screenshotRegistry,
          );
        }
        await chooseEvent(page, actionLog, "EV057", branch);
        reloadCheckpoints.push(await reloadAfterBranchChoice(page, actionLog, branch));
      }

      await clickAction(page, actionLog, "select-route", "RN01");
      await clickAction(page, actionLog, "confirm-route", "RN01");
      if (day === 2) {
        await page.waitForSelector('[data-event-id="EV055"]', { timeout: 7000 });
        const travelStoryRun = await readSavedRun(page);
        assert(
          travelStoryRun.day === 2
          && travelStoryRun.phase === "travel"
          && travelStoryRun.activeEventId === "EV055",
          "EV055 must be visibly due after Day 2 route confirmation",
        );
        storyPhaseEvidence.push({ day: 2, eventId: "EV055", duePhase: "travel" });
        await chooseEvent(page, actionLog, "EV055", "repair");
      } else {
        const genericTravel = genericTravelEvents[day];
        assert(genericTravel, `No generic route encounter configured for Day ${day}`);
        await chooseEvent(page, actionLog, genericTravel.eventId, genericTravel.choiceId);
      }

      await page.waitForSelector(".screen--carriage.is-night", { timeout: 7000 });
      const night = await resolveNight(
        page,
        actionLog,
        branch,
        day,
        branchDirectory,
        screenshotRegistry,
        contactEvidence,
      );
      if (night.day4T009) {
        day4T009 = night.day4T009;
        reloadCheckpoints.push(night.day4T009.reloadCheckpoint);
      }

      if (day === 1) {
        await chooseEvent(page, actionLog, "EV054", "calibrate");
      } else if (day === 6) {
        await chooseEvent(page, actionLog, "EV062", "offset");
      }
      await page.waitForSelector(".screen--result", { timeout: 7000 });
      await clickAction(page, actionLog, "next-day");
    }

    await page.waitForSelector(".screen--carriage.is-prep", { timeout: 7000 });
    const day7Prep = await readSavedRun(page);
    assert(day7Prep.day === 7, `Expected Day 7 prep, received Day ${day7Prep.day}`);
    const day7Thermal = await prepareDay7Thermal(
      page,
      actionLog,
      branch,
      branchDirectory,
      screenshotRegistry,
    );
    await chooseEvent(page, actionLog, "EV063", "warm");
    await page.waitForSelector('.screen--carriage.is-night[data-threat-id="T009"]', { timeout: 7000 });
    const finaleNight = await resolveNight(
      page,
      actionLog,
      branch,
      7,
      branchDirectory,
      screenshotRegistry,
      contactEvidence,
    );
    day7T009 = finaleNight.day7T009;
    assert(day7T009, `${branch} must visibly resolve Day 7 T009`);

    await chooseEvent(page, actionLog, "EV064", "manual");
    await page.waitForSelector('[data-event-id="EV065"]', { timeout: 7000 });
    assert(
      await page.locator('[data-event-id="EV065"] [data-action="event-choice"]').count() === 4,
      "EV065 must visibly expose four ending decisions",
    );
    if (branch === "CARE") {
      alternateEndingCheckpoint = await captureSavedEventCheckpoint(page, "EV065");
    }
    await saveScreenshot(
      page,
      branchDirectory,
      `day7-${branch.toLowerCase()}-ending-decisions.png`,
      `frost-${branch.toLowerCase()}-ending-decisions-v100.png`,
      screenshotRegistry,
    );
    await chooseEvent(page, actionLog, "EV065", endingChoices[branch]);
    await page.waitForSelector(".screen--result.is-ending", { timeout: 7000 });

    const endingBeforeReload = await readSavedRun(page);
    const rewardEntriesBefore = endingBeforeReload.ledger.filter((entry) => entry.source === "story.R02.route-complete").length;
    assert(endingBeforeReload.day === 7 && endingBeforeReload.ended === true, `${branch} must finish visibly on Day 7`);
    assert(endingBeforeReload.story.whiteFrost.branch === branch, `${branch} ending lost its branch`);
    assert(endingBeforeReload.story.whiteFrost.finalDecision === endingChoices[branch], `${branch} ending decision did not persist`);
    assert(endingBeforeReload.story.whiteFrost.endingId, `${branch} did not persist an ending ID`);
    assert(rewardEntriesBefore === 1, `${branch} completion reward must settle exactly once`);
    await saveScreenshot(
      page,
      branchDirectory,
      `day7-${branch.toLowerCase()}-ending.png`,
      `frost-${branch.toLowerCase()}-ending-v100.png`,
      screenshotRegistry,
    );

    await reloadAndContinue(page, actionLog);
    await page.waitForSelector(".screen--result.is-ending", { timeout: 7000 });
    const endingAfterReload = await readSavedRun(page);
    const rewardEntriesAfter = endingAfterReload.ledger.filter((entry) => entry.source === "story.R02.route-complete").length;
    assert(endingAfterReload.story.whiteFrost.endingId === endingBeforeReload.story.whiteFrost.endingId, "Ending changed across reload");
    assert(endingAfterReload.story.whiteFrost.finalDecision === endingChoices[branch], "Final decision changed across reload");
    assert(rewardEntriesAfter === rewardEntriesBefore, "Ending reload duplicated the route reward");
    reloadCheckpoints.push({
      checkpoint: "ending",
      endingId: endingAfterReload.story.whiteFrost.endingId,
      rewardEntriesBefore,
      rewardEntriesAfter,
      persisted: true,
    });
    assert(browserErrors.length === 0, `${branch} browser errors: ${browserErrors.join(" | ")}`);
    if (branch === "CARE") {
      assert(alternateEndingCheckpoint, "CARE did not capture its natural EV065 pre-decision checkpoint");
      alternateEndingAudit = await auditEmergencyShelterAlternate(
        browser,
        alternateEndingCheckpoint,
        branchDirectory,
        screenshotRegistry,
      );
    }

    const uniqueDays = [...new Set(contactEvidence.map((entry) => entry.day))].sort((left, right) => left - right);
    assert(uniqueDays.length === 7 && uniqueDays.every((day, index) => day === index + 1), `${branch} did not visibly resolve all seven nights`);
    branchReport = {
      status: "passed",
      branch,
      viewport: STANDARD_VIEWPORT,
      routeId: endingAfterReload.routeId,
      day: endingAfterReload.day,
      branchOperationComplete: endingAfterReload.story.whiteFrost.branchOperationComplete,
      finalDecision: endingAfterReload.story.whiteFrost.finalDecision,
      endingId: endingAfterReload.story.whiteFrost.endingId,
      rewardSettled: endingAfterReload.story.whiteFrost.rewardSettled,
      rewardEntries: rewardEntriesAfter,
      sevenNights: uniqueDays,
      contactEvidence,
      storyPhaseEvidence,
      day4T009,
      day7T009,
      day7Thermal,
      pointerDrag,
      primaryFrostCard,
      compactThermalDrawer,
      fixtureSetup,
      reloadCheckpoints,
      alternateEndingAudit,
      actionCount: actionLog.length,
      actionLog,
      browserErrors,
      screenshots: screenshotRegistry,
    };
  } catch (error) {
    const failure = {
      error: errorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      url: page.url(),
      actionLog,
      browserErrors,
      run: await readSavedRun(page).catch(() => undefined),
    };
    await page.screenshot({ path: resolve(branchDirectory, "failure.png"), fullPage: true }).catch(() => undefined);
    await writeFile(resolve(branchDirectory, "failure-state.json"), `${JSON.stringify(failure, null, 2)}\n`, "utf8");
    await writeFile(resolve(branchDirectory, "failure-page.html"), await page.content().catch(() => ""), "utf8");
    branchReport = {
      status: "failed",
      branch,
      error: failure.error,
      errorStack: failure.stack,
      currentUrl: failure.url,
      lastRunState: failure.run,
      actionCount: actionLog.length,
      actionLog,
      fixtureSetup,
      browserErrors,
      screenshots: screenshotRegistry,
      diagnosticDirectory: `output/playwright/frost-story/${branch.toLowerCase()}`,
    };
  } finally {
    if (!page.isClosed()) await page.close().catch(() => undefined);
    const passed = branchReport.status === "passed";
    const savedVideoName = passed ? outputVideoName : `failed-${outputVideoName}`;
    const outputVideoPath = resolve(branchDirectory, savedVideoName);
    try {
      await storyVideo?.saveAs(outputVideoPath);
      const videoStats = await stat(outputVideoPath);
      if (passed) {
        const publicVideoPath = resolve(publicVideoDirectory, publicVideoName);
        await copyFile(outputVideoPath, publicVideoPath);
        branchReport.video = {
          output: `output/playwright/frost-story/${branch.toLowerCase()}/${outputVideoName}`,
          public: `public/assets/video/${publicVideoName}`,
          bytes: videoStats.size,
        };
      } else {
        branchReport.diagnosticVideo = {
          output: `output/playwright/frost-story/${branch.toLowerCase()}/${savedVideoName}`,
          public: null,
          published: false,
          reason: "Branch failed; retained only as non-release diagnostic evidence.",
          bytes: videoStats.size,
        };
      }
    } catch (error) {
      branchReport.video = passed ? { error: errorMessage(error) } : undefined;
      branchReport.diagnosticVideo = passed ? undefined : { error: errorMessage(error), public: null, published: false };
      branchReport.status = "failed";
      branchReport.error = branchReport.error ?? `Video save failed: ${errorMessage(error)}`;
    }
    await context.close().catch(() => undefined);
  }
  return branchReport;
}

await Promise.all([
  mkdir(outputDirectory, { recursive: true }),
  mkdir(publicScreenshotDirectory, { recursive: true }),
  mkdir(publicVideoDirectory, { recursive: true }),
  mkdir(publicQaDirectory, { recursive: true }),
]);

const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8"));
const commitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const workingTreeDirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;
const branches = requestedBranches();
const browser = await chromium.launch({ headless: true });
const branchReports = [];
let emergencyRouteAudit;

try {
  emergencyRouteAudit = branches.includes("CARE")
    ? await runEmergencyRouteAudit(browser)
    : { status: "not-requested", reason: "CARE was not included in this audit invocation." };
  for (const branch of branches) {
    const branchReport = await runBranch(browser, branch);
    if (branchReport.status === "passed" && branchReport.video?.public) {
      const publicName = branchReport.video.public.split("/").at(-1);
      try {
        branchReport.video.metadata = await inspectVideo(browser, publicName);
      } catch (error) {
        branchReport.status = "failed";
        branchReport.error = `Video validation failed: ${errorMessage(error)}`;
        branchReport.video.metadataError = errorMessage(error);
      }
    }
    branchReports.push(branchReport);
  }
} finally {
  await browser.close();
}

const failures = branchReports.filter((branch) => branch.status !== "passed");
const emergencyRouteFailed = emergencyRouteAudit.status === "failed";
const report = {
  status: failures.length === 0 && !emergencyRouteFailed ? "passed" : "failed",
  generatedAt: new Date().toISOString(),
  commitSha,
  packageVersion: packageJson.version,
  workingTreeDirty,
  baseUrl,
  routeId: "R02",
  requestedBranches: branches,
  acceptance: {
    completeSevenNightUiFlows: failures.length === 0,
    emergencyRouteVisibleClick: emergencyRouteAudit.status === "passed",
    branchMatrix: BRANCHES,
    thermalTap: branchReports.every((branch) => branch.actionLog?.some((action) => action.startsWith("thermal-select:"))),
    realPointerDrag: branchReports.some((branch) => branch.pointerDrag?.persisted),
    reloadCheckpoints: ["EV057", "T009-first-miss", "ending"],
    wrongRevealRetry: branchReports.some((branch) => branch.day4T009?.mode === "wrong-reveal-retry"),
    manualScrape: branchReports.some((branch) => branch.day4T009?.mode === "wrong-reveal-manual"),
    alternateEmergencyShelterEnding: branchReports.some((branch) => (
      branch.branch === "CARE"
      && branch.alternateEndingAudit?.status === "passed"
      && branch.alternateEndingAudit?.finalDecision === "emergency-stop"
      && branch.alternateEndingAudit?.endingId === "frost-emergency-shelter"
      && branch.alternateEndingAudit?.rewardSettledExactlyOnce === true
    )),
    compact: { viewport: COMPACT_VIEWPORT, textScale: COMPACT_TEXT_SCALE, minimumTouchTarget: 48 },
    consoleAndPageErrors: branchReports.reduce(
      (total, branch) => total
        + (branch.browserErrors?.length ?? 0)
        + (branch.alternateEndingAudit?.browserErrors?.length ?? 0),
      0,
    ),
  },
  emergencyRouteAudit,
  fixtureDisclosure: {
    purpose: "Prevent long-form QA exhaustion from masking R02 story/UI behavior.",
    resumeMechanism: "Active game screens intentionally omit a menu shortcut. A one-shot pre-document storage handoff restores the disclosed resource-only fixture after unload persistence, then the real Continue control loads it into app memory.",
    changedBeforeResourceConsumingPlay: [
      "resources set to legal caps: energy 100, fuel 60, food 8, water 8, parts 20, medicine 5",
      "survivor health and sleep set to 100",
      "environment hull set to 100 and temperature to 18",
      "starting modules switched off",
    ],
    notChanged: [
      "day, phase, active event, seen events, branch, T009 interaction, final decision, ending and reward state",
    ],
    progressionRule: "EV053 was resolved through visible UI before the fixture; every later route, event, thermal allocation/commit, threat response, next day and ending choice also used visible UI controls. This is not claimed as a natural-economy balance clear.",
  },
  branches: branchReports,
};

const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(resolve(outputDirectory, "frost-story-flow-report.json"), serializedReport, "utf8");
await writeFile(resolve(publicQaDirectory, "frost-story-flow-report.json"), serializedReport, "utf8");
console.log(serializedReport);

if (failures.length > 0 || emergencyRouteFailed) process.exitCode = 1;
