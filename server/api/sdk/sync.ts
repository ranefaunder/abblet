import type { BunRequest } from "bun";
import { apiError, apiSuccess } from "/utils/api.server";
import { isOriginForApp } from "/utils/app-host";
import { resolveAppFromOrigin } from "/utils/app-runtime.server";
import { dbHasPermissionGrant } from "/server/database/queries/permission";
import {
  dbDeleteAppUserData,
  dbGetAppUserData,
  dbUpsertAppUserData,
  parseAppUserDataPayload,
  serializeAppUserData,
} from "/server/database/queries/app-user-data";
import { checkRateLimit } from "/utils/rate-limit.server";
import { parseBearerToken, resolveRuntimeToken } from "/utils/sdk-auth.server";
import { sdkCorsOptions, withSdkCors } from "/utils/sdk-cors.server";

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

  if (!dbHasPermissionGrant(userId, appSlug, "sync")) {
    return {
      ok: false,
      response: withSdkCors(apiError({ code: "PERMISSION_REQUIRED", status: 403 }), origin),
    };
  }

  return { ok: true, origin, userId, appSlug };
}

function rateLimitExceeded(
  userId: string,
  action: "sdk_sync_get" | "sdk_sync_put",
  maxAttempts: number,
): boolean {
  return !checkRateLimit(userId, action, maxAttempts, 10);
}

/**
 * GET /api/sdk/sync — read this user × app JSON blob.
 * PUT /api/sdk/sync — replace (`{ data }`) or clear (`{ data: null }`) the blob.
 * Bearer runtime token + `sync` grant required.
 */
export default {
  OPTIONS(req: BunRequest) {
    return sdkCorsOptions(req);
  },

  async GET(req: BunRequest) {
    const caller = resolveSdkCaller(req);
    if (!caller.ok) return caller.response;

    if (rateLimitExceeded(caller.userId, "sdk_sync_get", 120)) {
      return withSdkCors(apiError({ code: "RATE_LIMITED", status: 429 }), caller.origin);
    }

    const row = dbGetAppUserData(caller.userId, caller.appSlug);
    if (!row) {
      return withSdkCors(
        apiSuccess({ data: { data: null, updatedAt: null } }),
        caller.origin,
      );
    }

    return withSdkCors(
      apiSuccess({
        data: {
          data: parseAppUserDataPayload(row.payload),
          updatedAt: row.updated_at,
        },
      }),
      caller.origin,
    );
  },

  async PUT(req: BunRequest) {
    const caller = resolveSdkCaller(req);
    if (!caller.ok) return caller.response;

    if (rateLimitExceeded(caller.userId, "sdk_sync_put", 60)) {
      return withSdkCors(apiError({ code: "RATE_LIMITED", status: 429 }), caller.origin);
    }

    let body: { data?: unknown };
    try {
      body = (await req.json()) as { data?: unknown };
    } catch {
      return withSdkCors(apiError({ code: "INVALID_JSON", status: 400 }), caller.origin);
    }

    if (!body || !Object.prototype.hasOwnProperty.call(body, "data")) {
      return withSdkCors(apiError({ code: "MISSING_DATA", status: 400 }), caller.origin);
    }

    if (body.data === null) {
      dbDeleteAppUserData(caller.userId, caller.appSlug);
      return withSdkCors(
        apiSuccess({ data: { data: null, updatedAt: null } }),
        caller.origin,
      );
    }

    const serialized = serializeAppUserData(body.data);
    if (!serialized.ok) {
      const code = serialized.reason === "too_large" ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON";
      return withSdkCors(apiError({ code, status: 400 }), caller.origin);
    }

    const row = dbUpsertAppUserData(caller.userId, caller.appSlug, serialized.payload);
    return withSdkCors(
      apiSuccess({
        data: {
          data: parseAppUserDataPayload(row.payload),
          updatedAt: row.updated_at,
        },
      }),
      caller.origin,
    );
  },
};
