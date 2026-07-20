import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.GAME_URL ?? "http://127.0.0.1:4311";
const outputDirectory = resolve("output/playwright");
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-TW" });
const page = await context.newPage();
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("settings", JSON.stringify({ textScale: 100, reducedMotion: false, noCountdown: false, lowSpeed: false, sound: false }));
});
await page.reload({ waitUntil: "networkidle" });
await page.screenshot({ path: resolve(outputDirectory, "motion-01-menu.png") });

await page.getByRole("button", { name: "開始新局" }).click();
await page.waitForTimeout(420);
await page.screenshot({ path: resolve(outputDirectory, "motion-02-prep-a.png") });
await page.waitForTimeout(1000);
await page.screenshot({ path: resolve(outputDirectory, "motion-03-prep-b.png") });

await page.getByRole("button", { name: /出發/ }).click();
await page.getByRole("button", { name: "確認路線" }).click();
await page.waitForSelector(".screen--event");
await page.screenshot({ path: resolve(outputDirectory, "motion-04-event.png") });
await page.getByRole("button", { name: /B 先檢測/ }).click();
await page.waitForTimeout(350);
await page.screenshot({ path: resolve(outputDirectory, "motion-05-approach.png") });

const alertText = (await page.getByRole("alert").textContent()) ?? "";
await page.waitForTimeout(alertText.includes("攀附者") ? 6200 : 4200);
await page.screenshot({ path: resolve(outputDirectory, "motion-06-warning.png") });
await page.waitForTimeout(3200);
await page.screenshot({ path: resolve(outputDirectory, "motion-07-attack.png") });
await page.waitForSelector(".contact-stage-breach", { timeout: 5000 });
await page.screenshot({ path: resolve(outputDirectory, "motion-08-breach.png") });
await page.waitForSelector('[data-screen^="SCR-RS"]', { timeout: 5000 });
await page.screenshot({ path: resolve(outputDirectory, "motion-09-aftermath.png") });

await context.close();
const reducedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-TW", reducedMotion: "reduce" });
const reducedPage = await reducedContext.newPage();
await reducedPage.goto(baseUrl, { waitUntil: "networkidle" });
await reducedPage.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("settings", JSON.stringify({ textScale: 100, reducedMotion: true, noCountdown: true, lowSpeed: false, sound: false }));
});
await reducedPage.reload({ waitUntil: "networkidle" });
await reducedPage.getByRole("button", { name: "開始新局" }).click();
await reducedPage.waitForTimeout(500);
await reducedPage.screenshot({ path: resolve(outputDirectory, "motion-10-reduced-a.png") });
await reducedPage.waitForTimeout(1000);
await reducedPage.screenshot({ path: resolve(outputDirectory, "motion-11-reduced-b.png") });

console.log(`Motion QA screenshots written to ${outputDirectory}`);
await browser.close();
