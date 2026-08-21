import { getPlatformOrigin } from "/utils/app-host";

export type SecurityHeaderKind = "platform-html" | "api" | "app-runtime" | "static";

/**
 * Aligns with Caddy `abblet_platform_headers` for abblet.com (CDN + analytics).
 * App-runtime uses a tighter connect-src (platform + self only) so generated
 * apps cannot exfiltrate to arbitrary hosts — Caddy's broader CSP still applies
 * in prod; multiple CSP headers are AND-ed by the browser.
 */
function abbletCdnOrigins(): string {
  return "https://abblet.b-cdn.net";
}

function platformCsp(): string {
  let platformOrigin = "https://abblet.com";
  try {
    platformOrigin = getPlatformOrigin();
  } catch {
    // env may be unset in some scripts
  }
  const cdn = abbletCdnOrigins();
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://cloud.umami.is`,
    `style-src 'self' 'unsafe-inline' ${cdn}`,
    `img-src 'self' data: blob: https: ${cdn} https://cloud.umami.is`,
    `font-src 'self' data: ${cdn}`,
    `connect-src 'self' ${platformOrigin} https://cloud.umami.is https://api-gateway.umami.dev https://gateway.umami.is`,
    `manifest-src 'self' ${cdn}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function appRuntimeCsp(): string {
  let platformOrigin = "https://abblet.com";
  try {
    platformOrigin = getPlatformOrigin();
  } catch {
    // ignore
  }
  const cdn = abbletCdnOrigins();
  // Tight connect-src: only this app origin + platform API (no *.abblet.com peers, no evil.tld).
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    `style-src 'self' 'unsafe-inline' ${cdn}`,
    `img-src 'self' data: blob: ${cdn}`,
    `font-src 'self' data: ${cdn}`,
    `connect-src 'self' ${platformOrigin}`,
    `manifest-src 'self' ${cdn}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    `form-action 'self' ${platformOrigin}`,
  ].join("; ");
}

/** Baseline headers for all responses; HTML kinds also get CSP / frame denial. */
export function securityHeaderEntries(kind: SecurityHeaderKind = "api"): Array<[string, string]> {
  const entries: Array<[string, string]> = [
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    [
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=(), payment=(), usb=(), fullscreen=(self)",
    ],
  ];

  if (process.env.NODE_ENV === "production") {
    entries.push(["Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload"]);
  }

  if (kind === "platform-html") {
    entries.push(["X-Frame-Options", "DENY"]);
    entries.push(["Content-Security-Policy", platformCsp()]);
  } else if (kind === "app-runtime") {
    entries.push(["X-Frame-Options", "DENY"]);
    entries.push(["Content-Security-Policy", appRuntimeCsp()]);
  } else if (kind === "api" || kind === "static") {
    entries.push(["X-Frame-Options", "DENY"]);
  }

  return entries;
}

/** Clone response with security headers (does not overwrite existing same-name headers). */
export function applySecurityHeaders(res: Response, kind: SecurityHeaderKind = "api"): Response {
  const headers = new Headers(res.headers);
  for (const [name, value] of securityHeaderEntries(kind)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export async function withSecurityHeaders(
  result: Response | Promise<Response>,
  kind: SecurityHeaderKind = "api",
): Promise<Response> {
  return applySecurityHeaders(await result, kind);
}
