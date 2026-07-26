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

/** Attach SDK CORS headers when Origin is a numeric app subdomain. */
export function withSdkCors(response: Response, origin: string | null): Response {
  if (!origin || !isAppRuntimeOrigin(origin)) return response;
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(sdkCorsHeaders(origin))) {
    headers.set(k, v);
  }
  return new Response(response.body, { status: response.status, headers });
}

/** OPTIONS preflight for /api/sdk/* */
export function sdkCorsOptions(req: BunRequest): Response {
  const origin = req.headers.get("Origin");
  if (!origin || !isAppRuntimeOrigin(origin)) {
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 204, headers: sdkCorsHeaders(origin) });
}
