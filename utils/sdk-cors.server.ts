import type { BunRequest } from "bun";
import { isAppRuntimeOrigin } from "/utils/app-host";

export function sdkCorsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

/** Credentialed CORS for cookie-auth SDK calls (session / remix). */
export function sdkCredentialCorsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

/** Attach SDK CORS headers when Origin is a numeric app subdomain. */
export function withSdkCors(response: Response, origin: string | null): Response {
  if (!origin || !isAppRuntimeOrigin(origin)) return response;
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(sdkCorsHeaders(origin))) {
    headers.set(k, v);
  }
  return new Response(response.body, { status: response.status, headers });
}

export function withSdkCredentialCors(response: Response, origin: string | null): Response {
  if (!origin || !isAppRuntimeOrigin(origin)) return response;
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(sdkCredentialCorsHeaders(origin))) {
    headers.set(k, v);
  }
  return new Response(response.body, { status: response.status, headers });
}

/** OPTIONS preflight for /api/sdk/* (Bearer / no cookies). */
export function sdkCorsOptions(req: BunRequest): Response {
  const origin = req.headers.get("Origin");
  if (!origin || !isAppRuntimeOrigin(origin)) {
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 204, headers: sdkCorsHeaders(origin) });
}

/** OPTIONS preflight for credentialed /api/sdk/* (cookie session). */
export function sdkCredentialCorsOptions(req: BunRequest): Response {
  const origin = req.headers.get("Origin");
  if (!origin || !isAppRuntimeOrigin(origin)) {
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 204, headers: sdkCredentialCorsHeaders(origin) });
}
