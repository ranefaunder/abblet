/** Persist last in-app route so reload / splash entry restores it (splash = first visit only). */

export const LAST_PATH_STORAGE_KEY = "remiix.lastPath";

const RESTORABLE =
  /^\/[a-z]{2}\/(apps|games|me|about|create)(\/[^/]+)?\/?$/;

/** True for SPA pages we should remember (not splash, login, or app runtime). */
export function isRestorablePath(path: string): boolean {
  const bare = path.split("?")[0]?.split("#")[0] ?? "";
  const normalized = bare.length > 1 && bare.endsWith("/") ? bare.slice(0, -1) : bare;
  if (!RESTORABLE.test(normalized)) return false;
  const rest = normalized.split("/").slice(2).join("/");
  if (rest === "login" || rest.startsWith("login/")) return false;
  return true;
}

export function readLastPath(): string | null {
  try {
    const raw = localStorage.getItem(LAST_PATH_STORAGE_KEY);
    if (!raw || typeof raw !== "string") return null;
    const path = raw.trim();
    return isRestorablePath(path) ? path : null;
  } catch {
    return null;
  }
}

export function writeLastPath(path: string): void {
  if (!isRestorablePath(path)) return;
  const bare = path.split("#")[0] ?? path;
  const normalized =
    bare.length > 1 && bare.endsWith("/") ? bare.slice(0, -1) : bare;
  try {
    localStorage.setItem(LAST_PATH_STORAGE_KEY, normalized);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Inline-safe check used by the early splash redirect script (keep in sync). */
export function isSplashPathname(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length === 1 && /^[a-z]{2}$/.test(parts[0]!);
}
