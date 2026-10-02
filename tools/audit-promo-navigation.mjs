import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base=process.env.GAME_URL??"http://127.0.0.1:4312/";
const root=base.endsWith("/")?base:base+"/";
await mkdir("docs/evidence/promo-v211",{recursive:true});
const browser=await chromium.launch({headless:true,args:process.env.PROMO_HTTP1==="1"?["--disable-http2"]:[]});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:"allow"});
const page=await context.newPage();
const errors=[];page.on("pageerror",e=>errors.push(e.message));
let report;
try{
  await page.goto(root,{waitUntil:"networkidle"});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:180000});
  await page.goto(new URL("trailer.html",root).href,{waitUntil:"networkidle"});
  await page.waitForSelector("video");
  await page.locator("video").click();
  await page.evaluate(()=>document.querySelector("video").play());
  await page.waitForFunction(()=>document.querySelector("video").currentTime>.4);
  const trailer=await page.evaluate(()=>({title:document.title,worker:!!navigator.serviceWorker.controller,video:{time:document.querySelector("video").currentTime,width:document.querySelector("video").videoWidth,paused:document.querySelector("video").paused}}));
  await page.screenshot({path:"docs/evidence/promo-v211/installed-pwa-trailer.png"});
  await context.setOffline(true);
  await page.goto(root,{waitUntil:"domcontentloaded"});
  await page.waitForSelector(".screen--menu");
  const offline=await page.evaluate(()=>({menu:!!document.querySelector(".screen--menu"),worker:!!navigator.serviceWorker.controller}));
  report={status:trailer.worker&&trailer.video.width===1280&&!trailer.video.paused&&offline.menu&&errors.length===0?"PASS":"FAIL",base:root,trailer,offlineGame:offline,errors};
}catch(error){report={status:"FAIL",error:error.stack,errors};}
await browser.close();
await writeFile("docs/evidence/promo-v211/installed-navigation-qa.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(report.status!=="PASS")process.exitCode=1;
