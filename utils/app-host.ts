/** Same rule as server `isNumericAppSlug` — kept here to avoid pulling DB into the client bundle. */
const NUMERIC_APP_SLUG_RE = /^\d{5,}$/;
/** Standard UUID used as `apps.id` (capability preview subdomain). */
const APP_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isNumericAppSlug(slug: string): boolean {
  return NUMERIC_APP_SLUG_RE.test(slug);
}

export function isAppIdUuid(value: string): boolean {
  return APP_ID_UUID_RE.test(value);
}

export type AppRuntimeLabel =
  | { kind: "slug"; value: string }
  | { kind: "id"; value: string };

/**
 * Runtime hosts that serve apps on `{label}.{host}`.
 * `APP_RUNTIME_HOST` may be a single host or a comma-separated list; the first
 * entry is the canonical host used when generating app URLs.
 * e.g. `remiix.app` or `remiix.app,abblet.app` or `localhost`.
 */
export function getAppRuntimeHosts(): string[] {
  const raw = process.env.APP_RUNTIME_HOST?.trim().toLowerCase() ?? "";
  const hosts = raw
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  if (hosts.length === 0) {
    throw new Error("APP_RUNTIME_HOST is required (e.g. remiix.app or localhost)");
  }
  return [...new Set(hosts)];
}

/** Canonical runtime host (first of `APP_RUNTIME_HOST`). */
export function getAppRuntimeHost(): string {
  return getAppRuntimeHosts()[0]!;
}

/** e.g. `https://remiix.app` or `http://localhost:8090`. */
export function getPlatformOrigin(): string {
  const origin = process.env.PLATFORM_ORIGIN?.trim() ?? "";
  if (!origin) {
    throw new Error("PLATFORM_ORIGIN is required (e.g. https://remiix.app or http://localhost:8090)");
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
 * If Host is `{label}.{runtimeHost}`, return slug (numeric) or id (UUID).
 */
export function parseAppRuntimeLabel(hostHeader: string): AppRuntimeLabel | null {
  const host = stripHostPort(hostHeader);
  for (const runtimeHost of getAppRuntimeHosts()) {
    const suffix = `.${runtimeHost}`;
    if (!host.endsWith(suffix)) continue;
    const label = host.slice(0, -suffix.length);
    if (!label || label.includes(".")) continue;
    if (isNumericAppSlug(label)) return { kind: "slug", value: label };
    if (isAppIdUuid(label)) return { kind: "id", value: label.toLowerCase() };
  }
  return null;
}

/**
 * If Host is `{digits}.{runtimeHost}`, return the numeric slug.
 * Prefer `parseAppRuntimeLabel` when UUID hosts matter.
 */
export function parseAppSubdomain(hostHeader: string): string | null {
  const label = parseAppRuntimeLabel(hostHeader);
  return label?.kind === "slug" ? label.value : null;
}

/** True when Host is exactly a configured APP_RUNTIME_HOST apex. */
export function isAppRuntimeApex(hostHeader: string): boolean {
  const host = stripHostPort(hostHeader);
  return getAppRuntimeHosts().includes(host);
}

/** True when Host is a runtime apex or any subdomain of a configured runtime host. */
export function isAppRuntimeHost(hostHeader: string): boolean {
  const host = stripHostPort(hostHeader);
  return getAppRuntimeHosts().some(
    (runtimeHost) => host === runtimeHost || host.endsWith(`.${runtimeHost}`),
  );
}

/** Hostname of PLATFORM_ORIGIN (no port). */
export function getPlatformHost(): string {
  return stripHostPort(new URL(getPlatformOrigin()).host);
}

/** True when Host is the platform site (e.g. remiix.app), including www. */
export function isPlatformHost(hostHeader: string): boolean {
  const host = stripHostPort(hostHeader);
  const platform = getPlatformHost();
  return host === platform || host === `www.${platform}`;
}

/**
 * True when Host is a dedicated runtime apex that is not the platform
 * (e.g. abblet.app while platform is abblet.com). When platform and runtime
 * share a host (remiix.app), the apex serves the platform — never redirect-loop.
 */
export function shouldBounceRuntimeApexToPlatform(hostHeader: string): boolean {
  const host = stripHostPort(hostHeader);
  if (!isAppRuntimeApex(host)) return false;
  return !isPlatformHost(host);
}

/**
 * True when Host is an app-runtime hostname that should not serve the platform SPA:
 * numeric/UUID app subdomain, or a non-platform runtime apex/subdomain.
 */
export function isAppOnlyHost(hostHeader: string): boolean {
  const host = stripHostPort(hostHeader);
  if (parseAppRuntimeLabel(host)) return true;
  if (isPlatformHost(host)) return false;
  return isAppRuntimeHost(host);
}

/**
 * Absolute origin for an app label on the canonical runtime host, e.g.
 * `https://34211.remiix.app` or `https://{uuid}.remiix.app`.
 */
export function appOrigin(label: string): string {
  const runtimeHost = getAppRuntimeHost();
  const platform = new URL(getPlatformOrigin());
  const port = platform.port;
  const host = port ? `${label}.${runtimeHost}:${port}` : `${label}.${runtimeHost}`;
  return `${platform.protocol}//${host}`;
}

export type AppRuntimeRow = {
  id: string;
  slug: string;
  visibility: string;
  published_version_id: string | null;
};

/** Published → numeric slug host; otherwise UUID capability host. */
export function isAppPubliclyRunnable(row: AppRuntimeRow): boolean {
  return row.visibility === "public" && Boolean(row.published_version_id);
}

export function appRuntimeOrigin(row: AppRuntimeRow): string {
  return isAppPubliclyRunnable(row) ? appOrigin(row.slug) : appOrigin(row.id);
}

/** Redirect to platform home, preserving query string from a request URL. */
export function redirectToPlatformFromRequest(req: { url: string }): Response {
  const url = new URL(req.url);
  return Response.redirect(`${getPlatformOrigin()}/${url.search}`, 302);
}

/** Platform URL that issues a connect code for an app slug. */
export function connectUrl(slug: string): string {
  return `${getPlatformOrigin()}/connect/${slug}`;
}

/**
 * True if Origin is a valid app subdomain for this app (slug host or id host).
 */
export function isOriginForApp(
  originHeader: string | null,
  app: { id: string; slug: string },
): boolean {
  if (!originHeader) return false;
  try {
    const host = stripHostPort(new URL(originHeader).host);
    const label = parseAppRuntimeLabel(host);
    if (!label) return false;
    if (label.kind === "slug") return label.value === app.slug;
    return label.value === app.id.toLowerCase();
  } catch {
    return false;
  }
}

/** @deprecated Prefer `isOriginForApp` (supports UUID preview hosts). */
export function isOriginForAppSlug(originHeader: string | null, slug: string): boolean {
  if (!originHeader) return false;
  try {
    const host = stripHostPort(new URL(originHeader).host);
    const label = parseAppRuntimeLabel(host);
    return label?.kind === "slug" && label.value === slug;
  } catch {
    return false;
  }
}

/** Parse Origin into runtime label (slug or id), or null. */
export function parseAppRuntimeOrigin(originHeader: string | null): AppRuntimeLabel | null {
  if (!originHeader) return null;
  try {
    return parseAppRuntimeLabel(new URL(originHeader).host);
  } catch {
    return null;
  }
}

/**
 * True if Origin is any numeric app subdomain of a configured runtime host.
 * Returns the numeric slug only (not UUID). Prefer `parseAppRuntimeOrigin`.
 */
export function isAppRuntimeOrigin(originHeader: string | null): string | null {
  const label = parseAppRuntimeOrigin(originHeader);
  return label?.kind === "slug" ? label.value : null;
}

const LEGACY_PLATFORM_HOSTS = new Set([
  "abblet.com",
  "www.abblet.com",
  "rmix.app",
  "www.rmix.app",
]);
const LEGACY_RUNTIME_REDIRECTS: Array<{ apex: Set<string>; suffix: string }> = [
  { apex: new Set(["abblet.app", "www.abblet.app"]), suffix: ".abblet.app" },
  { apex: new Set(["rmix.app", "www.rmix.app"]), suffix: ".rmix.app" },
];

/**
 * Permanent redirects from retired domains:
 * - abblet.com / rmix.app → PLATFORM_ORIGIN (remiix.app)
 * - {sub}.abblet.app / {sub}.rmix.app → {sub}.{APP_RUNTIME_HOST}
 * - abblet.app / rmix.app apex → PLATFORM_ORIGIN
 */
export function redirectLegacyHost(req: { headers: Headers; url: string }): Response | null {
  const host = getRequestHost(req);
  if (!host) return null;

  const url = new URL(req.url);
  const pathSearch = `${url.pathname}${url.search}`;
  const platform = getPlatformOrigin();

  if (LEGACY_PLATFORM_HOSTS.has(host) || host.endsWith(".abblet.com")) {
    return Response.redirect(`${platform}${pathSearch}`, 301);
  }

  for (const { apex, suffix } of LEGACY_RUNTIME_REDIRECTS) {
    if (apex.has(host)) {
      return Response.redirect(`${platform}${pathSearch}`, 301);
    }
    if (host.endsWith(suffix)) {
      const sub = host.slice(0, -suffix.length);
      if (!sub || sub.includes(".")) {
        return Response.redirect(`${platform}${pathSearch}`, 301);
      }
      const runtimeHost = getAppRuntimeHost();
      const proto = new URL(platform).protocol;
      return Response.redirect(`${proto}//${sub}.${runtimeHost}${pathSearch}`, 301);
    }
  }

  return null;
}
