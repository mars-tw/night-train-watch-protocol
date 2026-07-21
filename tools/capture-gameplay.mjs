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
await page.waitForTimeout(2600);
await page.locator('[data-action="decorate"]').click();
await page.waitForTimeout(900);
const radio = page.locator('[data-decor-id="radio"]');
const decorLayer = page.locator(".carriage-decor-layer");
const radioBox = await radio.boundingBox();
const decorBox = await decorLayer.boundingBox();
if (!radioBox || !decorBox) throw new Error("Decoration drag targets are not visible.");
await page.mouse.move(radioBox.x + radioBox.width / 2, radioBox.y + radioBox.height / 2);
await page.mouse.down();
await page.mouse.move(decorBox.x + decorBox.width * 0.58, decorBox.y + decorBox.height * 0.42, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(1300);
await page.locator('[data-action="finish-decor"]').click();
await page.waitForTimeout(1000);
await page.getByRole("button", { name: /配電/ }).click();
await page.waitForTimeout(1400);
await page.getByRole("button", { name: /配餐/ }).click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /安心餐/ }).click();
await page.waitForTimeout(1100);
await page.getByRole("button", { name: "種" }).click();
await page.waitForFunction(() => document.querySelector(".module-detail h3")?.textContent?.includes("垂直種植架"));
await page.getByRole("button", { name: /收成 2/ }).click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /出發/ }).click();
await page.waitForTimeout(2400);
await page.getByRole("button", { name: "確認路線" }).click();
await page.waitForTimeout(2800);
await page.getByRole("button", { name: /B 先檢測/ }).click();
const threatText = await page.getByRole("alert").textContent();
await page.waitForTimeout(threatText?.includes("攀附者") ? 9200 : 7200);
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
