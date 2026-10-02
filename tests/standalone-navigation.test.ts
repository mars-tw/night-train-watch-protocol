import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const scope="https://mars-tw.github.io/night-train-watch-protocol/";
const source=readFileSync(resolve(import.meta.dirname,"../public/sw.js"),"utf8");

async function navigate(path: string) {
  const handlers=new Map<string,(event: unknown)=>void>();
  const shell={kind:"cached-game-shell"};
  runInNewContext(source,{
    URL,
    self:{registration:{scope},addEventListener:(type:string,handler:(event:unknown)=>void)=>handlers.set(type,handler)},
    caches:{open:async()=>({match:async()=>shell})},
    fetch:async(request:{url:string})=>({kind:"network-document",url:request.url}),
  });
  let response:Promise<unknown>|undefined;
  handlers.get("fetch")!({request:{method:"GET",url:new URL(path,scope).href,mode:"navigate"},respondWith:(value:Promise<unknown>)=>{response=value;}});
  if(!response)throw new Error("The service worker did not handle navigation");
  return await response;
}

it("keeps offline game navigation on its coherent cached shell",async()=>{
  expect(await navigate("./")).toEqual({kind:"cached-game-shell"});
  expect(await navigate("index.html?source=readme")).toEqual({kind:"cached-game-shell"});
});

it("serves the actual trailer document to players who installed the game's service worker",async()=>{
  expect(await navigate("trailer.html")).toEqual({kind:"network-document",url:scope+"trailer.html"});
});
