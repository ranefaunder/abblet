import { isClient } from "/utils/env";
import { appIconPngSrc, appIconSrc } from "/utils/app-icon";

const APP_CACHE = "remiix-apps-v1";

export type OfflineAppRef = {
  slug: string;
  iconId?: string | null;
};

/**
 * Assets the platform (remiix.app) can warm for offline.
 * App shell + module.js live on `{slug|uuid}.remiix.app` — only that origin
 * can cache them (see remiix-app.js / install page). Fetching them from the
 * platform is cross-origin and useless for the app SW.
 */
export function offlineAppUrls(app: OfflineAppRef, _lang = "en"): string[] {
  const urls: string[] = [];
  const icon = appIconSrc(app.iconId);
  if (icon) urls.push(icon);
  const png = appIconPngSrc(app.iconId);
  if (png && png !== icon) urls.push(png);
  return urls;
}

function sameOriginUrls(urls: string[]): string[] {
  if (!isClient) return urls;
  const origin = location.origin;
  return urls.filter((url) => {
    try {
      return new URL(url, origin).origin === origin;
    } catch {
      return false;
    }
  });
}

async function postToServiceWorker(message: { type: string; urls: string[] }): Promise<void> {
  if (!isClient || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const worker = reg.active ?? navigator.serviceWorker.controller;
    worker?.postMessage(message);
  } catch {
    // SW not ready — fall back to Cache API from the page
    if (message.type === "PRECACHE") await precacheViaCacheApi(message.urls);
    if (message.type === "UNCACHE") await uncacheViaCacheApi(message.urls);
  }
}

async function precacheViaCacheApi(urls: string[]): Promise<void> {
  if (!isClient || !("caches" in globalThis)) return;
  const cache = await caches.open(APP_CACHE);
  await Promise.all(
    sameOriginUrls(urls).map(async (url) => {
      try {
        const res = await fetch(url, { cache: "reload", credentials: "same-origin" });
        if (res.ok) await cache.put(url, res);
      } catch {
        // ignore
      }
    }),
  );
}

async function uncacheViaCacheApi(urls: string[]): Promise<void> {
  if (!isClient || !("caches" in globalThis)) return;
  const cache = await caches.open(APP_CACHE);
  await Promise.all(sameOriginUrls(urls).map((url) => cache.delete(url).catch(() => false)));
}

/** Warm same-origin launcher icons for an installed app. */
export async function precacheInstalledApp(app: OfflineAppRef, lang?: string): Promise<void> {
  if (!isClient) return;
  const urls = offlineAppUrls(app, lang);
  if (urls.length === 0) return;
  await postToServiceWorker({ type: "PRECACHE", urls });
  // Also write from the page so cache is filled even if SW message is delayed.
  await precacheViaCacheApi(urls);
}

/** Remove cached assets for an uninstalled/deleted app. */
export async function uncacheInstalledApp(app: OfflineAppRef, lang?: string): Promise<void> {
  if (!isClient) return;
  const urls = offlineAppUrls(app, lang);
  if (urls.length === 0) return;
  await postToServiceWorker({ type: "UNCACHE", urls });
  await uncacheViaCacheApi(urls);
}

/** Background-precache icons for every app currently in the home library. */
export function precacheLibraryApps(apps: OfflineAppRef[], lang?: string): void {
  if (!isClient || apps.length === 0) return;
  void (async () => {
    for (const app of apps) {
      await precacheInstalledApp(app, lang);
    }
  })();
}
