import type { BunRequest } from "bun";
import { parseAppRuntimeOrigin } from "/utils/app-host";

function isAppRuntimeCorsOrigin(origin: string | null): boolean {
  return parseAppRuntimeOrigin(origin) != null;
}

export function sdkCorsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    // GET: /api/sdk/credits (Bearer). POST: ai / open / exchange / remix.
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

/** @deprecated Alias — SDK calls use Bearer tokens, not cookies. */
export function sdkCredentialCorsHeaders(origin: string): HeadersInit {
  return sdkCorsHeaders(origin);
}

/** Attach SDK CORS headers when Origin is an app runtime host (slug or UUID). */
export function withSdkCors(response: Response, origin: string | null): Response {
  if (!origin || !isAppRuntimeCorsOrigin(origin)) return response;
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(sdkCorsHeaders(origin))) {
    headers.set(k, v);
  }
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Same allowlist as withSdkCors. Host-only cookies are NOT sent to app subdomains,
 * but same-site fetch from `*.remiix.app` → `remiix.app` still includes the cookie —
 * platform mutating APIs must check Origin === PLATFORM_ORIGIN (see server.ts).
 */
export function withSdkCredentialCors(response: Response, origin: string | null): Response {
  return withSdkCors(response, origin);
}

/** OPTIONS preflight for /api/sdk/* (Bearer / no cookies). */
export function sdkCorsOptions(req: BunRequest): Response {
  const origin = req.headers.get("Origin");
  if (!origin || !isAppRuntimeCorsOrigin(origin)) {
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 204, headers: sdkCorsHeaders(origin) });
}

/** OPTIONS preflight (Bearer; kept for compatibility). */
export function sdkCredentialCorsOptions(req: BunRequest): Response {
  return sdkCorsOptions(req);
}
