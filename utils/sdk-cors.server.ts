import type { BunRequest } from "bun";
import { parseAppRuntimeOrigin } from "/utils/app-host";

function isAppRuntimeCorsOrigin(origin: string | null): boolean {
  return parseAppRuntimeOrigin(origin) != null;
}

export function sdkCorsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

/** CORS for non-credentialed SDK calls (exchange / ai). */
export function sdkCredentialCorsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
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

export function withSdkCredentialCors(response: Response, origin: string | null): Response {
  // Credentials no longer used from app subdomains (host-only cookie). Same allowlist as withSdkCors.
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

/** OPTIONS preflight for /api/sdk/session|remix (no cookies; kept for compatibility). */
export function sdkCredentialCorsOptions(req: BunRequest): Response {
  const origin = req.headers.get("Origin");
  if (!origin || !isAppRuntimeCorsOrigin(origin)) {
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 204, headers: sdkCredentialCorsHeaders(origin) });
}
