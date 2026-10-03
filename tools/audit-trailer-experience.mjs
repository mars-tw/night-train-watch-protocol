import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base=process.env.GAME_URL??"http://127.0.0.1:4177/";
const root=base.endsWith("/")?base:base+"/";
const out=process.env.EVIDENCE_DIR??"docs/evidence/v22";
await mkdir(`${out}/screenshots`,{recursive:true});
const browser=await chromium.launch({headless:true});
const report={status:"RUNNING",assertions:[],failures:[],errors:[],viewports:[]};
const assert=(ok,label)=>{report.assertions.push(label);if(!ok)report.failures.push(label);};
try{
  for(const viewport of [{width:320,height:568},{width:360,height:640},{width:390,height:844},{width:1280,height:640},{width:1366,height:600}]){
    const context=await browser.newContext({viewport,locale:"zh-TW"});
    const page=await context.newPage();page.on("pageerror",e=>report.errors.push(e.message));
    await page.goto(new URL("trailer.html",root).href,{waitUntil:"networkidle"});
    await page.waitForFunction(()=>document.querySelector("video").readyState>=1);
    const initial=await page.evaluate(()=>({format:document.querySelector(".screen").dataset.format,src:document.querySelector("video").currentSrc}));
    const expected=viewport.width<=600?"portrait":"landscape";
    assert(initial.format===expected,`${viewport.width}: chooses ${expected} for fresh viewer`);
    await page.locator(".chapter-picker").selectOption("34.397");
    await page.waitForFunction(()=>{const v=document.querySelector("video");return v.currentTime>=34.39&&!v.paused;});
    await page.evaluate(()=>document.querySelector("video").pause());
    const before=await page.evaluate(()=>document.querySelector("video").currentTime);
    const other=expected==="portrait"?"landscape":"portrait";
    await page.locator(`button[data-format="${other}"]`).click();
    await page.waitForFunction(mode=>{const v=document.querySelector("video");return document.querySelector(".screen").dataset.format===mode&&v.readyState>=1&&!v.seeking&&v.currentTime>30;},other);
    const after=await page.evaluate(()=>({time:document.querySelector("video").currentTime,paused:document.querySelector("video").paused}));
    assert(Math.abs(after.time-before)<.8&&after.paused,`${viewport.width}: format switch keeps playback position and pause`);
    await page.locator(".chapter-picker").selectOption("10.179");
    await page.locator(`button[data-format="${expected}"]`).click();
    await page.waitForFunction(()=>{const v=document.querySelector("video");return v.readyState>=1&&!v.seeking&&!v.paused&&v.currentTime>=10.17&&v.currentTime<13;});
    const playingSwitch=await page.evaluate(()=>({time:document.querySelector("video").currentTime,paused:document.querySelector("video").paused}));
    assert(!playingSwitch.paused&&Math.abs(playingSwitch.time-10.179)<1,`${viewport.width}: immediate chapter-to-format switch preserves playing state and position`);
    await page.evaluate(()=>document.querySelector("video").pause());
    await page.waitForTimeout(150);
    const layout=await page.evaluate(()=>{
      const controls=[...document.querySelectorAll(".media-toolbar button,.chapter-picker,.actions a,.download a,.repo-link,.brand")].map(element=>{
        const r=element.getBoundingClientRect();const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
        return {label:element.textContent.trim(),height:r.height,top:r.top,bottom:r.bottom,reachable:!!top&&(top===element||element.contains(top))};
      });
      return {height:innerHeight,documentWidth:document.documentElement.scrollWidth,controls};
    });
    assert(layout.controls.every(c=>c.height>=43.9&&c.top>=0&&c.bottom<=layout.height&&c.reachable),`${viewport.width}: every custom control has 44px hit area and is reachable without scrolling`);
    assert(layout.documentWidth<=viewport.width,`${viewport.width}: no horizontal overflow`);
    report.viewports.push({viewport,initial,before,after,playingSwitch,layout});
    await page.screenshot({path:`${out}/screenshots/trailer-${viewport.width}x${viewport.height}.png`});
    await page.evaluate(()=>localStorage.setItem("ntwp.trailer.format","__proto__"));
    await page.reload({waitUntil:"networkidle"});
    await page.waitForFunction(()=>document.querySelector("video").readyState>=1);
    assert(await page.locator(".screen").getAttribute("data-format")===expected,`${viewport.width}: ignores malformed saved preference`);
    await context.close();
  }
  assert(report.errors.length===0,"no trailer JavaScript runtime errors");
}catch(error){report.failures.push(error.stack??String(error));}
await browser.close();report.status=report.failures.length?"FAIL":"PASS";
await writeFile(`${out}/trailer-experience-qa.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,assertions:report.assertions.length,failures:report.failures},null,2));
if(report.failures.length)process.exitCode=1;
