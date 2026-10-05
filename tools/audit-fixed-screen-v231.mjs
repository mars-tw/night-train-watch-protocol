import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base=process.env.GAME_URL??"http://127.0.0.1:4177/";
const output=process.env.EVIDENCE_DIR??"docs/evidence/v231";
const engine=process.env.QA_BROWSER??"chromium";
await mkdir(`${output}/${engine}`,{recursive:true});
const browser=await(engine==="webkit"?webkit:chromium).launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},locale:"zh-TW",serviceWorkers:"block"});
await context.addInitScript(()=>{
  window.__fixedDraws=[];
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(...args){const src=args[0]?.currentSrc||args[0]?.src||"";const screen=document.querySelector("#app")?.dataset.gameScreen;if(this.canvas.id==="scene-canvas"&&(screen==="menu"||screen==="result")){window.__fixedDraws.push({screen,src});if(window.__fixedDraws.length>3000)window.__fixedDraws.splice(0,1500);}return draw.apply(this,args);};
});
const page=await context.newPage();
const report={status:"RUNNING",engine,checks:[],failures:[],samples:[],errors:[],authority:"actual UI, mouse and keyboard, read-only saved run, no progress injection"};
page.on("pageerror",error=>report.errors.push(error.message));
const assert=(ok,label)=>{report.checks.push(label);if(!ok)report.failures.push(label);};
const click=async selector=>{const loc=page.locator(selector).first();const old=await loc.elementHandle();await loc.click();await page.waitForFunction(e=>!e.isConnected,old);await old.dispose();};
async function sample(label){
  await page.waitForFunction(()=>window.__fixedDraws.some(d=>d.screen===document.querySelector("#app").dataset.gameScreen&&d.src.endsWith("/menu/hero.webp")));
  const samples=[];
  for(const delay of [0,16,50,100,320,800,1600]){
    if(delay)await page.waitForTimeout(delay);
    samples.push(await page.evaluate(()=>{const c=document.querySelector("canvas"),r=c.getBoundingClientRect(),f=document.querySelector(".game-frame").getBoundingClientRect(),style=getComputedStyle(c),data=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let hash=2166136261;for(const value of data){hash^=value;hash=Math.imul(hash,16777619);}return {screen:document.querySelector("#app").dataset.gameScreen,hash:hash>>>0,rect:[r.x,r.y,r.width,r.height],inside:r.left>=f.left-.5&&r.right<=f.right+.5&&r.top>=f.top-.5&&r.bottom<=f.bottom+.5,transform:style.transform,animation:style.animationName,classes:c.className,inline:c.style.transform,opacity:c.style.opacity};}));
  }
  assert(samples.every(s=>s.inside&&s.transform==="none"&&s.animation==="none"&&!s.inline&&!/carriage-shift/.test(s.classes)),`${label}: every time sample stays in frame without residual motion`);
  assert(samples.every(s=>s.hash===samples[0].hash),`${label}: complete picture remains pixel-identical`);
  report.samples.push({label,samples});await page.screenshot({path:`${output}/${engine}/${label}.png`});
}
try{
  await page.goto(base,{waitUntil:"networkidle"});await sample("menu-initial");
  await click('[data-action="new-game"][data-value="R01"]');
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem("ntwp.v2.current")));
  await page.mouse.move(200,650);await page.mouse.down();await page.mouse.move(235,650);
  assert(await page.locator("canvas").evaluate(c=>c.style.transform!==""),"partial swipe actually applied a temporary canvas transform");
  await page.locator('.onboarding-cue [data-action="missions"]').press("Enter");
  await page.waitForSelector(".screen--missions");await page.mouse.up();
  assert(await page.locator("canvas").evaluate(c=>!c.style.transform&&!c.style.opacity&&!/carriage-shift/.test(c.className)),"leaving during a partial swipe cleans inline motion immediately");
  await click('.screen--missions [data-action="hub"][aria-label="返回"]');await click('.screen--hub [data-action="menu"][aria-label="返回"]');await sample("menu-after-swipe");
  await click('[data-action="continue"]');
  await click('.carriage-selector [data-action="select-carriage"][data-value="sleep"]');
  await page.locator('.onboarding-cue [data-action="missions"]').press("Enter");await page.waitForSelector('.screen--missions');
  await click('.screen--missions [data-action="hub"][aria-label="返回"]');await click('.screen--hub [data-action="menu"][aria-label="返回"]');await sample("menu-after-fast-switch");
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem("ntwp.v2.current")));
  assert(before.run.runId===after.run.runId&&JSON.stringify(before.run.resources)===JSON.stringify(after.run.resources),"navigation preserves the same run and all resources");
  await click('[data-action="continue"]');await click('[data-action="route"]');await click('[data-action="confirm-route"]');await page.waitForSelector('.screen--event');await click('[data-action="event-choice"][data-value="partial"]');
  for(let n=0;n<6&&!await page.locator('.screen--result').count();n++){
    await page.waitForFunction(()=>document.querySelector('.screen--result')||document.querySelector('.screen--carriage.is-night [data-action="counter"]:not(:disabled)'));
    if(await page.locator('.screen--result').count())break;
    const counter=page.locator('[data-action="counter"]:not(:disabled)').first();await counter.waitFor({state:"visible"});const current=await counter.elementHandle();await counter.click();await page.waitForFunction(e=>!e.isConnected,current);await current.dispose();await page.waitForTimeout(250);
  }
  await page.waitForSelector('.screen--result',{timeout:20000});await sample("result-day1");
  for(const viewport of [{width:320,height:568},{width:1366,height:600}]){await page.setViewportSize(viewport);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await sample(`result-${viewport.width}`);}
  const draws=await page.evaluate(()=>window.__fixedDraws);report.unexpectedDraws=draws.filter(d=>!d.src.endsWith('/menu/hero.webp'));assert(report.unexpectedDraws.length===0,"fixed screens never draw an atlas, threat or individual pose");
  assert(report.errors.length===0,"no runtime error during actual transitions");
}catch(error){report.failures.push(error.stack??String(error));}
await browser.close();report.status=report.failures.length?"FAIL":"PASS";
await writeFile(`${output}/${engine}-fixed-qa.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks.length,failures:report.failures},null,2));if(report.failures.length)process.exitCode=1;
