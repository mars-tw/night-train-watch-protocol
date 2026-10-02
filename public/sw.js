/* Versioned shell + immutable build precache. Legacy saves use separate keys. */
const BUILD = "__NTWP_BUILD__";
const CACHE = `night-train-v2-${BUILD}`;
const SCOPE = self.registration.scope;
const localUrl = (path) => new URL(path, SCOPE).href;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const response = await fetch(localUrl("precache.json"), { cache: "no-store" });
    if (!response.ok) throw new Error("Cannot install incomplete game build");
    const manifest = await response.json();
    if (manifest.build !== BUILD || !Array.isArray(manifest.files)) throw new Error("Game build mismatch");
    const urls = manifest.files.map(localUrl);
    if (urls.some(url => !url.startsWith(SCOPE))) throw new Error("Invalid precache scope");
    const cache = await caches.open(CACHE);
    // addAll is atomic: a missing asset does not install a half-updated game.
    await cache.addAll(urls.map(url => new Request(url, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = (await caches.keys()).filter(key => key.startsWith("night-train-v"));
    const previous = keys.filter(key => key !== CACHE).at(-1);
    await Promise.all(keys.filter(key => key !== CACHE && key !== previous).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(SCOPE)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === "navigate") {
      const shell = await cache.match(localUrl("index.html"));
      return shell ?? fetch(request);
    }
    // These are same-scope immutable public assets. Vite adds Vary: Origin,
    // while crossorigin module/style requests differ from precache requests.
    const current = await cache.match(request, { ignoreVary: true });
    if (current) return current;
    const priorKeys = (await caches.keys()).filter(key => key.startsWith("night-train-v") && key !== CACHE);
    for (const key of priorKeys.reverse()) {
      const previous = await (await caches.open(key)).match(request, { ignoreVary: true });
      if (previous) return previous;
    }
    // An image or optional recording is never substituted with HTML.
    return fetch(request);
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "NTWP_BUILD") event.source?.postMessage({ type: "NTWP_BUILD", build: BUILD, version: "2.0.0" });
});
