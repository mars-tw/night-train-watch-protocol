import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.GAME_URL ?? "http://127.0.0.1:4312";
const output = "docs/evidence/v2";
await mkdir(`${output}/screenshots`, { recursive: true });
const browser = await chromium.launch({ headless: true });
const failures = [], assertions = [], frames = [], browserErrors = [];
let diagnosticPage;
const assert = (value, description) => { assertions.push(description); if (!value) failures.push(description); };
try {
  for (const viewport of [{width:1366,height:600},{width:390,height:844}]) {
    const context = await browser.newContext({ viewport, locale:"zh-TW", reducedMotion:"reduce" });
    const page = await context.newPage();
    diagnosticPage = page;
    page.on("pageerror", e => browserErrors.push(e.message));
    await page.goto(base, { waitUntil:"networkidle" });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout:60000 });
    const cache = await page.evaluate(async () => {
      const manifest = await (await fetch("./precache.json")).json();
      const name = `night-train-v2-${manifest.build}`;
      const stored = await caches.open(name);
      const missing = [];
      for (const file of manifest.files) if (!await stored.match(new URL(file, location.href).href)) missing.push(file);
      return { name, build:manifest.build, count:manifest.files.length, missing };
    });
    assert(cache.count>20 && cache.missing.length===0, `${viewport.width}: coherent precache has every manifest asset`);
    await page.locator('[data-action="new-game"][data-value="R01"]').click();
    await page.waitForSelector('[data-action="select-carriage"]');
    await page.locator('[data-action="select-carriage"][data-value="sleep"]').click();
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem("ntwp.v2.current")));
    assert(save.run.schemaVersion===6 && save.run.runId && save.profile.profileId, `${viewport.width}: a real new game saves the complete v6 envelope`);
    await context.setOffline(true);
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator('[data-action="continue"]').click();
    await page.waitForSelector('[data-action="select-carriage"]');
    await page.locator('[data-action="select-carriage"][data-value="sleep"]').click();
    await page.waitForFunction(() => [...document.images].filter(i=>i.offsetParent!==null).every(i=>i.complete&&i.naturalWidth>0));
    const offline = await page.evaluate(() => ({
      images:[...document.images].filter(i=>i.offsetParent!==null).every(i=>i.complete&&i.naturalWidth>0),
      save:JSON.parse(localStorage.getItem("ntwp.v2.current")),
      canvas:document.querySelector("canvas")?.width,
    }));
    assert(offline.save.run.runId===save.run.runId, `${viewport.width}: offline reload restores the same run, not a replacement`);
    assert(offline.canvas===720 && offline.images, `${viewport.width}: offline scene and visible UI assets render`);
    await page.screenshot({path:`${output}/screenshots/release-${viewport.width}-offline.png`});
    await context.setOffline(false);
    // Restore ordinary motion before profiling. These are browser-size probes,
    // never claims about a physical Android/iOS device.
    await page.emulateMedia({reducedMotion:"no-preference"});
    const trials=[];
    for(let trial=0;trial<3;trial++) {
      const result=await page.evaluate(async()=>{
        const samples=[];let previous;
        await new Promise(resolve=>{const frame=t=>{if(previous!==undefined)samples.push(t-previous);previous=t;if(samples.length<180)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});
        const sorted=samples.slice(20).sort((a,b)=>a-b);
        return {p95:sorted[Math.floor((sorted.length-1)*.95)],samples:sorted.length};
      });
      trials.push(result);
    }
    const median=trials.map(t=>t.p95).sort((a,b)=>a-b)[1];
    frames.push({viewport,trials,medianP95ms:median,passed:median<=18,deviceEvidence:"Windows desktop Chromium at requested viewport; not physical phone"});
    assert(median<=18, `${viewport.width}: three-run median p95 frame interval <=18ms`);
    await context.close();
  }
  assert(browserErrors.length===0,"release pages have no browser runtime errors");
} catch(error) {
  failures.push(error.stack??String(error));
  if (diagnosticPage && !diagnosticPage.isClosed()) {
    try {
      const diagnostic = await diagnosticPage.evaluate(() => ({body:document.body.innerText,keys:Object.keys(localStorage),ready:document.readyState,worker:Boolean(navigator.serviceWorker.controller)}));
      await writeFile(`${output}/release-diagnostic.json`,JSON.stringify(diagnostic,null,2));
      await diagnosticPage.screenshot({path:`${output}/screenshots/release-diagnostic.png`});
    } catch {}
  }
} finally {await browser.close();}
const report={version:"2.0.0",status:failures.length?"FAIL":"PASS",assertions:assertions.length,checks:assertions,failures,browserErrors,frames,physicalPhonePerformance:"Not measured; mobile-size results use the same desktop host"};
await writeFile(`${output}/release-qa.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(failures.length)process.exitCode=1;
