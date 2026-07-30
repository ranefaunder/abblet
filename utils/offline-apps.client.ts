import { isClient } from "/utils/env";
import { appIconPngSrc, appIconSrc } from "/utils/app-icon";
import { appModuleUrl, appPageUrl } from "/utils/app-url";

const APP_CACHE = "remiix-apps-v1";

export type OfflineAppRef = {
  slug: string;
  iconId?: string | null;
};

/** URLs needed to open an installed app offline. */
export function offlineAppUrls(app: OfflineAppRef, lang = "en"): string[] {
  const urls = [appPageUrl(lang, app.slug), appModuleUrl(lang, app.slug)];
  const icon = appIconSrc(app.iconId);
  if (icon) urls.push(icon);
  const png = appIconPngSrc(app.iconId);
  if (png && png !== icon) urls.push(png);
  return urls;
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
    urls.map(async (url) => {
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
  await Promise.all(urls.map((url) => cache.delete(url).catch(() => false)));
}

/** Download + cache an installed app for offline use. */
export async function precacheInstalledApp(app: OfflineAppRef, lang?: string): Promise<void> {
  if (!isClient) return;
  const urls = offlineAppUrls(app, lang);
  await postToServiceWorker({ type: "PRECACHE", urls });
  // Also write from the page so cache is filled even if SW message is delayed.
  await precacheViaCacheApi(urls);
}

/** Remove cached assets for an uninstalled/deleted app. */
export async function uncacheInstalledApp(app: OfflineAppRef, lang?: string): Promise<void> {
  if (!isClient) return;
  const urls = offlineAppUrls(app, lang);
  await postToServiceWorker({ type: "UNCACHE", urls });
  await uncacheViaCacheApi(urls);
}

/** Background-precache every app currently in the home library. */
export function precacheLibraryApps(apps: OfflineAppRef[], lang?: string): void {
  if (!isClient || apps.length === 0) return;
  void (async () => {
    for (const app of apps) {
      await precacheInstalledApp(app, lang);
    }
  })();
}
