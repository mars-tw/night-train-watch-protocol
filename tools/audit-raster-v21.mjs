import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base = process.env.GAME_URL ?? "http://127.0.0.1:4177";
const output = process.env.EVIDENCE_DIR ?? "docs/evidence/v21";
await mkdir(`${output}/screenshots`, { recursive: true });
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const browser = await chromium.launch({ headless: true });
const report = { version, authority: "fresh contexts, visible UI actions, real Canvas drawImage arguments; no game-state injection", status: "RUNNING", assertions: [], failures: [], errors: [], svgRequests: [], screenshots: [], observedEffectFrames: [] };
const assert = (condition, description) => { report.assertions.push(description); if (!condition) report.failures.push(description); };
try {
  for (const viewport of [{width:360,height:640},{width:390,height:844},{width:430,height:932},{width:1366,height:600}]) {
    const context = await browser.newContext({viewport,locale:"zh-TW",reducedMotion:"no-preference"});
    await context.addInitScript(() => {
      window.__rasterDraws = [];
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        const source = args[0]?.currentSrc || args[0]?.src || "";
        if (source.includes("/v21/effects/atlas.webp") && args.length === 9) {
          window.__rasterDraws.push({ source, sx:args[1], sy:args[2], sw:args[3], sh:args[4] });
          if(window.__rasterDraws.length>4000)window.__rasterDraws.splice(0,2000);
        }
        return draw.apply(this,args);
      };
    });
    const page = await context.newPage();
    page.on("pageerror", e => report.errors.push(e.message));
    page.on("request", r => { if (/\.svg(?:\?|$)/i.test(r.url())) report.svgRequests.push(r.url()); });
    await page.goto(base,{waitUntil:"networkidle"});
    await page.waitForFunction(() => document.documentElement.classList.contains("raster-icons-ready"));
    assert(await page.locator("svg").count()===0,`${viewport.width}: menu contains no SVG`);
    await page.locator('[data-action="new-game"][data-value="R01"]').click();
    await page.waitForSelector('[data-action="select-carriage"]');
    for(const carriage of ["sleep","defense","workshop","greenhouse","kitchen"]){
      await page.locator(`.carriage-selector [data-action="select-carriage"][data-value="${carriage}"]`).click();
      await page.waitForTimeout(450);
      const path=`${output}/screenshots/${viewport.width}-${carriage}.png`;
      await page.screenshot({path});report.screenshots.push(path);
      assert(await page.locator("svg").count()===0,`${viewport.width}: ${carriage} contains no SVG`);
    }
    await page.waitForTimeout(800);
    const telemetry=await page.evaluate(()=>({
      unique:[...new Set(window.__rasterDraws.filter(x=>x.sy>=256&&x.sy<384).map(x=>`${x.sx},${x.sy},${x.sw},${x.sh}`))],
      iconReady:document.documentElement.classList.contains("raster-icons-ready"),
      iconBackground:getComputedStyle(document.querySelector(".ui-icon"),"::after").backgroundImage,
      fallbackHidden:getComputedStyle(document.querySelector(".ui-icon > span")).visibility,
    }));
    report.observedEffectFrames.push({viewport,...telemetry});
    assert(telemetry.unique.length===4,`${viewport.width}: kitchen renders four distinct flame source cells`);
    assert(telemetry.iconReady&&telemetry.iconBackground.includes("icon-atlas.webp")&&telemetry.fallbackHidden==="hidden",`${viewport.width}: real icon atlas loads and fallback text does not bleed through`);
    await page.locator('[data-action="route"]').last().click();
    await page.waitForSelector(".map-art--route");
    await page.waitForTimeout(450);
    assert(await page.locator("svg").count()===0,`${viewport.width}: route uses painted raster map`);
    await page.screenshot({path:`${output}/screenshots/${viewport.width}-route.png`});
    report.screenshots.push(`${output}/screenshots/${viewport.width}-route.png`);
    await context.close();
  }
  assert(report.svgRequests.length===0,"no runtime SVG request, including app icon");
  assert(report.errors.length===0,"all raster screens have no browser runtime error");
} catch (e) { report.failures.push(e.stack??String(e)); }
await browser.close();
report.status=report.failures.length?"FAIL":"PASS";
await writeFile(`${output}/raster-qa.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(report.failures.length)process.exitCode=1;
