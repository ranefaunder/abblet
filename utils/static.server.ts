/**
 * Staattisten tiedostojen juuri pyyntö-URL:sta (dev: sama origin kuin sivulla).
 * Tuotanto: CDN (origin pull: https://abblet.com/static).
 */
export function resolveStaticRootFromUrl(reqUrl: string): string {
  if (process.env.NODE_ENV === "production") {
    return "https://abblet.b-cdn.net";
  }
  return `${new URL(reqUrl).origin}/static`;
}
