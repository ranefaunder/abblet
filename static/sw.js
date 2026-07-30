/**
 * Service Worker — local-first cache for installed apps.
 *
 * Precaches (via client Cache API + this fetch handler):
 *   /{slug}            app shell HTML
 *   /{slug}/module.js  app custom-element code
 *   /static/app-icons/* launcher icons
 *
 * Strategy: network-first, fall back to cache when offline.
 */
const APP_CACHE = "remiix-apps-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => (k.startsWith("remiix-apps-") || k.startsWith("abblet-apps-")) && k !== APP_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isAppRuntimeRequest(url) {
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  if (path.startsWith("/static/app-icons/")) return true;
  if (/^\/\d{5,}\/module\.js$/.test(path)) return true;
  if (/^\/\d{5,}$/.test(path)) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (!isAppRuntimeRequest(url)) return;

  event.respondWith(
    (async () => {
      try {
        const network = await fetch(event.request);
        if (network.ok) {
          const cache = await caches.open(APP_CACHE);
          void cache.put(event.request, network.clone());
        }
        return network;
      } catch {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response("Offline", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "PRECACHE" && Array.isArray(data.urls)) {
    event.waitUntil(precacheUrls(data.urls));
  }

  if (data.type === "UNCACHE" && Array.isArray(data.urls)) {
    event.waitUntil(uncacheUrls(data.urls));
  }
});

async function precacheUrls(urls) {
  const cache = await caches.open(APP_CACHE);
  await Promise.all(
    urls.map(async (url) => {
      if (typeof url !== "string" || !url) return;
      try {
        const res = await fetch(url, { cache: "reload", credentials: "same-origin" });
        if (res.ok) await cache.put(url, res);
      } catch {
        // ignore individual failures
      }
    }),
  );
}

async function uncacheUrls(urls) {
  const cache = await caches.open(APP_CACHE);
  await Promise.all(
    urls.map(async (url) => {
      if (typeof url !== "string" || !url) return;
      try {
        await cache.delete(url);
      } catch {
        // ignore
      }
    }),
  );
}
