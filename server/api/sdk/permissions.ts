import type { BunRequest } from "bun";
import { apiError, apiSuccess } from "/utils/api.server";
import { isOriginForApp } from "/utils/app-host";
import { resolveAppFromOrigin } from "/utils/app-runtime.server";
import {
  dbDeleteRuntimeTokensForApp,
  dbListPermissionGrants,
  dbRevokePermissionGrant,
} from "/server/database/queries/permission";
import { usdMicrosToUsd } from "/utils/credits.server";
import { parseBearerToken, resolveRuntimeToken } from "/utils/sdk-auth.server";
import { sdkCorsOptions, withSdkCors } from "/utils/sdk-cors.server";

const ALLOWED_SCOPES = new Set(["ai", "sync"]);

function grantPayload(row: {
  scope: string;
  granted_at: string;
  monthly_limit_usd_micros: number;
  period_spent_usd_micros: number;
  period_ym: string;
}) {
  return {
    scope: row.scope,
    grantedAt: row.granted_at,
    monthlyLimitUsd: usdMicrosToUsd(row.monthly_limit_usd_micros),
    periodSpentUsd: usdMicrosToUsd(row.period_spent_usd_micros),
    periodYm: row.period_ym,
  };
}

function resolveSdkCaller(req: BunRequest):
  | { ok: true; origin: string | null; userId: string; appSlug: string }
  | { ok: false; response: Response } {
  const origin = req.headers.get("Origin");
  const resolved = resolveRuntimeToken(parseBearerToken(req));
  if (!resolved.ok) {
    const code = resolved.reason === "expired" ? "TOKEN_EXPIRED" : "UNAUTHORIZED";
    return { ok: false, response: withSdkCors(apiError({ code, status: 401 }), origin) };
  }

  const { userId, appSlug } = resolved.token;
  const fromOrigin = resolveAppFromOrigin(origin);
  if (!fromOrigin || fromOrigin.row.slug !== appSlug || !isOriginForApp(origin, fromOrigin.row)) {
    return { ok: false, response: apiError({ code: "ORIGIN_DENIED", status: 403 }) };
  }

  return { ok: true, origin, userId, appSlug };
}

/**
 * GET /api/sdk/permissions — list scopes this user granted for the calling app.
 * DELETE /api/sdk/permissions — revoke a scope (body `{ scope }`, default `ai`).
 * Bearer runtime token required.
 */
export default {
  OPTIONS(req: BunRequest) {
    return sdkCorsOptions(req);
  },

  async GET(req: BunRequest) {
    const caller = resolveSdkCaller(req);
    if (!caller.ok) return caller.response;

    const grants = dbListPermissionGrants(caller.userId, caller.appSlug).map(grantPayload);
    return withSdkCors(apiSuccess({ data: { grants } }), caller.origin);
  },

  async DELETE(req: BunRequest) {
    const caller = resolveSdkCaller(req);
    if (!caller.ok) return caller.response;

    let body: { scope?: unknown } = {};
    try {
      const text = await req.text();
      if (text.trim()) body = JSON.parse(text) as { scope?: unknown };
    } catch {
      return withSdkCors(apiError({ code: "INVALID_JSON", status: 400 }), caller.origin);
    }

    const scopeRaw = typeof body.scope === "string" ? body.scope.trim() : "ai";
    if (!ALLOWED_SCOPES.has(scopeRaw)) {
      return withSdkCors(apiError({ code: "INVALID_SCOPE", status: 400 }), caller.origin);
    }

    dbRevokePermissionGrant(caller.userId, caller.appSlug, scopeRaw);
    // AI (and future scoped APIs) check grants; drop tokens so the session is fully cut.
    dbDeleteRuntimeTokensForApp(caller.userId, caller.appSlug);

    const grants = dbListPermissionGrants(caller.userId, caller.appSlug).map(grantPayload);
    return withSdkCors(apiSuccess({ data: { grants } }), caller.origin);
  },
};
