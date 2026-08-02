/**
 * Registers Service Worker for PWA (offline icons).
 * Does not force reload on controllerchange — that races with iOS/Android
 * cold starts and leaves a blank white window until the PWA is force-quit.
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    // Same origin as the page — not CDN/staticRoot (cross-origin SW is invalid).
    navigator.serviceWorker
      .register("/static/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        console.info("[PWA] Service Worker registered:", registration.scope);

        void registration.update();
        const updateIntervalMs = 5 * 60 * 1000;
        window.setInterval(() => {
          void registration.update();
        }, updateIntervalMs);

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              console.info("[PWA] New service worker ready (applies on next navigation).");
            }
          });
        });
      })
      .catch((error) => {
        console.warn("[PWA] Service Worker registration failed:", error);
      });
  });
}
