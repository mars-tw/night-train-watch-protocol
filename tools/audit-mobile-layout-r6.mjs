import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.GAME_URL ?? "http://127.0.0.1:4177/";
const phase = process.env.AUDIT_PHASE ?? "after";
const out = process.env.EVIDENCE_DIR ?? "docs/evidence/v23";
const browserName = process.env.QA_BROWSER ?? "chromium";
const browserType = browserName === "webkit" ? webkit : chromium;
const reportName = process.env.EVIDENCE_REPORT ?? (browserName === "webkit" ? `${phase}-webkit-layout.json` : `${phase}-mobile-layout.json`);
const screenshotPhase = browserName === "webkit" ? `${phase}-webkit` : phase;
const viewports = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
  { width: 1280, height: 640 },
  { width: 1366, height: 600 },
];
const cases = viewports.flatMap((viewport) => [100, 120, 140].map((textScale) => ({ viewport, textScale })));

await mkdir(`${out}/${screenshotPhase}`, { recursive: true });
const browser = await browserType.launch({ headless: true });
const report = { phase, browser: browserName, browserVersion: browser.version(), harness: { audioContextStub: false }, status: "RUNNING", failures: [], samples: [] };

try {
  for (const { viewport, textScale } of cases) {
    const context = await browser.newContext({ viewport, locale: "zh-TW" });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "networkidle" });
    await page.locator(".screen--menu").waitFor();
    if (textScale > 100) {
      await page.locator('[data-action="settings"]').click();
      await page.locator(".screen--settings").waitFor();
      for (let step = 100; step < textScale; step += 20) await page.locator('[data-action="cycle-text"]').click();
      await page.locator('[data-action="menu"][aria-label="返回"]').click();
      await page.locator(".screen--menu").waitFor();
    }
    await page.waitForTimeout(650);
    const sample = await page.evaluate(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
      };
      const controls = [...document.querySelectorAll(".menu-actions button")].map((node) => {
        const box = node.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
          label: node.textContent?.replace(/\s+/g, " ").trim(),
          top: box.top,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
          visible: box.top >= 0 && box.bottom <= window.innerHeight,
          centerHit: hit === node || node.contains(hit),
        };
      });
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        visualViewport: window.visualViewport ? { width: window.visualViewport.width, height: window.visualViewport.height } : null,
        appHeightVar: getComputedStyle(document.documentElement).getPropertyValue("--app-height").trim(),
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        shell: rect(".game-shell"),
        canvas: (() => {
          const node = document.querySelector("#scene-canvas");
          if (!(node instanceof HTMLCanvasElement)) return null;
          return { ...rect("#scene-canvas"), intrinsicWidth: node.width, intrinsicHeight: node.height };
        })(),
        brand: rect(".brand-lockup"),
        save: rect(".screen--menu .save-status"),
        actions: rect(".menu-actions"),
        footer: rect(".menu-footer"),
        controls,
      };
    });
    const tag = `${viewport.width}x${viewport.height}-text${textScale}`;
    if (sample.documentWidth > viewport.width + 0.5) report.failures.push(`${tag}: horizontal overflow ${sample.documentWidth}`);
    if (sample.canvas && Math.abs((sample.canvas.width / sample.canvas.height) - (sample.canvas.intrinsicWidth / sample.canvas.intrinsicHeight)) > 0.002) {
      report.failures.push(`${tag}: canvas aspect ratio distorted`);
    }
    for (const control of sample.controls) {
      if (control.height < 44 || control.width < 44 || !control.visible || !control.centerHit) {
        report.failures.push(`${tag}: unreachable control ${control.label} (${Math.round(control.top)}-${Math.round(control.bottom)}, ${Math.round(control.height)}px)`);
      }
    }
    report.samples.push({ requested: viewport, textScale, ...sample });
    await page.screenshot({ path: `${out}/${screenshotPhase}/${tag}.png` });
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, locale: "zh-TW" });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator('[data-action="settings"]').click();
  await page.locator(".screen--settings").waitFor();
  await page.locator('[data-action="cycle-text"]').click();
  await page.locator('[data-action="cycle-text"]').click();
  await page.locator('[data-action="menu"][aria-label="返回"]').click();
  await page.locator(".screen--menu").waitFor();
  await page.locator('[data-action="new-game"][data-value="R01"]').click();
  await page.waitForTimeout(250);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-action="select-carriage"][data-value="greenhouse"]').click();
  await page.waitForTimeout(100);
  report.sceneMapping = await page.evaluate(() => {
    const box = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    };
    return {
      canvas: box("#scene-canvas"),
      decor: box(".carriage-decor-layer"),
      crop: box(".crop-scene-layer"),
      hotspots: box(".scene-hotspots"),
    };
  });
  const mapped = [report.sceneMapping.decor, report.sceneMapping.crop, ...(report.sceneMapping.hotspots ? [report.sceneMapping.hotspots] : [])];
  if (!report.sceneMapping.canvas || mapped.some((layer) => !layer || ["top", "left", "width", "height"].some((key) => Math.abs(layer[key] - report.sceneMapping.canvas[key]) > 0.75))) {
    report.failures.push("390x844: a world-space layer does not share the canvas scene rectangle");
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(150);
  report.savedWorstCase = await page.evaluate(() => {
    const controls = [...document.querySelectorAll(".menu-actions button")].map((node) => {
      const box = node.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { height: box.height, top: box.top, bottom: box.bottom, centerHit: hit === node || node.contains(hit) };
    });
    const actions = document.querySelector(".menu-actions")?.getBoundingClientRect();
    return { appHeightVar: getComputedStyle(document.documentElement).getPropertyValue("--app-height").trim(), actionsTop: actions?.top, controls };
  });
  if (report.savedWorstCase.actionsTop < 568 * 0.6) report.failures.push("320x568 saved at 140%: controls obscure more than 40% of the scene");
  if (report.savedWorstCase.controls.some((control) => control.height < 44 || control.top < 0 || control.bottom > 568 || !control.centerHit)) {
    report.failures.push("320x568 saved at 140%: a control is unreachable");
  }
  await page.screenshot({ path: `${out}/${screenshotPhase}/320x568-text140-saved.png` });

  for (const resized of [{ width: 390, height: 700 }, { width: 844, height: 390 }, { width: 390, height: 780 }]) {
    await page.setViewportSize(resized);
    await page.waitForTimeout(50);
    const synced = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--app-height").trim());
    if (synced !== `${resized.height}px`) report.failures.push(`${resized.width}x${resized.height}: app height did not follow viewport resize (${synced})`);
  }
  await context.close();
} catch (error) {
  report.failures.push(error?.stack ?? String(error));
} finally {
  await browser.close();
}

report.status = report.failures.length ? "FAIL" : "PASS";
await writeFile(`${out}/${reportName}`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, failures: report.failures }, null, 2));
if (report.failures.length) process.exitCode = 1;
