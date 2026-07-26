/** Same rule as server `isNumericAppSlug` — kept here to avoid pulling DB into the client bundle. */
const NUMERIC_APP_SLUG_RE = /^\d{5,}$/;

function isNumericAppSlug(slug: string): boolean {
  return NUMERIC_APP_SLUG_RE.test(slug);
}

/** e.g. `abblet.app` (prod) or `app.localhost` (dev). */
export function getAppRuntimeHost(): string {
  const host = process.env.APP_RUNTIME_HOST?.trim().toLowerCase() ?? "";
  if (!host) {
    throw new Error("APP_RUNTIME_HOST is required (e.g. abblet.app or app.localhost)");
  }
  return host;
}

/** e.g. `https://abblet.com` or `http://localhost:8090`. */
export function getPlatformOrigin(): string {
  const origin = process.env.PLATFORM_ORIGIN?.trim() ?? "";
  if (!origin) {
    throw new Error("PLATFORM_ORIGIN is required (e.g. https://abblet.com or http://localhost:8090)");
  }
  return origin.replace(/\/$/, "");
}

/** Hostname from a Host header or URL host, without port. */
export function stripHostPort(hostHeader: string): string {
  const trimmed = hostHeader.trim().toLowerCase();
  if (!trimmed) return "";
  // IPv6: [::1]:8090
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    if (end !== -1) return trimmed.slice(0, end + 1);
  }
  const colon = trimmed.lastIndexOf(":");
  if (colon !== -1 && trimmed.includes(".")) return trimmed.slice(0, colon);
  if (colon !== -1 && /^\d+$/.test(trimmed.slice(colon + 1))) return trimmed.slice(0, colon);
  return trimmed;
}

export function getRequestHost(req: { headers: Headers; url?: string }): string {
  const header = req.headers.get("host");
  if (header) return stripHostPort(header);
  if (req.url) return stripHostPort(new URL(req.url).host);
  return "";
}

/**
 * If Host is `{digits}.{APP_RUNTIME_HOST}`, return the numeric slug; otherwise null.
 */
export function parseAppSubdomain(hostHeader: string): string | null {
  const host = stripHostPort(hostHeader);
  const runtimeHost = getAppRuntimeHost();
  const suffix = `.${runtimeHost}`;
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  if (!slug || slug.includes(".")) return null;
  return isNumericAppSlug(slug) ? slug : null;
}

/** True when Host is exactly APP_RUNTIME_HOST (apex). */
export function isAppRuntimeApex(hostHeader: string): boolean {
  return stripHostPort(hostHeader) === getAppRuntimeHost();
}

/** True when Host is apex or any subdomain of APP_RUNTIME_HOST. */
export function isAppRuntimeHost(hostHeader: string): boolean {
  const host = stripHostPort(hostHeader);
  const runtimeHost = getAppRuntimeHost();
  return host === runtimeHost || host.endsWith(`.${runtimeHost}`);
}

/**
 * Absolute origin for an app on the runtime host, e.g.
 * `https://34211.abblet.app` or `http://34211.app.localhost:8090`.
 */
export function appOrigin(slug: string): string {
  const runtimeHost = getAppRuntimeHost();
  const platform = new URL(getPlatformOrigin());
  const port = platform.port;
  const host = port ? `${slug}.${runtimeHost}:${port}` : `${slug}.${runtimeHost}`;
  return `${platform.protocol}//${host}`;
}

/** Redirect to platform home, preserving query string from a request URL. */
export function redirectToPlatformFromRequest(req: { url: string }): Response {
  const url = new URL(req.url);
  return Response.redirect(`${getPlatformOrigin()}/${url.search}`, 302);
}
