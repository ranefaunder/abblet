/**
 * Staattisten tiedostojen juuri pyyntö-URL:sta (dev: sama origin kuin sivulla).
 * Tuotanto: CDN (origin pull: https://abblet.com/static).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function resolveStaticRootFromUrl(reqUrl: string): string {
  if (process.env.NODE_ENV === "production") {
    return "https://abblet.b-cdn.net";
  }
  return `${new URL(reqUrl).origin}/static`;
}

const STYLES_DIR = join(import.meta.dir, "../static/styles");

let cachedAssetVersion: string | undefined;

/** Content hash so CDN/browser pick up new icons.css after deploy. */
export function getStaticAssetVersion(): string {
  if (cachedAssetVersion) return cachedAssetVersion;
  const h = createHash("sha1");
  for (const name of ["icons.css", "style.css", "faunder-ui.css", "heading.css"]) {
    try {
      h.update(readFileSync(join(STYLES_DIR, name)));
    } catch {
      h.update(name);
    }
  }
  cachedAssetVersion = h.digest("hex").slice(0, 10);
  return cachedAssetVersion;
}

/** Versioned stylesheet URL under the static root. */
export function staticStylesheetHref(staticRoot: string, file: string): string {
  return `${staticRoot}/styles/${file}?v=${getStaticAssetVersion()}`;
}
