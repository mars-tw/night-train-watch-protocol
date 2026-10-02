import { mkdir, rename, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.GAME_URL ?? "http://127.0.0.1:4177";
const outputRoot = resolve("output/playwright/promo-v211");
const videoRoot = resolve(outputRoot, "raw");
await mkdir(videoRoot, { recursive: true });

const startedAt = Date.now();
const report = {
  title: "夜行列車 v2.1.1 真實遊玩宣傳素材",
  generatedAt: new Date().toISOString(),
  baseUrl,
  viewport: { width: 390, height: 844 },
  constraints: {
    freshIsolatedContext: true,
    writesThroughVisibleUiOnly: true,
    saveOrResourceInjection: false,
    phaseOrCheckpointInjection: false,
    localStorageUse: "read-only ntwp.v2.current summaries for legal-control routing",
    playbackSpeed: "normal; no time manipulation",
  },
  shots: [],
  actions: [],
  warnings: [],
};

const seconds = () => Number(((Date.now() - startedAt) / 1000).toFixed(3));

async function envelope(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("ntwp.v2.current");
    return raw ? JSON.parse(raw) : null;
  });
}

function summary(value) {
  const run = value?.run;
  if (!run) return null;
  return {
    day: run.day,
    phase: run.phase,
    routeId: run.routeId,
    ap: run.actionPoints,
    resources: { ...run.resources },
    health: run.survivor?.health,
    stress: run.survivor?.stress,
    hull: run.environment?.hull,
    event: run.activeEventId ?? null,
    contact: run.activeContact?.definitionId ?? null,
    interaction: run.activeContact?.interaction?.kind ?? null,
    expeditionNode: run.activeExpedition?.nodeIndex ?? null,
    ended: run.ended,
    outcome: run.outcome ?? null,
  };
}

async function shot(page, label, fn, holdBefore = 0.7, holdAfter = 1.2) {
  await page.waitForTimeout(holdBefore * 1000);
  const start = seconds();
  const before = summary(await envelope(page));
  await fn();
  await page.waitForTimeout(holdAfter * 1000);
  const end = seconds();
  const after = summary(await envelope(page));
  report.shots.push({ label, start, end, duration: Number((end - start).toFixed(3)), before, after });
}

function locator(page, action, value, enabled = true) {
  const suffix = value === undefined ? "" : `[data-value="${value}"]`;
  return page.locator(`[data-action="${action}"]${suffix}${enabled ? ":not([disabled])" : ""}`).filter({ visible: true }).first();
}

async function has(page, action, value, enabled = true) {
  return (await locator(page, action, value, enabled).count()) > 0;
}

async function click(page, action, value, label = `${action}:${value ?? ""}`) {
  const target = locator(page, action, value);
  await target.waitFor({ state: "visible", timeout: 15_000 });
  const before = summary(await envelope(page));
  const at = seconds();
  await target.click({ timeout: 8_000 });
  await page.waitForTimeout(180);
  report.actions.push({ at, action, value: value ?? null, label, before, after: summary(await envelope(page)) });
}

async function confirmPreview(page, value, label) {
  await click(page, "preview-action", value, `${label}：查看成本`);
  await page.waitForSelector(".object-preview");
  await page.waitForTimeout(900);
  await click(page, "confirm-object-action", undefined, `${label}：確認執行`);
}

async function chooseEvent(page) {
  const preferred = ["GO", "tell", "open", "truth", "CARE", "FILTER"];
  for (const value of preferred) {
    if (await has(page, "event-choice", value)) return click(page, "event-choice", value, `事件選擇 ${value}`);
  }
  const target = page.locator('[data-action="event-choice"]:not([disabled])').filter({ visible: true }).last();
  await target.waitFor({ state: "visible" });
  const value = await target.getAttribute("data-value");
  return click(page, "event-choice", value ?? undefined, `事件選擇 ${value ?? "fallback"}`);
}

async function solveNight(page, run) {
  const contact = run.activeContact;
  const interaction = contact?.interaction;
  if (interaction?.kind === "T004") {
    const tool = page.locator('[data-action="arm-threat-tool"][data-threat-tool="cutter"]').first();
    await tool.click();
    await page.waitForTimeout(800);
    return click(page, "threat-interact", `cutter:${interaction.targetPlotId}`, "割除藤蔓根節");
  }
  if (interaction?.kind === "T005") return click(page, "threat-interact", `signal:${interaction.targetSignalId}`, "比對正確回聲");
  if (interaction?.kind === "T006") return click(page, "threat-interact", interaction.mode === "leaf" ? "trace:leaves" : "trace:meter", "循跡定位威脅");
  if (interaction?.kind === "T008") {
    await click(page, "threat-interact", `lurker:inspect:${interaction.targetZone}`, "檢查藏匿區");
    await page.waitForTimeout(900);
    return click(page, "threat-interact", `lurker:mark:${interaction.targetZone}`, "標記藏匿區");
  }
  const preferred = contact?.definitionId === "T003"
    ? ["roof-release", "emergency-boost", "brace-impact"]
    : ["close-shutter", "shock-window", "emergency-boost", "roof-release", "brace-impact"];
  for (const value of preferred) if (await has(page, "counter", value)) return click(page, "counter", value, `真實反制 ${value}`);
  const first = page.locator('[data-action="counter"]:not([disabled])').filter({ visible: true }).first();
  await first.waitFor({ state: "visible" });
  return click(page, "counter", (await first.getAttribute("data-value")) ?? undefined, "真實反制");
}

async function claimAvailable(page) {
  await click(page, "missions", undefined, "開啟任務日誌");
  await page.waitForTimeout(900);
  let claimed = 0;
  for (const filter of ["tutorial", "main", "all"]) {
    if (await has(page, "set-quest-filter", filter, false)) {
      await click(page, "set-quest-filter", filter, `任務分類 ${filter}`);
      await page.waitForTimeout(450);
    }
    for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
      const claim = page.locator('[data-action="claim-quest-rewards"]:not([disabled])').filter({ visible: true }).first();
      if (await claim.count()) {
        const value = await claim.getAttribute("data-value");
        await click(page, "claim-quest-rewards", value ?? undefined, `領取任務紀錄 ${value ?? ""}`);
        claimed += 1;
        await page.waitForTimeout(800);
        continue;
      }
      if (await has(page, "quest-page", "next")) {
        await click(page, "quest-page", "next", "任務下一頁");
        await page.waitForTimeout(350);
        continue;
      }
      break;
    }
  }
  if (!claimed) {
    report.warnings.push("任務日誌已拍攝，但此時沒有可領取任務；後續日程會再次檢查。");
  }
  await click(page, "hub", undefined, "返回車廂");
  if (await page.locator(".screen--hub").count()) {
    await click(page, "menu", undefined, "返回主選單");
    await click(page, "continue", undefined, "繼續目前守夜");
  }
}

async function recordHeroOnly() {
  const heroStartedAt = Date.now();
  const heroRoot = resolve("output/playwright/promo-v211/hero");
  await mkdir(heroRoot, { recursive: true });
  const heroBrowser = await chromium.launch({ headless: true });
  const heroContext = await heroBrowser.newContext({
    viewport: report.viewport,
    locale: "zh-TW",
    reducedMotion: "no-preference",
    recordVideo: { dir: heroRoot, size: report.viewport },
  });
  const heroPage = await heroContext.newPage();
  const heroVideo = heroPage.video();
  const pageCreatedAt = Date.now();
  const heroReport = {
    title: "夜行列車 v2.1.1 A-07 主床乾淨 Hero",
    generatedAt: new Date().toISOString(),
    baseUrl,
    viewport: report.viewport,
    constraints: {
      freshIsolatedContext: true,
      normalUiActionsOnly: true,
      saveOrResourceInjection: false,
      phaseOrCheckpointInjection: false,
      modalOrDrawerDuringHero: false,
      playbackSpeed: "normal; no time manipulation",
    },
    actions: [],
  };
  const heroSeconds = () => Number(((Date.now() - heroStartedAt) / 1000).toFixed(3));
  try {
    await heroPage.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await heroPage.waitForSelector(".screen--menu");
    if ((await envelope(heroPage)) !== null) throw new Error("Fresh hero context unexpectedly contains ntwp.v2.current.");
    await locator(heroPage, "new-game", "R01").click();
    heroReport.actions.push({ at: heroSeconds(), action: "new-game", value: "R01" });
    await heroPage.waitForSelector(".screen--carriage.is-prep");
    await locator(heroPage, "select-carriage", "sleep").click();
    heroReport.actions.push({ at: heroSeconds(), action: "select-carriage", value: "sleep" });
    await heroPage.waitForFunction(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth > 0),
      undefined,
      { timeout: 30_000 },
    );
    await heroPage.evaluate(async () => document.fonts?.ready);
    await heroPage.waitForTimeout(2_000);
    const cleanUi = await heroPage.evaluate(() => ({
      modalCount: document.querySelectorAll('[role="dialog"], .object-preview-backdrop, .bottom-sheet').length,
      drawerCount: document.querySelectorAll('[aria-expanded="true"]').length,
      activeCarriage: document.querySelector('[data-action="select-carriage"][aria-pressed="true"]')?.getAttribute("data-value"),
      screenClass: document.querySelector(".screen")?.className,
      imageCount: document.images.length,
      decodedImageCount: [...document.images].filter((image) => image.complete && image.naturalWidth > 0).length,
    }));
    if (cleanUi.modalCount || cleanUi.drawerCount || cleanUi.activeCarriage !== "sleep")
      throw new Error(`Hero UI is not clean: ${JSON.stringify(cleanUi)}`);
    const reportStart = heroSeconds();
    await heroPage.waitForTimeout(8_000);
    const reportEnd = heroSeconds();
    heroReport.status = "passed";
    heroReport.ui = cleanUi;
    heroReport.reportClockOffsetSeconds = Number(((pageCreatedAt - heroStartedAt) / 1000).toFixed(3));
    heroReport.shot = {
      label: "A-07 主床無遮擋真實動畫",
      reportStart,
      reportEnd,
      rawStart: Number((reportStart - heroReport.reportClockOffsetSeconds).toFixed(3)),
      rawEnd: Number((reportEnd - heroReport.reportClockOffsetSeconds).toFixed(3)),
      duration: Number((reportEnd - reportStart).toFixed(3)),
    };
  } catch (error) {
    heroReport.status = "failed";
    heroReport.error = { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined };
  } finally {
    await heroContext.close();
    await heroBrowser.close();
  }
  const rawPath = await heroVideo.path();
  const finalPath = resolve(heroRoot, `promo-v211-a07-hero-${Date.now()}.webm`);
  await rename(rawPath, finalPath);
  heroReport.video = {
    path: finalPath,
    audio: "none (Playwright recordVideo is video-only; no game audio is claimed)",
  };
  const reportPath = resolve(heroRoot, "promo-v211-a07-hero-report.json");
  await writeFile(reportPath, `${JSON.stringify(heroReport, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status: heroReport.status, video: finalPath, report: reportPath, shot: heroReport.shot, error: heroReport.error?.message }, null, 2));
  if (heroReport.status !== "passed") process.exitCode = 1;
}

if (process.env.PROMO_HERO === "1") {
  await recordHeroOnly();
  process.exit(process.exitCode ?? 0);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: report.viewport,
  locale: "zh-TW",
  reducedMotion: "no-preference",
  recordVideo: { dir: videoRoot, size: report.viewport },
});
const page = await context.newPage();
const video = page.video();
const videoPageCreatedAt = Date.now();

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".screen--menu");
  if ((await envelope(page)) !== null) throw new Error("Fresh context unexpectedly contains ntwp.v2.current.");

  await shot(page, "主選單與開場", async () => {
    await click(page, "settings", undefined, "開啟設定");
    await click(page, "toggle-countdown", undefined, "事件無倒數 ON");
    await click(page, "menu", undefined, "返回主選單");
    await click(page, "new-game", "R01", "開始正式 R01 新局");
  }, 1.0, 2.0);

  await shot(page, "A-07 主床呼吸動畫與安撫", async () => {
    await click(page, "select-carriage", "sleep", "進入臥室");
    if (await has(page, "inspect-object", "passenger-breathing")) {
      await click(page, "inspect-object", "passenger-breathing", "查看 A-07 呼吸與睡姿");
      await page.waitForTimeout(1200);
      if (await has(page, "cancel-object-action")) await click(page, "cancel-object-action", undefined, "關閉查看");
    }
    if (await has(page, "preview-action", "comfort|")) await confirmPreview(page, "comfort|", "安撫 A-07");
  }, 1.0, 2.0);

  await shot(page, "五節車廂真實圖片動畫巡覽", async () => {
    for (const carriage of ["sleep", "defense", "workshop", "kitchen", "greenhouse"]) {
      await click(page, "select-carriage", carriage, `巡覽 ${carriage}`);
      await page.waitForTimeout(1300);
    }
  }, 0.5, 1.5);

  await shot(page, "溫室播種與成本確認", async () => {
    if (await has(page, "select-crop", "lettuce")) await click(page, "select-crop", "lettuce", "選擇葉萵苣");
    if (await has(page, "preview-action", "plant-crop|plot-a:lettuce")) await confirmPreview(page, "plant-crop|plot-a:lettuce", "播種葉萵苣");
  }, 1.0, 2.0);

  await shot(page, "廚房熱食成本與正式烹煮", async () => {
    await click(page, "select-carriage", "kitchen", "前往廚房");
    await confirmPreview(page, "cook-meal|", "烹煮熱食");
    await click(page, "meal", undefined, "打開配餐");
    if (await has(page, "select-ration", "standard")) await click(page, "select-ration", "standard", "選擇標準配餐");
    if (await has(page, "meal")) await click(page, "meal", undefined, "收起配餐");
  }, 1.0, 2.0);

  await shot(page, "任務日誌與領取紀錄", () => claimAvailable(page), 0.8, 1.5);

  await shot(page, "紙本路線圖與 Day 1 停站探索", async () => {
    await click(page, "route", undefined, "展開紙本路線");
    if (await has(page, "preview-action", "start-expedition|")) {
      await confirmPreview(page, "start-expedition|", "開始停站探索");
      for (const value of ["survey", "improvise"]) {
        if (await has(page, "choose-expedition-step", value)) {
          await click(page, "choose-expedition-step", value, `探索節點 ${value}`);
          await page.waitForTimeout(1200);
        }
      }
      if (await has(page, "withdraw-expedition")) await click(page, "withdraw-expedition", undefined, "安全撤回探索");
    }
    await click(page, "select-route", "RN01", "選擇快速幹線");
    await page.waitForTimeout(1400);
    await click(page, "confirm-route", "RN01", "確認快速幹線");
  }, 1.0, 2.0);

  let guard = 0;
  let reachedDayTwo = false;
  while (guard++ < 80 && !reachedDayTwo) {
    const current = await envelope(page);
    const run = current?.run;
    if (!run) throw new Error("Authoritative run disappeared during recording.");
    if (run.activeEventId || await page.locator(".screen--event").count()) {
      await shot(page, `事件 ${run.activeEventId ?? "畫面"}`, () => chooseEvent(page), 1.0, 1.5);
      continue;
    }
    if (run.phase === "night") {
      await shot(page, `自然守夜威脅 ${run.activeContact?.definitionId ?? "接觸"} 與真實反制`, async () => {
        await page.waitForTimeout(1800);
        await solveNight(page, run);
      }, 1.2, 2.5);
      continue;
    }
    if (run.phase === "aftermath") {
      await shot(page, "黎明結算", async () => {
        await page.waitForTimeout(1800);
        await click(page, "next-day", undefined, "進入次日");
      }, 1.0, 2.0);
      continue;
    }
    if (run.day >= 2 && run.phase === "prep") reachedDayTwo = true;
    else if (run.phase === "route") {
      if (await has(page, "select-route", "RN01")) await click(page, "select-route", "RN01", "選擇 RN01");
      await click(page, "confirm-route", "RN01", "確認 RN01");
    } else if (run.phase === "prep") {
      await click(page, "route", undefined, "前往路線");
    }
  }
  if (!reachedDayTwo) throw new Error("Did not reach Day 2 through normal play.");

  await shot(page, "Day 2 紙本路線與三節點探索", async () => {
    await click(page, "route", undefined, "Day 2 打開紙本路線");
    if (await has(page, "preview-action", "start-expedition|")) await confirmPreview(page, "start-expedition|", "Day 2 開始探索");
    for (let node = 0; node < 3; node += 1) {
      if (await has(page, "choose-expedition-step", "survey")) await click(page, "choose-expedition-step", "survey", `探索節點 ${node + 1}：觀察`);
      else if (await has(page, "choose-expedition-step", "proper-tool")) await click(page, "choose-expedition-step", "proper-tool", `探索節點 ${node + 1}：工具`);
      else if (await has(page, "choose-expedition-step", "improvise")) await click(page, "choose-expedition-step", "improvise", `探索節點 ${node + 1}：臨時處置`);
      else if (await has(page, "preview-action", "choose-expedition-step|deep-dive")) await confirmPreview(page, "choose-expedition-step|deep-dive", `探索節點 ${node + 1}：深入`);
      else break;
      await page.waitForTimeout(1500);
    }
  }, 1.0, 2.5);

  if (await has(page, "missions")) await shot(page, "次日任務日誌補拍與領獎", () => claimAvailable(page), 0.8, 1.5);
  report.status = "passed";
  report.final = summary(await envelope(page));
} catch (error) {
  report.status = "failed";
  report.error = { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined };
  report.final = summary(await envelope(page).catch(() => null));
} finally {
  await context.close();
  await browser.close();
}

const rawPath = await video.path();
const finalVideoPath = resolve(videoRoot, `promo-v211-real-playthrough-${Date.now()}.webm`);
if (resolve(rawPath) !== finalVideoPath) await rename(rawPath, finalVideoPath);
report.video = { path: finalVideoPath, originalName: basename(rawPath), durationSeconds: seconds() };
report.video.audio = "none (Playwright recordVideo is video-only; no game audio is claimed)";
report.video.reportClockOffsetSeconds = Number(((videoPageCreatedAt - startedAt) / 1000).toFixed(3));
report.video.timelineMapping = "raw video second = report second - reportClockOffsetSeconds";
for (const entry of report.shots) {
  entry.rawStart = Number(Math.max(0, entry.start - report.video.reportClockOffsetSeconds).toFixed(3));
  entry.rawEnd = Number(Math.max(0, entry.end - report.video.reportClockOffsetSeconds).toFixed(3));
}
await writeFile(resolve(outputRoot, "promo-v211-timeline.json"), `${JSON.stringify(report.shots, null, 2)}\n`, "utf8");
await writeFile(resolve(outputRoot, "promo-v211-operation-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: report.status, video: finalVideoPath, report: resolve(outputRoot, "promo-v211-operation-report.json"), shots: report.shots.length, durationSeconds: report.video.durationSeconds, error: report.error?.message }, null, 2));
if (report.status !== "passed") process.exitCode = 1;
