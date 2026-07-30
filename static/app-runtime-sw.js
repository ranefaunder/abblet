/**
 * Service Worker for a single app origin (`{slug}.{APP_RUNTIME_HOST}`).
 *
 * - Precaches shell on install / PRECACHE (only then does cache update)
 * - Cache-first for `/`, `/module.js`, icons — no automatic background refresh
 * - CHECK_UPDATE compares network /module.js to cache; client shows Update UI
 * - Never treats `/install` as the app shell
 */
const CACHE = "remiix-app-runtime-v5";
const CORE = ["/", "/module.js", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        CORE.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload", credentials: "same-origin" });
            if (res.ok) await cache.put(url, res);
          } catch {
            // ignore
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("remiix-app-runtime-") && k !== CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isInstallPath(url) {
  return url.pathname === "/install" || url.pathname === "/install/";
}

function shouldHandle(url) {
  if (url.origin !== self.location.origin) return false;
  if (isInstallPath(url)) return false;
  const path = url.pathname;
  if (path === "/" || path === "") return true;
  if (path === "/module.js") return true;
  if (path === "/manifest.webmanifest") return true;
  if (path.startsWith("/static/app-icons/")) return true;
  if (path.startsWith("/static/favicons/")) return true;
  if (path === "/static/remiix-app.js") return true;
  if (path === "/static/images/remiix-icon-light.svg") return true;
  return false;
}

function cacheKeyFor(request, url) {
  if (url.pathname === "/" || url.pathname === "") {
    return new Request(new URL("/", url.origin).href, { credentials: request.credentials });
  }
  return request;
}

async function cacheFirst(request, url) {
  const cache = await caches.open(CACHE);
  const key = cacheKeyFor(request, url);
  const cached = await cache.match(key);
  if (cached) return cached;

  try {
    const network = await fetch(request);
    if (network.ok) {
      void cache.put(key, network.clone());
    }
    return network;
  } catch {
    return new Response("Offline", {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (!shouldHandle(url)) return;
  event.respondWith(cacheFirst(event.request, url));
});

function buffersEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  for (let i = 0; i < va.length; i++) {
    if (va[i] !== vb[i]) return false;
  }
  return true;
}

async function checkModuleUpdate() {
  const cache = await caches.open(CACHE);
  const cached = await cache.match("/module.js");
  let network;
  try {
    network = await fetch("/module.js", { cache: "reload", credentials: "same-origin" });
  } catch {
    return false;
  }
  if (!network.ok) return false;
  const netBuf = await network.arrayBuffer();
  if (!cached) return netBuf.byteLength > 0;
  const cachedBuf = await cached.arrayBuffer();
  return !buffersEqual(netBuf, cachedBuf);
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(message);
  }
}

async function precacheUrls(urls) {
  const cache = await caches.open(CACHE);
  const list = [...new Set([...CORE, ...urls].filter((u) => typeof u === "string" && u))];
  await Promise.all(
    list.map(async (url) => {
      try {
        if (url.includes("/install")) return;
        const res = await fetch(url, { cache: "reload", credentials: "same-origin" });
        if (!res.ok) return;
        const path = new URL(url, self.location.origin).pathname;
        const key = path === "/" ? "/" : url;
        await cache.put(key, res);
      } catch {
        // ignore
      }
    }),
  );
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "PRECACHE" && Array.isArray(data.urls)) {
    event.waitUntil(precacheUrls(data.urls));
  }

  if (data.type === "CHECK_UPDATE") {
    event.waitUntil(
      (async () => {
        const available = await checkModuleUpdate();
        const source = event.source;
        if (source) {
          source.postMessage({ type: "UPDATE_STATUS", available });
        } else {
          await notifyClients({ type: "UPDATE_STATUS", available });
        }
      })(),
    );
  }

  if (data.type === "APPLY_UPDATE") {
    const urls = Array.isArray(data.urls) ? data.urls : CORE;
    event.waitUntil(
      (async () => {
        await precacheUrls(urls);
        await notifyClients({ type: "UPDATE_APPLIED" });
      })(),
    );
  }
});
