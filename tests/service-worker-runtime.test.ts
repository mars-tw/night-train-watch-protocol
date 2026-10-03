import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

type Listener = (event: { waitUntil(promise: Promise<unknown>): void; data?: unknown; ports?: MessagePort[]; source?: { postMessage(message: unknown): void }; request?: Request; respondWith?(promise: Promise<Response>): void }) => void;

class MemoryCache {
  entries = new Map<string, Response>();
  failAdd = false;
  async addAll(requests: Request[]) {
    if (this.failAdd) throw new Error("asset unavailable");
    const staged = new Map<string, Response>();
    for (const request of requests) staged.set(request.url, new Response("asset"));
    for (const [url, response] of staged) this.entries.set(url, response);
  }
  async put(request: string | Request, response: Response) {
    this.entries.set(typeof request === "string" ? request : request.url, response);
  }
  async match(request: string | Request) {
    return this.entries.get(typeof request === "string" ? request : request.url);
  }
}

function workerHarness(build: string, stores: Map<string, MemoryCache>, failAdd = false) {
  const listeners = new Map<string, Listener>();
  const scope = "https://game.test/play/";
  let currentCache: MemoryCache | undefined;
  const caches = {
    async open(name: string) {
      currentCache = stores.get(name) ?? new MemoryCache();
      currentCache.failAdd = failAdd;
      stores.set(name, currentCache);
      return currentCache;
    },
    async keys() { return [...stores.keys()]; },
    async delete(name: string) { return stores.delete(name); },
  };
  const self = {
    registration: { scope },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener(type: string, listener: Listener) { listeners.set(type, listener); },
  };
  const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8")
    .replaceAll("__NTWP_BUILD__", build)
    .replaceAll("__NTWP_VERSION__", `v-${build}`);
  vm.runInNewContext(source, {
    self,
    caches,
    URL,
    Request,
    Response,
    fetch: async (url: string) => url.endsWith("precache.json")
      ? new Response(JSON.stringify({ build, files: ["index.html", "assets/app.js"] }), { status: 200 })
      : new Response("network"),
  });
  const dispatch = async (type: string, extra: Record<string, unknown> = {}) => {
    const promises: Promise<unknown>[] = [];
    listeners.get(type)?.({ waitUntil: promise => promises.push(promise), ...extra });
    await Promise.all(promises);
  };
  return { dispatch, get cache() { return currentCache; } };
}

describe("service worker install lifecycle", () => {
  it("keeps the previous version when an install fails, then marks a complete retry ready", async () => {
    const stores = new Map<string, MemoryCache>();
    const old = new MemoryCache();
    old.entries.set("https://game.test/play/index.html", new Response("old shell"));
    stores.set("night-train-v2-old", old);

    const failed = workerHarness("new", stores, true);
    await expect(failed.dispatch("install")).rejects.toThrow("asset unavailable");
    expect(stores.has("night-train-v2-old")).toBe(true);
    expect(stores.get("night-train-v2-new")?.entries.has("https://game.test/play/.ntwp-offline-ready")).toBe(false);

    // A later worker install retries into a fresh build cache.
    stores.delete("night-train-v2-new");
    const retry = workerHarness("new", stores);
    await retry.dispatch("install");
    await retry.dispatch("activate");

    expect(stores.has("night-train-v2-old")).toBe(true);
    const next = stores.get("night-train-v2-new");
    expect(next?.entries.has("https://game.test/play/index.html")).toBe(true);
    expect(next?.entries.has("https://game.test/play/.ntwp-offline-ready")).toBe(true);
  });
});
