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
async function swipeScene(direction) {
  const screen = page.locator(".screen--carriage.is-observation-mode");
  const box = await screen.boundingBox();
  if (!box) throw new Error("Observation scene is not visible for swipe.");
  const startX = direction === "next" ? box.x + box.width * 0.76 : box.x + box.width * 0.24;
  const endX = direction === "next" ? box.x + box.width * 0.28 : box.x + box.width * 0.72;
  const y = box.y + box.height * 0.48;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps: 14 });
  await page.mouse.up();
}

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

// Show the mobile-first carriage gesture and its animated transition.
await swipeScene("next");
await page.waitForSelector('.screen--carriage[data-carriage="kitchen"]');
await page.waitForTimeout(1100);
await swipeScene("previous");
await page.waitForSelector('.screen--carriage[data-carriage="greenhouse"]');
await page.waitForTimeout(900);

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

// Demonstrate that utility drawers are optional tools: open them, use them, then return to the scene.
await page.locator('[data-action="power"]').click();
await page.waitForSelector(".power-config");
await page.waitForTimeout(1200);
await page.locator('[data-action="power"]').click();
await page.waitForFunction(() => !document.querySelector(".power-config"));
await page.waitForTimeout(600);
await page.locator('[data-action="meal"]').click();
await page.waitForSelector(".meal-config");
await page.waitForTimeout(1100);
await page.locator('[data-action="select-ration"][data-value="standard"]').click();
await page.waitForTimeout(700);
await page.locator('[data-action="meal"]').click();
await page.waitForFunction(() => !document.querySelector(".meal-config"));
await page.locator('[data-action="select-carriage"][data-value="greenhouse"]').click();
await page.waitForTimeout(900);
await page.getByRole("button", { name: /出發/ }).click();
await page.waitForTimeout(1600);
await page.locator('[data-action="select-route"][data-value="RN02"]').click();
await page.waitForFunction(() => document.querySelector(".route-summary")?.textContent?.includes("2 波"));
await page.getByRole("button", { name: "確認路線" }).click();
await page.waitForTimeout(1900);
await page.locator('[data-action="event-choice"]:not([disabled])').last().click();
await page.waitForTimeout(3500);
const firstThreatText = await page.getByRole("alert").textContent();
if (firstThreatText?.includes("攀附者")) {
  await page.getByRole("button", { name: /緊急加速/ }).click();
} else {
  await page.getByRole("button", { name: /關閉百葉/ }).click();
}
await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes("接觸 2/2"));
await page.waitForTimeout(2300);
const secondThreatText = await page.getByRole("alert").textContent();
if (secondThreatText?.includes("攀附者")) {
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
