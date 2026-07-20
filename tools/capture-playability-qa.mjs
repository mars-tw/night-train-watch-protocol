import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.GAME_URL ?? "http://127.0.0.1:4312";
const outputDirectory = resolve("output/playwright/playability");
await mkdir(outputDirectory, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-TW" });
const page = await context.newPage();
await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector(".screen--menu");
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("settings", JSON.stringify({ textScale: 100, reducedMotion: false, noCountdown: false, lowSpeed: false, sound: false }));
});
await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
await page.getByRole("button", { name: "開始新局" }).click();
await page.waitForSelector(".screen--carriage.is-prep");
assert((await page.locator(".app-header").textContent())?.includes("5 AP"), "New run should begin with 5 AP.");

await page.getByRole("button", { name: /建造/ }).click();
await page.waitForSelector(".screen--modules");
await page.getByRole("button", { name: "生產", exact: true }).click();
await page.waitForFunction(() => document.querySelectorAll(".module-card").length === 2);
assert((await page.locator(".module-grid").textContent())?.includes("垂直種植架"), "Module category tabs should filter the catalogue.");
await page.getByRole("button", { name: "返回" }).click();
await page.waitForSelector(".screen--carriage.is-prep");

await page.getByRole("button", { name: /配電/ }).click();
await page.screenshot({ path: resolve(outputDirectory, "01-power-grid.png") });
const hydroponics = page.getByRole("button", { name: /垂直種植架/ });
await hydroponics.click();
await page.waitForFunction(() => document.querySelector('[data-action="toggle-power"][data-value="M003"]')?.textContent?.includes("OFF"));
assert((await hydroponics.textContent())?.includes("OFF"), "Power toggle should turn the hydroponics module off.");
await hydroponics.click();
await page.waitForFunction(() => document.querySelector('[data-action="toggle-power"][data-value="M003"]')?.textContent?.includes("ON"));

await page.getByRole("button", { name: /配餐/ }).click();
await page.waitForSelector(".meal-config");
await page.getByRole("button", { name: /安心餐/ }).click();
await page.waitForFunction(() => document.querySelector(".toast-message")?.textContent?.includes("安心餐"));
assert((await page.locator(".toast-message").textContent())?.includes("安心餐"), "Ration choice should provide immediate feedback.");
await page.screenshot({ path: resolve(outputDirectory, "02-ration-plan.png") });

await page.getByRole("button", { name: "種" }).click();
await page.waitForFunction(() => document.querySelector(".module-detail h3")?.textContent?.includes("垂直種植架"));
await page.getByRole("button", { name: /收成 2/ }).click();
await page.waitForFunction(() => document.querySelector(".app-header")?.textContent?.includes("4 AP"));
assert((await page.locator(".app-header").textContent())?.includes("4 AP"), "Harvest should spend one AP.");
assert((await page.locator(".toast-message").textContent())?.includes("收成 2 份"), "Harvest should explain its resource result.");
assert(await page.getByRole("button", { name: /已收成/ }).isDisabled(), "Harvest should be limited to once per day.");
await page.screenshot({ path: resolve(outputDirectory, "03-harvest-spent.png") });

await page.getByRole("button", { name: /出發/ }).click();
await page.getByRole("button", { name: "確認路線" }).click();
await page.waitForSelector(".screen--event");
await page.getByRole("button", { name: /B 先檢測/ }).click();
await page.waitForSelector(".screen--carriage.is-night");
assert((await page.locator(".app-header").textContent())?.includes("耗電 9 E"), "Night should expose the settled power cost.");

const alert = page.getByRole("alert");
await page.getByRole("button", { name: "暫停守夜倒數" }).click();
await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes("倒數暫停"));
const pausedAt = await alert.textContent();
await page.waitForTimeout(1400);
const whilePaused = await alert.textContent();
assert(pausedAt?.match(/\d+/)?.[0] === whilePaused?.match(/\d+/)?.[0], "Pause should freeze the threat countdown.");
await page.getByRole("button", { name: "繼續守夜倒數" }).click();
await page.waitForTimeout(1200);
const afterResume = await alert.textContent();
assert(afterResume !== whilePaused, "Resume should advance the threat countdown.");
await page.screenshot({ path: resolve(outputDirectory, "04-night-resumed.png") });

const alertText = (await alert.textContent()) ?? "";
if (alertText.includes("攀附者")) await page.getByRole("button", { name: /緊急加速/ }).click();
else await page.getByRole("button", { name: /關閉百葉/ }).click();
await page.waitForSelector(".screen--result");
assert((await page.locator(".aftermath-note").textContent())?.includes("安心餐"), "Dawn result should report the selected ration plan.");
assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "Mobile viewport should not overflow horizontally.");
await page.screenshot({ path: resolve(outputDirectory, "05-dawn-tradeoffs.png") });

console.log(`Playability QA passed; screenshots written to ${outputDirectory}`);
await browser.close();
