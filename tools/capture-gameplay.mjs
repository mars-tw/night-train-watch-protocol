import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.GAME_URL ?? "http://127.0.0.1:4177";
const outputDirectory = resolve("public/assets/video");
const rawDirectory = resolve(outputDirectory, "raw");
const outputFile = resolve(outputDirectory, "night-train-gameplay.webm");

await mkdir(rawDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  locale: "zh-TW",
  recordVideo: { dir: rawDirectory, size: { width: 390, height: 844 } },
});

const page = await context.newPage();
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.evaluate(() => {
  localStorage.setItem("settings", JSON.stringify({
    textScale: 100,
    reducedMotion: false,
    noCountdown: false,
    lowSpeed: false,
    sound: false,
  }));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);

await page.getByRole("button", { name: "開始新局" }).click();
await page.waitForTimeout(1600);

// Show the actual farming loop first: choose a crop and sow it into a visible rack.
await page.locator('[data-action="select-crop"][data-value="tomato"]').click();
await page.locator('[data-action="plant-crop"][data-value="plot-a:tomato"]').first().click();
await page.waitForSelector('.crop-scene-plot.stage-1');
await page.waitForTimeout(1700);

// Tour the five distinct configurations rather than reusing one carriage image.
for (const carriageId of ["sleep", "defense", "workshop"]) {
  await page.locator(`[data-action="select-carriage"][data-value="${carriageId}"]`).click();
  await page.waitForSelector(`.screen--carriage[data-carriage="${carriageId}"]`);
  await page.waitForTimeout(1200);
}

// Place the radio into an authored compatible workshop slot with a real drag.
await page.locator('[data-action="decorate"]').click();
await page.waitForTimeout(900);
await page.locator('.decor-picker [data-action="select-decoration"][data-value="radio"]').click();
const radio = page.locator('[data-decor-id="radio"]');
const targetSlot = page.locator('[data-slot-id="workshop-bench"]');
const radioBox = await radio.boundingBox();
const targetBox = await targetSlot.boundingBox();
if (!radioBox || !targetBox) throw new Error("Decoration slot drag targets are not visible.");
await page.mouse.move(radioBox.x + radioBox.width / 2, radioBox.y + radioBox.height / 2);
await page.mouse.down();
await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 14 });
await page.mouse.up();
await page.waitForFunction(() => document.querySelector('[data-decor-id="radio"]')?.getAttribute("data-decoration-slot") === "workshop-bench");
await page.waitForTimeout(1300);
await page.locator('[data-action="finish-decor"]').click();
await page.waitForTimeout(900);
await page.locator('[data-action="select-carriage"][data-value="kitchen"]').click();
await page.waitForSelector('.screen--carriage[data-carriage="kitchen"]');
await page.waitForTimeout(1200);
await page.locator('[data-action="cook-meal"]').first().click();
await page.waitForFunction(() => document.querySelector(".toast-message")?.textContent?.includes("熱食完成"));
await page.waitForTimeout(1000);
await page.locator('[data-action="select-carriage"][data-value="greenhouse"]').click();
await page.waitForTimeout(1000);
await page.getByRole("button", { name: /出發/ }).click();
await page.waitForTimeout(1600);
await page.getByRole("button", { name: "確認路線" }).click();
await page.waitForTimeout(1900);
await page.locator('[data-action="event-choice"]:not([disabled])').last().click();
const threatText = await page.getByRole("alert").textContent();
await page.waitForTimeout(3500);
if (threatText?.includes("攀附者")) {
  await page.getByRole("button", { name: /緊急加速/ }).click();
} else {
  await page.getByRole("button", { name: /關閉百葉/ }).click();
}
await page.waitForTimeout(3200);

const video = page.video();
await context.close();
if (!video) throw new Error("Playwright did not create a video stream.");
await video.saveAs(outputFile);
await Promise.race([
  browser.close(),
  new Promise((resolveTimeout) => setTimeout(resolveTimeout, 3000)),
]);

console.log(`Gameplay video written to ${outputFile}`);
process.exit(0);
