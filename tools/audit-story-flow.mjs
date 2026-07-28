import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const BRANCHES = ["GO", "DETOUR", "STOP"];
const EXPECTED_DAY7_WAVE_THREE = {
  GO: "T006",
  DETOUR: "T004",
  STOP: "T005",
};
const STANDARD_VIEWPORT = { width: 390, height: 844 };
const COMPACT_VIEWPORT = { width: 360, height: 640 };
const COMPACT_TEXT_SCALE = 140;
const baseUrl = process.env.GAME_URL ?? "http://127.0.0.1:4312";
const outputDirectory = resolve("output/playwright/story-flow");
const publicVideoDirectory = resolve("public/assets/video");
const PUBLIC_VIDEO_NAMES = {
  GO: "night-train-story-v090.webm",
  DETOUR: "night-train-story-v090-detour.webm",
  STOP: "night-train-story-v090-stop.webm",
};
const DAY4_RESOURCE_FIXTURE_POLICY = {
  kind: "qa-only-branch-resource-fixture",
  appliesToBranch: "STOP",
  eventId: "EV044",
  choiceId: "STOP",
  choiceMinimum: { food: 3, water: 3 },
  legalTarget: { food: 8, water: 8 },
  legalTargetSource: "src/game/content.ts BALANCE.max",
  mutatedFields: ["resources.food", "resources.water"],
  preservedState: ["routeId", "day", "phase", "activeEventId", "selectedRouteNodeId", "story"],
  storage: ["localStorage:run.current", "IndexedDB:night-train-save/snapshots/run.current"],
  resume: "reload menu, re-sync the same serialized fixture, then use the visible Continue button",
  interaction: "click the visible STOP button at its rendered center with page.mouse.click",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readOption(name) {
  const equalsPrefix = `${name}=`;
  const inline = process.argv.slice(2).find((argument) => argument.startsWith(equalsPrefix));
  if (inline) return inline.slice(equalsPrefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function parseBranches() {
  const requested = readOption("--branches")
    ?? readOption("--branch")
    ?? process.env.STORY_BRANCHES
    ?? process.env.STORY_BRANCH
    ?? BRANCHES.join(",");
  const branches = [...new Set(
    requested
      .split(",")
      .map((branch) => branch.trim().toUpperCase())
      .filter(Boolean),
  )];
  assert(branches.length > 0, "At least one story branch is required");
  for (const branch of branches) {
    assert(BRANCHES.includes(branch), `Unsupported story branch ${branch}; expected ${BRANCHES.join(", ")}`);
  }
  return branches;
}

const requestedBranches = parseBranches();
const allowLegacyThreatUi = process.argv.includes("--allow-legacy-threat-ui")
  || process.env.ALLOW_LEGACY_THREAT_UI === "1";
const runCompactFinale = !process.argv.includes("--no-compact-finale")
  && process.env.STORY_COMPACT_FINALE !== "0";

const dayChoices = {
  1: ["partial"],
  2: ["keep"],
  3: ["delay"],
  4: [],
  5: ["verify"],
  6: ["read"],
  7: ["silent"],
};

const aftermathChoices = {
  5: "scan",
  6: "tell",
};

async function clickAction(page, action, value) {
  const suffix = value === undefined ? "" : `[data-value="${value}"]`;
  const selector = `[data-action="${action}"]${suffix}:not([disabled])`;
  await retryDomAction(`${action}${value ? `:${value}` : ""}`, async () => {
    const target = page.locator(selector).first();
    await target.waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
    assert(await target.count() === 1, `Missing enabled action ${action}${value ? `:${value}` : ""}`);
    await target.scrollIntoViewIfNeeded();
    await target.click();
  });
  await page.waitForTimeout(140);
}

async function clickActionAtVisibleCenter(page, action, value) {
  const suffix = value === undefined ? "" : `[data-value="${value}"]`;
  const selector = `[data-action="${action}"]${suffix}:not([disabled])`;
  let clickEvidence;
  await retryDomAction(`${action}${value ? `:${value}` : ""} center click`, async () => {
    const target = page.locator(selector).first();
    await target.waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
    assert(await target.count() === 1, `Missing enabled action ${action}${value ? `:${value}` : ""}`);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    assert(box && box.width > 0 && box.height > 0, `${action}:${value} has no visible center hit box`);
    const center = {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
    const hit = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(
        Math.max(0, Math.min(window.innerWidth - 1, x)),
        Math.max(0, Math.min(window.innerHeight - 1, y)),
      );
      const actionTarget = element?.closest("[data-action]");
      return actionTarget
        ? {
            action: actionTarget.getAttribute("data-action"),
            value: actionTarget.getAttribute("data-value"),
            disabled: actionTarget.hasAttribute("disabled"),
          }
        : undefined;
    }, center);
    assert(
      hit?.action === action && hit?.value === (value ?? null) && hit.disabled === false,
      `${action}:${value} is covered or disabled at its visible center`,
    );
    await page.mouse.click(center.x, center.y);
    clickEvidence = {
      method: "page.mouse.click",
      center,
      hitTarget: hit,
      hitBox: { width: box.width, height: box.height },
    };
  });
  await page.waitForTimeout(140);
  return clickEvidence;
}

async function readSavedRun(page) {
  return JSON.parse((await page.evaluate(() => localStorage.getItem("run.current"))) ?? "{}");
}

async function syncSerializedRun(page, serialized) {
  return page.evaluate(async (snapshot) => {
    const openDatabase = () => new Promise((resolveOpen, rejectOpen) => {
      const request = indexedDB.open("night-train-save", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("snapshots")) {
          request.result.createObjectStore("snapshots");
        }
      };
      request.onsuccess = () => resolveOpen(request.result);
      request.onerror = () => rejectOpen(request.error ?? new Error("Cannot open QA save database"));
    });
    const database = await openDatabase();
    localStorage.setItem("run.current", snapshot);
    await new Promise((resolveWrite, rejectWrite) => {
      const transaction = database.transaction("snapshots", "readwrite");
      transaction.objectStore("snapshots").put(snapshot, "run.current");
      transaction.oncomplete = () => resolveWrite(undefined);
      transaction.onerror = () => rejectWrite(transaction.error ?? new Error("Cannot write QA snapshot"));
    });
    const indexed = await new Promise((resolveRead, rejectRead) => {
      const request = database.transaction("snapshots", "readonly").objectStore("snapshots").get("run.current");
      request.onsuccess = () => resolveRead(request.result);
      request.onerror = () => rejectRead(request.error ?? new Error("Cannot verify QA snapshot"));
    });
    database.close();
    return {
      localStorageMatches: localStorage.getItem("run.current") === snapshot,
      indexedDBMatches: indexed === snapshot,
    };
  }, serialized);
}

async function applyStopDay4ResourceFixture(page) {
  const beforeRun = await readSavedRun(page);
  assert(beforeRun.routeId === "R01", "STOP resource fixture requires the R01 route");
  assert(beforeRun.day === 4, `STOP resource fixture requires Day 4, received Day ${beforeRun.day}`);
  assert(beforeRun.activeEventId === "EV044", `STOP resource fixture requires EV044, received ${beforeRun.activeEventId ?? "none"}`);

  const preserved = {
    routeId: beforeRun.routeId,
    day: beforeRun.day,
    phase: beforeRun.phase,
    activeEventId: beforeRun.activeEventId,
    selectedRouteNodeId: beforeRun.selectedRouteNodeId,
    story: beforeRun.story,
  };
  const fixtureRun = structuredClone(beforeRun);
  const before = {
    food: beforeRun.resources?.food,
    water: beforeRun.resources?.water,
  };
  fixtureRun.resources.food = DAY4_RESOURCE_FIXTURE_POLICY.legalTarget.food;
  fixtureRun.resources.water = DAY4_RESOURCE_FIXTURE_POLICY.legalTarget.water;
  const serialized = JSON.stringify(fixtureRun);
  const preReloadSync = await syncSerializedRun(page, serialized);
  assert(preReloadSync.localStorageMatches && preReloadSync.indexedDBMatches, "STOP fixture did not sync before reload");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".screen--menu", { timeout: 6000 });
  const postReloadSync = await syncSerializedRun(page, serialized);
  assert(postReloadSync.localStorageMatches && postReloadSync.indexedDBMatches, "STOP fixture did not sync after reload");
  await clickAction(page, "continue");
  await page.waitForSelector('[data-event-id="EV044"]', { timeout: 6000 });

  const resumedRun = await readSavedRun(page);
  const resumedState = {
    routeId: resumedRun.routeId,
    day: resumedRun.day,
    phase: resumedRun.phase,
    activeEventId: resumedRun.activeEventId,
    selectedRouteNodeId: resumedRun.selectedRouteNodeId,
    story: resumedRun.story,
  };
  assert(
    JSON.stringify(resumedState) === JSON.stringify(preserved),
    "STOP fixture changed story or Day 4 event state while reloading",
  );
  assert(
    resumedRun.resources.food === DAY4_RESOURCE_FIXTURE_POLICY.legalTarget.food
      && resumedRun.resources.water === DAY4_RESOURCE_FIXTURE_POLICY.legalTarget.water,
    "STOP fixture resources were not restored after Continue",
  );
  assert(
    await page.locator('[data-event-id="EV044"] [data-action="event-choice"][data-value="STOP"]:not([disabled])').count() === 1,
    "STOP remained disabled after the disclosed Day 4 resource fixture",
  );

  return {
    policy: DAY4_RESOURCE_FIXTURE_POLICY.kind,
    branch: "STOP",
    eventId: "EV044",
    choiceMinimum: DAY4_RESOURCE_FIXTURE_POLICY.choiceMinimum,
    before,
    after: {
      food: resumedRun.resources.food,
      water: resumedRun.resources.water,
    },
    changedFields: DAY4_RESOURCE_FIXTURE_POLICY.mutatedFields,
    preReloadSync,
    postReloadSync,
    reloaded: true,
    continuedThroughVisibleUi: true,
    preservedStateVerified: true,
  };
}

function diagnosticRunSummary(run) {
  if (!run || typeof run !== "object") return undefined;
  return {
    routeId: run.routeId,
    day: run.day,
    phase: run.phase,
    activeEventId: run.activeEventId,
    activeContact: run.activeContact
      ? {
          id: run.activeContact.id,
          definitionId: run.activeContact.definitionId,
          wave: run.activeContact.wave,
          totalWaves: run.activeContact.totalWaves,
          stage: run.activeContact.stage,
        }
      : undefined,
    resources: run.resources,
    survivor: run.survivor,
    storyFlags: run.story?.flags,
    completedContactWaves: run.story?.completedContactWaves,
    finalDecision: run.story?.finalDecision,
    endingId: run.story?.endingId,
    lastMessage: run.lastMessage,
  };
}

async function resetBrowserState(page) {
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
}

async function boostRunResources(page) {
  await page.evaluate(async () => {
    const run = JSON.parse(localStorage.getItem("run.current") ?? "{}");
    Object.assign(run.resources, {
      energy: 100,
      fuel: 60,
      food: 20,
      water: 20,
      parts: 30,
      medicine: 6,
    });
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
}

function dedicatedThreatSelector(threatId) {
  return [
    `[data-testid="threat-interaction"][data-threat-id="${threatId}"]`,
    `[data-threat-interaction][data-threat-id="${threatId}"]`,
    `[data-threat-interaction="${threatId}"]`,
  ].join(", ");
}

function dedicatedThreatRoot(page, threatId) {
  return page.locator(dedicatedThreatSelector(threatId)).first();
}

async function retryDomAction(label, action) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!String(error).includes("not attached to the DOM") || attempt === 4) throw error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 40));
    }
  }
  throw lastError ?? new Error(`${label} failed without an error`);
}

function expectedThreatInteraction(contact) {
  const interaction = contact?.interaction;
  if (!interaction) return undefined;
  switch (interaction.kind) {
    case "T004":
      return {
        value: `cutter:${interaction.targetPlotId}`,
        target: interaction.targetPlotId,
      };
    case "T005":
      return {
        value: `signal:${interaction.targetSignalId}`,
        target: interaction.targetSignalId,
      };
    case "T006":
      return {
        value: `trace:${interaction.mode === "leaf" ? "leaves" : "meter"}`,
        target: interaction.mode,
      };
    default:
      return undefined;
  }
}

async function waitForContactAdvance(page, contactId) {
  await page.waitForFunction((previousContactId) => {
    const run = JSON.parse(localStorage.getItem("run.current") ?? "{}");
    return !run.activeContact
      || run.activeContact.id !== previousContactId
      || run.activeContact.stage === "resolve";
  }, contactId, { timeout: 5000 });
}

async function completeDedicatedThreatInteraction(page, threatId, branchDirectory) {
  const root = dedicatedThreatRoot(page, threatId);
  await root.waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);

  if (await root.count() === 0) {
    assert(
      allowLegacyThreatUi,
      `${threatId} must expose [data-testid="threat-interaction"][data-threat-id="${threatId}"]; use --allow-legacy-threat-ui only for transitional runs`,
    );
    const legacyCounter = page.locator(
      `.emergency-actions [data-action="counter"]:not([disabled])`,
    ).first();
    assert(await legacyCounter.count() === 1, `${threatId} legacy fallback is not clickable`);
    await legacyCounter.click();
    await page.waitForTimeout(120);
    return {
      threatId,
      ui: "legacy-fallback",
      action: await legacyCounter.getAttribute("data-value"),
    };
  }

  await page.screenshot({
    path: resolve(branchDirectory, `day7-${threatId.toLowerCase()}-interaction.png`),
    fullPage: true,
  });

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const run = await readSavedRun(page);
    const contact = run.activeContact;
    assert(contact?.definitionId === threatId, `${threatId} contact disappeared before interaction`);
    const expected = expectedThreatInteraction(contact);
    assert(
      expected,
      `${threatId} must persist run.current.activeContact.interaction before rendering its threat UI`,
    );

    const formalSelector = `[data-action="threat-interact"][data-value="${expected.value}"]:not([disabled])`;
    const compatibleSelector = `[data-action="threat-interaction"][data-value="${expected.value}"]:not([disabled])`;
    const rootSelectors = dedicatedThreatSelector(threatId).split(", ");
    const target = page.locator(rootSelectors.flatMap((rootSelector) => [
      `${rootSelector} ${formalSelector}`,
      `${rootSelector} ${compatibleSelector}`,
    ]).join(", ")).first();
    await target.waitFor({ state: "visible", timeout: 2500 }).catch(() => undefined);
    assert(
      await target.count() === 1,
      `${threatId} must expose ${formalSelector} inside its threat-interaction container`,
    );
    if (threatId === "T004") {
      const cutter = page.locator(rootSelectors.map(
        (rootSelector) => `${rootSelector} [data-threat-tool="cutter"]`,
      ).join(", ")).first();
      assert(await cutter.count() === 1, "T004 must expose a draggable cutter tool");
      await retryDomAction("T004 cutter drag", async () => {
        await cutter.scrollIntoViewIfNeeded();
        await target.scrollIntoViewIfNeeded();
        await cutter.dragTo(target, { force: true });
      });
    } else {
      await retryDomAction(`${threatId} choice`, async () => {
        await target.scrollIntoViewIfNeeded();
        await target.click();
      });
    }
    await page.waitForTimeout(120);

    const after = await readSavedRun(page);
    if (
      !after.activeContact
      || after.activeContact.id !== contact.id
      || after.activeContact.stage === "resolve"
    ) {
      return {
        threatId,
        ui: "dedicated",
        action: expected.value,
        target: expected.target,
        attempts: attempt,
      };
    }
  }

  const remaining = (await readSavedRun(page)).activeContact;
  throw new Error(
    `${threatId} dedicated interaction did not complete after 4 correct UI actions; contact=${remaining?.id ?? "none"}`,
  );
}

async function resolveNight(page, day, expectedWaveThree, encounteredThreats, waveEvidence, branchDirectory) {
  const handledContacts = new Set();

  for (let guard = 0; guard < 40; guard += 1) {
    if (await page.locator(".screen--carriage.is-night").count() === 0) return undefined;
    const contact = (await readSavedRun(page)).activeContact;
    if (!contact) {
      await page.waitForTimeout(120);
      continue;
    }

    const threatId = contact.definitionId;
    const wave = Number(contact.wave ?? 1);
    const totalWaves = Number(contact.totalWaves ?? 1);
    const contactKey = `${contact.id}:${threatId}`;
    encounteredThreats.add(threatId);
    waveEvidence.push({ day, wave, totalWaves, threatId });

    if (day === 7 && wave === 3) {
      assert(totalWaves === 3, `Day 7 must expose three contact waves; received ${totalWaves}`);
      assert(
        threatId === expectedWaveThree,
        `Day 7 wave 3 must be ${expectedWaveThree}, received ${threatId}`,
      );
    }

    if (handledContacts.has(contactKey)) {
      const stalled = await readSavedRun(page);
      throw new Error(
        `Night ${day} wave ${wave} stalled on handled ${threatId} contact ${contact.id}; `
        + `fuel=${stalled.resources?.fuel}, energy=${stalled.resources?.energy}, `
        + `message=${stalled.lastMessage ?? "none"}`,
      );
    }
    handledContacts.add(contactKey);

    if (day === 7 && wave === 3) {
      const interaction = await completeDedicatedThreatInteraction(page, threatId, branchDirectory);
      await waitForContactAdvance(page, contact.id);
      await page.waitForTimeout(120);
      return interaction;
    }

    const preferredCounterIds = threatId === "T003"
      ? ["emergency-boost", "decoy"]
      : ["close-shutter", "shock-window"];
    let counter = page.locator(
      '.emergency-actions [data-action="counter"][data-value="brace-impact"]:not([disabled])',
    ).first();
    for (const counterId of preferredCounterIds) {
      const candidate = page.locator(
        `.emergency-actions [data-action="counter"][data-value="${counterId}"]:not([disabled])`,
      ).first();
      if (await candidate.count() === 1) {
        counter = candidate;
        break;
      }
    }
    assert(
      await counter.count() === 1,
      `Night ${day} wave ${wave} ${threatId} must expose an effective counter or brace-impact fallback`,
    );
    const selectedCounterId = await counter.getAttribute("data-value");
    await counter.click();
    await waitForContactAdvance(page, contact.id).catch(async () => {
      const stalled = await readSavedRun(page);
      throw new Error(
        `Night ${day} wave ${wave} ${threatId} did not advance after ${selectedCounterId}; `
        + `fuel=${stalled.resources?.fuel}, energy=${stalled.resources?.energy}, `
        + `message=${stalled.lastMessage ?? "none"}`,
      );
    });
    await page.waitForTimeout(120);
  }

  const stalled = await readSavedRun(page);
  throw new Error(
    `Night ${day} exceeded the 40-step browser guard; `
    + `contact=${stalled.activeContact?.definitionId ?? "none"}:${stalled.activeContact?.id ?? "none"}`,
  );
}

async function setCompactFinaleMode(page) {
  await page.setViewportSize(COMPACT_VIEWPORT);
  await page.evaluate((textScale) => {
    const settings = JSON.parse(localStorage.getItem("settings") ?? "{}");
    localStorage.setItem("settings", JSON.stringify({ ...settings, textScale }));
  }, COMPACT_TEXT_SCALE);
  await page.reload({ waitUntil: "domcontentloaded" });
  if (await page.locator(".screen--menu").count()) {
    await clickAction(page, "continue");
  }
  await page.waitForSelector('[data-event-id="EV051"]', { timeout: 5000 });
}

async function assertClickableInViewport(page, locator, label) {
  await retryDomAction(label, async () => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    assert(box, `${label} has no visible hit box`);
    assert(box.width >= 40 && box.height >= 40, `${label} touch target is smaller than 40px`);
    assert(box.x >= -1, `${label} extends left of the viewport`);
    assert(box.x + box.width <= COMPACT_VIEWPORT.width + 1, `${label} extends right of the viewport`);
    assert(box.y >= -1, `${label} remains above the visible viewport after scrolling`);
    assert(box.y + box.height <= COMPACT_VIEWPORT.height + 1, `${label} remains below the visible viewport after scrolling`);

    const receivesPointer = await locator.evaluate((element) => {
      const rectangle = element.getBoundingClientRect();
      const x = Math.max(0, Math.min(window.innerWidth - 1, rectangle.left + rectangle.width / 2));
      const y = Math.max(0, Math.min(window.innerHeight - 1, rectangle.top + rectangle.height / 2));
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit && (hit === element || element.contains(hit)));
    });
    assert(receivesPointer, `${label} is covered by another panel at its visual center`);
  });
}

async function compactLayoutMetrics(page, eventId) {
  return page.evaluate((expectedEventId) => {
    const app = document.querySelector("#app");
    const eventScreen = document.querySelector(`[data-event-id="${expectedEventId}"]`);
    const eventButtons = [...document.querySelectorAll(
      `[data-event-id="${expectedEventId}"] [data-action="event-choice"]`,
    )];
    const visiblePanels = [...document.querySelectorAll(
      `[data-event-id="${expectedEventId}"] .panel`,
    )].filter((element) => {
      const style = getComputedStyle(element);
      const rectangle = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rectangle.width > 0;
    });
    const horizontalOverflow = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
      app?.scrollWidth ?? 0,
    ) - window.innerWidth;
    const outOfBoundsPanels = visiblePanels
      .map((element) => {
        const rectangle = element.getBoundingClientRect();
        return {
          className: element.className,
          left: rectangle.left,
          right: rectangle.right,
        };
      })
      .filter((panel) => panel.left < -1 || panel.right > window.innerWidth + 1);
    const outOfBoundsButtons = eventButtons
      .map((element) => {
        const rectangle = element.getBoundingClientRect();
        return {
          value: element.getAttribute("data-value"),
          left: rectangle.left,
          right: rectangle.right,
        };
      })
      .filter((button) => button.left < -1 || button.right > window.innerWidth + 1);
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      textScale: Number.parseFloat(
        getComputedStyle(app ?? document.documentElement).getPropertyValue("--text-scale"),
      ),
      horizontalOverflow,
      screenWidth: eventScreen?.getBoundingClientRect().width ?? 0,
      outOfBoundsPanels,
      outOfBoundsButtons,
    };
  }, eventId);
}

async function auditCompactFinale(page, branchDirectory) {
  await setCompactFinaleMode(page);
  const decisionMetrics = await compactLayoutMetrics(page, "EV051");
  assert(decisionMetrics.viewport.width === 360 && decisionMetrics.viewport.height === 640, "Compact finale viewport must be 360x640");
  assert(Math.abs(decisionMetrics.textScale - 1.4) < 0.01, "Compact finale must render at 140% text scale");
  assert(decisionMetrics.horizontalOverflow <= 1, `EV051 has ${decisionMetrics.horizontalOverflow}px horizontal overflow`);
  assert(decisionMetrics.outOfBoundsPanels.length === 0, "EV051 has a panel outside the viewport");
  assert(decisionMetrics.outOfBoundsButtons.length === 0, "EV051 has a button outside the viewport width");

  const openChoice = page.locator(
    '[data-event-id="EV051"] [data-action="event-choice"][data-value="open"]:not([disabled])',
  ).first();
  await assertClickableInViewport(page, openChoice, "EV051 open choice");
  await page.screenshot({
    path: resolve(branchDirectory, "day7-four-decisions-360x640-text140.png"),
    fullPage: true,
  });
  await retryDomAction("EV051 open click", () => openChoice.click());
  await page.waitForSelector('[data-event-id="EV052"]');

  const truthMetrics = await compactLayoutMetrics(page, "EV052");
  assert(truthMetrics.horizontalOverflow <= 1, `EV052 has ${truthMetrics.horizontalOverflow}px horizontal overflow`);
  assert(truthMetrics.outOfBoundsPanels.length === 0, "EV052 has a panel outside the viewport");
  assert(truthMetrics.outOfBoundsButtons.length === 0, "EV052 has a button outside the viewport width");

  const truthChoice = page.locator(
    '[data-event-id="EV052"] [data-action="event-choice"][data-value="truth"]:not([disabled])',
  ).first();
  await assertClickableInViewport(page, truthChoice, "EV052 truth choice");
  await retryDomAction("EV052 truth click", () => truthChoice.click());
  await page.waitForSelector(".screen--result");

  const resultMetrics = await page.evaluate(() => ({
    horizontalOverflow: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
      document.querySelector("#app")?.scrollWidth ?? 0,
    ) - window.innerWidth,
  }));
  assert(resultMetrics.horizontalOverflow <= 1, "Ending result has horizontal overflow");
  const resultAction = page.locator(".screen--result [data-action]:not([disabled])").first();
  await assertClickableInViewport(page, resultAction, "Ending primary action");

  return {
    viewport: COMPACT_VIEWPORT,
    textScale: COMPACT_TEXT_SCALE,
    events: {
      EV051: decisionMetrics,
      EV052: truthMetrics,
      result: resultMetrics,
    },
    clickableHotspots: ["EV051:open", "EV052:truth", "result:primary"],
  };
}

async function runBranch(browser, branch) {
  const branchDirectory = resolve(outputDirectory, branch.toLowerCase());
  await mkdir(branchDirectory, { recursive: true });
  const browserErrors = [];
  const encounteredThreats = new Set();
  const waveEvidence = [];
  const expectedWaveThree = EXPECTED_DAY7_WAVE_THREE[branch];
  const context = await browser.newContext({
    viewport: STANDARD_VIEWPORT,
    locale: "zh-TW",
    recordVideo: { dir: branchDirectory, size: STANDARD_VIEWPORT },
  });
  const page = await context.newPage();
  const storyVideo = page.video();
  let branchReport;
  let day4ResourceFixture;

  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  try {
    await resetBrowserState(page);
    await clickAction(page, "new-game", "R01");
    await clickAction(page, "power");
    await clickAction(page, "toggle-power", "M002");
    await clickAction(page, "toggle-power", "M003");
    await clickAction(page, "power");
    await boostRunResources(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await clickAction(page, "continue");

    let interactionAudit;
    for (let day = 1; day <= 7; day += 1) {
      await page.waitForSelector(".screen--carriage.is-prep");
      await clickAction(page, "route");
      await clickAction(page, "select-route", "RN01");
      await clickAction(page, "confirm-route", "RN01");
      await page.waitForSelector(".screen--event");

      const choices = day === 4 ? [branch] : dayChoices[day];
      for (const choiceId of choices) {
        if (day === 4) {
          if (branch === "STOP") {
            day4ResourceFixture = await applyStopDay4ResourceFixture(page);
          }
          assert(
            await page.locator('[data-action="event-choice"]').count() === 3,
            "Day 4 must show three permanent branches",
          );
          await page.screenshot({
            path: resolve(branchDirectory, "day4-three-branches.png"),
            fullPage: true,
          });
        }
        if (day === 4 && branch === "STOP") {
          day4ResourceFixture.centerClick = await clickActionAtVisibleCenter(page, "event-choice", choiceId);
          await page.waitForFunction(
            () => JSON.parse(localStorage.getItem("run.current") ?? "{}").story?.flags?.day4Route === "STOP",
            undefined,
            { timeout: 5000 },
          );
          day4ResourceFixture.choicePersisted = true;
        } else {
          await clickAction(page, "event-choice", choiceId);
        }
      }

      await page.waitForSelector(".screen--carriage.is-night");
      const resolvedInteraction = await resolveNight(
        page,
        day,
        expectedWaveThree,
        encounteredThreats,
        waveEvidence,
        branchDirectory,
      );
      if (resolvedInteraction) interactionAudit = resolvedInteraction;

      const aftermathChoice = aftermathChoices[day];
      if (aftermathChoice) {
        await page.waitForSelector(".screen--event");
        await clickAction(page, "event-choice", aftermathChoice);
      }
      if (day < 7) {
        await page.waitForSelector(".screen--result");
        await clickAction(page, "next-day");
      }
    }

    const day7Waves = waveEvidence
      .filter((entry, index, all) => (
        entry.day === 7
        && all.findIndex((candidate) => candidate.day === entry.day && candidate.wave === entry.wave) === index
      ))
      .sort((left, right) => left.wave - right.wave);
    assert(day7Waves.length === 3, `Branch ${branch} must visibly complete all three Day 7 waves`);
    assert(day7Waves[2]?.threatId === expectedWaveThree, `Branch ${branch} wave-three evidence is missing ${expectedWaveThree}`);
    assert(interactionAudit?.threatId === expectedWaveThree, `Branch ${branch} must complete the ${expectedWaveThree} threat-interaction UI`);

    await page.waitForSelector(".screen--event");
    await clickAction(page, "event-choice", "inspect");
    await page.waitForSelector('[data-event-id="EV051"]');
    assert(
      await page.locator('[data-action="event-choice"]').count() === 4,
      "Finale must show four visible decisions",
    );
    assert(
      await page.locator(
        '[data-action="event-choice"][data-value="open"]:not([disabled])',
      ).count() === 1,
      "Open finale decision must remain usable",
    );

    let compactFinale;
    if (runCompactFinale) {
      compactFinale = await auditCompactFinale(page, branchDirectory);
    } else {
      await page.screenshot({
        path: resolve(branchDirectory, "day7-four-decisions.png"),
        fullPage: true,
      });
      await clickAction(page, "event-choice", "open");
      await page.waitForSelector('[data-event-id="EV052"]');
      await clickAction(page, "event-choice", "truth");
      await page.waitForSelector(".screen--result");
    }

    const savedRun = await readSavedRun(page);
    assert(savedRun.day === 7 && savedRun.ended === true, `Branch ${branch} must finish on Day 7`);
    assert(savedRun.story.flags.day4Route === branch, `Browser flow must preserve the ${branch} Day 4 branch`);
    assert(savedRun.story.completedContactWaves === 3, `Branch ${branch} must persist all three finale contacts`);
    assert(savedRun.story.finalDecision === "open", `Branch ${branch} must preserve the visible finale decision`);
    assert(savedRun.story.endingId, `Branch ${branch} must lock exactly one ending`);
    assert(browserErrors.length === 0, `Branch ${branch} browser errors: ${browserErrors.join(" | ")}`);

    await page.screenshot({
      path: resolve(branchDirectory, "day7-ending.png"),
      fullPage: true,
    });

    branchReport = {
      status: "passed",
      branch,
      viewport: STANDARD_VIEWPORT,
      day: savedRun.day,
      day4Route: savedRun.story.flags.day4Route,
      completedContactWaves: savedRun.story.completedContactWaves,
      finalDecision: savedRun.story.finalDecision,
      endingId: savedRun.story.endingId,
      expectedDay7WaveThree: expectedWaveThree,
      day7Waves,
      interactionAudit,
      compactFinale,
      day4ResourceFixture,
      encounteredThreats: [...encounteredThreats],
      screenshots: 4,
      videos: 1,
    };
    return branchReport;
  } catch (error) {
    const runSnapshot = page.isClosed()
      ? undefined
      : await readSavedRun(page).catch(() => undefined);
    const diagnosticRelativePath = `output/playwright/story-flow/${branch.toLowerCase()}/failure-diagnostic.json`;
    const screenshotRelativePath = `output/playwright/story-flow/${branch.toLowerCase()}/failure-last-frame.png`;
    const screenshotSaved = page.isClosed()
      ? false
      : await page.screenshot({
          path: resolve(branchDirectory, "failure-last-frame.png"),
          fullPage: true,
        }).then(() => true).catch(() => false);
    const diagnostic = {
      generatedAt: new Date().toISOString(),
      branch,
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      pageUrl: page.isClosed() ? undefined : page.url(),
      runSnapshot,
      runSummary: diagnosticRunSummary(runSnapshot),
      day4ResourceFixture,
      browserErrors,
      waveEvidence,
      screenshot: screenshotSaved ? screenshotRelativePath : undefined,
    };
    const diagnosticSaved = await writeFile(
      resolve(branchDirectory, "failure-diagnostic.json"),
      `${JSON.stringify(diagnostic, null, 2)}\n`,
      "utf8",
    ).then(() => true).catch(() => false);
    if (error && typeof error === "object") {
      error.storyAuditDiagnostic = {
        path: diagnosticSaved ? diagnosticRelativePath : undefined,
        screenshot: screenshotSaved ? screenshotRelativePath : undefined,
        runSummary: diagnostic.runSummary,
        day4ResourceFixture,
      };
    }
    throw error;
  } finally {
    if (!page.isClosed()) await page.close().catch(() => undefined);
    const outputVideoPath = resolve(
      branchDirectory,
      `${branch.toLowerCase()}-day1-7-story-playthrough.webm`,
    );
    if (branchReport?.status === "passed") {
      assert(storyVideo, `${branch} passed without a browser video handle`);
      await storyVideo.saveAs(outputVideoPath);
      const publicVideoName = PUBLIC_VIDEO_NAMES[branch];
      const publicVideoPath = resolve(publicVideoDirectory, publicVideoName);
      await copyFile(outputVideoPath, publicVideoPath);
      const videoStats = await stat(publicVideoPath);
      branchReport.video = {
        output: `output/playwright/story-flow/${branch.toLowerCase()}/${branch.toLowerCase()}-day1-7-story-playthrough.webm`,
        public: `public/assets/video/${publicVideoName}`,
        bytes: videoStats.size,
      };
    } else {
      await storyVideo?.saveAs(outputVideoPath).catch(() => undefined);
    }
    await context.close().catch(() => undefined);
  }
}

await Promise.all([
  mkdir(outputDirectory, { recursive: true }),
  mkdir(resolve("public/assets/qa"), { recursive: true }),
  mkdir(publicVideoDirectory, { recursive: true }),
]);

const browser = await chromium.launch({ headless: true });
const branchReports = [];
try {
  for (const branch of requestedBranches) {
    try {
      branchReports.push(await runBranch(browser, branch));
    } catch (error) {
      branchReports.push({
        status: "failed",
        branch,
        expectedDay7WaveThree: EXPECTED_DAY7_WAVE_THREE[branch],
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        diagnostic: error && typeof error === "object" ? error.storyAuditDiagnostic : undefined,
      });
    }
  }
} finally {
  await browser.close();
}

const failures = branchReports.filter((report) => report.status !== "passed");
const report = {
  status: failures.length === 0 ? "passed" : "failed",
  generatedAt: new Date().toISOString(),
  baseUrl,
  requestedBranches,
  branchThreatMatrix: EXPECTED_DAY7_WAVE_THREE,
  threatInteractionSelector: '[data-testid="threat-interaction"][data-threat-id] [data-action="threat-interact"][data-value]',
  allowLegacyThreatUi,
  fixturePolicy: DAY4_RESOURCE_FIXTURE_POLICY,
  compactFinale: runCompactFinale
    ? { viewport: COMPACT_VIEWPORT, textScale: COMPACT_TEXT_SCALE }
    : "skipped",
  branches: branchReports,
};
const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(resolve(outputDirectory, "story-flow-report.json"), serializedReport, "utf8");
await writeFile(resolve("public/assets/qa/story-flow-report.json"), serializedReport, "utf8");
console.log(serializedReport);

if (failures.length > 0) {
  throw new Error(
    `Story audit failed: ${failures.map((failure) => `${failure.branch}: ${failure.error}`).join(" | ")}`,
  );
}
