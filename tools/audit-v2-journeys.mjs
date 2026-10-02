import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.GAME_URL ?? "http://127.0.0.1:4177";
const evidenceRoot = resolve("docs/evidence/v2");
const screenshotRoot = resolve(evidenceRoot, "screenshots");
const reportPath = resolve(evidenceRoot, "journey-qa.json");
await mkdir(screenshotRoot, { recursive: true });

const allRoutes = ["R01", "R02", "R03"];
const requestedRoutes = process.env.JOURNEY_ROUTE
  ? allRoutes.filter((routeId) => routeId === process.env.JOURNEY_ROUTE)
  : allRoutes;

const defaultReport = {
  status: "running",
  generatedAt: new Date().toISOString(),
  baseUrl,
  metadata: {
    fixtureInjection: false,
    checkpointInjection: false,
    browserContexts: "one fresh isolated context per route",
    stateUse: "read-only ntwp.v2.current for choosing visible legal controls",
    strategy: "safe; RN01, standard/strict ration, finite-tool counters, visible puzzle evidence",
  },
  routes: [],
  failures: [],
};
let report = defaultReport;
if (process.env.JOURNEY_APPEND === "1") {
  try {
    const previous = JSON.parse(await readFile(reportPath, "utf8"));
    report = {
      ...previous,
      status: "running",
      generatedAt: new Date().toISOString(),
      routes: previous.routes
        .filter((route) => !requestedRoutes.includes(route.routeId))
        .map((route) => ({ textScale: 100, ...route })),
      failures: previous.failures.filter((failure) => !requestedRoutes.includes(failure.routeId)),
    };
  } catch {
    report = defaultReport;
  }
}

function assert(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

async function readEnvelope(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("ntwp.v2.current");
    return raw ? JSON.parse(raw) : null;
  });
}

async function screenName(page) {
  return page.locator(".screen").first().getAttribute("class");
}

function runSnapshot(envelope, screen) {
  const run = envelope?.run;
  if (!run) return { screen };
  return {
    screen,
    day: run.day,
    phase: run.phase,
    event: run.activeEventId ?? null,
    contact: run.activeContact?.definitionId ?? null,
    contactId: run.activeContact?.id ?? null,
    ap: run.actionPoints,
    resources: { ...run.resources },
    health: run.survivor.health,
    stress: run.survivor.stress,
    infection: run.survivor.infection,
    trust: run.survivor.trust,
    sleep: run.survivor.sleep,
    hull: run.environment.hull,
    ended: run.ended,
    outcome: run.outcome,
  };
}

async function clickLocator(page, routeReport, locator, action, value, label) {
  await locator.waitFor({ state: "visible", timeout: 12_000 });
  const beforeEnvelope = await readEnvelope(page);
  const beforeScreen = await screenName(page);
  const before = runSnapshot(beforeEnvelope, beforeScreen);
  let recoveredFromDetach = false;
  try {
    await locator.click({ timeout: 6_000 });
  } catch (error) {
    await page.waitForTimeout(130);
    const interimEnvelope = await readEnvelope(page);
    const interimScreen = await screenName(page);
    const progressed =
      JSON.stringify(interimEnvelope) !== JSON.stringify(beforeEnvelope) ||
      interimScreen !== beforeScreen;
    if (!progressed) throw error;
    recoveredFromDetach = true;
  }
  await page.waitForTimeout(130);
  const afterEnvelope = await readEnvelope(page);
  const after = runSnapshot(afterEnvelope, await screenName(page));
  routeReport.clicks.push({
    index: routeReport.clicks.length + 1,
    action,
    value: value ?? null,
    label: label ?? null,
    ...(recoveredFromDetach ? { recoveredFromDetach: true } : {}),
    before,
    after,
  });
  return afterEnvelope;
}

async function actionLocator(page, action, value, enabledOnly = true) {
  const suffix = value === undefined ? "" : `[data-value="${value}"]`;
  const enabled = enabledOnly ? ":not([disabled])" : "";
  return page.locator(`[data-action="${action}"]${suffix}${enabled}`).filter({ visible: true }).first();
}

async function clickAction(page, routeReport, action, value, label, enabledOnly = true) {
  const locator = await actionLocator(page, action, value, enabledOnly);
  return clickLocator(page, routeReport, locator, action, value, label);
}

async function hasAction(page, action, value, enabledOnly = true) {
  const locator = await actionLocator(page, action, value, enabledOnly);
  return (await locator.count()) > 0;
}

async function confirmPreview(page, routeReport, actionValue, label) {
  await clickAction(page, routeReport, "preview-action", actionValue, `${label}：查看成本`);
  assert(await page.locator(".object-preview").count() === 1, `${label} must open a cost preview`);
  await clickAction(page, routeReport, "confirm-object-action", undefined, `${label}：確認`);
}

async function chooseEvent(page, routeReport, run) {
  const eventId =
    run.activeEventId ??
    (await page.locator(".screen--event").getAttribute("data-event-id"));
  assert(Boolean(eventId), "event screen must have activeEventId", runSnapshot({ run }, await screenName(page)));
  await page.waitForTimeout(650);
  const preferred = {
    EV044: ["GO"],
    EV048: ["tell", "hide"],
    EV051: ["open"],
    EV052: ["truth"],
    EV057: ["CARE"],
    EV063: run.story.whiteFrost?.thermal.committedDay === 7
      ? ["warm", "emergency-warm"]
      : ["thermal-board"],
    EV064: ["manual", "deice", "wait", "ram"],
    EV065: ["emergency-stop", "shield", "joint", "a07-plan"],
    EV072: ["FILTER"],
    EV078: ["quarantine", "seedbank", "symbiosis", "firebreak"],
  }[eventId] ?? [];

  for (const value of preferred) {
    if (await hasAction(page, "event-choice", value)) {
      const label = await (await actionLocator(page, "event-choice", value)).textContent();
      await clickAction(page, routeReport, "event-choice", value, label?.trim());
      return;
    }
  }
  for (const risk of ["risk-low", "risk-medium", "risk-high", "risk-irreversible"]) {
    const choice = page.locator(`.choice-card.${risk}:not([disabled])`).first();
    if (await choice.count()) {
      const value = await choice.getAttribute("data-value");
      await clickLocator(page, routeReport, choice, "event-choice", value, (await choice.textContent())?.trim());
      return;
    }
  }
  const fallback = page.locator('[data-action="event-choice"]:not([disabled])').first();
  assert(await fallback.count() > 0, `event ${eventId} must expose a legal visible choice`, {
    eventId,
    text: await page.locator(".event-card").textContent(),
  });
  const value = await fallback.getAttribute("data-value");
  await clickLocator(page, routeReport, fallback, "event-choice", value, (await fallback.textContent())?.trim());
}

async function setRation(page, routeReport, run) {
  await clickAction(page, routeReport, "meal", undefined, "打開配餐");
  const mode = run.resources.food >= 1 && run.resources.water >= 1
    ? "standard"
    : run.resources.water >= 1
      ? "strict"
      : null;
  if (mode && await hasAction(page, "select-ration", mode)) {
    await clickAction(page, routeReport, "select-ration", mode, `配餐 ${mode}`);
  }
  if (await hasAction(page, "meal")) await clickAction(page, routeReport, "meal", undefined, "收起配餐");
}

async function runRefill(page, routeReport, actionId, carriage) {
  await clickAction(page, routeReport, "select-carriage", carriage, `前往${carriage}`);
  await clickAction(page, routeReport, "open-refill", carriage, `打開${carriage}補給`);
  const value = `refill-supplies|${actionId}`;
  if (await hasAction(page, "preview-action", value)) {
    await confirmPreview(page, routeReport, value, actionId);
    return true;
  }
  if (await hasAction(page, "cancel-object-action")) {
    await clickAction(page, routeReport, "cancel-object-action", undefined, "關閉不可用補給");
  }
  return false;
}

async function manageCrop(page, routeReport, run) {
  await clickAction(page, routeReport, "select-carriage", "greenhouse", "前往溫室");
  let current = (await readEnvelope(page)).run;
  const plot = current.crops.find((item) => item.id === "plot-a");
  if (plot?.cropId && plot.stage >= 3 && current.actionPoints >= 1) {
    const value = "harvest-crop|plot-a";
    if (await hasAction(page, "preview-action", value))
      await confirmPreview(page, routeReport, value, "收成上層槽");
    current = (await readEnvelope(page)).run;
  }
  const growing = current.crops.find((item) => item.id === "plot-a");
  if (
    growing?.cropId &&
    growing.stage < 3 &&
    growing.wateredDay !== current.day &&
    current.resources.water >= 1
  ) {
    const value = "water-crops|";
    if (await hasAction(page, "preview-action", value))
      await confirmPreview(page, routeReport, value, "灌溉作物");
    current = (await readEnvelope(page)).run;
  }
  const empty = current.crops.find((item) => item.id === "plot-a");
  if (!empty?.cropId && current.actionPoints >= 1 && current.resources.water >= 1) {
    await clickAction(page, routeReport, "select-crop", "lettuce", "選擇葉萵苣");
    const value = "plant-crop|plot-a:lettuce";
    if (await hasAction(page, "preview-action", value))
      await confirmPreview(page, routeReport, value, "播種葉萵苣");
  }
}

async function runPrep(page, routeReport, plannedDays) {
  let envelope = await readEnvelope(page);
  let run = envelope.run;
  if (plannedDays.has(run.day)) return;
  plannedDays.add(run.day);
  routeReport.days.push({ day: run.day, prepStart: runSnapshot(envelope, await screenName(page)) });

  await setRation(page, routeReport, run);
  run = (await readEnvelope(page)).run;

  // Open the route-appropriate power tool once each day. R01 also restores any
  // accidentally disabled critical module without charging AP.
  await clickAction(page, routeReport, "power", undefined, "檢查配電／路線工具");
  if (run.routeId === "R01") {
    for (const moduleId of ["M001", "M002", "M003"]) {
      const current = (await readEnvelope(page)).run.modules.find((item) => item.definitionId === moduleId);
      if (current && !current.active && await hasAction(page, "toggle-power", moduleId))
        await clickAction(page, routeReport, "toggle-power", moduleId, `恢復 ${moduleId}`);
    }
  }
  if (await hasAction(page, "power")) await clickAction(page, routeReport, "power", undefined, "收起配電／路線工具");

  run = (await readEnvelope(page)).run;
  if (run.resources.energy <= 15 && run.resources.parts >= 2 && run.actionPoints >= 1)
    await runRefill(page, routeReport, "refill-battery", "workshop");
  run = (await readEnvelope(page)).run;
  if (run.resources.water <= 2 && run.resources.energy >= 3 && run.actionPoints >= 1)
    await runRefill(page, routeReport, "refill-water", "kitchen");
  run = (await readEnvelope(page)).run;
  if (run.resources.food <= 1 && run.resources.water >= 1 && run.actionPoints >= 1)
    await runRefill(page, routeReport, "refill-rations", "kitchen");

  run = (await readEnvelope(page)).run;
  if (run.environment.hull < 90 && run.actionPoints >= 2 && run.resources.parts >= 2) {
    await clickAction(page, routeReport, "select-carriage", "defense", "前往防禦車廂");
    if (await hasAction(page, "preview-action", "repair-hull|"))
      await confirmPreview(page, routeReport, "repair-hull|", "修補車體");
  }

  await manageCrop(page, routeReport, (await readEnvelope(page)).run);
  run = (await readEnvelope(page)).run;
  if (
    run.resources.parts <= 3 &&
    run.actionPoints >= 2 &&
    !run.flags.includes(`workshop-scrap-${run.day}`)
  ) {
    await clickAction(page, routeReport, "select-carriage", "workshop", "前往工坊");
    if (await hasAction(page, "preview-action", "workshop-scrap|"))
      await confirmPreview(page, routeReport, "workshop-scrap|", "整理回收件");
  }
  run = (await readEnvelope(page)).run;
  if (run.actionPoints >= 1 && run.survivor.stress >= 24 && !run.flags.includes(`comforted-${run.day}`)) {
    await clickAction(page, routeReport, "select-carriage", "sleep", "前往臥室");
    if (await hasAction(page, "preview-action", "comfort|"))
      await confirmPreview(page, routeReport, "comfort|", "安撫 A-07");
  }
  run = (await readEnvelope(page)).run;
  if (
    run.actionPoints >= 1 &&
    run.resources.medicine >= 1 &&
    (run.survivor.health < 55 || run.survivor.infection >= 15)
  ) {
    await clickAction(page, routeReport, "select-carriage", "sleep", "前往醫療盒");
    if (await hasAction(page, "preview-action", "use-medicine|"))
      await confirmPreview(page, routeReport, "use-medicine|", "使用藥品");
  }
}

async function chooseSafeRoute(page, routeReport) {
  if (await hasAction(page, "select-route", "RN01"))
    await clickAction(page, routeReport, "select-route", "RN01", "選擇快速幹線");
  if (await hasAction(page, "confirm-route", "RN01")) {
    await clickAction(page, routeReport, "confirm-route", "RN01", "確認快速幹線");
    return;
  }
  if (await hasAction(page, "emergency-route")) {
    await clickAction(page, routeReport, "emergency-route", undefined, "啟動慣性滑行");
    return;
  }
  throw new Error("Route screen has no legal RN01 confirmation or emergency route.");
}

async function settleThermalBoard(page, routeReport, run) {
  const allocation = [
    ["H1", "BERTH"],
    ["H2", "BERTH"],
    ["H3", "DEICER"],
    ["H4", "DEICER"],
    ["H5", "LOOP"],
    ["H6", "LOOP"],
  ];
  for (const [tokenId, zone] of allocation) {
    const current = (await readEnvelope(page)).run.story.whiteFrost.thermal.tokens.find((item) => item.id === tokenId);
    if (current?.zone === zone) continue;
    await clickAction(page, routeReport, "thermal-select", tokenId, `選取 ${tokenId}`);
    await clickAction(page, routeReport, "thermal-target", zone, `${tokenId} 移至 ${zone}`);
  }
  await clickAction(page, routeReport, "thermal-commit", undefined, "提交 Day 7 熱力配置");
}

async function solveGreenCycle(page, routeReport, run) {
  const interaction = run.activeContact.interaction;
  for (const sampleId of interaction.contaminatedSampleIds) {
    await clickAction(page, routeReport, "threat-interact", `cycle:select:${sampleId}`, `選取污染水樣 ${sampleId}`);
    await clickAction(page, routeReport, "threat-interact", `cycle:inspect:${sampleId}`, `檢查污染水樣 ${sampleId}`);
  }
  let cleanIndex = 0;
  const refreshed = (await readEnvelope(page)).run;
  for (const sample of refreshed.story.greenTide.cycle.samples) {
    const zone = sample.quality === "tainted"
      ? "FILTER"
      : cleanIndex++ === 0
        ? "GROW_A"
        : "GROW_B";
    await clickAction(page, routeReport, "threat-interact", `cycle:select:${sample.id}`, `選取水樣 ${sample.id}`);
    await clickAction(page, routeReport, "threat-interact", `cycle:target:${zone}`, `${sample.id} 移至 ${zone}`);
  }
  await clickAction(page, routeReport, "threat-interact", "cycle:commit", "提交循環檢疫");
  if ((await readEnvelope(page)).run.activeContact?.interaction?.kind !== "T013") return;
  for (const sample of (await readEnvelope(page)).run.story.greenTide.cycle.samples) {
    await clickAction(page, routeReport, "threat-interact", `cycle:select:${sample.id}`, `重新選取 ${sample.id}`);
    await clickAction(page, routeReport, "threat-interact", "cycle:target:DRAIN", `${sample.id} 改送排放`);
  }
  await clickAction(page, routeReport, "threat-interact", "cycle:commit", "提交全排放備援");
  if ((await readEnvelope(page)).run.activeContact?.interaction?.kind === "T013" && await hasAction(page, "threat-interact", "cycle:manual-drain"))
    await clickAction(page, routeReport, "threat-interact", "cycle:manual-drain", "手動排空備援");
}

async function solveNightContact(page, routeReport, run) {
  const contact = run.activeContact;
  assert(Boolean(contact), "night phase must expose an active contact", runSnapshot({ run }, await screenName(page)));
  const interaction = contact.interaction;
  if (interaction?.kind === "T004") {
    const tool = page.locator('[data-threat-tool="cutter"]').first();
    await clickLocator(page, routeReport, tool, "arm-threat-tool", "cutter", "拿起割具");
    await clickAction(page, routeReport, "threat-interact", `cutter:${interaction.targetPlotId}`, `割除 ${interaction.targetPlotId}`);
    return;
  }
  if (interaction?.kind === "T005") {
    await clickAction(page, routeReport, "threat-interact", `signal:${interaction.targetSignalId}`, `比對 ${interaction.targetSignalId}`);
    return;
  }
  if (interaction?.kind === "T006") {
    const command = interaction.mode === "leaf" ? "trace:leaves" : "trace:meter";
    await clickAction(page, routeReport, "threat-interact", command, command);
    return;
  }
  if (interaction?.kind === "T008") {
    await clickAction(page, routeReport, "threat-interact", `lurker:inspect:${interaction.targetZone}`, `檢查 ${interaction.targetZone}`);
    await clickAction(page, routeReport, "threat-interact", `lurker:mark:${interaction.targetZone}`, `標記 ${interaction.targetZone}`);
    return;
  }
  if (interaction?.kind === "T009") {
    for (const zone of interaction.requiredZones)
      await clickAction(page, routeReport, "threat-interact", `frost:inspect:${zone}`, `檢查霜區 ${zone}`);
    await clickAction(page, routeReport, "threat-interact", "frost:confirm", "確認暴風雪熱路");
    if ((await readEnvelope(page)).run.activeContact?.interaction?.kind === "T009" && await hasAction(page, "threat-interact", "frost:manual-scrape"))
      await clickAction(page, routeReport, "threat-interact", "frost:manual-scrape", "人工刮冰備援");
    return;
  }
  if (interaction?.kind === "T013") {
    await solveGreenCycle(page, routeReport, run);
    return;
  }

  if (contact.definitionId === "T003") {
    const layout = await page.locator(".emergency-actions").evaluate((panel) => {
      const grid = panel.querySelector(":scope > div");
      const buttons = [...panel.querySelectorAll('[data-action="counter"]')];
      return {
        columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length : 0,
        buttons: buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return {
            value: button.getAttribute("data-value"),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            centerClear: top === button || Boolean(top && button.contains(top)),
          };
        }),
      };
    });
    assert(
      layout.columns === 2 &&
        layout.buttons.length === 4 &&
        layout.buttons.every((button) => button.width >= 48 && button.height >= 48 && button.centerClear),
      `T003 exposes four reachable counters in a 2×2 grid at ${routeReport.textScale}% text`,
      layout,
    );
    routeReport.t003Layouts ??= [];
    routeReport.t003Layouts.push({ day: run.day, textScale: routeReport.textScale, ...layout });
  }

  const preferred = contact.definitionId === "T003"
    ? ["roof-release", "emergency-boost", "brace-impact"]
    : contact.definitionId === "T002"
      ? ["close-shutter", "shock-window", "brace-impact"]
      : ["close-shutter", "shock-window", "emergency-boost", "roof-release", "brace-impact"];
  for (const counterId of preferred) {
    if (await hasAction(page, "counter", counterId)) {
      await clickAction(page, routeReport, "counter", counterId, `反制 ${counterId}`);
      return;
    }
  }
  const first = page.locator('[data-action="counter"]:not([disabled])').first();
  assert(await first.count() > 0, `contact ${contact.definitionId} must expose a legal counter`, {
    contact,
    text: await page.locator(".emergency-actions, .threat-interaction-panel").textContent(),
  });
  await clickLocator(page, routeReport, first, "counter", await first.getAttribute("data-value"), (await first.textContent())?.trim());
}

async function runJourney(browser, routeId) {
  const routeReport = {
    routeId,
    textScale: Number(process.env.JOURNEY_TEXT_SCALE ?? 100),
    mode: routeId === "R01" ? "formal" : "explicit-preview-entry",
    status: "running",
    clicks: [],
    days: [],
    ending: null,
    profile: null,
  };
  report.routes.push(routeReport);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-TW" });
  const page = await context.newPage();
  const plannedDays = new Set();
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector(".screen--menu");
    assert((await readEnvelope(page)) === null, `${routeId} starts in a fresh context without save injection`);
    await clickAction(page, routeReport, "settings", undefined, "開啟設定");
    const textScaleClicks = routeReport.textScale === 140
      ? 2
      : routeReport.textScale === 120
        ? 1
        : 0;
    for (let index = 0; index < textScaleClicks; index += 1)
      await clickAction(page, routeReport, "cycle-text", undefined, `文字比例 ${index + 1}`);
    await clickAction(page, routeReport, "toggle-countdown", undefined, "啟用事件無倒數");
    await clickAction(page, routeReport, "toggle-sound", undefined, "關閉 QA 音效");
    await clickAction(page, routeReport, "menu", undefined, "返回主選單");
    await clickAction(page, routeReport, "new-game", routeId, `開始 ${routeId}`);

    let steps = 0;
    while (steps < 500) {
      steps += 1;
      const envelope = await readEnvelope(page);
      const run = envelope?.run;
      assert(Boolean(run), `${routeId} must retain a saved authoritative run`);
      if (run.ended) {
        routeReport.status = "passed";
        routeReport.ending = {
          day: run.day,
          phase: run.phase,
          outcome: run.outcome,
          endingId: routeId === "R02"
            ? run.story.whiteFrost?.endingId
            : routeId === "R03"
              ? run.story.greenTide?.endingId
              : run.story.endingId,
          resources: run.resources,
          survivor: run.survivor,
          hull: run.environment.hull,
          lastMessage: run.lastMessage,
          clickCount: routeReport.clicks.length,
        };
        routeReport.profile = {
          routeUnlocks: envelope.profile.routeUnlocks,
          endingJournal: envelope.profile.journal.filter((entry) => entry.startsWith("ending:")),
        };
        assert(run.day === 7, `${routeId} reaches a real Day 7 ending`, routeReport.ending);
        assert(run.outcome === "victory", `${routeId} safe UI journey ends in victory`, routeReport.ending);
        assert(routeReport.profile.endingJournal.length > 0, `${routeId} ending is recorded in the real Profile`, routeReport.profile);
        if (routeId === "R01")
          assert(envelope.profile.routeUnlocks.includes("R02"), "R01 seven-night completion unlocks R02 in Profile", routeReport.profile);
        if (routeId === "R03")
          assert(!envelope.profile.routeUnlocks.includes("R03"), "fresh R03 preview does not fake formal unlock without five claimed tutorials", routeReport.profile);
        await page.screenshot({ path: resolve(screenshotRoot, `journey-${routeId}-ending.png`) });
        break;
      }

      if (await page.locator(".screen--menu").count()) {
        await clickAction(page, routeReport, "continue", undefined, "HMR 後續局");
        continue;
      }

      if (run.activeEventId || await page.locator(".screen--event").count()) {
        await page.waitForSelector(".screen--event");
        await chooseEvent(page, routeReport, run);
        continue;
      }
      if (await page.locator(".screen--route").count()) {
        await chooseSafeRoute(page, routeReport);
        continue;
      }
      if (
        routeId === "R02" &&
        run.day === 7 &&
        run.story.whiteFrost?.finaleStage === "warm" &&
        run.story.whiteFrost.thermal.committedDay !== 7 &&
        await page.locator(".thermal-board").count()
      ) {
        await settleThermalBoard(page, routeReport, run);
        continue;
      }
      if (run.phase === "prep") {
        await page.waitForSelector(".screen--carriage.is-prep");
        await runPrep(page, routeReport, plannedDays);
        if (await hasAction(page, "route"))
          await clickAction(page, routeReport, "route", undefined, "前往路線規劃");
        continue;
      }
      if (run.phase === "route") {
        await page.waitForSelector(".screen--route");
        await chooseSafeRoute(page, routeReport);
        continue;
      }
      if (run.phase === "night") {
        await page.waitForSelector(".screen--carriage.is-night");
        await solveNightContact(page, routeReport, run);
        continue;
      }
      if (run.phase === "aftermath") {
        await page.waitForSelector(".screen--result");
        const existing = routeReport.days.find((entry) => entry.day === run.day);
        if (existing) existing.aftermath = runSnapshot(envelope, await screenName(page));
        else routeReport.days.push({ day: run.day, aftermath: runSnapshot(envelope, await screenName(page)) });
        await clickAction(page, routeReport, "next-day", undefined, `進入第 ${run.day + 1} 日`);
        continue;
      }
      throw new Error(`${routeId} reached unsupported UI state ${run.phase}`);
    }
    assert(routeReport.status === "passed", `${routeId} must finish within 500 UI decision steps`, {
      clicks: routeReport.clicks.length,
      last: runSnapshot(await readEnvelope(page), await screenName(page)),
    });
  } catch (error) {
    routeReport.status = "failed";
    const envelope = await readEnvelope(page).catch(() => null);
    routeReport.failure = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      details: error?.details,
      state: runSnapshot(envelope, await screenName(page).catch(() => "unknown")),
    };
    await page.screenshot({ path: resolve(screenshotRoot, `journey-${routeId}-failure.png`) }).catch(() => undefined);
    report.failures.push({ routeId, ...routeReport.failure });
  } finally {
    await context.close();
    report.generatedAt = new Date().toISOString();
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
}

const browser = await chromium.launch({ headless: true });
try {
  for (const routeId of requestedRoutes) await runJourney(browser, routeId);
  report.status = report.routes.every((route) => route.status === "passed")
    ? "passed"
    : "failed";
} finally {
  report.generatedAt = new Date().toISOString();
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await browser.close();
}

if (report.status !== "passed") {
  throw new Error(`Journey QA failed: ${report.failures.map((failure) => `${failure.routeId}:${failure.message}`).join(" | ")}`);
}
console.log(`V2 journey QA passed for ${report.routes.map((route) => route.routeId).join(", ")}.`);
