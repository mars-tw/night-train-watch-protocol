import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base=process.env.GAME_URL??"http://127.0.0.1:4177/";
const output=process.env.EVIDENCE_DIR??"docs/evidence/v23";
await mkdir(`${output}/pixel`,{recursive:true});
const browser=await chromium.launch({headless:true});
const report={status:"RUNNING",authority:"fresh browser; visible UI; actual Canvas sources/pixels; no game-state injection",checks:[],failures:[],errors:[],svgRequests:[],viewports:[]};
const assert=(ok,label)=>{report.checks.push(label);if(!ok)report.failures.push(label);};
const click=async(page,selector)=>{const button=page.locator(selector).first();await button.waitFor({state:"visible"});const old=await button.elementHandle();await button.click();await page.waitForFunction(element=>!element.isConnected,old);await old.dispose();};
const hash=page=>page.evaluate(async()=>{const c=document.querySelector("canvas");const data=c.getContext("2d").getImageData(0,0,c.width,c.height).data;return [...new Uint8Array(await crypto.subtle.digest("SHA-256",data))].map(n=>n.toString(16).padStart(2,"0")).join("");});
try{
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1366,height:600}]){
    const context=await browser.newContext({viewport,locale:"zh-TW",serviceWorkers:"block"});
    await context.addInitScript(()=>{
      window.__pixelDraws=[];
      const draw=CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage=function(...args){
        const source=args[0]?.currentSrc||args[0]?.src||"";
        if(source.includes("/v23/")){window.__pixelDraws.push({source,rect:args.slice(1),smooth:this.imageSmoothingEnabled});if(window.__pixelDraws.length>3000)window.__pixelDraws.splice(0,1500);}
        return draw.apply(this,args);
      };
    });
    const page=await context.newPage();const requests=[];
    page.on("pageerror",error=>report.errors.push(error.message));
    page.on("request",request=>{requests.push(request.url());if(/\.svg(?:\?|$)/i.test(request.url()))report.svgRequests.push(request.url());});
    await page.goto(base,{waitUntil:"networkidle"});
    await page.waitForFunction(()=>window.__pixelDraws.some(draw=>draw.source.endsWith("/menu/hero.webp")));
    const first=await hash(page);await page.waitForTimeout(2500);const later=await hash(page);
    assert(first===later,`${viewport.width}: menu Canvas is pixel-identical after 2.5 seconds`);
    assert(!requests.some(url=>url.includes("/a07-clips/")||url.includes("/characters/a07/")),`${viewport.width}: menu requests no separate character animation`);
    await page.screenshot({path:`${output}/pixel/menu-${viewport.width}.png`});
    await click(page,'[data-action="new-game"][data-value="R01"]');
    await click(page,'.carriage-selector [data-action="select-carriage"][data-value="sleep"]');
    await page.waitForFunction(()=>new Set(window.__pixelDraws.filter(draw=>draw.source.endsWith("/a07-clips/sleep.webp")&&draw.rect.length===8).map(draw=>draw.rect.slice(0,4).join(","))).size===8,null,{timeout:10000});
    const pose=await page.evaluate(()=>{
      const c=document.querySelector("canvas"),box=c.getBoundingClientRect();
      const face={x:box.left+box.width*(417.375/720),y:box.top+box.height*(436.125/1280)};
      const head={left:box.left+box.width*(321.75/720),right:box.left+box.width*(520.5/720),top:box.top+box.height*(336.75/1280),bottom:box.top+box.height*(496.125/1280)};
      const cue=document.querySelector(".onboarding-cue")?.getBoundingClientRect();
      const frames=[...new Map(window.__pixelDraws.filter(draw=>draw.source.endsWith("/a07-clips/sleep.webp")&&draw.rect.length===8).map(draw=>[draw.rect.slice(0,4).join(","),draw])).values()];
      return {face,head,faceCovered:!!cue&&head.left<cue.right&&head.right>cue.left&&head.top<cue.bottom&&head.bottom>cue.top,frames,canvas:{width:box.width,height:box.height}};
    });
    assert(!pose.faceCovered,`${viewport.width}: the preparation guide does not cover A-07's face`);
    assert(pose.frames.length===8&&pose.frames.every(draw=>draw.rect[1]===0&&draw.rect[2]===192&&draw.rect[3]===192&&!draw.smooth),`${viewport.width}: all eight true sleep cells render with nearest sampling`);
    assert(Math.abs(pose.canvas.width/pose.canvas.height-9/16)<0.002,`${viewport.width}: the scene preserves its 9:16 aspect`);
    await page.screenshot({path:`${output}/pixel/sleep-${viewport.width}.png`});
    for(const carriage of ["defense","workshop","greenhouse","kitchen"]){
      await click(page,`.carriage-selector [data-action="select-carriage"][data-value="${carriage}"]`);
      await page.waitForTimeout(350);
      await page.screenshot({path:`${output}/pixel/${carriage}-${viewport.width}.png`});
    }
    await click(page,'.carriage-selector [data-action="select-carriage"][data-value="greenhouse"]');
    await page.waitForFunction(()=>[...document.querySelectorAll('.crop-scene-plot img,.crop-quick-picker img')].every(image=>image.complete&&image.naturalWidth>0));
    const cropSources=await page.locator('.crop-scene-plot img,.crop-quick-picker img').evaluateAll(images=>images.map(image=>image.currentSrc));
    assert(cropSources.length>=5&&cropSources.every(source=>source.includes("/v23/crops/")),`${viewport.width}: plots and picker use the new pixel crop sprites`);
    assert(!requests.some(url=>url.includes("/assets/art/crops/")),`${viewport.width}: no legacy crop-box image request`);
    await click(page,'.onboarding-cue [data-action="missions"]');
    await click(page,'.screen--missions [data-action="hub"][aria-label="返回"]');
    await click(page,'.screen--hub [data-action="menu"][aria-label="返回"]');
    await page.waitForTimeout(100);
    const savedMenu=await hash(page);await page.waitForTimeout(1500);
    assert(savedMenu===await hash(page),`${viewport.width}: menu stays still when an actual saved run exists`);
    report.viewports.push({viewport,menuHashes:[first,later],pose,cropSources});
    await context.close();
  }
  const alignment=JSON.parse(await readFile("public/assets/art/v23/a07-clips/manifest.json","utf8"));
  report.sleepAlignment=alignment.headMeasurement;
  assert(report.errors.length===0&&report.svgRequests.length===0,"all inspected pixel scenes have zero JavaScript errors and SVG requests");
}catch(error){report.failures.push(error.stack??String(error));}
await browser.close();report.status=report.failures.length?"FAIL":"PASS";
await writeFile(`${output}/pixel-qa.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,checks:report.checks.length,failures:report.failures},null,2));
if(report.failures.length)process.exitCode=1;
