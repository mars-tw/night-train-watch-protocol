import { chromium } from "playwright";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
const base=process.env.GAME_URL??"http://127.0.0.1:4312/";
const output=process.env.EVIDENCE_DIR??"docs/evidence/v22";
await mkdir(`${output}/screenshots`,{recursive:true});
const report={status:"RUNNING",authority:"fresh browser, service workers blocked to isolate visual loading from complete offline download; no save injection",checks:[],failures:[],requests:[],errors:[]};
const assert=(ok,label)=>{report.checks.push(label);if(!ok)report.failures.push(label);};
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:"block"});
await context.addInitScript(()=>{
  window.__a07Cells=[];
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(...args){
    const source=args[0]?.currentSrc||args[0]?.src||"";
    if(source.includes("/v22/a07-clips/")&&args.length===9){window.__a07Cells.push({source,sx:args[1],sy:args[2],sw:args[3],sh:args[4]});if(window.__a07Cells.length>5000)window.__a07Cells.splice(0,2500);}
    return draw.apply(this,args);
  };
});
const page=await context.newPage();
page.on("pageerror",error=>report.errors.push(error.message));
page.on("request",request=>{if(request.url().includes("/assets/art/"))report.requests.push(request.url());});
try{
  await page.goto(base,{waitUntil:"networkidle"});
  await page.waitForTimeout(1400);
  const menuRequests=[...new Set(report.requests)];
  const a07=menuRequests.filter(url=>url.includes("/a07-clips/")||url.includes("/characters/a07/"));
  assert(a07.length===1&&a07[0].endsWith("/sleep.webp"),"fresh menu requests only the sleep clip, never the full A-07 atlas");
  const cells=await page.evaluate(()=>[...new Map(window.__a07Cells.map(cell=>[`${cell.source}:${cell.sx}:${cell.sy}:${cell.sw}:${cell.sh}`,cell])).values()]);
  assert(cells.length===8&&cells.every(cell=>cell.sy===0&&cell.sh===167),"real menu Canvas renders all eight distinct sleep cells using exact cropped row");
  const scene="public/assets/art/v21/carriages/sleep.webp";
  const before=(await stat(scene)).size+(await stat("public/assets/art/v2/characters/a07/atlas.webp")).size;
  const after=(await stat(scene)).size+(await stat("public/assets/art/v22/a07-clips/sleep.webp")).size;
  const manifest=JSON.parse(await readFile("dist/precache.json","utf8"));
  let cacheBytes=0;for(const file of manifest.files)cacheBytes+=(await stat(`dist/${file}`)).size;
  assert(manifest.files.length===44&&manifest.files.filter(file=>file.includes("/v22/a07-clips/")).length===7,"offline manifest contains all seven clips and 44 complete runtime files");
  assert(!manifest.files.some(file=>file.includes("/characters/a07/")),"offline manifest excludes superseded whole A-07 atlas while source remains in repository");
  report.menu={requests:menuRequests,cells,requiredSceneBytesBefore:before,requiredSceneBytesAfter:after,reductionPercent:Number(((1-after/before)*100).toFixed(2)),measurement:"encoded file bytes for required scene plus A-07, excludes other UI files and offline download"};
  report.cache={version:manifest.version,build:manifest.build,count:manifest.files.length,bytes:cacheBytes};
  await page.locator('[data-action="new-game"][data-value="R01"]').click();
  await page.locator('.carriage-selector [data-action="select-carriage"][data-value="sleep"]').click();
  await page.waitForTimeout(1400);
  await page.screenshot({path:`${output}/screenshots/loading-sleep.png`});
  assert(!report.requests.some(url=>url.includes("/characters/a07/atlas.webp")),"new game continues to use clips without fetching the old full atlas");
  assert(report.errors.length===0,"no JavaScript runtime error during real clip loading");
}catch(error){report.failures.push(error.stack??String(error));}
await browser.close();
report.status=report.failures.length?"FAIL":"PASS";
await writeFile(`${output}/loading-qa.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,checks:report.checks.length,failures:report.failures,menu:report.menu&&{before:report.menu.requiredSceneBytesBefore,after:report.menu.requiredSceneBytesAfter,reductionPercent:report.menu.reductionPercent},cache:report.cache},null,2));
if(report.failures.length)process.exitCode=1;
